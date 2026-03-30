import webpush from "web-push";
import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

let initialized = false;

function ensureInit() {
  if (initialized) return;
  const publicKey  = process.env["VAPID_PUBLIC_KEY"]!;
  const privateKey = process.env["VAPID_PRIVATE_KEY"]!;
  const email      = process.env["VAPID_EMAIL"] ?? "mailto:admin@nutterx.com";
  if (!publicKey || !privateKey) throw new Error("VAPID keys not configured");
  webpush.setVapidDetails(email, publicKey, privateKey);
  initialized = true;
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_id: string;
}

function rawRows(r: any): any[] {
  return Array.isArray(r) ? r : (r?.rows ?? []);
}

/**
 * Send a web-push notification to all subscriptions belonging to a set of user IDs.
 * Silently removes stale subscriptions (410 Gone).
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (!userIds.length) return;
  try {
    ensureInit();
  } catch (err) {
    logger.warn({ err }, "Push not configured — skipping");
    return;
  }

  const db = getDb();
  const placeholders = userIds.map((_, i) => `$${i + 1}`).join(",");
  const rows = rawRows(
    await db.execute(
      sql.raw(`SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${placeholders})`, userIds as any)
    )
  ) as SubscriptionRow[];

  if (!rows.length) return;

  const body = JSON.stringify(payload);
  const stale: string[] = [];

  await Promise.allSettled(
    rows.map(async (row) => {
      const sub: webpush.PushSubscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        await webpush.sendNotification(sub, body);
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          stale.push(row.endpoint);
        } else {
          logger.warn({ err, endpoint: row.endpoint }, "Push send failed");
        }
      }
    }),
  );

  if (stale.length) {
    const ep = stale.map((_, i) => `$${i + 1}`).join(",");
    await db.execute(
      sql.raw(`DELETE FROM push_subscriptions WHERE endpoint IN (${ep})`, stale as any)
    ).catch(() => {});
  }
}
