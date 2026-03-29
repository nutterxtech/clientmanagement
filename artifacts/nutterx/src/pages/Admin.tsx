import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAdminGetUsers, useAdminGetRequests, useAdminUpdateRequest, useAdminGetSubscriptions, getAdminGetUsersQueryKey, getAdminGetRequestsQueryKey, getAdminGetSubscriptionsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CountdownTimer } from "@/components/shared/CountdownTimer";
import { formatDate } from "@/lib/utils";
import {
  Users, FileText, Activity, ShieldAlert, Lock, Eye, EyeOff,
  AlertCircle, ImageDown, UserPlus, Calendar, CheckCircle2, X,
  Settings, Key, Save, Loader2, Trash2, Plus, Edit2, Package,
  CreditCard, TrendingUp, DollarSign, Clock, Star, MessagesSquare,
  Image, UserCheck, UserX, CalendarDays, CalendarClock, RefreshCw, Banknote,
  ThumbsUp, ThumbsDown, MessageSquare
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
  { id: "requests",   label: "Requests",  icon: FileText },
  { id: "users",      label: "Users",     icon: Users },
  { id: "groups",     label: "Groups",    icon: MessagesSquare },
  { id: "deadlines",  label: "Deadlines", icon: Activity },
  { id: "services",   label: "Services",  icon: Package },
  { id: "payments",   label: "Revenue",   icon: CreditCard },
  { id: "adduser",    label: "Add User",  icon: UserPlus },
  { id: "settings",   label: "Settings",  icon: Settings },
] as const;
type Tab = typeof TABS[number]["id"];

const ICON_OPTIONS = ["MessageSquare", "Globe", "TrendingUp", "Send", "ShoppingCart", "Bot", "Zap", "Share2"];
const CATEGORY_OPTIONS = ["Automation", "Marketing", "Development", "General", "E-commerce"];

// ── Admin Login Gate ─────────────────────────────────────────
function AdminLoginGate({ onSuccess }: { onSuccess: (token: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Access denied"); return; }
      onSuccess(data.token);
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.45, type: "spring", stiffness: 200, damping: 22 }} className="w-full max-w-md">
        <div className="bg-card border border-border rounded-3xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <motion.div animate={{ rotate: [0, -6, 6, -6, 0] }} transition={{ delay: 0.5, duration: 0.6 }}
              className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4">
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
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Authenticating...</> : <><Lock className="w-4 h-4 mr-2" />Access Dashboard</>}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

// ── Manage Request Modal ──────────────────────────────────────
function ManageModal({ request, onClose, onSave }: { request: any; onClose: () => void; onSave: (id: string, data: any) => void }) {
  const [deadline, setDeadline] = useState(request.subscriptionEndsAt ? new Date(request.subscriptionEndsAt).toISOString().split("T")[0] : "");
  const [status, setStatus] = useState(request.status);
  const [notes, setNotes] = useState(request.adminNotes || "");
  const [paymentRequired, setPaymentRequired] = useState(request.paymentRequired || false);
  const [paymentAmount, setPaymentAmount] = useState(request.paymentAmount?.toString() || "");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-card border border-border rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-md shadow-2xl">
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
              <button type="button" onClick={() => setPaymentRequired(!paymentRequired)}
                className={`relative w-11 h-6 rounded-full transition-colors ${paymentRequired ? "bg-emerald-500" : "bg-border"}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${paymentRequired ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
            {paymentRequired && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Amount (KES)</label>
                <Input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="e.g. 5000" className="h-10" min="1" />
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

// ── Services Manager ──────────────────────────────────────────
function ServiceForm({ service, onSave, onCancel }: { service?: any; onSave: (data: any) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(service?.title || "");
  const [description, setDescription] = useState(service?.description || "");
  const [price, setPrice] = useState(service?.price?.toString() || "");
  const [category, setCategory] = useState(service?.category || "General");
  const [icon, setIcon] = useState(service?.icon || "Zap");
  const [popular, setPopular] = useState(service?.popular || false);
  const [featuresText, setFeaturesText] = useState((service?.features || []).join("\n"));

  const handleSave = () => {
    if (!title.trim() || !description.trim()) return;
    const features = featuresText.split("\n").map((f: string) => f.trim()).filter(Boolean);
    onSave({ title: title.trim(), description: description.trim(), price: price ? Number(price) : undefined, category, icon, popular, features });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="bg-secondary/20 border border-border rounded-2xl p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Service Title *</label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. WhatsApp Bot Setup" className="h-10" />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Price (KES)</label>
          <Input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 15000" className="h-10" />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 h-10">
            {CATEGORY_OPTIONS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Icon</label>
          <select value={icon} onChange={e => setIcon(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 h-10">
            {ICON_OPTIONS.map(ic => <option key={ic}>{ic}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Description *</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
          placeholder="Brief description of the service..."
          className="w-full bg-secondary/50 border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary/50" />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Features (one per line)</label>
        <textarea value={featuresText} onChange={e => setFeaturesText(e.target.value)} rows={3}
          placeholder={"Custom bot flows\n24/7 auto-replies\nAnalytics dashboard"}
          className="w-full bg-secondary/50 border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary/50 font-mono" />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setPopular((v: boolean) => !v)} className={`relative w-11 h-6 rounded-full transition-colors ${popular ? "bg-primary" : "bg-border"}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${popular ? "translate-x-5" : "translate-x-0"}`} />
          </button>
          <span className="text-sm font-medium flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-primary" /> Mark as Popular
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" className="h-9 px-4" onClick={onCancel}>Cancel</Button>
          <Button variant="gradient" className="h-9 px-5" onClick={handleSave} disabled={!title.trim() || !description.trim()}>
            <Save className="w-4 h-4 mr-1.5" /> {service ? "Update" : "Create"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function ServicesManager() {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const token = () => localStorage.getItem("nutterx_token");

  const loadServices = () => {
    fetch("/api/services").then(r => r.json()).then(data => { setServices(Array.isArray(data) ? data : []); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { loadServices(); }, []);

  const handleAdd = async (data: any) => {
    setSaving(true);
    try {
      const res = await fetch("/api/services", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error();
      setShowAddForm(false);
      toast({ title: "Service created" });
      loadServices();
    } catch { toast({ variant: "destructive", title: "Failed to create service" }); }
    finally { setSaving(false); }
  };

  const handleEdit = async (data: any) => {
    if (!editingService) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/services/${editingService._id}`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error();
      setEditingService(null);
      toast({ title: "Service updated" });
      loadServices();
    } catch { toast({ variant: "destructive", title: "Failed to update service" }); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await fetch(`/api/services/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } });
      toast({ title: "Service deleted" });
      loadServices();
    } catch { toast({ variant: "destructive", title: "Failed to delete" }); }
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold">Service Cards</h2>
        <Button variant="gradient" className="h-9 gap-2" onClick={() => { setShowAddForm(true); setEditingService(null); }}>
          <Plus className="w-4 h-4" /> Add Service
        </Button>
      </div>

      <AnimatePresence>
        {showAddForm && (
          <div className="mb-4">
            <ServiceForm onSave={handleAdd} onCancel={() => setShowAddForm(false)} />
          </div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      ) : services.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-semibold">No services yet</p>
          <p className="text-sm mt-1 opacity-70">Add your first service card above</p>
        </div>
      ) : (
        <div className="space-y-3">
          {services.map((svc, i) => (
            <motion.div key={svc._id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
              {editingService?._id === svc._id ? (
                <ServiceForm service={svc} onSave={handleEdit} onCancel={() => setEditingService(null)} />
              ) : (
                <div className="p-4 bg-secondary/30 rounded-xl border border-border flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-secondary/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{svc.title}</span>
                      {svc.popular && <span className="text-[10px] px-2 py-0.5 bg-primary/15 text-primary rounded-full border border-primary/20 font-semibold">Popular</span>}
                      {svc.category && <span className="text-[10px] px-2 py-0.5 bg-secondary text-muted-foreground rounded-full border border-border">{svc.category}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{svc.description}</p>
                    <div className="flex items-center gap-4 mt-1.5">
                      {svc.price && <span className="text-sm font-bold text-emerald-400">KES {svc.price.toLocaleString()}</span>}
                      {svc.features?.length > 0 && <span className="text-xs text-muted-foreground">{svc.features.length} feature{svc.features.length !== 1 ? "s" : ""}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => { setEditingService(svc); setShowAddForm(false); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/20 transition-colors">
                      <Edit2 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button onClick={() => handleDelete(svc._id, svc.title)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ── Extension Confirm Modal ───────────────────────────────────
function ExtensionConfirmModal({ ext, onClose, onConfirmed }: { ext: any; onClose: () => void; onConfirmed: () => void }) {
  const [deadline, setDeadline] = useState(
    ext.newDeadline
      ? new Date(ext.newDeadline).toISOString().split("T")[0]
      : (ext.serviceRequest?.subscriptionEndsAt
          ? new Date(ext.serviceRequest.subscriptionEndsAt).toISOString().split("T")[0]
          : "")
  );
  const [notes, setNotes]     = useState(ext.adminNotes || "");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleConfirm = async () => {
    setError(""); setLoading(true);
    try {
      const token = localStorage.getItem("nutterx_token");
      const res   = await fetch(`/api/extensions/admin/${ext._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ adminConfirmed: true, adminNotes: notes, newDeadline: deadline || undefined }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Failed"); }
      onConfirmed();
      onClose();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const statusColor: Record<string, string> = {
    paid: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    unpaid: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    pending: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    failed: "text-red-400 bg-red-500/10 border-red-500/20",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, y: 40, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }}
        className="w-full max-w-md bg-card border border-border rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold">Confirm Extension Payment</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Extension summary */}
        <div className="p-4 bg-indigo-500/8 border border-indigo-500/20 rounded-2xl mb-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Client</span>
            <span className="text-sm font-semibold">{ext.user?.name || "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Service</span>
            <span className="text-sm font-semibold truncate max-w-[180px]">{ext.serviceName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Amount Paid</span>
            <span className="text-sm font-bold text-emerald-400">KES {(ext.amount || 0).toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Payment Status</span>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${statusColor[ext.paymentStatus] || "text-muted-foreground bg-secondary border-border"}`}>
              {ext.paymentStatus}
            </span>
          </div>
          <div className="pt-2 border-t border-indigo-500/15">
            <div className="text-xs text-muted-foreground mb-1 font-semibold uppercase tracking-wider">Purpose / Reason</div>
            <div className="text-sm leading-relaxed text-foreground/90">{ext.purpose}</div>
          </div>
        </div>

        {/* New deadline */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <CalendarDays className="w-3.5 h-3.5" /> Set New Service Deadline
          </label>
          <input
            type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
            className="w-full h-10 rounded-xl bg-secondary/50 border border-border px-3 text-sm focus:outline-none focus:border-primary/50 transition-colors"
          />
          {ext.serviceRequest?.subscriptionEndsAt && (
            <p className="text-xs text-muted-foreground mt-1">Current deadline: {formatDate(ext.serviceRequest.subscriptionEndsAt)}</p>
          )}
        </div>

        {/* Admin notes */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Add any notes for your records..."
            className="w-full rounded-xl bg-secondary/50 border border-border p-3 text-sm min-h-[70px] focus:outline-none focus:border-primary/50 resize-none transition-colors" />
        </div>

        {error && <p className="text-red-400 text-xs mb-3 text-center">{error}</p>}

        <div className="flex flex-col gap-2">
          {/* If not yet paid by system, allow admin to mark as paid first */}
          {ext.paymentStatus !== "paid" && (
            <button
              disabled={loading}
              onClick={async () => {
                setError(""); setLoading(true);
                try {
                  const token = localStorage.getItem("nutterx_token");
                  const res = await fetch(`/api/extensions/admin/${ext._id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ markPaid: true }),
                  });
                  if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Failed"); }
                  onConfirmed(); onClose();
                } catch (e: any) { setError(e.message); }
                finally { setLoading(false); }
              }}
              className="w-full h-10 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Mark as Paid (System didn't confirm)
            </button>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1 h-10" onClick={onClose}>Cancel</Button>
            <Button variant="gradient" className="flex-1 h-10" onClick={handleConfirm} disabled={loading || ext.paymentStatus !== "paid"}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4 mr-1.5" />}
              Confirm & Update Deadline
            </Button>
          </div>
          {ext.paymentStatus !== "paid" && (
            <p className="text-xs text-muted-foreground text-center">Mark as paid first, then confirm the deadline update.</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Request Payment Modal (admin → user) ─────────────────────
function RequestPaymentModal({ request, onClose, onSent }: { request: any; onClose: () => void; onSent: () => void }) {
  const [amount, setAmount]   = useState("");
  const [days, setDays]       = useState("30");
  const [purpose, setPurpose] = useState(`Service renewal for ${request.serviceName}`);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const isExpired = request.subscriptionEndsAt && new Date(request.subscriptionEndsAt) < new Date();

  async function handleSend() {
    if (!amount || !days) { setError("Amount and days are required."); return; }
    setError(""); setLoading(true);
    try {
      const token = localStorage.getItem("nutterx_token");
      const res = await fetch("/api/extensions/admin/request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          serviceRequestId:   request._id,
          amount:             Number(amount),
          adminRequestedDays: Number(days),
          purpose:            purpose.trim() || `Service renewal for ${request.serviceName}`,
          adminMessage:       message.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send request");
      onSent(); onClose();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Banknote className="w-5 h-5 text-amber-400" /> Request Payment
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {request.user?.name} · <span className="text-primary">{request.serviceName}</span>
              {isExpired && <span className="ml-1.5 text-red-400 font-semibold">(Expired)</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">Purpose / Label</label>
            <input value={purpose} onChange={e => setPurpose(e.target.value)}
              placeholder="Service renewal for..."
              className="w-full rounded-xl bg-secondary/50 border border-border p-3 text-sm focus:outline-none focus:border-primary/50 transition-colors" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">Amount (KES)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min={1}
                placeholder="e.g. 5000"
                className="w-full rounded-xl bg-secondary/50 border border-border p-3 text-sm focus:outline-none focus:border-primary/50 transition-colors" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">Days Added</label>
              <input type="number" value={days} onChange={e => setDays(e.target.value)} min={1}
                placeholder="e.g. 30"
                className="w-full rounded-xl bg-secondary/50 border border-border p-3 text-sm focus:outline-none focus:border-primary/50 transition-colors" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">Message to Client <span className="font-normal">(optional)</span></label>
            <textarea value={message} onChange={e => setMessage(e.target.value)}
              placeholder="e.g. Your subscription has expired. Please renew to continue."
              rows={3}
              className="w-full rounded-xl bg-secondary/50 border border-border p-3 text-sm focus:outline-none focus:border-primary/50 resize-none transition-colors" />
          </div>

          <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300">
            Once the client pays, <span className="font-bold">{days || "?"} days</span> will be added to their service timer automatically.
          </div>
        </div>

        {error && <p className="text-red-400 text-xs mt-3 text-center">{error}</p>}

        <div className="flex gap-2 mt-5">
          <Button variant="ghost" className="flex-1 h-10" onClick={onClose}>Cancel</Button>
          <Button variant="gradient" className="flex-1 h-10" onClick={handleSend} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4 mr-1.5" />}
            Send Request
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Extension Payment Approve Modal ───────────────────────────
function ExtPayApproveModal({ ext, onClose, onDone }: { ext: any; onClose: () => void; onDone: () => void }) {
  const [newDeadline, setNewDeadline] = useState("");
  const [adminNotes, setAdminNotes]   = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const { toast } = useToast();

  const handleApprove = async () => {
    if (!newDeadline) { setError("Please set a new deadline for the service."); return; }
    setLoading(true); setError("");
    try {
      const token = localStorage.getItem("nutterx_token");
      const res = await fetch(`/api/extensions/approve/${ext._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newDeadline, adminNotes: adminNotes.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to approve");
      toast({ title: "Extension approved!", description: `${ext.user?.name || "Client"}'s payment confirmed and deadline updated.` });
      onDone();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleReject = async () => {
    if (!confirm("Reject this extension payment? Status will revert to unpaid.")) return;
    setLoading(true); setError("");
    try {
      const token = localStorage.getItem("nutterx_token");
      const res = await fetch(`/api/extensions/reject/${ext._id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to reject");
      toast({ title: "Extension payment rejected" });
      onDone();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-indigo-500/30 rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-indigo-400" /> Review Extension Payment
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-secondary/40 border border-border space-y-1.5">
            <div className="text-sm font-semibold">{ext.user?.name || "—"} <span className="text-muted-foreground font-normal text-xs">· {ext.user?.email}</span></div>
            <div className="text-sm">{ext.serviceName}</div>
            <div className="text-xs text-muted-foreground">{ext.purpose}</div>
            <div className="text-base font-bold text-emerald-400">KES {(ext.amount || 0).toLocaleString()}</div>
            <div className="text-xs text-indigo-400">{ext.adminRequestedDays ? `+${ext.adminRequestedDays} days on approval` : "User-initiated extension"}</div>
          </div>
          {ext.mpesaMessage && (
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                <MessageSquare className="w-3.5 h-3.5" /> M-Pesa Confirmation SMS
              </div>
              <div className="p-3 rounded-xl bg-[#075E54]/15 border border-[#25D366]/30 text-xs text-white/90 leading-relaxed whitespace-pre-wrap font-mono">
                {ext.mpesaMessage}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">
              New Service Deadline <span className="text-red-400">*</span>
            </label>
            <input type="date" value={newDeadline} onChange={e => setNewDeadline(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-secondary/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">Admin Note (optional)</label>
            <input type="text" value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
              placeholder="e.g. Verified via M-Pesa code XYZ"
              className="w-full h-10 px-3 rounded-xl border border-border bg-secondary/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}
          <div className="flex gap-2.5 pt-1">
            <button onClick={handleReject} disabled={loading}
              className="flex-1 h-11 rounded-xl bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 disabled:opacity-50 text-red-400 font-semibold text-sm transition-colors flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />} Reject
            </button>
            <button onClick={handleApprove} disabled={loading}
              className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />} Approve
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Service Payment Approve Modal ─────────────────────────────
function ServicePayApproveModal({ statement, onClose, onDone }: { statement: any; onClose: () => void; onDone: () => void }) {
  const [newDeadline, setNewDeadline] = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const { toast } = useToast();

  const handleApprove = async () => {
    setLoading(true); setError("");
    try {
      const token = localStorage.getItem("nutterx_token");
      const res = await fetch(`/api/payment/approve/${statement._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newDeadline: newDeadline || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to approve");
      toast({ title: "Payment approved!", description: `${(statement.user as any)?.name || "Client"}'s payment has been confirmed.` });
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!confirm("Reject this payment? The status will revert to unpaid.")) return;
    setLoading(true); setError("");
    try {
      const token = localStorage.getItem("nutterx_token");
      const res = await fetch(`/api/payment/reject/${statement._id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to reject");
      toast({ title: "Payment rejected", description: "Status reverted to unpaid." });
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Banknote className="w-5 h-5 text-amber-400" /> Review Payment
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-secondary/40 border border-border space-y-1.5">
            <div className="text-sm font-semibold">{(statement.user as any)?.name || "Client"} <span className="text-muted-foreground font-normal text-xs">· {(statement.user as any)?.email}</span></div>
            <div className="text-sm">{statement.serviceName}</div>
            <div className="text-base font-bold text-emerald-400">{statement.paymentCurrency} {(statement.paymentAmount || 0).toLocaleString()}</div>
          </div>

          {/* M-Pesa message */}
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              <MessageSquare className="w-3.5 h-3.5" /> M-Pesa Confirmation SMS
            </div>
            <div className="p-3 rounded-xl bg-[#075E54]/15 border border-[#25D366]/30 text-sm text-white/90 leading-relaxed whitespace-pre-wrap font-mono text-xs">
              {statement.mpesaMessage || "No message submitted"}
            </div>
          </div>

          {/* Optional: update deadline on approve */}
          <div>
            <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">
              Update Service Deadline (optional)
            </label>
            <input
              type="date"
              value={newDeadline}
              onChange={e => setNewDeadline(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-secondary/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}

          <div className="flex gap-2.5 pt-1">
            <button onClick={handleReject} disabled={loading}
              className="flex-1 h-11 rounded-xl bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 disabled:opacity-50 text-red-400 font-semibold text-sm transition-colors flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />} Reject
            </button>
            <button onClick={handleApprove} disabled={loading}
              className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />} Approve
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Payments Panel ────────────────────────────────────────────
function PaymentsPanel() {
  const [data, setData]           = useState<{ statements: any[]; totalRevenue: number; pendingAmount: number; extensionRevenue: number; extensionCount: number } | null>(null);
  const [loading, setLoading]     = useState(true);
  const [extensions, setExts]     = useState<any[]>([]);
  const [extsLoading, setExtsLoading] = useState(true);
  const [confirmingExt, setConfirmingExt] = useState<any>(null);
  const [approvingExt, setApprovingExt]   = useState<any>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [deletingExtId, setDeletingExtId] = useState<string | null>(null);
  const [approvingStatement, setApprovingStatement] = useState<any>(null);
  const queryClient = useQueryClient();

  const loadAll = () => {
    const token = localStorage.getItem("nutterx_token");
    fetch("/api/admin/payments", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    fetch("/api/extensions/admin", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setExts(Array.isArray(d) ? d : []); setExtsLoading(false); })
      .catch(() => setExtsLoading(false));
  };

  useEffect(() => {
    const token = localStorage.getItem("nutterx_token");
    fetch("/api/admin/payments", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    fetch("/api/extensions/admin", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setExts(Array.isArray(d) ? d : []); setExtsLoading(false); })
      .catch(() => setExtsLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  if (!data) return <p className="text-muted-foreground text-center py-12">Failed to load payment data.</p>;

  const { statements, totalRevenue, pendingAmount, extensionRevenue = 0, extensionCount = 0 } = data;
  const paidCount = statements.filter(s => s.paymentStatus === "paid").length;
  const pendingCount = statements.filter(s => s.paymentStatus === "unpaid" || s.paymentStatus === "pending").length;
  const failedCount = statements.filter(s => s.paymentStatus === "failed").length;

  const statusColor: Record<string, string> = {
    paid:    "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    unpaid:  "text-amber-400 bg-amber-500/10 border-amber-500/20",
    pending: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    failed:  "text-red-400 bg-red-500/10 border-red-500/20",
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
      <h2 className="text-lg font-bold mb-5">Revenue & Payment Statements</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Revenue",    value: `KES ${totalRevenue.toLocaleString()}`, sub: `${paidCount} service${paidCount !== 1 ? "s" : ""}${extensionCount > 0 ? ` + ${extensionCount} extension${extensionCount !== 1 ? "s" : ""} (KES ${extensionRevenue.toLocaleString()})` : ""}`,    color: "text-emerald-400", bg: "bg-emerald-500/5 border-emerald-500/20", icon: TrendingUp },
          { label: "Pending Payments", value: `KES ${pendingAmount.toLocaleString()}`, sub: `${pendingCount} pending`, color: "text-amber-400",  bg: "bg-amber-500/5 border-amber-500/20",   icon: Clock },
          { label: "Failed / Unpaid",  value: String(failedCount),  sub: "transactions", color: "text-red-400",    bg: "bg-red-500/5 border-red-500/20",     icon: AlertCircle },
          { label: "Total Requests",   value: String(statements.length), sub: "with payment", color: "text-primary", bg: "bg-primary/5 border-primary/20",     icon: DollarSign },
        ].map(s => (
          <div key={s.label} className={`p-4 rounded-xl border ${s.bg}`}>
            <s.icon className={`w-5 h-5 mb-2 ${s.color}`} />
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            <div className="text-xs text-muted-foreground opacity-70">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Statements table */}
      {statements.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">No payment records yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                {["Client", "Service / Purpose", "Type", "Amount", "Status", "Date", "Action"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {statements.map((s, i) => (
                <motion.tr key={String(s._id)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                  className={`hover:bg-secondary/20 transition-colors ${s.type === "extension" ? "bg-indigo-500/5" : "bg-card"}`}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-sm">{(s.user as any)?.name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{(s.user as any)?.email || ""}</div>
                  </td>
                  <td className="px-4 py-3 max-w-[180px]">
                    <div className="text-sm text-muted-foreground truncate">{s.serviceName}</div>
                    {s.purpose && <div className="text-xs text-indigo-400 truncate mt-0.5">{s.purpose}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${s.type === "extension" ? "text-indigo-400 bg-indigo-500/10 border-indigo-500/30" : "text-sky-400 bg-sky-500/10 border-sky-500/30"}`}>
                      {s.type === "extension" ? "Extension" : "Service"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold text-sm text-emerald-400">{s.paymentCurrency} {(s.paymentAmount || 0).toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusColor[s.paymentStatus] || "text-muted-foreground bg-secondary border-border"}`}>
                      {s.paymentStatus || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(s.createdAt)}</td>
                  <td className="px-4 py-3">
                    {s.paymentStatus === "pending" && s.mpesaMessage && s.type === "service" && (
                      <button
                        onClick={() => setApprovingStatement(s)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 text-amber-400 text-xs font-semibold whitespace-nowrap transition-colors">
                        <Banknote className="w-3.5 h-3.5" /> Review
                      </button>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Extension / Advance Payments ─────────────────────── */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h3 className="text-base font-bold flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-indigo-400" /> Advance Payments (Service Extensions)
          </h3>
          <button onClick={loadAll} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {extsLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : extensions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">No advance payment requests yet.</p>
        ) : (
          <div className="space-y-3">
            {extensions.map((ext, i) => {
              const isPaid = ext.paymentStatus === "paid";
              const needsAction = isPaid && !ext.adminConfirmed;
              return (
                <motion.div key={ext._id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                  className={`rounded-2xl border p-4 transition-colors ${needsAction ? "bg-indigo-500/8 border-indigo-500/30" : "bg-secondary/20 border-border"}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">

                    {/* Left: client + service info */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">{ext.user?.name || "—"}</span>
                        <span className="text-xs text-muted-foreground">{ext.user?.email || ""}</span>
                        {needsAction && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-400 animate-pulse">
                            ACTION NEEDED
                          </span>
                        )}
                        {ext.adminConfirmed && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            Confirmed
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-foreground/90">{ext.serviceName}</div>
                      <div className="p-2.5 bg-secondary/40 border border-border rounded-xl">
                        <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Purpose / Reason</div>
                        <div className="text-sm leading-relaxed">{ext.purpose}</div>
                      </div>
                      {/* M-Pesa message preview for pending */}
                      {ext.paymentStatus === "pending" && ext.mpesaMessage && (
                        <div className="p-2.5 bg-[#075E54]/15 border border-[#25D366]/25 rounded-xl">
                          <div className="text-xs text-[#25D366] font-semibold mb-1 flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" /> M-Pesa SMS Received
                          </div>
                          <div className="text-xs text-white/80 font-mono leading-relaxed line-clamp-2">{ext.mpesaMessage}</div>
                        </div>
                      )}
                      {ext.adminNotes && (
                        <div className="text-xs text-primary/80 bg-primary/5 border border-primary/10 rounded-lg px-2.5 py-1.5">
                          Admin note: {ext.adminNotes}
                        </div>
                      )}
                      {ext.newDeadline && (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                          <CalendarDays className="w-3.5 h-3.5" /> New deadline set: {formatDate(ext.newDeadline)}
                        </div>
                      )}
                    </div>

                    {/* Right: amount, status, action */}
                    <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-2 shrink-0">
                      <div className="text-lg font-bold text-emerald-400 whitespace-nowrap">KES {(ext.amount || 0).toLocaleString()}</div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusColor[ext.paymentStatus] || "text-muted-foreground bg-secondary border-border"}`}>
                        {ext.paymentStatus}
                      </span>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(ext.createdAt)}</div>

                      {/* Review pending M-Pesa submission */}
                      {ext.paymentStatus === "pending" && ext.mpesaMessage && (
                        <button
                          onClick={() => setApprovingExt(ext)}
                          className="mt-1 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 text-amber-400 text-xs font-semibold transition-colors whitespace-nowrap"
                        >
                          <Banknote className="w-3.5 h-3.5" /> Review Payment
                        </button>
                      )}

                      {/* Admin manually marks as paid if no M-Pesa message submitted */}
                      {ext.paymentStatus === "unpaid" && (
                        <button
                          disabled={markingPaidId === ext._id}
                          onClick={async () => {
                            setMarkingPaidId(ext._id);
                            try {
                              const token = localStorage.getItem("nutterx_token");
                              const res = await fetch(`/api/extensions/admin/${ext._id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ markPaid: true }),
                              });
                              if (res.ok) loadAll();
                            } finally { setMarkingPaidId(null); }
                          }}
                          className="mt-1 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                        >
                          {markingPaidId === ext._id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Mark as Paid
                        </button>
                      )}

                      {/* Confirm & update deadline once paid */}
                      {isPaid && !ext.adminConfirmed && (
                        <button
                          onClick={() => setConfirmingExt(ext)}
                          className="mt-1 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                        >
                          <CalendarDays className="w-3.5 h-3.5" /> Confirm & Update
                        </button>
                      )}

                      {/* Delete button for failed / pending / unpaid */}
                      {["unpaid", "pending", "failed"].includes(ext.paymentStatus) && (
                        <button
                          disabled={deletingExtId === ext._id}
                          onClick={async () => {
                            if (!confirm(`Delete this ${ext.paymentStatus} transaction for KES ${(ext.amount || 0).toLocaleString()}?`)) return;
                            setDeletingExtId(ext._id);
                            try {
                              const token = localStorage.getItem("nutterx_token");
                              const res = await fetch(`/api/extensions/admin/${ext._id}`, {
                                method: "DELETE",
                                headers: { Authorization: `Bearer ${token}` },
                              });
                              if (res.ok) loadAll();
                            } finally { setDeletingExtId(null); }
                          }}
                          className="mt-1 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 hover:bg-red-500/25 disabled:opacity-50 text-red-400 text-xs font-semibold transition-colors whitespace-nowrap"
                        >
                          {deletingExtId === ext._id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        <AnimatePresence>
          {confirmingExt && (
            <ExtensionConfirmModal
              ext={confirmingExt}
              onClose={() => setConfirmingExt(null)}
              onConfirmed={() => {
                loadAll();
                queryClient.invalidateQueries({ queryKey: getAdminGetRequestsQueryKey() });
              }}
            />
          )}
          {approvingExt && (
            <ExtPayApproveModal
              ext={approvingExt}
              onClose={() => setApprovingExt(null)}
              onDone={() => { setApprovingExt(null); loadAll(); queryClient.invalidateQueries({ queryKey: getAdminGetRequestsQueryKey() }); }}
            />
          )}
          {approvingStatement && (
            <ServicePayApproveModal
              statement={approvingStatement}
              onClose={() => setApprovingStatement(null)}
              onDone={() => { setApprovingStatement(null); loadAll(); queryClient.invalidateQueries({ queryKey: getAdminGetRequestsQueryKey() }); }}
            />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Add User Form ─────────────────────────────────────────────
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
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
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
            <Input type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" className="h-11 pr-10" minLength={6} required />
            <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {error && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}</motion.div>}
          {success && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 shrink-0" />{success}</motion.div>}
        </AnimatePresence>
        <Button onClick={handleSubmit as any} variant="gradient" className="w-full h-11" disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : <><UserPlus className="w-4 h-4 mr-2" />Create User</>}
        </Button>
      </div>
    </motion.div>
  );
}

// ── Settings Form ─────────────────────────────────────────────
function SettingsForm() {
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [sandbox, setSandbox] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("nutterx_token");
    fetch("/api/admin/settings", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(data => {
        if (data.pesapal_consumer_key) setConsumerKey(data.pesapal_consumer_key);
        if (data.pesapal_consumer_secret) setConsumerSecret(data.pesapal_consumer_secret);
        setSandbox(data.pesapal_sandbox === "true");
        setRegistrationEnabled(data.registration_enabled !== "false");
      }).catch(() => {}).finally(() => setFetching(false));
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
          registration_enabled: String(registrationEnabled),
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError("Failed to save settings. Try again."); }
    finally { setLoading(false); }
  };

  if (fetching) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center"><Key className="w-5 h-5 text-primary" /></div>
        <div>
          <h2 className="text-lg font-bold">Payment Gateway</h2>
          <p className="text-xs text-muted-foreground">Pesapal (M-Pesa STK Push) credentials</p>
        </div>
      </div>
      <div className="max-w-md space-y-4">
        <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl text-xs text-amber-400 leading-relaxed">
          Get your Consumer Key and Secret from your Pesapal merchant dashboard at <span className="font-semibold">pay.pesapal.com</span>.
        </div>
        <div className="flex items-center justify-between p-4 bg-card border border-border rounded-xl">
          <div>
            <p className="text-sm font-semibold">Sandbox / Test Mode</p>
            <p className="text-xs text-muted-foreground mt-0.5">Use Pesapal's test environment.</p>
          </div>
          <button type="button" onClick={() => setSandbox(v => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${sandbox ? "bg-primary" : "bg-muted"}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${sandbox ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
        <div className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${registrationEnabled ? "bg-emerald-500/5 border-emerald-500/25" : "bg-red-500/5 border-red-500/25"}`}>
          <div>
            <p className="text-sm font-semibold">New Registrations</p>
            <p className={`text-xs mt-0.5 ${registrationEnabled ? "text-emerald-400" : "text-red-400"}`}>
              {registrationEnabled ? "Open — anyone can sign up" : "Closed — sign-ups are paused"}
            </p>
          </div>
          <button type="button" onClick={() => setRegistrationEnabled(v => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${registrationEnabled ? "bg-emerald-500" : "bg-red-500/50"}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${registrationEnabled ? "translate-x-5" : "translate-x-0"}`} />
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
          {error && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}</motion.div>}
          {saved && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 shrink-0" />Settings saved — Pesapal is active</motion.div>}
        </AnimatePresence>
        <Button onClick={handleSave} variant="gradient" className="w-full h-11" disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save Credentials</>}
        </Button>
      </div>
    </motion.div>
  );
}

// ── Golden Certificate PNG Export ─────────────────────────────
async function exportAsPNG(rawRequests: any[]) {
  // Priority per entry: Active (live sub) > Expired > Completed > In-Progress > Pending
  const rowPriority = (r: any): number => {
    const isExpired = r.subscriptionEndsAt && new Date(r.subscriptionEndsAt) < new Date();
    const isActive  = (r.status === "in_progress" || r.status === "completed")
                      && r.subscriptionEndsAt && !isExpired;
    if (isActive)                          return 4; // live subscription
    if (isExpired)                         return 3; // subscription lapsed
    if (r.status === "completed")          return 2;
    if (r.status === "in_progress")        return 1;
    return 0;                                        // pending
  };

  // Deduplicate: one row per user, keep the highest-priority entry.
  // Use email as the key (always a plain unique string); fall back to _id string.
  const userMap = new Map<string, any>();
  for (const req of rawRequests) {
    const uid = String(
      req.user?.email ||
      req.user?._id  ||
      req.user        ||
      req._id
    ).trim().toLowerCase();
    const existing = userMap.get(uid);
    if (!existing || rowPriority(req) > rowPriority(existing)) {
      userMap.set(uid, req);
    }
  }

  // Sort A → Z by name
  const requests = Array.from(userMap.values()).sort((a, b) => {
    const nameA = (a.user?.name || "").toLowerCase();
    const nameB = (b.user?.name || "").toLowerCase();
    return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
  });
  const S = 2;
  const LW = 390;
  const W = LW * S;
  const PAD = 20;
  const HEADER_H = 132;
  const STATS_H  = 60;
  const TH_H     = 30;
  const ROW_H    = 40;   // 2-line status column: status top, end date below
  const FOOTER_H = 82;

  const totalH = HEADER_H + STATS_H + TH_H + requests.length * ROW_H + FOOTER_H;
  const H = Math.max(totalH, 300) * S;

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(S, S);
  const LH = Math.max(totalH, 300);

  // ── Gold palette ─────────────────────────────
  const CREAM        = "#fefcf0";
  const PARCHMENT    = "#f9f0d0";
  const GOLD_DARK    = "#7a5200";
  const GOLD_MID     = "#c89000";
  const GOLD_BRIGHT  = "#e8b420";
  const GOLD_LIGHT   = "#f5d878";
  const TEXT_DARK    = "#1a0800";
  const TEXT_MID     = "#3d2000";
  const TEXT_MUTED   = "#7a5c1a";
  const ROW_ALT      = "#fdf3cc";

  // ── Cream parchment background ───────────────
  const bg = ctx.createLinearGradient(0, 0, 0, LH);
  bg.addColorStop(0, CREAM);
  bg.addColorStop(0.5, "#fffef5");
  bg.addColorStop(1, PARCHMENT);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);

  // ── Outer gold border (thick) ────────────────────────────────
  ctx.strokeStyle = GOLD_MID; ctx.lineWidth = 5;
  ctx.strokeRect(5, 5, LW - 10, LH - 10);

  // ── Inner gold border (thin, dashed) ─────────────────────────
  ctx.save();
  ctx.strokeStyle = GOLD_BRIGHT; ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(11, 11, LW - 22, LH - 22);
  ctx.setLineDash([]);
  ctx.restore();

  // ── Corner ornaments (gold diamonds) ─────────────────────────
  const corners = [[14,14],[LW-14,14],[14,LH-14],[LW-14,LH-14]] as [number,number][];
  corners.forEach(([cx,cy]) => {
    ctx.fillStyle = GOLD_BRIGHT;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 5, cy);
    ctx.lineTo(cx, cy + 5); ctx.lineTo(cx - 5, cy);
    ctx.closePath(); ctx.fill();
  });

  // ── Diagonal watermark ───────────────────────────────────────
  ctx.save();
  ctx.translate(LW / 2, LH / 2 + 20);
  ctx.rotate(-32 * Math.PI / 180);
  ctx.globalAlpha = 0.055;
  ctx.fillStyle = GOLD_DARK;
  ctx.font = "bold 58px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("NUTTERX", 0, 0);
  ctx.font = "bold 26px sans-serif";
  ctx.fillText("TECHNOLOGIES", 0, 42);
  ctx.restore();

  // ── Logo badge (centered) ─────────────────────────────────────
  const LOGO_CX = LW / 2;
  const LOGO_CY = 30;
  const LOGO_R  = 18;
  const lgGrad = ctx.createRadialGradient(LOGO_CX - 4, LOGO_CY - 4, 2, LOGO_CX, LOGO_CY, LOGO_R);
  lgGrad.addColorStop(0, GOLD_BRIGHT);
  lgGrad.addColorStop(0.6, GOLD_MID);
  lgGrad.addColorStop(1, GOLD_DARK);
  ctx.fillStyle = lgGrad;
  ctx.beginPath(); ctx.arc(LOGO_CX, LOGO_CY, LOGO_R, 0, Math.PI * 2); ctx.fill();
  // Ring around badge
  ctx.strokeStyle = GOLD_BRIGHT; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(LOGO_CX, LOGO_CY, LOGO_R + 3, 0, Math.PI * 2); ctx.stroke();
  // N letter
  ctx.fillStyle = TEXT_DARK; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("N", LOGO_CX, LOGO_CY + 6);

  // ── Company name ─────────────────────────────────────────────
  ctx.textAlign = "center";
  const goldTitle = ctx.createLinearGradient(LW * 0.2, 0, LW * 0.8, 0);
  goldTitle.addColorStop(0, GOLD_DARK);
  goldTitle.addColorStop(0.5, GOLD_BRIGHT);
  goldTitle.addColorStop(1, GOLD_DARK);
  ctx.fillStyle = goldTitle; ctx.font = "bold 13.5px sans-serif";
  ctx.fillText("NUTTERX TECHNOLOGIES", LOGO_CX, 68);

  // ── Certificate subtitle ──────────────────────────────────────
  ctx.fillStyle = TEXT_MID; ctx.font = "9.5px sans-serif";
  ctx.letterSpacing = "2px";
  ctx.fillText("CLIENT  SERVICES  CERTIFICATE", LOGO_CX, 82);
  ctx.letterSpacing = "0px";

  // ── Decorative ornament line ──────────────────────────────────
  const ornY = 91;
  ctx.strokeStyle = GOLD_MID; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(PAD + 30, ornY); ctx.lineTo(LW / 2 - 16, ornY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(LW / 2 + 16, ornY); ctx.lineTo(LW - PAD - 30, ornY); ctx.stroke();
  // Centre diamond on ornament line
  ctx.fillStyle = GOLD_BRIGHT;
  ctx.beginPath();
  ctx.moveTo(LW/2, ornY - 4); ctx.lineTo(LW/2 + 5, ornY);
  ctx.lineTo(LW/2, ornY + 4); ctx.lineTo(LW/2 - 5, ornY);
  ctx.closePath(); ctx.fill();

  // ── Date (left) and REF (right) ───────────────────────────────
  const dateStr = new Date().toLocaleDateString("en-KE", { day: "2-digit", month: "long", year: "numeric" });
  const refStr  = `REF-${Date.now().toString().slice(-8)}`;
  ctx.fillStyle = TEXT_MUTED; ctx.font = "8px sans-serif";
  ctx.textAlign = "left";  ctx.fillText(dateStr, PAD + 4, 106);
  ctx.textAlign = "right"; ctx.fillText(refStr,  LW - PAD - 4, 106);
  ctx.textAlign = "left";

  // ── Thin gold divider ──────────────────────────────────────────
  ctx.strokeStyle = GOLD_LIGHT; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(PAD, 114); ctx.lineTo(LW - PAD, 114); ctx.stroke();

  // ── Stats row (no payment totals) ────────────────────────────
  const statsData = [
    { label: "Total",    value: requests.length },
    { label: "Active",   value: requests.filter((r: any) => r.status === "in_progress" || r.status === "completed").length },
    { label: "Done",     value: requests.filter((r: any) => r.status === "completed").length },
  ];
  const SW    = (LW - PAD * 2 - 6) / 3;
  const SY    = HEADER_H - 8;
  const statBg = ctx.createLinearGradient(0, SY, 0, SY + 46);
  statBg.addColorStop(0, "#fdf5d0");
  statBg.addColorStop(1, "#fae8a0");

  statsData.forEach((st, i) => {
    const sx = PAD + i * (SW + 3);
    ctx.fillStyle = statBg;
    ctx.beginPath(); ctx.roundRect(sx, SY, SW, 46, 5); ctx.fill();
    ctx.strokeStyle = GOLD_MID; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(sx, SY, SW, 46, 5); ctx.stroke();
    // value
    const numGrad = ctx.createLinearGradient(sx, SY, sx, SY + 30);
    numGrad.addColorStop(0, GOLD_BRIGHT);
    numGrad.addColorStop(1, GOLD_DARK);
    ctx.fillStyle = numGrad; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(String(st.value), sx + SW / 2, SY + 24);
    ctx.fillStyle = TEXT_MUTED; ctx.font = "7.5px sans-serif";
    ctx.fillText(st.label, sx + SW / 2, SY + 38);
  });
  ctx.textAlign = "left";

  // ── Table layout ──────────────────────────────────────────────
  const tableTop = HEADER_H + STATS_H;
  const CW       = LW - PAD * 2; // content width

  const C_NUM  = { x: PAD,       w: 22  };
  const C_NAME = { x: PAD + 22,  w: 118 };
  const C_SVC  = { x: PAD + 140, w: 106 };
  const C_STAT = { x: PAD + 246, w: CW - 246 };

  // ── Table header row ──────────────────────────────────────────
  const thBg = ctx.createLinearGradient(0, tableTop, LW, tableTop);
  thBg.addColorStop(0, GOLD_DARK);
  thBg.addColorStop(0.5, GOLD_MID);
  thBg.addColorStop(1, GOLD_DARK);
  ctx.fillStyle = thBg;
  ctx.beginPath(); ctx.roundRect(PAD, tableTop, CW, TH_H, [5, 5, 0, 0]); ctx.fill();

  ctx.fillStyle = PARCHMENT; ctx.font = "bold 8px sans-serif";
  const headers = [
    { label: "#",             cx: C_NUM.x  + C_NUM.w  / 2, align: "center" as const },
    { label: "CLIENT NAME",   cx: C_NAME.x + 4,             align: "left"   as const },
    { label: "SERVICE",       cx: C_SVC.x  + 4,             align: "left"   as const },
    { label: "STATUS / ENDS", cx: C_STAT.x + 4,             align: "left"   as const },
  ];
  headers.forEach(h => {
    ctx.textAlign = h.align;
    ctx.fillText(h.label, h.cx, tableTop + 20);
  });
  ctx.textAlign = "left";

  // ── Data rows ────────────────────────────────────────────────
  const statusColor: Record<string, string> = {
    completed:   "#0a5020",
    in_progress: "#0a5020",
    pending:     "#7a4000",
    cancelled:   "#7a0a0a",
    expired:     "#9b2020",
  };
  const statusLabel: Record<string, string> = {
    completed:   "Active",
    in_progress: "Active",
    pending:     "Pending",
    cancelled:   "Cancelled",
    expired:     "Expired",
  };

  const resolveReqStatus = (req: any): string => {
    if (req.subscriptionEndsAt && new Date(req.subscriptionEndsAt) < new Date()) return "expired";
    return req.status || "pending";
  };

  const trunc = (s: string, n: number) => !s ? "—" : s.length > n ? s.slice(0, n) + "…" : s;
  const fmtDate = (d: string | undefined) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
  };

  requests.forEach((req: any, i: number) => {
    const rowY  = tableTop + TH_H + i * ROW_H;
    const isEven = i % 2 === 0;
    const user  = req.user as any;
    const endDate = fmtDate(req.subscriptionEndsAt);
    const resolvedStatus = resolveReqStatus(req);

    // Row background
    ctx.fillStyle = isEven ? CREAM : ROW_ALT;
    ctx.fillRect(PAD, rowY, CW, ROW_H);

    // Row separator
    ctx.strokeStyle = GOLD_LIGHT; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(PAD, rowY + ROW_H); ctx.lineTo(PAD + CW, rowY + ROW_H); ctx.stroke();

    const MID = rowY + ROW_H * 0.5;  // vertical centre for # / Name / Service
    const L1  = rowY + ROW_H * 0.38; // status label (top line)
    const L2  = rowY + ROW_H * 0.72; // end date (bottom line)

    // # number
    ctx.fillStyle = GOLD_MID; ctx.font = "bold 8.5px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(String(i + 1), C_NUM.x + C_NUM.w / 2, MID);

    // Name
    ctx.fillStyle = TEXT_DARK; ctx.font = "bold 8.5px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(trunc(user?.name || "—", 16), C_NAME.x + 4, MID);

    // Service
    ctx.fillStyle = TEXT_MID; ctx.font = "8px sans-serif";
    ctx.fillText(trunc(req.serviceName, 14), C_SVC.x + 4, MID);

    // Status (line 1) — expired shows as "Expired", completed/in_progress as "Active"
    ctx.fillStyle = statusColor[resolvedStatus] || TEXT_MUTED;
    ctx.font = "bold 8.5px sans-serif";
    ctx.fillText(statusLabel[resolvedStatus] || resolvedStatus || "—", C_STAT.x + 4, L1);

    // End date (line 2)
    ctx.fillStyle = TEXT_MUTED; ctx.font = "7.5px sans-serif";
    ctx.fillText(endDate ? `Ends ${endDate}` : "—", C_STAT.x + 4, L2);

    ctx.textAlign = "left";
  });

  // Table outer border (gold)
  const tableH = TH_H + requests.length * ROW_H;
  ctx.strokeStyle = GOLD_MID; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(PAD, tableTop, CW, tableH, [5, 5, 0, 0]); ctx.stroke();

  // Column dividers (gold)
  ctx.strokeStyle = GOLD_LIGHT; ctx.lineWidth = 0.7;
  [C_NAME.x, C_SVC.x, C_STAT.x].forEach(cx => {
    ctx.beginPath(); ctx.moveTo(cx, tableTop); ctx.lineTo(cx, tableTop + tableH); ctx.stroke();
  });

  // ── Footer ───────────────────────────────────────────────────
  const FY = tableTop + tableH;

  // Gold footer divider
  ctx.strokeStyle = GOLD_MID; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, FY + 10); ctx.lineTo(LW - PAD, FY + 10); ctx.stroke();

  // Seal circle (bottom right)
  const SC_X = LW - 46, SC_Y = FY + 42, SC_R = 26;
  const sealBg = ctx.createRadialGradient(SC_X - 6, SC_Y - 6, 3, SC_X, SC_Y, SC_R);
  sealBg.addColorStop(0, GOLD_LIGHT);
  sealBg.addColorStop(0.6, GOLD_MID);
  sealBg.addColorStop(1, GOLD_DARK);
  ctx.fillStyle = sealBg;
  ctx.beginPath(); ctx.arc(SC_X, SC_Y, SC_R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = GOLD_BRIGHT; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(SC_X, SC_Y, SC_R - 4, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = TEXT_DARK; ctx.font = "bold 15px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("N", SC_X, SC_Y + 6);
  ctx.fillStyle = CREAM; ctx.font = "5.5px sans-serif";
  ctx.fillText("CERTIFIED", SC_X, SC_Y + 18);

  // Footer text (left of seal)
  ctx.textAlign = "left";
  ctx.fillStyle = TEXT_DARK; ctx.font = "bold 8.5px sans-serif";
  ctx.fillText("Nutterx Technologies", PAD + 4, FY + 26);
  ctx.fillStyle = TEXT_MUTED; ctx.font = "7.5px sans-serif";
  ctx.fillText("Official Client Services Record", PAD + 4, FY + 39);
  ctx.fillStyle = GOLD_MID; ctx.font = "7px sans-serif";
  ctx.fillText(`nutterx.tech  ·  ${new Date().getFullYear()}  ·  KES = Kenya Shillings`, PAD + 4, FY + 54);

  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `nutterx-certificate-${Date.now()}.png`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }, "image/png");
}

// ── Create Group Chat Modal ───────────────────────────────────
function CreateGroupModal({ users, onClose, token }: { users: any[]; onClose: () => void; token: string }) {
  const [groupName, setGroupName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const toggle = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleCreate = async () => {
    if (!groupName.trim()) { setError("Please enter a group name."); return; }
    if (!selectedIds.length) { setError("Select at least one member."); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/chats/group", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: groupName.trim(), participantIds: selectedIds }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Failed"); }
      setDone(true);
      setTimeout(onClose, 1400);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const nonAdminUsers = users.filter((u: any) => u.role !== "admin");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, y: 40, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }}
        className="w-full max-w-sm bg-card border border-border rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold">New Group Chat</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Group Name</label>
          <Input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g. Project Alpha Team" className="h-10" />
        </div>

        <div className="mb-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
            Members <span className="text-primary">({selectedIds.length} selected)</span>
          </label>
          <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
            {nonAdminUsers.length === 0 && <p className="text-muted-foreground text-xs py-3 text-center">No users available.</p>}
            {nonAdminUsers.map((u: any) => {
              const checked = selectedIds.includes(u._id);
              return (
                <button key={u._id} type="button" onClick={() => toggle(u._id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${checked ? "bg-primary/10 border-primary/30" : "bg-secondary/30 border-border hover:bg-secondary/50"}`}>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                    {checked && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/30 to-purple-600/30 flex items-center justify-center font-bold text-xs text-indigo-300 shrink-0">
                    {u.name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{u.name}</div>
                    <div className="text-xs text-muted-foreground">Member</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="text-sm text-red-400 mb-3 flex items-center gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" />{error}</p>}
        {done && <p className="text-sm text-emerald-400 mb-3 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 shrink-0" />Group created! Members can now chat.</p>}

        <Button onClick={handleCreate} variant="gradient" className="w-full h-10" disabled={loading || done}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : "Create Group Chat"}
        </Button>
      </motion.div>
    </div>
  );
}

// ── Manage Group Modal ────────────────────────────────────────
function ManageGroupModal({ group, users, token, onClose, onUpdated }: {
  group: any; users: any[]; token: string; onClose: () => void; onUpdated: (g: any) => void;
}) {
  const [groupName, setGroupName]     = useState(group.name || "");
  const [avatarUrl, setAvatarUrl]     = useState(group.avatar || "");
  const [selectedAddIds, setSelectedAddIds] = useState<string[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState("");

  const existingIds = new Set((group.participants || []).map((p: any) => p._id || p));
  const availableUsers = users.filter((u: any) => !existingIds.has(u._id) && u.role !== "admin");

  const toggleAdd = (id: string) =>
    setSelectedAddIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleSave = async () => {
    setError(""); setLoading(true);
    try {
      const res = await fetch(`/api/chats/group/${group._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: groupName.trim(), avatar: avatarUrl, addUserIds: selectedAddIds }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Failed"); }
      const updated = await res.json();
      onUpdated(updated);
      setSuccess("Group updated!"); setSelectedAddIds([]);
      setTimeout(onClose, 1200);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, y: 40, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }}
        className="w-full max-w-md bg-card border border-border rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold">Manage Group</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Group identity preview */}
        <div className="flex items-center gap-4 mb-5 p-3 bg-secondary/30 rounded-2xl border border-border">
          {avatarUrl ? (
            <img src={avatarUrl} alt={groupName || group.name} className="w-14 h-14 rounded-2xl object-cover border border-border shrink-0"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/30 to-purple-600/30 border border-indigo-500/20 flex items-center justify-center font-bold text-2xl text-indigo-300 shrink-0">
              {(groupName || group.name)?.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="font-bold">{groupName || group.name}</div>
            <div className="text-xs text-muted-foreground">{(group.participants || []).length} members</div>
          </div>
        </div>

        {/* Group name */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <MessagesSquare className="w-3.5 h-3.5" /> Group Name
          </label>
          <Input
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
            placeholder="Enter group name…"
            className="h-10 text-sm font-medium"
          />
        </div>

        {/* Photo URL */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <Image className="w-3.5 h-3.5" /> Group Photo URL
          </label>
          <Input
            value={avatarUrl}
            onChange={e => setAvatarUrl(e.target.value)}
            placeholder="https://example.com/photo.jpg"
            className="h-10 text-sm"
          />
          {avatarUrl && (
            <div className="mt-2 flex items-center gap-2">
              <img src={avatarUrl} alt="preview" className="w-10 h-10 rounded-xl object-cover border border-border"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <span className="text-xs text-muted-foreground">Preview</span>
            </div>
          )}
        </div>

        {/* Current members */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <UserCheck className="w-3.5 h-3.5" /> Current Members ({(group.participants || []).length})
          </label>
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {(group.participants || []).map((p: any) => (
              <div key={p._id || p} className="flex items-center gap-2.5 px-3 py-2 bg-secondary/30 rounded-xl border border-border">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/30 to-purple-600/30 flex items-center justify-center font-bold text-xs text-indigo-300 shrink-0">
                  {(p.name || "?")?.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.name || "Unknown"}</div>
                  <div className="text-xs text-muted-foreground truncate">{p.email || ""}</div>
                </div>
                {p.role === "admin" && <span className="text-xs text-amber-400 font-semibold shrink-0">Admin</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Add members */}
        {availableUsers.length > 0 && (
          <div className="mb-5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <UserX className="w-3.5 h-3.5" /> Add Members {selectedAddIds.length > 0 && <span className="text-primary">({selectedAddIds.length} selected)</span>}
            </label>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {availableUsers.map((u: any) => {
                const checked = selectedAddIds.includes(u._id);
                return (
                  <button key={u._id} type="button" onClick={() => toggleAdd(u._id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${checked ? "bg-primary/10 border-primary/30" : "bg-secondary/30 border-border hover:bg-secondary/50"}`}>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                      {checked && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/30 to-purple-600/30 flex items-center justify-center font-bold text-xs text-indigo-300 shrink-0">
                      {u.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{u.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {availableUsers.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3 mb-4">All registered users are already in this group.</p>
        )}

        {error && <p className="text-red-400 text-xs mb-3 text-center">{error}</p>}
        {success && <p className="text-emerald-400 text-xs mb-3 text-center">{success}</p>}

        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1 h-10" onClick={onClose}>Cancel</Button>
          <Button variant="gradient" className="flex-1 h-10" onClick={handleSave} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            Save Changes
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main Admin Component ──────────────────────────────────────
export default function Admin() {
  const { user, login } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("requests");
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groups, setGroups] = useState<any[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [managingGroup, setManagingGroup] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingRequest, setEditingRequest] = useState<any>(null);
  const [requestingPaymentFor, setRequestingPaymentFor] = useState<any>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [, navigate] = useLocation();

  const isAdminUrl = new URLSearchParams(window.location.search).get("admin") === "true";
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isAdmin && !isAdminUrl) navigate("/");
  }, [isAdmin, isAdminUrl]);

  useEffect(() => {
    const onReset = () => setActiveTab("requests");
    window.addEventListener("admin:reset", onReset);
    return () => window.removeEventListener("admin:reset", onReset);
  }, []);

  const fetchGroups = async () => {
    const token = localStorage.getItem("nutterx_token");
    if (!token) return;
    setGroupsLoading(true);
    try {
      const res = await fetch("/api/chats/admin/groups", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGroups(Array.isArray(data) ? data : []);
      } else {
        console.warn("fetchGroups failed:", res.status, await res.text());
      }
    } catch (err) {
      console.error("fetchGroups error:", err);
    } finally {
      setGroupsLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchGroups();
  }, [isAdmin]);

  // Re-fetch whenever the groups tab becomes active
  useEffect(() => {
    if (activeTab === "groups") fetchGroups();
  }, [activeTab]);

  const { data: requests, isLoading: reqLoading } = useAdminGetRequests({ query: { queryKey: getAdminGetRequestsQueryKey(), enabled: isAdmin } });
  const { data: users, isLoading: usersLoading, refetch: refetchUsers } = useAdminGetUsers({ query: { queryKey: getAdminGetUsersQueryKey(), enabled: isAdmin } });
  const { data: subscriptions } = useAdminGetSubscriptions({ query: { queryKey: getAdminGetSubscriptionsQueryKey(), enabled: isAdmin } });
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

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Delete user "${userName}" and all their data? This cannot be undone.`)) return;
    setDeletingUserId(userId);
    try {
      const token = localStorage.getItem("nutterx_token");
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      toast({ title: `User "${userName}" deleted` });
      refetchUsers();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/requests"] });
    } catch {
      toast({ variant: "destructive", title: "Failed to delete user" });
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleExport = () => {
    if (!requests) return;
    exportAsPNG(requests as any[]);
  };

  if (!isAdmin && isAdminUrl) return <AdminLoginGate onSuccess={handleAdminLoginSuccess} />;
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

        {/* Tabs — scrollable on mobile */}
        <div className="flex gap-1.5 mb-6 bg-secondary/30 p-1.5 rounded-2xl border border-border overflow-x-auto w-full">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); if (tab.id === "groups") fetchGroups(); }}
              className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                activeTab === tab.id ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(" ")[0]}</span>
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
                              {(req as any).paymentStatus === "paid" ? `✓ Paid KES ${(req as any).paymentAmount?.toLocaleString()}` : `⏳ Awaiting KES ${(req as any).paymentAmount?.toLocaleString()}`}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                          <StatusBadge status={req.status || "pending"} />
                          {req.subscriptionEndsAt && <CountdownTimer endsAt={req.subscriptionEndsAt} compact />}
                          <button onClick={() => setRequestingPaymentFor(req)}
                            className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors flex items-center gap-1.5">
                            <Banknote className="w-3.5 h-3.5" /> Request Payment
                          </button>
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
                <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
                  <div>
                    <h2 className="text-lg font-bold">Registered Users</h2>
                    <span className="text-sm text-muted-foreground">{users?.length || 0} members</span>
                  </div>
                  <button
                    onClick={() => setShowGroupModal(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 text-sm font-semibold hover:bg-indigo-500/20 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    New Group Chat
                  </button>
                </div>
                {showGroupModal && (
                  <CreateGroupModal
                    users={users || []}
                    onClose={() => setShowGroupModal(false)}
                    token={localStorage.getItem("nutterx_token") || ""}
                  />
                )}
                {usersLoading ? (
                  <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
                ) : (
                  <div className="space-y-2.5">
                    {[...(users || [])].sort((a, b) => (a.name || "").localeCompare(b.name || "")).map((u, i) => (
                      <motion.div key={u._id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                        className="p-4 bg-secondary/30 rounded-xl border border-border flex items-center gap-3 hover:bg-secondary/50 transition-colors">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/30 to-purple-600/30 border border-indigo-500/20 flex items-center justify-center font-bold text-base shrink-0 text-indigo-300">
                          {u.name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm">{u.name}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                          <div className="text-xs text-muted-foreground opacity-60 mt-0.5">Joined {formatDate((u as any).createdAt)}</div>
                        </div>
                        <button
                          onClick={() => handleDeleteUser(u._id!, u.name!)}
                          disabled={deletingUserId === u._id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50 shrink-0"
                        >
                          {deletingUserId === u._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          <span className="hidden sm:inline">Delete</span>
                        </button>
                      </motion.div>
                    ))}
                    {!users?.length && <p className="text-muted-foreground text-center py-8">No users yet.</p>}
                  </div>
                )}
              </motion.div>
            )}

            {/* GROUPS */}
            {activeTab === "groups" && (
              <motion.div key="groups" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
                <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
                  <div>
                    <h2 className="text-lg font-bold">Group Chats</h2>
                    <span className="text-sm text-muted-foreground">{groups.length} group{groups.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={fetchGroups}
                      disabled={groupsLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary border border-border text-sm font-semibold hover:bg-secondary/80 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${groupsLoading ? "animate-spin" : ""}`} /> Refresh
                    </button>
                    <button
                      onClick={() => setShowGroupModal(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 text-sm font-semibold hover:bg-indigo-500/20 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> New Group
                    </button>
                  </div>
                </div>

                {showGroupModal && (
                  <CreateGroupModal
                    users={users || []}
                    onClose={() => { setShowGroupModal(false); fetchGroups(); }}
                    token={localStorage.getItem("nutterx_token") || ""}
                  />
                )}

                {managingGroup && (
                  <ManageGroupModal
                    group={managingGroup}
                    users={users || []}
                    token={localStorage.getItem("nutterx_token") || ""}
                    onClose={() => setManagingGroup(null)}
                    onUpdated={(updated) => setGroups(prev => prev.map(g => g._id === updated._id ? updated : g))}
                  />
                )}

                {groupsLoading ? (
                  <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
                ) : groups.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12">No group chats yet. Create one above.</p>
                ) : (
                  <div className="space-y-3">
                    {groups.map((g, i) => (
                      <motion.div key={g._id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                        className="p-4 bg-secondary/30 rounded-xl border border-border flex items-center gap-4 hover:bg-secondary/50 transition-colors">
                        {g.avatar ? (
                          <img src={g.avatar} alt={g.name} className="w-12 h-12 rounded-xl object-cover border border-border shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/30 to-purple-600/30 border border-indigo-500/20 flex items-center justify-center font-bold text-xl text-indigo-300 shrink-0">
                            {g.name?.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm">{g.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {(g.participants || []).length} members · Created {formatDate(g.createdAt)}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {(g.participants || []).slice(0, 5).map((p: any) => (
                              <span key={p._id || p} className="text-xs px-2 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground">
                                {p.name || "User"}
                              </span>
                            ))}
                            {(g.participants || []).length > 5 && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground">
                                +{(g.participants || []).length - 5} more
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => setManagingGroup(g)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/20 transition-colors shrink-0"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Manage
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* DEADLINES */}
            {activeTab === "deadlines" && (
              <motion.div key="deadlines" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
                <h2 className="text-lg font-bold mb-5">Active Deadlines</h2>
                <div className="space-y-3">
                  {subscriptions?.map(sub => (
                    <div key={sub._id} className="p-4 bg-gradient-to-r from-blue-900/20 to-transparent rounded-xl border border-blue-500/20 flex justify-between items-center flex-wrap gap-3">
                      <div>
                        <div className="font-bold">{sub.serviceName}</div>
                        <div className="text-xs text-blue-300 mt-0.5">Client: {(sub.user as any)?.name}</div>
                        <div className="mt-2"><StatusBadge status={(sub as any).status || "in_progress"} /></div>
                      </div>
                      <CountdownTimer endsAt={sub.subscriptionEndsAt!} compact />
                    </div>
                  ))}
                  {(!subscriptions?.length) && <p className="text-muted-foreground text-center py-12">No active deadlines set.</p>}
                </div>
              </motion.div>
            )}

            {/* SERVICES */}
            {activeTab === "services" && <ServicesManager key="services" />}

            {/* PAYMENTS */}
            {activeTab === "payments" && <PaymentsPanel key="payments" />}

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

      {/* Request Payment Modal */}
      <AnimatePresence>
        {requestingPaymentFor && (
          <RequestPaymentModal
            request={requestingPaymentFor}
            onClose={() => setRequestingPaymentFor(null)}
            onSent={() => {
              toast({ title: "Payment request sent", description: `${requestingPaymentFor.user?.name || "Client"} will see the request in their dashboard.` });
              queryClient.invalidateQueries({ queryKey: getAdminGetRequestsQueryKey() });
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
