import { Router, Request, Response } from "express";
import { User } from "../../models/User";
import { ServiceRequest } from "../../models/ServiceRequest";
import { Chat } from "../../models/Chat";
import { Settings } from "../../models/Settings";
import { authenticate, requireAdmin, generateToken, AuthRequest } from "../../middlewares/auth";
import { formatRequest } from "./requests";

const ADMIN_USERNAME = "Nutterx@42819408";
const ADMIN_PASSWORD = "BILLnutter001002";

const router = Router();

// Admin verify (special login)
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

// Get all users
router.get("/users", authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await User.find({ role: { $ne: "admin" } }).select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch {
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

// Admin creates a user with name, email, password
router.post("/users", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ message: "Name, email, and password are required" });
      return;
    }
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      res.status(400).json({ message: "Email already in use" });
      return;
    }
    const user = new User({ name, email: email.toLowerCase(), password });
    await user.save();
    res.status(201).json({ _id: user._id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt });
  } catch {
    res.status(500).json({ message: "Failed to create user" });
  }
});

// Get all service requests
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

// Update service request (status + deadline + payment)
router.put("/requests/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, adminNotes, subscriptionEndsAt, paymentRequired, paymentAmount } = req.body;

    const update: Record<string, unknown> = {};
    if (status !== undefined) update["status"] = status;
    if (adminNotes !== undefined) update["adminNotes"] = adminNotes;
    if (paymentRequired !== undefined) update["paymentRequired"] = paymentRequired;
    if (paymentAmount !== undefined) update["paymentAmount"] = Number(paymentAmount);

    if (subscriptionEndsAt) {
      update["subscriptionEndsAt"] = new Date(subscriptionEndsAt);
    }

    if (status === "completed" && !subscriptionEndsAt) {
      update["completedAt"] = new Date();
      update["subscriptionEndsAt"] = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    const request = await ServiceRequest.findByIdAndUpdate(req.params["id"], update, { new: true })
      .populate("user", "name email");

    if (!request) {
      res.status(404).json({ message: "Request not found" });
      return;
    }

    res.json(formatRequest(request));
  } catch {
    res.status(500).json({ message: "Failed to update request" });
  }
});

// Get active subscriptions
router.get("/subscriptions", authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const requests = await ServiceRequest.find({
      subscriptionEndsAt: { $exists: true, $gt: now },
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
        status: r.status,
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

// Get all chats (admin)
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

// Public clients data — all users with active service requests
router.get("/clients", authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requests = await ServiceRequest.find({
      status: { $in: ["in_progress", "completed"] },
    })
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    res.json(requests.map((r) => ({
      _id: r._id,
      user: r.user,
      serviceName: r.serviceName,
      status: r.status,
      subscriptionEndsAt: r.subscriptionEndsAt,
      completedAt: r.completedAt,
      createdAt: r.createdAt,
    })));
  } catch {
    res.status(500).json({ message: "Failed to fetch clients" });
  }
});

// Export users + service data as CSV
router.get("/export", authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await User.find({ role: { $ne: "admin" } }).select("-password").sort({ createdAt: -1 });
    const requests = await ServiceRequest.find().populate("user", "name email").sort({ createdAt: -1 });

    const lines: string[] = [
      "Name,Email,Service,Status,Deadline,Days Remaining,Joined",
    ];

    for (const u of users) {
      const userRequests = requests.filter(
        (r) => r.user && (r.user as any)._id?.toString() === u._id.toString()
      );

      if (userRequests.length === 0) {
        lines.push(`"${u.name}","${u.email}","—","—","—","—","${u.createdAt.toISOString().split("T")[0]}"`);
      } else {
        for (const r of userRequests) {
          const now = new Date();
          const daysLeft = r.subscriptionEndsAt
            ? Math.max(0, Math.ceil((r.subscriptionEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
            : "—";
          const deadline = r.subscriptionEndsAt ? r.subscriptionEndsAt.toISOString().split("T")[0] : "—";
          lines.push(
            `"${u.name}","${u.email}","${r.serviceName}","${r.status}","${deadline}","${daysLeft}","${u.createdAt.toISOString().split("T")[0]}"`
          );
        }
      }
    }

    const csv = lines.join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=nutterx-clients.csv");
    res.send(csv);
  } catch {
    res.status(500).json({ message: "Export failed" });
  }
});

// Get admin settings (Pesapal keys)
router.get("/settings", authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const keys = ["pesapal_consumer_key", "pesapal_consumer_secret", "pesapal_sandbox"];
    const docs = await Settings.find({ key: { $in: keys } });
    const result: Record<string, string> = {};
    for (const doc of docs) result[doc.key] = doc.value;
    res.json(result);
  } catch {
    res.status(500).json({ message: "Failed to fetch settings" });
  }
});

// Save admin settings (Pesapal keys)
router.put("/settings", authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { pesapal_consumer_key, pesapal_consumer_secret, pesapal_sandbox } = req.body;
    const ops = [];
    if (pesapal_consumer_key !== undefined) {
      ops.push(Settings.findOneAndUpdate({ key: "pesapal_consumer_key" }, { value: pesapal_consumer_key }, { upsert: true, new: true }));
    }
    if (pesapal_consumer_secret !== undefined) {
      ops.push(Settings.findOneAndUpdate({ key: "pesapal_consumer_secret" }, { value: pesapal_consumer_secret }, { upsert: true, new: true }));
    }
    if (pesapal_sandbox !== undefined) {
      ops.push(Settings.findOneAndUpdate({ key: "pesapal_sandbox" }, { value: String(pesapal_sandbox) }, { upsert: true, new: true }));
    }
    await Promise.all(ops);
    res.json({ message: "Settings saved" });
  } catch {
    res.status(500).json({ message: "Failed to save settings" });
  }
});

export default router;
