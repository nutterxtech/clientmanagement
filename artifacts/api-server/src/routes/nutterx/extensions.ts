import { Router, Response } from "express";
import { authenticate, requireAdmin, AuthRequest } from "../../middlewares/auth";
import { DeadlinePayment } from "../../models/DeadlinePayment";
import { ServiceRequest } from "../../models/ServiceRequest";
import { Settings } from "../../models/Settings";
import { logger } from "../../lib/logger";

const router = Router();

// ── Pesapal helpers (local) ───────────────────────────────────
interface PesapalTokenResponse { token?: string; expiryDate?: string; error?: { message?: string }; message?: string; [k: string]: unknown }
interface PesapalIpnResponse   { ipn_id?: string; [k: string]: unknown }
interface PesapalOrderResponse { order_tracking_id?: string; redirect_url?: string; error?: { message?: string }; message?: string; [k: string]: unknown }
interface PesapalStatusResponse { payment_status_description?: string; [k: string]: unknown }

let tokenCache: { token: string; expiresAt: number; sandbox: boolean } | null = null;
let ipnCache:   { id: string; sandbox: boolean } | null = null;

async function getCreds() {
  const [k, s, sb] = await Promise.all([
    Settings.findOne({ key: "pesapal_consumer_key" }),
    Settings.findOne({ key: "pesapal_consumer_secret" }),
    Settings.findOne({ key: "pesapal_sandbox" }),
  ]);
  if (!k?.value || !s?.value) return null;
  return { consumerKey: k.value, consumerSecret: s.value, sandbox: sb?.value === "true" };
}

function base(sandbox: boolean) {
  return sandbox ? "https://cybqa.pesapal.com/pesapalv3" : "https://pay.pesapal.com/v3";
}

async function getToken(key: string, secret: string, sandbox: boolean): Promise<string> {
  if (tokenCache && tokenCache.sandbox === sandbox && tokenCache.expiresAt > Date.now() + 60_000)
    return tokenCache.token;
  const res  = await fetch(`${base(sandbox)}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ consumer_key: key, consumer_secret: secret }),
  });
  const data = await res.json() as PesapalTokenResponse;
  if (!data.token) throw new Error(data.error?.message || data.message || "No token");
  const expiresAt = data.expiryDate ? new Date(data.expiryDate).getTime() : Date.now() + 4 * 60_000;
  tokenCache = { token: data.token, expiresAt, sandbox };
  return data.token;
}

async function getIPN(token: string, ipnUrl: string, sandbox: boolean): Promise<string> {
  if (ipnCache && ipnCache.sandbox === sandbox) return ipnCache.id;
  const res  = await fetch(`${base(sandbox)}/api/URLSetup/RegisterIPN`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url: ipnUrl, ipn_notification_type: "GET" }),
  });
  const data = await res.json() as PesapalIpnResponse;
  const id   = data.ipn_id || "";
  if (id) ipnCache = { id, sandbox };
  return id;
}

// ── POST /api/extensions/initiate  (user) ────────────────────
router.post("/initiate", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { serviceRequestId, purpose, amount } = req.body;
    if (!serviceRequestId || !purpose || !amount) {
      res.status(400).json({ message: "serviceRequestId, purpose and amount are required" }); return;
    }
    const amt = Number(amount);
    if (isNaN(amt) || amt < 1) { res.status(400).json({ message: "Invalid amount" }); return; }

    const svcReq = await ServiceRequest.findById(serviceRequestId).populate("user", "name email");
    if (!svcReq) { res.status(404).json({ message: "Service request not found" }); return; }

    const ownerId = (svcReq.user as any)?._id?.toString() ?? svcReq.user.toString();
    if (ownerId !== req.user?._id.toString()) {
      res.status(403).json({ message: "Not authorized" }); return;
    }
    if (svcReq.status !== "in_progress") {
      res.status(400).json({ message: "Only live (in-progress) services can receive advance payments" }); return;
    }

    const creds = await getCreds();
    if (!creds) { res.status(503).json({ message: "Payment gateway not configured. Contact admin." }); return; }

    const token = await getToken(creds.consumerKey, creds.consumerSecret, creds.sandbox);

    const proto  = req.headers["x-forwarded-proto"] || "https";
    const host   = req.headers.host || "localhost";
    const ipnUrl = `${proto}://${host}/api/extensions/ipn`;
    const notId  = await getIPN(token, ipnUrl, creds.sandbox);

    const user = svcReq.user as any;

    const ext = await DeadlinePayment.create({
      user:           req.user!._id,
      serviceRequest: serviceRequestId,
      serviceName:    svcReq.serviceName,
      purpose:        purpose.trim(),
      amount:         amt,
      currency:       "KES",
      paymentStatus:  "unpaid",
    });

    const orderPayload = {
      id:              `NTX-EXT-${ext._id}-${Date.now()}`,
      currency:        "KES",
      amount:          amt,
      description:     `Advance payment: ${purpose.trim().slice(0, 80)}`,
      callback_url:    `${proto}://${host}/dashboard`,
      notification_id: notId,
      billing_address: {
        email_address: user.email,
        first_name:    user.name?.split(" ")[0] || "Client",
        last_name:     user.name?.split(" ").slice(1).join(" ") || "",
        country_code:  "KE",
        phone_number:  "254000000000",
      },
    };

    const orderRes  = await fetch(`${base(creds.sandbox)}/api/Transactions/SubmitOrderRequest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(orderPayload),
    });
    const orderData = await orderRes.json() as PesapalOrderResponse;
    logger.info({ status: orderRes.status, tracking: orderData.order_tracking_id }, "Extension payment order");

    if (!orderRes.ok || orderData.error) throw new Error(orderData.error?.message || orderData.message || "Order failed");

    await DeadlinePayment.findByIdAndUpdate(ext._id, {
      paymentStatus:          "pending",
      pesapalOrderTrackingId: orderData.order_tracking_id,
    });

    res.json({ extensionId: ext._id, orderTrackingId: orderData.order_tracking_id, redirectUrl: orderData.redirect_url });
  } catch (err: any) {
    logger.error({ err: err.message }, "Extension payment initiation error");
    res.status(500).json({ message: err.message || "Payment initiation failed" });
  }
});

// ── GET /api/extensions/status/:id  (user poll) ──────────────
router.get("/status/:id", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ext = await DeadlinePayment.findById(req.params.id);
    if (!ext) { res.status(404).json({ message: "Not found" }); return; }
    if (ext.user.toString() !== req.user?._id.toString()) { res.status(403).json({ message: "Not authorized" }); return; }

    if (ext.paymentStatus === "paid") { res.json({ paymentStatus: "paid", adminConfirmed: ext.adminConfirmed }); return; }
    if (!ext.pesapalOrderTrackingId) { res.json({ paymentStatus: ext.paymentStatus, adminConfirmed: false }); return; }

    const creds = await getCreds();
    if (!creds) { res.json({ paymentStatus: ext.paymentStatus, adminConfirmed: ext.adminConfirmed }); return; }

    const token = await getToken(creds.consumerKey, creds.consumerSecret, creds.sandbox);
    const stRes = await fetch(
      `${base(creds.sandbox)}/api/Transactions/GetTransactionStatus?orderTrackingId=${ext.pesapalOrderTrackingId}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
    );
    const stData = await stRes.json() as PesapalStatusResponse;

    let status: "unpaid"|"pending"|"paid"|"failed" = ext.paymentStatus;
    if (stData.payment_status_description === "Completed") status = "paid";
    else if (stData.payment_status_description === "Failed") status = "failed";

    if (status !== ext.paymentStatus) await DeadlinePayment.findByIdAndUpdate(ext._id, { paymentStatus: status });
    res.json({ paymentStatus: status, adminConfirmed: ext.adminConfirmed });
  } catch (err: any) {
    res.status(500).json({ message: "Status check failed" });
  }
});

// ── GET /api/extensions/my  (user: their own) ────────────────
router.get("/my", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const exts = await DeadlinePayment.find({ user: req.user!._id })
      .sort({ createdAt: -1 }).lean();
    res.json(exts);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load" });
  }
});

// ── GET /api/extensions/ipn  (Pesapal IPN callback) ──────────
router.get("/ipn", async (req, res): Promise<void> => {
  try {
    const { orderTrackingId, orderMerchantReference } = req.query as Record<string, string>;
    if (orderTrackingId) {
      const ext = await DeadlinePayment.findOne({ pesapalOrderTrackingId: orderTrackingId });
      if (ext && ext.paymentStatus !== "paid") {
        await DeadlinePayment.findByIdAndUpdate(ext._id, { paymentStatus: "paid" });
      }
    }
    res.json({ orderNotificationType: "IPNCHANGE", orderTrackingId, orderMerchantReference, status: "200" });
  } catch { res.status(500).json({ message: "IPN error" }); }
});

// ── GET /api/extensions/admin  (admin: all) ──────────────────
router.get("/admin", authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const exts = await DeadlinePayment.find()
      .populate("user", "name email")
      .populate("serviceRequest", "serviceName status subscriptionEndsAt")
      .sort({ createdAt: -1 })
      .lean();
    res.json(exts);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load" });
  }
});

// ── PATCH /api/extensions/admin/:id  (admin: confirm + set deadline) ──
router.patch("/admin/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { adminConfirmed, adminNotes, newDeadline } = req.body;
    const ext = await DeadlinePayment.findById(req.params.id);
    if (!ext) { res.status(404).json({ message: "Not found" }); return; }

    const update: any = {};
    if (adminNotes    !== undefined) update.adminNotes    = adminNotes;
    if (adminConfirmed)              update.adminConfirmed = true;
    if (newDeadline)                 update.newDeadline    = new Date(newDeadline);

    // If admin confirms and sets a new deadline, update the service request deadline too
    if (adminConfirmed && newDeadline) {
      await ServiceRequest.findByIdAndUpdate(ext.serviceRequest, {
        subscriptionEndsAt: new Date(newDeadline),
      });
    }

    const updated = await DeadlinePayment.findByIdAndUpdate(ext._id, update, { new: true })
      .populate("user", "name email")
      .populate("serviceRequest", "serviceName status subscriptionEndsAt");
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Update failed" });
  }
});

export default router;
