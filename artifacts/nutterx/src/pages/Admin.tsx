import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAdminGetUsers, useAdminGetRequests, useAdminUpdateRequest, useAdminGetSubscriptions } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CountdownTimer } from "@/components/shared/CountdownTimer";
import { formatDate } from "@/lib/utils";
import {
  Users, FileText, Activity, ShieldAlert, Lock, Eye, EyeOff,
  AlertCircle, ImageDown, UserPlus, Calendar, CheckCircle2, X,
  Settings, Key, Save, Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const TABS = [
  { id: "requests",      label: "Requests",   icon: FileText },
  { id: "users",         label: "Users",      icon: Users },
  { id: "subscriptions", label: "Deadlines",  icon: Activity },
  { id: "adduser",       label: "Add User",   icon: UserPlus },
  { id: "settings",      label: "Settings",   icon: Settings },
] as const;

type Tab = typeof TABS[number]["id"];

// ── Admin Login Gate ────────────────────────────────────────
function AdminLoginGate({ onSuccess }: { onSuccess: (token: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Access denied"); return; }
      onSuccess(data.token);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.45, type: "spring", stiffness: 200, damping: 22 }}
        className="w-full max-w-md"
      >
        <div className="bg-card border border-border rounded-3xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <motion.div
              animate={{ rotate: [0, -6, 6, -6, 0] }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4"
            >
              <ShieldAlert className="w-8 h-8 text-red-400" />
            </motion.div>
            <h1 className="text-2xl font-bold">Admin Access</h1>
            <p className="text-sm text-muted-foreground mt-1 text-center">Restricted area — enter admin credentials</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Admin Username</label>
              <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter admin username" className="h-11" autoComplete="username" required />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Admin Key</label>
              <div className="relative">
                <Input value={password} onChange={e => setPassword(e.target.value)} type={showPass ? "text" : "password"} placeholder="Enter admin key" className="h-11 pr-10" autoComplete="current-password" required />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />{error}
                </motion.div>
              )}
            </AnimatePresence>
            <Button type="submit" variant="gradient" className="w-full h-11 mt-2" disabled={loading}>
              {loading
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Authenticating...</>
                : <><Lock className="w-4 h-4 mr-2" />Access Dashboard</>}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

// ── Deadline / Payment Modal ─────────────────────────────────
function ManageModal({ request, onClose, onSave }: { request: any; onClose: () => void; onSave: (id: string, data: any) => void }) {
  const [deadline, setDeadline] = useState(
    request.subscriptionEndsAt ? new Date(request.subscriptionEndsAt).toISOString().split("T")[0] : ""
  );
  const [status, setStatus] = useState(request.status);
  const [notes, setNotes] = useState(request.adminNotes || "");
  const [paymentRequired, setPaymentRequired] = useState(request.paymentRequired || false);
  const [paymentAmount, setPaymentAmount] = useState(request.paymentAmount?.toString() || "");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-card border border-border rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-md shadow-2xl"
      >
        <div className="flex justify-center mb-4 sm:hidden"><div className="w-10 h-1 rounded-full bg-border" /></div>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold">Manage Request</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-secondary flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div className="p-3 bg-secondary/40 rounded-xl border border-border">
            <div className="font-semibold text-sm">{request.serviceName}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{request.user?.name} — {request.user?.email}</div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50">
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Service Deadline
            </label>
            <Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="h-10" min={new Date().toISOString().split("T")[0]} />
          </div>

          <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Require Payment</span>
              <button
                type="button"
                onClick={() => setPaymentRequired(!paymentRequired)}
                className={`relative w-11 h-6 rounded-full transition-colors ${paymentRequired ? "bg-emerald-500" : "bg-border"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${paymentRequired ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
            {paymentRequired && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Amount (KES)</label>
                <Input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                  placeholder="e.g. 5000" className="h-10" min="1" />
                <p className="text-xs text-muted-foreground mt-1">User will see a Pay button and be prompted for M-Pesa PIN</p>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Admin Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notes visible to user..."
              className="w-full bg-secondary/50 border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary/50" />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1 h-10" onClick={onClose}>Cancel</Button>
            <Button variant="gradient" className="flex-1 h-10" onClick={() => {
              onSave(request._id, {
                status, adminNotes: notes, paymentRequired,
                ...(paymentAmount && paymentRequired ? { paymentAmount: Number(paymentAmount) } : {}),
                ...(deadline ? { subscriptionEndsAt: new Date(deadline).toISOString() } : {}),
              });
              onClose();
            }}>
              <CheckCircle2 className="w-4 h-4 mr-2" /> Save
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Add User Form ────────────────────────────────────────────
function AddUserForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess(""); setLoading(true);
    try {
      const token = localStorage.getItem("nutterx_token");
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Failed to create user"); return; }
      setSuccess(`User "${data.name}" created — they can log in with ${email}`);
      setName(""); setEmail(""); setPassword("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
      <h2 className="text-lg font-bold mb-5">Create New User</h2>
      <div className="max-w-md space-y-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Full Name</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" className="h-11" required />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Email (Login)</label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" className="h-11" required />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Password</label>
          <div className="relative">
            <Input type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Min 6 characters" className="h-11 pr-10" minLength={6} required />
            <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </motion.div>
          )}
          {success && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
              <CheckCircle2 className="w-4 h-4 shrink-0" />{success}
            </motion.div>
          )}
        </AnimatePresence>
        <Button onClick={handleSubmit as any} variant="gradient" className="w-full h-11" disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : <><UserPlus className="w-4 h-4 mr-2" />Create User</>}
        </Button>
      </div>
    </motion.div>
  );
}

// ── Settings Form ────────────────────────────────────────────
function SettingsForm() {
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [sandbox, setSandbox] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("nutterx_token");
    fetch("/api/admin/settings", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (data.pesapal_consumer_key) setConsumerKey(data.pesapal_consumer_key);
        if (data.pesapal_consumer_secret) setConsumerSecret(data.pesapal_consumer_secret);
        setSandbox(data.pesapal_sandbox === "true");
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, []);

  const handleSave = async () => {
    setError(""); setSaved(false); setLoading(true);
    try {
      const token = localStorage.getItem("nutterx_token");
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          pesapal_consumer_key: consumerKey,
          pesapal_consumer_secret: consumerSecret,
          pesapal_sandbox: String(sandbox),
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save settings. Try again.");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  }

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Key className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Payment Gateway</h2>
          <p className="text-xs text-muted-foreground">Pesapal (M-Pesa STK Push) credentials</p>
        </div>
      </div>

      <div className="max-w-md space-y-4">
        <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl text-xs text-amber-400 leading-relaxed">
          Get your Consumer Key and Secret from your Pesapal merchant dashboard at <span className="font-semibold">pay.pesapal.com</span>. These credentials enable M-Pesa STK push payments for your clients.
        </div>

        <div className="flex items-center justify-between p-4 bg-card border border-border rounded-xl">
          <div>
            <p className="text-sm font-semibold">Sandbox / Test Mode</p>
            <p className="text-xs text-muted-foreground mt-0.5">Use Pesapal's test environment. Disable for live payments.</p>
          </div>
          <button
            type="button"
            onClick={() => setSandbox(v => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${sandbox ? "bg-primary" : "bg-muted"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${sandbox ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Consumer Key</label>
          <Input value={consumerKey} onChange={e => setConsumerKey(e.target.value)} placeholder="Pesapal Consumer Key" className="h-11 font-mono text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Consumer Secret</label>
          <div className="relative">
            <Input type={showSecret ? "text" : "password"} value={consumerSecret} onChange={e => setConsumerSecret(e.target.value)}
              placeholder="Pesapal Consumer Secret" className="h-11 font-mono text-sm pr-10" />
            <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </motion.div>
          )}
          {saved && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
              <CheckCircle2 className="w-4 h-4 shrink-0" />Settings saved — Pesapal is active
            </motion.div>
          )}
        </AnimatePresence>

        <Button onClick={handleSave} variant="gradient" className="w-full h-11" disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save Credentials</>}
        </Button>
      </div>
    </motion.div>
  );
}

// ── PNG Export ───────────────────────────────────────────────
async function exportAsPNG(requests: any[], users: any[]) {
  const W = 1200, ROW = 52, HEADER = 180, PAD = 40;
  const H = HEADER + PAD + requests.length * ROW + PAD + 60;

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = Math.max(H, 500);
  const ctx = canvas.getContext("2d")!;

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b1120");
  bg.addColorStop(1, "#0d1b3e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Top accent bar
  const accent = ctx.createLinearGradient(0, 0, W, 0);
  accent.addColorStop(0, "#3b82f6");
  accent.addColorStop(0.5, "#6366f1");
  accent.addColorStop(1, "#8b5cf6");
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 5);

  // Logo box
  const logoGrad = ctx.createLinearGradient(PAD, 30, PAD + 56, 86);
  logoGrad.addColorStop(0, "#3b82f6");
  logoGrad.addColorStop(1, "#6366f1");
  ctx.fillStyle = logoGrad;
  ctx.roundRect(PAD, 30, 56, 56, 12);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("N", PAD + 28, 69);

  // Title
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText("Nutterx Technologies", PAD + 70, 56);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "14px sans-serif";
  ctx.fillText("Client Services Report  ·  " + new Date().toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric" }), PAD + 70, 78);

  // Stats strip
  const stats = [
    { label: "Total Clients", value: users.length, color: "#60a5fa" },
    { label: "Requests",      value: requests.length, color: "#a78bfa" },
    { label: "Completed",     value: requests.filter((r: any) => r.status === "completed").length, color: "#34d399" },
    { label: "In Progress",   value: requests.filter((r: any) => r.status === "in_progress").length, color: "#fbbf24" },
  ];
  stats.forEach((s, i) => {
    const x = PAD + i * 260;
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.roundRect(x, 112, 240, 48, 10);
    ctx.fill();
    ctx.fillStyle = s.color;
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(String(s.value), x + 16, 141);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    ctx.fillText(s.label, x + 16 + (String(s.value).length * 14), 141);
  });

  // Table header
  const TY = HEADER + PAD;
  ctx.fillStyle = "rgba(59,130,246,0.12)";
  ctx.roundRect(PAD, TY, W - PAD * 2, 36, 8);
  ctx.fill();
  const cols = [["Client", PAD + 16], ["Email", PAD + 230], ["Service", PAD + 460], ["Status", PAD + 700], ["Payment", PAD + 860], ["Deadline", PAD + 1020]];
  ctx.fillStyle = "#7dd3fc";
  ctx.font = "bold 12px sans-serif";
  for (const [label, x] of cols) ctx.fillText(label as string, x as number, TY + 22);

  // Rows
  requests.forEach((req: any, i: number) => {
    const y = TY + 36 + i * ROW;
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      ctx.fillRect(PAD, y, W - PAD * 2, ROW);
    }
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "13px sans-serif";
    const user = req.user as any;
    const truncate = (s: string, n: number) => s?.length > n ? s.slice(0, n) + "…" : s;
    ctx.fillText(truncate(user?.name || "—", 18), PAD + 16, y + 20);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px sans-serif";
    ctx.fillText(truncate(user?.email || "—", 26), PAD + 230, y + 20);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "13px sans-serif";
    ctx.fillText(truncate(req.serviceName, 22), PAD + 460, y + 20);

    const statusColor: Record<string, string> = { completed: "#34d399", in_progress: "#60a5fa", pending: "#fbbf24", cancelled: "#f87171" };
    ctx.fillStyle = statusColor[req.status] || "#94a3b8";
    ctx.fillText(req.status?.replace("_", " ") || "—", PAD + 700, y + 20);

    ctx.fillStyle = req.paymentStatus === "paid" ? "#34d399" : req.paymentRequired ? "#fbbf24" : "#475569";
    ctx.fillText(req.paymentRequired ? (req.paymentStatus === "paid" ? `Paid KES ${req.paymentAmount}` : `Due KES ${req.paymentAmount}`) : "N/A", PAD + 860, y + 20);

    ctx.fillStyle = "#94a3b8";
    ctx.fillText(req.subscriptionEndsAt ? new Date(req.subscriptionEndsAt).toLocaleDateString("en-KE") : "—", PAD + 1020, y + 20);

    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, y + ROW); ctx.lineTo(W - PAD, y + ROW); ctx.stroke();
  });

  // Footer
  const FY = canvas.height - 35;
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(0, FY - 10, W, 45);
  ctx.fillStyle = "#475569";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Generated by Nutterx Technologies · Confidential", W / 2, FY + 12);

  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `nutterx-report-${Date.now()}.png`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }, "image/png");
}

// ── Main Admin Component ─────────────────────────────────────
export default function Admin() {
  const { user, login } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("requests");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingRequest, setEditingRequest] = useState<any>(null);
  const [, navigate] = useLocation();

  const isAdminUrl = new URLSearchParams(window.location.search).get("admin") === "true";
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isAdmin && !isAdminUrl) {
      navigate("/");
    }
  }, [isAdmin, isAdminUrl]);

  const { data: requests, isLoading: reqLoading } = useAdminGetRequests({ query: { enabled: isAdmin } });
  const { data: users, isLoading: usersLoading } = useAdminGetUsers({ query: { enabled: isAdmin } });
  const { data: subscriptions } = useAdminGetSubscriptions({ query: { enabled: isAdmin } });
  const updateRequestMutation = useAdminUpdateRequest();

  const handleAdminLoginSuccess = (token: string) => { login(token); };

  const handleUpdateRequest = async (id: string, data: any) => {
    try {
      await updateRequestMutation.mutateAsync({ id, data });
      toast({ title: "Request updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscriptions"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const handleExport = () => {
    if (!requests || !users) return;
    exportAsPNG(requests as any[], users as any[]);
  };

  if (!isAdmin && isAdminUrl) {
    return <AdminLoginGate onSuccess={handleAdminLoginSuccess} />;
  }

  if (!isAdmin) return null;

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.4 }}
      className="min-h-screen pt-16 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-xs text-muted-foreground">Nutterx Technologies — Internal</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleExport} className="gap-2 h-9 self-start sm:self-auto">
            <ImageDown className="w-4 h-4" /> Export Report
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1.5 mb-6 bg-secondary/30 p-1.5 rounded-2xl w-fit border border-border">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content panel */}
        <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 min-h-[500px]">
          <AnimatePresence mode="wait">

            {/* REQUESTS */}
            {activeTab === "requests" && (
              <motion.div key="requests" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold">Service Requests</h2>
                  <span className="text-sm text-muted-foreground">{requests?.length || 0} total</span>
                </div>
                {reqLoading ? (
                  <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
                ) : !requests?.length ? (
                  <p className="text-center text-muted-foreground py-12">No service requests yet.</p>
                ) : (
                  <div className="space-y-2.5">
                    {requests.map((req, i) => (
                      <motion.div key={req._id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                        className="p-4 bg-secondary/30 rounded-xl border border-border flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-secondary/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm">{req.serviceName}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{req.user?.name} · {req.user?.email} · {formatDate(req.createdAt!)}</div>
                          {req.adminNotes && (
                            <div className="text-xs text-primary/80 mt-1.5 bg-primary/5 rounded-lg px-2.5 py-1.5 border border-primary/10">{req.adminNotes}</div>
                          )}
                          {(req as any).paymentRequired && (
                            <div className={`text-xs mt-1.5 inline-flex items-center gap-1 px-2 py-1 rounded-full border ${(req as any).paymentStatus === "paid" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-amber-400 bg-amber-500/10 border-amber-500/20"}`}>
                              {(req as any).paymentStatus === "paid" ? "✓ Paid" : `⏳ Awaiting KES ${(req as any).paymentAmount}`}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                          <StatusBadge status={req.status || "pending"} />
                          {req.subscriptionEndsAt && <CountdownTimer endsAt={req.subscriptionEndsAt} compact />}
                          <button onClick={() => setEditingRequest(req)}
                            className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/20 transition-colors flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" /> Manage
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* USERS */}
            {activeTab === "users" && (
              <motion.div key="users" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold">Registered Users</h2>
                  <span className="text-sm text-muted-foreground">{users?.length || 0} users</span>
                </div>
                {usersLoading ? (
                  <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {users?.map(u => (
                      <div key={u._id} className="p-4 bg-secondary/30 rounded-xl border border-border flex items-center gap-3 hover:bg-secondary/50 transition-colors">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/30 to-purple-600/30 border border-indigo-500/20 flex items-center justify-center font-bold text-base shrink-0 text-indigo-300">
                          {u.name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{u.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                        </div>
                      </div>
                    ))}
                    {!users?.length && <p className="text-muted-foreground col-span-3 text-center py-8">No users yet.</p>}
                  </div>
                )}
              </motion.div>
            )}

            {/* SUBSCRIPTIONS */}
            {activeTab === "subscriptions" && (
              <motion.div key="subscriptions" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
                <h2 className="text-lg font-bold mb-5">Active Deadlines</h2>
                <div className="space-y-3">
                  {subscriptions?.map(sub => (
                    <div key={sub._id} className="p-4 bg-gradient-to-r from-blue-900/20 to-transparent rounded-xl border border-blue-500/20 flex justify-between items-center flex-wrap gap-3">
                      <div>
                        <div className="font-bold">{sub.serviceName}</div>
                        <div className="text-xs text-blue-300 mt-0.5">Client: {(sub.user as any)?.name}</div>
                        <div className="mt-2"><StatusBadge status={sub.status || "in_progress"} /></div>
                      </div>
                      <CountdownTimer endsAt={sub.subscriptionEndsAt!} compact />
                    </div>
                  ))}
                  {(!subscriptions?.length) && <p className="text-muted-foreground text-center py-12">No active deadlines set.</p>}
                </div>
              </motion.div>
            )}

            {/* ADD USER */}
            {activeTab === "adduser" && <AddUserForm key="adduser" />}

            {/* SETTINGS */}
            {activeTab === "settings" && <SettingsForm key="settings" />}

          </AnimatePresence>
        </div>
      </div>

      {/* Manage Modal */}
      <AnimatePresence>
        {editingRequest && (
          <ManageModal request={editingRequest} onClose={() => setEditingRequest(null)} onSave={handleUpdateRequest} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
