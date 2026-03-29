import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import {
  useGetChats, useGetChatMessages, useSendMessage, useStartDirectChat,
  getGetChatsQueryKey, getGetChatMessagesQueryKey, getGetMeQueryKey,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import {
  Send, CircleDot, MessageSquare, Headphones, ArrowLeft,
  Users, Pin, Search, X, ExternalLink, Reply, Camera, Eye, EyeOff, UserCircle,
} from "lucide-react";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type Screen = "list" | "chat";

/* ── URL detector ──────────────────────────────────────────── */
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

function renderContent(text: string | undefined | null, onLink: (url: string) => void) {
  if (!text) return null;
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

type DragMode = "move" | "tl" | "tr" | "bl" | "br";
type CropState = { x: number; y: number; w: number; h: number };

/* ── Crop Modal ─────────────────────────────────────────────── */
function CropModal({ objectUrl, onSend, onCancel }: {
  objectUrl: string;
  onSend: (base64: string, mimeType: string, caption: string) => void;
  onCancel: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [nat, setNat]   = useState({ w: 0, h: 0 });
  const [disp, setDisp] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<CropState>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const [caption, setCaption] = useState("");
  const drag = useRef<{ mode: DragMode; sx: number; sy: number; sc: CropState } | null>(null);

  const onImgLoad = () => {
    if (!imgRef.current) return;
    setNat({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight });
    setDisp({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight });
  };

  const onMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!drag.current || !disp.w) return;
    const pt = "touches" in e ? e.touches[0]! : e;
    const dx = (pt.clientX - drag.current.sx) / disp.w;
    const dy = (pt.clientY - drag.current.sy) / disp.h;
    const sc = drag.current.sc;
    const MIN = 0.12;
    let { x, y, w, h } = sc;
    switch (drag.current.mode) {
      case "move":
        x = Math.max(0, Math.min(1 - w, sc.x + dx));
        y = Math.max(0, Math.min(1 - h, sc.y + dy));
        break;
      case "br":
        w = Math.max(MIN, Math.min(1 - sc.x, sc.w + dx));
        h = Math.max(MIN, Math.min(1 - sc.y, sc.h + dy));
        break;
      case "bl": {
        const nw = Math.max(MIN, Math.min(sc.x + sc.w, sc.w - dx));
        x = sc.x + (sc.w - nw); w = nw;
        h = Math.max(MIN, Math.min(1 - sc.y, sc.h + dy));
        break;
      }
      case "tr": {
        w = Math.max(MIN, Math.min(1 - sc.x, sc.w + dx));
        const nh = Math.max(MIN, Math.min(sc.y + sc.h, sc.h - dy));
        y = sc.y + (sc.h - nh); h = nh;
        break;
      }
      case "tl": {
        const nw = Math.max(MIN, Math.min(sc.x + sc.w, sc.w - dx));
        x = sc.x + (sc.w - nw); w = nw;
        const nh = Math.max(MIN, Math.min(sc.y + sc.h, sc.h - dy));
        y = sc.y + (sc.h - nh); h = nh;
        break;
      }
    }
    setCrop({ x, y, w, h });
  }, [disp]);

  const onUp = useCallback(() => { drag.current = null; }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, [onMove, onUp]);

  const startDrag = (mode: DragMode, e: React.MouseEvent | React.TouchEvent) => {
    const pt = "touches" in e ? e.touches[0]! : e;
    drag.current = { mode, sx: pt.clientX, sy: pt.clientY, sc: { ...crop } };
    e.preventDefault(); e.stopPropagation();
  };

  const handleSend = () => {
    if (!imgRef.current || !nat.w) return;
    const canvas = document.createElement("canvas");
    const sx = Math.round(crop.x * nat.w), sy = Math.round(crop.y * nat.h);
    const sw = Math.round(crop.w * nat.w), sh = Math.round(crop.h * nat.h);
    canvas.width = sw; canvas.height = sh;
    canvas.getContext("2d")!.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, sw, sh);
    onSend(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]!, "image/jpeg", caption.trim());
  };

  const corners: { mode: DragMode; style: React.CSSProperties }[] = [
    { mode: "tl", style: { top: -8, left: -8, cursor: "nw-resize" } },
    { mode: "tr", style: { top: -8, right: -8, cursor: "ne-resize" } },
    { mode: "bl", style: { bottom: -8, left: -8, cursor: "sw-resize" } },
    { mode: "br", style: { bottom: -8, right: -8, cursor: "se-resize" } },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[400] flex flex-col select-none"
      style={{ background: "rgba(0,0,0,0.95)" }}
    >
      <div className="flex items-center justify-between px-4 h-14 shrink-0" style={{ background: "#075E54" }}>
        <button onClick={onCancel} className="text-white p-1"><X className="w-5 h-5" /></button>
        <span className="text-white font-semibold text-sm">Drag corners to crop</span>
        <div className="w-7" />
      </div>

      <div className="flex-1 flex items-center justify-center overflow-hidden p-6">
        <div className="relative inline-block">
          <img ref={imgRef} src={objectUrl} onLoad={onImgLoad}
            className="block max-w-full max-h-[60vh] object-contain select-none"
            draggable={false} alt="crop preview" />

          {disp.w > 0 && (
            <>
              <div className="absolute pointer-events-none" style={{ inset: 0, top: 0, height: `${crop.y * 100}%`, background: "rgba(0,0,0,0.62)" }} />
              <div className="absolute pointer-events-none" style={{ inset: 0, top: `${(crop.y + crop.h) * 100}%`, height: `${(1 - crop.y - crop.h) * 100}%`, background: "rgba(0,0,0,0.62)" }} />
              <div className="absolute pointer-events-none" style={{ top: `${crop.y * 100}%`, left: 0, width: `${crop.x * 100}%`, height: `${crop.h * 100}%`, background: "rgba(0,0,0,0.62)" }} />
              <div className="absolute pointer-events-none" style={{ top: `${crop.y * 100}%`, left: `${(crop.x + crop.w) * 100}%`, right: 0, height: `${crop.h * 100}%`, background: "rgba(0,0,0,0.62)" }} />
            </>
          )}

          <div
            className="absolute border-2 border-white cursor-move"
            style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
            onMouseDown={e => startDrag("move", e)}
            onTouchStart={e => startDrag("move", e)}
          >
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)",
              backgroundSize: "33.33% 33.33%",
            }} />
            {corners.map(({ mode, style }) => (
              <div key={mode} className="absolute w-5 h-5 bg-white rounded-sm z-10"
                style={style}
                onMouseDown={e => startDrag(mode, e)}
                onTouchStart={e => startDrag(mode, e)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 px-4 pb-2" style={{ background: "#111" }}>
        <input
          type="text"
          value={caption}
          onChange={e => setCaption(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSend(); } }}
          placeholder="Add a caption…"
          maxLength={300}
          style={{ fontSize: 16 }}
          className="w-full bg-white/10 text-white placeholder:text-white/40 rounded-xl px-4 py-2.5 text-sm outline-none border border-white/10 focus:border-white/30"
        />
      </div>
      <div className="flex items-center justify-between px-6 py-3 shrink-0" style={{ background: "#111" }}>
        <button onClick={onCancel} className="text-white/60 text-sm font-medium">Cancel</button>
        <button onClick={handleSend}
          className="flex items-center gap-2 px-7 py-2.5 rounded-full text-white font-bold text-sm"
          style={{ background: "#25D366" }}
        >
          <Send className="w-4 h-4" />Send
        </button>
      </div>
    </motion.div>
  );
}

/* ── View-Once Fullscreen ───────────────────────────────────── */
function ViewOnceFullscreen({ imageData, mimeType, caption, isSender, onClose }: {
  imageData: string | null;
  mimeType: string;
  caption?: string | null;
  isSender: boolean;
  onClose: () => void;
}) {
  const src = imageData ? `data:${mimeType};base64,${imageData}` : null;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[400] flex flex-col"
      style={{ background: "rgba(0,0,0,0.97)" }}
    >
      <div className="flex items-center justify-between px-4 h-14 shrink-0" style={{ background: "#075E54" }}>
        <button onClick={onClose} className="text-white"><X className="w-5 h-5" /></button>
        <span className="text-white text-sm font-semibold">
          {isSender ? "Photo you sent (view once)" : "Viewed — deleted from servers"}
        </span>
        <div className="w-5" />
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        {src ? (
          <img src={src} alt="View once" className="max-w-full max-h-full object-contain rounded-lg" />
        ) : (
          <div className="text-center">
            <EyeOff className="w-14 h-14 mx-auto mb-3 text-white/20" />
            <p className="text-white/50 text-base">Photo unavailable</p>
            <p className="text-white/30 text-sm mt-1">Already viewed and permanently deleted</p>
          </div>
        )}
      </div>
      {caption && (
        <div className="px-6 pb-4 text-center shrink-0">
          <p className="text-white/90 text-sm font-medium leading-relaxed">{caption}</p>
        </div>
      )}
      {!isSender && src && (
        <div className="px-4 pb-6 text-center shrink-0">
          <p className="text-white/40 text-xs">This photo has been permanently deleted from our servers.</p>
        </div>
      )}
    </motion.div>
  );
}

/* ── Main Chat component ───────────────────────────────────── */
export default function Chat() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { socket, isConnected, onlineUsers } = useSocket();
  const { data: chats, isLoading: chatsLoading, refetch: refetchChats } = useGetChats();
  const [allUsers, setAllUsers]         = useState<any[]>([]);
  const [screen, setScreen]             = useState<Screen>("list");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [message, setMessage]           = useState("");
  const [search, setSearch]             = useState("");
  const [contactingAdmin, setContactingAdmin] = useState(false);
  const [previewUrl, setPreviewUrl]     = useState<string | null>(null);
  const [replyTo, setReplyTo]           = useState<{ id: string; content: string; senderName: string } | null>(null);
  const [swipeOffset, setSwipeOffset]   = useState<{ id: string; x: number } | null>(null);
  const swipeMeta = useRef<{ id: string; startX: number } | null>(null);
  const [optimisticMsgs, setOptimisticMsgs] = useState<any[]>([]);
  const [cropModal, setCropModal] = useState<{ objectUrl: string } | null>(null);
  const [viewOnceFs, setViewOnceFs] = useState<{ imageData: string | null; mimeType: string; caption?: string | null; isSender: boolean } | null>(null);
  const [sendingViewOnce, setSendingViewOnce] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileModal, setProfileModal] = useState(false);
  const [profileUrlInput, setProfileUrlInput] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const { data: messages, isLoading: messagesLoading, refetch: refetchMessages } =
    useGetChatMessages(activeChatId || "", undefined, {
      query: {
        queryKey: getGetChatMessagesQueryKey(activeChatId || ""),
        enabled: !!activeChatId,
        staleTime: 30_000,
      },
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

  useEffect(() => {
    if (!socket) return;
    const handler = () => { refetchMessages(); };
    socket.on("view_once_viewed", handler);
    return () => { socket.off("view_once_viewed", handler); };
  }, [socket, refetchMessages]);

  const openChat = (chatId: string) => {
    setOptimisticMsgs([]);
    setReplyTo(null);
    setActiveChatId(chatId);
    setScreen("chat");
  };
  const goBack = () => {
    setScreen("list");
    setActiveChatId(null);
    setReplyTo(null);
    setOptimisticMsgs([]);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !activeChatId) return;
    const content = message;
    const replyToId = replyTo?.id;
    const replySnapshot = replyTo;
    setMessage("");
    setReplyTo(null);

    // Add message optimistically so it appears immediately
    const tempId = `temp_${Date.now()}_${Math.random()}`;
    const optimistic = {
      _id: tempId,
      content,
      chatId: activeChatId,
      sender: { _id: user?._id, name: user?.name },
      createdAt: new Date().toISOString(),
      replyToId,
      replyTo: replySnapshot
        ? { sender: { name: replySnapshot.senderName }, content: replySnapshot.content }
        : undefined,
      _optimistic: true,
    };
    setOptimisticMsgs(prev => [...prev, optimistic]);

    try {
      await sendMessageMutation.mutateAsync({
        chatId: activeChatId,
        data: { content, replyToId } as any,
      });
      // Server confirmed — drop optimistic (socket will deliver the real message)
      setOptimisticMsgs(prev => prev.filter(m => m._id !== tempId));
      refetchMessages();
    } catch {
      setMessage(content);
      setOptimisticMsgs(prev => prev.filter(m => m._id !== tempId));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setCropModal({ objectUrl });
    e.target.value = "";
  };

  const handleCropSend = async (base64: string, mimeType: string, caption: string) => {
    if (!activeChatId) return;
    const objectUrl = cropModal?.objectUrl;
    setCropModal(null);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setSendingViewOnce(true);
    try {
      const token = localStorage.getItem("nutterx_token");
      const res = await fetch("/api/view-once", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chatId: activeChatId, imageData: base64, mimeType, caption: caption || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to send");
      }
      refetchMessages();
    } catch (e: any) {
      alert(e?.message || "Failed to send the photo. Please try again.");
    } finally {
      setSendingViewOnce(false);
    }
  };

  const handleViewOnce = async (imageId: string, isSenderCheck: boolean) => {
    try {
      const token = localStorage.getItem("nutterx_token");
      const res = await fetch(`/api/view-once/${imageId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 410 || res.status === 404) {
        // Already viewed or gone — refresh messages so bubble updates to "Opened"
        refetchMessages();
        setViewOnceFs({ imageData: null, mimeType: "image/jpeg", caption: null, isSender: isSenderCheck });
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setViewOnceFs({ imageData: data.imageData, mimeType: data.mimeType || "image/jpeg", caption: data.caption || null, isSender: data.isSender });
      // Refresh after viewing so bubble updates to "Opened" for this user
      if (!data.isSender) refetchMessages();
    } catch {
      alert("Could not load photo.");
    }
  };

  const handleMsgTouchStart = (msgId: string, e: React.TouchEvent) => {
    swipeMeta.current = { id: msgId, startX: e.touches[0]!.clientX };
  };
  const handleMsgTouchMove = (e: React.TouchEvent) => {
    if (!swipeMeta.current) return;
    const delta = Math.max(0, Math.min(72, e.touches[0]!.clientX - swipeMeta.current.startX));
    setSwipeOffset({ id: swipeMeta.current.id, x: delta });
  };
  const handleMsgTouchEnd = (msg: any) => {
    const offset = swipeOffset?.x ?? 0;
    if (offset > 52) {
      setReplyTo({
        id: msg._id,
        content: msg.content,
        senderName: msg.sender?.name || "Unknown",
      });
    }
    swipeMeta.current = null;
    setSwipeOffset(null);
  };

  const handleStartChat = async (userId: string) => {
    const existing = chats?.find(c =>
      c.type === "direct" && c.participants?.some((p: any) => p._id === userId)
    );
    if (existing) { openChat(existing._id!); return; }
    try {
      const chat = await startChatMutation.mutateAsync({ userId });
      // Open immediately — don't wait for the chat list to refresh
      openChat((chat as any)._id);
      refetchChats(); // refresh in background
    } catch {}
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const token = localStorage.getItem("nutterx_token");
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ avatar: profileUrlInput.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setProfileModal(false);
    } catch {
      alert("Could not save profile photo.");
    } finally {
      setSavingProfile(false);
    }
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
      openChat(chat._id); // open immediately
      refetchChats(); // refresh in background
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
        const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
        return bTime - aTime;
      })
    : [];

  const filteredUsers = allUsers.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const activeChat        = chats?.find(c => c._id === activeChatId);
  const activeChatOtherId = activeChat ? getChatOtherId(activeChat) : null;

  // Combine server messages with optimistic ones (deduplicate by content proximity)
  const allMessages = [
    ...(messages || []),
    ...optimisticMsgs.filter(
      om => om.chatId === activeChatId &&
        !(messages || []).some((m: any) => m.content === om.content && m.sender?._id === om.sender?._id)
    ),
  ];

  // Scroll to bottom when optimistic message added
  useEffect(() => {
    if (optimisticMsgs.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [optimisticMsgs]);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ paddingTop: 64 }}>
      {/* Link preview modal */}
      {previewUrl && <LinkModal url={previewUrl} onClose={() => setPreviewUrl(null)} />}

      {/* Crop modal */}
      <AnimatePresence>
        {cropModal && (
          <CropModal
            objectUrl={cropModal.objectUrl}
            onSend={handleCropSend}
            onCancel={() => { URL.revokeObjectURL(cropModal.objectUrl); setCropModal(null); }}
          />
        )}
      </AnimatePresence>

      {/* View-once fullscreen */}
      <AnimatePresence>
        {viewOnceFs && (
          <ViewOnceFullscreen
            imageData={viewOnceFs.imageData}
            mimeType={viewOnceFs.mimeType}
            caption={viewOnceFs.caption}
            isSender={viewOnceFs.isSender}
            onClose={() => setViewOnceFs(null)}
          />
        )}
      </AnimatePresence>

      <div className="flex-1 relative overflow-hidden min-h-0">

        {/* ── LIST SCREEN ───────────────────────────────────────── */}
        <AnimatePresence>
          {screen === "list" && (
            <motion.div
              key="list"
              initial={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{ duration: 0.16, ease: "easeInOut" }}
              className="absolute inset-0 flex flex-col bg-background"
            >
              {/* Profile photo modal */}
              <AnimatePresence>
                {profileModal && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 z-[300] flex items-end justify-center"
                    style={{ background: "rgba(0,0,0,0.6)" }}
                    onClick={() => setProfileModal(false)}
                  >
                    <motion.div
                      initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                      onClick={e => e.stopPropagation()}
                      className="w-full rounded-t-3xl p-6 flex flex-col gap-4"
                      style={{ background: "var(--background, #fff)" }}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full overflow-hidden shrink-0 border-2 border-[#25D366] flex items-center justify-center"
                          style={{ background: "linear-gradient(135deg,#128C7E,#25D366)" }}>
                          {profileUrlInput ? (
                            <img src={profileUrlInput} alt="preview" className="w-full h-full object-cover"
                              onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                          ) : (user as any)?.avatar ? (
                            <img src={(user as any).avatar} alt={user?.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-white text-2xl font-bold">{user?.name?.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-base">{user?.name}</p>
                          <p className="text-xs text-muted-foreground">{user?.email}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Profile photo URL</p>
                        <input
                          type="url"
                          value={profileUrlInput}
                          onChange={e => setProfileUrlInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleSaveProfile(); }}
                          placeholder="Paste image URL here…"
                          style={{ fontSize: 16 }}
                          className="w-full border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-[#25D366] transition-colors bg-background"
                        />
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => setProfileModal(false)}
                          className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold">
                          Cancel
                        </button>
                        <button onClick={handleSaveProfile} disabled={savingProfile}
                          className="flex-1 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-60"
                          style={{ background: "#25D366" }}>
                          {savingProfile ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* List Header */}
              <div
                className="px-4 pt-4 pb-3 shrink-0 shadow-md"
                style={{ background: "#075E54" }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => { setProfileUrlInput((user as any)?.avatar || ""); setProfileModal(true); }}
                      className="w-8 h-8 rounded-full overflow-hidden shrink-0 border-2 border-white/40 flex items-center justify-center"
                      style={{ background: "rgba(255,255,255,0.15)" }}
                      title="Set profile photo"
                    >
                      {(user as any)?.avatar ? (
                        <img src={(user as any).avatar} alt={user?.name} className="w-full h-full object-cover"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <span className="text-white text-xs font-bold">{user?.name?.charAt(0).toUpperCase()}</span>
                      )}
                    </button>
                    <h1 className="text-xl font-bold text-white tracking-tight">Messages</h1>
                  </div>
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
                          const lm = (chat as any).lastMessage;
                          const lastMsg = lm
                            ? lm.type === "view_once_image"
                              ? "📷 View once photo"
                              : lm.content || getChatSubtitle(chat)
                            : getChatSubtitle(chat);
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
                                    : (() => {
                                        const other = chat.participants?.find((p: any) => p._id !== user?._id);
                                        return other?.avatar
                                          ? <img src={other.avatar} alt={other.name} className="w-full h-full object-cover"
                                              onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                                          : getChatAvatar(chat);
                                      })()}
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
                            className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm text-white overflow-hidden"
                            style={{ background: "linear-gradient(135deg,#128C7E,#25D366)" }}
                          >
                            {u.avatar
                              ? <img src={u.avatar} alt={u.name} className="w-full h-full object-cover"
                                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                              : u.name?.charAt(0).toUpperCase()}
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
              transition={{ duration: 0.15, ease: "easeOut" }}
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
                    : activeChat
                    ? getChatAvatar(activeChat)
                    : "?"}
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

                {messagesLoading && !allMessages.length ? (
                  <div className="flex justify-center mt-10">
                    <div className="w-8 h-8 border-[3px] rounded-full animate-spin" style={{ borderColor: "#25D366", borderTopColor: "transparent" }} />
                  </div>
                ) : allMessages.length > 0 ? (
                  <AnimatePresence initial={false}>
                    {allMessages.map((msg: any) => {
                      const isOwn = msg.sender?._id === user?._id;
                      const msgSwipe = swipeOffset !== null && swipeOffset.id === msg._id ? swipeOffset.x : 0;
                      const isSwiping = swipeOffset !== null && swipeOffset.id === msg._id;
                      return (
                        <motion.div
                          key={msg._id}
                          initial={{ opacity: 0, y: 6, scale: 0.97 }}
                          animate={{ opacity: msg._optimistic ? 0.72 : 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.16, type: "spring", stiffness: 340, damping: 30 }}
                          className={cn("flex items-center gap-2 group", isOwn ? "justify-end" : "justify-start")}
                          onTouchStart={e => handleMsgTouchStart(msg._id, e)}
                          onTouchMove={handleMsgTouchMove}
                          onTouchEnd={() => handleMsgTouchEnd(msg)}
                        >
                          {/* Swipe reply icon — left side for own, right side for others */}
                          {isOwn && (
                            <div
                              className="shrink-0 flex items-center justify-center rounded-full transition-opacity"
                              style={{
                                width: 28, height: 28,
                                background: "#25D366",
                                opacity: Math.min(1, msgSwipe / 52),
                                transform: `scale(${Math.min(1, msgSwipe / 52)})`,
                              }}
                            >
                              <Reply className="w-3.5 h-3.5 text-white" />
                            </div>
                          )}

                          <div
                            className={cn("max-w-[78%] flex flex-col", isOwn ? "items-end" : "items-start")}
                            style={{
                              transform: `translateX(${isOwn ? -msgSwipe : msgSwipe}px)`,
                              transition: isSwiping ? "none" : "transform 0.25s cubic-bezier(0.25,0.46,0.45,0.94)",
                            }}
                          >
                            {!isOwn && (
                              <span className="text-xs mb-0.5 ml-3 font-semibold" style={{ color: "#075E54" }}>
                                {msg.sender?.name}
                              </span>
                            )}
                            <div
                              className="px-3.5 py-2 text-sm break-words leading-relaxed shadow-sm relative"
                              style={{
                                background: isOwn ? "#DCF8C6" : "#FFFFFF",
                                color: "#111",
                                borderRadius: isOwn ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                              }}
                            >
                              {/* Reply quote */}
                              {msg.replyTo && (
                                <div
                                  className="mb-1.5 px-2.5 py-1.5 rounded-lg text-xs border-l-[3px]"
                                  style={{
                                    borderColor: "#25D366",
                                    background: isOwn ? "rgba(0,0,0,0.06)" : "rgba(0,0,0,0.05)",
                                  }}
                                >
                                  <div className="font-semibold mb-0.5" style={{ color: "#075E54" }}>
                                    {msg.replyTo.sender?.name}
                                  </div>
                                  <div className="opacity-70 truncate">{msg.replyTo.content}</div>
                                </div>
                              )}
                              {msg.type === "view_once_image" ? (
                                <div className="flex flex-col gap-1">
                                  {msg.viewOnceViewed && !isOwn ? (
                                    /* Already viewed by this user */
                                    <div className="flex items-center gap-2.5 py-0.5 opacity-60 select-none">
                                      <div
                                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                                        style={{ background: "rgba(0,0,0,0.08)" }}
                                      >
                                        <EyeOff className="w-4 h-4" style={{ color: "#667781" }} />
                                      </div>
                                      <div className="text-left">
                                        <div className="text-xs font-semibold" style={{ color: "#667781" }}>
                                          Photo · Opened
                                        </div>
                                        <div className="text-[10px]" style={{ color: "#aaa" }}>
                                          You've already viewed this
                                        </div>
                                      </div>
                                    </div>
                                  ) : isOwn ? (
                                    /* Sender: non-tappable indicator */
                                    <div className="flex items-center gap-2.5 py-0.5 select-none">
                                      <div
                                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                                        style={{ background: "rgba(0,0,0,0.10)" }}
                                      >
                                        <Camera className="w-4 h-4" style={{ color: "#075E54" }} />
                                      </div>
                                      <div className="text-left">
                                        <div className="text-xs font-semibold" style={{ color: "#075E54" }}>
                                          Photo · View once
                                        </div>
                                        <div className="text-[10px]" style={{ color: "#667781" }}>
                                          Sent
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    /* Recipient: tappable */
                                    <button
                                      onClick={() => handleViewOnce(msg.content, false)}
                                      className="flex items-center gap-2.5 py-0.5 select-none"
                                    >
                                      <div
                                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                                        style={{ background: "rgba(7,94,84,0.12)" }}
                                      >
                                        <Eye className="w-4 h-4" style={{ color: "#075E54" }} />
                                      </div>
                                      <div className="text-left">
                                        <div className="text-xs font-semibold" style={{ color: "#075E54" }}>
                                          Photo · Tap to view
                                        </div>
                                        <div className="text-[10px]" style={{ color: "#667781" }}>
                                          Once viewed, it's gone
                                        </div>
                                      </div>
                                    </button>
                                  )}
                                  {msg.viewOnceCaption && (
                                    <p className="text-xs leading-snug mt-0.5" style={{ color: "#111" }}>
                                      {msg.viewOnceCaption}
                                    </p>
                                  )}
                                </div>
                              ) : renderContent(msg.content, setPreviewUrl)}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 px-1">
                              <span className="text-[10px]" style={{ color: "#667781" }}>
                                {formatTime(msg.createdAt)}
                              </span>
                              {/* Desktop reply button (hover) */}
                              <button
                                onClick={() => setReplyTo({ id: msg._id, content: msg.content, senderName: msg.sender?.name || "Unknown" })}
                                className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full opacity-60 hover:opacity-100 transition-opacity"
                                style={{ background: "rgba(0,0,0,0.12)" }}
                                title="Reply"
                              >
                                <Reply className="w-3 h-3" style={{ color: "#667781" }} />
                              </button>
                            </div>
                          </div>

                          {/* Swipe reply icon — right side for others */}
                          {!isOwn && (
                            <div
                              className="shrink-0 flex items-center justify-center rounded-full"
                              style={{
                                width: 28, height: 28,
                                background: "#25D366",
                                opacity: Math.min(1, msgSwipe / 52),
                                transform: `scale(${Math.min(1, msgSwipe / 52)})`,
                              }}
                            >
                              <Reply className="w-3.5 h-3.5 text-white" />
                            </div>
                          )}
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

              {/* Reply preview bar */}
              <AnimatePresence>
                {replyTo && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden shrink-0"
                    style={{ background: "#F0F2F5" }}
                  >
                    <div className="flex items-center gap-3 px-4 py-2 border-t-2" style={{ borderColor: "#25D366" }}>
                      <Reply className="w-4 h-4 shrink-0" style={{ color: "#25D366" }} />
                      <div className="flex-1 min-w-0 border-l-2 pl-2" style={{ borderColor: "#25D366" }}>
                        <div className="text-xs font-semibold truncate" style={{ color: "#075E54" }}>
                          {replyTo.senderName}
                        </div>
                        <div className="text-xs truncate" style={{ color: "#667781" }}>
                          {replyTo.content}
                        </div>
                      </div>
                      <button
                        onClick={() => setReplyTo(null)}
                        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" style={{ color: "#667781" }} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Input bar — WhatsApp style */}
              <div
                className="px-3 py-2.5 shrink-0 flex items-center gap-2"
                style={{ background: "#F0F2F5" }}
              >
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                {/* Camera button */}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  disabled={sendingViewOnce}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all"
                  style={{ background: sendingViewOnce ? "#B0BEC5" : "#128C7E" }}
                  title="Send a view-once photo"
                >
                  {sendingViewOnce
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Camera className="w-5 h-5 text-white" />
                  }
                </motion.button>
                <form onSubmit={handleSend} className="flex-1 flex items-center gap-2">
                  <input
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Type a message"
                    autoComplete="off"
                    className="flex-1 rounded-full px-5 h-11 outline-none border-0"
                    style={{ background: "#FFFFFF", color: "#111", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", fontSize: 16 }}
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
