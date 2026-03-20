import { Router, Response } from "express";
import { User } from "../../models/User";
import { Chat } from "../../models/Chat";
import { authenticate, AuthRequest } from "../../middlewares/auth";

const router = Router();

router.post("/contact-admin", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!._id;

    const admin = await User.findOne({ role: "admin" });
    if (!admin) {
      res.status(404).json({ message: "No admin found" });
      return;
    }

    let chat = await Chat.findOne({
      type: "direct",
      participants: { $all: [userId, admin._id], $size: 2 },
    }).populate("participants", "name email avatar role");

    if (!chat) {
      chat = new Chat({
        type: "direct",
        participants: [userId, admin._id],
      });
      await chat.save();
      await chat.populate("participants", "name email avatar role");
    }

    res.json(chat);
  } catch {
    res.status(500).json({ message: "Failed to contact admin" });
  }
});

export default router;
