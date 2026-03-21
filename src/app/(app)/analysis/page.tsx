"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/* ─── Helpers ────────────────────────────────────────── */
function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function round(v: number) { return Math.round(v * 10) / 10; }
function cx(...parts: (string | false | null | undefined)[]) { return parts.filter(Boolean).join(" "); }
function ymdLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" });
}
function startDateFromDays(days: number) {
  const d = new Date(); d.setDate(d.getDate() - (days - 1)); return ymdLocal(d);
}

/* ─── Ranges ─────────────────────────────────────────── */
const ranges = [
  { key: "week",    label: "7 days",    days: 7   },
  { key: "biweek",  label: "14 days",   days: 14  },
  { key: "month",   label: "30 days",   days: 30  },
  { key: "quarter", label: "90 days",   days: 90  },
  { key: "half",    label: "180 days",  days: 180 },
  { key: "year",    label: "365 days",  days: 365 },
] as const;
type RangeKey = (typeof ranges)[number]["key"];

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
  calorie_delta?: number | null;
  protein_delta?: number | null;
  burn_delta?: number | null;
  hit_calorie_target?: boolean | null;
  hit_protein_target?: boolean | null;
  hit_burn_target?: boolean | null;
  hit_water_target?: boolean | null;
  hit_sleep_target?: boolean | null;
  consistency_score?: number | null;
};

/* ─── Animated counter ───────────────────────────────── */
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef   = useRef<number | null>(null);
  useEffect(() => {
    startRef.current = null;
    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setVal(target * ease);
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);
  return val;
}

/* ─── Score arc ──────────────────────────────────────── */
function ScoreArc({ score }: { score: number }) {
  const r    = 54;
  const circ = Math.PI * r; // half circle
  const pct  = Math.min(score / 100, 1);
  const color = score >= 80 ? "#22c55e" : score >= 55 ? "#f59e0b" : "#ef4444";
  const animated = useCountUp(score, 1200);

  return (
    <div className="relative flex justify-center items-end" style={{ height: 80 }}>
      <svg width="160" height="88" viewBox="0 0 160 88" className="absolute bottom-0">
        {/* Track */}
        <path d="M12 84 A68 68 0 0 1 148 84" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" strokeLinecap="round" />
        {/* Fill */}
        <path
          d="M12 84 A68 68 0 0 1 148 84"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${pct * circ} ${circ}`}
          style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.22,1,0.36,1), stroke 0.6s ease", filter: `drop-shadow(0 0 8px ${color}60)` }}
        />
      </svg>
      <div className="relative z-10 text-center pb-1">
        <div className="text-4xl font-black text-white leading-none">{Math.round(animated)}</div>
        <div className="text-[10px] text-white/35 tracking-widest uppercase mt-0.5">/ 100</div>
      </div>
    </div>
  );
}

/* ─── Metric bar ─────────────────────────────────────── */
const METRIC_COLORS: Record<string, string> = {
  calories: "#f59e0b",
  protein:  "#a78bfa",
  burn:     "#34d399",
  water:    "#38bdf8",
  sleep:    "#818cf8",
  steps:    "#fb923c",
};

function MetricBar({ label, value, max, suffix = "", color = "#ffffff" }: {
  label: string; value: number; max: number; suffix?: string; color?: string;
}) {
  const width = max > 0 ? Math.max(3, Math.min(100, (value / max) * 100)) : 3;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-white/50 font-medium">{label}</span>
        <span className="font-bold text-white/80">{round(value)}{suffix}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${width}%`, background: color, boxShadow: `0 0 8px ${color}40` }}
        />
      </div>
    </div>
  );
}

/* ─── Heat calendar ──────────────────────────────────── */
function HeatCalendar({ snapshots }: { snapshots: Snapshot[] }) {
  const map = new Map(snapshots.map(s => [s.log_date, num(s.consistency_score)]));

  const cells = useMemo(() => {
    const days: { date: string; score: number }[] = [];
    for (const s of snapshots) days.push({ date: s.log_date, score: num(s.consistency_score) });
    return days;
  }, [snapshots]);

  function scoreColor(score: number): string {
    if (score === 0) return "rgba(255,255,255,0.04)";
    if (score >= 85) return "#22c55e";
    if (score >= 65) return "#a3e635";
    if (score >= 45) return "#f59e0b";
    if (score >= 25) return "#f97316";
    return "#ef4444";
  }

  if (cells.length === 0) return null;

  const weeks: { date: string; score: number }[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div>
      <div className="flex gap-1 flex-wrap">
        {cells.map(c => (
          <div
            key={c.date}
            title={`${formatDate(c.date)} — ${c.score > 0 ? round(c.score) + "/100" : "No data"}`}
            className="rounded-sm transition-all hover:scale-125"
            style={{
              width: 12, height: 12,
              background: scoreColor(c.score),
              boxShadow: c.score >= 65 ? `0 0 4px ${scoreColor(c.score)}60` : "none",
            }}
          />
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3">
        <span className="text-[10px] text-white/25">No data</span>
        {[10, 40, 65, 85].map(s => (
          <div key={s} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: scoreColor(s) }} />
            <span className="text-[10px] text-white/25">{s}+</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Sparkline ──────────────────────────────────────── */
function Sparkline({ data, color = "#a3e635", height = 40 }: { data: number[]; color?: string; height?: number }) {
  if (data.length < 2) return <div style={{ height }} className="flex items-center justify-center text-xs text-white/20">Not enough data</div>;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 200; const h = height;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const pathD = `M ${pts.join(" L ")}`;
  const areaD = `M ${pts[0]} L ${pts.join(" L ")} L ${w},${h} L 0,${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={"grad" + color.replace("#", "")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#grad${color.replace("#", "")})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Stat pill ──────────────────────────────────────── */
function StatPill({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string; color?: string; icon?: string;
}) {
  return (
    <div
      className="rounded-2xl p-5 relative overflow-hidden"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      {color && <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl" style={{ background: color }} />}
      <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 flex items-center gap-1.5">
        {icon && <span>{icon}</span>}{label}
      </div>
      <div className="mt-2.5 text-2xl font-black text-white leading-none">{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-white/35">{sub}</div>}
    </div>
  );
}

/* ─── Insight card ───────────────────────────────────── */
function InsightCard({ icon, text, accent }: { icon: string; text: string; accent: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3.5 flex items-start gap-3"
      style={{ background: `${accent}08`, border: `1px solid ${accent}20` }}
    >
      <span className="text-base flex-shrink-0 mt-0.5">{icon}</span>
      <p className="text-sm text-white/70 leading-relaxed">{text}</p>
    </div>
  );
}

/* ─── Section header ─────────────────────────────────── */
function SectionHeader({ title, subtitle, badge }: { title: string; subtitle?: string; badge?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-white/40">{subtitle}</p>}
      </div>
      {badge && (
        <span className="flex-shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
          {badge}
        </span>
      )}
    </div>
  );
}

/* ─── Skeleton ───────────────────────────────────────── */
function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-white/5", className)} />;
}

/* ─── Main page ──────────────────────────────────────── */
export default function AnalysisPage() {
  const [userId,     setUserId]     = useState<string | null>(null);
  const [rangeKey,   setRangeKey]   = useState<RangeKey>("month");
  const [snapshots,  setSnapshots]  = useState<Snapshot[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [aiAnswer,   setAiAnswer]   = useState<Record<string, string>>({});
  const [aiLoading,  setAiLoading]  = useState<string | null>(null);
  const [msg,        setMsg]        = useState("");

  const range = ranges.find(r => r.key === rangeKey)!;

  const [profileBurnTarget, setProfileBurnTarget] = useState<number>(0);

  /* ── Fetch snapshots ── */
  useEffect(() => {
    (async () => {
      setLoading(true); setMsg("");
      const { data } = await supabase.auth.getUser();
      if (!data.user) { setLoading(false); return; }
      setUserId(data.user.id);
      const startIso = startDateFromDays(range.days);

      const [{ data: rows, error }, { data: workoutRows }, { data: profileRow }] = await Promise.all([
        supabase
          .from("daily_analysis_snapshots").select("*")
          .eq("user_id", data.user.id).gte("log_date", startIso)
          .order("log_date", { ascending: true }),
        supabase
          .from("workout_logs").select("log_date, calories_burned")
          .eq("user_id", data.user.id).gte("log_date", startIso),
        supabase
          .from("profiles").select("*")
          .eq("user_id", data.user.id).maybeSingle(),
      ]);

      if (error) { setMsg(error.message); setSnapshots([]); setLoading(false); return; }

      // Derive burn target from profile (same logic as today page)
      if (profileRow) {
        const savedBurn = ["target_burn_calories","target_burn","daily_burn_target","burn_target","calorie_burn_target","recommended_burn_calories"]
          .map(k => num((profileRow as any)[k])).find(v => v > 0) || 0;
        if (savedBurn > 0) {
          setProfileBurnTarget(savedBurn);
        } else {
          // Compute from goal if not saved
          const goal = String((profileRow as any).goal_type || (profileRow as any).goal || "").toLowerCase();
          const computed = goal.includes("fat") ? 450 : goal.includes("muscle") ? 250 : goal.includes("endurance") ? 400 : 350;
          setProfileBurnTarget(computed);
        }
      }

      // Sum burn per date from workout_logs (same source as today page)
      const burnByDate = new Map<string, number>();
      const sessionsByDate = new Map<string, number>();
      for (const w of workoutRows || []) {
        const d = w.log_date;
        burnByDate.set(d, (burnByDate.get(d) || 0) + num(w.calories_burned));
        sessionsByDate.set(d, (sessionsByDate.get(d) || 0) + 1);
      }

      // Merge real burn into snapshots
      const merged = (rows || []).map(s => ({
        ...s,
        calories_burned:  burnByDate.get(s.log_date)    ?? num(s.calories_burned),
        workout_sessions: sessionsByDate.get(s.log_date) ?? num(s.workout_sessions),
      }));

      setSnapshots(merged as Snapshot[]);
      setLoading(false);
    })();
  }, [rangeKey]);

  /* ── Totals ── */
  const totals = useMemo(() => {
    const count = Math.max(snapshots.length, 1);
    const daysWithCal    = snapshots.filter(x => num(x.calorie_intake) > 0).length || 1;
    const daysWithProt   = snapshots.filter(x => num(x.protein_g) > 0).length || 1;
    const daysWithBurn   = snapshots.filter(x => num(x.calories_burned) > 0).length || 1;
    const daysWithWater  = snapshots.filter(x => num(x.water_l) > 0).length || 1;
    const daysWithSleep  = snapshots.filter(x => num(x.sleep_hours) > 0).length || 1;

    const calorieIntake  = snapshots.reduce((s, x) => s + num(x.calorie_intake), 0);
    const protein        = snapshots.reduce((s, x) => s + num(x.protein_g), 0);
    const burn           = snapshots.reduce((s, x) => s + num(x.calories_burned), 0);
    const water          = snapshots.reduce((s, x) => s + num(x.water_l), 0);
    const sleep          = snapshots.reduce((s, x) => s + num(x.sleep_hours), 0);
    const steps          = snapshots.reduce((s, x) => s + num(x.steps), 0);
    const workouts       = snapshots.reduce((s, x) => s + num(x.workout_sessions), 0);
    const calorieHits    = snapshots.filter(x => x.hit_calorie_target).length;
    const proteinHits    = snapshots.filter(x => x.hit_protein_target).length;
    const burnHits = profileBurnTarget > 0
      ? snapshots.filter(x => num(x.calories_burned) >= profileBurnTarget * 0.9).length
      : snapshots.filter(x => x.hit_burn_target).length;
    const waterHits      = snapshots.filter(x => x.hit_water_target).length;
    const sleepHits      = snapshots.filter(x => x.hit_sleep_target).length;
    const consistency    = snapshots.reduce((s, x) => s + num(x.consistency_score), 0) / count;

    return {
      calorieIntake, protein, burn, water, sleep, steps, workouts, count,
      daysWithCal, daysWithProt, daysWithBurn, daysWithWater, daysWithSleep,
      avgCalories:  calorieIntake / daysWithCal,
      avgProtein:   protein / daysWithProt,
      avgBurn:      burn / daysWithBurn,
      avgWater:     water / daysWithWater,
      avgSleep:     sleep / daysWithSleep,
      avgSteps:     steps / count,
      avgWorkouts:  workouts / count,
      calorieHits, proteinHits, burnHits, waterHits, sleepHits, consistency,
    };
  }, [snapshots]);

  /* ── Discipline score — only counts logged metrics ── */
  const disciplineScore = useMemo(() => {
    if (snapshots.length === 0) return 0;
    const metrics: { hits: number; days: number }[] = [];
    if (totals.daysWithCal > 1)   metrics.push({ hits: totals.calorieHits, days: totals.daysWithCal });
    if (totals.daysWithProt > 1)  metrics.push({ hits: totals.proteinHits, days: totals.daysWithProt });
    if (totals.daysWithBurn > 1)  metrics.push({ hits: totals.burnHits,    days: totals.daysWithBurn });
    if (totals.daysWithWater > 1) metrics.push({ hits: totals.waterHits,   days: totals.daysWithWater });
    if (totals.daysWithSleep > 1) metrics.push({ hits: totals.sleepHits,   days: totals.daysWithSleep });
    if (metrics.length === 0) return 0;
    const hitRate = metrics.reduce((s, m) => s + m.hits / m.days, 0) / metrics.length * 100;
    return Math.max(0, Math.min(100, round(hitRate * 0.65 + totals.consistency * 0.35)));
  }, [snapshots, profileBurnTarget]);

  /* ── Momentum: first half vs second half ── */
  const momentum = useMemo(() => {
    if (snapshots.length < 6) return null;
    const mid  = Math.floor(snapshots.length / 2);
    const first = snapshots.slice(0, mid);
    const second = snapshots.slice(mid);
    const avg = (arr: Snapshot[]) => arr.reduce((s, x) => s + num(x.consistency_score), 0) / arr.length;
    const delta = round(avg(second) - avg(first));
    return { delta, direction: delta > 2 ? "improving" : delta < -2 ? "declining" : "stable" };
  }, [snapshots]);

  /* ── Personal records ── */
  const records = useMemo(() => {
    if (snapshots.length === 0) return [];
    const recs: { label: string; value: string; date: string; icon: string }[] = [];
    const bestProtein = snapshots.reduce((a, b) => num(a.protein_g) > num(b.protein_g) ? a : b);
    if (num(bestProtein.protein_g) > 0) recs.push({ label: "Best protein day", value: round(num(bestProtein.protein_g)) + "g", date: formatDate(bestProtein.log_date), icon: "💪" });
    const bestSleep = snapshots.reduce((a, b) => num(a.sleep_hours) > num(b.sleep_hours) ? a : b);
    if (num(bestSleep.sleep_hours) > 0) recs.push({ label: "Best sleep", value: round(num(bestSleep.sleep_hours)) + "h", date: formatDate(bestSleep.log_date), icon: "😴" });
    const bestBurn = snapshots.reduce((a, b) => num(a.calories_burned) > num(b.calories_burned) ? a : b);
    if (num(bestBurn.calories_burned) > 0) recs.push({ label: "Peak burn day", value: round(num(bestBurn.calories_burned)) + " kcal", date: formatDate(bestBurn.log_date), icon: "🔥" });
    const bestSteps = snapshots.reduce((a, b) => num(a.steps) > num(b.steps) ? a : b);
    if (num(bestSteps.steps) > 0) recs.push({ label: "Most steps", value: num(bestSteps.steps).toLocaleString(), date: formatDate(bestSteps.log_date), icon: "🚶" });
    return recs;
  }, [snapshots]);

  /* ── Streak ── */
  const streak = useMemo(() => {
    if (snapshots.length === 0) return { current: 0, best: 0 };
    let current = 0; let best = 0; let run = 0;
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (num(snapshots[i].consistency_score) >= 40) { if (current === 0) current++; }
      else if (current > 0) break;
    }
    for (const s of snapshots) {
      if (num(s.consistency_score) >= 40) { run++; best = Math.max(best, run); }
      else run = 0;
    }
    return { current, best };
  }, [snapshots]);

  /* ── Week over week ── */
  const weekVsWeek = useMemo(() => {
    if (snapshots.length < 14) return null;
    const last7  = snapshots.slice(-7);
    const prev7  = snapshots.slice(-14, -7);
    const avg = (arr: Snapshot[], key: keyof Snapshot) => arr.reduce((s, x) => s + num(x[key]), 0) / arr.length;
    return {
      calories: round(avg(last7, "calorie_intake") - avg(prev7, "calorie_intake")),
      protein:  round(avg(last7, "protein_g")      - avg(prev7, "protein_g")),
      burn:     round(avg(last7, "calories_burned") - avg(prev7, "calories_burned")),
      sleep:    round(avg(last7, "sleep_hours")     - avg(prev7, "sleep_hours")),
    };
  }, [snapshots]);

  /* ── Proportional trend sample ── */
  const trendSample = useMemo(() => {
    if (snapshots.length === 0) return [];
    const step = range.days <= 7 ? 1 : range.days <= 30 ? 3 : range.days <= 90 ? 7 : 14;
    const result: Snapshot[] = [];
    for (let i = 0; i < snapshots.length; i += step) result.push(snapshots[i]);
    if (result[result.length - 1] !== snapshots[snapshots.length - 1]) result.push(snapshots[snapshots.length - 1]);
    return result.slice(-16);
  }, [snapshots, range.days]);

  /* ── Analysis text ── */
  const threshold = (n: number) => Math.max(2, Math.floor(n * 0.5));

  const wentWell = useMemo(() => {
    const items: { text: string; color: string; stat: string; impact: string }[] = [];
    const t = threshold(snapshots.length);
    if (totals.proteinHits >= t)
      items.push({ text: `Protein target hit on ${totals.proteinHits} of ${snapshots.length} days — that's real nutrition discipline.`, color: METRIC_COLORS.protein, stat: `${totals.proteinHits}/${snapshots.length} days`, impact: "Consistent protein is the #1 driver of body composition change." });
    if (totals.avgWorkouts >= 0.5)
      items.push({ text: `${Math.round(totals.workouts)} workout sessions logged — you showed up when it counted.`, color: METRIC_COLORS.burn, stat: `${Math.round(totals.workouts)} sessions`, impact: "Regular movement builds the metabolic baseline everything else relies on." });
    if (totals.avgSleep >= 7)
      items.push({ text: `Sleep averaged ${round(totals.avgSleep)}h — recovery is handled and working in your favour.`, color: METRIC_COLORS.sleep, stat: `${round(totals.avgSleep)}h avg sleep`, impact: "Every hour above 7h accelerates muscle repair and fat metabolism." });
    if (totals.avgWater >= 2.5)
      items.push({ text: `Hydration at ${round(totals.avgWater)}L/day — you're ahead of 80% of people on this one.`, color: METRIC_COLORS.water, stat: `${round(totals.avgWater)}L/day`, impact: "Proper hydration improves performance, focus, and hunger management." });
    if (totals.calorieHits >= t)
      items.push({ text: `Calorie adherence was consistent — hit target on ${totals.calorieHits}/${snapshots.length} days.`, color: METRIC_COLORS.calories, stat: `${totals.calorieHits}/${snapshots.length} days`, impact: "Calorie consistency is what separates sustainable progress from yo-yo results." });
    if (items.length === 0)
      items.push({ text: "Building the habit base. Data is visible and actionable — that alone puts you ahead.", color: "#a3e635", stat: "FOUNDATION", impact: "What gets measured gets managed. You're already doing the hardest part." });
    return items.slice(0, 3);
  }, [totals, snapshots.length]);

  const wentBad = useMemo(() => {
    const items: { text: string; color: string; stat: string; impact: string }[] = [];
    const t = threshold(snapshots.length);
    const lostSleepHrs = totals.daysWithSleep > 1 ? round((7 - totals.avgSleep) * totals.daysWithSleep) : 0;
    if (totals.daysWithSleep > 1 && totals.avgSleep < 7)
      items.push({ text: `Sleep averaged only ${round(totals.avgSleep)}h — that's ${lostSleepHrs > 0 ? lostSleepHrs + "h of missed recovery" : "below the 7h floor"} across this period.`, color: METRIC_COLORS.sleep, stat: `${round(totals.avgSleep)}h avg`, impact: "Poor sleep raises cortisol, suppresses muscle protein synthesis, and increases hunger." });
    if (totals.daysWithWater > 1 && totals.avgWater < 2.5)
      items.push({ text: `Hydration averaged ${round(totals.avgWater)}L/day — even mild dehydration cuts performance by 10–20%.`, color: METRIC_COLORS.water, stat: `${round(totals.avgWater)}L/day avg`, impact: "Dehydration masks hunger as thirst, spikes fatigue, and kills workout quality." });
    if (totals.calorieHits < t && totals.daysWithCal > 1)
      items.push({ text: `Calorie adherence inconsistent — only ${totals.calorieHits}/${totals.daysWithCal} days close to target. Drift is compounding.`, color: METRIC_COLORS.calories, stat: `${totals.calorieHits}/${totals.daysWithCal} days`, impact: "Calorie drift is the #1 reason people don't see results despite 'eating well'." });
    if (totals.burnHits < t && totals.daysWithBurn > 1)
      items.push({ text: `Burn target missed on ${totals.daysWithBurn - totals.burnHits}/${totals.daysWithBurn} days — not enough consistent movement.`, color: METRIC_COLORS.burn, stat: `${totals.burnHits}/${totals.daysWithBurn} days hit`, impact: "Inconsistent activity prevents the metabolic adaptation that makes fat loss easier over time." });
    if (items.length === 0)
      items.push({ text: "No major weak area in this period. Compound the basics.", color: "#94a3b8", stat: "ALL CLEAR", impact: "Maintain the standard. Don't let a good period become a reason to relax." });
    return items.slice(0, 3);
  }, [totals, snapshots.length]);

  const overdid = useMemo(() => {
    const items: { text: string; color: string; stat: string; impact: string }[] = [];
    const highBurnDays    = snapshots.filter(x => num(x.burn_delta) > 250).length;
    const highCalorieDays = snapshots.filter(x => num(x.calorie_delta) > 350).length;
    const highProteinDays = snapshots.filter(x => num(x.protein_delta) > 40).length;
    const lowSleepHighBurn = snapshots.filter(x => num(x.sleep_hours) < 6 && num(x.calories_burned) > 300).length;

    if (highBurnDays > 0)
      items.push({ text: `Burn spiked 250+ kcal above target on ${highBurnDays} day(s). Effort is there — recovery may not be keeping up.`, color: METRIC_COLORS.burn, stat: `${highBurnDays} spike days`, impact: "Overtraining without matching recovery reduces net gains and raises injury risk." });
    if (highCalorieDays > 0)
      items.push({ text: `Calories exceeded target by 350+ kcal on ${highCalorieDays} day(s) — likely undoing a portion of the week's work.`, color: METRIC_COLORS.calories, stat: `${highCalorieDays} spike days`, impact: "One 500 kcal surplus day can offset 2 days of good deficit. Consistency beats perfection." });
    if (highProteinDays > 0)
      items.push({ text: `Protein exceeded target by 40g+ on ${highProteinDays} day(s). Extra protein beyond ~2.2g/kg just converts to calories.`, color: METRIC_COLORS.protein, stat: `${highProteinDays} over days`, impact: "Excess protein past the muscle synthesis ceiling adds calories without added benefit." });
    if (lowSleepHighBurn > 0)
      items.push({ text: `Trained hard on under-6h sleep on ${lowSleepHighBurn} day(s) — this is where overuse injuries and burnout come from.`, color: METRIC_COLORS.sleep, stat: `${lowSleepHighBurn} high-risk days`, impact: "Hard training on poor recovery suppresses hormones and creates net catabolism." });
    if (items.length === 0)
      items.push({ text: "No overdoing pattern detected. Balance is good — effort and recovery are aligned.", color: "#94a3b8", stat: "BALANCED", impact: "This is the hardest thing to get right. You're getting it right." });
    return items.slice(0, 3);
  }, [snapshots]);

  const nextPlan = useMemo(() => {
    const actions: string[] = [];
    const t = threshold(snapshots.length);
    if (totals.daysWithSleep > 1 && totals.avgSleep < 7)   actions.push("Target 7–7.5h sleep consistently before pushing harder on training.");
    if (totals.daysWithWater > 1 && totals.avgWater < 2.5) actions.push("Raise hydration by 0.5–1L daily. Make it the first habit of the day.");
    if (totals.proteinHits < t && totals.daysWithProt > 1) actions.push("Anchor each day with one high-protein meal. Close the protein gap before evening.");
    if (totals.burnHits < t && totals.daysWithBurn > 1)    actions.push("Add 2–3 structured activity blocks per week to improve burn consistency.");
    if (totals.calorieHits < t && totals.daysWithCal > 1)  actions.push("Tighten calorie control on the days that drift. Log earlier in the day.");
    if (actions.length === 0) {
      actions.push("Maintain current structure and focus on repeating the same quality days more often.");
      actions.push("Consistency already working — now compound it. Small improvements across the board.");
    }
    return actions.slice(0, 4);
  }, [totals, snapshots.length]);

  /* ── Fitness DNA ── */
  const fitnessDNA = useMemo(() => {
    const s = disciplineScore;
    const highWorkout = totals.avgWorkouts >= 0.7;
    const poorSleep   = totals.daysWithSleep > 1 && totals.avgSleep < 6.8;
    const poorCal     = totals.daysWithCal > 1 && totals.calorieHits < threshold(snapshots.length);
    const highProt    = totals.daysWithProt > 1 && totals.avgProtein > 130;

    if (s >= 82)                    return { icon: "🏆", title: "The Consistent Builder",    color: "#22c55e", text: "You respond to structure and you execute it. Your results compound because you show up when it's inconvenient. The next level is refining, not reinventing." };
    if (highWorkout && highProt)    return { icon: "💪", title: "The Performance Chaser",    color: "#a3e635", text: "Effort is clearly there. Training and protein are prioritised. The gap is usually sleep or calorie management — fix that and results will jump." };
    if (highWorkout && poorSleep)   return { icon: "⚡", title: "The Recovery Challenger",   color: "#f59e0b", text: "You put in work but may be limiting your own progress. Sleep is where muscle is built and fat is lost. Protect it like a training session." };
    if (poorCal && !poorSleep)      return { icon: "🌊", title: "The Weekend Drifter",       color: "#38bdf8", text: "Weekdays are solid, weekends drift. The patterns are clear. Pre-deciding what you'll eat on drift days is the single fix that changes everything." };
    if (s < 40)                     return { icon: "🌱", title: "The Momentum Starter",      color: "#fb923c", text: "Habits are forming. The next jump comes from stringing consistent days together. You don't need perfect — you need predictable." };
    return                           { icon: "🎯", title: "The Focused Achiever",      color: "#a78bfa", text: "You track, you show up, you're building something. Keep refining the weak spots and this trajectory leads somewhere real." };
  }, [disciplineScore, totals, snapshots.length]);

  /* ── AI-powered insight answers ── */
  async function askArjun(promptKey: string, question: string) {
    if (aiAnswer[promptKey] || aiLoading) return;
    setAiLoading(promptKey);
    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          context: {
            today: {
              calories:       round(totals.avgCalories),
              targetCalories: 0,
              protein:        round(totals.avgProtein),
              burn:           round(totals.avgBurn),
              water:          round(totals.avgWater),
              sleep:          round(totals.avgSleep),
              consistency:    round(totals.consistency),
            },
            last7: {
              averageConsistency: round(totals.consistency),
              averageCalories:    round(totals.avgCalories),
              averageBurn:        round(totals.avgBurn),
              averageSleep:       round(totals.avgSleep),
              averageWater:       round(totals.avgWater),
            },
          },
        }),
      });
      const data = await res.json();
      if (data?.reply) setAiAnswer(prev => ({ ...prev, [promptKey]: data.reply }));
    } catch {}
    finally { setAiLoading(null); }
  }

  /* ── Date range label ── */
  const dateRangeLabel = useMemo(() => {
    if (snapshots.length === 0) return "";
    const first = formatDate(snapshots[0].log_date);
    const last  = formatDate(snapshots[snapshots.length - 1].log_date);
    return `${first} — ${last}`;
  }, [snapshots]);

  /* ─── Render ─────────────────────────────────────── */
  const scoreVal = useCountUp(disciplineScore, 1400);

  return (
    <>
      <style>{`
        .an-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 24px;
        }
        .an-card-inner {
          background: rgba(0,0,0,0.25);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          padding: 16px;
        }
        @keyframes anFadeUp {
          from { opacity:0; transform:translateY(12px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .an-fade { animation: anFadeUp 0.4s ease both; }
        .an-d1 { animation-delay: 0.05s; }
        .an-d2 { animation-delay: 0.1s; }
        .an-d3 { animation-delay: 0.15s; }
        .an-d4 { animation-delay: 0.2s; }
        .an-d5 { animation-delay: 0.25s; }
        .an-d6 { animation-delay: 0.3s; }
        .an-d7 { animation-delay: 0.35s; }

        .momentum-up   { color: #22c55e; }
        .momentum-down { color: #ef4444; }
        .momentum-flat { color: #94a3b8; }

        .ww-up   { color: #22c55e; }
        .ww-down { color: #ef4444; }
      `}</style>

      <div className="space-y-5">

        {/* ── HEADER ── */}
        <div className="an-fade an-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Performance Analysis</h1>
              <p className="text-xs text-white/40 mt-1">Your fitness intelligence report — what worked, what drifted, what to fix</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Range selector */}
              <div className="flex flex-wrap gap-1.5">
                {ranges.map(r => (
                  <button
                    key={r.key} type="button"
                    onClick={() => setRangeKey(r.key)}
                    className={cx(
                      "rounded-xl px-3 py-1.5 text-xs font-bold transition",
                      rangeKey === r.key
                        ? "bg-white/15 text-white border border-white/20"
                        : "bg-white/4 text-white/40 border border-white/8 hover:bg-white/8 hover:text-white/70"
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {dateRangeLabel && (
                <span className="text-[10px] text-white/25 border border-white/8 rounded-lg px-2.5 py-1.5">
                  {dateRangeLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        {msg && <div className="rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">{msg}</div>}

        {/* ── EMPTY STATE ── */}
        {!loading && snapshots.length === 0 && (
          <div className="an-card text-center py-16">
            <div className="text-4xl mb-4">📊</div>
            <div className="text-lg font-bold text-white">No data for this period</div>
            <div className="text-sm text-white/40 mt-2">Start logging food, workouts, and sleep to unlock your analysis</div>
          </div>
        )}

        {/* ── LOADING SKELETON ── */}
        {loading && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
          </div>
        )}

        {!loading && snapshots.length > 0 && (
          <>
            {/* ── TOP STATS ── */}
            <div className="an-fade an-d1 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

              {/* Discipline score — hero card */}
              <div className="an-card sm:col-span-2 lg:col-span-1 flex flex-col items-center text-center relative overflow-hidden">
                <div
                  className="absolute inset-0 opacity-20"
                  style={{
                    background: disciplineScore >= 80
                      ? "radial-gradient(ellipse at top, #22c55e20, transparent)"
                      : disciplineScore >= 55
                      ? "radial-gradient(ellipse at top, #f59e0b20, transparent)"
                      : "radial-gradient(ellipse at top, #ef444420, transparent)"
                  }}
                />
                <div className="relative z-10 w-full">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">Discipline Score</div>
                  <ScoreArc score={disciplineScore} />
                  <div className="mt-3 text-xs text-white/35">
                    {disciplineScore >= 80 ? "Elite consistency 🏆" : disciplineScore >= 60 ? "Building momentum" : "Room to grow"}
                  </div>
                  {momentum && (
                    <div className={cx("mt-1.5 text-[11px] font-semibold",
                      momentum.direction === "improving" ? "momentum-up" :
                      momentum.direction === "declining" ? "momentum-down" : "momentum-flat"
                    )}>
                      {momentum.direction === "improving" ? `↗ +${Math.abs(momentum.delta)} pts improving` :
                       momentum.direction === "declining" ? `↘ ${momentum.delta} pts declining` :
                       "→ Stable"}
                    </div>
                  )}
                </div>
              </div>

              {/* Streak */}
              <StatPill
                label="Current Streak"
                value={streak.current + " days"}
                sub={`Best: ${streak.best} days in period`}
                color="#a3e635"
                icon="🔥"
              />

              {/* Avg burn */}
              <StatPill
                label="Avg Daily Burn"
                value={round(totals.avgBurn) + " kcal"}
                sub={`${Math.round(totals.workouts)} sessions total`}
                color={METRIC_COLORS.burn}
                icon="⚡"
              />

              {/* Avg protein */}
              <StatPill
                label="Avg Protein"
                value={round(totals.avgProtein) + "g"}
                sub={`${totals.proteinHits}/${snapshots.length} days on target`}
                color={METRIC_COLORS.protein}
                icon="💪"
              />
            </div>

            {/* ── METRIC SCORE TILES + DNA ── */}
            <div className="an-fade an-d2 grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">

              {/* Metric score tiles — replaces bar chart */}
              <div className="an-card">
                <SectionHeader title="Metric Report Cards" subtitle="How you graded on each health pillar" badge={`${snapshots.length} days`} />

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
                  {[
                    {
                      label: "Calories", icon: "🔥", color: METRIC_COLORS.calories,
                      hits: totals.calorieHits, total: totals.daysWithCal,
                      avg: round(totals.avgCalories), avgLabel: "kcal/day avg",
                    },
                    {
                      label: "Protein", icon: "💪", color: METRIC_COLORS.protein,
                      hits: totals.proteinHits, total: totals.daysWithProt,
                      avg: round(totals.avgProtein) + "g", avgLabel: "per day avg",
                    },
                    {
                      label: "Burn", icon: "⚡", color: METRIC_COLORS.burn,
                      hits: totals.burnHits, total: totals.daysWithBurn,
                      avg: round(totals.avgBurn), avgLabel: "kcal burned avg",
                    },
                    {
                      label: "Hydration", icon: "💧", color: METRIC_COLORS.water,
                      hits: totals.waterHits, total: totals.daysWithWater,
                      avg: round(totals.avgWater) + "L", avgLabel: "per day avg",
                    },
                    {
                      label: "Sleep", icon: "😴", color: METRIC_COLORS.sleep,
                      hits: totals.sleepHits, total: totals.daysWithSleep,
                      avg: round(totals.avgSleep) + "h", avgLabel: "per night avg",
                    },
                  ].map(m => {
                    const rate = m.total > 0 ? (m.hits / m.total) * 100 : 0;
                    const grade =
                      rate >= 90 ? { letter: "A", label: "Elite",       textColor: "#22c55e" } :
                      rate >= 75 ? { letter: "B", label: "Strong",      textColor: "#a3e635" } :
                      rate >= 55 ? { letter: "C", label: "Decent",      textColor: "#f59e0b" } :
                      rate >= 30 ? { letter: "D", label: "Needs work",  textColor: "#f97316" } :
                                   { letter: "F", label: "Critical gap", textColor: "#ef4444" };
                    const r = 18; const circ = 2 * Math.PI * r;
                    const fill = (rate / 100) * circ;
                    return (
                      <div
                        key={m.label}
                        className="rounded-2xl p-4 relative overflow-hidden flex flex-col gap-3"
                        style={{ background: `${m.color}08`, border: `1px solid ${m.color}20` }}
                      >
                        {/* Glow blob */}
                        <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full blur-2xl opacity-20" style={{ background: m.color }} />

                        {/* Top row: icon + grade letter */}
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-lg leading-none">{m.icon}</span>
                            <div className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: m.color }}>{m.label}</div>
                          </div>
                          {/* Mini arc ring */}
                          <div className="relative flex items-center justify-center" style={{ width: 44, height: 44 }}>
                            <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90">
                              <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                              <circle
                                cx="22" cy="22" r={r} fill="none"
                                stroke={m.color} strokeWidth="4" strokeLinecap="round"
                                strokeDasharray={`${fill} ${circ}`}
                                style={{ transition: "stroke-dasharray 1s cubic-bezier(0.22,1,0.36,1)", filter: `drop-shadow(0 0 4px ${m.color}60)` }}
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-xs font-black" style={{ color: grade.textColor }}>{grade.letter}</span>
                            </div>
                          </div>
                        </div>

                        {/* Hit rate % large */}
                        <div>
                          <div className="text-2xl font-black text-white leading-none">{Math.round(rate)}%</div>
                          <div className="text-[10px] text-white/30 mt-0.5">{m.hits}/{m.total} days · {m.avg} {m.avgLabel}</div>
                        </div>

                        {/* Verdict badge */}
                        <div
                          className="self-start rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: `${grade.textColor}18`, color: grade.textColor }}
                        >
                          {grade.label}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Week over week — kept below tiles */}
                {weekVsWeek && (
                  <div className="mt-5 pt-4 border-t border-white/6">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">Last 7 days vs previous 7</div>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: "Calories", delta: weekVsWeek.calories, suffix: " kcal" },
                        { label: "Protein",  delta: weekVsWeek.protein,  suffix: "g" },
                        { label: "Burn",     delta: weekVsWeek.burn,     suffix: " kcal" },
                        { label: "Sleep",    delta: weekVsWeek.sleep,    suffix: "h" },
                      ].map(m => (
                        <div key={m.label} className="an-card-inner text-center">
                          <div className="text-[9px] text-white/30 uppercase tracking-wider">{m.label}</div>
                          <div className={cx("text-sm font-bold mt-1", m.delta > 0 ? "ww-up" : m.delta < 0 ? "ww-down" : "text-white/40")}>
                            {m.delta > 0 ? "+" : ""}{round(m.delta)}{m.suffix}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Fitness DNA */}
              <div className="an-card flex flex-col">
                <SectionHeader title="Fitness DNA" subtitle="Personality reading from your behaviour" />
                <div
                  className="flex-1 rounded-2xl p-5 flex flex-col relative overflow-hidden"
                  style={{ background: `${fitnessDNA.color}10`, border: `1px solid ${fitnessDNA.color}25` }}
                >
                  <div
                    className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 blur-2xl"
                    style={{ background: fitnessDNA.color }}
                  />
                  <div className="text-3xl mb-3">{fitnessDNA.icon}</div>
                  <div className="text-xl font-black text-white">{fitnessDNA.title}</div>
                  <div className="mt-2 text-sm text-white/55 leading-relaxed flex-1">{fitnessDNA.text}</div>
                  <div className="mt-4 flex items-center gap-2">
                    <div className="h-1 flex-1 rounded-full" style={{ background: `${fitnessDNA.color}30` }}>
                      <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${disciplineScore}%`, background: fitnessDNA.color }} />
                    </div>
                    <span className="text-xs font-bold" style={{ color: fitnessDNA.color }}>{round(disciplineScore)}/100</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── PERSONAL RECORDS ── */}
            {records.length > 0 && (
              <div className="an-fade an-d3 an-card">
                <SectionHeader title="Personal Records" subtitle="Your best moments in this period" />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {records.map(r => (
                    <div key={r.label} className="an-card-inner">
                      <div className="text-xl mb-2">{r.icon}</div>
                      <div className="text-[10px] text-white/30 uppercase tracking-wider">{r.label}</div>
                      <div className="text-xl font-black text-white mt-1">{r.value}</div>
                      <div className="text-[10px] text-white/25 mt-0.5">{r.date}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── INSIGHTS GRID — data-led verdicts ── */}
            <div className="an-fade an-d4 grid gap-5 xl:grid-cols-3">

              {/* Went well */}
              <div className="an-card">
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-400/15 text-sm">✅</div>
                  <div>
                    <div className="text-base font-bold text-white">What went well</div>
                    <div className="text-[10px] text-white/35">Wins worth repeating</div>
                  </div>
                </div>
                <div className="space-y-3">
                  {wentWell.map((item, i) => (
                    <div
                      key={i}
                      className="rounded-xl p-4"
                      style={{ background: `${item.color}08`, border: `1px solid ${item.color}18` }}
                    >
                      {/* Leading number/stat */}
                      <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: item.color }}>
                        {item.stat || "WIN"}
                      </div>
                      <p className="text-sm text-white/75 leading-relaxed">{item.text}</p>
                      {item.impact && (
                        <div className="mt-2 text-[11px] text-white/35 italic">{item.impact}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Needs work */}
              <div className="an-card">
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-400/15 text-sm">⚠️</div>
                  <div>
                    <div className="text-base font-bold text-white">Needs work</div>
                    <div className="text-[10px] text-white/35">Gaps that cost results</div>
                  </div>
                </div>
                <div className="space-y-3">
                  {wentBad.map((item, i) => (
                    <div
                      key={i}
                      className="rounded-xl p-4"
                      style={{ background: `${item.color}08`, border: `1px solid ${item.color}18` }}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: item.color }}>
                        {item.stat || "GAP"}
                      </div>
                      <p className="text-sm text-white/75 leading-relaxed">{item.text}</p>
                      {item.impact && (
                        <div className="mt-2 text-[11px] text-white/35 italic">{item.impact}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Overdoing */}
              <div className="an-card">
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-rose-400/15 text-sm">🔥</div>
                  <div>
                    <div className="text-base font-bold text-white">Watch for overdoing</div>
                    <div className="text-[10px] text-white/35">Sustainability over intensity</div>
                  </div>
                </div>
                <div className="space-y-3">
                  {overdid.map((item, i) => (
                    <div
                      key={i}
                      className="rounded-xl p-4"
                      style={{ background: `${item.color}08`, border: `1px solid ${item.color}18` }}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: item.color }}>
                        {item.stat || "NOTE"}
                      </div>
                      <p className="text-sm text-white/75 leading-relaxed">{item.text}</p>
                      {item.impact && (
                        <div className="mt-2 text-[11px] text-white/35 italic">{item.impact}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── HEAT CALENDAR ── */}
            <div className="an-fade an-d5 an-card">
              <SectionHeader title="Consistency Calendar" subtitle="Daily consistency scores — hover for details" badge={`${snapshots.length} days`} />
              <HeatCalendar snapshots={snapshots} />
            </div>

            {/* ── TREND SPARKLINES ── */}
            <div className="an-fade an-d5 an-card">
              <SectionHeader title="Trend Lines" subtitle="Direction matters more than a single day" />
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Calorie intake", key: "calorie_intake" as keyof Snapshot, color: METRIC_COLORS.calories, suffix: " kcal" },
                  { label: "Protein",        key: "protein_g"      as keyof Snapshot, color: METRIC_COLORS.protein,  suffix: "g" },
                  { label: "Burn",           key: "calories_burned" as keyof Snapshot, color: METRIC_COLORS.burn,   suffix: " kcal" },
                  { label: "Sleep",          key: "sleep_hours"    as keyof Snapshot, color: METRIC_COLORS.sleep,   suffix: "h" },
                ].map(m => {
                  const vals = trendSample.map(s => num(s[m.key]));
                  const avg  = vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
                  const first = vals[0] || 0; const last = vals[vals.length - 1] || 0;
                  const trend = last > first * 1.05 ? "↗" : last < first * 0.95 ? "↘" : "→";
                  return (
                    <div key={m.label}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">{m.label}</span>
                        <span className="text-xs font-bold" style={{ color: m.color }}>{trend} {avg}{m.suffix}</span>
                      </div>
                      <Sparkline data={vals} color={m.color} height={48} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── NEXT PLAN + AI ASK ── */}
            <div className="an-fade an-d6 grid gap-5 xl:grid-cols-2">

              {/* Next period strategy */}
              <div className="an-card">
                <SectionHeader title="Next period strategy" subtitle={`Focus points for the next ${range.label}`} />
                <div className="space-y-2.5">
                  {nextPlan.map((item, i) => (
                    <div key={i} className="an-card-inner flex items-start gap-3">
                      <span className="text-lime-400 font-bold flex-shrink-0 text-sm mt-0.5">→</span>
                      <p className="text-sm text-white/65 leading-relaxed">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ask Arjun — AI powered */}
              <div className="an-card">
                <SectionHeader title="Ask Arjun" subtitle="AI answers based on your actual data" />
                <div className="flex flex-wrap gap-2 mb-4">
                  {[
                    { key: "month",    q: `Based on my ${range.label} analysis — avg ${round(totals.avgCalories)} kcal, ${round(totals.avgProtein)}g protein, ${round(totals.avgSleep)}h sleep, discipline score ${round(disciplineScore)}/100 — what's my best focus for the next month?` },
                    { key: "fat_loss", q: `My current averages: ${round(totals.avgCalories)} kcal/day, ${round(totals.avgProtein)}g protein, ${round(totals.avgBurn)} kcal burned, ${round(totals.avgSleep)}h sleep. How should I approach fat loss from here?` },
                    { key: "sleep",    q: `My sleep has averaged ${round(totals.avgSleep)}h over ${snapshots.length} days. How do I improve recovery and what impact will it have?` },
                    { key: "burn",     q: `I'm averaging ${round(totals.avgBurn)} kcal burned per day with ${totals.burnHits}/${snapshots.length} days hitting my target. What should my activity target be?` },
                    { key: "weak",     q: `My weakest metric over ${snapshots.length} days: calorie hits ${totals.calorieHits}, protein hits ${totals.proteinHits}, sleep hits ${totals.sleepHits}. What's the single most impactful thing to fix?` },
                  ].map(p => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => askArjun(p.key, p.q)}
                      disabled={!!aiLoading}
                      className={cx(
                        "rounded-xl px-3 py-2 text-xs font-semibold transition border",
                        aiAnswer[p.key]
                          ? "border-lime-400/30 bg-lime-400/10 text-lime-400"
                          : "border-white/10 bg-white/4 text-white/50 hover:bg-white/8 hover:text-white/80"
                      )}
                    >
                      {aiLoading === p.key ? "Thinking…" : {
                        month: "Next month plan",
                        fat_loss: "Fat loss approach",
                        sleep: "Improve recovery",
                        burn: "Activity target",
                        weak: "Biggest weakness",
                      }[p.key]}
                    </button>
                  ))}
                </div>

                <div className="an-card-inner min-h-[80px] text-sm text-white/60 leading-relaxed">
                  {Object.entries(aiAnswer).find(([, v]) => v)?.[1] ||
                    (aiLoading ? (
                      <span className="flex items-center gap-2 text-white/40">
                        <span className="inline-block h-3 w-3 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                        Arjun is reading your data…
                      </span>
                    ) : (
                      <span className="text-white/25 italic">Tap a question above — Arjun will answer based on your actual numbers.</span>
                    ))
                  }
                </div>
              </div>
            </div>

            {/* ── BOTTOM STATS ROW ── */}
            <div className="an-fade an-d7 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "Avg Sleep",    value: round(totals.avgSleep) + "h",              sub: `${totals.sleepHits}/${snapshots.length} days hit`,   color: METRIC_COLORS.sleep   },
                { label: "Avg Water",    value: round(totals.avgWater) + "L",              sub: `${totals.waterHits}/${snapshots.length} days hit`,   color: METRIC_COLORS.water   },
                { label: "Avg Steps",    value: Math.round(totals.avgSteps).toLocaleString(), sub: `${Math.round(totals.steps).toLocaleString()} total`, color: METRIC_COLORS.steps   },
                { label: "Calorie Hit%", value: Math.round((totals.calorieHits / Math.max(totals.daysWithCal, 1)) * 100) + "%", sub: `${totals.calorieHits} days`,  color: METRIC_COLORS.calories },
                { label: "Protein Hit%", value: Math.round((totals.proteinHits / Math.max(totals.daysWithProt, 1)) * 100) + "%", sub: `${totals.proteinHits} days`,  color: METRIC_COLORS.protein  },
                { label: "Burn Hit%",    value: Math.round((totals.burnHits    / Math.max(totals.daysWithBurn, 1)) * 100) + "%", sub: `${totals.burnHits} days`,     color: METRIC_COLORS.burn     },
              ].map(s => <StatPill key={s.label} {...s} />)}
            </div>
          </>
        )}

      </div>
    </>
  );
}