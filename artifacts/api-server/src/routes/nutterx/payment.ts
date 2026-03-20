import { Router, Request, Response } from "express";
import { authenticate, AuthRequest } from "../../middlewares/auth";
import { ServiceRequest } from "../../models/ServiceRequest";
import { Settings } from "../../models/Settings";
import { logger } from "../../lib/logger";

const router = Router();

async function getPesapalCredentials(): Promise<{
  consumerKey: string;
  consumerSecret: string;
  sandbox: boolean;
} | null> {
  const [keyDoc, secretDoc, sandboxDoc] = await Promise.all([
    Settings.findOne({ key: "pesapal_consumer_key" }),
    Settings.findOne({ key: "pesapal_consumer_secret" }),
    Settings.findOne({ key: "pesapal_sandbox" }),
  ]);
  if (!keyDoc?.value || !secretDoc?.value) return null;
  return {
    consumerKey: keyDoc.value,
    consumerSecret: secretDoc.value,
    sandbox: sandboxDoc?.value === "true",
  };
}

function pesapalBase(sandbox: boolean): string {
  return sandbox
    ? "https://cybqa.pesapal.com/pesapalv3"
    : "https://pay.pesapal.com/v3";
}

async function getPesapalToken(consumerKey: string, consumerSecret: string, sandbox: boolean): Promise<string> {
  const url = `${pesapalBase(sandbox)}/api/Auth/RequestToken`;
  logger.info({ url, sandbox }, "Requesting Pesapal token");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ consumer_key: consumerKey, consumer_secret: consumerSecret }),
  });

  const data = await res.json();
  logger.info({ status: res.status, data }, "Pesapal token response");

  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
    throw new Error(`Pesapal auth failed: ${msg}`);
  }
  if (data.error?.message) {
    throw new Error(`Pesapal auth error: ${data.error.message}`);
  }
  if (!data.token) {
    throw new Error(`Pesapal returned no token. Response: ${JSON.stringify(data)}`);
  }
  return data.token;
}

async function registerIPN(token: string, ipnUrl: string, sandbox: boolean): Promise<string> {
  const url = `${pesapalBase(sandbox)}/api/URLSetup/RegisterIPN`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ url: ipnUrl, ipn_notification_type: "GET" }),
  });
  const data = await res.json();
  logger.info({ data }, "Pesapal IPN registration");
  return data.ipn_id || "";
}

// POST /api/payment/initiate — user triggers STK push
router.post("/initiate", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { requestId, phone } = req.body;
    if (!requestId || !phone) {
      res.status(400).json({ message: "requestId and phone are required" });
      return;
    }

    const serviceReq = await ServiceRequest.findById(requestId).populate("user", "name email");
    if (!serviceReq) { res.status(404).json({ message: "Request not found" }); return; }
    const serviceUserId = (serviceReq.user as any)?._id?.toString() ?? serviceReq.user.toString();
    if (serviceUserId !== req.user?._id.toString()) {
      res.status(403).json({ message: "Not authorized" }); return;
    }
    if (!serviceReq.paymentRequired || !serviceReq.paymentAmount) {
      res.status(400).json({ message: "Payment not required for this request" }); return;
    }
    if (serviceReq.paymentStatus === "paid") {
      res.status(400).json({ message: "Already paid" }); return;
    }

    const creds = await getPesapalCredentials();
    if (!creds) {
      res.status(503).json({ message: "Payment gateway not configured. Contact admin." });
      return;
    }

    const token = await getPesapalToken(creds.consumerKey, creds.consumerSecret, creds.sandbox);

    const host = req.headers.host || "localhost";
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const ipnUrl = `${protocol}://${host}/api/payment/ipn`;

    const notificationId = await registerIPN(token, ipnUrl, creds.sandbox);

    const user = serviceReq.user as any;
    const cleanPhone = phone.replace(/\D/g, "");
    const formattedPhone = cleanPhone.startsWith("0") ? `254${cleanPhone.slice(1)}` : cleanPhone;

    const orderPayload = {
      id: `NTX-${serviceReq._id}-${Date.now()}`,
      currency: serviceReq.paymentCurrency || "KES",
      amount: serviceReq.paymentAmount,
      description: `Payment for ${serviceReq.serviceName}`,
      callback_url: `${protocol}://${host}/dashboard`,
      notification_id: notificationId,
      billing_address: {
        email_address: user.email,
        phone_number: formattedPhone,
        first_name: user.name?.split(" ")[0] || "Client",
        last_name: user.name?.split(" ").slice(1).join(" ") || "",
        country_code: "KE",
      },
    };

    logger.info({ orderPayload }, "Submitting Pesapal order");

    const orderRes = await fetch(`${pesapalBase(creds.sandbox)}/api/Transactions/SubmitOrderRequest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(orderPayload),
    });

    const orderData = await orderRes.json();
    logger.info({ status: orderRes.status, orderData }, "Pesapal order response");

    if (!orderRes.ok || orderData.error) {
      throw new Error(orderData.error?.message || orderData.message || "Failed to initiate payment");
    }

    await ServiceRequest.findByIdAndUpdate(requestId, {
      paymentStatus: "pending",
      paymentPhone: formattedPhone,
      pesapalOrderTrackingId: orderData.order_tracking_id,
    });

    res.json({
      message: "STK push sent. Enter your M-Pesa PIN on your phone.",
      orderTrackingId: orderData.order_tracking_id,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, "Payment initiation error");
    res.status(500).json({ message: err.message || "Payment initiation failed" });
  }
});

// GET /api/payment/status/:requestId — poll payment status
router.get("/status/:requestId", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const serviceReq = await ServiceRequest.findById(req.params.requestId);
    if (!serviceReq) { res.status(404).json({ message: "Not found" }); return; }

    if (serviceReq.paymentStatus === "paid") {
      res.json({ paymentStatus: "paid" });
      return;
    }

    if (!serviceReq.pesapalOrderTrackingId) {
      res.json({ paymentStatus: serviceReq.paymentStatus });
      return;
    }

    const creds = await getPesapalCredentials();
    if (!creds) { res.json({ paymentStatus: serviceReq.paymentStatus }); return; }

    const token = await getPesapalToken(creds.consumerKey, creds.consumerSecret, creds.sandbox);
    const statusRes = await fetch(
      `${pesapalBase(creds.sandbox)}/api/Transactions/GetTransactionStatus?orderTrackingId=${serviceReq.pesapalOrderTrackingId}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
    );

    const statusData = await statusRes.json();
    let paymentStatus: "unpaid" | "pending" | "paid" | "failed" = serviceReq.paymentStatus;

    if (statusData.payment_status_description === "Completed") {
      paymentStatus = "paid";
    } else if (statusData.payment_status_description === "Failed") {
      paymentStatus = "failed";
    }

    if (paymentStatus !== serviceReq.paymentStatus) {
      await ServiceRequest.findByIdAndUpdate(req.params.requestId, { paymentStatus });
    }

    res.json({ paymentStatus });
  } catch (err: any) {
    logger.error({ err: err.message }, "Payment status check error");
    res.status(500).json({ message: "Failed to check status" });
  }
});

// GET /api/payment/ipn — Pesapal IPN callback
router.get("/ipn", async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderTrackingId, orderMerchantReference } = req.query as Record<string, string>;
    if (orderTrackingId) {
      const serviceReq = await ServiceRequest.findOne({ pesapalOrderTrackingId: orderTrackingId });
      if (serviceReq && serviceReq.paymentStatus !== "paid") {
        await ServiceRequest.findByIdAndUpdate(serviceReq._id, { paymentStatus: "paid" });
      }
    }
    res.json({ orderNotificationType: "IPNCHANGE", orderTrackingId, orderMerchantReference, status: "200" });
  } catch {
    res.status(500).json({ message: "IPN error" });
  }
});

export default router;
