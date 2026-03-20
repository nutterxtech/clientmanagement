import { Router, Request, Response } from "express";
import { User } from "../../models/User";
import { ServiceRequest } from "../../models/ServiceRequest";
import { Chat } from "../../models/Chat";
import { authenticate, requireAdmin, generateToken, AuthRequest } from "../../middlewares/auth";
import { formatRequest } from "./requests";

const ADMIN_USERNAME = "Nutterx@42819408";
const ADMIN_PASSWORD = "BILLnutter001002";

const router = Router();

router.post("/verify", async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    res.status(401).json({ message: "Invalid admin credentials" });
    return;
  }
  const admin = await User.findOne({ role: "admin" });
  if (!admin) {
    res.status(404).json({ message: "Admin account not found" });
    return;
  }
  const token = generateToken(admin._id.toString());
  res.json({
    token,
    user: { _id: admin._id, name: admin.name, email: admin.email, role: admin.role, createdAt: admin.createdAt },
  });
});

router.get("/users", authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch {
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

router.get("/requests", authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requests = await ServiceRequest.find()
      .populate("user", "name email")
      .sort({ createdAt: -1 });
    res.json(requests.map(formatRequest));
  } catch {
    res.status(500).json({ message: "Failed to fetch requests" });
  }
});

router.put("/requests/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, adminNotes } = req.body;

    const update: Record<string, unknown> = { status, adminNotes };

    if (status === "completed") {
      update["completedAt"] = new Date();
      update["subscriptionEndsAt"] = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    const request = await ServiceRequest.findByIdAndUpdate(
      req.params["id"],
      update,
      { new: true }
    ).populate("user", "name email");

    if (!request) {
      res.status(404).json({ message: "Request not found" });
      return;
    }

    res.json(formatRequest(request));
  } catch {
    res.status(500).json({ message: "Failed to update request" });
  }
});

router.get("/subscriptions", authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const requests = await ServiceRequest.find({
      status: "completed",
      subscriptionEndsAt: { $gt: now },
    })
      .populate("user", "name email")
      .sort({ subscriptionEndsAt: 1 });

    const subscriptions = requests.map((r) => {
      const msLeft = r.subscriptionEndsAt!.getTime() - now.getTime();
      const daysRemaining = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
      return {
        _id: r._id,
        user: r.user,
        serviceName: r.serviceName,
        completedAt: r.completedAt,
        subscriptionEndsAt: r.subscriptionEndsAt,
        daysRemaining,
      };
    });

    res.json(subscriptions);
  } catch {
    res.status(500).json({ message: "Failed to fetch subscriptions" });
  }
});

router.get("/chats", authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const chats = await Chat.find()
      .populate("participants", "name email avatar role")
      .sort({ updatedAt: -1 });
    res.json(chats);
  } catch {
    res.status(500).json({ message: "Failed to fetch chats" });
  }
});

export default router;
