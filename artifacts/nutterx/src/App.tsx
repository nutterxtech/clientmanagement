import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navbar } from "@/components/layout/Navbar";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { usePushNotifications } from "@/hooks/use-push";
import Home from "@/pages/Home";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Chat from "@/pages/Chat";
import Admin from "@/pages/Admin";
import Clients from "@/pages/Clients";
import NotFound from "@/pages/not-found";

const originalFetch = window.fetch;
window.fetch = async (...args) => {
  let [resource, config] = args;
  if (typeof resource === "string" && resource.startsWith("/api")) {
    const token = localStorage.getItem("nutterx_token");
    if (token) {
      config = config || {};
      const headers = new Headers(config.headers as HeadersInit | undefined);
      headers.set("Authorization", `Bearer ${token}`);
      config.headers = headers;
    }
  }
  return originalFetch(resource, config);
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

function AnimatedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="flex-1 flex flex-col"
    >
      <Component />
    </motion.div>
  );
}

/* ── WhatsApp SVG ───────────────────────────────────────────── */
const WA_PATH = "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z";

/* ── Bot SVG icon ───────────────────────────────────────────── */
function BotIcon({ size = 24, color = "#25D366", opacity = 0.12 }: { size?: number; color?: string; opacity?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
      <rect x="3" y="7" width="18" height="13" rx="3" fill={color} />
      <circle cx="9" cy="13" r="2" fill="white" />
      <circle cx="15" cy="13" r="2" fill="white" />
      <path d="M9 20h6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 7V4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="3" r="1.5" fill={color} />
      <path d="M3 11h-2M23 11h-2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ── Gear / cog SVG ─────────────────────────────────────────── */
function GearIcon({ size = 24, color = "#128C7E", opacity = 0.1 }: { size?: number; color?: string; opacity?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

/* ── Floating particle data ─────────────────────────────────── */
type ParticleType = "wa" | "bot" | "gear" | "label";
interface Particle {
  id: number;
  type: ParticleType;
  x: number;   // vw %
  y: number;   // vh %
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  drift: [number, number];  // [dx vw, dy vh] drift range
  rotate: number;
  label?: string;
  color: string;
}

const BOT_NAMES = [
  "NutterBot","AutoX","RoboMate","BotCore","AIBot",
  "DataBot","AutoPilot","NutterAI","BotFlow","RoboX",
  "SmartBot","CyberX","ByteBot","FlowBot","NutterOS",
];

function seedRand(n: number) {
  const x = Math.sin(n + 1) * 10000;
  return x - Math.floor(x);
}

const PARTICLES: Particle[] = Array.from({ length: 30 }, (_, i) => {
  const r = (offset = 0) => seedRand(i * 7 + offset);
  const types: ParticleType[] = ["wa","bot","gear","label"];
  const type = types[Math.floor(r(1) * 4)] as ParticleType;
  const colors = ["#25D366","#128C7E","#075E54","#34B7F1","#1ebe5d"];
  return {
    id: i,
    type,
    x: r(2) * 100,
    y: r(3) * 100,
    size: type === "label" ? 13 + r(4) * 8 : 24 + r(4) * 34,
    opacity: 0.14 + r(5) * 0.13,
    duration: 18 + r(6) * 28,
    delay: r(7) * 12,
    drift: [(r(8) - 0.5) * 8, (r(9) - 0.5) * 12] as [number, number],
    rotate: (r(10) - 0.5) * 30,
    label: BOT_NAMES[Math.floor(r(11) * BOT_NAMES.length)],
    color: colors[Math.floor(r(12) * colors.length)],
  };
});

/* ── Global Robo Background ─────────────────────────────────── */
function RoboBackground() {
  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none select-none"
      style={{ zIndex: 20 }}
      aria-hidden
    >
      {PARTICLES.map(p => (
        <motion.div
          key={p.id}
          initial={false}
          animate={{
            x: [`${p.drift[0]}vw`, `${-p.drift[0]}vw`, `${p.drift[0]}vw`],
            y: [`${p.drift[1]}vh`, `${-p.drift[1]}vh`, `${p.drift[1]}vh`],
            rotate: [0, p.rotate, -p.rotate, 0],
            opacity: [p.opacity, p.opacity * 0.55, p.opacity * 0.9, p.opacity],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: `${p.y}%`,
          }}
        >
          {p.type === "wa" && (
            <svg
              width={p.size} height={p.size}
              viewBox="0 0 24 24"
              fill={p.color}
              style={{ opacity: p.opacity, filter: "blur(0.3px)" }}
            >
              <path d={WA_PATH} />
            </svg>
          )}
          {p.type === "bot" && (
            <BotIcon size={p.size} color={p.color} opacity={p.opacity} />
          )}
          {p.type === "gear" && (
            <GearIcon size={p.size} color={p.color} opacity={p.opacity} />
          )}
          {p.type === "label" && (
            <span style={{
              fontFamily: "'Courier New', monospace",
              fontSize: `${p.size}px`,
              color: p.color,
              opacity: p.opacity,
              fontWeight: 700,
              letterSpacing: "0.12em",
              whiteSpace: "nowrap",
            }}>
              {p.label}
            </span>
          )}
        </motion.div>
      ))}
    </div>
  );
}

/* ── WhatsApp community FAB ─────────────────────────────────── */
function WhatsAppFAB() {
  const { isAuthenticated } = useAuth();
  const [location] = useLocation();
  const hidden = !isAuthenticated || location === "/admin" || location === "/auth" || location === "/" || location === "/chat";
  if (hidden) return null;
  return (
    <motion.a
      href="https://chat.whatsapp.com/JsKmQMpECJMHyxucHquF15?mode=gi_t"
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      className="fixed bottom-6 right-5 z-50 flex items-center gap-2.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white px-4 py-3 rounded-2xl shadow-2xl shadow-[#25D366]/40 transition-colors duration-200"
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current shrink-0">
        <path d={WA_PATH} />
      </svg>
      <span className="text-sm font-semibold leading-none">Community</span>
    </motion.a>
  );
}

/* ── Router ─────────────────────────────────────────────────── */
function Router() {
  const [location] = useLocation();
  usePushNotifications();
  return (
    <div className="flex flex-col min-h-screen relative">
      <RoboBackground />
      <Navbar />
      <main className="flex-1 relative z-10 flex flex-col">
        <AnimatePresence mode="wait">
          <Switch key={location}>
            <Route path="/" component={() => <AnimatedRoute component={Home} />} />
            <Route path="/auth" component={() => <AnimatedRoute component={Auth} />} />
            <Route path="/dashboard" component={() => <AnimatedRoute component={Dashboard} />} />
            <Route path="/chat" component={() => <AnimatedRoute component={Chat} />} />
            <Route path="/clients" component={() => <AnimatedRoute component={Clients} />} />
            <Route path="/admin" component={() => <AnimatedRoute component={Admin} />} />
            <Route component={() => <AnimatedRoute component={NotFound} />} />
          </Switch>
        </AnimatePresence>
      </main>
      <WhatsAppFAB />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
