"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { getDailyQuote } from "@/lib/motivation";
import { computeStreak, levelFromXp } from "@/lib/gamification";

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

function dayIndexInWeek(isoDate: string) {
  const d = new Date(isoDate + "T00:00:00");
  const day = (d.getDay() + 6) % 7;
  return day + 1; // 1..7 (Mon..Sun)
}

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

type QuestTemplate = {
  quest_id: string;
  title: string;
  xp_reward: number;
};

const QUESTS: QuestTemplate[] = [
  { quest_id: "log_steps", title: "Log your steps", xp_reward: 15 },
  { quest_id: "log_water", title: "Drink & log 500ml water", xp_reward: 15 },
  { quest_id: "log_sleep", title: "Log sleep hours", xp_reward: 10 },
  { quest_id: "do_workout", title: "Log a workout session", xp_reward: 20 },
];

export default function TodayPage() {
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState<string>(() => yyyyMmDd(new Date()));
  const logDate = selectedDate;

  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string>("");

  const [goalSteps, setGoalSteps] = useState<number>(8000);
  const [goalWorkoutsPerWeek, setGoalWorkoutsPerWeek] = useState<number>(3);

  const [steps, setSteps] = useState<number>(0);
  const [sleepHours, setSleepHours] = useState<number>(0);
  const [waterMl, setWaterMl] = useState<number>(0);

  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [mealTitle, setMealTitle] = useState("");
  const [mealCalories, setMealCalories] = useState<string>("");
  const [mealProtein, setMealProtein] = useState<string>("");
  const [meals, setMeals] = useState<any[]>([]);

  const [workoutType, setWorkoutType] = useState("Walk");
  const [workoutMin, setWorkoutMin] = useState<number>(30);
  const [workoutNotes, setWorkoutNotes] = useState("");
  const [workouts, setWorkouts] = useState<any[]>([]);

  const [workoutsThisWeek, setWorkoutsThisWeek] = useState<number>(0);
  const [workoutSessionsThisWeek, setWorkoutSessionsThisWeek] = useState<number>(0);
  const [workoutsExpectedBySelectedDate, setWorkoutsExpectedBySelectedDate] = useState<number>(0);
  const [workoutPaceOnTrack, setWorkoutPaceOnTrack] = useState<boolean>(false);

  const [globalTodaySteps, setGlobalTodaySteps] = useState<number>(0);
  const [globalTodaySleep, setGlobalTodaySleep] = useState<number>(0);
  const [globalTodayWater, setGlobalTodayWater] = useState<number>(0);

  const [globalWeekDays, setGlobalWeekDays] = useState<number>(0);
  const [globalWeekSessions, setGlobalWeekSessions] = useState<number>(0);
  const [globalWeekExpectedByToday, setGlobalWeekExpectedByToday] = useState<number>(0);
  const [globalWeekOnTrack, setGlobalWeekOnTrack] = useState<boolean>(false);

  const [msg, setMsg] = useState<string>("");

  const stepsPct = Math.min(100, Math.round((steps / Math.max(1, goalSteps)) * 100));
  const onTrackSteps = steps >= goalSteps;

  const totalCalories = meals.reduce((sum, m) => sum + (m.calories ?? 0), 0);
  const totalProtein = meals.reduce((sum, m) => sum + (m.protein_g ?? 0), 0);
  const totalWorkoutMin = workouts.reduce((sum, w) => sum + (w.duration_min ?? 0), 0);

  // -----------------------------------
  // Phase 3: Smart Feedback (non-AI)
  // -----------------------------------
  const WATER_TARGET = 2000; // ml
  const SLEEP_MIN = 6; // hours

  const weekDayIndex = dayIndexInWeek(logDate); // 1..7
  const workoutsRemainingThisWeek = Math.max(0, goalWorkoutsPerWeek - workoutsThisWeek);

  const smartInsightsSelected = (() => {
    const items: { tone: "warn" | "ok"; title: string; detail: string }[] = [];

    if (waterMl < WATER_TARGET) {
      const deficit = WATER_TARGET - waterMl;
      items.push({
        tone: "warn",
        title: "You’re underhydrated.",
        detail: `You’re at ${waterMl}ml. Aim for +${deficit}ml to hit ${WATER_TARGET}ml today.`,
      });
    } else {
      items.push({
        tone: "ok",
        title: "Hydration on track.",
        detail: `Nice — ${waterMl}ml logged.`,
      });
    }

    if (sleepHours > 0 && sleepHours < SLEEP_MIN) {
      items.push({
        tone: "warn",
        title: "Sleep debt detected.",
        detail: `You slept ${sleepHours}h. Try to get ${SLEEP_MIN}+ hours tonight.`,
      });
    } else if (sleepHours >= SLEEP_MIN) {
      items.push({
        tone: "ok",
        title: "Sleep looks solid.",
        detail: `${sleepHours}h logged.`,
      });
    } else {
      items.push({
        tone: "warn",
        title: "Sleep not logged yet.",
        detail: "Log sleep to track recovery and trends.",
      });
    }

    if (!workoutPaceOnTrack) {
      const need = Math.max(0, workoutsExpectedBySelectedDate - workoutsThisWeek);
      const remaining = workoutsRemainingThisWeek;
      const bySunday = remaining > 0 ? `You need ${remaining} workout${remaining === 1 ? "" : "s"} before Sunday.` : "You’re set for the week.";
      items.push({
        tone: "warn",
        title: "Workout pace behind.",
        detail: need > 0 ? `You’re behind pace by ${need} day(s). ${bySunday}` : bySunday,
      });
    } else {
      const remaining = workoutsRemainingThisWeek;
      items.push({
        tone: "ok",
        title: "Workout pace on track.",
        detail: remaining > 0
          ? `Great pace. ${remaining} workout${remaining === 1 ? "" : "s"} left before Sunday to hit your weekly goal.`
          : "Weekly goal already hit — legend.",
      });
    }

    return items;
  })();

  const smartInsightsGlobal = (() => {
    const items: { tone: "warn" | "ok"; title: string; detail: string }[] = [];

    if (globalTodayWater < WATER_TARGET) {
      const deficit = WATER_TARGET - globalTodayWater;
      items.push({
        tone: "warn",
        title: "Today: underhydrated.",
        detail: `You’re at ${globalTodayWater}ml today. Aim for +${deficit}ml.`,
      });
    } else {
      items.push({
        tone: "ok",
        title: "Today: hydration on track.",
        detail: `${globalTodayWater}ml today.`,
      });
    }

    if (globalTodaySleep > 0 && globalTodaySleep < SLEEP_MIN) {
      items.push({
        tone: "warn",
        title: "Today: sleep debt detected.",
        detail: `Only ${globalTodaySleep}h today. Try for ${SLEEP_MIN}+.`,
      });
    } else if (globalTodaySleep >= SLEEP_MIN) {
      items.push({
        tone: "ok",
        title: "Today: sleep looks good.",
        detail: `${globalTodaySleep}h today.`,
      });
    } else {
      items.push({
        tone: "warn",
        title: "Today: sleep not logged.",
        detail: "Log sleep to track recovery.",
      });
    }

    if (!globalWeekOnTrack) {
      const remaining = Math.max(0, goalWorkoutsPerWeek - globalWeekDays);
      items.push({
        tone: "warn",
        title: "This week: workouts behind.",
        detail: remaining > 0 ? `You need ${remaining} workout${remaining === 1 ? "" : "s"} before Sunday.` : "You’re set for the week.",
      });
    } else {
      const remaining = Math.max(0, goalWorkoutsPerWeek - globalWeekDays);
      items.push({
        tone: "ok",
        title: "This week: workouts on track.",
        detail: remaining > 0
          ? `${remaining} workout${remaining === 1 ? "" : "s"} left before Sunday to hit your weekly goal.`
          : "Weekly goal already hit.",
      });
    }

    return items;
  })();

  // -----------------------------
  // Gamification helpers
  // -----------------------------
  async function ensureDailyQuests(uId: string, dateIso: string) {
    for (const q of QUESTS) {
      await supabase.from("daily_quests").upsert(
        {
          user_id: uId,
          log_date: dateIso,
          quest_id: q.quest_id,
          title: q.title,
          xp_reward: q.xp_reward,
          completed: false,
        },
        { onConflict: "user_id,log_date,quest_id" }
      );
    }
  }

  async function completeQuest(questId: string) {
    if (!userId) return;

    await ensureDailyQuests(userId, logDate);

    const { data: qRow, error: qErr } = await supabase
      .from("daily_quests")
      .select("completed,xp_reward")
      .eq("user_id", userId)
      .eq("log_date", logDate)
      .eq("quest_id", questId)
      .maybeSingle();

    if (qErr) return;
    if (qRow?.completed) return;

    const { error: updErr } = await supabase
      .from("daily_quests")
      .update({ completed: true })
      .eq("user_id", userId)
      .eq("log_date", logDate)
      .eq("quest_id", questId);

    if (updErr) return;

    const xpReward = qRow?.xp_reward ?? 10;

    const { data: gs } = await supabase
      .from("gamification_state")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const currentXp = gs?.xp ?? 0;
    const currentStreak = gs?.streak ?? 0;
    const lastCompleted = gs?.last_completed_date ?? null;

    let newXp = currentXp + xpReward;

    const { data: allQ } = await supabase
      .from("daily_quests")
      .select("completed")
      .eq("user_id", userId)
      .eq("log_date", logDate);

    const allDone = (allQ ?? []).length > 0 && (allQ ?? []).every((q: any) => q.completed);

    let newStreak = currentStreak;
    let newLast = lastCompleted;

    if (allDone && newLast !== logDate) {
      newXp += 25;
      newStreak = computeStreak(currentStreak, lastCompleted, logDate);
      newLast = logDate;
      setMsg("🎉 All daily quests completed! Streak bonus +25 XP!");
      setTimeout(() => setMsg(""), 1500);
    } else {
      setMsg(`✅ Quest completed: +${xpReward} XP`);
      setTimeout(() => setMsg(""), 1200);
    }

    const newLevel = levelFromXp(newXp).level;

    await supabase.from("gamification_state").upsert(
      {
        user_id: userId,
        xp: newXp,
        level: newLevel,
        streak: newStreak,
        last_completed_date: newLast,
      },
      { onConflict: "user_id" }
    );
  }

  // -----------------------------
  // Data loaders
  // -----------------------------
  async function loadWeeklyWorkoutPaceForSelectedDate(uId: string, workoutsPerWeekTarget: number) {
    const weekStart = weekStartMondayISO(logDate);

    const { data, error } = await supabase
      .from("workout_logs")
      .select("log_date")
      .eq("user_id", uId)
      .gte("log_date", weekStart)
      .lte("log_date", logDate);

    if (error) throw new Error(error.message);

    const sessions = (data ?? []).length;

    const uniqueDays = new Set<string>();
    for (const r of data ?? []) if (r.log_date) uniqueDays.add(r.log_date);
    const days = uniqueDays.size;

    const idx = dayIndexInWeek(logDate);
    const expected = Math.ceil((workoutsPerWeekTarget * idx) / 7);

    setWorkoutSessionsThisWeek(sessions);
    setWorkoutsThisWeek(days);
    setWorkoutsExpectedBySelectedDate(expected);
    setWorkoutPaceOnTrack(days >= expected);
  }

  async function loadDay(uId: string) {
    await ensureDailyQuests(uId, logDate);

    const { data: stepsRow, error: stepsErr } = await supabase
      .from("daily_logs")
      .select("steps")
      .eq("user_id", uId)
      .eq("log_date", logDate)
      .maybeSingle();
    if (stepsErr) throw new Error(stepsErr.message);
    setSteps(stepsRow?.steps ?? 0);

    const { data: sleepRow, error: sleepErr } = await supabase
      .from("sleep_logs")
      .select("hours")
      .eq("user_id", uId)
      .eq("log_date", logDate)
      .maybeSingle();
    if (sleepErr) throw new Error(sleepErr.message);
    setSleepHours(Number(sleepRow?.hours ?? 0));

    const { data: waterRow, error: waterErr } = await supabase
      .from("water_logs")
      .select("ml")
      .eq("user_id", uId)
      .eq("log_date", logDate)
      .maybeSingle();
    if (waterErr) throw new Error(waterErr.message);
    setWaterMl(Number(waterRow?.ml ?? 0));

    const { data: mealsRows, error: mealsErr } = await supabase
      .from("meals")
      .select("*")
      .eq("user_id", uId)
      .eq("log_date", logDate)
      .order("created_at", { ascending: false });
    if (mealsErr) throw new Error(mealsErr.message);
    setMeals(mealsRows ?? []);

    const { data: workoutRows, error: workoutErr } = await supabase
      .from("workout_logs")
      .select("*")
      .eq("user_id", uId)
      .eq("log_date", logDate)
      .order("created_at", { ascending: false });
    if (workoutErr) throw new Error(workoutErr.message);
    setWorkouts(workoutRows ?? []);
  }

  async function loadGlobalToday(uId: string) {
    const todayIso = yyyyMmDd(new Date());
    const weekStart = weekStartMondayISO(todayIso);

    const { data: stepsRow } = await supabase
      .from("daily_logs")
      .select("steps")
      .eq("user_id", uId)
      .eq("log_date", todayIso)
      .maybeSingle();
    setGlobalTodaySteps(stepsRow?.steps ?? 0);

    const { data: sleepRow } = await supabase
      .from("sleep_logs")
      .select("hours")
      .eq("user_id", uId)
      .eq("log_date", todayIso)
      .maybeSingle();
    setGlobalTodaySleep(Number(sleepRow?.hours ?? 0));

    const { data: waterRow } = await supabase
      .from("water_logs")
      .select("ml")
      .eq("user_id", uId)
      .eq("log_date", todayIso)
      .maybeSingle();
    setGlobalTodayWater(waterRow?.ml ?? 0);

    const { data: wRows, error } = await supabase
      .from("workout_logs")
      .select("log_date")
      .eq("user_id", uId)
      .gte("log_date", weekStart)
      .lte("log_date", todayIso);

    if (error) throw new Error(error.message);

    const sessions = (wRows ?? []).length;
    const uniqueDays = new Set<string>();
    for (const r of wRows ?? []) if (r.log_date) uniqueDays.add(r.log_date);

    const days = uniqueDays.size;
    const idx = dayIndexInWeek(todayIso);
    const expected = Math.ceil((goalWorkoutsPerWeek * idx) / 7);

    setGlobalWeekSessions(sessions);
    setGlobalWeekDays(days);
    setGlobalWeekExpectedByToday(expected);
    setGlobalWeekOnTrack(days >= expected);
  }

  // -----------------------------
  // Auth + goals initial load
  // -----------------------------
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return router.push("/login");

      setEmail(data.user.email ?? "");
      setUserId(data.user.id);

      const { data: goalRow, error: goalErr } = await supabase
        .from("goals")
        .select("steps_target, workouts_per_week_target")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (goalErr) return setMsg(goalErr.message);

      if (!goalRow) {
        const { error: insErr } = await supabase.from("goals").insert({
          user_id: data.user.id,
          steps_target: 8000,
          workouts_per_week_target: 3,
        });
        if (insErr) return setMsg(insErr.message);
        setGoalSteps(8000);
        setGoalWorkoutsPerWeek(3);
      } else {
        setGoalSteps(goalRow.steps_target ?? 8000);
        setGoalWorkoutsPerWeek(goalRow.workouts_per_week_target ?? 3);
      }

      const { data: gs } = await supabase
        .from("gamification_state")
        .select("user_id")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (!gs) await supabase.from("gamification_state").insert({ user_id: data.user.id });
    })();
  }, [router]);

  // -----------------------------
  // Reload when selected date changes
  // -----------------------------
  useEffect(() => {
    if (!userId) return;
    (async () => {
      setMsg("");
      try {
        await loadDay(userId);
        await loadWeeklyWorkoutPaceForSelectedDate(userId, goalWorkoutsPerWeek || 3);
        await loadGlobalToday(userId);
      } catch (e: any) {
        setMsg(e?.message ?? "Something went wrong");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, logDate, goalWorkoutsPerWeek]);

  // -----------------------------
  // Save handlers
  // -----------------------------
  async function saveGoalSteps() {
    setMsg("");
    if (!userId) return;

    const { error } = await supabase.from("goals").upsert(
      { user_id: userId, steps_target: Number.isFinite(goalSteps) ? goalSteps : 8000 },
      { onConflict: "user_id" }
    );
    if (error) return setMsg(error.message);

    setMsg("✅ Step goal saved!");
    setTimeout(() => setMsg(""), 1200);
    await loadGlobalToday(userId);
  }

  async function saveGoalWorkoutsPerWeek() {
    setMsg("");
    if (!userId) return;

    const safe = Number.isFinite(goalWorkoutsPerWeek) ? goalWorkoutsPerWeek : 3;

    const { error } = await supabase.from("goals").upsert(
      { user_id: userId, workouts_per_week_target: safe },
      { onConflict: "user_id" }
    );
    if (error) return setMsg(error.message);

    setMsg("✅ Workout goal saved!");
    setTimeout(() => setMsg(""), 1200);

    await loadWeeklyWorkoutPaceForSelectedDate(userId, safe);
    await loadGlobalToday(userId);
  }

  async function saveSteps() {
    setMsg("");
    if (!userId) return;

    const { error } = await supabase.from("daily_logs").upsert(
      { user_id: userId, log_date: logDate, steps, updated_at: new Date().toISOString() },
      { onConflict: "user_id,log_date" }
    );
    if (error) return setMsg(error.message);

    setMsg("✅ Steps saved!");
    setTimeout(() => setMsg(""), 900);

    await completeQuest("log_steps");
    await loadGlobalToday(userId);
  }

  async function saveSleep() {
    setMsg("");
    if (!userId) return;

    const { error } = await supabase.from("sleep_logs").upsert(
      { user_id: userId, log_date: logDate, hours: sleepHours },
      { onConflict: "user_id,log_date" }
    );
    if (error) return setMsg(error.message);

    setMsg("✅ Sleep saved!");
    setTimeout(() => setMsg(""), 900);

    await completeQuest("log_sleep");
    await loadGlobalToday(userId);
  }

  async function saveWater() {
    setMsg("");
    if (!userId) return;

    const { error } = await supabase.from("water_logs").upsert(
      { user_id: userId, log_date: logDate, ml: waterMl },
      { onConflict: "user_id,log_date" }
    );
    if (error) return setMsg(error.message);

    setMsg("✅ Water saved!");
    setTimeout(() => setMsg(""), 900);

    if (waterMl >= 500) await completeQuest("log_water");
    await loadGlobalToday(userId);
  }

  async function addMeal() {
    setMsg("");
    if (!userId) return;
    if (!mealTitle.trim()) return setMsg("Meal name required");

    const caloriesVal = mealCalories.trim() === "" ? null : parseInt(mealCalories, 10);
    const proteinVal = mealProtein.trim() === "" ? null : parseInt(mealProtein, 10);

    const { data, error } = await supabase
      .from("meals")
      .insert({
        user_id: userId,
        log_date: logDate,
        meal_type: mealType,
        title: mealTitle.trim(),
        calories: Number.isFinite(caloriesVal as any) ? caloriesVal : null,
        protein_g: Number.isFinite(proteinVal as any) ? proteinVal : null,
      })
      .select("*")
      .single();

    if (error) return setMsg(error.message);

    setMeals((prev) => [data, ...prev]);
    setMealTitle("");
    setMealCalories("");
    setMealProtein("");

    setMsg("✅ Meal added!");
    setTimeout(() => setMsg(""), 1200);
  }

  async function deleteMeal(id: string) {
    setMsg("");
    const { error } = await supabase.from("meals").delete().eq("id", id);
    if (error) return setMsg(error.message);
    setMeals((prev) => prev.filter((m) => m.id !== id));
  }

  async function addWorkout() {
    setMsg("");
    if (!userId) return;

    const { data, error } = await supabase
      .from("workout_logs")
      .insert({
        user_id: userId,
        log_date: logDate,
        workout_type: workoutType,
        duration_min: workoutMin,
        notes: workoutNotes.trim() || null,
      })
      .select("*")
      .single();

    if (error) return setMsg(error.message);

    setWorkouts((prev) => [data, ...prev]);
    setWorkoutNotes("");

    setMsg("✅ Workout added!");
    setTimeout(() => setMsg(""), 900);

    await completeQuest("do_workout");
    await loadWeeklyWorkoutPaceForSelectedDate(userId, goalWorkoutsPerWeek);
    await loadGlobalToday(userId);
  }

  async function deleteWorkout(id: string) {
    setMsg("");
    const { error } = await supabase.from("workout_logs").delete().eq("id", id);
    if (error) return setMsg(error.message);

    setWorkouts((prev) => prev.filter((w) => w.id !== id));
    await loadWeeklyWorkoutPaceForSelectedDate(userId, goalWorkoutsPerWeek);
    await loadGlobalToday(userId);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const realTodayIso = yyyyMmDd(new Date());
  const quote = getDailyQuote(new Date());

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Daily Check-in</h1>
          <p className="text-sm text-zinc-300/70">
            Editing: <b className="text-zinc-100">{logDate}</b> • {email}
          </p>

          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm backdrop-blur">
            <span className={onTrackSteps ? "text-emerald-300" : "text-amber-300"}>
              {onTrackSteps ? "✅ Steps On Track" : "⚠️ Steps Behind"}
            </span>
            <span className="text-white/60">
              {steps}/{goalSteps}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white backdrop-blur focus:outline-none"
          />

          <button
            onClick={() => setSelectedDate(yyyyMmDd(new Date()))}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 backdrop-blur"
          >
            Today
          </button>


          <button
            onClick={() => router.push("/profile")}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 backdrop-blur"
          >
            Profile
          </button>

          <button
            onClick={logout}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 backdrop-blur"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Motivational Quote Card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-white/70">Today’s push</div>
          <div className="text-xs text-white/50">{realTodayIso}</div>
        </div>
        <p className="mt-2 text-lg italic text-white/90">“{quote}”</p>
      </div>

      {/* ✅ Phase 3 Smart Feedback Panel */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-white/90">🧠 Smart Coach</div>
            <div className="text-xs text-white/50">
              Insight for <b className="text-white/80">{logDate}</b> (no AI — just smart logic)
            </div>
          </div>
          <div className="text-xs text-white/50">
            Week day: <b className="text-white/80">{weekDayIndex}/7</b>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {smartInsightsSelected.map((it, idx) => (
            <div
              key={idx}
              className={`rounded-xl border p-3 ${
                it.tone === "warn"
                  ? "border-amber-500/30 bg-amber-500/10"
                  : "border-emerald-500/25 bg-emerald-500/10"
              }`}
            >
              <div className="text-sm font-medium text-white/90">{it.title}</div>
              <div className="mt-1 text-xs text-white/60">{it.detail}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 text-xs text-white/50">
          Tip: If workouts are behind, the fastest fix is a <b className="text-white/80">20–30 min</b> session today.
        </div>
      </div>

      {/* Global Today View */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-white/90">📍 Where are we at today?</div>
            <div className="text-xs text-white/50">
              Always <b className="text-white/80">{realTodayIso}</b> (even if you’re editing{" "}
              <b className="text-white/80">{logDate}</b>)
            </div>
          </div>

          <div
            className={`rounded-full border px-3 py-1 text-xs ${
              globalTodaySteps >= goalSteps
                ? "border-emerald-500/40 text-emerald-300"
                : "border-amber-500/40 text-amber-300"
            }`}
          >
            {globalTodaySteps >= goalSteps ? "✅ On track" : "⚠️ Behind"}
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="text-xs text-white/50">👣 Steps (today)</div>
            <div className="mt-1 text-lg font-semibold">
              {globalTodaySteps} <span className="text-white/50 text-sm">/ {goalSteps}</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="text-xs text-white/50">😴 Sleep (today)</div>
            <div className="mt-1 text-lg font-semibold">{globalTodaySleep} hrs</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="text-xs text-white/50">💧 Water (today)</div>
            <div className="mt-1 text-lg font-semibold">{globalTodayWater} ml</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="text-xs text-white/50">🏋️ Weekly workout pace</div>
            <div className="mt-1 text-lg font-semibold">
              {globalWeekDays}
              <span className="text-white/50 text-sm"> / {goalWorkoutsPerWeek}</span>
            </div>
            <div className="mt-1 text-xs text-white/50">
              Sessions: <b className="text-white/80">{globalWeekSessions}</b> • Expected:{" "}
              <b className="text-white/80">{globalWeekExpectedByToday}</b>
            </div>
            <div className={`mt-1 text-xs ${globalWeekOnTrack ? "text-emerald-300" : "text-amber-300"}`}>
              {globalWeekOnTrack ? "On track" : "Behind"}
            </div>
          </div>
        </div>

        {/* Optional extra: Global Smart Coach (Today) */}
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {smartInsightsGlobal.map((it, idx) => (
            <div
              key={idx}
              className={`rounded-xl border p-3 ${
                it.tone === "warn"
                  ? "border-amber-500/30 bg-amber-500/10"
                  : "border-emerald-500/25 bg-emerald-500/10"
              }`}
            >
              <div className="text-sm font-medium text-white/90">{it.title}</div>
              <div className="mt-1 text-xs text-white/60">{it.detail}</div>
            </div>
          ))}
        </div>
      </div>


      {msg && (
        <p className={`text-sm ${msg.includes("✅") || msg.includes("🎉") ? "text-emerald-300" : "text-red-300"}`}>
          {msg}
        </p>
      )}
    </div>
  );
}