import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useGetMyRequests, useGetServices, useCreateRequest } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CountdownTimer } from "@/components/shared/CountdownTimer";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Plus, Clock, FileText, CheckCircle, Loader2, X,
  MessageSquare, Globe, TrendingUp, Send, ShoppingCart, Zap
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

const serviceIcons: Record<string, React.ReactNode> = {
  MessageSquare: <MessageSquare className="w-6 h-6" />,
  Share2: <MessageSquare className="w-6 h-6" />,
  Globe: <Globe className="w-6 h-6" />,
  TrendingUp: <TrendingUp className="w-6 h-6" />,
  Send: <Send className="w-6 h-6" />,
  ShoppingCart: <ShoppingCart className="w-6 h-6" />,
};

const categoryColors: Record<string, string> = {
  Automation: "from-blue-500/20 to-cyan-500/20 border-blue-500/20 text-blue-400",
  Marketing: "from-purple-500/20 to-pink-500/20 border-purple-500/20 text-purple-400",
  Development: "from-emerald-500/20 to-teal-500/20 border-emerald-500/20 text-emerald-400",
  General: "from-amber-500/20 to-orange-500/20 border-amber-500/20 text-amber-400",
};

export default function Dashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: requests, isLoading: requestsLoading } = useGetMyRequests();
  const { data: services, isLoading: servicesLoading } = useGetServices();

  const [selectedService, setSelectedService] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const createRequest = useCreateRequest();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset } = useForm();

  const openModal = (service?: any) => {
    setSelectedService(service || null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedService(null);
    reset();
  };

  const onSubmit = async (data: any) => {
    try {
      await createRequest.mutateAsync({
        data: {
          serviceId: selectedService?._id,
          serviceName: selectedService?.title || data.customServiceName,
          description: data.description,
          requirements: data.requirements || "",
        },
      });
      toast({ title: "Request submitted!", description: "We'll get back to you shortly." });
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to submit", description: err.message });
    }
  };

  const activeSubscriptions = requests?.filter(
    r => r.status === "completed" && r.subscriptionEndsAt && new Date(r.subscriptionEndsAt) > new Date()
  ) || [];

  const stats = {
    total: requests?.length || 0,
    pending: requests?.filter(r => r.status === "pending").length || 0,
    inProgress: requests?.filter(r => r.status === "in_progress").length || 0,
    completed: requests?.filter(r => r.status === "completed").length || 0,
  };

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back, {user?.name}</h1>
          <p className="text-muted-foreground mt-1">Manage your services and track progress.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate("/chat")} className="gap-2">
            <MessageSquare className="w-4 h-4" /> Support Chat
          </Button>
          <Button variant="gradient" onClick={() => openModal()} className="gap-2">
            <Plus className="w-4 h-4" /> Custom Request
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {[
          { label: "Total Requests", value: stats.total, color: "text-white" },
          { label: "Pending", value: stats.pending, color: "text-amber-400" },
          { label: "In Progress", value: stats.inProgress, color: "text-blue-400" },
          { label: "Completed", value: stats.completed, color: "text-emerald-400" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="glass-panel rounded-2xl p-5 border border-white/5"
          >
            <div className={cn("text-3xl font-bold", stat.color)}>{stat.value}</div>
            <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Active Subscriptions */}
      {activeSubscriptions.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" /> Active Subscriptions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {activeSubscriptions.map(sub => (
              <motion.div
                key={sub._id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel p-6 rounded-2xl relative overflow-hidden border border-emerald-500/20"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-emerald-500" />
                <h3 className="font-bold text-lg mb-4">{sub.serviceName}</h3>
                <CountdownTimer endsAt={sub.subscriptionEndsAt!} />
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Available Services */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" /> Available Services
          </h2>
          <span className="text-sm text-muted-foreground">Click a service to request it</span>
        </div>

        {servicesLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {services?.map((service, i) => {
              const colorClass = categoryColors[service.category || "General"] || categoryColors["General"];
              return (
                <motion.div
                  key={service._id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-panel rounded-2xl p-6 border border-white/5 hover:border-white/10 transition-all group cursor-pointer hover:shadow-2xl hover:shadow-primary/5 flex flex-col"
                  onClick={() => openModal(service)}
                >
                  {/* Icon + Category */}
                  <div className="flex items-start justify-between mb-4">
                    <div className={cn(
                      "w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center border",
                      colorClass
                    )}>
                      {serviceIcons[service.icon || ""] || <Zap className="w-6 h-6" />}
                    </div>
                    {service.popular && (
                      <span className="text-xs font-semibold px-2.5 py-1 bg-primary/20 text-primary rounded-full border border-primary/20">
                        Popular
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-lg mb-2 group-hover:text-primary transition-colors">{service.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2 flex-1">{service.description}</p>

                  {/* Features */}
                  {service.features && service.features.length > 0 && (
                    <ul className="space-y-1.5 mb-5">
                      {service.features.slice(0, 3).map((f: string, fi: number) => (
                        <li key={fi} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          {f}
                        </li>
                      ))}
                      {service.features.length > 3 && (
                        <li className="text-xs text-muted-foreground pl-5">+{service.features.length - 3} more</li>
                      )}
                    </ul>
                  )}

                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-white/5">
                    {service.price ? (
                      <span className="text-lg font-bold text-white">
                        ${service.price}<span className="text-xs font-normal text-muted-foreground">/project</span>
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Custom pricing</span>
                    )}
                    <Button
                      size="sm"
                      variant="gradient"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); openModal(service); }}
                    >
                      Request
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* My Requests */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5 shadow-2xl">
        <div className="p-6 border-b border-white/5 bg-black/20">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> My Requests
          </h2>
        </div>

        {requestsLoading ? (
          <div className="p-10 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !requests?.length ? (
          <div className="p-14 text-center text-muted-foreground flex flex-col items-center">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
              <FileText className="w-7 h-7 opacity-30" />
            </div>
            <p className="text-lg">No requests yet</p>
            <p className="text-sm mt-1 opacity-60">Choose a service above to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {requests.map(req => (
              <div
                key={req._id}
                className="p-5 hover:bg-white/[0.02] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="font-semibold">{req.serviceName}</h4>
                    <StatusBadge status={req.status || "pending"} />
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1">{req.description}</p>
                  <div className="text-xs text-muted-foreground mt-1.5">
                    Submitted {formatDate(req.createdAt!)}
                  </div>
                  {req.adminNotes && (
                    <div className="text-xs text-blue-400 italic mt-1.5">
                      Admin: "{req.adminNotes}"
                    </div>
                  )}
                </div>
                {req.status === "completed" && req.subscriptionEndsAt && (
                  <div className="shrink-0">
                    <CountdownTimer endsAt={req.subscriptionEndsAt} compact />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Request Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-panel p-8 rounded-3xl w-full max-w-xl relative shadow-2xl border border-white/10 bg-[#0c1222]"
            >
              <button onClick={closeModal} className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors text-muted-foreground">
                <X className="w-4 h-4" />
              </button>

              <h2 className="text-2xl font-bold mb-1">
                {selectedService ? `Request: ${selectedService.title}` : "Custom Request"}
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                {selectedService ? selectedService.description : "Tell us what you need"}
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {!selectedService && (
                  <div>
                    <label className="block text-sm font-medium mb-2 text-white/80">Service Name *</label>
                    <input
                      type="text"
                      className="w-full h-12 rounded-xl bg-black/40 border border-white/10 px-4 text-white focus:outline-none focus:border-primary/50 transition-colors"
                      placeholder="e.g. Custom React App"
                      {...register("customServiceName", { required: !selectedService })}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-2 text-white/80">Project Description *</label>
                  <textarea
                    className="w-full rounded-xl bg-black/40 border border-white/10 p-4 text-white min-h-[120px] focus:outline-none focus:border-primary/50 resize-none transition-colors"
                    placeholder="Describe your project goals and what you need..."
                    {...register("description", { required: true })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-white/80">Special Requirements</label>
                  <textarea
                    className="w-full rounded-xl bg-black/40 border border-white/10 p-4 text-white min-h-[80px] focus:outline-none focus:border-primary/50 resize-none transition-colors"
                    placeholder="Any specific requirements, deadlines, or notes..."
                    {...register("requirements")}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
                  <Button type="submit" variant="gradient" disabled={createRequest.isPending} className="min-w-[130px]">
                    {createRequest.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
                    ) : "Submit Request"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
