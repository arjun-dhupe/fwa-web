"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ReferenceLine,
} from "recharts";

type Goals = {
  steps_target: number;
  water_ml_target: number;
  sleep_hours_target: number;
  workouts_per_week_target: number;
  calories_target: number;
  goal_type: string;
};

type Point = {
  isoDate: string;
  date: string;
  weekday: string;
  steps: number;
  waterMl: number;
  sleepHours: number;
  workoutMin: number;
  calories: number;
  onSteps: number;
  onWater: number;
  onSleep: number;
  onWorkout: number;
  score: number;
};

type MetricKey = "steps" | "waterMl" | "sleepHours" | "workoutMin" | "calories" | "score";

const PIE_COLORS = ["#22c55e", "#60a5fa", "#a78bfa", "#f59e0b"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function yyyyMmDd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dateListInclusive(start: string, end: string) {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const out: string[] = [];
  for (let d = s; d <= e; d = addDays(d, 1)) out.push(yyyyMmDd(d));
  return out;
}

function shortDate(iso: string) {
  return iso.slice(5).replace("-", "/");
}

function weekdayShort(isoDate: string) {
  return new Date(isoDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" });
}

function weekStartMondayISO(isoDate: string) {
  const d = new Date(isoDate + "T00:00:00");
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return yyyyMmDd(d);
}

function dayIndexInWeek(isoDate: string) {
  const d = new Date(isoDate + "T00:00:00");
  const day = (d.getDay() + 6) % 7;
  return day + 1;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function prettyMetric(metric: MetricKey) {
  if (metric === "waterMl") return "Water";
  if (metric === "sleepHours") return "Sleep";
  if (metric === "workoutMin") return "Workout Minutes";
  if (metric === "calories") return "Calories";
  if (metric === "score") return "Performance Score";
  return "Steps";
}

function metricSuffix(metric: MetricKey) {
  if (metric === "waterMl") return " ml";
  if (metric === "sleepHours") return " h";
  if (metric === "workoutMin") return " min";
  if (metric === "calories") return " kcal";
  if (metric === "score") return "/4";
  return "";
}

function getMetricValue(point: Point, metric: MetricKey) {
  return point[metric];
}

function formatCompact(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return `${Math.round(value * 10) / 10}`;
}


function pearsonCorrelation(x: number[], y: number[]) {
  if (x.length !== y.length || x.length < 2) return 0;

  const meanX = average(x);
  const meanY = average(y);

  let numerator = 0;
  let sumSqX = 0;
  let sumSqY = 0;

  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    sumSqX += dx * dx;
    sumSqY += dy * dy;
  }

  const denominator = Math.sqrt(sumSqX * sumSqY);
  if (!denominator) return 0;
  return numerator / denominator;
}

function describeCorrelation(value: number) {
  const abs = Math.abs(value);
  if (abs >= 0.7) return value > 0 ? "Strong positive relationship" : "Strong inverse relationship";
  if (abs >= 0.4) return value > 0 ? "Moderate positive relationship" : "Moderate inverse relationship";
  if (abs >= 0.2) return value > 0 ? "Light positive relationship" : "Light inverse relationship";
  return "Weak or no clear relationship";
}

function computeStreak(pointsChrono: Point[]) {
  let current = 0;
  let best = 0;
  let running = 0;

  for (let i = 0; i < pointsChrono.length; i++) {
    const ok = pointsChrono[i].score >= 3;
    if (ok) {
      running += 1;
      best = Math.max(best, running);
    } else {
      running = 0;
    }
  }

  for (let i = pointsChrono.length - 1; i >= 0; i--) {
    if (pointsChrono[i].score >= 3) current += 1;
    else break;
  }

  return { current, best };
}

function ChartCard({
  title,
  subtitle,
  action,
  children,
  heightClass = "h-[300px]",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  heightClass?: string;
}) {
  return (
    <div className="glass glow-ring hover-lift rounded-3xl p-5 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-white/90">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-white/55">{subtitle}</div> : null}
        </div>
        {action}
      </div>
      <div className="mt-4 min-w-0">
        <div className={`${heightClass} w-full min-w-0`}>{children}</div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "default" | "good" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "from-emerald-500/15 to-emerald-300/5 border-emerald-300/20"
      : tone === "warn"
      ? "from-amber-500/15 to-amber-300/5 border-amber-300/20"
      : "from-white/10 to-white/5 border-white/10";

  return (
    <div className={`rounded-3xl border bg-gradient-to-b ${toneClass} p-5`}>
      <div className="text-xs uppercase tracking-[0.22em] text-white/45">{label}</div>
      <div className="mt-3 text-3xl font-bold text-white">{value}</div>
      {sub ? <div className="mt-2 text-sm text-white/55">{sub}</div> : null}
    </div>
  );
}

function InsightCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm leading-6 text-white/65">{body}</div>
    </div>
  );
}

function HabitProgressCard({
  name,
  value,
  color,
}: {
  name: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-white">{name}</div>
        </div>
        <div className="text-2xl font-bold text-white">{value}%</div>
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(6, value)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();

  const today = useMemo(() => yyyyMmDd(new Date()), []);
  const defaultStart = useMemo(() => yyyyMmDd(addDays(new Date(), -29)), []);

  const [userId, setUserId] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(defaultStart);
  const [endDate, setEndDate] = useState<string>(today);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [series, setSeries] = useState<Point[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [msg, setMsg] = useState<string>("");
  const [metricX, setMetricX] = useState<MetricKey>("sleepHours");
  const [metricY, setMetricY] = useState<MetricKey>("score");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      setUserId(data.user.id);
      setEmail(data.user.email ?? "");
    })();
  }, [router]);

  async function loadRange() {
    setMsg("");
    if (!userId) return;

    setLoading(true);
    try {
      const { data: g, error: gErr } = await supabase.from("goals").select("*").eq("user_id", userId).maybeSingle();
      if (gErr) throw new Error(gErr.message);

      const gSafe: Goals = {
        steps_target: g?.steps_target ?? 8000,
        water_ml_target: g?.water_ml_target ?? 2000,
        sleep_hours_target: Number(g?.sleep_hours_target ?? 8),
        workouts_per_week_target: g?.workouts_per_week_target ?? 3,
        calories_target: g?.calories_target ?? 2000,
        goal_type: g?.goal_type ?? "general_fitness",
      };
      setGoals(gSafe);

      const [stepsRes, sleepRes, waterRes, mealsRes, workoutsRes] = await Promise.all([
        supabase.from("daily_logs").select("log_date, steps").eq("user_id", userId).gte("log_date", startDate).lte("log_date", endDate),
        supabase.from("sleep_logs").select("log_date, hours").eq("user_id", userId).gte("log_date", startDate).lte("log_date", endDate),
        supabase.from("water_logs").select("log_date, ml").eq("user_id", userId).gte("log_date", startDate).lte("log_date", endDate),
        supabase.from("meals").select("log_date, calories").eq("user_id", userId).gte("log_date", startDate).lte("log_date", endDate),
        supabase.from("workout_logs").select("log_date, duration_min").eq("user_id", userId).gte("log_date", startDate).lte("log_date", endDate),
      ]);

      if (stepsRes.error) throw new Error(stepsRes.error.message);
      if (sleepRes.error) throw new Error(sleepRes.error.message);
      if (waterRes.error) throw new Error(waterRes.error.message);
      if (mealsRes.error) throw new Error(mealsRes.error.message);
      if (workoutsRes.error) throw new Error(workoutsRes.error.message);

      const stepsByDate = new Map<string, number>();
      for (const row of stepsRes.data ?? []) stepsByDate.set(row.log_date, row.steps ?? 0);

      const sleepByDate = new Map<string, number>();
      for (const row of sleepRes.data ?? []) sleepByDate.set(row.log_date, Number(row.hours ?? 0));

      const waterByDate = new Map<string, number>();
      for (const row of waterRes.data ?? []) waterByDate.set(row.log_date, Number(row.ml ?? 0));

      const caloriesByDate = new Map<string, number>();
      for (const row of mealsRes.data ?? []) {
        const prev = caloriesByDate.get(row.log_date) ?? 0;
        caloriesByDate.set(row.log_date, prev + (row.calories ?? 0));
      }

      const workoutMinByDate = new Map<string, number>();
      for (const row of workoutsRes.data ?? []) {
        const prev = workoutMinByDate.get(row.log_date) ?? 0;
        workoutMinByDate.set(row.log_date, prev + (row.duration_min ?? 0));
      }

      const dates = dateListInclusive(startDate, endDate);
      const weekWorkoutDaysSoFar = new Map<string, number>();

      const built: Point[] = dates.map((isoDate) => {
        const steps = stepsByDate.get(isoDate) ?? 0;
        const sleepHours = sleepByDate.get(isoDate) ?? 0;
        const waterMl = waterByDate.get(isoDate) ?? 0;
        const calories = caloriesByDate.get(isoDate) ?? 0;
        const workoutMin = workoutMinByDate.get(isoDate) ?? 0;

        const onStepsBool = steps >= gSafe.steps_target;
        const onWaterBool = waterMl >= gSafe.water_ml_target;
        const onSleepBool = sleepHours >= gSafe.sleep_hours_target;

        const wk = weekStartMondayISO(isoDate);
        const didWorkoutToday = workoutMin > 0 ? 1 : 0;
        const prevSoFar = weekWorkoutDaysSoFar.get(wk) ?? 0;
        const soFar = prevSoFar + didWorkoutToday;
        weekWorkoutDaysSoFar.set(wk, soFar);

        const idx = dayIndexInWeek(isoDate);
        const expectedByToday = Math.ceil((gSafe.workouts_per_week_target * idx) / 7);
        const onWorkoutBool = soFar >= expectedByToday;

        const score = [onStepsBool, onWaterBool, onSleepBool, onWorkoutBool].filter(Boolean).length;

        return {
          isoDate,
          date: shortDate(isoDate),
          weekday: weekdayShort(isoDate),
          steps,
          waterMl,
          sleepHours,
          workoutMin,
          calories,
          onSteps: onStepsBool ? 1 : 0,
          onWater: onWaterBool ? 1 : 0,
          onSleep: onSleepBool ? 1 : 0,
          onWorkout: onWorkoutBool ? 1 : 0,
          score,
        };
      });

      setSeries(built);
    } catch (error: any) {
      setMsg(error?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!userId) return;
    loadRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const startOk = startDate <= endDate;

  const summary = useMemo(() => {
    if (!series.length) {
      return {
        onTrackPct: 0,
        avgScore: 0,
        streak: { current: 0, best: 0 },
        avgSleep: 0,
        avgWaterL: 0,
        avgSteps: 0,
        avgCalories: 0,
        workoutDays: 0,
        totalWorkoutMin: 0,
        bestDay: null as Point | null,
      };
    }

    const totalPossible = series.length * 4;
    const totalScore = series.reduce((sum, point) => sum + point.score, 0);
    const onTrackPct = Math.round((totalScore / Math.max(1, totalPossible)) * 100);
    const avgScore = Math.round((totalScore / Math.max(1, series.length)) * 10) / 10;
    const streak = computeStreak(series);
    const avgSleep = average(series.map((point) => point.sleepHours));
    const avgWaterL = average(series.map((point) => point.waterMl)) / 1000;
    const avgSteps = average(series.map((point) => point.steps));
    const avgCalories = average(series.map((point) => point.calories));
    const workoutDays = series.filter((point) => point.workoutMin > 0).length;
    const totalWorkoutMin = series.reduce((sum, point) => sum + point.workoutMin, 0);
    const bestDay = [...series].sort((a, b) => b.score - a.score || b.workoutMin - a.workoutMin)[0] ?? null;

    return {
      onTrackPct,
      avgScore,
      streak,
      avgSleep,
      avgWaterL,
      avgSteps,
      avgCalories,
      workoutDays,
      totalWorkoutMin,
      bestDay,
    };
  }, [series]);

  const adherence = useMemo(() => {
    if (!series.length) return [] as { name: string; value: number; target: string }[];
    return [
      {
        name: "Steps",
        value: Math.round((series.reduce((sum, point) => sum + point.onSteps, 0) / series.length) * 100),
        target: goals ? `${formatCompact(goals.steps_target)} steps` : "steps target",
      },
      {
        name: "Water",
        value: Math.round((series.reduce((sum, point) => sum + point.onWater, 0) / series.length) * 100),
        target: goals ? `${formatCompact(goals.water_ml_target)} ml` : "water target",
      },
      {
        name: "Sleep",
        value: Math.round((series.reduce((sum, point) => sum + point.onSleep, 0) / series.length) * 100),
        target: goals ? `${goals.sleep_hours_target}h` : "sleep target",
      },
      {
        name: "Workout Pace",
        value: Math.round((series.reduce((sum, point) => sum + point.onWorkout, 0) / series.length) * 100),
        target: goals ? `${goals.workouts_per_week_target}/week pace` : "workout pace",
      },
    ];
  }, [series, goals]);

  const weekdayBreakdown = useMemo(() => {
    const buckets = new Map<string, { score: number[]; workout: number[] }>();
    for (const day of WEEKDAYS) buckets.set(day, { score: [], workout: [] });

    for (const point of series) {
      const entry = buckets.get(point.weekday) ?? { score: [], workout: [] };
      entry.score.push(point.score);
      entry.workout.push(point.workoutMin);
      buckets.set(point.weekday, entry);
    }

    return WEEKDAYS.map((day) => {
      const entry = buckets.get(day) ?? { score: [], workout: [] };
      return {
        day,
        avgScore: Math.round(average(entry.score) * 10) / 10,
        avgWorkout: Math.round(average(entry.workout)),
      };
    });
  }, [series]);

  const scoreTrend = useMemo(() => {
    return series.map((point) => ({
      date: point.date,
      score: point.score,
      workoutMin: point.workoutMin,
    }));
  }, [series]);

  const habitPieData = useMemo(() => {
    return adherence.map((item) => ({ name: item.name, value: item.value || 0 }));
  }, [adherence]);

  const recoveryScatter = useMemo(() => {
    return series
      .filter((point) => point.sleepHours > 0 || point.score > 0)
      .map((point) => ({
        x: point.sleepHours,
        y: point.score,
        z: Math.max(6, Math.round(point.workoutMin / 3) + 6),
        label: point.date,
      }));
  }, [series]);

  const findings = useMemo(() => {
    if (!series.length || !adherence.length) return [] as { title: string; body: string }[];

    const strongest = [...adherence].sort((a, b) => b.value - a.value)[0];
    const weakest = [...adherence].sort((a, b) => a.value - b.value)[0];
    const bestWeekday = [...weekdayBreakdown].sort((a, b) => b.avgScore - a.avgScore)[0];

    const wellRecovered = series.filter((point) =>
      goals ? point.sleepHours >= goals.sleep_hours_target : point.sleepHours >= 7
    );
    const underRecovered = series.filter((point) =>
      point.sleepHours > 0 &&
      (goals ? point.sleepHours < goals.sleep_hours_target : point.sleepHours < 7)
    );
    const recoveredAvg = average(wellRecovered.map((point) => point.score));
    const underRecoveredAvg = average(underRecovered.map((point) => point.score));

    const workoutDays = series.filter((point) => point.workoutMin > 0);
    const nonWorkoutDays = series.filter((point) => point.workoutMin === 0);
    const workoutScore = average(workoutDays.map((point) => point.score));
    const nonWorkoutScore = average(nonWorkoutDays.map((point) => point.score));

    return [
      {
        title: `Strongest lever: ${strongest.name}`,
        body: `${strongest.name} is your most reliable habit right now with ${strongest.value}% adherence. That is your anchor behaviour — keep it locked in.`,
      },
      {
        title: `Most fragile habit: ${weakest.name}`,
        body: `${weakest.name} is the main leak in your system at ${weakest.value}% adherence. If you improve just one habit next, this one gives the biggest upside.`,
      },
      {
        title: `Best rhythm day: ${bestWeekday.day}`,
        body: `${bestWeekday.day} is your best-performing weekday with an average score of ${bestWeekday.avgScore}/4. That is the day your current routine naturally clicks.`,
      },
      {
        title: "Recovery impact",
        body:
          wellRecovered.length && underRecovered.length
            ? `On better-sleep days your average score is ${Math.round(recoveredAvg * 10) / 10}/4 versus ${Math.round(underRecoveredAvg * 10) / 10}/4 on lower-sleep days.`
            : "Log a few more days of sleep to unlock stronger recovery insights.",
      },
      {
        title: "Training effect",
        body:
          workoutDays.length && nonWorkoutDays.length
            ? `Workout days average ${Math.round(workoutScore * 10) / 10}/4 versus ${Math.round(nonWorkoutScore * 10) / 10}/4 on non-workout days.`
            : "Once you have both workout and non-workout days in range, this card becomes sharper.",
      },
    ];
  }, [series, adherence, weekdayBreakdown, goals]);

  const lab = useMemo(() => {
    const xValues = series.map((point) => getMetricValue(point, metricX));
    const yValues = series.map((point) => getMetricValue(point, metricY));
    const correlation = pearsonCorrelation(xValues, yValues);
    const relationship = describeCorrelation(correlation);

    const scatterPoints = series.map((point) => ({
      x: getMetricValue(point, metricX),
      y: getMetricValue(point, metricY),
      label: point.date,
    }));

    const xAvg = average(xValues);
    const yAvg = average(yValues);
    const insight =
      Math.abs(correlation) < 0.2
        ? `${prettyMetric(metricX)} is not showing a strong consistent relationship with ${prettyMetric(metricY)} in this range. That usually means other habits are also shaping the result.`
        : correlation > 0
        ? `As ${prettyMetric(metricX).toLowerCase()} goes up, ${prettyMetric(metricY).toLowerCase()} tends to improve as well. Your current data suggests these two move in the same direction.`
        : `As ${prettyMetric(metricX).toLowerCase()} goes up, ${prettyMetric(metricY).toLowerCase()} tends to drop. This may point to trade-offs or overdoing something.`;

    return {
      correlation,
      relationship,
      scatterPoints,
      xAvg,
      yAvg,
      insight,
    };
  }, [series, metricX, metricY]);

  const tone = summary.onTrackPct >= 70 ? "good" : summary.onTrackPct >= 45 ? "warn" : "default";

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/12 to-white/5 p-6 backdrop-blur-md">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="hype">Fitness Intelligence</div>
            <h1 className="mt-1 text-3xl font-semibold text-white">Analytics Lab</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
              Only the metrics that make sense for your current build: steps, hydration, sleep, workouts, calories, and daily performance score. No fluff — just patterns, leverage points, and beautiful clarity.
            </p>
            <div className="mt-3 text-xs text-white/45">{email} • currently tracked data only</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/65">
            {loading ? "Crunching your data..." : `${series.length} days analyzed`}
          </div>
        </div>
      </div>

      <div className="glass glow-ring rounded-3xl p-5">
        <div className="grid gap-3 lg:grid-cols-[220px_220px_1fr]">
          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-white/50">Start</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-white/50">End</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white"
            />
          </div>

          <div className="flex flex-wrap items-end gap-2 lg:justify-end">
            <button
              onClick={() => {
                setStartDate(yyyyMmDd(addDays(new Date(), -6)));
                setEndDate(today);
              }}
              className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/75 hover:bg-white/10"
            >
              7D
            </button>
            <button
              onClick={() => {
                setStartDate(defaultStart);
                setEndDate(today);
              }}
              className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/75 hover:bg-white/10"
            >
              30D
            </button>
            <button
              onClick={() => {
                setStartDate(yyyyMmDd(addDays(new Date(), -89)));
                setEndDate(today);
              }}
              className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/75 hover:bg-white/10"
            >
              90D
            </button>
            <button
              onClick={loadRange}
              disabled={!startOk || loading}
              className="btn-win rounded-2xl px-4 py-2 text-sm disabled:opacity-50"
            >
              {loading ? "Loading..." : "Apply range"}
            </button>
          </div>
        </div>

        {!startOk ? <div className="mt-3 text-sm text-red-300">Start date must be before end date.</div> : null}

      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Performance" value={`${summary.onTrackPct}%`} sub={`${summary.avgScore}/4 average daily score`} tone={tone} />
        <StatCard label="Current Streak" value={summary.streak.current} sub={`Best streak ${summary.streak.best} days`} tone="good" />
        <StatCard label="Recovery Average" value={`${Math.round(summary.avgSleep * 10) / 10}h`} sub={`${Math.round(summary.avgWaterL * 10) / 10}L water per day`} />
        <StatCard
          label="Movement Load"
          value={`${summary.workoutDays} days`}
          sub={`${formatCompact(summary.avgSteps)} avg steps • ${formatCompact(summary.totalWorkoutMin)} total workout min`}
          tone="warn"
        />
      </div>


      <ChartCard
        title="Performance Score Trend"
        subtitle="Your simplest big-picture view: how your tracked habits have been stacking up day by day."
        action={<div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/55">Target zone: 3+</div>}
        heightClass="h-[340px]"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={scoreTrend} margin={{ top: 12, right: 10, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.45} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }} />
            <YAxis domain={[0, 4]} tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }} />
            <Tooltip
              contentStyle={{
                background: "rgba(0,0,0,0.88)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                color: "white",
              }}
            />
            <ReferenceLine y={3} stroke="rgba(255,255,255,0.22)" strokeDasharray="6 6" />
            <Area type="monotone" dataKey="score" stroke="#22c55e" strokeWidth={3} fill="url(#scoreFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="glass glow-ring rounded-3xl p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-base font-semibold text-white">What your patterns are saying</div>
            <div className="mt-1 text-sm text-white/55">
              These insights explain where you naturally perform better and where recovery may be shaping outcomes.
            </div>
          </div>
          <div className="text-xs uppercase tracking-[0.18em] text-white/40">Pattern finder</div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {findings.map((finding) => (
            <InsightCard key={finding.title} title={finding.title} body={finding.body} />
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 min-w-0">
        <ChartCard
          title="Weekly Rhythm Map"
          subtitle="Your average score and training effort by weekday. This helps you see which days naturally work best for you."
          heightClass="h-[340px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekdayBreakdown} margin={{ top: 12, right: 10, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }} />
              <YAxis yAxisId="left" domain={[0, 4]} tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: "rgba(255,255,255,0.45)" }} />
              <Tooltip
                contentStyle={{
                  background: "rgba(0,0,0,0.88)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 14,
                  color: "white",
                }}
              />
              <Bar yAxisId="left" dataKey="avgScore" radius={[10, 10, 0, 0]} fill="#22c55e" />
              <Bar yAxisId="right" dataKey="avgWorkout" radius={[10, 10, 0, 0]} fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Recovery vs Performance"
          subtitle="Advanced view. Bigger dots mean more workout minutes. Use this to see where sleep and performance tend to meet."
          heightClass="h-[340px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis
                type="number"
                dataKey="x"
                name="Sleep"
                unit="h"
                tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Score"
                domain={[0, 4]}
                tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }}
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{
                  background: "rgba(0,0,0,0.88)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 14,
                  color: "white",
                }}
                formatter={(value: number, name: string) => [value, name === "x" ? "Sleep" : "Score"]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? "Day"}
              />
              <Scatter data={recoveryScatter} fill="#a78bfa" />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="glass glow-ring rounded-3xl p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-base font-semibold text-white">Custom Analytics Lab</div>
            <div className="mt-1 text-sm text-white/55">Pick any two tracked metrics and inspect how they move together in your real life data.</div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-white/50">Analyze</label>
              <select
                value={metricX}
                onChange={(e) => setMetricX(e.target.value as MetricKey)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white"
              >
                <option value="steps">Steps</option>
                <option value="waterMl">Water</option>
                <option value="sleepHours">Sleep</option>
                <option value="workoutMin">Workout Minutes</option>
                <option value="calories">Calories</option>
                <option value="score">Performance Score</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-white/50">Against</label>
              <select
                value={metricY}
                onChange={(e) => setMetricY(e.target.value as MetricKey)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white"
              >
                <option value="steps">Steps</option>
                <option value="waterMl">Water</option>
                <option value="sleepHours">Sleep</option>
                <option value="workoutMin">Workout Minutes</option>
                <option value="calories">Calories</option>
                <option value="score">Performance Score</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1.05fr_0.95fr] min-w-0">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-4 min-w-0">
            <div className="h-[320px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 12, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name={prettyMetric(metricX)}
                    tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name={prettyMetric(metricY)}
                    tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(0,0,0,0.88)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 14,
                      color: "white",
                    }}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? "Day"}
                  />
                  <Scatter data={lab.scatterPoints} fill="#60a5fa" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-3 content-start">
            <InsightCard title="Relationship strength" body={`${describeCorrelation(lab.correlation)} (${Math.round(lab.correlation * 100) / 100})`} />
            <InsightCard title="What this means" body={lab.insight} />
            <InsightCard
              title="Average reference"
              body={`${prettyMetric(metricX)} averages ${Math.round(lab.xAvg * 10) / 10}${metricSuffix(metricX)}, while ${prettyMetric(metricY).toLowerCase()} averages ${Math.round(lab.yAvg * 10) / 10}${metricSuffix(metricY)}.`}
            />
          </div>
        </div>
      </div>

      {summary.bestDay ? (
        <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-5">
          <div className="text-xs uppercase tracking-[0.22em] text-white/45">Best observed day</div>
          <div className="mt-2 text-2xl font-semibold text-white">{summary.bestDay.date} • {summary.bestDay.weekday}</div>
          <div className="mt-2 text-sm leading-6 text-white/65">
            Score {summary.bestDay.score}/4 • {formatCompact(summary.bestDay.steps)} steps • {formatCompact(summary.bestDay.waterMl)} ml water • {Math.round(summary.bestDay.sleepHours * 10) / 10}h sleep • {formatCompact(summary.bestDay.workoutMin)} workout min.
          </div>
        </div>
      ) : null}

      {msg ? <p className="text-sm text-red-300">{msg}</p> : null}
    </div>
  );
}