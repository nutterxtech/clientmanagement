import { Router, Response } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { authenticate, requireAdmin, AuthRequest } from "../../middlewares/auth";
import { getDb } from "../../lib/db";
import { deadlinePayments, serviceRequests, users } from "../../schema";

const router = Router();

function fmtExt(e: any) {
  return {
    ...e, _id: e.id,
    amount: e.amount ? Number(e.amount) : 0,
    user: e.user ? { ...e.user, _id: e.user.id } : undefined,
    serviceRequest: e.serviceRequest ? { ...e.serviceRequest, _id: e.serviceRequest.id } : undefined,
  };
}

// User creates a voluntary advance payment request (no Pesapal — manual M-Pesa)
router.post("/initiate", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const { serviceRequestId, purpose, amount } = req.body;
    if (!serviceRequestId || !purpose) { res.status(400).json({ message: "serviceRequestId and purpose are required" }); return; }
    const amt = amount ? Number(amount) : 0;
    if (isNaN(amt) || amt < 0) { res.status(400).json({ message: "Invalid amount" }); return; }

    const [svcReq] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, serviceRequestId)).limit(1);
    if (!svcReq) { res.status(404).json({ message: "Service request not found" }); return; }
    if (svcReq.userId !== req.user!.id) { res.status(403).json({ message: "Not authorized" }); return; }
    if (!["in_progress", "completed"].includes(svcReq.status)) { res.status(400).json({ message: "Only active or completed services can receive advance payments" }); return; }

    const [ext] = await db.insert(deadlinePayments).values({
      userId: req.user!.id, serviceRequestId, serviceName: svcReq.serviceName,
      purpose: purpose.trim(), amount: String(amt || 0), currency: "KES", paymentStatus: "unpaid",
    }).returning();

    res.json({ extensionId: ext.id, message: "Extension request created. Please pay via M-Pesa and submit your confirmation." });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to create extension request" });
  }
});

// Simple status check (no external call)
router.get("/status/:id", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const [ext] = await db.select().from(deadlinePayments).where(eq(deadlinePayments.id, req.params["id"]!)).limit(1);
    if (!ext) { res.status(404).json({ message: "Not found" }); return; }
    if (ext.userId !== req.user!.id) { res.status(403).json({ message: "Not authorized" }); return; }
    res.json({ paymentStatus: ext.paymentStatus, adminConfirmed: ext.adminConfirmed });
  } catch { res.status(500).json({ message: "Status check failed" }); }
});

// User submits M-Pesa confirmation message
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
      paymentStatus: "pending", mpesaMessage: mpesaMessage.trim(), updatedAt: new Date(),
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

// Admin rejects extension payment (resets to unpaid)
router.post("/reject/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const [ext] = await db.select().from(deadlinePayments).where(eq(deadlinePayments.id, req.params["id"]!)).limit(1);
    if (!ext) { res.status(404).json({ message: "Not found" }); return; }

    await db.update(deadlinePayments).set({
      paymentStatus: "unpaid", mpesaMessage: null, updatedAt: new Date(),
    }).where(eq(deadlinePayments.id, ext.id));
    res.json({ message: "Rejected" });
  } catch { res.status(500).json({ message: "Failed to reject" }); }
});

// User's own extension list
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

// Admin: list all extensions
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

// Admin: update extension (confirm deadline, add notes, or manually mark paid)
router.patch("/admin/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const { adminConfirmed, adminNotes, newDeadline, markPaid } = req.body;
    const [ext] = await db.select().from(deadlinePayments).where(eq(deadlinePayments.id, req.params["id"]!)).limit(1);
    if (!ext) { res.status(404).json({ message: "Not found" }); return; }

    const update: any = { updatedAt: new Date() };
    if (adminNotes    !== undefined) update.adminNotes    = adminNotes;
    if (adminConfirmed)              update.adminConfirmed = true;
    if (newDeadline)                 update.newDeadline    = new Date(newDeadline);
    if (markPaid)                    update.paymentStatus  = "paid";

    if (adminConfirmed && newDeadline) {
      await db.update(serviceRequests).set({ subscriptionEndsAt: new Date(newDeadline), updatedAt: new Date() }).where(eq(serviceRequests.id, ext.serviceRequestId));
    }

    const [updated] = await db.update(deadlinePayments).set(update).where(eq(deadlinePayments.id, ext.id)).returning();
    const [u]  = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, updated.userId)).limit(1);
    const [sr] = await db.select({ id: serviceRequests.id, serviceName: serviceRequests.serviceName, status: serviceRequests.status, subscriptionEndsAt: serviceRequests.subscriptionEndsAt })
      .from(serviceRequests).where(eq(serviceRequests.id, updated.serviceRequestId)).limit(1);
    res.json(fmtExt({ ...updated, user: u, serviceRequest: sr }));
  } catch (err: any) { res.status(500).json({ message: err.message || "Update failed" }); }
});

// Admin: create payment request for a user (no Pesapal — user pays manually)
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

// Admin: delete failed/pending extension
router.delete("/admin/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const [ext] = await db.select().from(deadlinePayments).where(eq(deadlinePayments.id, req.params["id"]!)).limit(1);
    if (!ext) { res.status(404).json({ message: "Not found" }); return; }
    if (!["unpaid", "pending", "failed"].includes(ext.paymentStatus)) {
      res.status(400).json({ message: "Only failed or pending transactions can be deleted" }); return;
    }
    await db.delete(deadlinePayments).where(eq(deadlinePayments.id, ext.id));
    res.json({ message: "Deleted" });
  } catch (err: any) { res.status(500).json({ message: err.message || "Delete failed" }); }
});

export default router;
