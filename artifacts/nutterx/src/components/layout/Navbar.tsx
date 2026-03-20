import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, MessageSquare, LogOut, ShieldAlert, Sun, Moon, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [location] = useLocation();

  const isAdminUrl = new URLSearchParams(window.location.search).get("admin") === "true";

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="fixed top-0 w-full z-50 glass-panel border-b border-border/50"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link href="/" className="flex items-center gap-3 group">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-[1px] transition-all group-hover:shadow-lg group-hover:shadow-blue-500/25"
            >
              <div className="w-full h-full bg-background rounded-[11px] flex items-center justify-center">
                <span className="font-display font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">N</span>
              </div>
            </motion.div>
            <span className="font-display font-semibold text-lg tracking-tight group-hover:text-blue-400 transition-colors">
              Nutterx
            </span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* Theme toggle */}
            <motion.button
              whileHover={{ scale: 1.1, rotate: 15 }}
              whileTap={{ scale: 0.9 }}
              onClick={toggle}
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center border transition-all",
                theme === "dark"
                  ? "bg-white/5 border-white/10 text-yellow-300 hover:bg-white/10"
                  : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
              )}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </motion.button>

            {isAuthenticated ? (
              <>
                {(user?.role === "admin" || isAdminUrl) && (
                  <Link href={`/admin${window.location.search}`}>
                    <Button variant={location === "/admin" ? "secondary" : "ghost"} size="sm" className="hidden sm:flex">
                      <ShieldAlert className="w-4 h-4 mr-1.5 text-red-400" />
                      Admin
                    </Button>
                  </Link>
                )}
                <Link href="/clients">
                  <Button variant={location === "/clients" ? "secondary" : "ghost"} size="sm" className="hidden sm:flex">
                    <Users className="w-4 h-4 mr-1.5 text-emerald-400" />
                    Clients
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button variant={location === "/dashboard" ? "secondary" : "ghost"} size="sm" className="hidden sm:flex">
                    <LayoutDashboard className="w-4 h-4 mr-1.5" />
                    Dashboard
                  </Button>
                </Link>
                <Link href="/chat">
                  <Button variant={location === "/chat" ? "secondary" : "ghost"} size="sm">
                    <MessageSquare className="w-4 h-4 sm:mr-1.5 text-blue-400" />
                    <span className="hidden sm:inline">Chat</span>
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={() => logout()} className="text-muted-foreground hover:text-red-400">
                  <LogOut className="w-4 h-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Logout</span>
                </Button>
              </>
            ) : (
              <>
                <Link href="/auth">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">Sign In</Button>
                </Link>
                <Link href="/auth">
                  <Button variant="gradient" size="sm">Get Started</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.nav>
  );
}
