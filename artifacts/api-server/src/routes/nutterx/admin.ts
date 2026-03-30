import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { eq, ne, and, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "../../lib/db";
import { users, serviceRequests, deadlinePayments, chats, chatParticipants, settings } from "../../schema";
import { authenticate, requireAdmin, generateToken, AuthRequest } from "../../middlewares/auth";
import { formatRequest } from "./requests";

const ADMIN_USERNAME = "Nutterx@42819408";
const ADMIN_PASSWORD = "BILLnutter001002";

const router = Router();

router.post("/verify", async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    res.status(401).json({ message: "Invalid admin credentials" }); return;
  }
  const db = getDb();
  const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  if (!admin) { res.status(404).json({ message: "Admin account not found" }); return; }
  const token = generateToken(admin.id);
  res.json({ token, user: { _id: admin.id, name: admin.name, email: admin.email, role: admin.role, createdAt: admin.createdAt } });
});

router.get("/users", authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const rows = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, avatar: users.avatar, createdAt: users.createdAt })
      .from(users).where(ne(users.role, "admin"));
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(rows.map(r => ({ ...r, _id: r.id })));
  } catch { res.status(500).json({ message: "Failed to fetch users" }); }
});

router.post("/users", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) { res.status(400).json({ message: "Name, email, and password are required" }); return; }
    const db = getDb();
    const [existing] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (existing) { res.status(400).json({ message: "Email already in use" }); return; }
    const hashed = await bcrypt.hash(password, 12);
    const [row] = await db.insert(users).values({ name, email: email.toLowerCase(), password: hashed, role: "user" }).returning();
    res.status(201).json({ _id: row.id, name: row.name, email: row.email, role: row.role, createdAt: row.createdAt });
  } catch { res.status(500).json({ message: "Failed to create user" }); }
});

router.get("/requests", authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    function rawRows(r: any): any[] { return Array.isArray(r) ? r : (r?.rows ?? []); }

    // DISTINCT ON (user_id, service_name) keeps the newest row per user+service,
    // so re-requests after expiry don't create duplicate admin entries.
    const rows = rawRows(await db.execute(sql`
      SELECT DISTINCT ON (user_id, service_name)
        sr.id, sr.user_id AS "userId", sr.service_id AS "serviceId",
        sr.service_name AS "serviceName", sr.description, sr.requirements,
        sr.status, sr.admin_notes AS "adminNotes",
        sr.payment_required AS "paymentRequired",
        sr.payment_status AS "paymentStatus", sr.payment_amount AS "paymentAmount",
        sr.mpesa_message AS "mpesaMessage",
        sr.subscription_ends_at AS "subscriptionEndsAt",
        sr.created_at AS "createdAt", sr.updated_at AS "updatedAt",
        u.id AS "uId", u.name AS "uName", u.email AS "uEmail"
      FROM service_requests sr
      LEFT JOIN users u ON sr.user_id = u.id
      ORDER BY user_id, service_name, sr.created_at DESC
    `));

    rows.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(rows.map((r: any) => formatRequest({
      ...r,
      user: r.uId ? { id: r.uId, name: r.uName, email: r.uEmail } : null,
    })));
  } catch { res.status(500).json({ message: "Failed to fetch requests" }); }
});

router.put("/requests/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const { status, adminNotes, subscriptionEndsAt, paymentRequired, paymentAmount } = req.body;
    const update: any = { updatedAt: new Date() };
    if (status        !== undefined) update.status        = status;
    if (adminNotes    !== undefined) update.adminNotes    = adminNotes;
    if (paymentRequired !== undefined) update.paymentRequired = paymentRequired;
    if (paymentAmount !== undefined) update.paymentAmount  = String(Number(paymentAmount));
    if (subscriptionEndsAt) update.subscriptionEndsAt = new Date(subscriptionEndsAt);
    if (status === "completed" && !subscriptionEndsAt) {
      update.completedAt = new Date();
      update.subscriptionEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    const [row] = await db.update(serviceRequests).set(update).where(eq(serviceRequests.id, req.params["id"]!)).returning();
    if (!row) { res.status(404).json({ message: "Request not found" }); return; }
    const [u] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, row.userId)).limit(1);
    res.json(formatRequest({ ...row, user: u }));
  } catch { res.status(500).json({ message: "Failed to update request" }); }
});

router.delete("/requests/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const [row] = await db.select({ id: serviceRequests.id, status: serviceRequests.status })
      .from(serviceRequests).where(eq(serviceRequests.id, req.params["id"]!)).limit(1);
    if (!row) { res.status(404).json({ message: "Request not found" }); return; }
    if (row.status !== "cancelled") { res.status(400).json({ message: "Only cancelled requests can be deleted" }); return; }
    await db.delete(serviceRequests).where(eq(serviceRequests.id, row.id));
    res.json({ ok: true });
  } catch { res.status(500).json({ message: "Failed to delete request" }); }
});

router.get("/subscriptions", authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const now = new Date();
    const rows = await db.select().from(serviceRequests).where(gt(serviceRequests.subscriptionEndsAt, now));
    rows.sort((a, b) => new Date(a.subscriptionEndsAt!).getTime() - new Date(b.subscriptionEndsAt!).getTime());

    const withUsers = await Promise.all(rows.map(async r => {
      const [u] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, r.userId)).limit(1);
      const msLeft = r.subscriptionEndsAt!.getTime() - now.getTime();
      return {
        _id: r.id, user: u ? { ...u, _id: u.id } : null,
        serviceName: r.serviceName, status: r.status,
        completedAt: r.completedAt, subscriptionEndsAt: r.subscriptionEndsAt,
        daysRemaining: Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24))),
      };
    }));
    res.json(withUsers);
  } catch { res.status(500).json({ message: "Failed to fetch subscriptions" }); }
});

router.get("/chats", authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const chatRows = await db.select().from(chats);
    chatRows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const result = await Promise.all(chatRows.map(async chat => {
      const parts = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, avatar: users.avatar })
        .from(chatParticipants).innerJoin(users, eq(chatParticipants.userId, users.id))
        .where(eq(chatParticipants.chatId, chat.id));
      return { ...chat, _id: chat.id, participants: parts.map(p => ({ ...p, _id: p.id })) };
    }));
    res.json(result);
  } catch { res.status(500).json({ message: "Failed to fetch chats" }); }
});

router.get("/clients", authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    function rawRows(r: any): any[] { return Array.isArray(r) ? r : (r?.rows ?? []); }

    // For each user+service keep only the most recent in_progress/completed row.
    // This prevents a person who re-requested after expiry from appearing twice.
    const rows = rawRows(await db.execute(sql`
      SELECT DISTINCT ON (sr.user_id, sr.service_name)
        sr.id, sr.user_id AS "userId", sr.service_name AS "serviceName",
        sr.status, sr.subscription_ends_at AS "subscriptionEndsAt",
        sr.completed_at AS "completedAt", sr.created_at AS "createdAt",
        u.id AS "uId", u.name AS "uName", u.email AS "uEmail"
      FROM service_requests sr
      LEFT JOIN users u ON sr.user_id = u.id
      WHERE sr.status IN ('in_progress', 'completed')
      ORDER BY sr.user_id, sr.service_name, sr.created_at DESC
    `));

    rows.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(rows.map((r: any) => ({
      _id: r.id,
      user: r.uId ? { id: r.uId, _id: r.uId, name: r.uName, email: r.uEmail } : null,
      serviceName: r.serviceName,
      status: r.status,
      subscriptionEndsAt: r.subscriptionEndsAt,
      completedAt: r.completedAt,
      createdAt: r.createdAt,
    })));
  } catch { res.status(500).json({ message: "Failed to fetch clients" }); }
});

router.get("/export", authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const allUsers = await db.select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt }).from(users).where(ne(users.role, "admin"));
    const allRequests = await db.select().from(serviceRequests);

    const lines = ["Name,Email,Service,Status,Deadline,Days Remaining,Joined"];
    for (const u of allUsers) {
      const userReqs = allRequests.filter(r => r.userId === u.id);
      if (!userReqs.length) {
        lines.push(`"${u.name}","${u.email}","—","—","—","—","${u.createdAt.toISOString().split("T")[0]}"`);
      } else {
        for (const r of userReqs) {
          const now = new Date();
          const daysLeft = r.subscriptionEndsAt ? Math.max(0, Math.ceil((new Date(r.subscriptionEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : "—";
          const deadline = r.subscriptionEndsAt ? new Date(r.subscriptionEndsAt).toISOString().split("T")[0] : "—";
          lines.push(`"${u.name}","${u.email}","${r.serviceName}","${r.status}","${deadline}","${daysLeft}","${u.createdAt.toISOString().split("T")[0]}"`);
        }
      }
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=nutterx-clients.csv");
    res.send(lines.join("\n"));
  } catch { res.status(500).json({ message: "Export failed" }); }
});

router.delete("/users/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, req.params["id"]!)).limit(1);
    if (!user) { res.status(404).json({ message: "User not found" }); return; }
    if (user.role === "admin") { res.status(403).json({ message: "Cannot delete admin account" }); return; }
    await db.delete(serviceRequests).where(eq(serviceRequests.userId, req.params["id"]!));
    await db.delete(users).where(eq(users.id, req.params["id"]!));
    res.json({ message: "User deleted" });
  } catch { res.status(500).json({ message: "Failed to delete user" }); }
});

router.get("/payments", authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const [reqRows, extRows] = await Promise.all([
      db.select().from(serviceRequests).where(eq(serviceRequests.paymentRequired, true)),
      db.select().from(deadlinePayments).where(eq(deadlinePayments.paymentStatus, "paid")),
    ]);

    const reqsWithUsers = await Promise.all(reqRows.map(async r => {
      const [u] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, r.userId)).limit(1);
      return { ...r, user: u ? { ...u, _id: u.id } : null };
    }));
    const extsWithUsers = await Promise.all(extRows.map(async e => {
      const [u] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, e.userId)).limit(1);
      return { ...e, user: u ? { ...u, _id: u.id } : null };
    }));

    const serviceStatements = reqsWithUsers.map(r => ({
      _id: r.id, user: r.user, serviceName: r.serviceName,
      paymentAmount: r.paymentAmount ? Number(r.paymentAmount) : null,
      mpesaAmount: r.mpesaAmount ? Number(r.mpesaAmount) : null,
      paymentCurrency: r.paymentCurrency || "KES",
      paymentStatus: r.paymentStatus, paymentRequired: r.paymentRequired,
      mpesaMessage: r.mpesaMessage ?? null, createdAt: r.createdAt,
      type: "service", purpose: null,
    }));
    const extStatements = extsWithUsers.map(e => ({
      _id: e.id, user: e.user, serviceName: e.serviceName,
      paymentAmount: e.amount ? Number(e.amount) : null,
      mpesaAmount: e.mpesaAmount ? Number(e.mpesaAmount) : null,
      paymentCurrency: e.currency || "KES",
      paymentStatus: e.paymentStatus, paymentRequired: true,
      mpesaMessage: e.mpesaMessage ?? null, createdAt: e.createdAt,
      type: "extension", purpose: e.purpose,
    }));

    const statements = [...serviceStatements, ...extStatements].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    // Revenue uses actual M-Pesa amount when available, falls back to expected amount
    const extRevenue  = extsWithUsers.reduce((s, e) => s + Number(e.mpesaAmount || e.amount || 0), 0);
    const baseRevenue = serviceStatements
      .filter(s => s.paymentStatus === "paid")
      .reduce((s, r) => s + Number(r.mpesaAmount ?? r.paymentAmount ?? 0), 0);
    const pendingAmount = serviceStatements
      .filter(s => s.paymentStatus === "pending")
      .reduce((s, r) => s + Number(r.mpesaAmount ?? r.paymentAmount ?? 0), 0);
    res.json({ statements, totalRevenue: baseRevenue + extRevenue, pendingAmount, extensionRevenue: extRevenue, extensionCount: extRows.length });
  } catch { res.status(500).json({ message: "Failed to fetch payment statements" }); }
});

router.get("/settings", authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const keys = ["pesapal_consumer_key", "pesapal_consumer_secret", "pesapal_sandbox", "registration_enabled"];
    const docs = await db.select().from(settings).where(inArray(settings.key, keys));
    const result: Record<string, string> = {};
    for (const doc of docs) result[doc.key] = doc.value;
    if (result["registration_enabled"] === undefined) result["registration_enabled"] = "true";
    res.json(result);
  } catch { res.status(500).json({ message: "Failed to fetch settings" }); }
});

router.put("/settings", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const { pesapal_consumer_key, pesapal_consumer_secret, pesapal_sandbox, registration_enabled } = req.body;
    const pairs: Array<[string, string]> = [];
    if (pesapal_consumer_key  !== undefined) pairs.push(["pesapal_consumer_key",    String(pesapal_consumer_key)]);
    if (pesapal_consumer_secret !== undefined) pairs.push(["pesapal_consumer_secret", String(pesapal_consumer_secret)]);
    if (pesapal_sandbox       !== undefined) pairs.push(["pesapal_sandbox",           String(pesapal_sandbox)]);
    if (registration_enabled  !== undefined) pairs.push(["registration_enabled",      String(registration_enabled)]);
    for (const [key, value] of pairs) {
      await db.insert(settings).values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
    }
    res.json({ message: "Settings saved" });
  } catch { res.status(500).json({ message: "Failed to save settings" }); }
});

export default router;
