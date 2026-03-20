import { Router, Response } from "express";
import { Chat, Message } from "../../models/Chat";
import { User } from "../../models/User";
import { authenticate, requireAdmin, AuthRequest } from "../../middlewares/auth";
import mongoose from "mongoose";

const router = Router();

router.get("/", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!._id;
    const chats = await Chat.find({ participants: userId })
      .populate("participants", "name email avatar role")
      .populate({ path: "lastMessage", populate: { path: "sender", select: "name" } })
      .sort({ updatedAt: -1 });

    const chatsWithUnread = await Promise.all(
      chats.map(async (chat) => {
        const unreadCount = await Message.countDocuments({
          chatId: chat._id,
          sender: { $ne: userId },
          read: false,
        });
        return { ...chat.toObject(), unreadCount };
      })
    );

    res.json(chatsWithUnread);
  } catch {
    res.status(500).json({ message: "Failed to fetch chats" });
  }
});

router.post("/group", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, participantIds } = req.body;
    if (!name || !participantIds?.length) {
      res.status(400).json({ message: "Name and participants are required" });
      return;
    }
    const allParticipants = [
      req.user!._id.toString(),
      ...participantIds.filter((id: string) => id !== req.user!._id.toString()),
    ];
    const chat = new Chat({
      type: "group",
      name,
      participants: allParticipants,
      createdBy: req.user!._id,
    });
    await chat.save();
    await chat.populate("participants", "name email avatar role");
    res.status(201).json(chat);
  } catch {
    res.status(500).json({ message: "Failed to create group chat" });
  }
});

router.post("/direct/:userId", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.user!._id;
    const otherUserId = new mongoose.Types.ObjectId(req.params["userId"] as string);

    let chat = await Chat.findOne({
      type: "direct",
      participants: { $all: [currentUserId, otherUserId], $size: 2 },
    }).populate("participants", "name email avatar role");

    if (!chat) {
      chat = new Chat({
        type: "direct",
        participants: [currentUserId, otherUserId],
      });
      await chat.save();
      await chat.populate("participants", "name email avatar role");
    }

    res.json(chat);
  } catch {
    res.status(500).json({ message: "Failed to get or create direct chat" });
  }
});

router.get("/:chatId/messages", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!._id;
    const chatId = req.params["chatId"];
    const page = parseInt(req.query["page"] as string) || 1;
    const limit = parseInt(req.query["limit"] as string) || 50;

    const chat = await Chat.findOne({ _id: chatId, participants: userId });
    if (!chat) {
      res.status(404).json({ message: "Chat not found" });
      return;
    }

    const messages = await Message.find({ chatId })
      .populate("sender", "name email avatar")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    await Message.updateMany(
      { chatId, sender: { $ne: userId }, read: false },
      { read: true }
    );

    res.json(messages.reverse());
  } catch {
    res.status(500).json({ message: "Failed to fetch messages" });
  }
});

router.post("/:chatId/messages", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!._id;
    const chatId = req.params["chatId"];
    const { content } = req.body;

    if (!content?.trim()) {
      res.status(400).json({ message: "Content is required" });
      return;
    }

    const chat = await Chat.findOne({ _id: chatId, participants: userId });
    if (!chat) {
      res.status(404).json({ message: "Chat not found" });
      return;
    }

    const message = new Message({
      chatId,
      sender: userId,
      content: content.trim(),
    });
    await message.save();
    await message.populate("sender", "name email avatar");

    chat.lastMessage = message._id;
    chat.updatedAt = new Date();
    await chat.save();

    res.status(201).json(message);
  } catch {
    res.status(500).json({ message: "Failed to send message" });
  }
});

// GET /api/chats/admin/groups — admin: list all group chats
router.get("/admin/groups", authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groups = await Chat.find({ type: "group" })
      .populate("participants", "name email avatar role")
      .sort({ updatedAt: -1 });
    res.json(groups);
  } catch {
    res.status(500).json({ message: "Failed to fetch groups" });
  }
});

// PATCH /api/chats/group/:chatId — admin: update avatar and/or add members
router.patch("/group/:chatId", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const { avatar, addUserIds } = req.body as { avatar?: string; addUserIds?: string[] };

    const chat = await Chat.findOne({ _id: chatId, type: "group" });
    if (!chat) { res.status(404).json({ message: "Group not found" }); return; }

    if (typeof avatar === "string") {
      chat.avatar = avatar.trim() || undefined;
    }

    if (Array.isArray(addUserIds) && addUserIds.length > 0) {
      const existingIds = chat.participants.map(p => p.toString());
      const toAdd = addUserIds.filter(id => !existingIds.includes(id));
      if (toAdd.length > 0) {
        // Verify users exist
        const validUsers = await User.find({ _id: { $in: toAdd } }).select("_id");
        const validIds = validUsers.map(u => u._id as mongoose.Types.ObjectId);
        chat.participants.push(...validIds);
      }
    }

    await chat.save();
    await chat.populate("participants", "name email avatar role");
    res.json(chat);
  } catch {
    res.status(500).json({ message: "Failed to update group" });
  }
});

export default router;
