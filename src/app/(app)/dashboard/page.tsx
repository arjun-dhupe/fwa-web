"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

/* ─── helpers ────────────────────────────────────────── */
function yyyyMmDd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function n(v: any, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}
function round(v: number) {
  return Math.round(v * 10) / 10;
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ─── types ──────────────────────────────────────────── */
type Snapshot = {
  log_date: string;
  calorie_intake?: number | null;
  protein_g?: number | null;
  water_l?: number | null;
  sleep_hours?: number | null;
  calories_burned?: number | null;
  workout_sessions?: number | null;
  steps?: number | null;
  target_calories?: number | null;
  target_protein_g?: number | null;
  target_burn?: number | null;
  hit_calorie_target?: boolean | null;
  hit_protein_target?: boolean | null;
  hit_burn_target?: boolean | null;
  hit_water_target?: boolean | null;
  hit_sleep_target?: boolean | null;
  consistency_score?: number | null;
};

type PromptKey = "today" | "calories" | "train" | "eat" | "week";

type ChatMessage = {
  id: string;
  role: "coach" | "user";
  text: string;
  suggestions?: string[];
};

/* ─── MiniBar ────────────────────────────────────────── */
function MiniBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? clamp((value / max) * 100, 4, 100) : 4;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-white/40 uppercase tracking-wider">{label}</span>
        <span className="font-mono text-white/60">{round(value)}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

/* ─── PriorityCard ───────────────────────────────────── */
function PriorityCard({ index, title, detail, cta, href, router }: {
  index: number; title: string; detail: string; cta: string; href: string; router: any;
}) {
  const colors = ["#a3e635", "#34d399", "#60a5fa"];
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02] p-5 transition-all duration-300 hover:border-white/15 hover:bg-white/[0.04]">
      <div className="absolute left-0 top-0 h-full w-0.5" style={{ background: colors[index] ?? colors[0], opacity: 0.5 }} />
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: colors[index] ?? colors[0] }}>
            Priority {index + 1}
          </div>
          <div className="mt-1.5 text-base font-semibold text-white">{title}</div>
          <div className="mt-2 text-sm leading-relaxed text-white/50">{detail}</div>
        </div>
        <button
          onClick={() => router.push(href)}
          className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          {cta} →
        </button>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */
export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [todaySnapshot, setTodaySnapshot] = useState<Snapshot | null>(null);
  const [last7, setLast7] = useState<Snapshot[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptKey | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "coach",
      text: "Hey — I've loaded your numbers. Ask me anything: what to eat, whether to train, how to close today's gaps, or what to focus on this week.",
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);

  // Scrolls ONLY inside the chat container — the page never moves
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const todayIso = useMemo(() => yyyyMmDd(new Date()), []);

  // Keep latest message visible by scrolling the chat box itself
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    // Use requestAnimationFrame so the DOM has painted the new message first
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [chatMessages, chatLoading]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) { router.push("/login"); return; }

        const days: string[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          days.push(yyyyMmDd(d));
        }

        const [{ data: todayRow, error: todayErr }, { data: weekRows, error: weekErr }, { data: profileRow }] = await Promise.all([
          supabase.from("daily_analysis_snapshots").select("*").eq("user_id", data.user.id).eq("log_date", todayIso).maybeSingle(),
          supabase.from("daily_analysis_snapshots").select("*").eq("user_id", data.user.id).in("log_date", days).order("log_date", { ascending: true }),
          supabase.from("profiles").select("name, goal_type, weight_kg, age_years, activity_level, height_cm, body_type").eq("user_id", data.user.id).maybeSingle(),
        ]);

        if (todayErr) throw new Error(todayErr.message);
        if (weekErr) throw new Error(weekErr.message);

        setTodaySnapshot((todayRow as Snapshot | null) ?? null);
        setLast7((weekRows as Snapshot[]) ?? []);

        // Only use the name the user explicitly set in Profile — never the email
        const rawProfile = (profileRow as any) ?? {};
        setUserProfile({ ...rawProfile, name: rawProfile.name || null });
      } catch (e: any) {
        setMsg(e?.message ?? "Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
  }, [router, todayIso]);

  /* ── derived values ── */
  const intake      = n(todaySnapshot?.calorie_intake, 0);
  const protein     = n(todaySnapshot?.protein_g, 0);
  const burn        = n(todaySnapshot?.calories_burned, 0);
  const water       = n(todaySnapshot?.water_l, 0);
  const sleep       = n(todaySnapshot?.sleep_hours, 0);
  const targetCals  = n(todaySnapshot?.target_calories, 0);
  const targetProt  = n(todaySnapshot?.target_protein_g, 0);
  const targetBurn  = n(todaySnapshot?.target_burn, 0);
  const consistency = n(todaySnapshot?.consistency_score, 0);

  const priorities = useMemo(() => {
    const items: { title: string; detail: string; cta: string; href: string }[] = [];
    if (targetProt > 0 && protein < targetProt * 0.8)
      items.push({ title: "Protein is lagging", detail: `At ${round(protein)}g vs ${round(targetProt)}g target. Close this before the day ends.`, cta: "Log food", href: "/log" });
    if (water < 2.5)
      items.push({ title: "Hydration needs work", detail: `Only ${round(water)}L today. A hydration push improves energy and recovery fast.`, cta: "Log water", href: "/log" });
    if (targetBurn > 0 && burn < targetBurn * 0.85)
      items.push({ title: "Burn is below target", detail: `${round(burn)} kcal burned vs ${round(targetBurn)} kcal target. A short session still moves this.`, cta: "Log workout", href: "/log-workout" });
    if (sleep > 0 && sleep < 7)
      items.push({ title: "Recovery is weak", detail: `${round(sleep)}h sleep logged. Training hard on poor recovery costs you tomorrow.`, cta: "Review today", href: "/today" });
    if (items.length === 0)
      items.push({ title: "Protect the good work", detail: "Today already looks solid. Finish the day clean.", cta: "Open Today", href: "/today" });
    return items.slice(0, 3);
  }, [protein, targetProt, water, burn, targetBurn, sleep]);

  const coachSummary = useMemo(() => {
    if (!todaySnapshot) return "Start logging today's food, water, sleep, and training so I can give you precise guidance.";
    const calText  = targetCals > 0 ? `Calories: ${round(intake)} of ${round(targetCals)} target.` : `Calories logged: ${round(intake)}.`;
    const burnText = targetBurn > 0 ? `Burn: ${round(burn)} of ${round(targetBurn)} target.` : `Burn: ${round(burn)} kcal.`;
    const recText  = sleep > 0 ? `Sleep ${round(sleep)}h, water ${round(water)}L.` : `Water ${round(water)}L — sleep still needs logging.`;
    return `${calText} ${burnText} ${recText} Consistency score: ${round(consistency)}/100.`;
  }, [todaySnapshot, intake, targetCals, burn, targetBurn, sleep, water, consistency]);

  function buildFallbackReply(q: string): string {
    const lq = q.toLowerCase();
    if (lq.includes("today") || lq.includes("what should i do")) return priorities[0]?.detail ?? "Focus on the next useful action, not the perfect one.";
    if (lq.includes("calorie")) {
      const delta = round(intake - targetCals);
      if (delta > 120) return `You're about ${delta} kcal over. Keep your next meal lighter.`;
      if (delta < -120) return `You're ${Math.abs(delta)} kcal under. Add a clean snack or meal.`;
      return "Calories are close to target. Stay calm and finish clean.";
    }
    if (lq.includes("train") || lq.includes("workout")) {
      if (sleep > 0 && sleep < 6.5) return "You can train, but keep it controlled today — poor sleep means poor recovery.";
      if (targetBurn > 0 && burn < targetBurn * 0.8) return "Yes — a short focused workout makes sense, your burn is still behind.";
      return "Training is optional. If you do it, make it a smart consistency session.";
    }
    if (lq.includes("eat") || lq.includes("protein") || lq.includes("meal")) {
      if (targetProt > 0 && protein < targetProt * 0.8) return "Prioritize protein in your next meal first, then keep calories controlled.";
      return "Keep your next meal simple: quality protein, controlled calories, no extras.";
    }
    if (lq.includes("week") || lq.includes("focus")) {
      const avg = last7.length > 0 ? round(last7.reduce((s, x) => s + n(x.consistency_score, 0), 0) / last7.length) : 0;
      return `Your recent average consistency is ${avg}/100. This week: more stable days, not more extreme ones.`;
    }
    return `${coachSummary} Do the next useful thing, not the perfect thing.`;
  }

  async function fetchCoachReply(question: string): Promise<{ reply: string; suggestions: string[] }> {
    const recentMessages = chatMessages.slice(-8).map((m) => ({ role: m.role, text: m.text }));
    const payload = {
      question,
      context: {
        today: {
          date:          todayIso,
          calories:      intake,
          targetCalories: targetCals,
          protein,
          targetProtein:  targetProt,
          burn,
          targetBurn,
          water,
          sleep,
          consistency,
          priorities,
          coachSummary,
        },
        last7: {
          averageConsistency: last7.length > 0 ? round(last7.reduce((s, x) => s + n(x.consistency_score, 0), 0) / last7.length) : 0,
          averageCalories:    last7.length > 0 ? round(last7.reduce((s, x) => s + n(x.calorie_intake, 0), 0) / last7.length) : 0,
          averageBurn:        last7.length > 0 ? round(last7.reduce((s, x) => s + n(x.calories_burned, 0), 0) / last7.length) : 0,
          averageSleep:       last7.length > 0 ? round(last7.reduce((s, x) => s + n(x.sleep_hours, 0), 0) / last7.length) : 0,
          averageWater:       last7.length > 0 ? round(last7.reduce((s, x) => s + n(x.water_l, 0), 0) / last7.length) : 0,
        },
        // ← profile sent silently on every message
        profile: userProfile ? {
          name:          userProfile.name          ?? null,
          goal:          userProfile.goal_type     ?? null,
          weightKg:      userProfile.weight_kg     ?? null,
          ageYears:      userProfile.age_years     ?? null,
          activityLevel: userProfile.activity_level ?? null,
          heightCm:      userProfile.height_cm     ?? null,
          bodyType:      userProfile.body_type     ?? null,
        } : null,
        recentMessages,
      },
    };
    const res = await fetch("/api/coach/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Coach unavailable right now.");
    return {
      reply:       String(data?.reply || "I'm here — give me a little more detail."),
      suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [],
    };
  }

  async function sendChatMessage(rawText: string) {
    const text = rawText.trim();
    if (!text || chatLoading) return;
    // Clear suggestions from all previous coach messages when user sends a new one
    setChatMessages((prev) => [
      ...prev.map(m => m.role === "coach" ? { ...m, suggestions: [] } : m),
      { id: `${Date.now()}-user`, role: "user", text },
    ]);
    setChatInput("");
    setChatLoading(true);
    try {
      const { reply, suggestions } = await fetchCoachReply(text);
      setChatMessages((prev) => [...prev, {
        id: `${Date.now()}-coach`,
        role: "coach",
        text: reply,
        suggestions,
      }]);
    } catch (e: any) {
      const fallback = buildFallbackReply(text);
      setMsg(e?.message ?? "Coach unavailable right now.");
      setChatMessages((prev) => [...prev, { id: `${Date.now()}-fallback`, role: "coach", text: fallback }]);
    } finally {
      setChatLoading(false);
    }
  }

  const trendLabels   = useMemo(() => last7.map((x) => new Date(`${x.log_date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" })), [last7]);
  const intakeTrend   = last7.map((x) => n(x.calorie_intake, 0));
  const burnTrend     = last7.map((x) => n(x.calories_burned, 0));
  const recoveryTrend = last7.map((x) => n(x.sleep_hours, 0));
  const trendMax      = Math.max(1, ...intakeTrend, ...burnTrend, ...recoveryTrend.map((v) => v * 250));

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const prompts: { key: PromptKey; label: string; icon: string }[] = [
    { key: "today",    label: "What should I do today?", icon: "🎯" },
    { key: "calories", label: "Fix my calories?",        icon: "🍽️" },
    { key: "train",    label: "Should I train?",         icon: "💪" },
    { key: "eat",      label: "What should I eat?",      icon: "🥗" },
    { key: "week",     label: "This week's focus?",      icon: "📅" },
  ];

  return (
    <>
      <style>{`
        .arjun-brand { font-weight: 700; letter-spacing: -0.02em; }

        .coach-bubble {
          background: linear-gradient(135deg, rgba(163,230,53,0.07) 0%, rgba(255,255,255,0.02) 100%);
          border: 1px solid rgba(163,230,53,0.12);
        }
        .user-bubble {
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.09);
        }
        .chat-panel {
          background: linear-gradient(160deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.2) 100%);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .chat-glow {
          box-shadow:
            0 0 0 1px rgba(163,230,53,0.06),
            0 4px 40px rgba(163,230,53,0.05),
            0 1px 0 rgba(255,255,255,0.04) inset;
        }
        .prompt-chip {
          border: 1px solid rgba(255,255,255,0.07);
          background: rgba(255,255,255,0.02);
          transition: all 0.18s ease;
          cursor: pointer;
        }
        .prompt-chip:hover {
          border-color: rgba(163,230,53,0.35);
          background: rgba(163,230,53,0.06);
          color: #a3e635;
        }
        .prompt-chip.active {
          border-color: rgba(163,230,53,0.45);
          background: rgba(163,230,53,0.09);
          color: #a3e635;
        }
        .input-field {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          transition: border-color 0.2s ease, background 0.2s ease;
        }
        .input-field:focus {
          outline: none;
          border-color: rgba(163,230,53,0.35);
          background: rgba(163,230,53,0.03);
        }
        .send-btn {
          background: #a3e635;
          color: #000;
          font-weight: 700;
          transition: all 0.18s ease;
        }
        .send-btn:hover:not(:disabled) { background: #bef264; }
        .send-btn:disabled { opacity: 0.35; cursor: not-allowed; }

        /* Chat scroll — contained, never affects the page */
        .chat-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.08) transparent;
          overflow-y: auto;
          overscroll-behavior: contain;
        }
        .chat-scroll::-webkit-scrollbar { width: 3px; }
        .chat-scroll::-webkit-scrollbar-track { background: transparent; }
        .chat-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 99px; }

        .score-ring {
          background: conic-gradient(#a3e635 calc(var(--pct) * 1%), rgba(255,255,255,0.06) 0);
        }
        .section-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent);
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up  { animation: fadeUp 0.4s ease both; }
        .delay-1  { animation-delay: 0.07s; }
        .delay-2  { animation-delay: 0.14s; }
        .delay-3  { animation-delay: 0.21s; }

        @keyframes blink {
          0%, 80%, 100% { opacity: 0.15; transform: scale(0.8); }
          40%            { opacity: 1;   transform: scale(1);   }
        }
        .typing-dot { animation: blink 1.3s ease-in-out infinite; }
        .typing-dot:nth-child(2) { animation-delay: 0.18s; }
        .typing-dot:nth-child(3) { animation-delay: 0.36s; }

        .suggestion-chip { transition: all 0.15s ease; }
        .suggestion-chip:hover { transform: translateY(-1px); }
      `}</style>

      <div className="space-y-6">

        {/* ── HERO ──────────────────────────────────── */}
        <div className="fade-up relative overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-white/[0.04] to-transparent p-7">
          <div className="pointer-events-none absolute right-[-80px] top-[-80px] h-[300px] w-[300px] rounded-full bg-lime-400/[0.04] blur-3xl" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-lime-400/15 ring-1 ring-lime-400/25">
                  <svg className="h-4 w-4 text-lime-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <span className="arjun-brand text-lg text-white">Arjun</span>
                <span className="rounded-full bg-lime-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-lime-400/80">
                  Coach
                </span>
              </div>
              <h1 className="mt-3 text-4xl font-bold text-white leading-tight">{greeting}.</h1>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { label: "Log Data",    icon: "➕", href: "/log"         },
                { label: "Log Workout", icon: "🏋️", href: "/log-workout" },
                { label: "Analysis",    icon: "🧠", href: "/analysis"    },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={() => router.push(a.href)}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/65 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                >
                  {a.icon} {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── CHAT MVP ──────────────────────────────── */}
        <div className="fade-up delay-1 chat-panel chat-glow rounded-3xl">

          {/* Header */}
          <div className="flex items-center gap-3 border-b border-white/6 px-6 py-4">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-lime-400/12 ring-1 ring-lime-400/20">
              <svg className="h-4 w-4 text-lime-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
              {chatLoading && (
                <span className="absolute -right-1 -top-1 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-400 opacity-50" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-lime-400" />
                </span>
              )}
            </div>
            <div>
              <span className="arjun-brand text-base text-white">Ask Arjun</span>
              <span className="ml-2 text-xs text-white/30">your numbers are loaded</span>
            </div>
          </div>

          {/* Quick prompt chips */}
          <div className="flex flex-wrap gap-2 border-b border-white/6 px-6 py-3">
            {prompts.map((q) => (
              <button
                key={q.key}
                onClick={async () => {
                  setSelectedPrompt(q.key);
                  await sendChatMessage(q.label);
                }}
                className={cx(
                  "prompt-chip rounded-full px-3 py-1.5 text-xs font-medium text-white/50",
                  selectedPrompt === q.key && "active"
                )}
              >
                <span className="mr-1.5">{q.icon}</span>{q.label}
              </button>
            ))}
          </div>

          {/* Messages — fixed height, internal scroll only, page never moves */}
          <div
            ref={chatScrollRef}
            className="chat-scroll h-[380px] space-y-3 px-6 py-5"
          >
            {chatMessages.map((message) => (
              <div key={message.id}>
                <div
                  className={cx(
                    "max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    message.role === "coach"
                      ? "coach-bubble text-white/80"
                      : "user-bubble ml-auto text-white/90"
                  )}
                >
                  {message.role === "coach" && (
                    <span className="arjun-brand mr-2 text-xs text-lime-400">Arjun</span>
                  )}
                  {message.role === "coach" ? (
                    <span>
                      {message.text.split("\n").map((line, i) => {
                        const trimmed = line.trim();
                        // Day header: "Day 1 — ..." or "Day 1:"
                        if (/^day\s*\d+/i.test(trimmed)) {
                          return (
                            <span key={i}>
                              {i > 0 && <br />}
                              <span className="block mt-2 font-bold text-white/95">{trimmed}</span>
                            </span>
                          );
                        }
                        // Bullet point
                        if (trimmed.startsWith("•") || trimmed.startsWith("-")) {
                          return (
                            <span key={i} className="block pl-3 text-white/75">
                              {trimmed}
                            </span>
                          );
                        }
                        // Empty line = spacing
                        if (trimmed === "") {
                          return <span key={i} className="block mt-1" />;
                        }
                        // Normal line
                        return (
                          <span key={i}>
                            {i > 0 && trimmed !== "" && <br />}
                            {trimmed}
                          </span>
                        );
                      })}
                    </span>
                  ) : (
                    message.text
                  )}
                </div>

                {/* Follow-up suggestion chips — only on latest coach message */}
                {message.role === "coach" && message.suggestions && message.suggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 max-w-[90%]">
                    {message.suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => sendChatMessage(s)}
                        disabled={chatLoading}
                        className="suggestion-chip rounded-full border border-lime-400/20 bg-lime-400/5 px-3 py-1.5 text-[11px] font-medium text-lime-400/70 transition hover:border-lime-400/40 hover:bg-lime-400/10 hover:text-lime-400 disabled:opacity-30"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {chatLoading && (
              <div className="coach-bubble max-w-[82%] rounded-2xl px-4 py-3">
                <span className="arjun-brand mr-2 text-xs text-lime-400">Arjun</span>
                <span className="inline-flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-lime-400" />
                  ))}
                </span>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-white/6 px-6 py-4">
            <div className="flex gap-3">
              <input
                value={chatInput}
                disabled={chatLoading}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void sendChatMessage(chatInput); }
                }}
                placeholder={chatLoading ? "Arjun is thinking…" : "Ask about food, workouts, recovery, or anything…"}
                className="input-field flex-1 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 disabled:opacity-50"
              />
              <button
                disabled={chatLoading || !chatInput.trim()}
                onClick={() => void sendChatMessage(chatInput)}
                className="send-btn rounded-xl px-5 py-3 text-sm"
              >
                {chatLoading ? "…" : "Send"}
              </button>
            </div>
          </div>
        </div>

        {/* ── PRIORITIES + TODAY PLAN ──────────────── */}
        <div className="fade-up delay-2 grid gap-6 xl:grid-cols-2">

          <div className="rounded-3xl border border-white/8 bg-white/[0.02] p-6">
            <div className="mb-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">Highest-value moves</div>
              <h2 className="mt-1.5 text-2xl font-bold text-white">Today's priorities</h2>
            </div>
            <div className="space-y-3">
              {priorities.map((item, i) => (
                <PriorityCard key={item.title} index={i} router={router} {...item} />
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/8 bg-white/[0.02] p-6">
            <div className="mb-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">Operating plan</div>
              <h2 className="mt-1.5 text-2xl font-bold text-white">How to win today</h2>
            </div>

            <div className="flex items-center gap-5 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
              <div
                className="score-ring relative h-16 w-16 shrink-0 rounded-full p-1"
                style={{ "--pct": consistency } as any}
              >
                <div className="flex h-full w-full items-center justify-center rounded-full bg-[#0a0a0f]">
                  <span className="text-sm font-bold text-white">{round(consistency)}</span>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-white/55">{coachSummary}</p>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                { label: "Main focus", val: priorities[0]?.title ?? "Protect momentum",                                                                                                        color: "#a3e635" },
                { label: "Secondary",  val: water < 2.5 ? "Push hydration" : targetProt > 0 && protein < targetProt * 0.85 ? "Close protein gap" : "Keep basics clean",                       color: "#34d399" },
                { label: "Avoid",      val: targetCals > 0 && intake > targetCals * 1.08 ? "Extra calories tonight" : sleep > 0 && sleep < 6.5 ? "All-out training" : "Random decisions",     color: "#f87171" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-white/8 p-3">
                  <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: item.color }}>{item.label}</div>
                  <div className="mt-1 text-xs font-semibold text-white/80">{item.val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── 7-DAY TREND ──────────────────────────── */}
        {last7.length > 0 && (
          <div className="fade-up delay-3 rounded-3xl border border-white/8 bg-white/[0.02] p-6">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">Past 7 days</div>
                <h2 className="mt-1.5 text-2xl font-bold text-white">Weekly momentum</h2>
              </div>
              <div className="flex items-center gap-4 text-[10px] text-white/30 uppercase tracking-wider">
                <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-white/60" />Intake</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />Burn</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-violet-400" />Sleep</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-7">
              {last7.map((row, i) => (
                <div
                  key={row.log_date}
                  className={cx(
                    "rounded-2xl border p-4 transition-all hover:scale-[1.03]",
                    row.log_date === todayIso ? "border-lime-400/25 bg-lime-400/[0.05]" : "border-white/6 bg-white/[0.02]"
                  )}
                >
                  <div className={cx("mb-3 text-[10px] font-bold uppercase tracking-widest", row.log_date === todayIso ? "text-lime-400" : "text-white/35")}>
                    {trendLabels[i]}
                  </div>
                  <div className="space-y-2.5">
                    <MiniBar label="In"  value={intakeTrend[i] ?? 0}               max={trendMax} color="#ffffff99" />
                    <MiniBar label="Out" value={burnTrend[i] ?? 0}                  max={trendMax} color="#34d399"   />
                    <MiniBar label="Zzz" value={(recoveryTrend[i] ?? 0) * 250}      max={trendMax} color="#a78bfa"   />
                  </div>
                  <div className="mt-3 text-[10px] text-white/30">
                    {round(n(row.consistency_score, 0))}<span className="text-white/15">/100</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="section-divider mt-5" />
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              {[
                { label: "Avg Intake", val: `${round(last7.reduce((s, x) => s + n(x.calorie_intake, 0), 0) / Math.max(1, last7.length))} kcal` },
                { label: "Avg Burn",   val: `${round(last7.reduce((s, x) => s + n(x.calories_burned, 0), 0) / Math.max(1, last7.length))} kcal` },
                { label: "Avg Sleep",  val: `${round(last7.reduce((s, x) => s + n(x.sleep_hours, 0), 0) / Math.max(1, last7.length))} h`    },
                { label: "Avg Water",  val: `${round(last7.reduce((s, x) => s + n(x.water_l, 0), 0) / Math.max(1, last7.length))} L`        },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-white/6 bg-white/[0.02] p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30">{s.label}</div>
                  <div className="mt-1.5 text-xl font-bold text-white">{s.val}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && <div className="text-center text-sm text-white/30">Loading…</div>}
        {msg && <div className="rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">{msg}</div>}
      </div>
    </>
  );
}