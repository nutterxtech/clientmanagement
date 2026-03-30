import { Router, type Response } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "../../lib/db";
import { authenticate, type AuthRequest } from "../../middlewares/auth";
import { logger } from "../../lib/logger";

const router = Router();

function rawRows(r: any): any[] {
  return Array.isArray(r) ? r : (r?.rows ?? []);
}

/** Expose VAPID public key so the client can subscribe */
router.get("/vapid-public-key", (_req, res: Response) => {
  const key = process.env["VAPID_PUBLIC_KEY"];
  if (!key) { res.status(503).json({ message: "Push not configured" }); return; }
  res.json({ publicKey: key });
});

/** Save / update a push subscription for the authenticated user */
router.post("/subscribe", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { endpoint, keys } = req.body as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ message: "Invalid subscription object" });
      return;
    }
    const db = getDb();
    await db.execute(sql`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (${req.user!.id}, ${endpoint}, ${keys.p256dh}, ${keys.auth})
      ON CONFLICT (user_id, endpoint) DO UPDATE
        SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
    `);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to save push subscription");
    res.status(500).json({ message: "Failed to save subscription" });
  }
});

/** Remove a push subscription (user unsubscribing or logging out) */
router.delete("/subscribe", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { endpoint } = req.body as { endpoint: string };
    if (!endpoint) { res.status(400).json({ message: "endpoint required" }); return; }
    const db = getDb();
    await db.execute(sql`
      DELETE FROM push_subscriptions WHERE user_id = ${req.user!.id} AND endpoint = ${endpoint}
    `);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to remove push subscription");
    res.status(500).json({ message: "Failed to remove subscription" });
  }
});

export default router;
