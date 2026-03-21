"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

/* ─────────────────────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────────────────────── */
type DayRow = {
  date: string;
  dow: string; // "Mon", "Tue" etc
  steps: number;
  waterL: number;
  sleepHours: number;
  workoutMin: number;
  workoutSessions: number;
  calories: number;
  protein: number;
  burnKcal: number;
  hasAnyData: boolean;
  isIncomplete: boolean; // only true if has SOME data but missing key fields
  meals: MealRow[];
  streakDay: number; // which day of a streak this is (0 = not in streak)
};

type MealRow = {
  food_name: string;
  meal_type: string;
  calories: number;
  protein_g: number;
};

type WeekRow = {
  weekLabel: string;
  dateRange: string;
  steps: number;
  waterL: number;
  sleepHours: number;
  workoutMin: number;
  workoutSessions: number;
  calories: number;
  protein: number;
  burnKcal: number;
  daysLogged: number;
};

type SortKey = "date" | "steps" | "waterL" | "sleepHours" | "workoutMin" | "calories" | "protein" | "burnKcal";
type SortDir = "asc" | "desc";
type ViewMode = "daily" | "weekly";

type Targets = {
  calories: number;
  protein: number;
  water: number; // litres
  sleep: number; // hours
  burn: number;
  steps: number;
};

/* ─────────────────────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────────────────────── */
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function daysAgo(n: number) { return ymd(addDays(new Date(), -n)); }
function cx(...s: (string|false|null|undefined)[]) { return s.filter(Boolean).join(" "); }
function r1(v: number) { return Math.round(v * 10) / 10; }
function r0(v: number) { return Math.round(v); }

function dateListInclusive(start: string, end: string): string[] {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end   + "T00:00:00");
  const out: string[] = [];
  for (let d = s; d <= e; d = addDays(d, 1)) out.push(ymd(d));
  return out;
}

function dowShort(dateIso: string) {
  return new Date(dateIso + "T00:00:00").toLocaleDateString([], { weekday: "short" });
}

function formatDate(dateIso: string) {
  return new Date(dateIso + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" });
}

function isToday(dateIso: string) { return dateIso === ymd(new Date()); }
function isYesterday(dateIso: string) { return dateIso === ymd(addDays(new Date(), -1)); }

function downloadCsv(rows: DayRow[]) {
  const header = ["Date","Day","Calories","Protein(g)","Water(L)","Sleep(h)","Workout(min)","Burn(kcal)","Steps"];
  const lines  = rows.map(r => [r.date, r.dow, r0(r.calories), r1(r.protein), r1(r.waterL), r1(r.sleepHours), r0(r.workoutMin), r0(r.burnKcal), r0(r.steps)].join(","));
  const blob   = new Blob([header.join(",") + "\n" + lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "fwa-history.csv"; a.click();
}

/* ─────────────────────────────────────────────────────────────
   CELL COLOUR — relative to targets
   ───────────────────────────────────────────────────────────── */
function cellColor(value: number, target: number, higherIsBetter = true): string {
  if (value === 0 || target === 0) return "text-white/20";
  const ratio = value / target;
  if (higherIsBetter) {
    if (ratio >= 0.95) return "text-emerald-400";
    if (ratio >= 0.75) return "text-lime-400";
    if (ratio >= 0.5)  return "text-amber-400";
    return "text-rose-400";
  } else {
    // lower is better (e.g. calorie overage)
    if (ratio <= 1.05) return "text-emerald-400";
    if (ratio <= 1.2)  return "text-amber-400";
    return "text-rose-400";
  }
}

function cellBg(value: number, target: number, higherIsBetter = true): string {
  if (value === 0 || target === 0) return "";
  const ratio = value / target;
  if (higherIsBetter) {
    if (ratio >= 0.95) return "bg-emerald-400/5";
    if (ratio >= 0.5)  return "bg-amber-400/5";
    return "bg-rose-400/5";
  }
  if (ratio <= 1.05) return "bg-emerald-400/5";
  if (ratio <= 1.2)  return "bg-amber-400/5";
  return "bg-rose-400/5";
}

/* ─────────────────────────────────────────────────────────────
   PATTERN DETECTION
   ───────────────────────────────────────────────────────────── */
function detectPatterns(rows: DayRow[]): string[] {
  const patterns: string[] = [];
  if (rows.length < 7) return patterns;

  // Best training day of week
  const dowBurn = new Map<string, number[]>();
  for (const r of rows) {
    if (r.burnKcal > 0) {
      if (!dowBurn.has(r.dow)) dowBurn.set(r.dow, []);
      dowBurn.get(r.dow)!.push(r.burnKcal);
    }
  }
  let bestDow = ""; let bestBurnAvg = 0;
  for (const [dow, burns] of dowBurn.entries()) {
    const avg = burns.reduce((a,b)=>a+b,0)/burns.length;
    if (avg > bestBurnAvg) { bestBurnAvg = avg; bestDow = dow; }
  }
  if (bestDow) patterns.push(`${bestDow}s are your strongest training days (avg ${r0(bestBurnAvg)} kcal burned).`);

  // Worst logging day
  const dowLogged = new Map<string, number>();
  const dowTotal  = new Map<string, number>();
  for (const r of rows) {
    dowTotal.set(r.dow, (dowTotal.get(r.dow) || 0) + 1);
    if (r.hasAnyData) dowLogged.set(r.dow, (dowLogged.get(r.dow) || 0) + 1);
  }
  let worstDow = ""; let worstRate = 1;
  for (const [dow, total] of dowTotal.entries()) {
    const rate = (dowLogged.get(dow) || 0) / total;
    if (rate < worstRate && total >= 2) { worstRate = rate; worstDow = dow; }
  }
  if (worstDow && worstRate < 0.6) patterns.push(`${worstDow}s are your worst logging days — data is missing on ${Math.round((1-worstRate)*100)}% of them.`);

  // Sleep deficit pattern
  const lowSleepDays = rows.filter(r => r.sleepHours > 0 && r.sleepHours < 6.5).length;
  if (lowSleepDays >= 3) patterns.push(`${lowSleepDays} days with under 6.5h sleep — chronic deficit is likely hurting recovery.`);

  // Protein consistency
  const proteinDays = rows.filter(r => r.protein > 0);
  if (proteinDays.length >= 5) {
    const avg = proteinDays.reduce((s,r) => s + r.protein, 0) / proteinDays.length;
    const variance = proteinDays.reduce((s,r) => s + Math.abs(r.protein - avg), 0) / proteinDays.length;
    if (variance > 30) patterns.push(`Protein intake is inconsistent — swings of ±${r0(variance)}g/day on average. Consistency matters more than peaks.`);
  }

  // Weekend vs weekday calories
  const weekendRows  = rows.filter(r => ["Sat","Sun"].includes(r.dow) && r.calories > 0);
  const weekdayRows  = rows.filter(r => !["Sat","Sun"].includes(r.dow) && r.calories > 0);
  if (weekendRows.length >= 2 && weekdayRows.length >= 5) {
    const weekendAvg  = weekendRows.reduce((s,r)=>s+r.calories,0)/weekendRows.length;
    const weekdayAvg  = weekdayRows.reduce((s,r)=>s+r.calories,0)/weekdayRows.length;
    if (weekendAvg > weekdayAvg * 1.15) {
      patterns.push(`Weekend calories average ${r0(weekendAvg)} kcal vs ${r0(weekdayAvg)} kcal on weekdays — a classic drift pattern.`);
    }
  }

  return patterns.slice(0, 4);
}

/* ─────────────────────────────────────────────────────────────
   WEEK GROUPING
   ───────────────────────────────────────────────────────────── */
function groupByWeek(rows: DayRow[]): WeekRow[] {
  if (rows.length === 0) return [];
  const weeks: WeekRow[] = [];
  let i = 0;
  const sorted = [...rows].sort((a,b) => a.date.localeCompare(b.date));
  while (i < sorted.length) {
    const chunk = sorted.slice(i, i + 7);
    const logged = chunk.filter(r => r.hasAnyData);
    const n = Math.max(logged.length, 1);
    weeks.push({
      weekLabel: `Week of ${formatDate(chunk[0].date)}`,
      dateRange: `${formatDate(chunk[0].date)} – ${formatDate(chunk[chunk.length-1].date)}`,
      steps:           r0(logged.reduce((s,r)=>s+r.steps,0)/n),
      waterL:          r1(logged.reduce((s,r)=>s+r.waterL,0)/n),
      sleepHours:      r1(logged.reduce((s,r)=>s+r.sleepHours,0)/n),
      workoutMin:      r0(logged.reduce((s,r)=>s+r.workoutMin,0)/n),
      workoutSessions: r0(chunk.reduce((s,r)=>s+r.workoutSessions,0)),
      calories:        r0(logged.reduce((s,r)=>s+r.calories,0)/n),
      protein:         r1(logged.reduce((s,r)=>s+r.protein,0)/n),
      burnKcal:        r0(logged.reduce((s,r)=>s+r.burnKcal,0)/n),
      daysLogged:      logged.length,
    });
    i += 7;
  }
  return weeks.reverse();
}

/* ─────────────────────────────────────────────────────────────
   SORT + FILTER HELPERS
   ───────────────────────────────────────────────────────────── */
function sortRows(rows: DayRow[], key: SortKey, dir: SortDir): DayRow[] {
  return [...rows].sort((a, b) => {
    const av = a[key] as number | string;
    const bv = b[key] as number | string;
    if (typeof av === "string") return dir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
    return dir === "asc" ? (av - (bv as number)) : ((bv as number) - av);
  });
}

/* ─────────────────────────────────────────────────────────────
   SMALL COMPONENTS
   ───────────────────────────────────────────────────────────── */
function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <span className="ml-1 text-white/15">↕</span>;
  return <span className="ml-1 text-lime-400">{sortDir === "asc" ? "↑" : "↓"}</span>;
}

function StatChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-center">
      <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">{label}</div>
      <div className={cx("mt-1.5 text-lg font-black", color || "text-white")}>{value}</div>
    </div>
  );
}

function DeltaBadge({ delta, suffix, higherIsBetter = true }: { delta: number; suffix: string; higherIsBetter?: boolean }) {
  if (Math.abs(delta) < 0.5) return <span className="text-white/25">→ flat</span>;
  const positive = higherIsBetter ? delta > 0 : delta < 0;
  return (
    <span className={positive ? "text-emerald-400" : "text-rose-400"}>
      {delta > 0 ? "↑" : "↓"} {Math.abs(r1(delta))}{suffix}
    </span>
  );
}

function MealTypeIcon({ type }: { type: string }) {
  const t = type?.toLowerCase() || "";
  if (t === "breakfast") return <span className="text-amber-400">🌅</span>;
  if (t === "lunch")     return <span className="text-sky-400">☀️</span>;
  if (t === "dinner")    return <span className="text-violet-400">🌙</span>;
  return <span className="text-rose-400">⚡</span>;
}

/* ─────────────────────────────────────────────────────────────
   MAIN PAGE
   ───────────────────────────────────────────────────────────── */
export default function HistoryPage() {
  const router = useRouter();

  /* ── State ── */
  const [rows,        setRows]        = useState<DayRow[]>([]);
  const [targets,     setTargets]     = useState<Targets>({ calories: 2000, protein: 120, water: 2.5, sleep: 7.5, burn: 350, steps: 8000 });
  const [loading,     setLoading]     = useState(true);
  const [msg,         setMsg]         = useState("");
  const [startDate,   setStartDate]   = useState(daysAgo(29));
  const [endDate,     setEndDate]     = useState(ymd(new Date()));
  const [sortKey,     setSortKey]     = useState<SortKey>("date");
  const [sortDir,     setSortDir]     = useState<SortDir>("desc");
  const [viewMode,    setViewMode]    = useState<ViewMode>("daily");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [prevPeriod,  setPrevPeriod]  = useState<Partial<Record<keyof Targets, number>>>({});
  const [patterns,    setPatterns]    = useState<string[]>([]);
  const userId = useRef<string>("");

  /* ── Quick range buttons ── */
  const quickRanges = [
    { label: "This week",  start: ymd((() => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d; })()), end: ymd(new Date()) },
    { label: "Last week",  start: ymd(addDays(new Date(), -7 - new Date().getDay() + 1)), end: ymd(addDays(new Date(), -new Date().getDay())) },
    { label: "This month", start: ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), end: ymd(new Date()) },
    { label: "Last month", start: ymd(new Date(new Date().getFullYear(), new Date().getMonth()-1, 1)), end: ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 0)) },
    { label: "Last 7d",    start: daysAgo(6), end: ymd(new Date()) },
    { label: "Last 30d",   start: daysAgo(29), end: ymd(new Date()) },
    { label: "Last 90d",   start: daysAgo(89), end: ymd(new Date()) },
  ];

  /* ── Load data ── */
  async function loadData(start: string, end: string) {
    if (!userId.current) return;
    setLoading(true); setMsg(""); setExpandedRow(null);

    // Clamp to max 365 days
    const startD = new Date(start + "T00:00:00");
    const endD   = new Date(end   + "T00:00:00");
    const dayCount = Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1;
    if (dayCount > 365) { setMsg("Range capped at 365 days for performance."); start = ymd(addDays(endD, -364)); setStartDate(start); }

    // Previous period for comparison
    const prevEnd   = ymd(addDays(startD, -1));
    const prevStart = ymd(addDays(startD, -dayCount));

    try {
      const uid = userId.current;
      const [mealsRes, workoutsRes, sleepRes, waterRes, profileRes,
             prevMealsRes, prevWorkoutsRes, prevSleepRes] = await Promise.all([
        supabase.from("meals").select("log_date, calories, protein_g, food_name, meal_type")
          .eq("user_id", uid).gte("log_date", start).lte("log_date", end),
        supabase.from("workout_logs").select("log_date, duration_min, calories_burned, steps")
          .eq("user_id", uid).gte("log_date", start).lte("log_date", end),
        supabase.from("sleep_logs").select("log_date, hours")
          .eq("user_id", uid).gte("log_date", start).lte("log_date", end),
        supabase.from("water_logs").select("log_date, ml")
          .eq("user_id", uid).gte("log_date", start).lte("log_date", end),
        supabase.from("profiles").select("*").eq("user_id", uid).maybeSingle(),
        // Previous period — just calories, protein, sleep for comparison
        supabase.from("meals").select("log_date, calories, protein_g")
          .eq("user_id", uid).gte("log_date", prevStart).lte("log_date", prevEnd),
        supabase.from("workout_logs").select("log_date, calories_burned")
          .eq("user_id", uid).gte("log_date", prevStart).lte("log_date", prevEnd),
        supabase.from("sleep_logs").select("log_date, hours")
          .eq("user_id", uid).gte("log_date", prevStart).lte("log_date", prevEnd),
      ]);

      for (const r of [mealsRes, workoutsRes, sleepRes, waterRes]) {
        if (r.error) throw new Error(r.error.message);
      }

      // Derive targets from profile
      const p = (profileRes.data as any) || {};
      const wkg   = Number(p.weight_kg || 70);
      const goal  = String(p.goal_type || p.goal || "").toLowerCase();
      const isFat = goal.includes("fat"); const isMuscle = goal.includes("muscle");
      const derivedTargets: Targets = {
        calories: Number(p.target_calories || p.daily_calorie_intake || 0) || (isFat ? 1700 : isMuscle ? 2500 : 2000),
        protein:  Number(p.target_protein_g || 0) || Math.round(wkg * 1.6),
        water:    2.5,
        sleep:    7.5,
        burn:     Number(p.target_burn || 0) || (isFat ? 450 : isMuscle ? 250 : 350),
        steps:    8000,
      };
      setTargets(derivedTargets);

      // Build date maps
      const mealsByDate    = new Map<string, MealRow[]>();
      const calByDate      = new Map<string, number>();
      const protByDate     = new Map<string, number>();
      const workoutMinDate = new Map<string, number>();
      const workoutSesDate = new Map<string, number>();
      const burnByDate     = new Map<string, number>();
      const stepsByDate    = new Map<string, number>();
      const sleepByDate    = new Map<string, number>();
      const waterByDate    = new Map<string, number>();

      for (const m of mealsRes.data || []) {
        calByDate.set(m.log_date,  (calByDate.get(m.log_date)  || 0) + Number(m.calories   || 0));
        protByDate.set(m.log_date, (protByDate.get(m.log_date) || 0) + Number(m.protein_g  || 0));
        if (!mealsByDate.has(m.log_date)) mealsByDate.set(m.log_date, []);
        mealsByDate.get(m.log_date)!.push({ food_name: m.food_name, meal_type: m.meal_type, calories: Number(m.calories||0), protein_g: Number(m.protein_g||0) });
      }
      for (const w of workoutsRes.data || []) {
        const min = Number(w.duration_min || 0);
        workoutMinDate.set(w.log_date, (workoutMinDate.get(w.log_date) || 0) + min);
        workoutSesDate.set(w.log_date, (workoutSesDate.get(w.log_date) || 0) + 1);
        burnByDate.set(w.log_date,  (burnByDate.get(w.log_date)  || 0) + Number(w.calories_burned || 0));
        stepsByDate.set(w.log_date, (stepsByDate.get(w.log_date) || 0) + Number(w.steps || 0));
      }
      for (const s of sleepRes.data  || []) sleepByDate.set(s.log_date, Number(s.hours || 0));
      for (const w of waterRes.data  || []) waterByDate.set(w.log_date, (waterByDate.get(w.log_date)||0) + Number(w.ml || 0));

      // Build rows — only up to today (no future days)
      const todayStr = ymd(new Date());
      const dates = dateListInclusive(start, end).filter(d => d <= todayStr);

      // Compute streaks
      const orderedDates = [...dates].sort();
      const streakMap = new Map<string, number>();
      let streak = 0;
      for (const d of orderedDates) {
        const cal   = calByDate.get(d)   || 0;
        const sleep = sleepByDate.get(d) || 0;
        if (cal > 0 || sleep > 0) { streak++; streakMap.set(d, streak); }
        else { streak = 0; streakMap.set(d, 0); }
      }

      const built: DayRow[] = dates.map(date => {
        const cal      = r0(calByDate.get(date)      || 0);
        const prot     = r1(protByDate.get(date)     || 0);
        const sleep    = r1(sleepByDate.get(date)    || 0);
        const waterMl  = waterByDate.get(date)       || 0;
        const waterL   = r1(waterMl / 1000);
        const burnKcal = r0(burnByDate.get(date)     || 0);
        const steps    = r0(stepsByDate.get(date)    || 0);
        const wMin     = r0(workoutMinDate.get(date) || 0);
        const wSes     = workoutSesDate.get(date)    || 0;
        const meals    = mealsByDate.get(date)       || [];

        const hasAnyData = cal > 0 || sleep > 0 || waterL > 0 || burnKcal > 0;
        // incomplete = has SOME data but missing calories or sleep (the two mandatory tracking fields)
        const isIncomplete = hasAnyData && (cal === 0 || sleep === 0);

        return { date, dow: dowShort(date), steps, waterL, sleepHours: sleep, workoutMin: wMin, workoutSessions: wSes, calories: cal, protein: prot, burnKcal, hasAnyData, isIncomplete, meals, streakDay: streakMap.get(date) || 0 };
      });

      setRows(built);
      setPatterns(detectPatterns(built));

      // Previous period averages
      const prevDayCount = Math.max(prevMealsRes.data?.length || 0, 1);
      const prevCalAvg   = (prevMealsRes.data || []).reduce((s:number,m:any) => s + Number(m.calories||0), 0) / prevDayCount;
      const prevProtAvg  = (prevMealsRes.data || []).reduce((s:number,m:any) => s + Number(m.protein_g||0), 0) / prevDayCount;
      const prevBurnAvg  = (prevWorkoutsRes.data || []).reduce((s:number,w:any) => s + Number(w.calories_burned||0), 0) / Math.max(prevWorkoutsRes.data?.length||1,1);
      const prevSleepAvg = (prevSleepRes.data || []).reduce((s:number,s2:any) => s + Number(s2.hours||0), 0) / Math.max(prevSleepRes.data?.length||1,1);
      setPrevPeriod({ calories: prevCalAvg, protein: prevProtAvg, burn: prevBurnAvg, sleep: prevSleepAvg });

    } catch (e: any) {
      setMsg(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  /* ── Auth + initial load ── */
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.push("/login"); return; }
      userId.current = data.user.id;
      await loadData(startDate, endDate);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Derived data ── */
  const loggedRows = useMemo(() => rows.filter(r => r.hasAnyData), [rows]);

  const totals = useMemo(() => {
    const n = Math.max(loggedRows.length, 1);
    return {
      avgCalories:  r0(loggedRows.reduce((s,r)=>s+r.calories,0)    / n),
      avgProtein:   r1(loggedRows.reduce((s,r)=>s+r.protein,0)     / n),
      avgWater:     r1(loggedRows.reduce((s,r)=>s+r.waterL,0)      / n),
      avgSleep:     r1(loggedRows.reduce((s,r)=>s+r.sleepHours,0)  / n),
      avgBurn:      r0(loggedRows.reduce((s,r)=>s+r.burnKcal,0)    / n),
      avgSteps:     r0(loggedRows.reduce((s,r)=>s+r.steps,0)       / n),
      totalWorkouts: rows.reduce((s,r)=>s+r.workoutSessions,0),
      totalSteps:    rows.reduce((s,r)=>s+r.steps,0),
      daysLogged:   loggedRows.length,
      totalDays:    rows.length,
    };
  }, [loggedRows, rows]);

  const personalBests = useMemo(() => {
    if (loggedRows.length === 0) return null;
    const bestSleep    = loggedRows.reduce((a,b) => a.sleepHours > b.sleepHours ? a : b);
    const bestProtein  = loggedRows.reduce((a,b) => a.protein    > b.protein    ? a : b);
    const bestBurn     = loggedRows.reduce((a,b) => a.burnKcal   > b.burnKcal   ? a : b);
    const bestSteps    = loggedRows.reduce((a,b) => a.steps      > b.steps      ? a : b);
    return { bestSleep, bestProtein, bestBurn, bestSteps };
  }, [loggedRows]);

  const weekRows = useMemo(() => groupByWeek(rows), [rows]);

  const displayRows = useMemo(() => {
    let r = onlyIncomplete ? rows.filter(x => x.isIncomplete) : rows;
    return sortRows(r, sortKey, sortDir);
  }, [rows, onlyIncomplete, sortKey, sortDir]);

  const incompleteCnt = useMemo(() => rows.filter(r => r.isIncomplete).length, [rows]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function applyRange(start: string, end: string) {
    setStartDate(start); setEndDate(end);
    loadData(start, end);
  }

  /* ─────────────────────────────────────────────────────────────
     RENDER
     ───────────────────────────────────────────────────────────── */
  return (
    <>
      <style>{`
        .hist-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; }
        .hist-inner { background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; }
        .hist-th { padding: 10px 14px; text-align: right; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: rgba(255,255,255,.35); cursor: pointer; user-select: none; white-space: nowrap; }
        .hist-th:hover { color: rgba(255,255,255,.7); }
        .hist-th:first-child { text-align: left; }
        .hist-td { padding: 10px 14px; text-align: right; font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .hist-td:first-child { text-align: left; }
        .hist-tr-today { background: rgba(163,230,53,0.04); }
        .hist-tr-best  { background: rgba(34,197,94,0.04); }
        .hist-tr-empty { opacity: 0.4; }
        @keyframes hFadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .h-fade { animation: hFadeUp 0.35s ease both; }
        .h-d1 { animation-delay: 0.05s; }
        .h-d2 { animation-delay: 0.10s; }
        .h-d3 { animation-delay: 0.15s; }
        .h-d4 { animation-delay: 0.20s; }
        .expand-row { background: rgba(0,0,0,0.4); border-top: 1px solid rgba(255,255,255,0.06); }
      `}</style>

      <div className="space-y-4">

        {/* ── HEADER ── */}
        <div className="h-fade hist-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">Activity Log</h1>
              <p className="text-xs text-white/40 mt-1">Day-by-day history — every metric, every day, in one place</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => downloadCsv(displayRows)}
                className="rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-xs font-semibold text-white/50 hover:bg-white/8 hover:text-white/80 transition"
              >
                ↓ Export CSV
              </button>
              <button
                onClick={() => setViewMode(v => v === "daily" ? "weekly" : "daily")}
                className={cx("rounded-xl border px-3 py-2 text-xs font-semibold transition",
                  viewMode === "weekly"
                    ? "border-lime-400/30 bg-lime-400/10 text-lime-400"
                    : "border-white/10 bg-white/4 text-white/50 hover:bg-white/8 hover:text-white/80"
                )}
              >
                {viewMode === "daily" ? "Group by week" : "Daily view"}
              </button>
            </div>
          </div>
        </div>

        {/* ── CONTROLS ── */}
        <div className="h-fade h-d1 hist-card p-5">
          {/* Quick range buttons */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {quickRanges.map(r => (
              <button
                key={r.label}
                onClick={() => applyRange(r.start, r.end)}
                className={cx(
                  "rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
                  startDate === r.start && endDate === r.end
                    ? "border-lime-400/30 bg-lime-400/10 text-lime-400"
                    : "border-white/8 bg-white/3 text-white/40 hover:bg-white/8 hover:text-white/70"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Custom date range */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-white/30">From</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="mt-1 block rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-white/30">To</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="mt-1 block rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
            </div>
            <button
              onClick={() => applyRange(startDate, endDate)}
              disabled={loading || startDate > endDate}
              className="rounded-xl bg-lime-400/15 border border-lime-400/25 px-4 py-2 text-sm font-bold text-lime-400 hover:bg-lime-400/25 transition disabled:opacity-40"
            >
              {loading ? "Loading…" : "Apply"}
            </button>

            {/* Incomplete filter */}
            <button
              onClick={() => setOnlyIncomplete(v => !v)}
              className={cx("rounded-xl border px-3 py-2 text-xs font-semibold transition flex items-center gap-2",
                onlyIncomplete
                  ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                  : "border-white/10 bg-white/4 text-white/40 hover:text-white/70"
              )}
            >
              <span className={cx("h-1.5 w-1.5 rounded-full", onlyIncomplete ? "bg-amber-400" : "bg-white/30")} />
              Incomplete only
              {incompleteCnt > 0 && <span className="rounded-full bg-amber-400/20 px-1.5 text-[10px] text-amber-300">{incompleteCnt}</span>}
            </button>
          </div>
          {startDate > endDate && <p className="text-xs text-rose-400 mt-2">Start date must be before end date</p>}
          {msg && <p className="text-xs text-rose-300 mt-2">{msg}</p>}
        </div>

        {/* ── SUMMARY STATS ── */}
        {!loading && loggedRows.length > 0 && (
          <div className="h-fade h-d2">
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              <StatChip label="Days logged"  value={`${totals.daysLogged}/${totals.totalDays}`} color="text-white" />
              <StatChip label="Avg calories" value={`${totals.avgCalories} kcal`}
                color={cellColor(totals.avgCalories, targets.calories, false)} />
              <StatChip label="Avg protein"  value={`${totals.avgProtein}g`}
                color={cellColor(totals.avgProtein, targets.protein)} />
              <StatChip label="Avg sleep"    value={`${totals.avgSleep}h`}
                color={cellColor(totals.avgSleep, targets.sleep)} />
              <StatChip label="Avg burn"     value={`${totals.avgBurn} kcal`}
                color={cellColor(totals.avgBurn, targets.burn)} />
              <StatChip label="Total workouts" value={`${totals.totalWorkouts}`} color="text-white" />
            </div>

            {/* Period comparison */}
            {Object.keys(prevPeriod).length > 0 && (
              <div className="mt-3 hist-card p-4 flex flex-wrap gap-4">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/25 self-center">vs prev period</span>
                {prevPeriod.calories && <span className="text-xs"><span className="text-white/40">Calories </span><DeltaBadge delta={totals.avgCalories - prevPeriod.calories} suffix=" kcal" higherIsBetter={false} /></span>}
                {prevPeriod.protein  && <span className="text-xs"><span className="text-white/40">Protein </span><DeltaBadge delta={totals.avgProtein - prevPeriod.protein} suffix="g" /></span>}
                {prevPeriod.burn     && <span className="text-xs"><span className="text-white/40">Burn </span><DeltaBadge delta={totals.avgBurn - prevPeriod.burn} suffix=" kcal" /></span>}
                {prevPeriod.sleep    && <span className="text-xs"><span className="text-white/40">Sleep </span><DeltaBadge delta={totals.avgSleep - prevPeriod.sleep} suffix="h" /></span>}
              </div>
            )}
          </div>
        )}

        {/* ── PERSONAL BESTS ── */}
        {!loading && personalBests && (
          <div className="h-fade h-d2 hist-card p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">🏆 Personal bests this period</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Best sleep",   value: personalBests.bestSleep.sleepHours   + "h",        date: personalBests.bestSleep.date,   color: "#818cf8" },
                { label: "Peak protein", value: personalBests.bestProtein.protein    + "g",        date: personalBests.bestProtein.date, color: "#a78bfa" },
                { label: "Peak burn",    value: personalBests.bestBurn.burnKcal      + " kcal",    date: personalBests.bestBurn.date,    color: "#34d399" },
                { label: "Most steps",   value: r0(personalBests.bestSteps.steps).toLocaleString(), date: personalBests.bestSteps.date,  color: "#fb923c" },
              ].filter(b => b.value !== "0" && b.value !== "0 kcal" && b.value !== "0h" && b.value !== "0g").map(b => (
                <div key={b.label} className="hist-inner px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-wider">{b.label}</div>
                    <div className="text-base font-black mt-0.5" style={{ color: b.color }}>{b.value}</div>
                  </div>
                  <div className="text-[10px] text-white/25 text-right">
                    {formatDate(b.date)}<br/>{dowShort(b.date)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PATTERN DETECTION ── */}
        {!loading && patterns.length > 0 && (
          <div className="h-fade h-d3 hist-card p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">🧩 Patterns detected</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {patterns.map((p, i) => (
                <div key={i} className="hist-inner px-4 py-3 text-sm text-white/60 leading-relaxed">{p}</div>
              ))}
            </div>
          </div>
        )}

        {/* ── COLOUR LEGEND ── */}
        {!loading && loggedRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 px-1">
            <span className="text-[10px] text-white/25 uppercase tracking-wider">Cell colour</span>
            {[["text-emerald-400","≥95% of target"],["text-lime-400","75–95%"],["text-amber-400","50–75%"],["text-rose-400","<50%"]].map(([c,l]) => (
              <span key={l} className="flex items-center gap-1.5">
                <span className={cx("h-2 w-2 rounded-full", c === "text-emerald-400" ? "bg-emerald-400" : c === "text-lime-400" ? "bg-lime-400" : c === "text-amber-400" ? "bg-amber-400" : "bg-rose-400")} />
                <span className="text-[10px] text-white/30">{l}</span>
              </span>
            ))}
          </div>
        )}

        {/* ── WEEKLY VIEW ── */}
        {!loading && viewMode === "weekly" && weekRows.length > 0 && (
          <div className="h-fade h-d4 hist-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead className="bg-black/40">
                  <tr>
                    <th className="hist-th text-left">Week</th>
                    <th className="hist-th">Days logged</th>
                    <th className="hist-th">Avg calories</th>
                    <th className="hist-th">Avg protein</th>
                    <th className="hist-th">Avg sleep</th>
                    <th className="hist-th">Avg burn</th>
                    <th className="hist-th">Sessions</th>
                    <th className="hist-th">Avg water</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {weekRows.map(w => (
                    <tr key={w.weekLabel} className="hover:bg-white/[0.03] transition-colors">
                      <td className="hist-td">
                        <div className="text-sm font-semibold text-white">{w.weekLabel}</div>
                        <div className="text-[10px] text-white/30">{w.dateRange}</div>
                      </td>
                      <td className="hist-td text-white/50">{w.daysLogged}/7</td>
                      <td className={cx("hist-td font-semibold", cellColor(w.calories, targets.calories, false))}>{w.calories}</td>
                      <td className={cx("hist-td font-semibold", cellColor(w.protein, targets.protein))}>{w.protein}g</td>
                      <td className={cx("hist-td font-semibold", cellColor(w.sleepHours, targets.sleep))}>{w.sleepHours}h</td>
                      <td className={cx("hist-td font-semibold", cellColor(w.burnKcal, targets.burn))}>{w.burnKcal}</td>
                      <td className="hist-td text-white/60">{w.workoutSessions}</td>
                      <td className={cx("hist-td font-semibold", cellColor(w.waterL, targets.water))}>{w.waterL}L</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── DAILY TABLE ── */}
        {!loading && viewMode === "daily" && (
          <div className="h-fade h-d4 hist-card overflow-hidden">
            {displayRows.length === 0 ? (
              <div className="py-16 text-center">
                <div className="text-3xl mb-3">📭</div>
                <div className="text-sm text-white/40">{onlyIncomplete ? "No incomplete days in this range." : "No data in this range yet. Start logging!"}</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px]">
                  <thead className="bg-black/40 sticky top-0 z-10">
                    <tr>
                      <th className="hist-th text-left" onClick={() => handleSort("date")}>
                        Date <SortIcon col="date" sortKey={sortKey} sortDir={sortDir} />
                      </th>
                      <th className="hist-th" onClick={() => handleSort("calories")}>
                        Calories <SortIcon col="calories" sortKey={sortKey} sortDir={sortDir} />
                      </th>
                      <th className="hist-th" onClick={() => handleSort("protein")}>
                        Protein <SortIcon col="protein" sortKey={sortKey} sortDir={sortDir} />
                      </th>
                      <th className="hist-th" onClick={() => handleSort("sleepHours")}>
                        Sleep <SortIcon col="sleepHours" sortKey={sortKey} sortDir={sortDir} />
                      </th>
                      <th className="hist-th" onClick={() => handleSort("waterL")}>
                        Water <SortIcon col="waterL" sortKey={sortKey} sortDir={sortDir} />
                      </th>
                      <th className="hist-th" onClick={() => handleSort("burnKcal")}>
                        Burn <SortIcon col="burnKcal" sortKey={sortKey} sortDir={sortDir} />
                      </th>
                      <th className="hist-th" onClick={() => handleSort("workoutMin")}>
                        Workout <SortIcon col="workoutMin" sortKey={sortKey} sortDir={sortDir} />
                      </th>
                      <th className="hist-th" onClick={() => handleSort("steps")}>
                        Steps <SortIcon col="steps" sortKey={sortKey} sortDir={sortDir} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map(r => {
                      const today   = isToday(r.date);
                      const isExpanded = expandedRow === r.date;
                      const isBestDay = personalBests && (
                        r.date === personalBests.bestSleep.date ||
                        r.date === personalBests.bestProtein.date ||
                        r.date === personalBests.bestBurn.date
                      );

                      return [
                        <tr
                          key={r.date}
                          onClick={() => r.hasAnyData && setExpandedRow(isExpanded ? null : r.date)}
                          className={cx(
                            "transition-colors border-t border-white/[0.05]",
                            today      ? "hist-tr-today" : "",
                            isBestDay  ? "hist-tr-best"  : "",
                            !r.hasAnyData ? "hist-tr-empty" : "cursor-pointer hover:bg-white/[0.03]",
                          )}
                        >
                          {/* Date cell */}
                          <td className="hist-td">
                            <div className="flex items-center gap-2">
                              <span className="text-white/25 text-[10px] w-7 flex-shrink-0">{r.dow}</span>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className={cx("text-sm font-semibold", today ? "text-lime-400" : "text-white/80")}>
                                    {today ? "Today" : isYesterday(r.date) ? "Yesterday" : formatDate(r.date)}
                                  </span>
                                  {today && <span className="text-[9px] text-lime-400/60 border border-lime-400/20 rounded-full px-1.5 py-0.5">NOW</span>}
                                  {r.isIncomplete && <span className="text-[9px] text-amber-400/80 border border-amber-400/20 rounded-full px-1.5 py-0.5">partial</span>}
                                  {isBestDay && <span className="text-[9px] text-emerald-400/80">🏆</span>}
                                </div>
                                <div className="text-[10px] text-white/25">{r.date}</div>
                              </div>
                              {r.streakDay >= 3 && (
                                <span className="text-[10px] text-orange-400/70 flex-shrink-0">🔥{r.streakDay}</span>
                              )}
                            </div>
                          </td>

                          {/* Calories */}
                          <td className={cx("hist-td font-semibold", r.calories > 0 ? cellColor(r.calories, targets.calories, false) : "text-white/15")}>
                            {r.calories > 0 ? r.calories : "—"}
                          </td>

                          {/* Protein */}
                          <td className={cx("hist-td font-semibold", r.protein > 0 ? cellColor(r.protein, targets.protein) : "text-white/15")}>
                            {r.protein > 0 ? r.protein + "g" : "—"}
                          </td>

                          {/* Sleep */}
                          <td className={cx("hist-td font-semibold", r.sleepHours > 0 ? cellColor(r.sleepHours, targets.sleep) : "text-white/15")}>
                            {r.sleepHours > 0 ? r.sleepHours + "h" : "—"}
                          </td>

                          {/* Water */}
                          <td className={cx("hist-td font-semibold", r.waterL > 0 ? cellColor(r.waterL, targets.water) : "text-white/15")}>
                            {r.waterL > 0 ? r.waterL + "L" : "—"}
                          </td>

                          {/* Burn */}
                          <td className={cx("hist-td font-semibold", r.burnKcal > 0 ? cellColor(r.burnKcal, targets.burn) : "text-white/15")}>
                            {r.burnKcal > 0 ? r.burnKcal : "—"}
                          </td>

                          {/* Workout */}
                          <td className="hist-td text-white/50">
                            {r.workoutSessions > 0
                              ? <span>{r.workoutMin > 0 ? r.workoutMin + "min" : ""}{r.workoutSessions > 0 ? <span className="text-white/30 text-[10px] ml-1">×{r.workoutSessions}</span> : ""}</span>
                              : <span className="text-white/15">—</span>}
                          </td>

                          {/* Steps */}
                          <td className={cx("hist-td font-semibold", r.steps > 0 ? cellColor(r.steps, targets.steps) : "text-white/15")}>
                            {r.steps > 0 ? r0(r.steps).toLocaleString() : "—"}
                          </td>
                        </tr>,

                        /* ── Expanded meal detail ── */
                        isExpanded && r.meals.length > 0 && (
                          <tr key={r.date + "-expand"} className="expand-row">
                            <td colSpan={8} className="px-4 py-4">
                              <div className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3">Meals logged on {formatDate(r.date)}</div>
                              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {r.meals.map((m, i) => (
                                  <div key={i} className="hist-inner px-3 py-2.5 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <MealTypeIcon type={m.meal_type} />
                                      <span className="text-sm text-white/75 truncate">{m.food_name || "Food"}</span>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                      <div className="text-xs font-bold text-white/70">{r0(m.calories)} kcal</div>
                                      <div className="text-[10px] text-white/30">{r1(m.protein_g)}g P</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ),
                      ];
                    })}

                    {/* ── TOTALS/AVERAGES FOOTER ROW ── */}
                    {loggedRows.length > 0 && (
                      <tr className="bg-white/[0.03] border-t-2 border-white/10">
                        <td className="hist-td">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">Averages</div>
                          <div className="text-[10px] text-white/25">{totals.daysLogged} logged days</div>
                        </td>
                        <td className={cx("hist-td font-bold", cellColor(totals.avgCalories, targets.calories, false))}>{totals.avgCalories}</td>
                        <td className={cx("hist-td font-bold", cellColor(totals.avgProtein, targets.protein))}>{totals.avgProtein}g</td>
                        <td className={cx("hist-td font-bold", cellColor(totals.avgSleep, targets.sleep))}>{totals.avgSleep}h</td>
                        <td className={cx("hist-td font-bold", cellColor(totals.avgWater, targets.water))}>{totals.avgWater}L</td>
                        <td className={cx("hist-td font-bold", cellColor(totals.avgBurn, targets.burn))}>{totals.avgBurn}</td>
                        <td className="hist-td text-white/40">{totals.totalWorkouts} total</td>
                        <td className={cx("hist-td font-bold", cellColor(totals.avgSteps, targets.steps))}>{r0(totals.avgSteps).toLocaleString()}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="hist-card py-20 text-center">
            <div className="inline-block h-6 w-6 rounded-full border-2 border-white/10 border-t-lime-400 animate-spin mb-3" />
            <div className="text-sm text-white/40">Loading your history…</div>
          </div>
        )}

      </div>
    </>
  );
}