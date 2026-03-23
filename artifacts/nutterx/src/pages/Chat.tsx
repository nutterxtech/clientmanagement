import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import {
  useGetChats, useGetChatMessages, useSendMessage, useStartDirectChat,
  getGetChatsQueryKey, getGetChatMessagesQueryKey,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import {
  Send, CircleDot, MessageSquare, Headphones, ArrowLeft,
  Users, Pin, Search, X, ExternalLink,
} from "lucide-react";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type Screen = "list" | "chat";

/* ── URL detector ──────────────────────────────────────────── */
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

function renderContent(text: string, onLink: (url: string) => void) {
  const parts = text.split(URL_RE);
  return parts.map((part, i) =>
    URL_RE.test(part) ? (
      <button
        key={i}
        onClick={() => onLink(part)}
        className="underline underline-offset-2 break-all hover:opacity-80 transition-opacity"
        style={{ color: "inherit" }}
      >
        {part}
      </button>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/* ── Iframe link preview modal ─────────────────────────────── */
function LinkModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.72)" }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.93, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.93, opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-3xl h-[75vh] rounded-2xl overflow-hidden flex flex-col shadow-2xl"
          style={{ background: "#fff" }}
        >
          {/* Modal header */}
          <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ background: "#075E54" }}>
            <ExternalLink className="w-4 h-4 text-white shrink-0" />
            <p className="text-white text-xs flex-1 truncate">{url}</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 hover:text-white text-xs underline shrink-0"
            >
              Open tab
            </a>
            <button onClick={onClose} className="ml-2 text-white/70 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <iframe
            src={url}
            title="Link preview"
            className="flex-1 w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ── Main Chat component ───────────────────────────────────── */
export default function Chat() {
  const { user } = useAuth();
  const { socket, isConnected, onlineUsers } = useSocket();
  const { data: chats, isLoading: chatsLoading, refetch: refetchChats } = useGetChats();
  const [allUsers, setAllUsers]         = useState<any[]>([]);
  const [screen, setScreen]             = useState<Screen>("list");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [message, setMessage]           = useState("");
  const [search, setSearch]             = useState("");
  const [contactingAdmin, setContactingAdmin] = useState(false);
  const [previewUrl, setPreviewUrl]     = useState<string | null>(null);

  const { data: messages, isLoading: messagesLoading, refetch: refetchMessages } =
    useGetChatMessages(activeChatId || "", undefined, {
      query: { queryKey: getGetChatMessagesQueryKey(activeChatId || ""), enabled: !!activeChatId },
    });

  const sendMessageMutation = useSendMessage();
  const startChatMutation   = useStartDirectChat();
  const messagesEndRef      = useRef<HTMLDivElement>(null);

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

  const openChat = (chatId: string) => { setActiveChatId(chatId); setScreen("chat"); };
  const goBack   = () => { setScreen("list"); setActiveChatId(null); };

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
      c.type === "direct" && c.participants?.some((p: any) => p._id === userId)
    );
    if (existing) { openChat(existing._id!); return; }
    try {
      const chat = await startChatMutation.mutateAsync({ userId });
      await refetchChats();
      openChat((chat as any)._id);
    } catch {}
  };

  const handleContactAdmin = async () => {
    const existing = chats?.find(c =>
      c.type === "direct" && c.participants?.some((p: any) => p.role === "admin")
    );
    if (existing) { openChat(existing._id!); return; }
    setContactingAdmin(true);
    try {
      const token = localStorage.getItem("nutterx_token");
      const res = await fetch("/api/support/contact-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const chat = await res.json();
      await refetchChats();
      openChat(chat._id);
    } catch {
      alert("Could not reach support. Please try again.");
    } finally {
      setContactingAdmin(false);
    }
  };

  const getChatName     = (chat: any) => {
    if (chat.type === "group") return chat.name;
    const other = chat.participants?.find((p: any) => p._id !== user?._id);
    return other?.name || "Unknown";
  };
  const getChatAvatar   = (chat: any) => {
    if (chat.type === "group") return null;
    const other = chat.participants?.find((p: any) => p._id !== user?._id);
    return other?.name?.charAt(0).toUpperCase() || "?";
  };
  const getChatSubtitle = (chat: any) => {
    if (chat.type === "group") return `${chat.participants?.length || 0} members`;
    const other = chat.participants?.find((p: any) => p._id !== user?._id);
    return other?.role === "admin" ? "Support Team" : "Platform Member";
  };
  const isAdminChat  = (chat: any) =>
    chat.type === "direct" && chat.participants?.some((p: any) => p.role === "admin");
  const getChatOtherId = (chat: any) =>
    chat.participants?.find((p: any) => p._id !== user?._id)?._id;
  const isOnline = (userId?: string) => !!userId && onlineUsers.includes(userId);

  const sortedChats = chats
    ? [...chats].sort((a: any, b: any) => {
        if (isAdminChat(a) && !isAdminChat(b)) return -1;
        if (!isAdminChat(a) && isAdminChat(b)) return 1;
        return 0;
      })
    : [];

  const filteredUsers = allUsers.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const activeChat        = chats?.find(c => c._id === activeChatId);
  const activeChatOtherId = activeChat ? getChatOtherId(activeChat) : null;

  return (
    <div className="h-dvh flex flex-col pt-16">
      {/* Link preview modal */}
      {previewUrl && <LinkModal url={previewUrl} onClose={() => setPreviewUrl(null)} />}

      <div className="flex-1 relative overflow-hidden min-h-0">

        {/* ── LIST SCREEN ───────────────────────────────────────── */}
        <AnimatePresence>
          {screen === "list" && (
            <motion.div
              key="list"
              initial={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{ duration: 0.28, ease: "easeInOut" }}
              className="absolute inset-0 flex flex-col bg-background"
            >
              {/* List Header */}
              <div
                className="px-4 pt-4 pb-3 shrink-0 shadow-md"
                style={{ background: "#075E54" }}
              >
                <div className="flex items-center justify-between mb-3">
                  <h1 className="text-xl font-bold text-white tracking-tight">Messages</h1>
                  <div className={cn(
                    "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full",
                    isConnected
                      ? "bg-white/20 text-white"
                      : "bg-red-400/30 text-red-200"
                  )}>
                    <CircleDot className="w-3 h-3" />
                    {isConnected ? "Live" : "Offline"}
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search people..."
                    className="w-full pl-9 pr-4 h-9 rounded-full text-sm outline-none text-white placeholder-white/50"
                    style={{ background: "rgba(255,255,255,0.18)" }}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-background">
                {/* Conversations */}
                {!search && (
                  <div>
                    {chatsLoading ? (
                      <div className="p-8 flex justify-center">
                        <div className="w-6 h-6 border-2 border-[#25D366] border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : sortedChats.length > 0 ? (
                      <div>
                        <div className="px-4 pt-3 pb-1">
                          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                            Conversations
                          </span>
                        </div>
                        {sortedChats.map((chat, i) => {
                          const otherId = getChatOtherId(chat);
                          const online  = isOnline(otherId);
                          const pinned  = isAdminChat(chat) && user?.role !== "admin";
                          const lastMsg = (chat as any).lastMessage?.content || getChatSubtitle(chat);
                          return (
                            <motion.button
                              key={chat._id}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.04 }}
                              onClick={() => openChat(chat._id!)}
                              className="w-full px-4 py-3.5 flex items-center gap-3.5 hover:bg-[#25D366]/8 active:bg-[#25D366]/12 transition-colors text-left border-b border-border/40"
                            >
                              <div className="relative shrink-0">
                                <div
                                  className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-base overflow-hidden text-white"
                                  style={{ background: "linear-gradient(135deg,#075E54,#25D366)" }}
                                >
                                  {chat.type === "group" && (chat as any).avatar
                                    ? <img src={(chat as any).avatar} alt={getChatName(chat)} className="w-full h-full object-cover"
                                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                                    : chat.type === "group"
                                    ? <Users className="w-5 h-5" />
                                    : getChatAvatar(chat)}
                                </div>
                                {online && (
                                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-[#25D366] border-2 border-background rounded-full" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                  <span className="font-semibold text-sm truncate flex items-center gap-1.5">
                                    {getChatName(chat)}
                                    {pinned && <Pin className="w-3 h-3 text-[#25D366] shrink-0" />}
                                  </span>
                                  {(chat as any).lastMessage?.createdAt && (
                                    <span className="text-[10px] text-muted-foreground shrink-0" style={{ color: "#667781" }}>
                                      {formatTime((chat as any).lastMessage.createdAt)}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">{lastMsg}</div>
                              </div>
                              {(chat as any).unreadCount > 0 && (
                                <span className="shrink-0 min-w-[1.25rem] h-5 bg-[#25D366] rounded-full text-xs flex items-center justify-center font-bold text-white px-1">
                                  {(chat as any).unreadCount}
                                </span>
                              )}
                            </motion.button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-sm text-muted-foreground">
                        <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
                        No conversations yet
                      </div>
                    )}
                  </div>
                )}

                {/* People list */}
                {filteredUsers.length > 0 && (
                  <div>
                    <div className="px-4 pt-3 pb-1">
                      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                        {search ? `Results (${filteredUsers.length})` : "People"}
                      </span>
                    </div>
                    {filteredUsers.map((u, i) => (
                      <motion.button
                        key={u._id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        onClick={() => handleStartChat(u._id)}
                        className="w-full px-4 py-3.5 flex items-center gap-3.5 hover:bg-[#25D366]/8 transition-colors text-left border-b border-border/40"
                      >
                        <div className="relative shrink-0">
                          <div
                            className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm text-white"
                            style={{ background: "linear-gradient(135deg,#128C7E,#25D366)" }}
                          >
                            {u.name?.charAt(0).toUpperCase()}
                          </div>
                          {isOnline(u._id) && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#25D366] border-2 border-background rounded-full" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">{u.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {u.role === "admin" ? "Support Team" : "Platform Member"}
                          </div>
                        </div>
                        {u.role === "admin" && (
                          <span className="text-[10px] bg-[#25D366]/15 border border-[#25D366]/30 text-[#075E54] dark:text-[#25D366] px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 font-bold">
                            Admin
                          </span>
                        )}
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>

              {/* Contact Support */}
              {user?.role !== "admin" && (
                <div className="p-4 border-t border-border bg-background shrink-0">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleContactAdmin}
                    disabled={contactingAdmin}
                    className="w-full py-3.5 px-4 rounded-2xl text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition-all shadow-lg"
                    style={{ background: "linear-gradient(90deg,#075E54,#25D366)", boxShadow: "0 4px 18px rgba(37,211,102,0.25)" }}
                  >
                    <Headphones className="w-4 h-4" />
                    {contactingAdmin ? "Connecting..." : "Contact Support"}
                  </motion.button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── CHAT SCREEN ───────────────────────────────────────── */}
        <AnimatePresence>
          {screen === "chat" && activeChatId && (
            <motion.div
              key="chat"
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ duration: 0.28, ease: "easeInOut" }}
              className="absolute inset-0 flex flex-col"
            >
              {/* Chat Header — WhatsApp dark green */}
              <div
                className="h-16 flex items-center px-3 gap-3 shrink-0 shadow-md"
                style={{ background: "#075E54" }}
              >
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={goBack}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                  style={{ color: "white" }}
                >
                  <ArrowLeft className="w-5 h-5" />
                </motion.button>
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 relative overflow-hidden text-white"
                  style={{ background: "linear-gradient(135deg,#128C7E,#25D366)" }}
                >
                  {activeChat?.type === "group" && (activeChat as any).avatar
                    ? <img src={(activeChat as any).avatar} alt={getChatName(activeChat)} className="w-full h-full object-cover"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    : activeChat?.type === "group"
                    ? <Users className="w-4 h-4" />
                    : getChatAvatar(activeChat)}
                  {activeChatOtherId && isOnline(activeChatOtherId) && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#25D366] border-2 border-[#075E54] rounded-full" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-white truncate">
                    {activeChat ? getChatName(activeChat) : "Chat"}
                  </div>
                  <div className="text-xs flex items-center gap-1" style={{ color: "rgba(255,255,255,0.75)" }}>
                    {activeChat && getChatSubtitle(activeChat)}
                    {activeChatOtherId && isOnline(activeChatOtherId) && (
                      <span className="flex items-center gap-1" style={{ color: "#A8E6CF" }}>
                        · <span className="w-1.5 h-1.5 bg-[#A8E6CF] rounded-full animate-pulse inline-block" /> Online
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages area — WhatsApp wallpaper feel */}
              <div
                className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0"
                style={{ background: "var(--wa-bg, #E5DDD5)" }}
              >
                <style>{`
                  :root { --wa-bg: #E5DDD5; }
                  .dark { --wa-bg: #0D1B1E; }
                `}</style>

                {messagesLoading ? (
                  <div className="flex justify-center mt-10">
                    <div className="w-8 h-8 border-[3px] rounded-full animate-spin" style={{ borderColor: "#25D366", borderTopColor: "transparent" }} />
                  </div>
                ) : messages && messages.length > 0 ? (
                  <AnimatePresence initial={false}>
                    {messages.map((msg: any) => {
                      const isOwn = msg.sender?._id === user?._id;
                      return (
                        <motion.div
                          key={msg._id}
                          initial={{ opacity: 0, y: 6, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.16, type: "spring", stiffness: 340, damping: 30 }}
                          className={cn("flex", isOwn ? "justify-end" : "justify-start")}
                        >
                          <div className={cn("max-w-[78%] flex flex-col", isOwn ? "items-end" : "items-start")}>
                            {!isOwn && (
                              <span
                                className="text-xs mb-0.5 ml-3 font-semibold"
                                style={{ color: "#075E54" }}
                              >
                                {msg.sender?.name}
                              </span>
                            )}
                            <div
                              className="px-3.5 py-2 text-sm break-words leading-relaxed shadow-sm relative"
                              style={{
                                background: isOwn ? "#DCF8C6" : "#FFFFFF",
                                color: "#111",
                                borderRadius: isOwn
                                  ? "18px 18px 4px 18px"
                                  : "18px 18px 18px 4px",
                              }}
                            >
                              {renderContent(msg.content, setPreviewUrl)}
                            </div>
                            <span
                              className="text-[10px] mt-0.5 px-1"
                              style={{ color: "#667781" }}
                            >
                              {formatTime(msg.createdAt)}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center h-full py-20"
                    style={{ color: "#667781" }}
                  >
                    <motion.div
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
                    </motion.div>
                    <p className="text-sm font-medium">No messages yet. Say hello!</p>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input bar — WhatsApp style */}
              <div
                className="px-3 py-2.5 shrink-0 flex items-center gap-2"
                style={{ background: "#F0F2F5" }}
              >
                <form onSubmit={handleSend} className="flex-1 flex items-center gap-2">
                  <input
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Type a message"
                    autoComplete="off"
                    className="flex-1 rounded-full px-5 h-11 text-sm outline-none border-0"
                    style={{ background: "#FFFFFF", color: "#111", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
                  />
                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.92 }}
                    disabled={!message.trim() || sendMessageMutation.isPending}
                    className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 disabled:opacity-50 transition-all shadow-md"
                    style={{ background: message.trim() ? "#25D366" : "#B0BEC5" }}
                  >
                    <Send className="w-4 h-4 text-white ml-0.5" />
                  </motion.button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
