import { Router, Response } from "express";
import { getDb } from "../../lib/db";
import { sql } from "drizzle-orm";
import { authenticate, AuthRequest } from "../../middlewares/auth";
import { logger } from "../../lib/logger";

const router = Router();

// With postgres.js driver, db.execute() returns a RowList (array-like), not {rows:[]}
// So we cast to any[] directly.
function rows(result: any): any[] {
  // postgres.js RowList is iterable/array-like
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

/* ── POST /api/view-once
   Body: { chatId, imageData (base64), mimeType, caption? }
   Creates a message of type 'view_once_image' and stores the image. */
router.post("/", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { chatId, imageData, mimeType, caption } = req.body;
    const userId = req.user!.id;
    const db = getDb();

    if (!chatId || !imageData) {
      res.status(400).json({ error: "chatId and imageData are required" });
      return;
    }

    // Verify participant
    const part = await db.execute(sql`
      SELECT 1 FROM chat_participants WHERE chat_id = ${chatId} AND user_id = ${userId}
    `);
    if (!rows(part).length) {
      res.status(403).json({ error: "Not a participant of this chat" });
      return;
    }

    // Create message
    const msgResult = await db.execute(sql`
      INSERT INTO messages (chat_id, sender_id, content, type)
      VALUES (${chatId}, ${userId}, 'pending', 'view_once_image')
      RETURNING id
    `);
    const messageId = rows(msgResult)[0]!.id as string;

    // Store image + optional caption
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

    // Point message.content to the imageId
    await db.execute(sql`
      UPDATE messages SET content = ${imageId} WHERE id = ${messageId}
    `);

    // Update chat last_message_id
    await db.execute(sql`
      UPDATE chats SET last_message_id = ${messageId}, updated_at = now() WHERE id = ${chatId}
    `);

    // Notify via Socket.io
    const io = (req.app as any).io;
    if (io) {
      io.to(chatId).emit("new_message", { chatId, messageId });
    }

    res.status(201).json({ messageId, imageId });
  } catch (err: any) {
    logger.error({ err }, "view-once POST failed");
    res.status(500).json({ error: err.message || "Failed to send photo" });
  }
});

/* ── GET /api/view-once/:imageId
   Returns image data (+caption). Non-sender first view consumes the image. */
router.get("/:imageId", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { imageId } = req.params;
    const userId = req.user!.id;
    const db = getDb();

    const result = await db.execute(sql`
      SELECT vi.id, vi.image_data, vi.mime_type, vi.caption, vi.viewed, vi.sender_id, vi.chat_id
      FROM view_once_images vi
      WHERE vi.id = ${imageId}
    `);

    const resultRows = rows(result);
    if (!resultRows.length) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    const img = resultRows[0] as any;
    const isSender = img.sender_id === userId;

    if (img.viewed && !isSender) {
      res.status(410).json({ error: "Image already viewed and deleted" });
      return;
    }

    if (!img.image_data) {
      if (isSender) {
        res.json({ imageData: null, mimeType: img.mime_type, caption: img.caption, viewed: true, isSender: true });
      } else {
        res.status(410).json({ error: "Image already viewed and deleted" });
      }
      return;
    }

    // Recipient views for the first time — consume it
    if (!isSender && !img.viewed) {
      await db.execute(sql`
        UPDATE view_once_images
        SET viewed = true, viewed_at = now(), image_data = null
        WHERE id = ${imageId}
      `);

      const io = (req.app as any).io;
      if (io) {
        io.to(img.chat_id).emit("view_once_viewed", { imageId, chatId: img.chat_id });
      }
    }

    res.json({
      imageData: img.image_data,
      mimeType: img.mime_type,
      caption: img.caption || null,
      viewed: img.viewed,
      isSender,
    });
  } catch (err: any) {
    logger.error({ err }, "view-once GET failed");
    res.status(500).json({ error: err.message || "Failed to fetch photo" });
  }
});

export default router;
