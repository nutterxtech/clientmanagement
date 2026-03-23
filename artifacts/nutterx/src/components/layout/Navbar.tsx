import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useGetChats, getGetChatsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, MessageSquare, LogOut, Sun, Moon, Users, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdminPage = location === "/admin";

  const { data: chats } = useGetChats({ query: { queryKey: getGetChatsQueryKey(), enabled: isAuthenticated } });
  const totalUnread = chats
    ? chats.reduce((sum: number, c: any) => sum + (c.unreadCount || 0), 0)
    : 0;
  const showBadge = totalUnread > 0 && location !== "/chat";

  const logoHref = isAdminPage ? "/admin" : isAuthenticated ? "/dashboard" : "/";

  const NAV_LINKS = [
    { href: "/clients",                            label: "Clients",   icon: Users },
    {
      href:    isAdminPage ? "/admin" : "/dashboard",
      label:   "Dashboard",
      icon:    LayoutDashboard,
      onClick: isAdminPage
        ? () => window.dispatchEvent(new CustomEvent("admin:reset"))
        : undefined,
    },
    { href: "/chat", label: "Chat", icon: MessageSquare, badge: showBadge ? totalUnread : 0 },
  ];

  return (
    <>
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="fixed top-0 w-full z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">

            {/* Logo */}
            <Link href={logoHref} className="flex items-center gap-2.5 group shrink-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-all">
                <span className="font-display font-bold text-sm text-white">N</span>
              </div>
              <span className="font-display font-bold text-base tracking-tight">
                Nutterx <span className="text-muted-foreground font-normal hidden sm:inline">Technologies</span>
              </span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {isAuthenticated && NAV_LINKS.map(link => (
                <Link key={link.href} href={link.href}>
                  <button onClick={(link as any).onClick} className={cn(
                    "relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all",
                    location === link.href
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  )}>
                    <link.icon className="w-4 h-4" />
                    {link.label}
                    {(link as any).badge > 0 && (
                      <span className="absolute -top-1 -right-1 w-4.5 h-4.5 min-w-[1.1rem] px-1 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center leading-none">
                        {(link as any).badge > 9 ? "9+" : (link as any).badge}
                      </span>
                    )}
                  </button>
                </Link>
              ))}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={toggle}
                className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center border transition-all",
                  theme === "dark"
                    ? "bg-white/5 border-white/10 text-amber-300 hover:bg-white/10"
                    : "bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200"
                )}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </motion.button>

              {isAuthenticated ? (
                <>
                  <button
                    onClick={() => logout()}
                    className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-red-400 hover:bg-red-400/5 transition-all"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                  <button
                    onClick={() => setMobileOpen(!mobileOpen)}
                    className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center border border-border hover:bg-secondary/60 transition-all relative"
                  >
                    {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                    {showBadge && !mobileOpen && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                        {totalUnread > 9 ? "9+" : totalUnread}
                      </span>
                    )}
                  </button>
                </>
              ) : (
                <>
                  <Link href="/auth">
                    <button className="hidden sm:block text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-xl hover:bg-secondary/60 transition-all">
                      Sign In
                    </button>
                  </Link>
                  <Link href="/auth">
                    <Button variant="gradient" size="sm" className="text-sm font-semibold px-4">
                      Get Started
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && isAuthenticated && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
            />
            <motion.div
              initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="fixed top-16 left-0 right-0 z-40 md:hidden border-b border-border shadow-2xl overflow-hidden"
              style={{ background: "var(--mob-menu-bg, #fff)" }}
            >
              <style>{`
                :root { --mob-menu-bg: #ffffff; }
                .dark { --mob-menu-bg: #111827; }
              `}</style>

              {/* User identity banner */}
              <div className="px-5 py-3 flex items-center gap-3 border-b border-border/60"
                style={{ background: "#075E54" }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0"
                  style={{ background: "#25D366" }}>
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">{user?.name}</div>
                  <div className="text-[11px] text-white/70 truncate">{(user as any)?.email}</div>
                </div>
              </div>

              <div className="px-3 py-2 space-y-0.5">
                {NAV_LINKS.map(link => {
                  const active = location === link.href;
                  return (
                    <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)}>
                      <button onClick={(link as any).onClick} className={cn(
                        "w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-base font-semibold transition-all text-left relative",
                        active
                          ? "text-white"
                          : "text-foreground hover:bg-[#25D366]/8"
                      )}
                      style={active ? { background: "linear-gradient(90deg,#075E54,#25D366)" } : {}}>
                        <link.icon className={cn("w-5 h-5 shrink-0", active ? "text-white" : "text-[#25D366]")} />
                        <span>{link.label}</span>
                        {(link as any).badge > 0 && (
                          <span className="ml-auto min-w-[1.5rem] h-6 px-1.5 bg-red-500 rounded-full text-xs font-bold text-white flex items-center justify-center">
                            {(link as any).badge > 9 ? "9+" : (link as any).badge}
                          </span>
                        )}
                      </button>
                    </Link>
                  );
                })}
              </div>

              <div className="px-3 pb-3 border-t border-border/60 mt-1 pt-2">
                <button
                  onClick={() => { logout(); setMobileOpen(false); }}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-base font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/8 transition-all"
                >
                  <LogOut className="w-5 h-5 shrink-0" />
                  Sign out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
