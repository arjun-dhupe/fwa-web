"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { levelFromXp } from "@/lib/gamification";

function yyyyMmDd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function weekStartMondayISO(isoDate: string) {
  const d = new Date(isoDate + "T00:00:00");
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return yyyyMmDd(d);
}

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");

  const todayIso = useMemo(() => yyyyMmDd(new Date()), []);
  const weekStart = useMemo(() => weekStartMondayISO(todayIso), [todayIso]);

  // Goals
  const [goalSteps, setGoalSteps] = useState(8000);
  const [goalWorkoutsPerWeek, setGoalWorkoutsPerWeek] = useState(3);

  // Today
  const [stepsToday, setStepsToday] = useState(0);
  const [sleepToday, setSleepToday] = useState(0);
  const [waterToday, setWaterToday] = useState(0);

  // Week
  const [workoutDaysThisWeek, setWorkoutDaysThisWeek] = useState(0);
  const [workoutSessionsThisWeek, setWorkoutSessionsThisWeek] = useState(0);

  // Gamification
  const [xp, setXp] = useState(0);
  const [level, setLevel] = useState(1);
  const [streak, setStreak] = useState(0);

  // Last 7 days trend
  const [last7Steps, setLast7Steps] = useState<number[]>([]);
  const [last7Water, setLast7Water] = useState<number[]>([]);
  const [last7Sleep, setLast7Sleep] = useState<number[]>([]);
  const [last7Labels, setLast7Labels] = useState<string[]>([]);

  const stepsPct = Math.min(100, Math.round((stepsToday / Math.max(1, goalSteps)) * 100));
  const waterPct = Math.min(100, Math.round((waterToday / 2000) * 100));
  const sleepPct = Math.min(100, Math.round((sleepToday / 8) * 100));

  const stepsOnTrack = stepsToday >= goalSteps;
  const weekWorkoutOnTrack = workoutDaysThisWeek >= Math.ceil((goalWorkoutsPerWeek * ((new Date().getDay() + 6) % 7 + 1)) / 7);

  function barWidth(v: number, max: number) {
    const pct = Math.max(0, Math.min(100, Math.round((v / Math.max(1, max)) * 100)));
    return `${pct}%`;
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return router.push("/login");

        setEmail(data.user.email ?? "");
        setUserId(data.user.id);

        // Goals
        const { data: goalRow, error: goalErr } = await supabase
          .from("goals")
          .select("steps_target, workouts_per_week_target")
          .eq("user_id", data.user.id)
          .maybeSingle();
        if (goalErr) throw new Error(goalErr.message);

        setGoalSteps(goalRow?.steps_target ?? 8000);
        setGoalWorkoutsPerWeek(goalRow?.workouts_per_week_target ?? 3);

        // Gamification
        const { data: gs } = await supabase
          .from("gamification_state")
          .select("xp, level, streak")
          .eq("user_id", data.user.id)
          .maybeSingle();

        const xpVal = gs?.xp ?? 0;
        setXp(xpVal);
        setLevel(gs?.level ?? levelFromXp(xpVal).level);
        setStreak(gs?.streak ?? 0);

        // Today logs
        const [{ data: stepsRow }, { data: sleepRow }, { data: waterRow }] = await Promise.all([
          supabase.from("daily_logs").select("steps").eq("user_id", data.user.id).eq("log_date", todayIso).maybeSingle(),
          supabase.from("sleep_logs").select("hours").eq("user_id", data.user.id).eq("log_date", todayIso).maybeSingle(),
          supabase.from("water_logs").select("ml").eq("user_id", data.user.id).eq("log_date", todayIso).maybeSingle(),
        ]);

        setStepsToday(stepsRow?.steps ?? 0);
        setSleepToday(Number(sleepRow?.hours ?? 0));
        setWaterToday(Number(waterRow?.ml ?? 0));

        // Weekly workouts
        const { data: wRows, error: wErr } = await supabase
          .from("workout_logs")
          .select("log_date")
          .eq("user_id", data.user.id)
          .gte("log_date", weekStart)
          .lte("log_date", todayIso);
        if (wErr) throw new Error(wErr.message);

        const sessions = (wRows ?? []).length;
        const uniqueDays = new Set<string>();
        for (const r of wRows ?? []) if (r.log_date) uniqueDays.add(r.log_date);

        setWorkoutSessionsThisWeek(sessions);
        setWorkoutDaysThisWeek(uniqueDays.size);

        // Last 7 days mini trends
        const days: string[] = [];
        const labels: string[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const iso = yyyyMmDd(d);
          days.push(iso);
          labels.push(d.toLocaleDateString(undefined, { weekday: "short" }));
        }

        const [steps7, water7, sleep7] = await Promise.all([
          supabase.from("daily_logs").select("log_date,steps").eq("user_id", data.user.id).in("log_date", days),
          supabase.from("water_logs").select("log_date,ml").eq("user_id", data.user.id).in("log_date", days),
          supabase.from("sleep_logs").select("log_date,hours").eq("user_id", data.user.id).in("log_date", days),
        ]);

        const mapSteps = new Map((steps7.data ?? []).map((r: any) => [r.log_date, r.steps ?? 0]));
        const mapWater = new Map((water7.data ?? []).map((r: any) => [r.log_date, r.ml ?? 0]));
        const mapSleep = new Map((sleep7.data ?? []).map((r: any) => [r.log_date, Number(r.hours ?? 0)]));

        setLast7Labels(labels);
        setLast7Steps(days.map((d) => mapSteps.get(d) ?? 0));
        setLast7Water(days.map((d) => mapWater.get(d) ?? 0));
        setLast7Sleep(days.map((d) => mapSleep.get(d) ?? 0));
      } catch (e: any) {
        setMsg(e?.message ?? "Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
  }, [router, todayIso, weekStart]);

  return (
    <div className="space-y-4">
      {/* HERO */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-5 backdrop-blur-md">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-white/60">FWA • Momentum Dashboard</div>
            <h1 className="mt-1 text-3xl font-semibold">Your Progress Looks Dangerous 🔥</h1>
            <p className="mt-1 text-sm text-white/60">
              Live snapshot for <b className="text-white/80">{todayIso}</b> • {email}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/log")}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            >
              ➕ Log Data
            </button>
            <button
              onClick={() => router.push("/today")}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            >
              ✅ Today
            </button>
          </div>
        </div>

        {/* Level strip */}
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="text-xs text-white/50">Level</div>
            <div className="mt-1 text-2xl font-semibold">Lv {level}</div>
            <div className="mt-1 text-xs text-white/50">{xp} XP</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="text-xs text-white/50">Streak</div>
            <div className="mt-1 text-2xl font-semibold">{streak} days</div>
            <div className="mt-1 text-xs text-white/50">Don’t break the chain.</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="text-xs text-white/50">Weekly Workouts</div>
            <div className="mt-1 text-2xl font-semibold">
              {workoutDaysThisWeek} <span className="text-white/50 text-sm">/ {goalWorkoutsPerWeek}</span>
            </div>
            <div className={`mt-1 text-xs ${weekWorkoutOnTrack ? "text-emerald-300" : "text-amber-300"}`}>
              {weekWorkoutOnTrack ? "✅ Pace on track" : "⚠️ Behind pace"}
            </div>
            <div className="mt-1 text-xs text-white/50">Sessions: {workoutSessionsThisWeek}</div>
          </div>
        </div>
      </div>

      {/* TODAY SCORECARDS */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">👣 Steps</div>
            <div className={`text-xs ${stepsOnTrack ? "text-emerald-300" : "text-amber-300"}`}>
              {stepsOnTrack ? "On track" : "Behind"}
            </div>
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {stepsToday} <span className="text-white/50 text-sm">/ {goalSteps}</span>
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-emerald-400/80" style={{ width: `${stepsPct}%` }} />
          </div>
          <div className="mt-2 text-xs text-white/50">Keep moving. Small steps = big compounding.</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">💧 Water</div>
            <div className="text-xs text-white/60">Target 2000ml</div>
          </div>
          <div className="mt-2 text-2xl font-semibold">{waterToday} ml</div>
          <div className="mt-3 h-2 w-full rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-cyan-300/80" style={{ width: `${waterPct}%` }} />
          </div>
          <div className="mt-2 text-xs text-white/50">Hydration = performance.</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">😴 Sleep</div>
            <div className="text-xs text-white/60">Target 8h</div>
          </div>
          <div className="mt-2 text-2xl font-semibold">{sleepToday} hrs</div>
          <div className="mt-3 h-2 w-full rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-purple-300/80" style={{ width: `${sleepPct}%` }} />
          </div>
          <div className="mt-2 text-xs text-white/50">Recovery is part of the program.</div>
        </div>
      </div>

      {/* MINI TRENDS */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-sm font-medium">📈 Last 7 Days</div>
            <div className="text-xs text-white/50">Quick trend view (no fluff)</div>
          </div>
          <button
            onClick={() => router.push("/analytics")}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
          >
            Open Analytics →
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {/* Steps mini bars */}
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="text-xs text-white/60">Steps</div>
            <div className="mt-3 flex items-end gap-2 h-20">
              {last7Steps.map((v, i) => (
                <div key={i} className="flex-1">
                  <div className="h-20 rounded-md bg-white/5 overflow-hidden">
                    <div className="w-full bg-emerald-400/70" style={{ height: barWidth(v, goalSteps) }} />
                  </div>
                  <div className="mt-1 text-[10px] text-white/45 text-center">{last7Labels[i]}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Water mini bars */}
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="text-xs text-white/60">Water</div>
            <div className="mt-3 flex items-end gap-2 h-20">
              {last7Water.map((v, i) => (
                <div key={i} className="flex-1">
                  <div className="h-20 rounded-md bg-white/5 overflow-hidden">
                    <div className="w-full bg-cyan-300/70" style={{ height: barWidth(v, 2000) }} />
                  </div>
                  <div className="mt-1 text-[10px] text-white/45 text-center">{last7Labels[i]}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Sleep mini bars */}
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="text-xs text-white/60">Sleep</div>
            <div className="mt-3 flex items-end gap-2 h-20">
              {last7Sleep.map((v, i) => (
                <div key={i} className="flex-1">
                  <div className="h-20 rounded-md bg-white/5 overflow-hidden">
                    <div className="w-full bg-purple-300/70" style={{ height: barWidth(v, 8) }} />
                  </div>
                  <div className="mt-1 text-[10px] text-white/45 text-center">{last7Labels[i]}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {loading && <div className="mt-3 text-xs text-white/50">Loading your dashboard…</div>}
        {msg && <div className="mt-3 text-xs text-red-300">{msg}</div>}
      </div>
    </div>
  );
}