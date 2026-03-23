import { useLocation } from "wouter";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useGetChats, getGetChatsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, MessageSquare, LogOut, Sun, Moon, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [location] = useLocation();

  const isAdminPage = location === "/admin";

  const { data: chats } = useGetChats({ query: { queryKey: getGetChatsQueryKey(), enabled: isAuthenticated } });
  const totalUnread = chats
    ? chats.reduce((sum: number, c: any) => sum + (c.unreadCount || 0), 0)
    : 0;
  const showBadge = totalUnread > 0 && location !== "/chat";

  const logoHref = isAdminPage ? "/admin" : isAuthenticated ? "/dashboard" : "/";

  const NAV_LINKS = [
    { href: "/clients",   label: "Clients",   icon: Users },
    {
      href:  isAdminPage ? "/admin" : "/dashboard",
      label: "Dashboard",
      icon:  LayoutDashboard,
      onClick: isAdminPage
        ? () => window.dispatchEvent(new CustomEvent("admin:reset"))
        : undefined,
    },
    { href: "/chat", label: "Chat", icon: MessageSquare, badge: showBadge ? totalUnread : 0 },
  ];

  return (
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

          {/* Right side */}
          <div className="flex items-center gap-1">

            {/* Theme toggle */}
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={toggle}
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center border transition-all",
                theme === "dark"
                  ? "bg-white/5 border-white/10 text-amber-300 hover:bg-white/10"
                  : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
              )}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </motion.button>

            {isAuthenticated && (
              <>
                {/* Inline nav links — icon + label on sm+, icon only on xs */}
                {NAV_LINKS.map(link => {
                  const active = location === link.href;
                  const badge  = (link as any).badge as number;
                  return (
                    <Link key={link.href} href={link.href}>
                      <motion.button
                        whileTap={{ scale: 0.93 }}
                        onClick={(link as any).onClick}
                        className={cn(
                          "relative flex items-center gap-1.5 px-2.5 h-9 rounded-xl text-sm font-semibold transition-all",
                          active
                            ? "text-white"
                            : "text-foreground/70 hover:text-foreground hover:bg-secondary/60"
                        )}
                        style={active ? { background: "linear-gradient(90deg,#075E54,#25D366)" } : {}}
                        aria-label={link.label}
                      >
                        <link.icon className="w-4 h-4 shrink-0" />
                        <span className="hidden sm:inline">{link.label}</span>
                        {badge > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-0.5 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center leading-none">
                            {badge > 9 ? "9+" : badge}
                          </span>
                        )}
                      </motion.button>
                    </Link>
                  );
                })}

                {/* Logout */}
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={() => logout()}
                  className="flex items-center gap-1.5 px-2.5 h-9 rounded-xl text-sm font-semibold text-foreground/60 hover:text-red-400 hover:bg-red-400/8 border border-transparent hover:border-red-400/20 transition-all"
                  aria-label="Logout"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span className="hidden md:inline">Logout</span>
                </motion.button>
              </>
            )}

            {!isAuthenticated && (
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
  );
}
