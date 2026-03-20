import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navbar } from "@/components/layout/Navbar";
import { AnimatePresence, motion } from "framer-motion";
import Home from "@/pages/Home";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Chat from "@/pages/Chat";
import Admin from "@/pages/Admin";
import NotFound from "@/pages/not-found";

// Global fetch interceptor to inject JWT for /api requests
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
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

function AnimatedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="min-h-0 flex-1 flex flex-col"
    >
      <Component />
    </motion.div>
  );
}

function Router() {
  const [location] = useLocation();

  return (
    <div className="flex flex-col min-h-screen selection:bg-primary/30 selection:text-white">
      <Navbar />
      <main className="flex-1 relative z-0 flex flex-col">
        <AnimatePresence mode="wait">
          <Switch key={location}>
            <Route path="/" component={() => <AnimatedRoute component={Home} />} />
            <Route path="/auth" component={() => <AnimatedRoute component={Auth} />} />
            <Route path="/dashboard" component={() => <AnimatedRoute component={Dashboard} />} />
            <Route path="/chat" component={() => <AnimatedRoute component={Chat} />} />
            <Route path="/admin" component={() => <AnimatedRoute component={Admin} />} />
            <Route component={() => <AnimatedRoute component={NotFound} />} />
          </Switch>
        </AnimatePresence>
      </main>
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
