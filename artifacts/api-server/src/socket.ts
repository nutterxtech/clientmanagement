import { Server as SocketServer } from "socket.io";
import { Server as HttpServer } from "http";
import { eq, and, ne } from "drizzle-orm";
import { verifyToken } from "./middlewares/auth";
import { getDb } from "./lib/db";
import { users, chats, chatParticipants, messages } from "./schema";
import { logger } from "./lib/logger";

const onlineUsers = new Map<string, string>();

export function initSocket(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/api/socket.io",
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth["token"] as string;
    if (!token) return next(new Error("Authentication required"));
    const decoded = verifyToken(token);
    if (!decoded) return next(new Error("Invalid token"));
    const db = getDb();
    const [user] = await db.select({ id: users.id, name: users.name, email: users.email, avatar: users.avatar, role: users.role })
      .from(users).where(eq(users.id, decoded.id)).limit(1);
    if (!user) return next(new Error("User not found"));
    (socket as any).user = user;
    next();
  });

  io.on("connection", (socket) => {
    const user    = (socket as any).user as { id: string; name: string; email: string; avatar?: string | null; role: string };
    const userId  = user.id;

    onlineUsers.set(userId, socket.id);
    // Expose so REST routes can reach it via (req.app as any).io._onlineUsers
    (io as any)._onlineUsers = onlineUsers;
    logger.info({ userId, socketId: socket.id }, "User connected");
    io.emit("user_online", { userId });

    socket.on("join_chat", async (chatId: string) => {
      try {
        const db = getDb();
        const [part] = await db.select().from(chatParticipants)
          .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, userId))).limit(1);
        if (part) {
          socket.join(chatId);
          await db.update(messages).set({ read: true })
            .where(and(eq(messages.chatId, chatId), ne(messages.senderId, userId), eq(messages.read, false)));
        }
      } catch (err) {
        logger.error({ err }, "Error joining chat");
      }
    });

    socket.on("leave_chat", (chatId: string) => socket.leave(chatId));

    socket.on("send_message", async (data: { chatId: string; content: string }) => {
      try {
        const { chatId, content } = data;
        if (!content?.trim()) return;
        const db = getDb();

        const [part] = await db.select().from(chatParticipants)
          .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, userId))).limit(1);
        if (!part) return;

        const [msg] = await db.insert(messages).values({ chatId, senderId: userId, content: content.trim() }).returning();
        await db.update(chats).set({ lastMessageId: msg.id, updatedAt: new Date() }).where(eq(chats.id, chatId));

        const msgWithSender = { ...msg, _id: msg.id, sender: { ...user, _id: user.id } };
        io.to(chatId).emit("new_message", msgWithSender);

        // Notify other participants
        const participants = await db.select({ userId: chatParticipants.userId })
          .from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
        for (const p of participants) {
          if (p.userId !== userId) {
            const targetSocketId = onlineUsers.get(p.userId);
            if (targetSocketId) {
              io.to(targetSocketId).emit("chat_updated", { chatId, lastMessage: msgWithSender });
            }
          }
        }
      } catch (err) {
        logger.error({ err }, "Error sending message");
      }
    });

    socket.on("typing",      (data: { chatId: string }) => socket.to(data.chatId).emit("user_typing",      { userId, chatId: data.chatId }));
    socket.on("stop_typing", (data: { chatId: string }) => socket.to(data.chatId).emit("user_stop_typing", { userId, chatId: data.chatId }));

    socket.on("disconnect", () => {
      onlineUsers.delete(userId);
      io.emit("user_offline", { userId });
      logger.info({ userId }, "User disconnected");
    });
  });

  return io;
}
