import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useGetMyRequests, useGetServices, useCreateRequest } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CountdownTimer } from "@/components/shared/CountdownTimer";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Plus, Clock, FileText, CheckCircle, Loader2, X,
  MessageSquare, Globe, TrendingUp, Send, ShoppingCart, Zap,
  ChevronRight, Smartphone, Lock, CheckCircle2, AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

const serviceIcons: Record<string, React.ReactNode> = {
  MessageSquare: <MessageSquare className="w-5 h-5" />,
  Share2: <MessageSquare className="w-5 h-5" />,
  Globe: <Globe className="w-5 h-5" />,
  TrendingUp: <TrendingUp className="w-5 h-5" />,
  Send: <Send className="w-5 h-5" />,
  ShoppingCart: <ShoppingCart className="w-5 h-5" />,
};

const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
  Automation:  { bg: "bg-blue-500/10",   text: "text-blue-400",   border: "border-blue-500/20" },
  Marketing:   { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20" },
  Development: { bg: "bg-emerald-500/10",text: "text-emerald-400",border: "border-emerald-500/20" },
  General:     { bg: "bg-amber-500/10",  text: "text-amber-400",  border: "border-amber-500/20" },
};

const staggerContainer = { animate: { transition: { staggerChildren: 0.06 } } };
const fadeItem = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

// ── Payment Modal ────────────────────────────────────────────
type PaymentStep = "phone" | "waiting" | "success" | "failed";

function PaymentModal({ request, onClose, onPaid }: { request: any; onClose: () => void; onPaid: () => void }) {
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<PaymentStep>("phone");
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState("");
  const { toast } = useToast();

  const initiatePayment = async () => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length < 9) { setError("Enter a valid phone number (e.g. 0712345678)"); return; }
    setError(""); setStep("waiting");

    try {
      const token = localStorage.getItem("nutterx_token");
      const res = await fetch("/api/payment/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId: request._id, phone: cleaned }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Payment failed");
      setOrderId(data.orderTrackingId || "");
    } catch (err: any) {
      setStep("phone");
      setError(err.message || "Could not initiate payment");
    }
  };

  useEffect(() => {
    if (step !== "waiting" || !orderId) return;
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const token = localStorage.getItem("nutterx_token");
        const res = await fetch(`/api/payment/status/${request._id}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (data.paymentStatus === "paid") {
          clearInterval(interval);
          setStep("success");
          onPaid();
          toast({ title: "Payment confirmed!", description: "Your M-Pesa payment was received." });
        } else if (data.paymentStatus === "failed" || attempts >= 36) {
          clearInterval(interval);
          setStep("failed");
        }
      } catch { /* keep polling */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [step, orderId]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget && step !== "waiting") onClose(); }}>
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="bg-card border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md shadow-2xl"
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-10 h-1 rounded-full bg-border" /></div>

        <div className="p-6">
          {/* Service info */}
          <div className="flex items-center gap-3 mb-6 p-3.5 bg-secondary/40 rounded-xl border border-border">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="font-semibold text-sm">{request.serviceName}</div>
              <div className="text-xs text-muted-foreground">Amount due: <span className="font-bold text-emerald-400">KES {request.paymentAmount?.toLocaleString()}</span></div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {step === "phone" && (
              <motion.div key="phone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="text-center mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
                    <Smartphone className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold">Pay via M-Pesa</h3>
                  <p className="text-sm text-muted-foreground mt-1">Enter your M-Pesa phone number to receive a payment prompt</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">M-Pesa Phone Number</label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">🇰🇪 +254</div>
                      <input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="0712 345 678"
                        className="w-full h-12 rounded-xl bg-secondary/50 border border-border pl-[72px] pr-4 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                        maxLength={12}
                      />
                    </div>
                  </div>
                  <AnimatePresence>
                    {error && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
                        <AlertCircle className="w-4 h-4 shrink-0" />{error}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-xs text-emerald-400/80 leading-relaxed">
                    An STK push will be sent to your phone. Enter your M-Pesa PIN to complete the payment of <strong>KES {request.paymentAmount?.toLocaleString()}</strong>.
                  </div>
                  <div className="flex gap-2.5">
                    <Button variant="outline" className="flex-1 h-11" onClick={onClose}>Cancel</Button>
                    <Button variant="gradient" className="flex-1 h-11 gap-2" onClick={initiatePayment}>
                      <Lock className="w-4 h-4" /> Send STK Push
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {step === "waiting" && (
              <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-6">
                <div className="relative w-20 h-20 mx-auto mb-5">
                  <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Smartphone className="w-8 h-8 text-primary" />
                  </div>
                </div>
                <h3 className="text-lg font-bold mb-2">Awaiting your PIN</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  A prompt has been sent to <strong className="text-foreground">{phone}</strong>.<br />
                  Enter your M-Pesa PIN to confirm <strong className="text-emerald-400">KES {request.paymentAmount?.toLocaleString()}</strong>.
                </p>
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Checking payment status every 5 seconds…
                </div>
              </motion.div>
            )}

            {step === "success" && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6">
                <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-emerald-400 mb-2">Payment Confirmed!</h3>
                <p className="text-sm text-muted-foreground">Your payment of <strong className="text-foreground">KES {request.paymentAmount?.toLocaleString()}</strong> has been received.</p>
                <Button variant="gradient" className="mt-6 w-full h-11" onClick={onClose}>Done</Button>
              </motion.div>
            )}

            {step === "failed" && (
              <motion.div key="failed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-6">
                <div className="w-20 h-20 rounded-full bg-red-500/10 border-2 border-red-500/50 flex items-center justify-center mx-auto mb-4">
                  <X className="w-10 h-10 text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-red-400 mb-2">Payment Failed</h3>
                <p className="text-sm text-muted-foreground">The payment was not completed. Please try again or contact support.</p>
                <div className="flex gap-2.5 mt-6">
                  <Button variant="outline" className="flex-1 h-11" onClick={onClose}>Close</Button>
                  <Button variant="gradient" className="flex-1 h-11" onClick={() => setStep("phone")}>Try Again</Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: requests, isLoading: requestsLoading, refetch } = useGetMyRequests();
  const { data: services, isLoading: servicesLoading } = useGetServices();
  const [selectedService, setSelectedService] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [payingRequest, setPayingRequest] = useState<any>(null);
  const createRequest = useCreateRequest();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset } = useForm();

  const openModal = (service?: any) => { setSelectedService(service || null); setIsModalOpen(true); };
  const closeModal = () => { setIsModalOpen(false); setSelectedService(null); reset(); };

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
    r => r.subscriptionEndsAt && new Date(r.subscriptionEndsAt) > new Date()
  ) || [];

  const pendingPayments = requests?.filter(
    r => (r as any).paymentRequired && (r as any).paymentStatus !== "paid"
  ) || [];

  // Auto-prompt payment on first load if there's an unpaid completed request
  useEffect(() => {
    if (!requestsLoading && pendingPayments.length > 0 && !payingRequest) {
      const unpaidCompleted = pendingPayments.find(r => r.status === "completed");
      if (unpaidCompleted) setPayingRequest(unpaidCompleted);
    }
  }, [requestsLoading]);

  const stats = [
    { label: "Total",       value: requests?.length || 0,                                          color: "text-foreground",  bg: "bg-secondary/60" },
    { label: "Pending",     value: requests?.filter(r => r.status === "pending").length || 0,      color: "text-amber-400",   bg: "bg-amber-500/8" },
    { label: "In Progress", value: requests?.filter(r => r.status === "in_progress").length || 0,  color: "text-blue-400",    bg: "bg-blue-500/8" },
    { label: "Completed",   value: requests?.filter(r => r.status === "completed").length || 0,    color: "text-emerald-400", bg: "bg-emerald-500/8" },
  ];

  return (
    <div className="min-h-screen pt-16 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Welcome, {user?.name?.split(" ")[0]}</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage your services and track progress</p>
          </div>
          <div className="flex gap-2.5">
            <Button variant="outline" size="sm" onClick={() => navigate("/chat")} className="gap-2 h-9">
              <MessageSquare className="w-3.5 h-3.5" /> Support
            </Button>
            <Button variant="gradient" size="sm" onClick={() => openModal()} className="gap-2 h-9">
              <Plus className="w-3.5 h-3.5" /> New Request
            </Button>
          </div>
        </div>

        {/* Pending Payment Banner */}
        <AnimatePresence>
          {pendingPayments.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-amber-400">Payment Required</div>
                  <div className="text-xs text-muted-foreground">
                    {pendingPayments.length} service{pendingPayments.length > 1 ? "s require" : " requires"} payment. Complete payment to activate your service.
                  </div>
                </div>
              </div>
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white border-0 h-8 shrink-0" onClick={() => setPayingRequest(pendingPayments[0])}>
                Pay Now
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats */}
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {stats.map(stat => (
            <motion.div key={stat.label} variants={fadeItem} className={cn("rounded-2xl p-4 border border-border", stat.bg)}>
              <div className={cn("text-3xl font-bold tracking-tight", stat.color)}>{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-1 font-medium">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* Active Subscriptions */}
        {activeSubscriptions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" /> Active Service Timers
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeSubscriptions.map(sub => (
                <motion.div key={sub._id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-border rounded-2xl p-5 relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-primary to-indigo-500" />
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="font-semibold text-sm">{sub.serviceName}</div>
                      <StatusBadge status={sub.status || "in_progress"} />
                    </div>
                  </div>
                  <CountdownTimer endsAt={sub.subscriptionEndsAt!} compact />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Available Services */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-3.5 h-3.5" /> Available Services
            </h2>
            <span className="text-xs text-muted-foreground">Tap to request</span>
          </div>
          {servicesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-48 rounded-2xl bg-secondary/40 animate-pulse" />)}
            </div>
          ) : (
            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {services?.map(service => {
                const colors = categoryColors[service.category || "General"] || categoryColors.General;
                return (
                  <motion.div key={service._id} variants={fadeItem} whileHover={{ y: -3 }} onClick={() => openModal(service)}
                    className="group bg-card border border-border hover:border-primary/40 rounded-2xl p-5 cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 flex flex-col">
                    <div className="flex items-start justify-between mb-3">
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center border", colors.bg, colors.text, colors.border)}>
                        {serviceIcons[service.icon || ""] || <Zap className="w-5 h-5" />}
                      </div>
                      {service.popular && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-full border border-primary/20 uppercase tracking-wider">Popular</span>
                      )}
                    </div>
                    <h3 className="font-bold text-sm mb-1.5 group-hover:text-primary transition-colors">{service.title}</h3>
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2 flex-1 leading-relaxed">{service.description}</p>
                    {service.features?.slice(0, 2).map((f: string, i: number) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />{f}
                      </div>
                    ))}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                      <span className="font-bold text-sm">
                        {service.price ? `$${service.price}` : "Custom"}
                        <span className="text-xs font-normal text-muted-foreground"> /project</span>
                      </span>
                      <span className={cn("text-xs font-semibold flex items-center gap-1 group-hover:text-primary transition-colors", colors.text)}>
                        Request <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>

        {/* My Requests */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-4">
            <FileText className="w-3.5 h-3.5" /> My Requests
          </h2>
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            {requestsLoading ? (
              <div className="p-10 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
            ) : !requests?.length ? (
              <div className="p-12 text-center text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium">No requests yet</p>
                <p className="text-sm mt-1 opacity-70">Choose a service above to get started</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {requests.map((req, i) => {
                  const needsPayment = (req as any).paymentRequired && (req as any).paymentStatus !== "paid";
                  const isPaid = (req as any).paymentStatus === "paid";
                  return (
                    <motion.div key={req._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-secondary/20 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{req.serviceName}</span>
                          <StatusBadge status={req.status || "pending"} />
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">{req.description}</p>
                        <div className="text-xs text-muted-foreground/60 mt-1">Submitted {formatDate(req.createdAt!)}</div>
                        {req.adminNotes && (
                          <div className="text-xs text-primary/80 mt-1.5 bg-primary/5 rounded-lg px-2.5 py-1.5 border border-primary/10">
                            Note: {req.adminNotes}
                          </div>
                        )}
                        {isPaid && (
                          <div className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Paid — KES {(req as any).paymentAmount?.toLocaleString()}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {req.subscriptionEndsAt && <CountdownTimer endsAt={req.subscriptionEndsAt} compact />}
                        {needsPayment && (
                          <button
                            onClick={() => setPayingRequest(req)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors"
                          >
                            <Smartphone className="w-3.5 h-3.5" />
                            Pay KES {(req as any).paymentAmount?.toLocaleString()}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Request Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
            <motion.div
              initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="bg-card border border-border w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl">
              <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-10 h-1 rounded-full bg-border" /></div>
              <div className="p-6">
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h2 className="text-lg font-bold">{selectedService ? selectedService.title : "Custom Request"}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{selectedService ? selectedService.description : "Tell us what you need"}</p>
                  </div>
                  <button onClick={closeModal} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary transition-colors text-muted-foreground ml-4 shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  {!selectedService && (
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Service Name *</label>
                      <input type="text" className="w-full h-11 rounded-xl bg-secondary/50 border border-border px-4 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                        placeholder="e.g. Custom React App" {...register("customServiceName", { required: !selectedService })} />
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Description *</label>
                    <textarea className="w-full rounded-xl bg-secondary/50 border border-border p-3 text-sm min-h-[100px] focus:outline-none focus:border-primary/50 resize-none transition-colors"
                      placeholder="Describe your project goals..." {...register("description", { required: true })} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Requirements (optional)</label>
                    <textarea className="w-full rounded-xl bg-secondary/50 border border-border p-3 text-sm min-h-[70px] focus:outline-none focus:border-primary/50 resize-none transition-colors"
                      placeholder="Any specific requirements or deadlines..." {...register("requirements")} />
                  </div>
                  <div className="flex gap-3 pt-1">
                    <Button type="button" variant="outline" onClick={closeModal} className="flex-1 h-11">Cancel</Button>
                    <Button type="submit" variant="gradient" disabled={createRequest.isPending} className="flex-1 h-11">
                      {createRequest.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</> : "Submit Request"}
                    </Button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <AnimatePresence>
        {payingRequest && (
          <PaymentModal
            request={payingRequest}
            onClose={() => setPayingRequest(null)}
            onPaid={() => { refetch(); queryClient.invalidateQueries({ queryKey: ["/api/requests"] }); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
