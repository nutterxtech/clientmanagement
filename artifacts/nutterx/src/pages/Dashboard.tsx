import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useGetMyRequests, useGetServices, useCreateRequest, useGetChats, getGetChatsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CountdownTimer } from "@/components/shared/CountdownTimer";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Plus, Clock, FileText, CheckCircle, Loader2, X,
  MessageSquare, Globe, TrendingUp, Send, ShoppingCart, Zap,
  ChevronRight, Smartphone, Lock, CheckCircle2, AlertCircle, Award,
  CalendarClock, ArrowUpRight, DollarSign, RefreshCw, Banknote, Bell
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
type PaymentStep = "phone" | "sending" | "pesapal" | "waiting" | "success" | "failed";

function PaymentModal({ request, onClose, onPaid }: { request: any; onClose: () => void; onPaid: () => void }) {
  const [step, setStep] = useState<PaymentStep>("phone");
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const { toast } = useToast();

  const initiatePayment = async () => {
    setError(""); setStep("sending");

    try {
      const token = localStorage.getItem("nutterx_token");
      const res = await fetch("/api/payment/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId: request._id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Payment failed");
      setOrderId(data.orderTrackingId || "");
      setRedirectUrl(data.redirectUrl || "");
      setStep("pesapal");
    } catch (err: any) {
      setStep("phone");
      setError(err.message || "Could not initiate payment");
    }
  };

  // Poll as soon as an order exists (both during pesapal and waiting steps)
  useEffect(() => {
    if (!orderId || step === "phone" || step === "sending" || step === "success" || step === "failed") return;
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
        } else if (data.paymentStatus === "failed" || attempts >= 72) {
          clearInterval(interval);
          setStep("failed");
        }
      } catch { /* keep polling */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [orderId, step]);

  const isPesapal = step === "pesapal";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget && step !== "waiting" && step !== "sending") onClose(); }}>
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={cn(
          "bg-card border border-border rounded-t-3xl sm:rounded-3xl w-full shadow-2xl",
          isPesapal ? "sm:max-w-lg" : "sm:max-w-md"
        )}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-10 h-1 rounded-full bg-border" /></div>

        <div className={cn("p-6", isPesapal && "p-4")}>
          {/* Header bar when showing Pesapal iframe */}
          {isPesapal ? (
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-base">Complete M-Pesa Payment</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Enter your number in the form below &amp; tap <strong>Proceed</strong>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1">
                  KES {request.paymentAmount?.toLocaleString()}
                </div>
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary/60 flex items-center justify-center hover:bg-secondary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* Service info for non-iframe steps */
            <div className="flex items-center gap-3 mb-6 p-3.5 bg-secondary/40 rounded-xl border border-border">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="font-semibold text-sm">{request.serviceName}</div>
                <div className="text-xs text-muted-foreground">Amount due: <span className="font-bold text-emerald-400">KES {request.paymentAmount?.toLocaleString()}</span></div>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {step === "phone" && (
              <motion.div key="phone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="text-center mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
                    <Smartphone className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold">Pay via M-Pesa</h3>
                  <p className="text-sm text-muted-foreground mt-1">Tap below to open the secure M-Pesa payment form</p>
                </div>
                <div className="space-y-4">
                  <AnimatePresence>
                    {error && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
                        <AlertCircle className="w-4 h-4 shrink-0" />{error}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-xs text-emerald-400/80 leading-relaxed">
                    A secure M-Pesa payment form will open. Enter your phone number and tap <strong>Proceed</strong> to receive the M-Pesa prompt.
                  </div>
                  <div className="flex gap-2.5">
                    <Button variant="outline" className="flex-1 h-11" onClick={onClose}>Cancel</Button>
                    <Button variant="gradient" className="flex-1 h-11 gap-2" onClick={initiatePayment}>
                      <Lock className="w-4 h-4" /> Pay KES {request.paymentAmount?.toLocaleString()}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {step === "sending" && (
              <motion.div key="sending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-6">
                <div className="relative w-20 h-20 mx-auto mb-5">
                  <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  </div>
                </div>
                <h3 className="text-lg font-bold mb-2">Preparing payment…</h3>
                <p className="text-sm text-muted-foreground">Opening secure M-Pesa payment form.</p>
              </motion.div>
            )}

            {step === "pesapal" && redirectUrl && (
              <motion.div key="pesapal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="rounded-xl overflow-hidden border border-border bg-white" style={{ height: 480 }}>
                  <iframe
                    src={redirectUrl}
                    width="100%"
                    height="100%"
                    style={{ border: "none", display: "block" }}
                    title="M-Pesa Payment"
                    allow="payment"
                  />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Waiting for payment…
                  </div>
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 shrink-0" onClick={() => setStep("waiting")}>
                    <Smartphone className="w-3.5 h-3.5" /> I've submitted
                  </Button>
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
                <h3 className="text-lg font-bold mb-2">Check your phone</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  An M-Pesa prompt was sent to your phone.<br />
                  Enter your PIN to pay <strong className="text-emerald-400">KES {request.paymentAmount?.toLocaleString()}</strong>.
                </p>
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Confirming payment automatically…
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

// ── Membership Certificate PNG ───────────────────────────────
function downloadMembershipCertificate(user: any, requests: any[]) {
  const S    = 2;
  const LW   = 390;
  const W    = LW * S;
  const PAD  = 20;

  const allServices  = (requests || []);
  const paidServices = allServices.filter((r: any) => r.paymentStatus === "paid");
  const totalPaid    = paidServices.reduce((sum: number, r: any) => sum + (r.paymentAmount || 0), 0);

  const ROW_H    = 36;
  const HEADER_H = 170;
  const TABLE_H  = 28 + allServices.length * ROW_H + (allServices.length === 0 ? 36 : 0);
  const FOOTER_H = 100;
  const totalH   = HEADER_H + TABLE_H + FOOTER_H;
  const LH       = Math.max(totalH, 360);
  const H        = LH * S;

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(S, S);

  // ── Gold palette ──────────────────────────────
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

  // ── Background ────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, 0, LH);
  bg.addColorStop(0, CREAM);
  bg.addColorStop(0.5, "#fffef5");
  bg.addColorStop(1, PARCHMENT);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);

  // ── Outer gold border ─────────────────────────
  ctx.strokeStyle = GOLD_MID; ctx.lineWidth = 5;
  ctx.strokeRect(5, 5, LW - 10, LH - 10);

  // ── Inner dashed border ───────────────────────
  ctx.save();
  ctx.strokeStyle = GOLD_BRIGHT; ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(11, 11, LW - 22, LH - 22);
  ctx.setLineDash([]);
  ctx.restore();

  // ── Corner diamonds ───────────────────────────
  ([[14,14],[LW-14,14],[14,LH-14],[LW-14,LH-14]] as [number,number][]).forEach(([cx,cy]) => {
    ctx.fillStyle = GOLD_BRIGHT;
    ctx.beginPath();
    ctx.moveTo(cx, cy-5); ctx.lineTo(cx+5,cy); ctx.lineTo(cx,cy+5); ctx.lineTo(cx-5,cy);
    ctx.closePath(); ctx.fill();
  });

  // ── Diagonal watermark ────────────────────────
  ctx.save();
  ctx.translate(LW/2, LH/2 + 20);
  ctx.rotate(-32 * Math.PI / 180);
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = GOLD_DARK;
  ctx.font = "bold 52px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("NUTTERX", 0, 0);
  ctx.font = "bold 24px sans-serif";
  ctx.fillText("TECHNOLOGIES", 0, 40);
  ctx.restore();

  // ── Header: Logo badge ────────────────────────
  const LCX = LW / 2, LCY = 32, LR = 18;
  const lgGrad = ctx.createRadialGradient(LCX-4, LCY-4, 2, LCX, LCY, LR);
  lgGrad.addColorStop(0, GOLD_BRIGHT); lgGrad.addColorStop(0.6, GOLD_MID); lgGrad.addColorStop(1, GOLD_DARK);
  ctx.fillStyle = lgGrad;
  ctx.beginPath(); ctx.arc(LCX, LCY, LR, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = GOLD_BRIGHT; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(LCX, LCY, LR+3, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = TEXT_DARK; ctx.font = "bold 15px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("N", LCX, LCY + 6);

  // ── Company name ──────────────────────────────
  const gTitle = ctx.createLinearGradient(LW*0.2, 0, LW*0.8, 0);
  gTitle.addColorStop(0, GOLD_DARK); gTitle.addColorStop(0.5, GOLD_BRIGHT); gTitle.addColorStop(1, GOLD_DARK);
  ctx.fillStyle = gTitle; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("NUTTERX TECHNOLOGIES", LCX, 70);

  // ── "MEMBERSHIP CERTIFICATE" subtitle ────────
  ctx.fillStyle = TEXT_MID; ctx.font = "9px sans-serif";
  ctx.fillText("MEMBERSHIP  CERTIFICATE", LCX, 84);

  // ── Ornament line ─────────────────────────────
  const ornY = 93;
  ctx.strokeStyle = GOLD_MID; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(PAD+30, ornY); ctx.lineTo(LW/2-14, ornY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(LW/2+14, ornY); ctx.lineTo(LW-PAD-30, ornY); ctx.stroke();
  ctx.fillStyle = GOLD_BRIGHT;
  ctx.beginPath(); ctx.moveTo(LW/2,ornY-4); ctx.lineTo(LW/2+5,ornY); ctx.lineTo(LW/2,ornY+4); ctx.lineTo(LW/2-5,ornY); ctx.closePath(); ctx.fill();

  // ── Member name (large) ───────────────────────
  ctx.textAlign = "center";
  const nameGrad = ctx.createLinearGradient(LW*0.1, 0, LW*0.9, 0);
  nameGrad.addColorStop(0, GOLD_DARK); nameGrad.addColorStop(0.5, "#a06800"); nameGrad.addColorStop(1, GOLD_DARK);
  ctx.fillStyle = nameGrad; ctx.font = "bold 18px sans-serif";
  ctx.fillText((user?.name || "Member").toUpperCase(), LCX, 118);

  // ── "This certifies that..." text ────────────
  ctx.fillStyle = TEXT_MID; ctx.font = "8px sans-serif";
  ctx.fillText("This certifies that the above named is a registered member of Nutterx Technologies", LCX, 132);

  // ── Member ID + Date ──────────────────────────
  const memberId = `NTX-${(user?._id || "").toString().slice(-6).toUpperCase() || "000000"}`;
  const joinDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-KE", { day:"2-digit", month:"long", year:"numeric" })
    : new Date().toLocaleDateString("en-KE", { day:"2-digit", month:"long", year:"numeric" });
  ctx.fillStyle = GOLD_DARK; ctx.font = "bold 8px sans-serif";
  ctx.textAlign = "left";  ctx.fillText(`Member ID: ${memberId}`, PAD + 4, 148);
  ctx.textAlign = "right"; ctx.fillText(`Member since: ${joinDate}`, LW - PAD - 4, 148);

  // ── Divider ───────────────────────────────────
  ctx.strokeStyle = GOLD_LIGHT; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(PAD, 156); ctx.lineTo(LW-PAD, 156); ctx.stroke();

  // ── "ACTIVE SERVICES" table label ───────────────
  ctx.fillStyle = TEXT_MID; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("ACTIVE SERVICES & DEADLINES", PAD + 4, 168);

  // ── Table header ──────────────────────────────
  const tableTop = HEADER_H;
  const CW     = LW - PAD * 2;
  const C_NUM    = { x: PAD,       w: 18 };
  const C_SVC    = { x: PAD + 18,  w: 168 };
  const C_STATUS = { x: PAD + 186, w: 80 };
  const C_DATE   = { x: PAD + 266, w: CW - 266 };

  const thBg = ctx.createLinearGradient(0, tableTop, LW, tableTop);
  thBg.addColorStop(0, GOLD_DARK); thBg.addColorStop(0.5, GOLD_MID); thBg.addColorStop(1, GOLD_DARK);
  ctx.fillStyle = thBg;
  ctx.beginPath(); ctx.roundRect(PAD, tableTop, CW, 28, [5,5,0,0]); ctx.fill();

  ctx.fillStyle = PARCHMENT; ctx.font = "bold 7.5px sans-serif";
  const heads: { label: string; cx: number; align: CanvasTextAlign }[] = [
    { label: "#",        cx: C_NUM.x + C_NUM.w/2,       align: "center" },
    { label: "SERVICE",  cx: C_SVC.x + 4,               align: "left"   },
    { label: "STATUS",   cx: C_STATUS.x + 4,            align: "left"   },
    { label: "DEADLINE", cx: C_DATE.x + 4,              align: "left"   },
  ];
  heads.forEach(h => { ctx.textAlign = h.align; ctx.fillText(h.label, h.cx, tableTop + 19); });
  ctx.textAlign = "left";

  const fmtDate = (d: string | undefined) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-KE", { day:"2-digit", month:"short", year:"numeric" });
  };
  const trunc = (s: string, n: number) => !s ? "—" : s.length > n ? s.slice(0,n)+"…" : s;
  const statusLabel: Record<string, string> = {
    pending:     "Pending",
    in_progress: "Running",
    completed:   "Completed",
    expired:     "Expired",
  };
  const statusColor: Record<string, string> = {
    pending:     "#b87000",
    in_progress: "#1a5ca8",
    completed:   "#0a7a30",
    expired:     "#9b2020",
  };

  const resolveStatus = (r: any): string => {
    if (r.subscriptionEndsAt && new Date(r.subscriptionEndsAt) < new Date()) return "expired";
    return r.status || "pending";
  };

  // ── Service rows ──────────────────────────────
  if (allServices.length === 0) {
    ctx.fillStyle = TEXT_MUTED; ctx.font = "8px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("No services yet", LCX, tableTop + 28 + 20);
    ctx.textAlign = "left";
  } else {
    allServices.forEach((r: any, i: number) => {
      const rowY   = tableTop + 28 + i * ROW_H;
      const isEven = i % 2 === 0;
      const MID    = rowY + ROW_H * 0.60;
      const status = resolveStatus(r);

      ctx.fillStyle = isEven ? CREAM : ROW_ALT;
      ctx.fillRect(PAD, rowY, CW, ROW_H);

      // Accent bar — color by status
      const barColor = statusColor[status] || GOLD_MID;
      ctx.fillStyle = barColor; ctx.fillRect(PAD, rowY, 3, ROW_H);

      ctx.strokeStyle = GOLD_LIGHT; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(PAD, rowY+ROW_H); ctx.lineTo(PAD+CW, rowY+ROW_H); ctx.stroke();

      // #
      ctx.fillStyle = GOLD_MID; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(String(i+1), C_NUM.x + C_NUM.w/2, MID);

      // Service name
      ctx.fillStyle = TEXT_DARK; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "left";
      ctx.fillText(trunc(r.serviceName, 22), C_SVC.x + 4, MID);

      // Status label
      ctx.fillStyle = barColor; ctx.font = "bold 7.5px sans-serif";
      ctx.fillText(statusLabel[status] || status, C_STATUS.x + 4, MID);

      // Deadline
      ctx.fillStyle = TEXT_MUTED; ctx.font = "7.5px sans-serif";
      ctx.fillText(fmtDate(r.subscriptionEndsAt), C_DATE.x + 4, MID);

      ctx.textAlign = "left";
    });
  }

  // Table outer border
  const tableBodyH = 28 + (allServices.length > 0 ? allServices.length * ROW_H : 36);
  ctx.strokeStyle = GOLD_MID; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(PAD, tableTop, CW, tableBodyH, [5,5,0,0]); ctx.stroke();

  // Column dividers
  ctx.strokeStyle = GOLD_LIGHT; ctx.lineWidth = 0.7;
  [C_SVC.x, C_STATUS.x, C_DATE.x].forEach(cx => {
    ctx.beginPath(); ctx.moveTo(cx, tableTop); ctx.lineTo(cx, tableTop + tableBodyH); ctx.stroke();
  });

  // ── Total paid ────────────────────────────────
  const totalY = tableTop + tableBodyH;
  const totBg  = ctx.createLinearGradient(0, totalY, LW, totalY);
  totBg.addColorStop(0, "#fae8a0"); totBg.addColorStop(1, "#fdf5d0");
  ctx.fillStyle = totBg; ctx.fillRect(PAD, totalY, CW, 28);
  ctx.strokeStyle = GOLD_MID; ctx.lineWidth = 1;
  ctx.strokeRect(PAD, totalY, CW, 28);
  ctx.fillStyle = TEXT_DARK; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("TOTAL PAID", PAD + 10, totalY + 18);
  const totGrad = ctx.createLinearGradient(LW*0.5, 0, LW*0.95, 0);
  totGrad.addColorStop(0, GOLD_DARK); totGrad.addColorStop(1, GOLD_BRIGHT);
  ctx.fillStyle = totGrad; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "right";
  ctx.fillText(`KES ${totalPaid.toLocaleString()}`, LW - PAD - 10, totalY + 18);
  ctx.textAlign = "left";

  // ── Footer ────────────────────────────────────
  const FY = totalY + 28;

  ctx.strokeStyle = GOLD_MID; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, FY + 14); ctx.lineTo(LW - PAD, FY + 14); ctx.stroke();

  // Seal
  const SC_X = LW - 46, SC_Y = FY + 54, SC_R = 28;
  const sealBg = ctx.createRadialGradient(SC_X-6, SC_Y-6, 3, SC_X, SC_Y, SC_R);
  sealBg.addColorStop(0, GOLD_LIGHT); sealBg.addColorStop(0.6, GOLD_MID); sealBg.addColorStop(1, GOLD_DARK);
  ctx.fillStyle = sealBg;
  ctx.beginPath(); ctx.arc(SC_X, SC_Y, SC_R, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = GOLD_BRIGHT; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(SC_X, SC_Y, SC_R-4, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = TEXT_DARK; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("N", SC_X, SC_Y + 7);
  ctx.fillStyle = CREAM; ctx.font = "5.5px sans-serif";
  ctx.fillText("MEMBER", SC_X, SC_Y + 19);

  // Footer text
  ctx.textAlign = "left";
  ctx.fillStyle = TEXT_DARK; ctx.font = "bold 8.5px sans-serif";
  ctx.fillText("Nutterx Technologies", PAD + 4, FY + 30);
  ctx.fillStyle = TEXT_MID; ctx.font = "7.5px sans-serif";
  ctx.fillText("Official Membership Certificate", PAD + 4, FY + 43);
  ctx.fillStyle = GOLD_MID; ctx.font = "7px sans-serif";
  ctx.fillText(`nutterx.tech  ·  Generated ${new Date().toLocaleDateString("en-KE")}`, PAD + 4, FY + 57);
  ctx.fillStyle = TEXT_MUTED; ctx.font = "6.5px sans-serif";
  ctx.fillText("This document is auto-generated and reflects live account data.", PAD + 4, FY + 70);

  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href = url;
    a.download = `nutterx-membership-${user?.name?.replace(/\s+/g,"-").toLowerCase() || "certificate"}.png`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }, "image/png");
}

// ── Admin Pay Request Modal ──────────────────────────────────
type AdminPayStep = "ready" | "sending" | "pesapal" | "waiting" | "success" | "failed";

function AdminPayRequestModal({ request, onClose, onPaid }: { request: any; onClose: () => void; onPaid: () => void }) {
  const [step, setStep]   = useState<AdminPayStep>("ready");
  const [iframeUrl, setIframeUrl] = useState("");
  const [extId, setExtId] = useState("");
  const [error, setError] = useState("");
  const { toast } = useToast();

  async function handlePay() {
    setStep("sending"); setError("");
    try {
      const token = localStorage.getItem("nutterx_token");
      const res   = await fetch(`/api/extensions/pay/${request._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to initiate payment");

      setExtId(data.extensionId);
      if (data.redirectUrl) {
        setIframeUrl(data.redirectUrl);
        setStep("pesapal");
      } else {
        setStep("waiting");
      }
    } catch (e: any) {
      setError(e.message);
      setStep("failed");
    }
  }

  useEffect(() => {
    if (step !== "waiting" && step !== "pesapal") return;
    if (!extId) return;
    const id = setInterval(async () => {
      try {
        const token = localStorage.getItem("nutterx_token");
        const res   = await fetch(`/api/extensions/status/${extId}`, { headers: { Authorization: `Bearer ${token}` } });
        const data  = await res.json();
        if (data.paymentStatus === "paid") {
          clearInterval(id);
          setStep("success");
          toast({ title: "Payment confirmed!", description: "Your service timer has been updated." });
          onPaid();
        } else if (data.paymentStatus === "failed") {
          clearInterval(id);
          setStep("failed");
          setError("Payment was not completed.");
        }
      } catch {}
    }, 4000);
    return () => clearInterval(id);
  }, [step, extId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-amber-500/30 rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Banknote className="w-5 h-5 text-amber-400" /> Payment Request
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>

        {step === "ready" && (
          <>
            <div className="bg-amber-500/8 border border-amber-500/25 rounded-xl p-4 mb-5 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                <Bell className="w-4 h-4" /> Nutterx has requested a payment
              </div>
              <div className="text-sm"><span className="text-muted-foreground">Service:</span> <span className="font-semibold">{request.serviceName}</span></div>
              <div className="text-sm"><span className="text-muted-foreground">Purpose:</span> {request.purpose}</div>
              <div className="text-sm"><span className="text-muted-foreground">Amount:</span> <span className="font-bold text-emerald-400">KES {(request.amount || 0).toLocaleString()}</span></div>
              <div className="text-sm"><span className="text-muted-foreground">Days added on payment:</span> <span className="font-bold text-primary">{request.adminRequestedDays} days</span></div>
              {request.adminMessage && (
                <div className="mt-2 pt-2 border-t border-amber-500/20 text-xs text-muted-foreground italic">"{request.adminMessage}"</div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-5">Once your payment is confirmed, <strong className="text-foreground">{request.adminRequestedDays} days</strong> will be added to your service timer automatically.</p>
            <button onClick={handlePay}
              className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold transition-all">
              <Banknote className="w-4 h-4" /> Pay KES {(request.amount || 0).toLocaleString()} via M-Pesa
            </button>
          </>
        )}

        {step === "sending" && (
          <div className="flex flex-col items-center py-8 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Setting up payment...</p>
          </div>
        )}

        {step === "pesapal" && iframeUrl && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground text-center">Complete your payment in the window below, then wait for confirmation.</p>
            <iframe src={iframeUrl} className="w-full rounded-xl border border-border" style={{ height: 420 }} title="Pesapal Payment" />
          </div>
        )}

        {(step === "pesapal" || step === "waiting") && (
          <div className="flex items-center gap-2 mt-4 p-3 rounded-xl bg-secondary/50 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> Waiting for payment confirmation…
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center py-8 gap-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            <p className="text-lg font-bold text-emerald-400">Payment confirmed!</p>
            <p className="text-sm text-muted-foreground text-center">Your service timer has been updated with the new days.</p>
            <button onClick={onClose} className="mt-2 px-6 py-2 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 transition-colors">Done</button>
          </div>
        )}

        {step === "failed" && (
          <div className="flex flex-col items-center py-8 gap-3">
            <AlertCircle className="w-12 h-12 text-red-400" />
            <p className="text-base font-bold text-red-400">Payment failed</p>
            {error && <p className="text-xs text-muted-foreground text-center">{error}</p>}
            <button onClick={() => setStep("ready")} className="mt-2 px-6 py-2 rounded-xl bg-secondary border border-border text-sm font-semibold hover:bg-secondary/80 transition-colors">Try again</button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Extend Service Modal ─────────────────────────────────────
type ExtStep = "form" | "sending" | "pesapal" | "waiting" | "success" | "failed";

function ExtendModal({ liveRequests, onClose }: { liveRequests: any[]; onClose: () => void }) {
  const [step, setStep]             = useState<ExtStep>("form");
  const [selectedId, setSelectedId] = useState(liveRequests[0]?._id || "");
  const [purpose, setPurpose]       = useState("");
  const [amount, setAmount]         = useState("");
  const [error, setError]           = useState("");
  const [extensionId, setExtId]     = useState("");
  const [redirectUrl, setRedirUrl]  = useState("");
  const { toast } = useToast();

  const selectedReq = liveRequests.find(r => r._id === selectedId);

  const handlePay = async () => {
    if (!selectedId || !purpose.trim() || !amount) { setError("Please fill in all fields."); return; }
    const amt = Number(amount);
    if (isNaN(amt) || amt < 1) { setError("Enter a valid amount (min KES 1)."); return; }
    setError(""); setStep("sending");
    try {
      const token = localStorage.getItem("nutterx_token");
      const res   = await fetch("/api/extensions/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ serviceRequestId: selectedId, purpose: purpose.trim(), amount: amt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Payment initiation failed");
      setExtId(data.extensionId);
      setRedirUrl(data.redirectUrl || "");
      setStep("pesapal");
    } catch (err: any) {
      setError(err.message); setStep("form");
    }
  };

  useEffect(() => {
    if (!extensionId || step === "form" || step === "sending" || step === "success" || step === "failed") return;
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const token = localStorage.getItem("nutterx_token");
        const res   = await fetch(`/api/extensions/status/${extensionId}`, { headers: { Authorization: `Bearer ${token}` } });
        const data  = await res.json();
        if (data.paymentStatus === "paid") {
          clearInterval(interval); setStep("success");
          toast({ title: "Payment received!", description: "Admin will confirm and update your deadline shortly." });
        } else if (data.paymentStatus === "failed" || attempts >= 72) {
          clearInterval(interval); setStep("failed");
        }
      } catch { /* keep polling */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [extensionId, step]);

  const isPesapal = step === "pesapal";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget && step !== "sending" && step !== "waiting") onClose(); }}>
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={cn("bg-card border border-border rounded-t-3xl sm:rounded-3xl w-full shadow-2xl", isPesapal ? "sm:max-w-lg" : "sm:max-w-md")}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-10 h-1 rounded-full bg-border" /></div>
        <div className={cn("p-6", isPesapal && "p-4")}>

          {/* Header */}
          {isPesapal ? (
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-base">Complete M-Pesa Payment</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Enter your number in the form below &amp; tap <strong>Proceed</strong></p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1">
                  KES {Number(amount).toLocaleString()}
                </div>
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary/60 flex items-center justify-center hover:bg-secondary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <CalendarClock className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Pay in Advance</h3>
                  <p className="text-xs text-muted-foreground">Extend or renew a live service</p>
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary/60 flex items-center justify-center hover:bg-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* Form step */}
            {step === "form" && (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                {/* Service picker */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Live Service</label>
                  <div className="space-y-2">
                    {liveRequests.map(r => (
                      <button key={r._id} type="button" onClick={() => setSelectedId(r._id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors",
                          selectedId === r._id ? "bg-indigo-500/10 border-indigo-500/30" : "bg-secondary/30 border-border hover:bg-secondary/50"
                        )}>
                        <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                          selectedId === r._id ? "bg-indigo-500 border-indigo-500" : "border-muted-foreground/40")}>
                          {selectedId === r._id && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{r.serviceName}</div>
                          {r.subscriptionEndsAt && (
                            <div className="text-xs text-muted-foreground">Deadline: {formatDate(r.subscriptionEndsAt)}</div>
                          )}
                        </div>
                        <span className="text-xs font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full shrink-0">Live</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Purpose */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">What is this payment for? *</label>
                  <textarea
                    value={purpose}
                    onChange={e => setPurpose(e.target.value)}
                    placeholder="e.g. Extend deadline by 30 days, Continue service for next month, Additional feature development..."
                    className="w-full rounded-xl bg-secondary/50 border border-border p-3 text-sm min-h-[80px] focus:outline-none focus:border-primary/50 resize-none transition-colors"
                  />
                </div>

                {/* Amount */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Amount (KES) *</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-sm">KES</span>
                    <input
                      type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)}
                      placeholder="0"
                      className="w-full h-11 rounded-xl bg-secondary/50 border border-border pl-14 pr-4 text-sm font-bold focus:outline-none focus:border-primary/50 transition-colors"
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />{error}
                  </div>
                )}

                {/* Info note */}
                <div className="p-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl text-xs text-indigo-300/80 leading-relaxed flex gap-2">
                  <ArrowUpRight className="w-4 h-4 shrink-0 mt-0.5 text-indigo-400" />
                  <span>After payment, the admin will review your request, confirm the payment, and update your service deadline accordingly.</span>
                </div>

                <div className="flex gap-2.5">
                  <Button variant="outline" className="flex-1 h-11" onClick={onClose}>Cancel</Button>
                  <Button variant="gradient" className="flex-1 h-11 gap-2" onClick={handlePay}>
                    <Lock className="w-4 h-4" /> Pay KES {amount ? Number(amount).toLocaleString() : "—"}
                  </Button>
                </div>
              </motion.div>
            )}

            {step === "sending" && (
              <motion.div key="sending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-8">
                <div className="relative w-20 h-20 mx-auto mb-5">
                  <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
                </div>
                <h3 className="text-lg font-bold mb-2">Preparing payment…</h3>
                <p className="text-sm text-muted-foreground">Opening secure M-Pesa payment form.</p>
              </motion.div>
            )}

            {step === "pesapal" && redirectUrl && (
              <motion.div key="pesapal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="rounded-xl overflow-hidden border border-border bg-white" style={{ height: 480 }}>
                  <iframe src={redirectUrl} width="100%" height="100%" style={{ border: "none", display: "block" }} title="M-Pesa Payment" />
                </div>
                <p className="text-xs text-muted-foreground text-center mt-3 flex items-center justify-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" /> Waiting for payment confirmation…
                </p>
              </motion.div>
            )}

            {step === "waiting" && (
              <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-8">
                <div className="relative w-20 h-20 mx-auto mb-5">
                  <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin" />
                </div>
                <h3 className="text-lg font-bold mb-2">Confirming payment…</h3>
                <p className="text-sm text-muted-foreground">Please wait while we verify your M-Pesa transaction.</p>
              </motion.div>
            )}

            {step === "success" && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-center py-8">
                <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold mb-2 text-emerald-400">Payment Received!</h3>
                <p className="text-sm text-muted-foreground mb-1">KES {Number(amount).toLocaleString()} for <strong>{selectedReq?.serviceName}</strong></p>
                <p className="text-xs text-muted-foreground mb-6">The admin has been notified and will update your deadline shortly.</p>
                <Button variant="gradient" className="h-11 px-8" onClick={onClose}>Done</Button>
              </motion.div>
            )}

            {step === "failed" && (
              <motion.div key="failed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-8">
                <div className="w-20 h-20 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center mx-auto mb-5">
                  <AlertCircle className="w-10 h-10 text-red-400" />
                </div>
                <h3 className="text-xl font-bold mb-2 text-red-400">Payment Failed</h3>
                <p className="text-sm text-muted-foreground mb-6">The payment could not be confirmed. Please try again.</p>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" className="h-10" onClick={onClose}>Close</Button>
                  <Button variant="gradient" className="h-10" onClick={() => { setStep("form"); setExtId(""); setRedirUrl(""); }}>Try Again</Button>
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
  const { data: chats } = useGetChats({ query: { queryKey: getGetChatsQueryKey(), staleTime: 30_000 } });
  const totalUnread = chats ? chats.reduce((s: number, c: any) => s + (c.unreadCount || 0), 0) : 0;
  const [selectedService, setSelectedService] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [payingRequest, setPayingRequest] = useState<any>(null);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [adminPayRequests, setAdminPayRequests] = useState<any[]>([]);
  const [payingAdminReq, setPayingAdminReq] = useState<any>(null);
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

  const liveRequests = requests?.filter(
    r => r.status === "in_progress" ||
         r.status === "completed" ||
         (r.subscriptionEndsAt && new Date(r.subscriptionEndsAt) > new Date())
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

  // Fetch admin-initiated payment requests
  const fetchAdminRequests = async () => {
    try {
      const token = localStorage.getItem("nutterx_token");
      const res   = await fetch("/api/extensions/my", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data: any[] = await res.json();
      setAdminPayRequests(data.filter(e => e.initiatedBy === "admin" && e.paymentStatus !== "paid" && e.paymentStatus !== "failed"));
    } catch {}
  };
  useEffect(() => { fetchAdminRequests(); }, []);

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
        <div className="mb-8">
          {/* Top row: greeting + action buttons */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Welcome back, <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(90deg,#075E54,#25D366)" }}>{user?.name?.split(" ")[0]}</span> 👋
              </h1>
              <p className="text-muted-foreground text-sm mt-1.5">Manage your services and track progress</p>
            </div>
            <div className="flex gap-2 flex-wrap shrink-0">
              <Button
                variant="outline" size="sm"
                onClick={() => downloadMembershipCertificate(user, requests || [])}
                className="gap-2 h-9 border-amber-500/40 text-amber-500 hover:bg-amber-500/8 hover:border-amber-500/60"
              >
                <Award className="w-3.5 h-3.5" /> My Certificate
              </Button>
              <Button variant="gradient" size="sm" onClick={() => openModal()} className="gap-2 h-9">
                <Plus className="w-3.5 h-3.5" /> New Request
              </Button>
            </div>
          </div>

          {/* "Connect with Friends" chat button */}
          <motion.button
            onClick={() => navigate("/chat")}
            animate={{
              boxShadow: [
                "0 0 0px 0px rgba(37,211,102,0)",
                "0 0 0px 10px rgba(37,211,102,0.18)",
                "0 0 0px 18px rgba(37,211,102,0.06)",
                "0 0 0px 0px rgba(37,211,102,0)",
              ],
            }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.97 }}
            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-white font-bold text-base shadow-xl relative overflow-hidden"
            style={{ background: "linear-gradient(100deg,#075E54 0%,#128C7E 40%,#25D366 100%)" }}
          >
            {/* Animated shine sweep */}
            <motion.div
              className="absolute inset-0 pointer-events-none"
              animate={{ x: ["-120%", "120%"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.5 }}
              style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)", width: "60%" }}
            />
            <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center shrink-0 shadow-inner">
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>
            <div className="flex-1 text-left">
              <div className="text-base font-bold leading-tight">Connect with Friends</div>
              <div className="text-white/75 text-xs font-normal mt-0.5">Chat · Support · Community</div>
            </div>
            <div className="shrink-0 flex items-center gap-2 text-white/80 text-sm font-semibold">
              {totalUnread > 0 && (
                <span className="min-w-[1.5rem] h-6 px-1.5 bg-red-500 rounded-full text-xs font-bold text-white flex items-center justify-center shadow-lg animate-pulse">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
              <span>Open Chat</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </motion.button>
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

        {/* ── Admin Payment Requests ───────────────────────────── */}
        <AnimatePresence>
          {adminPayRequests.map(req => (
            <motion.div key={req._id}
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="mb-4 rounded-2xl border border-amber-500/35 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent overflow-hidden">
              <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                  <Bell className="w-6 h-6 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-amber-300 flex items-center gap-1.5">
                    <Banknote className="w-4 h-4" /> Payment Requested by Nutterx
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    <span className="font-semibold text-foreground">{req.serviceName}</span> · KES <span className="font-bold text-amber-400">{(req.amount || 0).toLocaleString()}</span> · {req.adminRequestedDays} days added on payment
                  </div>
                  {req.adminMessage && (
                    <div className="text-xs text-muted-foreground mt-1 italic">"{req.adminMessage}"</div>
                  )}
                </div>
                <button
                  onClick={() => setPayingAdminReq(req)}
                  className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors shadow-lg shadow-amber-500/20">
                  <Banknote className="w-4 h-4" /> Pay Now
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* ── Pay in Advance / Extend Service ─────────────────── */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-8 rounded-2xl border border-indigo-500/25 bg-gradient-to-r from-indigo-500/8 via-indigo-500/5 to-transparent overflow-hidden">
          <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center shrink-0">
                <CalendarClock className="w-6 h-6 text-indigo-400" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-sm text-indigo-300">Pay in Advance to Extend Your Service</div>
                {liveRequests.length > 0 ? (
                  <>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Pay now to extend your deadline — admin will confirm and update it for you.
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {liveRequests.map(r => (
                        <span key={r._id} className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
                          {r.serviceName}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Available once you have an active (in-progress) service. Submit a request to get started.
                  </div>
                )}
              </div>
            </div>
            <Button
              onClick={() => setShowExtendModal(true)}
              disabled={liveRequests.length === 0}
              className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white border-0 h-10 px-5 gap-2 shrink-0 self-start sm:self-center"
            >
              <DollarSign className="w-4 h-4" /> Pay in Advance
            </Button>
          </div>
        </motion.div>

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
                        {service.price ? `KES ${service.price.toLocaleString()}` : "Custom"}
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

      {/* Extend Service Modal */}
      <AnimatePresence>
        {showExtendModal && liveRequests.length > 0 && (
          <ExtendModal
            liveRequests={liveRequests}
            onClose={() => setShowExtendModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Admin Payment Request Modal */}
      <AnimatePresence>
        {payingAdminReq && (
          <AdminPayRequestModal
            request={payingAdminReq}
            onClose={() => setPayingAdminReq(null)}
            onPaid={() => {
              setPayingAdminReq(null);
              fetchAdminRequests();
              refetch();
              queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
