import { useEffect, useState } from "react";
import { CountdownTimer } from "@/components/shared/CountdownTimer";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { motion } from "framer-motion";
import { Users, TrendingUp, Clock, Award } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

const listVariants = {
  animate: { transition: { staggerChildren: 0.07 } },
};
const itemVariants = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function Clients() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/auth");
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    const token = localStorage.getItem("nutterx_token");
    if (!token) return;
    fetch("/api/admin/clients", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => { setClients(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const totalActive = clients.filter(c => c.status === "in_progress").length;
  const totalCompleted = clients.filter(c => c.status === "completed").length;

  const serviceColors: Record<string, string> = {
    "WhatsApp Bot Setup": "from-green-500/20 to-emerald-500/20 border-emerald-500/30 text-emerald-400",
    "Social Media Management": "from-purple-500/20 to-pink-500/20 border-purple-500/30 text-purple-400",
    "Website Development": "from-blue-500/20 to-indigo-500/20 border-indigo-500/30 text-indigo-400",
    "SEO Optimization": "from-amber-500/20 to-orange-500/20 border-amber-500/30 text-amber-400",
    "Telegram Bot Development": "from-sky-500/20 to-blue-500/20 border-sky-500/30 text-sky-400",
    "E-commerce Setup": "from-red-500/20 to-rose-500/20 border-red-500/30 text-red-400",
  };

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 text-sm text-primary font-medium mb-4">
          <Users className="w-4 h-4" /> Live Client Activity
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold mb-3">
          Our <span className="text-gradient-primary">Clients</span>
        </h1>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto">
          See all active and completed projects on the platform — real work, real deadlines.
        </p>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-3 gap-4 mb-10"
      >
        {[
          { icon: Users, label: "Total Projects", value: clients.length, color: "text-blue-400" },
          { icon: TrendingUp, label: "In Progress", value: totalActive, color: "text-amber-400" },
          { icon: Award, label: "Completed", value: totalCompleted, color: "text-emerald-400" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 + i * 0.07 }}
            className="glass-panel rounded-2xl p-5 text-center border border-white/5"
          >
            <stat.icon className={`w-6 h-6 mx-auto mb-2 ${stat.color}`} />
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* Client Cards */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : clients.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Clock className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg">No active projects yet</p>
          <p className="text-sm mt-1">Projects will appear here once work begins</p>
        </div>
      ) : (
        <motion.div
          variants={listVariants}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {clients.map(client => {
            const colorClass = serviceColors[client.serviceName] || "from-slate-500/20 to-slate-600/20 border-slate-500/30 text-slate-400";
            return (
              <motion.div
                key={client._id}
                variants={itemVariants}
                whileHover={{ y: -4, scale: 1.01 }}
                className="glass-panel rounded-3xl p-6 border border-white/5 shadow-xl flex flex-col gap-4"
              >
                {/* Service badge */}
                <div className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-gradient-to-r border w-fit ${colorClass}`}>
                  {client.serviceName}
                </div>

                {/* User */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border border-border flex items-center justify-center font-bold text-sm">
                    {client.user?.name?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{client.user?.name || "Unknown"}</div>
                    <div className="text-xs text-muted-foreground">Client</div>
                  </div>
                  <div className="ml-auto">
                    <StatusBadge status={client.status} />
                  </div>
                </div>

                {/* Countdown or completion */}
                {client.subscriptionEndsAt ? (
                  <div className="bg-black/20 rounded-2xl p-3">
                    <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> Service Deadline
                    </div>
                    <CountdownTimer endsAt={client.subscriptionEndsAt} compact />
                  </div>
                ) : (
                  <div className="bg-black/20 rounded-2xl p-3 text-xs text-muted-foreground">
                    Deadline not yet set
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
