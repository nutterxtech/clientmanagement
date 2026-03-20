import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { useGetChats, useGetChatMessages, useSendMessage, useStartDirectChat, getGetChatsQueryKey, getGetChatMessagesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, User, CircleDot, MessageSquare, Headphones, ArrowLeft, Users, Pin, Search } from "lucide-react";
import { formatTime, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type Screen = "list" | "chat";

export default function Chat() {
  const { user } = useAuth();
  const { socket, isConnected, onlineUsers } = useSocket();
  const { data: chats, isLoading: chatsLoading, refetch: refetchChats } = useGetChats();
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [screen, setScreen] = useState<Screen>("list");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [contactingAdmin, setContactingAdmin] = useState(false);

  const { data: messages, isLoading: messagesLoading, refetch: refetchMessages } = useGetChatMessages(
    activeChatId || "",
    undefined,
    { query: { queryKey: getGetChatMessagesQueryKey(activeChatId || ""), enabled: !!activeChatId } }
  );

  const sendMessageMutation = useSendMessage();
  const startChatMutation = useStartDirectChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch all users
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

  const openChat = (chatId: string) => {
    setActiveChatId(chatId);
    setScreen("chat");
  };

  const goBack = () => {
    setScreen("list");
    setActiveChatId(null);
  };

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

  const getChatName = (chat: any) => {
    if (chat.type === "group") return chat.name;
    const other = chat.participants?.find((p: any) => p._id !== user?._id);
    return other?.name || "Unknown";
  };

  const getChatAvatar = (chat: any) => {
    if (chat.type === "group") return null;
    const other = chat.participants?.find((p: any) => p._id !== user?._id);
    return other?.name?.charAt(0).toUpperCase() || "?";
  };

  const getChatSubtitle = (chat: any) => {
    if (chat.type === "group") return `${chat.participants?.length || 0} members`;
    const other = chat.participants?.find((p: any) => p._id !== user?._id);
    return other?.role === "admin" ? "Support Team" : "Platform Member";
  };

  const isAdminChat = (chat: any) =>
    chat.type === "direct" && chat.participants?.some((p: any) => p.role === "admin");

  const getChatOtherId = (chat: any) => {
    const other = chat.participants?.find((p: any) => p._id !== user?._id);
    return other?._id;
  };

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

  const activeChat = chats?.find(c => c._id === activeChatId);
  const activeChatOtherId = activeChat ? getChatOtherId(activeChat) : null;

  return (
    <div className="h-dvh flex flex-col pt-16">
      <div className="flex-1 relative overflow-hidden min-h-0">

        {/* LIST SCREEN */}
        <AnimatePresence>
          {screen === "list" && (
            <motion.div
              key="list"
              initial={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{ duration: 0.28, ease: "easeInOut" }}
              className="absolute inset-0 flex flex-col bg-background"
            >
              {/* Header */}
              <div className="px-4 pt-4 pb-3 border-b border-border bg-card/60 backdrop-blur-md shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <h1 className="text-2xl font-bold">Messages</h1>
                  <div className={cn(
                    "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border",
                    isConnected
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                      : "bg-red-500/10 border-red-500/20 text-red-400"
                  )}>
                    <CircleDot className="w-3 h-3" />
                    {isConnected ? "Live" : "Offline"}
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search people..."
                    className="pl-9 bg-secondary/50 border-border h-9 text-sm rounded-full"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Conversations */}
                {!search && (
                  <div>
                    {chatsLoading ? (
                      <div className="p-8 flex justify-center">
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : sortedChats.length > 0 ? (
                      <div>
                        <div className="px-4 pt-4 pb-1">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Conversations</span>
                        </div>
                        {sortedChats.map((chat, i) => {
                          const otherId = getChatOtherId(chat);
                          const online = isOnline(otherId);
                          const pinned = isAdminChat(chat) && user?.role !== "admin";
                          const lastMsg = (chat as any).lastMessage?.content || getChatSubtitle(chat);
                          return (
                            <motion.button
                              key={chat._id}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.04 }}
                              onClick={() => openChat(chat._id!)}
                              className="w-full px-4 py-3.5 flex items-center gap-3.5 hover:bg-secondary/40 active:bg-secondary/60 transition-colors text-left border-b border-border/50"
                            >
                              <div className="relative shrink-0">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border border-border flex items-center justify-center font-bold text-base overflow-hidden">
                                  {chat.type === "group" && (chat as any).avatar
                                    ? <img src={(chat as any).avatar} alt={getChatName(chat)} className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display="none"; }} />
                                    : chat.type === "group"
                                    ? <Users className="w-5 h-5 text-blue-400" />
                                    : getChatAvatar(chat)}
                                </div>
                                {online && (
                                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-background rounded-full" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                  <span className="font-semibold text-sm truncate flex items-center gap-1.5">
                                    {getChatName(chat)}
                                    {pinned && <Pin className="w-3 h-3 text-primary shrink-0" />}
                                  </span>
                                  {(chat as any).lastMessage?.createdAt && (
                                    <span className="text-[10px] text-muted-foreground shrink-0">
                                      {formatTime((chat as any).lastMessage.createdAt)}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">{lastMsg}</div>
                              </div>
                              {(chat as any).unreadCount > 0 && (
                                <span className="shrink-0 w-5 h-5 bg-primary rounded-full text-xs flex items-center justify-center font-bold text-white">
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
                    <div className="px-4 pt-4 pb-1">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
                        className="w-full px-4 py-3 flex items-center gap-3.5 hover:bg-secondary/40 transition-colors text-left border-b border-border/50"
                      >
                        <div className="relative shrink-0">
                          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-border flex items-center justify-center font-bold text-sm">
                            {u.name?.charAt(0).toUpperCase()}
                          </div>
                          {isOnline(u._id) && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-background rounded-full" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">{u.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {u.role === "admin" ? "Support Team" : "Platform Member"}
                          </div>
                        </div>
                        {u.role === "admin" && (
                          <span className="text-[10px] bg-red-500/10 border border-red-500/20 text-red-400 px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">
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
                <div className="p-4 border-t border-border bg-card/60 backdrop-blur-md shrink-0">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleContactAdmin}
                    disabled={contactingAdmin}
                    className="w-full py-3 px-4 rounded-2xl bg-primary/10 border border-primary/20 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <Headphones className="w-4 h-4" />
                    {contactingAdmin ? "Connecting..." : "Contact Support"}
                  </motion.button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* CHAT SCREEN */}
        <AnimatePresence>
          {screen === "chat" && activeChatId && (
            <motion.div
              key="chat"
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ duration: 0.28, ease: "easeInOut" }}
              className="absolute inset-0 flex flex-col bg-background"
            >
              {/* Chat Header */}
              <div className="h-16 border-b border-border bg-card/80 backdrop-blur-md flex items-center px-4 gap-3 shrink-0">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={goBack}
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary/60 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </motion.button>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border border-border flex items-center justify-center font-bold text-sm shrink-0 relative overflow-hidden">
                  {activeChat?.type === "group" && (activeChat as any).avatar
                    ? <img src={(activeChat as any).avatar} alt={getChatName(activeChat)} className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display="none"; }} />
                    : activeChat?.type === "group"
                    ? <Users className="w-4 h-4 text-blue-400" />
                    : getChatAvatar(activeChat)}
                  {activeChatOtherId && isOnline(activeChatOtherId) && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-background rounded-full" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {activeChat ? getChatName(activeChat) : "Chat"}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    {activeChat && getChatSubtitle(activeChat)}
                    {activeChatOtherId && isOnline(activeChatOtherId) && (
                      <span className="text-emerald-400 flex items-center gap-1">
                        · <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse inline-block" /> Online
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
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
                          initial={{ opacity: 0, y: 8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.18, type: "spring", stiffness: 320, damping: 28 }}
                          className={cn("flex", isOwn ? "justify-end" : "justify-start")}
                        >
                          <div className={cn("max-w-[78%] flex flex-col", isOwn ? "items-end" : "items-start")}>
                            {!isOwn && (
                              <span className="text-xs text-muted-foreground mb-1 ml-2 font-medium">
                                {msg.sender?.name}
                              </span>
                            )}
                            <div className={cn(
                              "px-4 py-2.5 rounded-2xl text-sm shadow-sm break-words leading-relaxed",
                              isOwn
                                ? "bg-primary text-primary-foreground rounded-br-sm"
                                : "bg-secondary text-foreground rounded-bl-sm"
                            )}>
                              {msg.content}
                            </div>
                            <span className="text-[10px] text-muted-foreground mt-1 px-1">
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
                    className="flex flex-col items-center justify-center h-full text-muted-foreground py-20"
                  >
                    <motion.div
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <MessageSquare className="w-12 h-12 mb-3 opacity-20" />
                    </motion.div>
                    <p className="text-sm">No messages yet. Say hello!</p>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-3 bg-card/80 border-t border-border backdrop-blur-md shrink-0">
                <form onSubmit={handleSend} className="flex gap-2 items-center">
                  <Input
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-secondary/50 border-border rounded-full px-5 h-11"
                    autoComplete="off"
                  />
                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.92 }}
                    disabled={!message.trim() || sendMessageMutation.isPending}
                    className="w-11 h-11 rounded-full bg-primary flex items-center justify-center shrink-0 disabled:opacity-50 shadow-lg shadow-primary/30"
                  >
                    <Send className="w-4 h-4 text-primary-foreground ml-0.5" />
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
