import { Router, Request, Response } from "express";
import { authenticate, AuthRequest } from "../../middlewares/auth";
import { ServiceRequest } from "../../models/ServiceRequest";
import { Settings } from "../../models/Settings";
import { logger } from "../../lib/logger";
import puppeteer from "puppeteer-core";

const router = Router();

const CHROMIUM_PATH = "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";

// ── In-memory caches ─────────────────────────────────────────
let tokenCache: { token: string; expiresAt: number; sandbox: boolean } | null = null;
let ipnCache: { id: string; sandbox: boolean } | null = null;

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
  if (tokenCache && tokenCache.sandbox === sandbox && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const url = `${pesapalBase(sandbox)}/api/Auth/RequestToken`;
  logger.info({ url, sandbox }, "Requesting Pesapal token");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ consumer_key: consumerKey, consumer_secret: consumerSecret }),
  });

  const data = await res.json();
  logger.info({ status: res.status, expiryDate: data.expiryDate }, "Pesapal token response");

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

  const expiresAt = data.expiryDate ? new Date(data.expiryDate).getTime() : Date.now() + 4 * 60_000;
  tokenCache = { token: data.token, expiresAt, sandbox };
  return data.token;
}

async function registerIPN(token: string, ipnUrl: string, sandbox: boolean): Promise<string> {
  if (ipnCache && ipnCache.sandbox === sandbox) {
    return ipnCache.id;
  }

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
  logger.info({ ipn_id: data.ipn_id }, "Pesapal IPN registration");
  const id = data.ipn_id || "";
  if (id) ipnCache = { id, sandbox };
  return id;
}

// ── Headless browser: auto-fill Pesapal page and trigger STK push ──
async function triggerSTKPushHeadless(redirectUrl: string, rawPhone: string): Promise<void> {
  // Normalise to 9 digits (strip +254 or leading 0)
  let phone = rawPhone.replace(/\D/g, "");
  if (phone.startsWith("254")) phone = phone.slice(3);
  if (phone.startsWith("0"))   phone = phone.slice(1);

  logger.info({ phone, redirectUrl }, "Launching headless browser for STK push");

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=480,700",
    ],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 480, height: 700 });
    await page.setUserAgent(
      "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36"
    );

    // Block images, fonts and media — only JS/CSS/XHR needed → loads 2-3x faster
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image", "font", "media"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Use domcontentloaded (faster than networkidle2)
    await page.goto(redirectUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await new Promise(r => setTimeout(r, 1000));

    // Ensure M-Pesa radio is selected
    await page.evaluate(() => {
      const radio = document.querySelector<HTMLInputElement>('input[value="pmpesake"]');
      if (radio && !radio.checked) radio.click();
    });
    await new Promise(r => setTimeout(r, 300));

    // Fill the phone number field
    await page.waitForSelector("#PhoneNumber1", { visible: true, timeout: 10_000 });
    await page.click("#PhoneNumber1", { clickCount: 3 });
    await page.type("#PhoneNumber1", phone, { delay: 30 });

    logger.info({ phone }, "Phone filled — clicking Proceed");

    // Click Proceed and wait for Pesapal to redirect to PaymentConfirmation
    // (that redirect IS the confirmation that the STK push was dispatched)
    await Promise.all([
      page.waitForNavigation({ timeout: 15_000, waitUntil: "domcontentloaded" }),
      page.click("#submitFormBtn"),
    ]);

    const finalUrl = page.url();
    if (finalUrl.includes("PaymentConfirmation")) {
      logger.info("STK push dispatched — PaymentConfirmation reached");
    } else {
      logger.warn({ finalUrl }, "Unexpected URL after Pesapal form submit");
    }
  } finally {
    await browser.close();
  }
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

    logger.info({ amount: orderPayload.amount }, "Submitting Pesapal order");

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
    logger.info({ status: orderRes.status, order_tracking_id: orderData.order_tracking_id }, "Pesapal order response");

    if (!orderRes.ok || orderData.error) {
      throw new Error(orderData.error?.message || orderData.message || "Failed to initiate payment");
    }

    // Save pending status immediately
    await ServiceRequest.findByIdAndUpdate(requestId, {
      paymentStatus: "pending",
      paymentPhone: formattedPhone,
      pesapalOrderTrackingId: orderData.order_tracking_id,
    });

    // Auto-fill Pesapal page and trigger STK push using headless browser
    // Runs in background — we respond quickly and let polling detect payment
    triggerSTKPushHeadless(orderData.redirect_url, phone).catch(err => {
      logger.error({ err: err.message }, "Headless STK push failed");
    });

    res.json({
      message: "Payment prompt is being sent to your phone. Please wait…",
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
