import { Router, Response } from "express";
import { getDb } from "../../lib/db";
import { sql } from "drizzle-orm";
import { authenticate, AuthRequest } from "../../middlewares/auth";
import { logger } from "../../lib/logger";

const router = Router();

function rows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

/* ── POST /api/view-once
   Body: { chatId, imageData (base64), mimeType, caption? } */
router.post("/", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { chatId, imageData, mimeType, caption } = req.body;
    const userId = req.user!.id;
    const db = getDb();

    if (!chatId || !imageData) {
      res.status(400).json({ error: "chatId and imageData are required" });
      return;
    }

    const part = await db.execute(sql`
      SELECT 1 FROM chat_participants WHERE chat_id = ${chatId} AND user_id = ${userId}
    `);
    if (!rows(part).length) {
      res.status(403).json({ error: "Not a participant of this chat" });
      return;
    }

    const msgResult = await db.execute(sql`
      INSERT INTO messages (chat_id, sender_id, content, type)
      VALUES (${chatId}, ${userId}, 'pending', 'view_once_image')
      RETURNING id
    `);
    const messageId = rows(msgResult)[0]!.id as string;

    const imgResult = await db.execute(sql`
      INSERT INTO view_once_images (message_id, sender_id, chat_id, image_data, mime_type, caption)
      VALUES (
        ${messageId}, ${userId}, ${chatId},
        ${imageData}, ${mimeType || "image/jpeg"},
        ${caption || null}
      )
      RETURNING id
    `);
    const imageId = rows(imgResult)[0]!.id as string;

    await db.execute(sql`UPDATE messages SET content = ${imageId} WHERE id = ${messageId}`);
    await db.execute(sql`UPDATE chats SET last_message_id = ${messageId}, updated_at = now() WHERE id = ${chatId}`);

    const io = (req.app as any).io;
    if (io) io.to(chatId).emit("new_message", { chatId, messageId });

    res.status(201).json({ messageId, imageId });
  } catch (err: any) {
    logger.error({ err }, "view-once POST failed");
    res.status(500).json({ error: err.message || "Failed to send photo" });
  }
});

/* ── GET /api/view-once/:imageId
   Returns image data. Tracks per-user views.
   - Sender: always sees the photo (preview only, not counted as a view)
   - Each non-sender can view exactly once; subsequent attempts → 410
   - Image data nulled out only after all non-sender participants have viewed */
router.get("/:imageId", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { imageId } = req.params;
    const userId = req.user!.id;
    const db = getDb();

    const result = await db.execute(sql`
      SELECT vi.id, vi.image_data, vi.mime_type, vi.caption, vi.viewed, vi.sender_id, vi.chat_id
      FROM view_once_images vi WHERE vi.id = ${imageId}
    `);
    const img = rows(result)[0] as any;
    if (!img) { res.status(404).json({ error: "Image not found" }); return; }

    const isSender = img.sender_id === userId;

    if (isSender) {
      res.json({
        imageData: img.image_data,
        mimeType: img.mime_type,
        caption: img.caption || null,
        viewed: img.viewed,
        isSender: true,
      });
      return;
    }

    // Check if this specific user has already viewed it
    const viewCheck = await db.execute(sql`
      SELECT 1 FROM view_once_views WHERE image_id = ${imageId} AND viewer_id = ${userId}
    `);
    if (rows(viewCheck).length) {
      res.status(410).json({ error: "You have already viewed this photo" });
      return;
    }

    // Image data already wiped (all participants have viewed)
    if (!img.image_data) {
      res.status(410).json({ error: "Photo is no longer available" });
      return;
    }

    // Record this view
    await db.execute(sql`
      INSERT INTO view_once_views (image_id, viewer_id)
      VALUES (${imageId}, ${userId})
      ON CONFLICT (image_id, viewer_id) DO NOTHING
    `);

    // Check if all non-sender participants have now viewed
    const partResult = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM chat_participants
      WHERE chat_id = ${img.chat_id} AND user_id != ${img.sender_id}
    `);
    const viewsResult = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM view_once_views WHERE image_id = ${imageId}
    `);
    const totalParticipants = parseInt(rows(partResult)[0]?.cnt ?? "0", 10);
    const totalViews       = parseInt(rows(viewsResult)[0]?.cnt ?? "0", 10);

    if (totalViews >= totalParticipants) {
      await db.execute(sql`
        UPDATE view_once_images SET viewed = true, viewed_at = now(), image_data = null
        WHERE id = ${imageId}
      `);
    }

    const io = (req.app as any).io;
    if (io) io.to(img.chat_id).emit("view_once_viewed", { imageId, chatId: img.chat_id, viewerId: userId });

    res.json({
      imageData: img.image_data,
      mimeType: img.mime_type,
      caption: img.caption || null,
      viewed: false,
      isSender: false,
    });
  } catch (err: any) {
    logger.error({ err }, "view-once GET failed");
    res.status(500).json({ error: err.message || "Failed to fetch photo" });
  }
});

export default router;
