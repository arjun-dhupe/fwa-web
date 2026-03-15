"use client";

import { useEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────────
   THEME DATA
   Each theme has:
   - CSS variable values (a, b, c = accent colours)
   - bg: the app background gradient
   - glow: card glow colour
   - pill: pill/badge bg
   ───────────────────────────────────────────────────────────── */
const CATEGORIES = [
  {
    key: "ai",
    label: "AI Systems",
    icon: "🤖",
    desc: "Machine intelligence aesthetics",
    themes: [
      {
        key: "lime-terminal",
        name: "Lime Terminal",
        tag: "Default",
        desc: "Classic AI green on black",
        a: "#a3e635", b: "#84cc16", c: "#4ade80",
        bg: "linear-gradient(135deg, #0a0f0a 0%, #050a05 100%)",
        glow: "rgba(163,230,53,0.12)",
        pill: "rgba(163,230,53,0.1)",
        preview: ["#a3e635", "#84cc16", "#4ade80"],
      },
      {
        key: "cyan-neural",
        name: "Cyan Neural",
        tag: "Sharp",
        desc: "Electric blue, neural net energy",
        a: "#22d3ee", b: "#06b6d4", c: "#67e8f9",
        bg: "linear-gradient(135deg, #050d0f 0%, #020708 100%)",
        glow: "rgba(34,211,238,0.12)",
        pill: "rgba(34,211,238,0.1)",
        preview: ["#22d3ee", "#06b6d4", "#67e8f9"],
      },
      {
        key: "matrix",
        name: "Matrix",
        tag: "Iconic",
        desc: "Deep green, digital rain",
        a: "#4ade80", b: "#22c55e", c: "#16a34a",
        bg: "linear-gradient(135deg, #030a03 0%, #020502 100%)",
        glow: "rgba(74,222,128,0.1)",
        pill: "rgba(74,222,128,0.08)",
        preview: ["#4ade80", "#22c55e", "#16a34a"],
      },
      {
        key: "ghost-white",
        name: "Ghost White",
        tag: "Minimal",
        desc: "Arctic white on near-black",
        a: "#f1f5f9", b: "#e2e8f0", c: "#94a3b8",
        bg: "linear-gradient(135deg, #08090a 0%, #05060a 100%)",
        glow: "rgba(241,245,249,0.07)",
        pill: "rgba(241,245,249,0.06)",
        preview: ["#f1f5f9", "#cbd5e1", "#94a3b8"],
      },
    ],
  },
  {
    key: "cosmic",
    label: "Cosmic",
    icon: "🌌",
    desc: "Deep space & nebula palettes",
    themes: [
      {
        key: "nebula",
        name: "Nebula",
        tag: "Ethereal",
        desc: "Violet & pink, interstellar drift",
        a: "#a78bfa", b: "#8b5cf6", c: "#ec4899",
        bg: "linear-gradient(135deg, #09060f 0%, #060309 100%)",
        glow: "rgba(167,139,250,0.12)",
        pill: "rgba(167,139,250,0.1)",
        preview: ["#a78bfa", "#8b5cf6", "#ec4899"],
      },
      {
        key: "pulsar",
        name: "Pulsar",
        tag: "Intense",
        desc: "Deep indigo, high-energy burst",
        a: "#818cf8", b: "#6366f1", c: "#a5b4fc",
        bg: "linear-gradient(135deg, #060609 0%, #040407 100%)",
        glow: "rgba(129,140,248,0.12)",
        pill: "rgba(129,140,248,0.1)",
        preview: ["#818cf8", "#6366f1", "#a5b4fc"],
      },
      {
        key: "aurora",
        name: "Aurora",
        tag: "Dreamy",
        desc: "Teal to violet, polar light",
        a: "#2dd4bf", b: "#818cf8", c: "#f472b6",
        bg: "linear-gradient(135deg, #050c0b 0%, #060509 100%)",
        glow: "rgba(45,212,191,0.1)",
        pill: "rgba(45,212,191,0.08)",
        preview: ["#2dd4bf", "#818cf8", "#f472b6"],
      },
      {
        key: "dark-matter",
        name: "Dark Matter",
        tag: "Void",
        desc: "Near-black, trace of cobalt",
        a: "#475569", b: "#64748b", c: "#3b82f6",
        bg: "linear-gradient(135deg, #030303 0%, #040404 100%)",
        glow: "rgba(59,130,246,0.08)",
        pill: "rgba(71,85,105,0.1)",
        preview: ["#475569", "#3b82f6", "#64748b"],
      },
    ],
  },
  {
    key: "heat",
    label: "Heat",
    icon: "🔥",
    desc: "Warm, high-energy palettes",
    themes: [
      {
        key: "inferno",
        name: "Inferno",
        tag: "Aggressive",
        desc: "Orange-red, max intensity",
        a: "#f97316", b: "#ef4444", c: "#f59e0b",
        bg: "linear-gradient(135deg, #0f0600 0%, #0a0300 100%)",
        glow: "rgba(249,115,22,0.12)",
        pill: "rgba(249,115,22,0.1)",
        preview: ["#f97316", "#ef4444", "#f59e0b"],
      },
      {
        key: "lava",
        name: "Lava",
        tag: "Raw",
        desc: "Crimson core, molten edge",
        a: "#dc2626", b: "#b91c1c", c: "#f87171",
        bg: "linear-gradient(135deg, #0e0303 0%, #080202 100%)",
        glow: "rgba(220,38,38,0.12)",
        pill: "rgba(220,38,38,0.08)",
        preview: ["#dc2626", "#f87171", "#b91c1c"],
      },
      {
        key: "solar",
        name: "Solar",
        tag: "Warm",
        desc: "Amber & gold, high noon",
        a: "#f59e0b", b: "#d97706", c: "#fbbf24",
        bg: "linear-gradient(135deg, #0c0800 0%, #090600 100%)",
        glow: "rgba(245,158,11,0.12)",
        pill: "rgba(245,158,11,0.1)",
        preview: ["#f59e0b", "#fbbf24", "#d97706"],
      },
      {
        key: "ember",
        name: "Ember",
        tag: "Subtle",
        desc: "Muted fire, long-burning",
        a: "#fb923c", b: "#ea580c", c: "#fdba74",
        bg: "linear-gradient(135deg, #0b0501 0%, #080401 100%)",
        glow: "rgba(251,146,60,0.1)",
        pill: "rgba(251,146,60,0.08)",
        preview: ["#fb923c", "#fdba74", "#ea580c"],
      },
    ],
  },
  {
    key: "bio",
    label: "Bio",
    icon: "🧬",
    desc: "Organic, lab & life-science tones",
    themes: [
      {
        key: "biohazard",
        name: "Biohazard",
        tag: "Lab",
        desc: "Acidic yellow-green, specimen jar",
        a: "#bef264", b: "#a3e635", c: "#d9f99d",
        bg: "linear-gradient(135deg, #080a03 0%, #060802 100%)",
        glow: "rgba(190,242,100,0.1)",
        pill: "rgba(190,242,100,0.08)",
        preview: ["#bef264", "#a3e635", "#d9f99d"],
      },
      {
        key: "synthwave",
        name: "Synthwave",
        tag: "Retro-future",
        desc: "Pink & cyan, '80s grid",
        a: "#f472b6", b: "#22d3ee", c: "#a78bfa",
        bg: "linear-gradient(135deg, #0a040d 0%, #050208 100%)",
        glow: "rgba(244,114,182,0.12)",
        pill: "rgba(244,114,182,0.08)",
        preview: ["#f472b6", "#22d3ee", "#a78bfa"],
      },
      {
        key: "oxygen",
        name: "Oxygen",
        tag: "Clean",
        desc: "Soft blue, medical grade clarity",
        a: "#7dd3fc", b: "#38bdf8", c: "#0ea5e9",
        bg: "linear-gradient(135deg, #04090e 0%, #030609 100%)",
        glow: "rgba(125,211,252,0.1)",
        pill: "rgba(125,211,252,0.08)",
        preview: ["#7dd3fc", "#38bdf8", "#0ea5e9"],
      },
      {
        key: "plasma",
        name: "Plasma",
        tag: "Unstable",
        desc: "Magenta-blue, high-frequency",
        a: "#e879f9", b: "#c026d3", c: "#818cf8",
        bg: "linear-gradient(135deg, #0a040c 0%, #07020a 100%)",
        glow: "rgba(232,121,249,0.12)",
        pill: "rgba(232,121,249,0.08)",
        preview: ["#e879f9", "#c026d3", "#818cf8"],
      },
    ],
  },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];
type Theme = (typeof CATEGORIES)[number]["themes"][number];

function setCssVars(t: Theme) {
  const r = document.documentElement;
  r.style.setProperty("--accent-a", t.a);
  r.style.setProperty("--accent-b", t.b);
  r.style.setProperty("--accent-c", t.c);
  r.style.setProperty("--theme-bg", t.bg);
  r.style.setProperty("--theme-glow", t.glow);
  r.style.setProperty("--theme-pill", t.pill);
}

function findTheme(key: string): Theme {
  for (const cat of CATEGORIES) {
    const found = cat.themes.find((t) => t.key === key);
    if (found) return found;
  }
  return CATEGORIES[0].themes[0];
}

function findCategoryForTheme(key: string): CategoryKey {
  for (const cat of CATEGORIES) {
    if (cat.themes.find((t) => t.key === key)) return cat.key as CategoryKey;
  }
  return CATEGORIES[0].key as CategoryKey;
}

/* ─── mini colour swatch ── */
function Swatch({ colors }: { colors: readonly [string, string, string] }) {
  return (
    <span className="flex items-center gap-[3px]">
      {colors.map((c) => (
        <span key={c} className="h-2.5 w-2.5 rounded-full border border-white/10" style={{ background: c }} />
      ))}
    </span>
  );
}

export default function ThemeSwitcher() {
  const [open,      setOpen]      = useState(false);
  const [step,      setStep]      = useState<"category" | "theme">("category");
  const [activeKey, setActiveKey] = useState<string>("lime-terminal");
  const [browseCat, setBrowseCat] = useState<CategoryKey>("ai");
  const ref = useRef<HTMLDivElement>(null);

  /* Load saved theme */
  useEffect(() => {
    const saved = localStorage.getItem("fwa_theme") ?? "lime-terminal";
    setActiveKey(saved);
    setBrowseCat(findCategoryForTheme(saved));
    setCssVars(findTheme(saved));
  }, []);

  /* Close on outside click */
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function applyTheme(key: string) {
    setActiveKey(key);
    localStorage.setItem("fwa_theme", key);
    setCssVars(findTheme(key));
  }

  function openPanel() {
    setBrowseCat(findCategoryForTheme(activeKey));
    setStep("category");
    setOpen((v) => !v);
  }

  const activeTheme  = findTheme(activeKey);
  const browseThemes = CATEGORIES.find((c) => c.key === browseCat)?.themes ?? [];

  return (
    <>
      <style>{`
        .ts-panel {
          position: absolute;
          right: 0;
          top: calc(100% + 8px);
          width: 300px;
          background: rgba(8,8,10,0.92);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
          z-index: 999;
          animation: tsPanelIn 0.2s ease both;
        }
        @keyframes tsPanelIn {
          from { opacity:0; transform:translateY(-6px) scale(0.98); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        .ts-header {
          padding: 14px 16px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .ts-header-left { display:flex; flex-direction:column; gap:1px; }
        .ts-header-title { font-size:11px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:rgba(255,255,255,0.55); }
        .ts-header-active { font-size:12px; font-weight:600; color:rgba(255,255,255,0.85); display:flex; align-items:center; gap:6px; }
        .ts-close-btn {
          width:24px; height:24px; border-radius:8px;
          background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08);
          color:rgba(255,255,255,0.4); font-size:12px; cursor:pointer;
          display:flex; align-items:center; justify-content:center;
          transition:all 0.15s;
        }
        .ts-close-btn:hover { background:rgba(255,255,255,0.1); color:#fff; }

        /* step breadcrumb */
        .ts-breadcrumb {
          padding: 8px 16px;
          display: flex;
          align-items: center;
          gap: 6px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .ts-breadcrumb-item {
          font-size: 10px; font-weight: 600;
          letter-spacing: 0.1em; text-transform: uppercase;
          cursor: pointer; transition: color 0.15s;
        }
        .ts-breadcrumb-item.active { color:rgba(255,255,255,0.8); }
        .ts-breadcrumb-item.inactive { color:rgba(255,255,255,0.3); }
        .ts-breadcrumb-item.inactive:hover { color:rgba(255,255,255,0.55); }
        .ts-breadcrumb-sep { color:rgba(255,255,255,0.2); font-size:10px; }

        /* category grid */
        .ts-categories {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          padding: 12px;
        }
        .ts-cat-btn {
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.07);
          background: rgba(255,255,255,0.03);
          padding: 12px 10px;
          cursor: pointer;
          text-align: left;
          transition: all 0.18s ease;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .ts-cat-btn:hover { background:rgba(255,255,255,0.07); border-color:rgba(255,255,255,0.14); }
        .ts-cat-btn.selected {
          border-color: rgba(255,255,255,0.2);
          background: rgba(255,255,255,0.08);
        }
        .ts-cat-icon { font-size:18px; line-height:1; margin-bottom:2px; }
        .ts-cat-label { font-size:12px; font-weight:700; color:rgba(255,255,255,0.85); }
        .ts-cat-desc  { font-size:10px; color:rgba(255,255,255,0.35); line-height:1.35; }
        .ts-cat-swatches {
          display:flex; gap:3px; margin-top:5px;
        }
        .ts-cat-swatch {
          width:6px; height:6px; border-radius:50%;
        }

        /* theme list */
        .ts-themes {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 10px 12px 14px;
        }
        .ts-theme-btn {
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.07);
          background: rgba(255,255,255,0.02);
          padding: 10px 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          transition: all 0.18s ease;
        }
        .ts-theme-btn:hover { background:rgba(255,255,255,0.06); border-color:rgba(255,255,255,0.12); }
        .ts-theme-btn.active {
          border-color: rgba(255,255,255,0.22);
          background: rgba(255,255,255,0.07);
        }
        .ts-theme-left { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
        .ts-theme-name-row { display:flex; align-items:center; gap:6px; }
        .ts-theme-name { font-size:13px; font-weight:600; color:rgba(255,255,255,0.85); }
        .ts-theme-tag {
          font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase;
          padding:1px 5px; border-radius:4px;
          background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.4);
        }
        .ts-theme-desc { font-size:10px; color:rgba(255,255,255,0.35); line-height:1.35; }
        .ts-theme-right { display:flex; align-items:center; gap:6px; flex-shrink:0; }
        .ts-active-dot {
          width:6px; height:6px; border-radius:50%;
          background:#fff; opacity:0.7;
        }

        /* footer */
        .ts-footer {
          padding: 8px 16px 12px;
          border-top: 1px solid rgba(255,255,255,0.05);
          font-size:10px; color:rgba(255,255,255,0.25);
          text-align:center;
        }
      `}</style>

      <div className="relative" ref={ref}>

        {/* Trigger button */}
        <button
          onClick={openPanel}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 backdrop-blur transition-all"
        >
          <span className="flex items-center gap-1">
            {activeTheme.preview.map((c) => (
              <span key={c} className="h-2 w-2 rounded-full" style={{ background: c }} />
            ))}
          </span>
          <span className="hidden sm:inline text-xs font-medium">{activeTheme.name}</span>
        </button>

        {/* Panel */}
        {open && (
          <div className="ts-panel">

            {/* Header */}
            <div className="ts-header">
              <div className="ts-header-left">
                <span className="ts-header-title">Appearance</span>
                <span className="ts-header-active">
                  <Swatch colors={activeTheme.preview} />
                  {activeTheme.name}
                </span>
              </div>
              <button className="ts-close-btn" onClick={() => setOpen(false)}>✕</button>
            </div>

            {/* Breadcrumb */}
            <div className="ts-breadcrumb">
              <span
                className={`ts-breadcrumb-item ${step === "category" ? "active" : "inactive"}`}
                onClick={() => setStep("category")}
              >
                Category
              </span>
              {step === "theme" && (
                <>
                  <span className="ts-breadcrumb-sep">›</span>
                  <span className="ts-breadcrumb-item active">
                    {CATEGORIES.find((c) => c.key === browseCat)?.label}
                  </span>
                </>
              )}
            </div>

            {/* Step 1 — Category grid */}
            {step === "category" && (
              <div className="ts-categories">
                {CATEGORIES.map((cat) => {
                  /* collect first colour from each theme for the swatch strip */
                  const swatchColors = cat.themes.map((t) => t.a);
                  return (
                    <button
                      key={cat.key}
                      className={`ts-cat-btn ${browseCat === cat.key ? "selected" : ""}`}
                      onClick={() => {
                        setBrowseCat(cat.key as CategoryKey);
                        setStep("theme");
                      }}
                    >
                      <span className="ts-cat-icon">{cat.icon}</span>
                      <span className="ts-cat-label">{cat.label}</span>
                      <span className="ts-cat-desc">{cat.desc}</span>
                      <div className="ts-cat-swatches">
                        {swatchColors.map((c) => (
                          <span key={c} className="ts-cat-swatch" style={{ background: c }} />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Step 2 — Theme list within chosen category */}
            {step === "theme" && (
              <div className="ts-themes">
                {browseThemes.map((t) => {
                  const isActive = activeKey === t.key;
                  return (
                    <button
                      key={t.key}
                      className={`ts-theme-btn ${isActive ? "active" : ""}`}
                      onClick={() => {
                        applyTheme(t.key);
                        setOpen(false);
                      }}
                    >
                      <div className="ts-theme-left">
                        <div className="ts-theme-name-row">
                          <span className="ts-theme-name">{t.name}</span>
                          <span className="ts-theme-tag">{t.tag}</span>
                        </div>
                        <span className="ts-theme-desc">{t.desc}</span>
                      </div>
                      <div className="ts-theme-right">
                        <Swatch colors={t.preview} />
                        {isActive && <span className="ts-active-dot" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="ts-footer">Saved automatically · changes apply instantly</div>
          </div>
        )}
      </div>
    </>
  );
}