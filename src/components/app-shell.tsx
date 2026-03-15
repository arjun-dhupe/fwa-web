"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ThemeSwitcher from "@/components/theme-switcher";

function cx(...s: (string | false | null | undefined)[]) {
  return s.filter(Boolean).join(" ");
}

/* ─── Nav config ─────────────────────────────────────── */
const NAV_ITEMS = [
  { href: "/dashboard",   label: "Ask Arjun",   icon: "✦", sub: "AI coach",      color: "#a3e635" },
  { href: "/today",       label: "Today",        icon: "◎", sub: "Daily record",  color: "#38bdf8" },
  { href: "/log",         label: "Log Data",     icon: "+", sub: "Food & water",  color: "#34d399" },
  { href: "/log-workout", label: "Log Workout",  icon: "⚡",sub: "Burn tracker",  color: "#f97316" },
  { href: "/analysis",    label: "Analysis",     icon: "◈", sub: "Patterns",      color: "#a78bfa" },
  { href: "/analytics",   label: "Analytics",    icon: "▲", sub: "Charts",        color: "#60a5fa" },
  { href: "/history",     label: "History",      icon: "◷", sub: "Past logs",     color: "#94a3b8" },
  { href: "/profile",     label: "Profile",      icon: "◉", sub: "Your targets",  color: "#fb923c" },
] as const;

/* ─── Sidebar rotating quotes ────────────────────────── */
const SIDEBAR_QUOTES = [
  { line: "Your data is loaded.", sub: "Arjun is watching." },
  { line: "Yesterday's log is history.", sub: "Today's log is strategy." },
  { line: "The numbers know.", sub: "Even when you forget." },
  { line: "Consistency > perfection.", sub: "Log the bad days too." },
  { line: "Arjun doesn't take days off.", sub: "Neither should your tracking." },
  { line: "Every macro logged", sub: "is a vote for future you." },
  { line: "The data doesn't lie.", sub: "It just tells you things you don't want to hear." },
  { line: "Progress is compounding.", sub: "You just can't see it yet." },
  { line: "What gets measured", sub: "gets improved. Full stop." },
  { line: "Arjun has read your numbers.", sub: "Now you should too." },
];

/* ─── Profile completeness ───────────────────────────── */
function isProfileComplete(profile: any): boolean {
  if (!profile) return false;
  return !!(profile.weight_kg && profile.height_cm && profile.goal_type && profile.activity_level);
}

function profileMissingFields(profile: any): string[] {
  const m: string[] = [];
  if (!profile?.weight_kg)      m.push("weight");
  if (!profile?.height_cm)      m.push("height");
  if (!profile?.goal_type)      m.push("goal");
  if (!profile?.activity_level) m.push("activity level");
  return m;
}

/* ─── NavItem ─────────────────────────────────────────── */
function NavItem({
  href, label, icon, sub, color, profileComplete,
}: {
  href: string; label: string; icon: string; sub: string; color: string; profileComplete: boolean;
}) {
  const path   = usePathname();
  const active = path === href;
  const locked = !profileComplete && href !== "/profile" && href !== "/dashboard";

  return (
    <Link
      href={locked ? "/profile" : href}
      className={cx(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 overflow-hidden",
        active  ? "text-white"         : locked ? "text-white/25" : "text-white/70 hover:text-white/95"
      )}
      style={active ? {
        background: `linear-gradient(135deg, ${color}18, ${color}08)`,
        border: `1px solid ${color}30`,
        boxShadow: `0 0 20px ${color}10, inset 0 1px 0 ${color}15`,
      } : locked ? {
        border: "1px solid transparent",
      } : {
        border: "1px solid transparent",
        // Subtle hover handled via CSS group
      }}
    >
      {/* Active left border */}
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
          style={{ background: color, boxShadow: `0 0 8px ${color}80` }}
        />
      )}

      {/* Icon badge */}
      <span
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold leading-none transition-all"
        style={active ? {
          background: `${color}25`,
          color: color,
          boxShadow: `0 0 12px ${color}30`,
        } : locked ? {
          background: "rgba(255,255,255,0.03)",
          color: "rgba(255,255,255,0.15)",
        } : {
          // Inactive: dim tinted version of each item's own colour — lively but clearly unselected
          background: `${color}12`,
          color: `${color}80`,
          boxShadow: `0 0 6px ${color}08`,
        }}
      >
        {icon}
      </span>

      <div className="flex-1 min-w-0">
        <div className={cx("text-sm font-semibold leading-none", active && "text-white")}>
          {label}
        </div>
        <div
          className="text-[10px] mt-0.5 leading-none"
          style={{ color: active ? `${color}90` : "rgba(255,255,255,0.25)" }}
        >
          {sub}
        </div>
      </div>

      {locked && (
        <span className="text-[9px] font-bold uppercase tracking-wider text-white/15 flex-shrink-0">
          Setup
        </span>
      )}
    </Link>
  );
}

/* ─── User avatar + dropdown ─────────────────────────── */
function UserMenu({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);
  const router          = useRouter();
  const initials        = email ? email.slice(0, 2).toUpperCase() : "—";

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-xl text-xs font-black text-black transition-all hover:scale-105 hover:brightness-110"
        style={{ background: "var(--accent-a, #a3e635)" }}
        title={email}
      >
        {initials}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-52 rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
          style={{ background: "rgba(8,8,10,0.96)", backdropFilter: "blur(24px)", animation: "shellDropIn 0.18s ease both" }}
        >
          <div className="px-4 py-3 border-b border-white/8">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Signed in as</div>
            <div className="mt-0.5 text-xs font-medium text-white/65 truncate">{email}</div>
          </div>
          <div className="p-2">
            <button
              onClick={() => { router.push("/profile"); setOpen(false); }}
              className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/60 hover:bg-white/8 hover:text-white transition-all text-left"
            >
              <span>◉</span><span>Profile settings</span>
            </button>
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-rose-400/70 hover:bg-rose-500/10 hover:text-rose-300 transition-all text-left"
            >
              <span>→</span><span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Profile setup banner ───────────────────────────── */
function ProfileSetupBanner({ missing, onDismiss }: { missing: string[]; onDismiss: () => void }) {
  const router = useRouter();
  return (
    <div
      className="relative mb-5 overflow-hidden rounded-2xl"
      style={{
        border: "1px solid rgba(163,230,53,0.25)",
        background: "linear-gradient(135deg, rgba(163,230,53,0.07) 0%, rgba(0,0,0,0) 100%)",
        animation: "shellSlideDown 0.3s ease both",
      }}
    >
      <div className="absolute top-0 left-8 right-8 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(163,230,53,0.5), transparent)" }} />
      <div className="flex items-start gap-4 p-4">
        <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-base" style={{ background: "rgba(163,230,53,0.12)", border: "1px solid rgba(163,230,53,0.25)" }}>
          ◉
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">Profile setup required</span>
            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: "rgba(163,230,53,0.12)", color: "rgba(163,230,53,0.8)" }}>
              Action needed
            </span>
          </div>
          <p className="mt-1 text-xs text-white/50 leading-relaxed">
            Arjun needs your <span className="text-white/80 font-medium">{missing.join(", ")}</span> to calculate your daily targets.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => router.push("/profile")}
              className="rounded-xl px-4 py-2 text-xs font-bold text-black transition-all hover:brightness-110 active:scale-95"
              style={{ background: "var(--accent-a, #a3e635)" }}
            >
              Complete profile →
            </button>
            <span className="text-[10px] text-white/25">Takes about 30 seconds</span>
          </div>
        </div>
        <button onClick={onDismiss} className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-white/25 hover:bg-white/8 hover:text-white/50 transition-all text-xs">
          ✕
        </button>
      </div>
    </div>
  );
}

/* ─── Sidebar quote card ─────────────────────────────── */
function SidebarQuoteCard() {
  const [idx,  setIdx]  = useState(() => Math.floor(Math.random() * SIDEBAR_QUOTES.length));
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % SIDEBAR_QUOTES.length);
        setFade(true);
      }, 350);
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const q = SIDEBAR_QUOTES[idx];

  return (
    <div
      className="rounded-2xl p-3 transition-opacity duration-300"
      style={{
        opacity: fade ? 1 : 0,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent-a, #a3e635)" }} />
        <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">Arjun Says</span>
      </div>
      <p className="text-[11px] font-semibold text-white/70 leading-relaxed">{q.line}</p>
      <p className="text-[10px] text-white/30 italic mt-0.5 leading-relaxed">{q.sub}</p>
    </div>
  );
}

/* ─── AppShell ───────────────────────────────────────── */
export default function AppShell({ children }: { children: ReactNode }) {
  const path   = usePathname();
  const router = useRouter();

  const [email,           setEmail]           = useState("");
  const [profile,         setProfile]         = useState<any>(null);
  const [profileLoaded,   setProfileLoaded]   = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [sidebarOpen,     setSidebarOpen]     = useState(false);

  /* ── Fetch profile ── */
  async function fetchProfile(userId: string) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("weight_kg, height_cm, goal_type, activity_level, name")
      .eq("user_id", userId)
      .maybeSingle();
    setProfile(prof ?? null);
    setProfileLoaded(true);
  }

  useEffect(() => {
    let uid = "";
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      uid = data.user.id;
      setEmail(data.user.email ?? "");
      await fetchProfile(uid);
      const dismissed = sessionStorage.getItem("fwa_banner_dismissed");
      if (dismissed) setBannerDismissed(true);
    })();

    // Listen for profile save event from profile page — re-fetch instantly
    function onProfileSaved() {
      if (uid) fetchProfile(uid);
      setBannerDismissed(false);
      sessionStorage.removeItem("fwa_banner_dismissed");
    }
    window.addEventListener("fwa:profile-saved", onProfileSaved);
    return () => window.removeEventListener("fwa:profile-saved", onProfileSaved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function dismissBanner() {
    setBannerDismissed(true);
    sessionStorage.setItem("fwa_banner_dismissed", "1");
  }

  const profileComplete = isProfileComplete(profile);
  const missingFields   = profileMissingFields(profile);
  const showBanner      = profileLoaded && !profileComplete && !bannerDismissed && path !== "/profile";
  const pageLabel       = NAV_ITEMS.find((n) => n.href === path)?.label ?? "FWA";

  const mood = useMemo(() => {
    if (path?.includes("/dashboard") || path?.includes("/today")) return "high";
    if (path?.includes("/analytics") || path?.includes("/analysis")) return "mid";
    return "low";
  }, [path]);

  return (
    <>
      <style>{`
        @keyframes shellDropIn {
          from { opacity:0; transform:translateY(-6px) scale(0.98); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes shellSlideDown {
          from { opacity:0; transform:translateY(-10px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes shellFadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes shellPulseRing {
          0%,100% { opacity:0.35; transform:scale(1); }
          50%      { opacity:0.7;  transform:scale(1.08); }
        }
        @keyframes shellPulseDot {
          0%,100% { transform:scale(1); opacity:0.5; }
          50%      { transform:scale(1.7); opacity:0; }
        }

        .shell-logo-ring {
          position:absolute; inset:-3px; border-radius:50%;
          border:1px solid rgba(163,230,53,0.3);
          animation: shellPulseRing 3s ease-in-out infinite;
        }
        .shell-status-dot { position:relative; width:7px; height:7px; border-radius:50%; }
        .shell-status-dot::after {
          content:''; position:absolute; inset:-2px; border-radius:50%;
          background:rgba(163,230,53,0.3);
          animation: shellPulseDot 2s ease-in-out infinite;
        }
        .shell-header-line {
          position:absolute; bottom:0; left:48px; right:48px; height:1px;
          background:linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent);
        }
        .shell-section-label {
          display:flex; align-items:center; gap:6px;
          font-size:9px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase;
          color:rgba(255,255,255,0.2); padding:0 12px; margin:10px 0 4px;
        }
        .shell-section-dot {
          width:3px; height:3px; border-radius:50%; flex-shrink:0;
        }
        .shell-sidebar::-webkit-scrollbar { width:2px; }
        .shell-sidebar::-webkit-scrollbar-track { background:transparent; }
        .shell-sidebar::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:99px; }
        .shell-mobile-overlay {
          position:fixed; inset:0; background:rgba(0,0,0,0.75);
          backdrop-filter:blur(4px); z-index:40;
          animation:shellFadeIn 0.2s ease;
        }
      `}</style>

      <div className="min-h-screen relative overflow-x-hidden text-white">

        {/* Background */}
        <div
          className="pointer-events-none fixed inset-0 transition-opacity duration-700"
          style={{
            opacity: mood === "high" ? 1 : mood === "mid" ? 0.85 : 0.7,
            background: `
              radial-gradient(1200px 600px at 15% 15%, color-mix(in oklab, var(--accent-a, #a3e635) 28%, transparent), transparent 60%),
              radial-gradient(900px 500px at 82% 18%,  color-mix(in oklab, var(--accent-b, #84cc16) 22%, transparent), transparent 55%),
              radial-gradient(1000px 600px at 50% 90%, color-mix(in oklab, var(--accent-c, #4ade80) 18%, transparent), transparent 55%),
              linear-gradient(180deg, #050505, #080808)
            `,
          }}
        />

        {/* Noise */}
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.05]"
          style={{ backgroundImage: "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"260\" height=\"260\"><filter id=\"n\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.8\" numOctaves=\"3\" stitchTiles=\"stitch\"/></filter><rect width=\"260\" height=\"260\" filter=\"url(%23n)\" opacity=\"0.3\"/></svg>')" }}
        />

        {sidebarOpen && <div className="shell-mobile-overlay md:hidden" onClick={() => setSidebarOpen(false)} />}

        <div className="relative mx-auto max-w-7xl px-4">

          {/* Header */}
          <header className="relative flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen((v) => !v)}
                className="flex md:hidden h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 hover:text-white transition"
              >
                ☰
              </button>
              <div className="relative flex-shrink-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl text-xs font-black text-black" style={{ background: "var(--accent-a, #a3e635)" }}>F</div>
                <div className="shell-logo-ring" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold tracking-tight text-white">FWA</span>
                  <div className="shell-status-dot" style={{ background: "var(--accent-a, #a3e635)" }} />
                  <span className="hidden sm:inline text-[9px] font-semibold uppercase tracking-widest" style={{ color: "var(--accent-a, #a3e635)", opacity: 0.6 }}>Online</span>
                </div>
                <div className="text-[10px] text-white/30 leading-none mt-0.5">Fitness With Arjun</div>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-2 text-xs text-white/30">
              <span>FWA</span><span>/</span>
              <span className="text-white/60 font-medium">{pageLabel}</span>
            </div>

            <div className="flex items-center gap-2">
              <ThemeSwitcher />
              {email && <UserMenu email={email} onLogout={logout} />}
            </div>
            <div className="shell-header-line" />
          </header>

          {/* Body */}
          <div className="pb-8 pt-2 grid gap-5 md:grid-cols-[240px_1fr]">

            {/* Sidebar */}
            <aside
              className={cx(
                "shell-sidebar fixed md:static inset-y-0 left-0 z-50 w-64 md:w-auto",
                "md:translate-x-0 transition-transform duration-300",
                sidebarOpen ? "translate-x-0" : "-translate-x-full",
                "h-screen md:h-fit overflow-y-auto md:overflow-visible",
                "flex flex-col gap-3 p-4 md:p-0"
              )}
              style={{ background: "rgba(6,6,8,0.97)", borderRight: "1px solid rgba(255,255,255,0.05)" }}
            >
              <div className="flex items-center justify-between md:hidden mb-2">
                <span className="text-xs font-bold text-white/40 uppercase tracking-wider">Menu</span>
                <button onClick={() => setSidebarOpen(false)} className="text-white/40 hover:text-white text-sm">✕</button>
              </div>

              {/* Nav card */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                {/* Profile incomplete strip */}
                {profileLoaded && !profileComplete && (
                  <div
                    className="flex items-center gap-2.5 px-3 py-2.5 border-b cursor-pointer hover:bg-white/5 transition-all"
                    style={{ borderColor: "rgba(163,230,53,0.15)", background: "rgba(163,230,53,0.03)" }}
                    onClick={() => router.push("/profile")}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-lg text-[9px] font-bold flex-shrink-0" style={{ background: "rgba(163,230,53,0.15)", color: "#a3e635" }}>!</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold text-white/60">Profile incomplete</div>
                      <div className="text-[9px] text-white/25 truncate">Missing: {missingFields.join(", ")}</div>
                    </div>
                    <span className="text-white/20 text-xs">›</span>
                  </div>
                )}

                {/* Coach */}
                <div className="p-2">
                  <div className="shell-section-label">
                    <span className="shell-section-dot" style={{ background: "var(--accent-a, #a3e635)" }} />
                    Coach
                  </div>
                  <NavItem {...NAV_ITEMS[0]} profileComplete={profileComplete} />
                  <NavItem {...NAV_ITEMS[1]} profileComplete={profileComplete} />
                </div>

                <div className="mx-3 h-px" style={{ background: "rgba(255,255,255,0.05)" }} />

                {/* Log */}
                <div className="p-2">
                  <div className="shell-section-label">
                    <span className="shell-section-dot" style={{ background: "#34d399" }} />
                    Log
                  </div>
                  <NavItem {...NAV_ITEMS[2]} profileComplete={profileComplete} />
                  <NavItem {...NAV_ITEMS[3]} profileComplete={profileComplete} />
                </div>

                <div className="mx-3 h-px" style={{ background: "rgba(255,255,255,0.05)" }} />

                {/* Insights */}
                <div className="p-2">
                  <div className="shell-section-label">
                    <span className="shell-section-dot" style={{ background: "#a78bfa" }} />
                    Insights
                  </div>
                  <NavItem {...NAV_ITEMS[4]} profileComplete={profileComplete} />
                  <NavItem {...NAV_ITEMS[5]} profileComplete={profileComplete} />
                  <NavItem {...NAV_ITEMS[6]} profileComplete={profileComplete} />
                </div>

                <div className="mx-3 h-px" style={{ background: "rgba(255,255,255,0.05)" }} />

                {/* Account */}
                <div className="p-2">
                  <div className="shell-section-label">
                    <span className="shell-section-dot" style={{ background: "#fb923c" }} />
                    Account
                  </div>
                  <NavItem {...NAV_ITEMS[7]} profileComplete={profileComplete} />
                </div>
              </div>

              {/* Rotating quote card */}
              <SidebarQuoteCard />
            </aside>

            {/* Main */}
            <main className="min-w-0">
              {showBanner && <ProfileSetupBanner missing={missingFields} onDismiss={dismissBanner} />}
              {children}
            </main>
          </div>
        </div>
      </div>
    </>
  );
}