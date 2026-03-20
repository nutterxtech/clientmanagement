import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAdminGetUsers, useAdminGetRequests, useAdminUpdateRequest, useAdminGetSubscriptions, useCreateService } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CountdownTimer } from "@/components/shared/CountdownTimer";
import { formatDate } from "@/lib/utils";
import { Users, FileText, Activity, ShieldAlert, Plus, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

const listVariants = {
  animate: { transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  initial: { opacity: 0, x: -12 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.3 } },
};

const TABS = [
  { id: "requests", label: "Service Requests", icon: FileText },
  { id: "users", label: "Users", icon: Users },
  { id: "subscriptions", label: "Active Subs", icon: Activity },
  { id: "services", label: "Catalog", icon: Plus },
] as const;

type Tab = typeof TABS[number]["id"];

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
      if (!res.ok) {
        setError(data.message || "Access denied");
        return;
      }
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
        initial={{ opacity: 0, scale: 0.92, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, type: "spring", stiffness: 200, damping: 22 }}
        className="w-full max-w-md"
      >
        <div className="glass-panel rounded-3xl p-8 border border-white/10 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <motion.div
              animate={{ rotate: [0, -5, 5, -5, 0] }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-700/20 border border-red-500/30 flex items-center justify-center mb-4"
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
                autoComplete="off"
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
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
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

            <Button
              type="submit"
              variant="gradient"
              className="w-full h-11 mt-2"
              disabled={loading}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              ) : (
                <Lock className="w-4 h-4 mr-2" />
              )}
              {loading ? "Authenticating..." : "Access Dashboard"}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

export default function Admin() {
  const { user, login } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("requests");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [adminGranted, setAdminGranted] = useState(false);
  const isAdminUrl = new URLSearchParams(window.location.search).get("admin") === "true";

  const isAdmin = user?.role === "admin";

  const { data: requests, isLoading: reqLoading } = useAdminGetRequests({ query: { enabled: isAdmin } });
  const { data: users, isLoading: usersLoading } = useAdminGetUsers({ query: { enabled: isAdmin } });
  const { data: subscriptions } = useAdminGetSubscriptions({ query: { enabled: isAdmin } });
  const updateRequestMutation = useAdminUpdateRequest();
  const createServiceMutation = useCreateService();

  const handleAdminLoginSuccess = (token: string) => {
    login(token);
    setAdminGranted(true);
  };

  if (!isAdmin && isAdminUrl) {
    return <AdminLoginGate onSuccess={handleAdminLoginSuccess} />;
  }

  if (!isAdmin) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen flex items-center justify-center"
      >
        <div className="text-center">
          <ShieldAlert className="w-16 h-16 text-red-400 mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-bold text-red-400">Access Denied</h2>
          <p className="text-muted-foreground mt-2">Admin access only. Add <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded">?admin=true</code> to the URL.</p>
        </div>
      </motion.div>
    );
  }

  const handleUpdateStatus = async (id: string, status: any, currentNotes: string = "") => {
    const notes = prompt("Add admin notes (optional):", currentNotes);
    if (notes === null) return;
    if (status === "completed") {
      const ok = window.confirm("Marking as completed will start the 30-day subscription timer. Proceed?");
      if (!ok) return;
    }
    try {
      await updateRequestMutation.mutateAsync({ id, data: { status, adminNotes: notes } });
      toast({ title: "Status updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/requests"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const handleCreateService = async () => {
    const title = prompt("Service Title:");
    if (!title) return;
    const priceStr = prompt("Price ($):");
    const price = parseInt(priceStr || "0");
    const description = prompt("Description:");
    try {
      await createServiceMutation.mutateAsync({
        data: { title, price, description: description || "", category: "General", features: [], popular: false, icon: "" },
      });
      toast({ title: "Service Created!" });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.4 }}
      className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
    >
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-3 mb-8"
      >
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <ShieldAlert className="w-6 h-6 text-red-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Admin Command Center</h1>
          <p className="text-sm text-muted-foreground">Nutterx Technologies — Internal dashboard</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="flex gap-2 mb-8 bg-black/20 p-1.5 rounded-2xl w-fit border border-white/5 shadow-inner"
      >
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
              activeTab === tab.id
                ? "text-white shadow-md"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeAdminTab"
                className="absolute inset-0 bg-primary rounded-xl"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
            <tab.icon className="w-4 h-4 relative z-10" />
            <span className="relative z-10">{tab.label}</span>
          </motion.button>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="glass-panel p-6 rounded-3xl border border-white/5 shadow-2xl min-h-[500px]"
      >
        <AnimatePresence mode="wait">
          {activeTab === "requests" && (
            <motion.div key="requests" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
              <h2 className="text-xl font-bold mb-6">Manage Service Requests</h2>
              {reqLoading ? (
                <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase bg-black/40 text-muted-foreground">
                      <tr>
                        <th className="px-6 py-4 rounded-tl-xl">User / Service</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4 rounded-tr-xl">Update Status</th>
                      </tr>
                    </thead>
                    <motion.tbody variants={listVariants} animate="animate" className="divide-y divide-white/5">
                      {requests?.map(req => (
                        <motion.tr key={req._id} variants={itemVariants} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-medium">{req.serviceName}</div>
                            <div className="text-muted-foreground text-xs mt-1">{req.user?.name} ({req.user?.email})</div>
                          </td>
                          <td className="px-6 py-4"><StatusBadge status={req.status || "pending"} /></td>
                          <td className="px-6 py-4 text-muted-foreground">{formatDate(req.createdAt!)}</td>
                          <td className="px-6 py-4">
                            <select
                              className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 focus:outline-none text-xs cursor-pointer hover:border-white/20 transition-colors"
                              value={req.status}
                              onChange={e => handleUpdateStatus(req._id!, e.target.value, req.adminNotes)}
                            >
                              <option value="pending">Pending</option>
                              <option value="in_progress">In Progress</option>
                              <option value="completed">Completed (Starts Timer)</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          </td>
                        </motion.tr>
                      ))}
                    </motion.tbody>
                  </table>
                  {(!requests || requests.length === 0) && (
                    <p className="text-center text-muted-foreground py-12">No service requests yet.</p>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "users" && (
            <motion.div key="users" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
              <h2 className="text-xl font-bold mb-6">Registered Users</h2>
              {usersLoading ? (
                <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : (
                <motion.div variants={listVariants} animate="animate" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {users?.map(u => (
                    <motion.div
                      key={u._id}
                      variants={itemVariants}
                      whileHover={{ scale: 1.02, y: -2 }}
                      className="p-4 bg-black/20 rounded-xl border border-white/5 flex items-center gap-4 cursor-default"
                    >
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-lg shrink-0">
                        {u.name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold flex items-center gap-2 flex-wrap">
                          <span className="truncate">{u.name}</span>
                          {u.role === "admin" && (
                            <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded-full uppercase shrink-0">Admin</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === "subscriptions" && (
            <motion.div key="subscriptions" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
              <h2 className="text-xl font-bold mb-6">Active Subscriptions</h2>
              <motion.div variants={listVariants} animate="animate" className="space-y-4">
                {subscriptions?.map(sub => (
                  <motion.div
                    key={sub._id}
                    variants={itemVariants}
                    whileHover={{ x: 4 }}
                    className="p-5 bg-gradient-to-r from-blue-900/20 to-transparent rounded-2xl border border-blue-500/20 flex justify-between items-center"
                  >
                    <div>
                      <div className="font-bold text-lg">{sub.serviceName}</div>
                      <div className="text-sm text-blue-300 mt-1">User: {sub.user?.name}</div>
                    </div>
                    <CountdownTimer endsAt={sub.subscriptionEndsAt!} compact />
                  </motion.div>
                ))}
                {(!subscriptions || subscriptions.length === 0) && (
                  <p className="text-muted-foreground text-center py-12">No active subscriptions currently.</p>
                )}
              </motion.div>
            </motion.div>
          )}

          {activeTab === "services" && (
            <motion.div key="services" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Service Catalog</h2>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button variant="gradient" size="sm" onClick={handleCreateService}>
                    <Plus className="w-4 h-4 mr-2" /> Add Service
                  </Button>
                </motion.div>
              </div>
              <p className="text-muted-foreground">Use the button above to add new services to the catalog visible to all users.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
