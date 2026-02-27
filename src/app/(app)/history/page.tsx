"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type Goals = {
  steps_target: number;
  water_ml_target: number;
  sleep_hours_target: number;
  calories_target: number;
  workouts_per_week_target: number;
  goal_type: string;
};

type DayRow = {
  date: string; // YYYY-MM-DD
  steps: number;
  waterMl: number;
  sleepHours: number;
  workoutMin: number;
  calories: number;
  protein: number;

  onSteps: boolean;
  onWater: boolean;
  onSleep: boolean;
  onWorkout: boolean;

  score: number; // 0..4
  label: "Great" | "Okay" | "Behind";
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

function statusTone(label: DayRow["label"]) {
  if (label === "Great") return "pill pill-good";
  if (label === "Okay") return "pill pill-warn";
  return "pill pill-bad";
}

export default function HistoryPage() {
  const router = useRouter();

  const today = useMemo(() => yyyyMmDd(new Date()), []);
  const defaultStart = useMemo(() => yyyyMmDd(addDays(new Date(), -29)), []);

  const [userId, setUserId] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  const [startDate, setStartDate] = useState<string>(defaultStart);
  const [endDate, setEndDate] = useState<string>(today);

  const [goals, setGoals] = useState<Goals | null>(null);
  const [rows, setRows] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [msg, setMsg] = useState<string>("");

  const summary = useMemo(() => {
    if (rows.length === 0) return { onTrackPct: 0, greatDays: 0, okayDays: 0, behindDays: 0 };

    const totalPossible = rows.length * 4;
    const totalScore = rows.reduce((s, r) => s + r.score, 0);
    const onTrackPct = Math.round((totalScore / Math.max(1, totalPossible)) * 100);

    const greatDays = rows.filter((r) => r.label === "Great").length;
    const okayDays = rows.filter((r) => r.label === "Okay").length;
    const behindDays = rows.filter((r) => r.label === "Behind").length;

    return { onTrackPct, greatDays, okayDays, behindDays };
  }, [rows]);

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
        calories_target: g?.calories_target ?? 2000,
        workouts_per_week_target: g?.workouts_per_week_target ?? 3,
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
          .select("log_date, calories, protein_g")
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

      const mealsAggByDate = new Map<string, { calories: number; protein: number }>();
      for (const r of mealsRes.data ?? []) {
        const prev = mealsAggByDate.get(r.log_date) ?? { calories: 0, protein: 0 };
        mealsAggByDate.set(r.log_date, {
          calories: prev.calories + (r.calories ?? 0),
          protein: prev.protein + (r.protein_g ?? 0),
        });
      }

      const workoutMinByDate = new Map<string, number>();
      for (const r of workoutsRes.data ?? []) {
        const prev = workoutMinByDate.get(r.log_date) ?? 0;
        workoutMinByDate.set(r.log_date, prev + (r.duration_min ?? 0));
      }

      const dates = dateListInclusive(startDate, endDate);

      const weekWorkoutDaysSoFar = new Map<string, number>();

      const built: DayRow[] = dates.map((date) => {
        const steps = stepsByDate.get(date) ?? 0;
        const sleepHours = sleepByDate.get(date) ?? 0;
        const waterMl = waterByDate.get(date) ?? 0;
        const workoutMin = workoutMinByDate.get(date) ?? 0;

        const mealAgg = mealsAggByDate.get(date) ?? { calories: 0, protein: 0 };
        const calories = mealAgg.calories;
        const protein = mealAgg.protein;

        const onSteps = steps >= gSafe.steps_target;
        const onWater = waterMl >= gSafe.water_ml_target;
        const onSleep = sleepHours >= gSafe.sleep_hours_target;

        const wk = weekStartMondayISO(date);
        const didWorkoutToday = workoutMin > 0 ? 1 : 0;

        const prevSoFar = weekWorkoutDaysSoFar.get(wk) ?? 0;
        const soFar = prevSoFar + didWorkoutToday;
        weekWorkoutDaysSoFar.set(wk, soFar);

        const idx = dayIndexInWeek(date);
        const expectedByToday = Math.ceil((gSafe.workouts_per_week_target * idx) / 7);
        const onWorkout = soFar >= expectedByToday;

        const score = [onSteps, onWater, onSleep, onWorkout].filter(Boolean).length;
        const label: DayRow["label"] = score >= 3 ? "Great" : score === 2 ? "Okay" : "Behind";

        return {
          date,
          steps,
          waterMl,
          sleepHours,
          workoutMin,
          calories,
          protein,
          onSteps,
          onWater,
          onSleep,
          onWorkout,
          score,
          label,
        };
      });

      built.reverse();
      setRows(built);
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
  const pctTone = summary.onTrackPct >= 70 ? "pill pill-good" : summary.onTrackPct >= 45 ? "pill pill-warn" : "pill pill-bad";

  return (
    <div className="space-y-4">
      <div>
        <div className="hype">Mission Log</div>
        <h1 className="text-2xl font-semibold">History</h1>
        <p className="text-sm text-white/60">{email} • Your day-by-day scoreboard</p>
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

        {/* Summary */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className={`${pctTone} rounded-full px-3 py-1 text-sm`}>
            <span className="text-white/70">On-track: </span>
            <b className="text-white/90">{summary.onTrackPct}%</b>
          </span>

          <span className="pill rounded-full px-3 py-1 text-sm">
            <span className="text-white/70">Great: </span>
            <b className="text-white/90">{summary.greatDays}</b>
          </span>

          <span className="pill rounded-full px-3 py-1 text-sm">
            <span className="text-white/70">Okay: </span>
            <b className="text-white/90">{summary.okayDays}</b>
          </span>

          <span className="pill rounded-full px-3 py-1 text-sm">
            <span className="text-white/70">Behind: </span>
            <b className="text-white/90">{summary.behindDays}</b>
          </span>
        </div>

        {goals && (
          <div className="mt-2 text-xs text-white/55">
            Targets: {goals.steps_target} steps • {goals.water_ml_target} ml water • {goals.sleep_hours_target} hrs sleep
            • {goals.workouts_per_week_target} workouts/week (pace)
          </div>
        )}
      </div>

      {/* Table */}
      <div className="glass glow-ring overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-black/40 text-white/75">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-right">Steps</th>
                <th className="px-3 py-2 text-right">Water</th>
                <th className="px-3 py-2 text-right">Sleep</th>
                <th className="px-3 py-2 text-right">Workout</th>
                <th className="px-3 py-2 text-right">Calories</th>
                <th className="px-3 py-2 text-right">Protein</th>
              </tr>
            </thead>

            <tbody className="bg-black/20">
              {rows.length === 0 && !loading ? (
                <tr>
                  <td className="px-3 py-4 text-white/55" colSpan={9}>
                    No data in this range yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.date} className="border-t border-white/10 hover:bg-white/5 transition-colors">
                    <td className="px-3 py-2 text-white/85">{r.date}</td>

                    <td className="px-3 py-2">
                      <span className={`${statusTone(r.label)} rounded-full px-3 py-1 text-xs`}>
                        <b className="text-white/90">{r.label}</b>
                      </span>

                      <div className="mt-1 text-xs text-white/55">
                        <span className={r.onSteps ? "text-emerald-300" : "text-white/40"}>Steps</span> •{" "}
                        <span className={r.onWater ? "text-emerald-300" : "text-white/40"}>Water</span> •{" "}
                        <span className={r.onSleep ? "text-emerald-300" : "text-white/40"}>Sleep</span> •{" "}
                        <span className={r.onWorkout ? "text-emerald-300" : "text-white/40"}>Workout pace</span>
                      </div>
                    </td>

                    <td className="px-3 py-2 text-right text-white/85">{r.score}/4</td>

                    <td className="px-3 py-2 text-right text-white/70">{r.steps}</td>
                    <td className="px-3 py-2 text-right text-white/70">{r.waterMl}</td>
                    <td className="px-3 py-2 text-right text-white/70">{r.sleepHours}</td>
                    <td className="px-3 py-2 text-right text-white/70">{r.workoutMin}</td>
                    <td className="px-3 py-2 text-right text-white/70">{r.calories}</td>
                    <td className="px-3 py-2 text-right text-white/70">{r.protein}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {msg && <p className="text-sm text-red-300">{msg}</p>}

      <p className="text-xs text-white/55">
        Weekly workout pacing: the app checks if workouts completed so far this week are at least the expected count by
        that day.
      </p>
    </div>
  );
}