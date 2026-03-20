import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAdminGetUsers, useAdminGetRequests, useAdminUpdateRequest, useAdminGetSubscriptions, useCreateService } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CountdownTimer } from "@/components/shared/CountdownTimer";
import { formatDate } from "@/lib/utils";
import {
  Users, FileText, Activity, ShieldAlert, Plus, Lock, Eye, EyeOff,
  AlertCircle, Download, UserPlus, Calendar, CheckCircle2, X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const TABS = [
  { id: "requests", label: "Requests", icon: FileText },
  { id: "users", label: "Users", icon: Users },
  { id: "subscriptions", label: "Deadlines", icon: Activity },
  { id: "adduser", label: "Add User", icon: UserPlus },
] as const;

type Tab = typeof TABS[number]["id"];

// ---------- Admin Login Gate ----------
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
        <div className="glass-panel rounded-3xl p-8 border border-white/10 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <motion.div
              animate={{ rotate: [0, -6, 6, -6, 0] }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4"
            >
              <ShieldAlert className="w-8 h-8 text-red-400" />
            </motion.div>
            <h1 className="text-2xl font-bold">Admin Access</h1>
            <p className="text-sm text-muted-foreground mt-1 text-center">
              Restricted area — enter admin credentials
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                Admin Username
              </label>
              <Input
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter admin username"
                className="bg-white/5 border-white/10 h-11"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                Admin Key
              </label>
              <div className="relative">
                <Input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type={showPass ? "text" : "password"}
                  placeholder="Enter admin key"
                  className="bg-white/5 border-white/10 h-11 pr-10"
                  autoComplete="current-password"
                  required
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
            <Button type="submit" variant="gradient" className="w-full h-11 mt-2" disabled={loading}>
              {loading
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Authenticating...</>
                : <><Lock className="w-4 h-4 mr-2" />Access Dashboard</>}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

// ---------- Deadline Picker Modal ----------
function DeadlineModal({ request, onClose, onSave }: { request: any; onClose: () => void; onSave: (id: string, data: any) => void }) {
  const [deadline, setDeadline] = useState(
    request.subscriptionEndsAt
      ? new Date(request.subscriptionEndsAt).toISOString().split("T")[0]
      : ""
  );
  const [status, setStatus] = useState(request.status);
  const [notes, setNotes] = useState(request.adminNotes || "");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="glass-panel rounded-3xl p-6 w-full max-w-md border border-white/10 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold">Update Request</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-4">
          <div className="p-3 bg-black/20 rounded-xl border border-white/5">
            <div className="font-semibold text-sm">{request.serviceName}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{request.user?.name} — {request.user?.email}</div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50"
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress (Working)</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Service Deadline
            </label>
            <Input
              type="date"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              className="bg-black/40 border-white/10 h-11"
              min={new Date().toISOString().split("T")[0]}
            />
            <p className="text-xs text-muted-foreground mt-1">Set the deadline — countdown starts immediately</p>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Admin Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Notes visible to user..."
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button
              variant="gradient"
              className="flex-1"
              onClick={() => {
                onSave(request._id, {
                  status,
                  adminNotes: notes,
                  ...(deadline ? { subscriptionEndsAt: new Date(deadline).toISOString() } : {}),
                });
                onClose();
              }}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" /> Save
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------- Add User Form ----------
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
    setError(""); setSuccess("");
    setLoading(true);
    try {
      const token = localStorage.getItem("nutterx_token");
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Failed to create user"); return; }
      setSuccess(`User "${data.name}" created! They can log in with their email and password.`);
      setName(""); setEmail(""); setPassword("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
      <h2 className="text-xl font-bold mb-6">Add New User</h2>
      <div className="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Full Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" className="bg-black/20 border-white/10 h-11" required />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Email (Login Username)</label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" className="bg-black/20 border-white/10 h-11" required />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Password</label>
            <div className="relative">
              <Input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="bg-black/20 border-white/10 h-11 pr-10"
                minLength={6}
                required
              />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
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
          <Button type="submit" variant="gradient" className="w-full h-11" disabled={loading}>
            {loading
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Creating...</>
              : <><UserPlus className="w-4 h-4 mr-2" />Create User</>}
          </Button>
        </form>
      </div>
    </motion.div>
  );
}

// ---------- Main Admin Component ----------
export default function Admin() {
  const { user, login } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("requests");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingRequest, setEditingRequest] = useState<any>(null);
  const isAdminUrl = new URLSearchParams(window.location.search).get("admin") === "true";
  const isAdmin = user?.role === "admin";

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
    const token = localStorage.getItem("nutterx_token");
    const url = `/api/admin/export`;
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", "nutterx-clients.csv");
    const headers = new Headers({ Authorization: `Bearer ${token}` });
    fetch(url, { headers })
      .then(r => r.blob())
      .then(blob => {
        const href = URL.createObjectURL(blob);
        a.href = href;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(href);
      });
  };

  if (!isAdmin && isAdminUrl) {
    return <AdminLoginGate onSuccess={handleAdminLoginSuccess} />;
  }

  if (!isAdmin) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <ShieldAlert className="w-16 h-16 text-red-400 mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-bold text-red-400">Access Denied</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Add <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded">?admin=true</code> to the URL.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.4 }}
      className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
    >
      {/* Header */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
        className="flex items-center justify-between gap-3 mb-8 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">Nutterx Technologies — Internal</p>
          </div>
        </div>
        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          <Button variant="ghost" onClick={handleExport} className="border border-white/10 gap-2">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </motion.div>
      </motion.div>

      {/* Tabs */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="flex gap-1.5 mb-8 bg-black/20 p-1.5 rounded-2xl w-fit border border-white/5 shadow-inner flex-wrap">
        {TABS.map((tab, i) => (
          <motion.button
            key={tab.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.05 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.id ? "text-white shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            {activeTab === tab.id && (
              <motion.div layoutId="adminActiveTab" className="absolute inset-0 bg-primary rounded-xl"
                transition={{ type: "spring", stiffness: 300, damping: 30 }} />
            )}
            <tab.icon className="w-4 h-4 relative z-10" />
            <span className="relative z-10">{tab.label}</span>
          </motion.button>
        ))}
      </motion.div>

      {/* Content */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
        className="glass-panel p-6 rounded-3xl border border-white/5 shadow-2xl min-h-[500px]">
        <AnimatePresence mode="wait">

          {/* REQUESTS */}
          {activeTab === "requests" && (
            <motion.div key="requests" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Service Requests</h2>
                <span className="text-sm text-muted-foreground">{requests?.length || 0} total</span>
              </div>
              {reqLoading ? (
                <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : !requests?.length ? (
                <p className="text-center text-muted-foreground py-12">No service requests yet.</p>
              ) : (
                <div className="space-y-3">
                  {requests.map((req, i) => (
                    <motion.div
                      key={req._id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="p-4 bg-black/20 rounded-2xl border border-white/5 flex items-center gap-4 flex-wrap"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm">{req.serviceName}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {req.user?.name} · {req.user?.email} · {formatDate(req.createdAt!)}
                        </div>
                        {req.adminNotes && (
                          <div className="text-xs text-blue-300 mt-1 bg-blue-500/5 rounded-lg px-2 py-1">{req.adminNotes}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap shrink-0">
                        <StatusBadge status={req.status || "pending"} />
                        {req.subscriptionEndsAt && (
                          <CountdownTimer endsAt={req.subscriptionEndsAt} compact />
                        )}
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setEditingRequest(req)}
                          className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/20 transition-colors flex items-center gap-1.5"
                        >
                          <Calendar className="w-3.5 h-3.5" /> Manage
                        </motion.button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* USERS */}
          {activeTab === "users" && (
            <motion.div key="users" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Registered Users</h2>
                <span className="text-sm text-muted-foreground">{users?.length || 0} users</span>
              </div>
              {usersLoading ? (
                <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : (
                <motion.div
                  initial="initial" animate="animate"
                  variants={{ animate: { transition: { staggerChildren: 0.05 } } }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                >
                  {users?.map(u => (
                    <motion.div
                      key={u._id}
                      variants={{ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } }}
                      whileHover={{ scale: 1.02, y: -2 }}
                      className="p-4 bg-black/20 rounded-2xl border border-white/5 flex items-center gap-3"
                    >
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-base shrink-0">
                        {u.name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm truncate">{u.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      </div>
                    </motion.div>
                  ))}
                  {!users?.length && <p className="text-muted-foreground col-span-3 text-center py-8">No users yet.</p>}
                </motion.div>
              )}
            </motion.div>
          )}

          {/* SUBSCRIPTIONS / DEADLINES */}
          {activeTab === "subscriptions" && (
            <motion.div key="subscriptions" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
              <h2 className="text-xl font-bold mb-6">Active Deadlines & Countdowns</h2>
              <motion.div
                initial="initial" animate="animate"
                variants={{ animate: { transition: { staggerChildren: 0.06 } } }}
                className="space-y-4"
              >
                {subscriptions?.map((sub, i) => (
                  <motion.div
                    key={sub._id}
                    variants={{ initial: { opacity: 0, x: -12 }, animate: { opacity: 1, x: 0 } }}
                    whileHover={{ x: 4 }}
                    className="p-5 bg-gradient-to-r from-blue-900/20 to-transparent rounded-2xl border border-blue-500/20 flex justify-between items-center flex-wrap gap-4"
                  >
                    <div>
                      <div className="font-bold text-lg">{sub.serviceName}</div>
                      <div className="text-sm text-blue-300 mt-0.5">Client: {(sub.user as any)?.name}</div>
                      <div className="mt-2"><StatusBadge status={sub.status || "in_progress"} /></div>
                    </div>
                    <CountdownTimer endsAt={sub.subscriptionEndsAt!} compact />
                  </motion.div>
                ))}
                {(!subscriptions || subscriptions.length === 0) && (
                  <p className="text-muted-foreground text-center py-12">No active deadlines set.</p>
                )}
              </motion.div>
            </motion.div>
          )}

          {/* ADD USER */}
          {activeTab === "adduser" && (
            <AddUserForm key="adduser" />
          )}

        </AnimatePresence>
      </motion.div>

      {/* Deadline Modal */}
      <AnimatePresence>
        {editingRequest && (
          <DeadlineModal
            request={editingRequest}
            onClose={() => setEditingRequest(null)}
            onSave={handleUpdateRequest}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
