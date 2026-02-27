"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
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
  isoDate: string; // YYYY-MM-DD
  date: string; // label like 02/25
  steps: number;
  waterMl: number;
  sleepHours: number;
  workoutMin: number;
  calories: number;

  onSteps: number; // 0/1
  onWater: number;
  onSleep: number;
  onWorkout: number; // weekly pace-based
  score: number; // 0..4
};

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

// Monday-start week. Returns YYYY-MM-DD for the Monday of that week.
function weekStartMondayISO(isoDate: string) {
  const d = new Date(isoDate + "T00:00:00");
  const day = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  d.setDate(d.getDate() - day);
  return yyyyMmDd(d);
}

// 1..7 (Mon..Sun)
function dayIndexInWeek(isoDate: string) {
  const d = new Date(isoDate + "T00:00:00");
  const day = (d.getDay() + 6) % 7;
  return day + 1;
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass glow-ring hover-lift rounded-2xl p-4 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white/90">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-white/55">{subtitle}</div> : null}
        </div>
      </div>

      {/* fixed-height container prevents Recharts width/height warnings */}
      <div className="mt-3 min-w-0">
        <div className="h-[280px] w-full min-w-0">{children}</div>
      </div>
    </div>
  );
}

function TipPill({ label, value, tone }: { label: string; value: React.ReactNode; tone: "good" | "warn" | "bad" }) {
  const cls = tone === "good" ? "pill pill-good" : tone === "warn" ? "pill pill-warn" : "pill pill-bad";
  return (
    <span className={`${cls} rounded-full px-3 py-1 text-sm`}>
      <span className="text-white/70">{label}: </span>
      <b className="text-white/90">{value}</b>
    </span>
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

  const summary = useMemo(() => {
    if (!series.length) return { onTrackPct: 0, avgScore: 0, streak: { current: 0, best: 0 } };

    const totalPossible = series.length * 4;
    const totalScore = series.reduce((s, p) => s + p.score, 0);
    const onTrackPct = Math.round((totalScore / Math.max(1, totalPossible)) * 100);
    const avgScore = Math.round((totalScore / Math.max(1, series.length)) * 10) / 10;

    const streak = computeStreak(series);
    return { onTrackPct, avgScore, streak };
  }, [series]);

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
        supabase
          .from("daily_logs")
          .select("log_date, steps")
          .eq("user_id", userId)
          .gte("log_date", startDate)
          .lte("log_date", endDate),

        supabase
          .from("sleep_logs")
          .select("log_date, hours")
          .eq("user_id", userId)
          .gte("log_date", startDate)
          .lte("log_date", endDate),

        supabase
          .from("water_logs")
          .select("log_date, ml")
          .eq("user_id", userId)
          .gte("log_date", startDate)
          .lte("log_date", endDate),

        supabase
          .from("meals")
          .select("log_date, calories")
          .eq("user_id", userId)
          .gte("log_date", startDate)
          .lte("log_date", endDate),

        supabase
          .from("workout_logs")
          .select("log_date, duration_min")
          .eq("user_id", userId)
          .gte("log_date", startDate)
          .lte("log_date", endDate),
      ]);

      if (stepsRes.error) throw new Error(stepsRes.error.message);
      if (sleepRes.error) throw new Error(sleepRes.error.message);
      if (waterRes.error) throw new Error(waterRes.error.message);
      if (mealsRes.error) throw new Error(mealsRes.error.message);
      if (workoutsRes.error) throw new Error(workoutsRes.error.message);

      const stepsByDate = new Map<string, number>();
      for (const r of stepsRes.data ?? []) stepsByDate.set(r.log_date, r.steps ?? 0);

      const sleepByDate = new Map<string, number>();
      for (const r of sleepRes.data ?? []) sleepByDate.set(r.log_date, Number(r.hours ?? 0));

      const waterByDate = new Map<string, number>();
      for (const r of waterRes.data ?? []) waterByDate.set(r.log_date, Number(r.ml ?? 0));

      const caloriesByDate = new Map<string, number>();
      for (const r of mealsRes.data ?? []) {
        const prev = caloriesByDate.get(r.log_date) ?? 0;
        caloriesByDate.set(r.log_date, prev + (r.calories ?? 0));
      }

      const workoutMinByDate = new Map<string, number>();
      for (const r of workoutsRes.data ?? []) {
        const prev = workoutMinByDate.get(r.log_date) ?? 0;
        workoutMinByDate.set(r.log_date, prev + (r.duration_min ?? 0));
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
    } catch (e: any) {
      setMsg(e?.message ?? "Something went wrong");
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
  const tone = summary.onTrackPct >= 70 ? "good" : summary.onTrackPct >= 45 ? "warn" : "bad";

  return (
    <div className="space-y-4">
      <div>
        <div className="hype">Performance Lab</div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-white/60">{email} • Trends + on-track scoring</p>
      </div>

      {/* Controls */}
      <div className="glass glow-ring rounded-2xl p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="text-xs text-white/55">Start</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>

          <div>
            <label className="text-xs text-white/55">End</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="md:col-span-2 flex flex-wrap items-end gap-2">
            <button
              onClick={loadRange}
              disabled={!startOk || loading}
              className="btn-win rounded-lg px-3 py-2 text-sm disabled:opacity-50"
            >
              {loading ? "Loading..." : "Apply range"}
            </button>

            <button
              onClick={() => {
                setStartDate(defaultStart);
                setEndDate(today);
              }}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm hover:bg-white/10"
            >
              Last 30 days
            </button>

            {!startOk && <span className="text-sm text-red-300">Start must be ≤ End</span>}
          </div>
        </div>

        {/* Summary chips */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <TipPill label="On-track" value={`${summary.onTrackPct}%`} tone={tone} />
          <span className="pill rounded-full px-3 py-1 text-sm">
            <span className="text-white/70">Avg score: </span>
            <b className="text-white/90">{summary.avgScore}/4</b>
          </span>
          <span className="pill rounded-full px-3 py-1 text-sm">
            <span className="text-white/70">Streak: </span>
            <b className="text-white/90">{summary.streak.current}</b>
          </span>
          <span className="pill rounded-full px-3 py-1 text-sm">
            <span className="text-white/70">Best: </span>
            <b className="text-white/90">{summary.streak.best}</b>
          </span>
        </div>

        {goals && (
          <div className="mt-2 text-xs text-white/55">
            Targets: {goals.steps_target} steps • {goals.water_ml_target} ml water • {goals.sleep_hours_target} hrs sleep
            • {goals.workouts_per_week_target} workouts/week (pace)
          </div>
        )}
      </div>

      {/* Charts grid */}
      <div className="grid gap-3 md:grid-cols-2 min-w-0">
        <ChartCard title="Steps" subtitle="Daily steps trend">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }} />
              <YAxis tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }} />
              <Tooltip
                contentStyle={{
                  background: "rgba(0,0,0,0.85)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  color: "white",
                }}
              />
              <Line type="monotone" dataKey="steps" stroke="#34d399" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Water (ml)" subtitle="Hydration trend">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }} />
              <YAxis tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }} />
              <Tooltip
                contentStyle={{
                  background: "rgba(0,0,0,0.85)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  color: "white",
                }}
              />
              <Line type="monotone" dataKey="waterMl" stroke="#60a5fa" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Sleep (hours)" subtitle="Recovery trend">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }} />
              <YAxis tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }} />
              <Tooltip
                contentStyle={{
                  background: "rgba(0,0,0,0.85)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  color: "white",
                }}
              />
              <Line type="monotone" dataKey="sleepHours" stroke="#a78bfa" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Workout (minutes)" subtitle="Effort trend">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }} />
              <YAxis tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }} />
              <Tooltip
                contentStyle={{
                  background: "rgba(0,0,0,0.85)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  color: "white",
                }}
              />
              <Bar dataKey="workoutMin" radius={[10, 10, 0, 0]} fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="md:col-span-2 min-w-0">
          <ChartCard title="Daily Score (0–4)" subtitle="Steps + Water + Sleep + Workout pace">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }} />
                <YAxis domain={[0, 4]} tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(0,0,0,0.85)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    color: "white",
                  }}
                />
                <Line type="monotone" dataKey="score" stroke="#22c55e" strokeWidth={2.5} dot />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <p className="mt-2 text-xs text-white/55">
            Scoring: each day has 4 checks (Steps, Water, Sleep, Workout pace). Score = how many checks you hit.
          </p>
        </div>
      </div>

      {msg && <p className="text-sm text-red-300">{msg}</p>}
    </div>
  );
}