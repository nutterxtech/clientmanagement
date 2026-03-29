import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Bot, Globe, MessageSquare, Send, ShoppingCart, TrendingUp, Zap, ShieldCheck, Rocket, CheckCircle } from "lucide-react";
import { useGetServices } from "@workspace/api-client-react";

const serviceIcons: Record<string, React.ReactNode> = {
  MessageSquare: <MessageSquare className="w-5 h-5" />,
  Share2: <MessageSquare className="w-5 h-5" />,
  Globe: <Globe className="w-5 h-5" />,
  TrendingUp: <TrendingUp className="w-5 h-5" />,
  Send: <Send className="w-5 h-5" />,
  ShoppingCart: <ShoppingCart className="w-5 h-5" />,
};

const features = [
  { icon: Zap, title: "Fast Delivery", desc: "Projects delivered on time with clear milestones and transparent progress tracking." },
  { icon: ShieldCheck, title: "Secure & Private", desc: "Your business data is protected with enterprise-grade security from day one." },
  { icon: Rocket, title: "Built to Scale", desc: "Solutions designed to grow as your business grows — no rework needed." },
];

const stagger = { animate: { transition: { staggerChildren: 0.08 } } };
const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

export default function Home() {
  const { data: services, isLoading } = useGetServices();

  return (
    <div className="min-h-screen pt-16">

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        {/* Background blobs */}
        <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-gradient-radial from-blue-600/10 via-indigo-600/5 to-transparent blur-3xl" />
          <div className="absolute -top-20 right-0 w-96 h-96 bg-indigo-500/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-blue-500/8 blur-[100px] rounded-full" />
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-28 sm:pt-28 sm:pb-36">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="text-center max-w-4xl mx-auto"
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/5 text-blue-400 text-sm font-medium mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
              Premium Tech Services — Now Available
            </div>

            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-tight">
              Transform Your Ideas Into
              <br />
              <span className="text-gradient-primary">Digital Reality</span>
            </h1>

            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
              Nutterx Technologies delivers premium software solutions — WhatsApp bots, websites, SEO, and more — built to scale your business.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center flex-wrap">
              <Link href="/auth">
                <Button variant="gradient" size="lg" className="w-full sm:w-auto gap-2 text-base font-semibold px-8 h-12 shadow-xl shadow-primary/20">
                  Get Started <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <a href="#services">
                <Button variant="outline" size="lg" className="w-full sm:w-auto text-base font-medium px-8 h-12 bg-transparent">
                  View Services
                </Button>
              </a>
              <a href="https://chat.whatsapp.com/JsKmQMpECJMHyxucHquF15?mode=gi_t" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2.5 px-8 h-12 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-base font-semibold transition-all duration-200 shadow-lg shadow-[#25D366]/25 w-full sm:w-auto">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current shrink-0" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Join Community
              </a>
            </div>
          </motion.div>

          {/* Stats bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="mt-16 grid grid-cols-3 gap-4 max-w-lg mx-auto"
          >
            {[
              { value: "50+", label: "Projects Delivered" },
              { value: "100%", label: "Client Satisfaction" },
              { value: "24/7", label: "Support" },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-gradient-primary">{s.value}</div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Services ── */}
      <section id="services" className="py-20 sm:py-28 border-t border-border/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">Our Services</h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Everything you need to automate, market, and scale your business.
            </p>
          </motion.div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-56 rounded-2xl bg-secondary/40 animate-pulse" />
              ))}
            </div>
          ) : (
            <motion.div
              variants={stagger}
              initial="initial"
              whileInView="animate"
              viewport={{ once: true }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
            >
              {services?.map((service) => (
                <motion.div
                  key={service._id}
                  variants={fadeUp}
                  whileHover={{ y: -4 }}
                  className="group relative bg-card border border-border hover:border-primary/30 rounded-2xl p-6 flex flex-col transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 cursor-pointer"
                >
                  {service.popular && (
                    <span className="absolute top-4 right-4 text-xs font-semibold px-2.5 py-1 bg-primary/15 text-primary rounded-full border border-primary/20">
                      Popular
                    </span>
                  )}

                  <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4 group-hover:bg-primary/20 transition-colors">
                    {serviceIcons[service.icon || ""] || <Zap className="w-5 h-5" />}
                  </div>

                  <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">{service.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4 flex-1 line-clamp-2">{service.description}</p>

                  {service.features?.slice(0, 3).map((f: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      {f}
                    </div>
                  ))}

                  <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                    <div>
                      <span className="text-xs text-muted-foreground">Starting at</span>
                      <div className="text-xl font-bold">{service.price ? `KES ${service.price.toLocaleString()}` : "Custom"}</div>
                    </div>
                    <Link href="/auth">
                      <Button size="sm" variant="outline" className="text-xs gap-1.5 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all">
                        Request <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </section>

      {/* ── Why Nutterx ── */}
      <section id="features" className="py-20 sm:py-28 border-t border-border/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Why choose Nutterx?</h2>
              <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
                We combine cutting-edge technology with real results — every project is built to perform, not just look good.
              </p>
              <div className="space-y-7">
                {features.map((f, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1, duration: 0.4 }}
                    className="flex gap-4"
                  >
                    <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <f.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-bold text-base mb-1">{f.title}</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Mock dashboard card */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/15 to-indigo-500/15 blur-3xl rounded-3xl" />
              <div className="relative bg-card border border-border rounded-3xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-6 pb-5 border-b border-border">
                  <div>
                    <h3 className="font-bold">Client Dashboard</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Real-time project tracking</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { label: "WhatsApp Bot Setup", status: "In Progress", color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
                    { label: "SEO Optimization", status: "Completed", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
                    { label: "Website Development", status: "Pending", color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3.5 rounded-xl bg-secondary/30 border border-border">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                          <Bot className="w-4 h-4 text-primary" />
                        </div>
                        <span className="text-sm font-medium">{item.label}</span>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${item.color}`}>
                        {item.status}
                      </span>
                    </div>
                  ))}
                </div>
                <Link href="/auth">
                  <Button variant="gradient" className="w-full mt-5 gap-2 font-semibold">
                    Access Your Dashboard <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 border-t border-border/40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to get started?</h2>
            <p className="text-lg text-muted-foreground mb-8">
              Join businesses already growing with Nutterx Technologies.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/auth">
                <Button variant="gradient" size="lg" className="w-full sm:w-auto gap-2 px-10 h-12 text-base font-semibold shadow-xl shadow-primary/20">
                  Start Today <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <a href="https://chat.whatsapp.com/JsKmQMpECJMHyxucHquF15?mode=gi_t" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2.5 px-10 h-12 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-base font-semibold transition-all duration-200 shadow-lg shadow-[#25D366]/25 w-full sm:w-auto">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current shrink-0" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Join WhatsApp Community
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <span className="font-display font-bold text-xs text-white">N</span>
            </div>
            <span className="font-display font-bold text-sm">Nutterx Technologies</span>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            © {new Date().getFullYear()} Nutterx Technologies. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
