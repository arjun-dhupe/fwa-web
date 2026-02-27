"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

function yyyyMmDd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function cx(...s: (string | false | null | undefined)[]) {
  return s.filter(Boolean).join(" ");
}

function n(v: any, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function round(v: any) {
  return Math.round(Number(v) || 0);
}

function ageFromDobISO(dobIso?: string | null) {
  if (!dobIso) return null;
  const d = new Date(dobIso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return clamp(age, 10, 90);
}

/**
 * Calorie + protein engine
 * - Requires at least weight + height (and age/dob or default age) to be considered OK
 * - Uses Mifflin-St Jeor + activity factor
 * - Goal adjust: lose (-400), gain (+250), maintain (0)
 * - Protein target: 1.6g/kg
 */
function computeFromProfile(profile: any) {
  const gender = String(profile?.gender ?? "").toLowerCase();
  const heightCm = n(profile?.height_cm ?? profile?.height, 0);
  const weightKg = n(profile?.weight_kg ?? profile?.weight, 0);

  const age =
    n(profile?.age, 0) > 0
      ? clamp(n(profile?.age, 0), 10, 90)
      : ageFromDobISO(profile?.dob ?? profile?.date_of_birth) ?? 28;

  const hasBasics = heightCm > 0 && weightKg > 0 && age > 0;

  const activityLevel = String(profile?.activity_level ?? profile?.activity ?? "moderate").toLowerCase();
  const activityFactor =
    activityLevel.includes("sedentary")
      ? 1.2
      : activityLevel.includes("light")
        ? 1.375
        : activityLevel.includes("very")
          ? 1.725
          : activityLevel.includes("active")
            ? 1.55
            : activityLevel.includes("moderate")
              ? 1.55
              : 1.55;

  let bmr = 0;
  if (hasBasics) {
    const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
    if (gender === "male") bmr = base + 5;
    else if (gender === "female") bmr = base - 161;
    else bmr = base - 78;
  }

  const tdee = bmr > 0 ? bmr * activityFactor : 0;

  const goal = String(profile?.goal ?? profile?.fitness_goal ?? "maintain").toLowerCase();
  const deficit = goal.includes("lose") || goal.includes("cut") ? 400 : 0;
  const surplus = goal.includes("gain") || goal.includes("bulk") ? 250 : 0;

  const targetCalories = tdee > 0 ? clamp(tdee - deficit + surplus, 1200, 4500) : 0;
  const proteinTarget = weightKg > 0 ? round(weightKg * 1.6) : 0;

  // Daily burn target (simple, effective default)
  const burnTarget =
    goal.includes("lose") || goal.includes("cut") ? 450 : goal.includes("gain") || goal.includes("bulk") ? 250 : 350;

  return {
    ok: targetCalories > 0 && proteinTarget > 0,
    targetCalories: round(targetCalories),
    proteinTarget,
    burnTarget,
    weightKg,
    heightCm,
    age,
    goal,
  };
}

// --- Workout MET map
function metForWorkoutType(t: string) {
  const k = (t || "").toLowerCase();
  if (k.includes("walk")) return 3.3;
  if (k.includes("run")) return 9.8;
  if (k.includes("cycle") || k.includes("bike")) return 7.5;
  if (k.includes("swim")) return 8.0;
  if (k.includes("hiit")) return 9.0;
  if (k.includes("strength") || k.includes("weights") || k.includes("gym")) return 6.0;
  if (k.includes("yoga")) return 2.5;
  if (k.includes("sport") || k.includes("football") || k.includes("basketball")) return 8.0;
  return 4.0;
}

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

function mealLabel(t: MealType) {
  if (t === "breakfast") return "Breakfast";
  if (t === "lunch") return "Lunch";
  if (t === "dinner") return "Dinner";
  return "Snack";
}

function toneCard(tone: "emerald" | "amber" | "rose" | "slate") {
  if (tone === "emerald") return "border-emerald-500/30 bg-emerald-500/10";
  if (tone === "amber") return "border-amber-500/30 bg-amber-500/10";
  if (tone === "rose") return "border-rose-500/30 bg-rose-500/10";
  return "border-white/10 bg-white/5";
}

export default function TodayPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string>("");
  const [profile, setProfile] = useState<any>(null);
  const [meals, setMeals] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [msg, setMsg] = useState("");

  // ✅ Date selector (default: today)
  const [selectedDate, setSelectedDate] = useState<string>(() => yyyyMmDd(new Date()));
  const logDate = selectedDate;

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return router.push("/login");
      setUserId(data.user.id);

      // ✅ FIX: your profiles table uses `user_id` as the key (not `id`)
      let p: any = null;

      const { data: p1, error: p1Err } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (!p1Err && p1) {
        p = p1;
      } else {
        // fallback in case schema differs in another env
        const { data: p2 } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
        p = p2 ?? null;
      }

      setProfile(p);
    })();
  }, [router]);

  // Load meals + workouts for selected date
  useEffect(() => {
    if (!userId) return;
    (async () => {
      setMsg("");
      const [{ data: m, error: mErr }, { data: w, error: wErr }] = await Promise.all([
        supabase.from("meals").select("*").eq("user_id", userId).eq("log_date", logDate).order("created_at", { ascending: false }),
        supabase
          .from("workout_logs")
          .select("*")
          .eq("user_id", userId)
          .eq("log_date", logDate)
          .order("created_at", { ascending: false }),
      ]);

      if (mErr) setMsg(mErr.message);
      if (wErr) setMsg(wErr.message);

      setMeals(m ?? []);
      setWorkouts(w ?? []);
    })();
  }, [userId, logDate]);

  const plan = useMemo(() => computeFromProfile(profile), [profile]);

  const totalCalories = useMemo(() => (meals ?? []).reduce((s, m) => s + n(m.calories, 0), 0), [meals]);
  const totalProtein = useMemo(() => (meals ?? []).reduce((s, m) => s + n(m.protein_g, 0), 0), [meals]);

  const weightKgForBurn = plan.weightKg > 0 ? plan.weightKg : 65;

  const workoutCalories = useMemo(() => {
    return (workouts ?? []).reduce((sum, w) => {
      const met = metForWorkoutType(String(w.workout_type ?? ""));
      const minutes = n(w.duration_min ?? w.minutes ?? w.duration, 0);
      const hours = minutes / 60;
      const kcal = met * weightKgForBurn * hours;
      return sum + Math.max(0, round(kcal));
    }, 0);
  }, [workouts, weightKgForBurn]);

  const netCalories = totalCalories - workoutCalories;

  // --------------------
  // Meals grouped blocks
  // --------------------
  const mealsByType = useMemo(() => {
    const out: Record<MealType, any[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    };

    for (const m of meals ?? []) {
      const t = (String(m.meal_type ?? "").toLowerCase() as MealType) || "snack";
      if (out[t]) out[t].push(m);
      else out.snack.push(m);
    }

    for (const k of Object.keys(out) as MealType[]) {
      out[k] = out[k].slice().sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    }

    return out;
  }, [meals]);

  // --------------------
  // Smart feedback: calories
  // --------------------
  const calorieFeedback = useMemo(() => {
    const target = plan.targetCalories;

    if (!plan.ok || !target) {
      return {
        tone: "amber" as const,
        title: "Complete your profile to unlock targets",
        text: "Add weight, height, gender, goal, and activity level in Profile. Then we’ll auto-calculate your calorie + protein plan.",
        sub: "(It takes 30 seconds. Future you will thank you.)",
      };
    }

    const delta = netCalories - target;
    const pct = Math.abs(delta) / target;

    const ateHigh = totalCalories > target * 1.1;
    const ateLow = totalCalories < target * 0.9;
    const burnLow = workoutCalories < plan.burnTarget * 0.9;

    if (pct <= 0.1) {
      return {
        tone: "emerald" as const,
        title: "🔥 You’re on point",
        text: `Net ${round(netCalories)} kcal vs target ${target} kcal — within 10%. That’s real consistency.`,
        sub: "Small wins compound. Keep the streak alive.",
      };
    }

    if (pct <= 0.25) {
      if (delta > 0) {
        const hint = burnLow ? "Try a short 20–30 min session or a post-meal walk." : "Slightly lighter dinner + keep your movement — easy fix.";
        return {
          tone: "amber" as const,
          title: "Almost there 💪",
          text: `You’re about ${round(Math.abs(delta))} kcal over target. ${hint}`,
          sub: ateHigh ? "Your meals are a bit heavy today — tighten the last 10%." : "You’re close — don’t overthink it.",
        };
      }

      const hint = ateLow ? "Add a clean snack: yogurt, eggs, paneer, or a banana + whey." : "You’re moving a lot — make sure you’re fueling recovery.";
      return {
        tone: "amber" as const,
        title: "Close… just nudge it",
        text: `You’re about ${round(Math.abs(delta))} kcal under target. ${hint}`,
        sub: "No hero points for under-eating. Sustainable = results.",
      };
    }

    if (delta > 0) {
      const hint = burnLow
        ? "Today’s movement is whispering while the calories are yelling."
        : "Calories are winning today. You can still salvage with a solid session + lighter dinner.";
      return {
        tone: "rose" as const,
        title: "👀 We need a comeback arc",
        text: `You’re ${round(Math.abs(delta))} kcal over target. ${hint}`,
        sub: "Tomorrow: main character energy, not side-character snacking 😅",
      };
    }

    return {
      tone: "rose" as const,
      title: "🥲 This isn’t a survival show",
      text: `You’re ${round(Math.abs(delta))} kcal under target. Eat properly — your body is not a phone battery.`,
      sub: "Fuel = performance. Performance = results.",
    };
  }, [plan.ok, plan.targetCalories, plan.burnTarget, netCalories, totalCalories, workoutCalories, plan]);

  // --------------------
  // Smart feedback: burn
  // --------------------
  const burnFeedback = useMemo(() => {
    if (!plan.ok || !plan.burnTarget) {
      return {
        tone: "slate" as const,
        title: "Burn target will show here",
        text: "Once Profile is complete, we’ll guide you with a daily burn target too.",
        sub: "(For now, logging workouts still helps.)",
      };
    }

    const target = plan.burnTarget;
    const delta = workoutCalories - target;
    const pct = Math.abs(delta) / Math.max(1, target);

    if (pct <= 0.1) {
      return {
        tone: "emerald" as const,
        title: "🏃 Burn target hit",
        text: `Burned ${round(workoutCalories)} kcal vs target ${target} kcal — within 10%. Beautiful.`,
        sub: "This is what discipline looks like.",
      };
    }

    if (delta < 0) {
      if (pct <= 0.5) {
        return {
          tone: "amber" as const,
          title: "Let’s push a bit more",
          text: `You’re short by ~${round(Math.abs(delta))} kcal. A 20–30 min walk can close most of this.`,
          sub: "Future you is watching 👀",
        };
      }
      return {
        tone: "rose" as const,
        title: "Movement is missing today",
        text: `You’re way under burn target (short by ~${round(Math.abs(delta))} kcal). Even a quick session is better than zero.`,
        sub: "No pressure… but also: yes pressure 😅",
      };
    }

    if (delta <= target * 0.5) {
      return {
        tone: "emerald" as const,
        title: "🔥 Extra burn unlocked",
        text: `You’re above target by ~${round(delta)} kcal. Solid work — that’s a strong day.`,
        sub: "Eat + sleep well so recovery matches the grind.",
      };
    }

    return {
      tone: "rose" as const,
      title: "😳 Okay calm down, superhero",
      text: `You burned ~${round(workoutCalories)} kcal (way above target). Love the energy — but don’t overdo it.`,
      sub: "Hydrate, stretch, and please don’t fight the treadmill tomorrow.",
    };
  }, [plan.ok, plan.burnTarget, workoutCalories]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-white/10 to-white/5 p-6 border border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-2xl font-extrabold tracking-tight text-white">Today</div>
            <div className="text-sm text-white/60">Your daily snapshot — quick, clear, actionable.</div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-white/60">Date</div>
            <input
              type="date"
              value={logDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
            <button
              type="button"
              onClick={() => setSelectedDate(yyyyMmDd(new Date()))}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85 hover:bg-white/10"
            >
              Today
            </button>
          </div>
        </div>

        {msg ? <div className="mt-3 text-sm text-white/70">{msg}</div> : null}
      </div>

      {/* Energy Summary */}
      <div className="rounded-2xl bg-gradient-to-br from-white/10 to-white/5 p-6 border border-white/10">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-xl font-semibold text-white">Energy Summary</div>
            <div className="text-sm text-white/60">Target → Intake → Burn → Net (what really matters)</div>
          </div>
          <div className="text-xs text-white/50">Net = Intake − Burn</div>
        </div>

        <div className="grid md:grid-cols-4 gap-4 mt-4">
          <div className="bg-black/30 rounded-xl p-4 border border-white/10">
            <div className="text-xs text-white/50">🎯 Target</div>
            <div className="text-lg font-bold text-white">{plan.ok ? `${plan.targetCalories} kcal` : "--"}</div>
            <div className="text-xs text-white/40">Protein: {plan.ok ? `${plan.proteinTarget}g` : "--"}</div>
          </div>

          <div className="bg-black/30 rounded-xl p-4 border border-white/10">
            <div className="text-xs text-white/50">🍽 Intake</div>
            <div className="text-lg font-bold text-white">{round(totalCalories)} kcal</div>
            <div className="text-xs text-white/40">Protein: {round(totalProtein)}g</div>
          </div>

          <div className="bg-black/30 rounded-xl p-4 border border-white/10">
            <div className="text-xs text-white/50">🏃 Burn</div>
            <div className="text-lg font-bold text-white">{round(workoutCalories)} kcal</div>
            <div className="text-xs text-white/40">Burn target: {plan.ok ? `${plan.burnTarget} kcal` : "--"}</div>
          </div>

          <div className="bg-black/30 rounded-xl p-4 border border-white/10">
            <div className="text-xs text-white/50">🧾 Net</div>
            <div className="text-lg font-bold text-white">{round(netCalories)} kcal</div>
            <div className="text-xs text-white/40">
              vs target: {plan.ok ? `${round(netCalories - plan.targetCalories)} kcal` : "--"}
            </div>
          </div>
        </div>
      </div>

      {/* Feedback cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className={cx("rounded-2xl p-6 border", toneCard(calorieFeedback.tone))}>
          <div className="text-lg font-semibold text-white">{calorieFeedback.title}</div>
          <div className="text-sm mt-2 text-white/75">{calorieFeedback.text}</div>
          {calorieFeedback.sub ? <div className="text-xs mt-2 text-white/55">{calorieFeedback.sub}</div> : null}
        </div>

        <div className={cx("rounded-2xl p-6 border", toneCard(burnFeedback.tone))}>
          <div className="text-lg font-semibold text-white">{burnFeedback.title}</div>
          <div className="text-sm mt-2 text-white/75">{burnFeedback.text}</div>
          {burnFeedback.sub ? <div className="text-xs mt-2 text-white/55">{burnFeedback.sub}</div> : null}
        </div>
      </div>

      {/* Meals by time of day */}
      <div className="rounded-2xl bg-gradient-to-br from-white/10 to-white/5 p-6 border border-white/10">
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-xl font-semibold text-white">Meals Logged</div>
            <div className="text-sm text-white/60">Grouped by meal type — exactly how humans think.</div>
          </div>
          <div className="text-xs text-white/50">
            {meals.length} item{meals.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-4">
          {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((t) => {
            const list = mealsByType[t] ?? [];
            const sumC = list.reduce((s, m) => s + n(m.calories, 0), 0);
            const sumP = list.reduce((s, m) => s + n(m.protein_g, 0), 0);

            return (
              <div key={t} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-white">{mealLabel(t)}</div>
                    <div className="text-xs text-white/50">
                      {round(sumC)} kcal • {round(sumP)}g protein
                    </div>
                  </div>
                  <div className="text-xs text-white/50">{list.length}</div>
                </div>

                <div className="mt-3 space-y-2">
                  {list.length === 0 ? (
                    <div className="text-xs text-white/50">No items yet.</div>
                  ) : (
                    list.map((m: any) => (
                      <div key={m.id ?? `${m.title}-${m.created_at}`} className="rounded-xl border border-white/10 bg-black/30 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white/90">
                              {String(m.food_name ?? m.title ?? "Meal")}
                            </div>
                            <div className="text-xs text-white/50">
                              {m.grams != null && n(m.grams, 0) > 0 ? `${round(m.grams)}g` : ""}
                              {m.grams != null && n(m.grams, 0) > 0 ? " • " : ""}
                              {m.created_at
                                ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                                : ""}
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <div className="text-xs text-white/60">{round(m.calories)} kcal</div>
                            <div className="text-xs text-white/45">{round(m.protein_g)}g protein</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Workouts list */}
      <div className="rounded-2xl bg-gradient-to-br from-white/10 to-white/5 p-6 border border-white/10">
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-xl font-semibold text-white">Workouts</div>
            <div className="text-sm text-white/60">Estimated burn (MET-based) from your logged sessions.</div>
          </div>
          <div className="text-xs text-white/50">
            {workouts.length} session{workouts.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {workouts.length === 0 ? (
            <div className="text-sm text-white/60">No workouts logged for this day.</div>
          ) : (
            workouts.map((w: any) => {
              const met = metForWorkoutType(String(w.workout_type ?? ""));
              const min = n(w.duration_min ?? w.minutes ?? w.duration, 0);
              const kcal = Math.max(0, round(met * weightKgForBurn * (min / 60)));
              return (
                <div key={w.id ?? `${w.workout_type}-${w.created_at}`} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{String(w.workout_type ?? "Workout")}</div>
                      <div className="text-xs text-white/55">
                        {min} min • est {kcal} kcal
                        {w.created_at ? ` • ${new Date(w.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-white/60">MET {met}</div>
                      <div className="text-xs text-white/45">wt {round(weightKgForBurn)}kg</div>
                    </div>
                  </div>

                  {w.notes ? <div className="mt-2 text-xs text-white/60">{String(w.notes)}</div> : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="text-center text-xs text-white/45">You don’t need perfect days. You need consistent days.</div>
    </div>
  );
}