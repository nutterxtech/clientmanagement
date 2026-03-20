import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { useGetChats, useGetChatMessages, useSendMessage, useStartDirectChat } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Users, User, CircleDot, MessageSquare, Headphones, ChevronDown, ChevronUp, Pin } from "lucide-react";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

export default function Chat() {
  const { user } = useAuth();
  const { socket, isConnected, onlineUsers } = useSocket();
  const { data: chats, isLoading: chatsLoading, refetch: refetchChats } = useGetChats();
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [showUserList, setShowUserList] = useState(false);

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const { data: messages, isLoading: messagesLoading, refetch: refetchMessages } = useGetChatMessages(
    activeChatId || "",
    { query: { enabled: !!activeChatId } }
  );

  const sendMessageMutation = useSendMessage();
  const startChatMutation = useStartDirectChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch all users for the "People" panel
  useEffect(() => {
    const token = localStorage.getItem("nutterx_token");
    if (!token) return;
    fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => setAllUsers(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!socket || !activeChatId) return;
    socket.emit("join_chat", activeChatId);
    return () => { socket.emit("leave_chat", activeChatId); };
  }, [socket, activeChatId]);

  useEffect(() => {
    if (!socket) return;
    const handler = (msg: any) => {
      if (msg.chatId === activeChatId) refetchMessages();
      refetchChats();
    };
    socket.on("new_message", handler);
    return () => { socket.off("new_message", handler); };
  }, [socket, activeChatId, refetchMessages, refetchChats]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !activeChatId) return;
    const content = message;
    setMessage("");
    try {
      await sendMessageMutation.mutateAsync({ chatId: activeChatId, data: { content } });
      refetchMessages();
    } catch {
      setMessage(content);
    }
  };

  const handleStartChat = async (userId: string) => {
    const existing = chats?.find(c =>
      c.type === "direct" &&
      c.participants?.some((p: any) => p._id === userId)
    );
    if (existing) { setActiveChatId(existing._id!); return; }
    try {
      const chat = await startChatMutation.mutateAsync({ userId });
      await refetchChats();
      setActiveChatId((chat as any)._id);
    } catch {}
  };

  const [contactingAdmin, setContactingAdmin] = useState(false);

  const handleContactAdmin = async () => {
    const existing = chats?.find(c =>
      c.type === "direct" && c.participants?.some((p: any) => p.role === "admin")
    );
    if (existing) { setActiveChatId(existing._id!); return; }
    setContactingAdmin(true);
    try {
      const token = localStorage.getItem("nutterx_token");
      const res = await fetch("/api/support/contact-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      const chat = await res.json();
      await refetchChats();
      setActiveChatId(chat._id);
    } catch {
      alert("Could not reach support. Please try again shortly.");
    } finally {
      setContactingAdmin(false);
    }
  };

  const getChatName = (chat: any) => {
    if (chat.type === "group") return chat.name;
    const other = chat.participants?.find((p: any) => p._id !== user?._id);
    return other?.name || "Unknown";
  };

  const getChatSubtitle = (chat: any) => {
    if (chat.type === "group") return `${chat.participants?.length || 0} members`;
    const other = chat.participants?.find((p: any) => p._id !== user?._id);
    return other?.role === "admin" ? "Support Team" : other?.email || "";
  };

  const isUserOnline = (userId: string) => onlineUsers.includes(userId);

  const getChatOtherId = (chat: any) => {
    const other = chat.participants?.find((p: any) => p._id !== user?._id);
    return other?._id;
  };

  const isAdminChat = (chat: any) =>
    chat.type === "direct" && chat.participants?.some((p: any) => p.role === "admin");

  // Sort chats: admin chat first (pinned), then by last message
  const sortedChats = chats
    ? [...chats].sort((a: any, b: any) => {
        if (isAdminChat(a) && !isAdminChat(b)) return -1;
        if (!isAdminChat(a) && isAdminChat(b)) return 1;
        return 0;
      })
    : [];

  const activeChat = chats?.find(c => c._id === activeChatId);

  return (
    <div className="pt-20 h-screen flex flex-col px-4 sm:px-6 lg:px-8 max-w-[1600px] mx-auto pb-4">
      <div className="flex-1 glass-panel rounded-3xl overflow-hidden flex border border-white/10 shadow-2xl mt-4 min-h-0">

        {/* Sidebar */}
        <div className="w-80 shrink-0 border-r border-white/5 bg-black/20 flex flex-col min-h-0">
          <div className="p-4 border-b border-white/5 shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Messages</h2>
              <motion.div
                animate={{ scale: isConnected ? 1 : 0.95 }}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border",
                  isConnected
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-red-500/10 border-red-500/20 text-red-400"
                )}
              >
                <CircleDot className="w-3 h-3" />
                {isConnected ? "Live" : "Offline"}
              </motion.div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {/* Chats list */}
            {chatsLoading ? (
              <div className="p-6 flex justify-center">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : sortedChats.length > 0 ? (
              <AnimatePresence initial={false}>
                {sortedChats.map((chat, i) => {
                  const otherId = getChatOtherId(chat);
                  const online = otherId ? isUserOnline(otherId) : false;
                  const pinned = isAdminChat(chat) && user?.role !== "admin";
                  return (
                    <motion.button
                      key={chat._id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.25 }}
                      onClick={() => setActiveChatId(chat._id!)}
                      className={cn(
                        "w-full p-3 rounded-xl flex items-center gap-3 transition-all text-left group",
                        activeChatId === chat._id
                          ? "bg-primary/20 border border-primary/30"
                          : "hover:bg-white/5 border border-transparent"
                      )}
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center shrink-0 relative border border-white/10">
                        {chat.type === "group"
                          ? <Users className="w-5 h-5 text-blue-400" />
                          : <User className="w-5 h-5 text-indigo-400" />
                        }
                        {online && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-[#0a0e1a] rounded-full" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                          {getChatName(chat)}
                          {pinned && <Pin className="w-3 h-3 text-primary shrink-0" />}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {(chat as any).lastMessage?.content || getChatSubtitle(chat)}
                        </div>
                      </div>
                      {(chat as any).unreadCount > 0 && (
                        <span className="shrink-0 w-5 h-5 bg-primary rounded-full text-xs flex items-center justify-center font-bold">
                          {(chat as any).unreadCount}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            ) : (
              <div className="p-4 text-center text-sm text-muted-foreground">No conversations yet</div>
            )}

            {/* People to chat with */}
            {allUsers.length > 0 && (
              <div className="pt-3 mt-2 border-t border-white/5 px-1">
                <button
                  onClick={() => setShowUserList(!showUserList)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                >
                  <span>People ({allUsers.length})</span>
                  {showUserList ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                <AnimatePresence>
                  {showUserList && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-0.5 mt-1">
                        {allUsers.map(u => (
                          <motion.button
                            key={u._id}
                            whileHover={{ x: 4 }}
                            onClick={() => handleStartChat(u._id)}
                            className="w-full p-2.5 text-sm text-left hover:bg-white/5 rounded-xl flex items-center gap-2.5 transition-colors"
                          >
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center shrink-0 border border-white/10 font-bold text-xs relative">
                              {u.name?.charAt(0).toUpperCase()}
                              {isUserOnline(u._id) && (
                                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#0a0e1a] rounded-full" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">{u.name}</div>
                              {u.role === "admin" && (
                                <div className="text-[10px] text-red-400 uppercase tracking-wider">Admin</div>
                              )}
                            </div>
                            {startChatMutation.isPending && <div className="w-3.5 h-3.5 border border-primary border-t-transparent rounded-full animate-spin ml-auto" />}
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Contact Support pinned button */}
          {user?.role !== "admin" && (
            <div className="p-3 border-t border-white/5 shrink-0">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleContactAdmin}
                disabled={contactingAdmin}
                className="w-full py-2.5 px-4 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-medium hover:bg-primary/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Headphones className="w-4 h-4" />
                {contactingAdmin ? "Connecting..." : "Contact Support"}
              </motion.button>
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {activeChatId ? (
            <>
              {/* Header */}
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="h-16 border-b border-white/5 bg-black/20 flex items-center px-6 shrink-0 backdrop-blur-md"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center mr-3 border border-white/10">
                  {activeChat?.type === "group"
                    ? <Users className="w-4 h-4 text-blue-400" />
                    : <User className="w-4 h-4 text-indigo-400" />}
                </div>
                <div>
                  <div className="font-semibold">{activeChat ? getChatName(activeChat) : "Chat"}</div>
                  {activeChat && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      {getChatSubtitle(activeChat)}
                      {getChatOtherId(activeChat) && isUserOnline(getChatOtherId(activeChat)) && (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Online
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-3 min-h-0">
                {messagesLoading ? (
                  <div className="flex justify-center mt-10">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : messages && messages.length > 0 ? (
                  <AnimatePresence initial={false}>
                    {messages.map((msg: any) => {
                      const isOwn = msg.sender?._id === user?._id;
                      return (
                        <motion.div
                          key={msg._id}
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.18, type: "spring", stiffness: 300, damping: 25 }}
                          className={cn("flex flex-col max-w-[72%]", isOwn ? "ml-auto items-end" : "mr-auto items-start")}
                        >
                          {!isOwn && (
                            <span className="text-xs text-muted-foreground mb-1 ml-1 font-medium">{msg.sender?.name}</span>
                          )}
                          <motion.div
                            whileHover={{ scale: 1.01 }}
                            className={cn(
                              "px-4 py-2.5 rounded-2xl text-sm shadow-sm break-words",
                              isOwn
                                ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-br-none"
                                : "bg-white/10 text-foreground rounded-bl-none border border-white/10"
                            )}
                          >
                            {msg.content}
                          </motion.div>
                          <span className="text-[10px] text-muted-foreground mt-1 px-1">
                            {formatTime(msg.createdAt)}
                          </span>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center h-full text-muted-foreground"
                  >
                    <MessageSquare className="w-10 h-10 mb-3 opacity-20" />
                    <p className="text-sm">No messages yet. Say hello!</p>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 bg-black/40 border-t border-white/5 shrink-0">
                <form onSubmit={handleSend} className="flex gap-2 max-w-4xl mx-auto">
                  <Input
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-white/5 border-white/10 rounded-full px-5 h-11"
                    autoComplete="off"
                  />
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      type="submit"
                      variant="gradient"
                      size="icon"
                      className="rounded-full shrink-0"
                      disabled={!message.trim() || sendMessageMutation.isPending}
                    >
                      <Send className="w-4 h-4 ml-0.5" />
                    </Button>
                  </motion.div>
                </form>
              </div>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col items-center justify-center text-muted-foreground"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/5"
              >
                <MessageSquare className="w-9 h-9 opacity-20" />
              </motion.div>
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm mt-1 opacity-60">Choose from the list or click a person to start chatting</p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
