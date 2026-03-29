import { Router, Response } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { authenticate, requireAdmin, AuthRequest } from "../../middlewares/auth";
import { getDb } from "../../lib/db";
import { deadlinePayments, serviceRequests, settings, users } from "../../schema";
import { logger } from "../../lib/logger";

const router = Router();

interface PesapalTokenResponse { token?: string; expiryDate?: string; error?: { message?: string }; message?: string; [k: string]: unknown }
interface PesapalIpnResponse   { ipn_id?: string; [k: string]: unknown }
interface PesapalOrderResponse { order_tracking_id?: string; redirect_url?: string; error?: { message?: string }; message?: string; [k: string]: unknown }
interface PesapalStatusResponse { payment_status_description?: string; [k: string]: unknown }

let tokenCache: { token: string; expiresAt: number; sandbox: boolean } | null = null;
let ipnCache:   { id: string; sandbox: boolean } | null = null;

async function getCreds() {
  const db = getDb();
  const rows = await db.select().from(settings).where(inArray(settings.key, ["pesapal_consumer_key", "pesapal_consumer_secret", "pesapal_sandbox"]));
  const m: Record<string, string> = {};
  for (const r of rows) m[r.key] = r.value;
  if (!m["pesapal_consumer_key"] || !m["pesapal_consumer_secret"]) return null;
  return { consumerKey: m["pesapal_consumer_key"], consumerSecret: m["pesapal_consumer_secret"], sandbox: m["pesapal_sandbox"] === "true" };
}

function base(sandbox: boolean) {
  return sandbox ? "https://cybqa.pesapal.com/pesapalv3" : "https://pay.pesapal.com/v3";
}

async function getToken(key: string, secret: string, sandbox: boolean): Promise<string> {
  if (tokenCache && tokenCache.sandbox === sandbox && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const res  = await fetch(`${base(sandbox)}/api/Auth/RequestToken`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
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
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url: ipnUrl, ipn_notification_type: "GET" }),
  });
  const data = await res.json() as PesapalIpnResponse;
  const id   = data.ipn_id || "";
  if (id) ipnCache = { id, sandbox };
  return id;
}

function fmtExt(e: any) {
  return {
    ...e, _id: e.id,
    amount: e.amount ? Number(e.amount) : 0,
    user: e.user ? { ...e.user, _id: e.user.id } : undefined,
    serviceRequest: e.serviceRequest ? { ...e.serviceRequest, _id: e.serviceRequest.id } : undefined,
  };
}

router.post("/initiate", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const { serviceRequestId, purpose, amount } = req.body;
    if (!serviceRequestId || !purpose || !amount) { res.status(400).json({ message: "serviceRequestId, purpose and amount are required" }); return; }
    const amt = Number(amount);
    if (isNaN(amt) || amt < 1) { res.status(400).json({ message: "Invalid amount" }); return; }

    const [svcReq] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, serviceRequestId)).limit(1);
    if (!svcReq) { res.status(404).json({ message: "Service request not found" }); return; }
    if (svcReq.userId !== req.user!.id) { res.status(403).json({ message: "Not authorized" }); return; }
    if (!["in_progress", "completed"].includes(svcReq.status)) { res.status(400).json({ message: "Only active or completed services can receive advance payments" }); return; }

    const [owner] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, svcReq.userId)).limit(1);

    const creds = await getCreds();
    if (!creds) { res.status(503).json({ message: "Payment gateway not configured. Contact admin." }); return; }

    const token  = await getToken(creds.consumerKey, creds.consumerSecret, creds.sandbox);
    const proto  = req.headers["x-forwarded-proto"] || "https";
    const host   = req.headers.host || "localhost";
    const ipnUrl = `${proto}://${host}/api/extensions/ipn`;
    const notId  = await getIPN(token, ipnUrl, creds.sandbox);

    const [ext] = await db.insert(deadlinePayments).values({
      userId: req.user!.id, serviceRequestId, serviceName: svcReq.serviceName,
      purpose: purpose.trim(), amount: String(amt), currency: "KES", paymentStatus: "unpaid",
    }).returning();

    const orderPayload = {
      id: `NTX-EXT-${ext.id}-${Date.now()}`, currency: "KES", amount: amt,
      description: `Advance payment: ${purpose.trim().slice(0, 80)}`,
      callback_url: `${proto}://${host}/dashboard`, notification_id: notId,
      billing_address: { email_address: owner.email, first_name: owner.name?.split(" ")[0] || "Client", last_name: owner.name?.split(" ").slice(1).join(" ") || "", country_code: "KE", phone_number: "254000000000" },
    };

    const orderRes  = await fetch(`${base(creds.sandbox)}/api/Transactions/SubmitOrderRequest`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(orderPayload),
    });
    const orderData = await orderRes.json() as PesapalOrderResponse;
    if (!orderRes.ok || orderData.error) throw new Error(orderData.error?.message || orderData.message || "Order failed");

    await db.update(deadlinePayments).set({ paymentStatus: "pending", pesapalOrderTrackingId: orderData.order_tracking_id, updatedAt: new Date() }).where(eq(deadlinePayments.id, ext.id));
    res.json({ extensionId: ext.id, orderTrackingId: orderData.order_tracking_id, redirectUrl: orderData.redirect_url });
  } catch (err: any) {
    logger.error({ err: err.message }, "Extension payment initiation error");
    res.status(500).json({ message: err.message || "Payment initiation failed" });
  }
});

router.get("/status/:id", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const [ext] = await db.select().from(deadlinePayments).where(eq(deadlinePayments.id, req.params.id)).limit(1);
    if (!ext) { res.status(404).json({ message: "Not found" }); return; }
    if (ext.userId !== req.user!.id) { res.status(403).json({ message: "Not authorized" }); return; }
    if (ext.paymentStatus === "paid") { res.json({ paymentStatus: "paid", adminConfirmed: ext.adminConfirmed }); return; }
    if (!ext.pesapalOrderTrackingId) { res.json({ paymentStatus: ext.paymentStatus, adminConfirmed: false }); return; }

    const creds = await getCreds();
    if (!creds) { res.json({ paymentStatus: ext.paymentStatus, adminConfirmed: ext.adminConfirmed }); return; }
    const token = await getToken(creds.consumerKey, creds.consumerSecret, creds.sandbox);
    const stRes = await fetch(`${base(creds.sandbox)}/api/Transactions/GetTransactionStatus?orderTrackingId=${ext.pesapalOrderTrackingId}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    const stData = await stRes.json() as PesapalStatusResponse;

    let status: "unpaid"|"pending"|"paid"|"failed" = ext.paymentStatus;
    if (stData.payment_status_description === "Completed") status = "paid";
    else if (stData.payment_status_description === "Failed") status = "failed";

    if (status !== ext.paymentStatus) await db.update(deadlinePayments).set({ paymentStatus: status, updatedAt: new Date() }).where(eq(deadlinePayments.id, ext.id));
    res.json({ paymentStatus: status, adminConfirmed: ext.adminConfirmed });
  } catch { res.status(500).json({ message: "Status check failed" }); }
});

router.get("/my", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const rows = await db.select().from(deadlinePayments).where(eq(deadlinePayments.userId, req.user!.id));
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const withSvcReq = await Promise.all(rows.map(async e => {
      const [sr] = await db.select({ id: serviceRequests.id, serviceName: serviceRequests.serviceName, status: serviceRequests.status, subscriptionEndsAt: serviceRequests.subscriptionEndsAt })
        .from(serviceRequests).where(eq(serviceRequests.id, e.serviceRequestId)).limit(1);
      return fmtExt({ ...e, serviceRequest: sr });
    }));
    res.json(withSvcReq);
  } catch { res.status(500).json({ message: "Failed to load" }); }
});

router.get("/ipn", async (req, res): Promise<void> => {
  try {
    const { orderTrackingId, orderMerchantReference } = req.query as Record<string, string>;
    if (orderTrackingId) {
      const db = getDb();
      const [ext] = await db.select().from(deadlinePayments).where(eq(deadlinePayments.pesapalOrderTrackingId, orderTrackingId)).limit(1);
      if (ext && ext.paymentStatus !== "paid") {
        const update: any = { paymentStatus: "paid", updatedAt: new Date() };
        if (ext.initiatedBy === "admin" && ext.adminRequestedDays) {
          const deadline = new Date();
          deadline.setDate(deadline.getDate() + ext.adminRequestedDays);
          update.adminConfirmed = true;
          update.newDeadline    = deadline;
          await db.update(serviceRequests).set({ subscriptionEndsAt: deadline, status: "completed", updatedAt: new Date() }).where(eq(serviceRequests.id, ext.serviceRequestId));
        }
        await db.update(deadlinePayments).set(update).where(eq(deadlinePayments.id, ext.id));
      }
    }
    res.json({ orderNotificationType: "IPNCHANGE", orderTrackingId, orderMerchantReference, status: "200" });
  } catch { res.status(500).json({ message: "IPN error" }); }
});

// User submits M-Pesa message after paying manually
router.post("/submit-mpesa/:id", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const [ext] = await db.select().from(deadlinePayments).where(eq(deadlinePayments.id, req.params["id"]!)).limit(1);
    if (!ext) { res.status(404).json({ message: "Not found" }); return; }
    if (ext.userId !== req.user!.id) { res.status(403).json({ message: "Not authorized" }); return; }
    if (ext.paymentStatus === "paid") { res.status(400).json({ message: "Already paid" }); return; }

    const { mpesaMessage } = req.body;
    if (!mpesaMessage?.trim()) { res.status(400).json({ message: "M-Pesa message is required" }); return; }

    await db.update(deadlinePayments).set({
      paymentStatus: "pending",
      mpesaMessage: mpesaMessage.trim(),
      updatedAt: new Date(),
    }).where(eq(deadlinePayments.id, ext.id));

    res.json({ message: "Submitted for review" });
  } catch { res.status(500).json({ message: "Failed to submit" }); }
});

// Admin approves extension payment (marks paid + updates deadline)
router.post("/approve/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const [ext] = await db.select().from(deadlinePayments).where(eq(deadlinePayments.id, req.params["id"]!)).limit(1);
    if (!ext) { res.status(404).json({ message: "Not found" }); return; }

    const { adminNotes, newDeadline } = req.body;
    const update: any = { paymentStatus: "paid", adminConfirmed: true, updatedAt: new Date() };
    if (adminNotes) update.adminNotes = adminNotes;
    if (newDeadline) {
      update.newDeadline = new Date(newDeadline);
      await db.update(serviceRequests).set({ subscriptionEndsAt: new Date(newDeadline), updatedAt: new Date() }).where(eq(serviceRequests.id, ext.serviceRequestId));
    }
    await db.update(deadlinePayments).set(update).where(eq(deadlinePayments.id, ext.id));
    res.json({ message: "Approved" });
  } catch { res.status(500).json({ message: "Failed to approve" }); }
});

// Admin rejects extension payment
router.post("/reject/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const [ext] = await db.select().from(deadlinePayments).where(eq(deadlinePayments.id, req.params["id"]!)).limit(1);
    if (!ext) { res.status(404).json({ message: "Not found" }); return; }

    await db.update(deadlinePayments).set({
      paymentStatus: "unpaid",
      mpesaMessage: null,
      updatedAt: new Date(),
    }).where(eq(deadlinePayments.id, ext.id));
    res.json({ message: "Rejected" });
  } catch { res.status(500).json({ message: "Failed to reject" }); }
});

router.get("/admin", authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const rows = await db.select().from(deadlinePayments);
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const result = await Promise.all(rows.map(async e => {
      const [u]  = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, e.userId)).limit(1);
      const [sr] = await db.select({ id: serviceRequests.id, serviceName: serviceRequests.serviceName, status: serviceRequests.status, subscriptionEndsAt: serviceRequests.subscriptionEndsAt })
        .from(serviceRequests).where(eq(serviceRequests.id, e.serviceRequestId)).limit(1);
      return fmtExt({ ...e, user: u, serviceRequest: sr });
    }));
    res.json(result);
  } catch { res.status(500).json({ message: "Failed to load" }); }
});

router.patch("/admin/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const { adminConfirmed, adminNotes, newDeadline, markPaid } = req.body;
    const [ext] = await db.select().from(deadlinePayments).where(eq(deadlinePayments.id, req.params.id)).limit(1);
    if (!ext) { res.status(404).json({ message: "Not found" }); return; }

    const update: any = { updatedAt: new Date() };
    if (adminNotes    !== undefined) update.adminNotes    = adminNotes;
    if (adminConfirmed)              update.adminConfirmed = true;
    if (newDeadline)                 update.newDeadline    = new Date(newDeadline);
    if (markPaid)                    update.paymentStatus  = "paid";

    if (adminConfirmed && newDeadline) {
      await db.update(serviceRequests).set({ subscriptionEndsAt: new Date(newDeadline), status: "completed", updatedAt: new Date() }).where(eq(serviceRequests.id, ext.serviceRequestId));
    }

    const [updated] = await db.update(deadlinePayments).set(update).where(eq(deadlinePayments.id, ext.id)).returning();
    const [u]  = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, updated.userId)).limit(1);
    const [sr] = await db.select({ id: serviceRequests.id, serviceName: serviceRequests.serviceName, status: serviceRequests.status, subscriptionEndsAt: serviceRequests.subscriptionEndsAt })
      .from(serviceRequests).where(eq(serviceRequests.id, updated.serviceRequestId)).limit(1);
    res.json(fmtExt({ ...updated, user: u, serviceRequest: sr }));
  } catch (err: any) { res.status(500).json({ message: err.message || "Update failed" }); }
});

router.post("/admin/request", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const { serviceRequestId, amount, adminMessage, adminRequestedDays, purpose } = req.body;
    if (!serviceRequestId || !amount || !adminRequestedDays) { res.status(400).json({ message: "serviceRequestId, amount, and adminRequestedDays are required" }); return; }
    const amt  = Number(amount);
    const days = Number(adminRequestedDays);
    if (isNaN(amt) || amt < 1) { res.status(400).json({ message: "Invalid amount" }); return; }
    if (isNaN(days) || days < 1) { res.status(400).json({ message: "Invalid days" }); return; }

    const [svcReq] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, serviceRequestId)).limit(1);
    if (!svcReq) { res.status(404).json({ message: "Service request not found" }); return; }

    const existing = await db.select().from(deadlinePayments)
      .where(and(eq(deadlinePayments.serviceRequestId, serviceRequestId), eq(deadlinePayments.initiatedBy, "admin"), inArray(deadlinePayments.paymentStatus, ["unpaid", "pending"])));
    if (existing.length) { res.status(409).json({ message: "A pending payment request already exists for this service." }); return; }

    const [ext] = await db.insert(deadlinePayments).values({
      userId: svcReq.userId, serviceRequestId, serviceName: svcReq.serviceName,
      purpose: purpose?.trim() || `Service renewal for ${svcReq.serviceName}`,
      amount: String(amt), currency: "KES", paymentStatus: "unpaid",
      initiatedBy: "admin", adminMessage: adminMessage?.trim() || "", adminRequestedDays: days,
    }).returning();
    res.status(201).json(fmtExt(ext));
  } catch (err: any) { res.status(500).json({ message: err.message || "Failed to create payment request" }); }
});

router.post("/pay/:id", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const [ext] = await db.select().from(deadlinePayments).where(eq(deadlinePayments.id, req.params.id)).limit(1);
    if (!ext) { res.status(404).json({ message: "Not found" }); return; }
    if (ext.userId !== req.user!.id) { res.status(403).json({ message: "Not authorized" }); return; }
    if (ext.paymentStatus === "paid") { res.status(400).json({ message: "Already paid" }); return; }
    if (ext.paymentStatus === "pending" && ext.pesapalOrderTrackingId) {
      res.json({ extensionId: ext.id, orderTrackingId: ext.pesapalOrderTrackingId, redirectUrl: null }); return;
    }

    const creds = await getCreds();
    if (!creds) { res.status(503).json({ message: "Payment gateway not configured. Contact admin." }); return; }

    const token  = await getToken(creds.consumerKey, creds.consumerSecret, creds.sandbox);
    const proto  = req.headers["x-forwarded-proto"] || "https";
    const host   = req.headers.host || "localhost";
    const ipnUrl = `${proto}://${host}/api/extensions/ipn`;
    const notId  = await getIPN(token, ipnUrl, creds.sandbox);

    const user = req.user!;
    const orderPayload = {
      id: `NTX-REQ-${ext.id}-${Date.now()}`, currency: "KES", amount: Number(ext.amount),
      description: ext.purpose.slice(0, 100), callback_url: `${proto}://${host}/dashboard`, notification_id: notId,
      billing_address: {
        email_address: (user as any).email || "client@nutterx.com",
        first_name: (user as any).name?.split(" ")[0] || "Client",
        last_name: (user as any).name?.split(" ").slice(1).join(" ") || "",
        country_code: "KE", phone_number: "254000000000",
      },
    };

    const orderRes  = await fetch(`${base(creds.sandbox)}/api/Transactions/SubmitOrderRequest`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(orderPayload),
    });
    const orderData = await orderRes.json() as PesapalOrderResponse;
    if (!orderRes.ok || orderData.error) throw new Error(orderData.error?.message || orderData.message || "Order failed");

    await db.update(deadlinePayments).set({ paymentStatus: "pending", pesapalOrderTrackingId: orderData.order_tracking_id, updatedAt: new Date() }).where(eq(deadlinePayments.id, ext.id));
    res.json({ extensionId: ext.id, orderTrackingId: orderData.order_tracking_id, redirectUrl: orderData.redirect_url });
  } catch (err: any) {
    logger.error({ err: err.message }, "Pay admin request error");
    res.status(500).json({ message: err.message || "Payment initiation failed" });
  }
});

router.delete("/admin/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const [ext] = await db.select().from(deadlinePayments).where(eq(deadlinePayments.id, req.params.id)).limit(1);
    if (!ext) { res.status(404).json({ message: "Not found" }); return; }
    if (!["unpaid", "pending", "failed"].includes(ext.paymentStatus)) {
      res.status(400).json({ message: "Only failed or pending transactions can be deleted" }); return;
    }
    await db.delete(deadlinePayments).where(eq(deadlinePayments.id, ext.id));
    res.json({ message: "Deleted" });
  } catch (err: any) { res.status(500).json({ message: err.message || "Delete failed" }); }
});

export default router;
