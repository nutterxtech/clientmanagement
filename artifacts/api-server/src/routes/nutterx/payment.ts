import { Router, Response } from "express";
import { eq } from "drizzle-orm";
import { authenticate, requireAdmin, AuthRequest } from "../../middlewares/auth";
import { getDb } from "../../lib/db";
import { serviceRequests, users } from "../../schema";

/** Parse the sent amount from a standard M-Pesa confirmation SMS.
 *  Handles patterns like: "KES1,500.00", "KES 2000", "Ksh 500.00" etc.
 *  Returns the FIRST match — which in a "sent" SMS is the amount sent.
 */
function parseMpesaAmount(msg: string): number | null {
  const m = msg.match(/(?:KES|Ksh)\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!m) return null;
  const val = parseFloat(m[1].replace(/,/g, ""));
  return isNaN(val) ? null : val;
}

const router = Router();

// User submits their M-Pesa confirmation message after paying manually
router.post("/submit-mpesa/:requestId", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const { requestId } = req.params;
    const { mpesaMessage } = req.body;

    if (!mpesaMessage?.trim()) { res.status(400).json({ message: "M-Pesa message is required" }); return; }

    const [serviceReq] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, requestId!)).limit(1);
    if (!serviceReq) { res.status(404).json({ message: "Request not found" }); return; }
    if (serviceReq.userId !== req.user!.id) { res.status(403).json({ message: "Not authorized" }); return; }
    if (!serviceReq.paymentRequired) { res.status(400).json({ message: "Payment not required" }); return; }
    if (serviceReq.paymentStatus === "paid") { res.status(400).json({ message: "Already paid" }); return; }

    const parsed = parseMpesaAmount(mpesaMessage.trim());
    await db.update(serviceRequests).set({
      paymentStatus: "pending",
      mpesaMessage: mpesaMessage.trim(),
      ...(parsed !== null ? { mpesaAmount: String(parsed) } : {}),
      updatedAt: new Date(),
    }).where(eq(serviceRequests.id, requestId!));

    res.json({
      message: "M-Pesa confirmation submitted. Awaiting admin review.",
      parsedAmount: parsed,
    });
  } catch {
    res.status(500).json({ message: "Failed to submit" });
  }
});

// Simple status check (no Pesapal)
router.get("/status/:requestId", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const [serviceReq] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, req.params["requestId"]!)).limit(1);
    if (!serviceReq) { res.status(404).json({ message: "Not found" }); return; }
    res.json({ paymentStatus: serviceReq.paymentStatus });
  } catch {
    res.status(500).json({ message: "Failed to check status" });
  }
});

// Admin approves payment (+ optional deadline update)
router.post("/approve/:requestId", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const { requestId } = req.params;
    const { newDeadline } = req.body;

    const [serviceReq] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, requestId!)).limit(1);
    if (!serviceReq) { res.status(404).json({ message: "Request not found" }); return; }

    await db.update(serviceRequests).set({
      paymentStatus: "paid",
      updatedAt: new Date(),
      ...(newDeadline ? { subscriptionEndsAt: new Date(newDeadline) } : {}),
    }).where(eq(serviceRequests.id, requestId!));

    res.json({ message: "Payment approved" });
  } catch {
    res.status(500).json({ message: "Failed to approve" });
  }
});

// Admin rejects payment (resets to unpaid, clears message)
router.post("/reject/:requestId", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const { requestId } = req.params;

    const [serviceReq] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, requestId!)).limit(1);
    if (!serviceReq) { res.status(404).json({ message: "Request not found" }); return; }

    await db.update(serviceRequests).set({
      paymentStatus: "unpaid",
      mpesaMessage: null,
      updatedAt: new Date(),
    }).where(eq(serviceRequests.id, requestId!));

    res.json({ message: "Payment rejected" });
  } catch {
    res.status(500).json({ message: "Failed to reject" });
  }
});

export default router;
