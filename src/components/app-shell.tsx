"use client";

import { ReactNode, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeSwitcher from "@/components/theme-switcher";

function cx(...s: (string | false | null | undefined)[]) {
  return s.filter(Boolean).join(" ");
}

function NavItem({ href, label, icon }: { href: string; label: string; icon: string }) {
  const path = usePathname();
  const active = path === href;

  return (
    <Link
      href={href}
      className={cx(
        "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
        active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
      )}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();

  const mood = useMemo(() => {
    if (path?.includes("/dashboard")) return "high";
    if (path?.includes("/today")) return "high";
    if (path?.includes("/analytics")) return "mid";
    return "low";
  }, [path]);

  return (
    <div className="min-h-screen relative overflow-hidden text-white">
      {/* Background gradient */}
      <div
        className={cx(
          "pointer-events-none absolute inset-0",
          mood === "high" && "opacity-100",
          mood === "mid" && "opacity-90",
          mood === "low" && "opacity-80"
        )}
        style={{
          background: `
            radial-gradient(1200px 600px at 15% 15%, color-mix(in oklab, var(--accent-a) 35%, transparent), transparent 60%),
            radial-gradient(900px 500px at 80% 20%, color-mix(in oklab, var(--accent-b) 35%, transparent), transparent 60%),
            radial-gradient(1000px 600px at 50% 85%, color-mix(in oklab, var(--accent-c) 35%, transparent), transparent 60%),
            linear-gradient(180deg, rgba(0,0,0,0.86), rgba(0,0,0,0.88))
          `,
        }}
      />

      {/* subtle noise */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"260\" height=\"260\"><filter id=\"n\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.8\" numOctaves=\"3\" stitchTiles=\"stitch\"/></filter><rect width=\"260\" height=\"260\" filter=\"url(%23n)\" opacity=\"0.3\"/></svg>')",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 py-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-white/60">FWA</div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <div className="text-lg font-bold tracking-widest">FWA</div>
            </div>
          </div>
          <ThemeSwitcher />
        </div>

        {/* Content */}
        <div className="mt-4 grid gap-4 md:grid-cols-[260px_1fr]">
          {/* Sidebar */}
          <aside className="glass glow-ring rounded-2xl p-3 h-fit">
            <div className="text-xs text-white/55 mb-2">Navigation</div>

            <div className="grid gap-1">
              <NavItem href="/dashboard" label="Dashboard" icon="📊" />
              <NavItem href="/today" label="Today" icon="✅" />
              <NavItem href="/log" label="Log Data" icon="➕" />
              <NavItem href="/game" label="Game" icon="🏆" />
              <NavItem href="/analytics" label="Analytics" icon="📈" />
              <NavItem href="/history" label="History" icon="🗓️" />
              <NavItem href="/profile" label="Profile" icon="👤" />
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="text-xs text-white/60">Tip</div>
              <div className="mt-1 text-sm text-white/85">
                Dashboard = momentum. Log Data = where you enter numbers.
              </div>
            </div>
          </aside>

          {/* Main */}
          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}