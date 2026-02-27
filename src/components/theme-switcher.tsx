"use client";

import { useEffect, useState } from "react";

const PALETTES = [
  { key: "neon", name: "Neon", a: "#22c55e", b: "#60a5fa", c: "#a78bfa" },
  { key: "inferno", name: "Inferno", a: "#f97316", b: "#ef4444", c: "#f59e0b" },
  { key: "ocean", name: "Ocean", a: "#06b6d4", b: "#3b82f6", c: "#22c55e" },
  { key: "royal", name: "Royal", a: "#8b5cf6", b: "#3b82f6", c: "#ec4899" },
] as const;

type PaletteKey = (typeof PALETTES)[number]["key"];

function setCssVars(p: { a: string; b: string; c: string }) {
  const r = document.documentElement;
  r.style.setProperty("--accent-a", p.a);
  r.style.setProperty("--accent-b", p.b);
  r.style.setProperty("--accent-c", p.c);
}

export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState<PaletteKey>("neon");

  useEffect(() => {
    const saved = (localStorage.getItem("fitlog_palette") as PaletteKey | null) ?? "neon";
    setPalette(saved);
    const p = PALETTES.find((x) => x.key === saved) ?? PALETTES[0];
    setCssVars(p);
  }, []);

  function choose(key: PaletteKey) {
    setPalette(key);
    localStorage.setItem("fitlog_palette", key);
    const p = PALETTES.find((x) => x.key === key)!;
    setCssVars(p);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 hover:bg-white/10 backdrop-blur"
      >
        🎨 Theme
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-white/10 bg-black/60 p-3 backdrop-blur-xl shadow-xl">
          <div className="text-xs text-white/60 mb-2">Pick your vibe</div>

          <div className="grid gap-2">
            {PALETTES.map((p) => (
              <button
                key={p.key}
                onClick={() => choose(p.key)}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${
                  palette === p.key
                    ? "border-white/30 bg-white/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <span className="text-white/90">{p.name}</span>
                <span className="flex items-center gap-1">
                  <span className="h-3 w-3 rounded-full" style={{ background: p.a }} />
                  <span className="h-3 w-3 rounded-full" style={{ background: p.b }} />
                  <span className="h-3 w-3 rounded-full" style={{ background: p.c }} />
                </span>
              </button>
            ))}
          </div>

          <div className="mt-3 text-xs text-white/50">
            Saved automatically (localStorage). Gradient updates instantly.
          </div>
        </div>
      )}
    </div>
  );
}