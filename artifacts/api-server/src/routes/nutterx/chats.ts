import { Router, Response } from "express";
import { eq, and, inArray, ne, sql, count } from "drizzle-orm";
import { getDb } from "../../lib/db";
import { chats, chatParticipants, messages, users } from "../../schema";
import { authenticate, requireAdmin, AuthRequest } from "../../middlewares/auth";

const router = Router();

async function buildChatResponse(db: ReturnType<typeof getDb>, chatRows: any[], currentUserId: string) {
  return Promise.all(chatRows.map(async (chat) => {
    const parts = await db.select({
      id: users.id, name: users.name, email: users.email,
      role: users.role, avatar: users.avatar,
    }).from(chatParticipants)
      .innerJoin(users, eq(chatParticipants.userId, users.id))
      .where(eq(chatParticipants.chatId, chat.id));

    let lastMessage: any = null;
    if (chat.lastMessageId) {
      const [lm] = await db.select({
        id: messages.id, content: messages.content, createdAt: messages.createdAt,
        type: messages.type,
        sender: { id: users.id, name: users.name },
      }).from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.id, chat.lastMessageId)).limit(1);
      if (lm) lastMessage = { ...lm, _id: lm.id, sender: { ...lm.sender, _id: lm.sender.id } };
    }

    let unreadCount = 0;
    if (currentUserId) {
      const [unreadRow] = await db.select({ cnt: count() }).from(messages)
        .where(and(eq(messages.chatId, chat.id), ne(messages.senderId, currentUserId), eq(messages.read, false)));
      unreadCount = Number(unreadRow?.cnt ?? 0);
    }

    return {
      ...chat,
      _id: chat.id,
      participants: parts.map(p => ({ ...p, _id: p.id })),
      lastMessage,
      unreadCount,
    };
  }));
}

router.get("/", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const myChats = await db.select({ chatId: chatParticipants.chatId })
      .from(chatParticipants).where(eq(chatParticipants.userId, userId));
    const chatIds = myChats.map(r => r.chatId);
    if (!chatIds.length) { res.json([]); return; }

    const chatRows = await db.select().from(chats).where(inArray(chats.id, chatIds));
    chatRows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const result = await buildChatResponse(db, chatRows, userId);
    res.json(result);
  } catch {
    res.status(500).json({ message: "Failed to fetch chats" });
  }
});

router.post("/group", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const { name, participantIds } = req.body;
    if (!name || !participantIds?.length) {
      res.status(400).json({ message: "Name and participants are required" }); return;
    }
    const allIds = [req.user!.id, ...participantIds.filter((id: string) => id !== req.user!.id)];
    const [chat] = await db.insert(chats).values({
      type: "group", name, createdBy: req.user!.id,
    }).returning();
    await db.insert(chatParticipants).values(allIds.map(uid => ({ chatId: chat.id, userId: uid })));
    const [result] = await buildChatResponse(db, [chat], req.user!.id);
    res.status(201).json(result);
  } catch {
    res.status(500).json({ message: "Failed to create group chat" });
  }
});

router.post("/direct/:userId", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const currentUserId = req.user!.id;
    const otherUserId = req.params["userId"]!;

    // Find existing direct chat between these two users
    const myChats = await db.select({ chatId: chatParticipants.chatId })
      .from(chatParticipants).where(eq(chatParticipants.userId, currentUserId));
    const myIds = myChats.map(r => r.chatId);

    let existingChatId: string | null = null;
    if (myIds.length) {
      const rows = await db.select({ chatId: chatParticipants.chatId })
        .from(chatParticipants)
        .where(and(eq(chatParticipants.userId, otherUserId), inArray(chatParticipants.chatId, myIds)));
      for (const row of rows) {
        const [c] = await db.select().from(chats)
          .where(and(eq(chats.id, row.chatId), eq(chats.type, "direct"))).limit(1);
        if (c) { existingChatId = c.id; break; }
      }
    }

    if (!existingChatId) {
      const [chat] = await db.insert(chats).values({ type: "direct" }).returning();
      await db.insert(chatParticipants).values([
        { chatId: chat.id, userId: currentUserId },
        { chatId: chat.id, userId: otherUserId },
      ]);
      existingChatId = chat.id;
    }

    const [chatRow] = await db.select().from(chats).where(eq(chats.id, existingChatId)).limit(1);
    const [result] = await buildChatResponse(db, [chatRow], currentUserId);
    res.json(result);
  } catch {
    res.status(500).json({ message: "Failed to get or create direct chat" });
  }
});

router.get("/:chatId/messages", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const chatId = req.params["chatId"]!;
    const page  = parseInt(req.query["page"] as string) || 1;
    const limit = parseInt(req.query["limit"] as string) || 50;

    const [part] = await db.select().from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, userId))).limit(1);
    if (!part) { res.status(404).json({ message: "Chat not found" }); return; }

    // Use raw SQL to guarantee all fields (including 'type') are returned correctly
    function rawRows(r: any): any[] {
      return Array.isArray(r) ? r : (r?.rows ?? []);
    }

    const msgsRaw = rawRows(await db.execute(sql`
      SELECT
        m.id, m.content, m.read, m.created_at AS "createdAt",
        m.chat_id AS "chatId", m.reply_to_id AS "replyToId",
        m.type, m.sender_id AS "senderId",
        u.id AS "senderId2", u.name AS "senderName",
        u.email AS "senderEmail", u.avatar AS "senderAvatar"
      FROM messages m
      INNER JOIN users u ON m.sender_id = u.id
      WHERE m.chat_id = ${chatId}
      ORDER BY m.created_at DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `));

    const paged = [...msgsRaw].reverse().map((m: any) => ({
      id: m.id,
      content: m.content,
      read: m.read,
      createdAt: m.createdAt,
      chatId: m.chatId,
      replyToId: m.replyToId,
      type: m.type,
      senderId: m.senderId,
      sender: { id: m.senderId2, _id: m.senderId2, name: m.senderName, email: m.senderEmail, avatar: m.senderAvatar },
    }));

    // Fetch reply-to messages in one batch (use inArray — array params are tuples, not pg arrays)
    const replyToIds = paged.map((m: any) => m.replyToId).filter(Boolean) as string[];
    const replyMap: Record<string, any> = {};
    if (replyToIds.length) {
      const replyRaw = await db
        .select({ id: messages.id, content: messages.content, senderId: users.id, senderName: users.name })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(inArray(messages.id, replyToIds));
      for (const r of replyRaw) {
        replyMap[r.id] = { _id: r.id, content: r.content, sender: { _id: r.senderId, name: r.senderName } };
      }
    }

    // Fetch view-once captions + per-user viewed status
    const viewOnceIds = paged
      .filter((m: any) => m.type === "view_once_image" && m.content)
      .map((m: any) => m.content as string);
    const captionMap: Record<string, string | null> = {};
    const viewedByMe = new Set<string>();
    if (viewOnceIds.length) {
      try {
        // Build safe UUID array literal (UUIDs are hex+hyphens only, safe for sql.raw)
        const uuidArr = sql.raw(`ARRAY[${viewOnceIds.map(id => `'${id}'`).join(",")}]::uuid[]`);
        const capRows = rawRows(await db.execute(sql`
          SELECT id, caption FROM view_once_images WHERE id = ANY(${uuidArr})
        `));
        for (const r of capRows) captionMap[r.id] = r.caption ?? null;

        const viewedRows = rawRows(await db.execute(sql`
          SELECT image_id FROM view_once_views
          WHERE image_id = ANY(${uuidArr}) AND viewer_id = ${userId}
        `));
        for (const r of viewedRows) viewedByMe.add(r.image_id);
      } catch { /* tables might not exist yet */ }
    }

    // Mark as read
    await db.execute(sql`
      UPDATE messages SET read = true
      WHERE chat_id = ${chatId} AND sender_id != ${userId} AND read = false
    `);

    res.json(paged.map((m: any) => ({
      ...m, _id: m.id,
      replyTo: m.replyToId ? (replyMap[m.replyToId] ?? null) : null,
      viewOnceCaption: m.type === "view_once_image" ? (captionMap[m.content] ?? null) : undefined,
      viewOnceViewed:  m.type === "view_once_image"
        ? (m.senderId === userId ? false : viewedByMe.has(m.content))
        : undefined,
    })));
  } catch (e: any) {
    console.error("[messages]", e?.message ?? e);
    res.status(500).json({ message: "Failed to fetch messages", detail: e?.message });
  }
});

router.post("/:chatId/messages", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const chatId = req.params["chatId"]!;
    const { content, replyToId } = req.body;
    if (!content?.trim()) { res.status(400).json({ message: "Content is required" }); return; }

    const [part] = await db.select().from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, userId))).limit(1);
    if (!part) { res.status(404).json({ message: "Chat not found" }); return; }

    const [msg] = await db.insert(messages).values({
      chatId, senderId: userId, content: content.trim(),
      ...(replyToId ? { replyToId } : {}),
    }).returning();

    await db.update(chats).set({ lastMessageId: msg.id, updatedAt: new Date() })
      .where(eq(chats.id, chatId));

    const [sender] = await db.select({ id: users.id, name: users.name, email: users.email, avatar: users.avatar })
      .from(users).where(eq(users.id, userId)).limit(1);

    res.status(201).json({ ...msg, _id: msg.id, sender: { ...sender, _id: sender.id } });
  } catch {
    res.status(500).json({ message: "Failed to send message" });
  }
});

router.get("/admin/groups", authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const groupRows = await db.select().from(chats).where(eq(chats.type, "group"));
    groupRows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const result = await buildChatResponse(db, groupRows, "");
    res.json(result);
  } catch {
    res.status(500).json({ message: "Failed to fetch groups" });
  }
});

router.patch("/group/:chatId", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const { chatId } = req.params;
    const { name, avatar, addUserIds } = req.body as { name?: string; avatar?: string; addUserIds?: string[] };

    const [chat] = await db.select().from(chats)
      .where(and(eq(chats.id, chatId!), eq(chats.type, "group"))).limit(1);
    if (!chat) { res.status(404).json({ message: "Group not found" }); return; }

    const updates: any = { updatedAt: new Date() };
    if (typeof name === "string" && name.trim()) updates.name = name.trim();
    if (typeof avatar === "string") updates.avatar = avatar.trim() || null;
    await db.update(chats).set(updates).where(eq(chats.id, chatId!));

    if (Array.isArray(addUserIds) && addUserIds.length > 0) {
      const existing = await db.select({ userId: chatParticipants.userId })
        .from(chatParticipants).where(eq(chatParticipants.chatId, chatId!));
      const existingIds = existing.map(r => r.userId);
      const toAdd = addUserIds.filter(id => !existingIds.includes(id));
      if (toAdd.length) {
        const validUsers = await db.select({ id: users.id }).from(users).where(inArray(users.id, toAdd));
        if (validUsers.length) {
          await db.insert(chatParticipants).values(validUsers.map(u => ({ chatId: chatId!, userId: u.id })));
        }
      }
    }

    const [updated] = await db.select().from(chats).where(eq(chats.id, chatId!)).limit(1);
    const [result] = await buildChatResponse(db, [updated], req.user!.id);
    res.json(result);
  } catch {
    res.status(500).json({ message: "Failed to update group" });
  }
});

export default router;
