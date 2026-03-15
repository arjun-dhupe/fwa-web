"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

/* ─── helpers ────────────────────────────────────────── */
function yyyyMmDd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function cx(...s: (string | false | null | undefined)[]) { return s.filter(Boolean).join(" "); }
function n(v: any, fallback = 0) { const x = Number(v); return Number.isFinite(x) ? x : fallback; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function round(v: any) { return Math.round(Number(v) || 0); }

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

/* ─── random pick helper ─────────────────────────────── */
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

/* ─── feedback copy banks ────────────────────────────── */
const COPY = {
  /* Calorie: on track */
  calOnPoint: {
    titles: ["🔥 Dialled in.", "✅ Clean day.", "📐 Textbook.", "🎯 Bang on target.", "💯 That's the one.", "🏆 You showed up."],
    texts: [
      "Net calories within 10% of target. That's not luck — that's discipline.",
      "The numbers don't lie. Today was a good day.",
      "Within 10% of target. Some people call it luck. You call it Tuesday.",
      "You tracked, you hit, you win. Simple game when you play it right.",
      "Exactly where you should be. This is what consistency looks like up close.",
      "Chef's kiss. The macros, the math, the mindset — all showing up.",
    ],
    subs: [
      "Small wins compound. Keep the streak alive.",
      "Do it again tomorrow. And the day after. And the day after that.",
      "The boring secret: do this enough times and the results are inevitable.",
      "Most people quit before this part. You didn't.",
      "Progress isn't loud. It just shows up like this, quietly, every day.",
    ],
  },

  /* Calorie: slightly over */
  calSlightlyOver: {
    titles: ["Almost there 💪", "So close it hurts.", "One snack away from perfect.", "Minor overshoot.", "9/10 — round it up.", "Basically there."],
    texts: [
      (d: number, hint: string) => `You're about ${d} kcal over target. ${hint}`,
      (d: number, hint: string) => `${d} kcal over. ${hint} The day isn't over until midnight.`,
      (d: number, hint: string) => `Slight overshoot — ${d} kcal. ${hint}`,
      (d: number, hint: string) => `${d} kcal over the line. ${hint} Close enough to course-correct.`,
    ],
    hints: {
      burnLow: [
        "A 20-min walk will sort most of it.",
        "Quick stroll after dinner. Easy fix.",
        "Your legs work. Use them for 20 minutes.",
        "Post-meal walk: free calories, good vibes.",
      ],
      burnOk: [
        "Lighter dinner and you're golden.",
        "Skip the late-night kitchen raid.",
        "You're close — don't ruin it with a midnight snack.",
        "The fridge will still be there tomorrow.",
      ],
    },
    subs: [
      "You're close — don't overthink it.",
      "Near misses are still near. Fix it tomorrow.",
      "This is not a failure. This is data.",
      "98% of the time, 'almost' is good enough. This is one of those times.",
    ],
  },

  /* Calorie: slightly under */
  calSlightlyUnder: {
    titles: ["Close — nudge it up.", "Almost fuelled properly.", "Feed the machine a bit more.", "One snack short.", "So nearly perfect."],
    texts: [
      (d: number) => `About ${d} kcal under target. A clean snack closes this — yogurt, eggs, paneer, banana + whey.`,
      (d: number) => `${d} kcal under. Your muscles are politely asking for more food.`,
      (d: number) => `You're ${d} kcal short. Add something real — not a handful of air.`,
      (d: number) => `${d} kcal gap. A good snack now beats regretting it at 11pm.`,
    ],
    subs: [
      "No hero points for under-eating. Sustainable = results.",
      "Eating enough is part of the plan, not cheating on it.",
      "Your body isn't a phone battery. It doesn't run better at 10%.",
      "Under-eating = slower recovery = worse tomorrow. Eat the food.",
      "Starvation mode is real. Snack is the solution.",
    ],
  },

  /* Calorie: big over */
  calBigOver: {
    titles: [
      "👀 We need a comeback arc.",
      "Calories had a great day. You... less so.",
      "😬 Today went rogue.",
      "The numbers are giving main villain energy.",
      "🍕 Bold choices were made.",
      "Okay. We acknowledge. We move on.",
      "Today happened. Tomorrow doesn't have to.",
    ],
    texts: [
      (d: number, burnLow: boolean) => `${d} kcal over target. ${burnLow ? "And movement is whispering while the calories are yelling." : "A solid session + lighter dinner can still salvage something."}`,
      (d: number, burnLow: boolean) => `You're ${d} kcal over. ${burnLow ? "The couch isn't helping your case right now." : "At least burn is covering some of it — keep moving."}`,
      (d: number, burnLow: boolean) => `${d} kcal over. ${burnLow ? "Low movement + high intake = a conversation you don't want to have with your goals." : "You burned well — the intake is the issue. Tomorrow, tighten the diet."}`,
      (d: number) => `${d} kcal over and counting. The food choices today were... ambitious.`,
    ],
    subs: [
      "Tomorrow: main character energy, not side-character snacking 😅",
      "One bad day doesn't erase the good ones. But let's not make it a habit.",
      "The goal isn't perfection. The goal is not doing this three days in a row.",
      "Reset. Refocus. Tomorrow is a blank slate.",
      "You didn't fail the diet. You just had a plot twist.",
    ],
  },

  /* Calorie: big under */
  calBigUnder: {
    titles: [
      "🥲 This isn't a survival show.",
      "Your body called. It wants food.",
      "Extreme calorie deficit detected.",
      "Plot twist: eating IS the plan.",
      "The fast was not requested.",
      "Your metabolism is filing a complaint.",
    ],
    texts: [
      (d: number) => `${d} kcal under target. Your body is not a phone battery — it doesn't run better nearly empty.`,
      (d: number) => `You're ${d} kcal short. Fuel = performance. Performance = results. Eat the food.`,
      (d: number) => `${d} kcal gap. Chronic under-eating tanks energy, slows metabolism, and kills muscle. None of those are goals.`,
      (d: number) => `${d} kcal below target. This is not a flex. This is a problem. Eat something real.`,
    ],
    subs: [
      "Fuel = performance. Performance = results.",
      "Your goal is progress, not punishment.",
      "Eating enough is not optional. It's literally the plan.",
      "You can't outrun under-fuelling. At some point, the body just stops.",
    ],
  },

  /* Calorie: no profile */
  calNoProfile: {
    titles: ["Profile incomplete", "We're flying blind.", "Missing the map.", "Set your targets first."],
    texts: [
      "Add weight, height, goal, and activity level in Profile to unlock your calorie target.",
      "No profile = no targets = no feedback. Takes 30 seconds to fix.",
      "We need your numbers before we can tell you anything useful. Go fill in Profile.",
    ],
    subs: ["Seriously, 30 seconds. Future you will appreciate it.", "The data is powerless without a target to compare to."],
  },

  /* Burn: on target */
  burnOnPoint: {
    titles: ["🏃 Burn target hit.", "Movement unlocked.", "Legs = deployed.", "Sweat = confirmed.", "🔥 Full send.", "Active day certified."],
    texts: [
      (v: number, t: number) => `Burned ${v} kcal vs target ${t} kcal — within 10%. Clean.`,
      (v: number, t: number) => `${v} kcal burned against a ${t} kcal target. That's the standard.`,
      (v: number, t: number) => `${v} kcal. Target was ${t}. You nailed it. Nothing more to say.`,
      (v: number, t: number) => `${v} vs ${t} kcal target. Dead on. Someone's been consistent.`,
    ],
    subs: [
      "This is what discipline looks like.",
      "Consistency > intensity. Today was both.",
      "Boring to watch, impressive to achieve.",
      "Another day, another box ticked. That's how it works.",
    ],
  },

  /* Burn: slightly under */
  burnSlightlyUnder: {
    titles: ["Let's push a bit.", "Almost there — legs are right there.", "So close on burn.", "A little more movement.", "One walk away.", "Minor burn gap."],
    texts: [
      (d: number) => `Short by ~${d} kcal. A 20–30 min walk closes most of this.`,
      (d: number) => `~${d} kcal gap. Your legs didn't get the memo that the day isn't over.`,
      (d: number) => `${d} kcal short. A quick loop around the block is literally all it takes.`,
      (d: number) => `${d} kcal under burn target. Park further away. Take the stairs. Move the needle.`,
    ],
    subs: [
      "Future you is watching 👀",
      "You've done harder things. This is just 20 minutes.",
      "Movement doesn't need to be a workout. Just move.",
      "The gap is small. Close it before midnight.",
    ],
  },

  /* Burn: big miss */
  burnBigMiss: {
    titles: [
      "Movement is on leave today.",
      "The couch won today's battle.",
      "🪑 Sedentary mode: activated.",
      "Burn? What burn?",
      "Your body is waiting for you.",
      "Activity tracker is very disappointed.",
    ],
    texts: [
      (d: number) => `Way under burn target — short by ~${d} kcal. Even 15 minutes beats zero.`,
      (d: number) => `${d} kcal below burn target. Your metabolism would like to speak to a manager.`,
      (d: number) => `${d} kcal gap. The workout doesn't have to be great. It just has to happen.`,
      (d: number) => `Short by ${d} kcal. The gym misses you. Or the park. Or the stairs. Or literally anywhere with gravity.`,
    ],
    subs: [
      "No pressure… but also: yes pressure 😅",
      "Just move. That's it. That's the whole instruction.",
      "Every minute of movement beats every minute of thinking about moving.",
      "Tomorrow's energy is built today. This is the boring math of fitness.",
    ],
  },

  /* Burn: extra */
  burnExtra: {
    titles: ["🔥 Extra burn unlocked.", "Overachiever mode: on.", "Above and beyond.", "Bonus round completed.", "Went above target — respect.", "Crushed the target."],
    texts: [
      (d: number) => `Above target by ~${d} kcal. Solid work — that's a strong day.`,
      (d: number) => `${d} kcal over burn target. You didn't just show up — you showed out.`,
      (d: number) => `~${d} kcal above target. This is what extra effort looks like on paper.`,
    ],
    subs: [
      "Eat and sleep well — recovery has to match the grind.",
      "High output days need high input nights. Don't skip the food.",
      "Great day. Don't punish it with bad sleep.",
      "The work was done. Now recover like you mean it.",
    ],
  },

  /* Burn: way over */
  burnWayOver: {
    titles: ["😳 Easy, superhero.", "Okay cool down.", "Too much of a good thing.", "Your body is sending signals.", "Certified overtrainer moment.", "Plot twist: rest is also training."],
    texts: [
      (v: number) => `Burned ~${v} kcal — way above target. Love the energy, but the body has limits.`,
      (v: number) => `${v} kcal burned. Impressive and slightly concerning. Hydrate, eat, sleep.`,
      (v: number) => `~${v} kcal. You went full send. Recovery isn't optional after days like this.`,
    ],
    subs: [
      "Hydrate, stretch, and please don't fight the treadmill tomorrow.",
      "Rest is not weakness. Rest is how you show up again tomorrow.",
      "You trained well. Now recover better.",
    ],
  },

  /* Burn: no profile */
  burnNoProfile: {
    titles: ["Burn context unavailable.", "No target to compare yet.", "Waiting on your profile."],
    texts: [
      "Complete your profile to unlock a daily burn target — then this card actually helps you.",
      "No profile data means no burn target. Logging workouts still helps though.",
    ],
    subs: ["For now, logging workouts still adds to your record.", null],
  },
};

/* ─── profile computation (unchanged) ───────────────── */
function readProfileTarget(profile: any, keys: string[]) {
  for (const key of keys) {
    const value = n(profile?.[key], 0);
    if (value > 0) return value;
  }
  return 0;
}

function readBestSavedCalorieTarget(profile: any) {
  const direct = readProfileTarget(profile, [
    "target_calories", "target_calorie_intake", "daily_calorie_intake",
    "daily_target_calories", "calorie_target", "daily_calorie_target",
    "recommended_calories", "recommended_calorie_intake", "target_kcal",
    "calories_target", "calorie_intake_target",
  ]);
  if (direct > 0) return direct;
  let best = 0;
  for (const [rawKey, rawValue] of Object.entries(profile ?? {})) {
    const key = String(rawKey).toLowerCase();
    const value = n(rawValue, 0);
    const looksLikeCalories = key.includes("calor") || key.includes("kcal");
    const looksLikeTarget = key.includes("target") || key.includes("intake") || key.includes("recommended") || key.includes("goal");
    if (looksLikeCalories && looksLikeTarget && value >= 1000 && value <= 5000) best = Math.max(best, value);
  }
  return best;
}

function computeFromProfile(profile: any) {
  const gender = String(profile?.gender ?? "").toLowerCase();
  const heightCm = n(profile?.height_cm ?? profile?.height, 0);
  const weightKg = n(profile?.weight_kg ?? profile?.weight, 0);
  const age = n(profile?.age, 0) > 0
    ? clamp(n(profile?.age, 0), 10, 90)
    : ageFromDobISO(profile?.dob ?? profile?.date_of_birth) ?? 28;

  const hasBasics = heightCm > 0 && weightKg > 0 && age > 0;
  const activityLevel = String(profile?.activity_level ?? profile?.activity ?? "moderate").toLowerCase();
  const activityFactor = activityLevel.includes("sedentary") ? 1.2
    : activityLevel.includes("light") ? 1.375
    : activityLevel.includes("very") ? 1.725 : 1.55;

  let bmr = 0;
  if (hasBasics) {
    const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
    bmr = gender === "male" ? base + 5 : gender === "female" ? base - 161 : base - 78;
  }
  const tdee = bmr > 0 ? bmr * activityFactor : 0;
  const goal = String(profile?.goal ?? profile?.fitness_goal ?? profile?.primary_goal ?? profile?.goal_type ?? "maintain").toLowerCase();
  const isFatLoss = goal.includes("fat loss") || goal.includes("lose") || goal.includes("cut") || goal.includes("weight loss");
  const isMuscleGain = goal.includes("muscle gain") || goal.includes("gain") || goal.includes("bulk") || goal.includes("hypertrophy");
  const isEndurance = goal.includes("endurance") || goal.includes("stamina") || goal.includes("performance");
  const deficit = isFatLoss ? 400 : 0;
  const surplus = isMuscleGain ? 250 : isEndurance ? 150 : 0;

  const computedTargetCalories = tdee > 0 ? clamp(tdee - deficit + surplus, 1200, 4500) : 0;
  const computedProteinTarget = weightKg > 0 ? round(weightKg * 1.6) : 0;
  const computedBurnTarget = isFatLoss ? 450 : isMuscleGain ? 250 : isEndurance ? 400 : 350;

  const savedTargetCalories = readBestSavedCalorieTarget(profile);
  const savedProteinTarget = readProfileTarget(profile, ["target_protein_g", "target_protein", "daily_protein_target", "protein_target", "recommended_protein", "recommended_protein_g"]);
  const savedBurnTarget = readProfileTarget(profile, ["target_burn_calories", "target_burn", "daily_burn_target", "burn_target", "calorie_burn_target", "recommended_burn_calories"]);

  const targetCalories = savedTargetCalories > 0 ? savedTargetCalories : computedTargetCalories;
  const proteinTarget = savedProteinTarget > 0 ? savedProteinTarget : computedProteinTarget;
  const burnTarget = savedBurnTarget > 0 ? savedBurnTarget : computedBurnTarget;

  return {
    ok: (savedTargetCalories > 0 || targetCalories > 0) && (savedProteinTarget > 0 || proteinTarget > 0),
    targetCalories: round(targetCalories),
    proteinTarget,
    burnTarget,
    weightKg, heightCm, age, goal,
  };
}

/* ─── types & styling ────────────────────────────────── */
type MealType = "breakfast" | "lunch" | "dinner" | "snack";

function mealLabel(t: MealType) {
  return t === "breakfast" ? "Breakfast" : t === "lunch" ? "Lunch" : t === "dinner" ? "Dinner" : "Snack";
}

function mealColors(t: MealType) {
  if (t === "breakfast") return { border: "border-l-amber-400/60",  bg: "bg-amber-400/[0.03]",  dot: "bg-amber-400",  empty: "border-amber-400/20"  };
  if (t === "lunch")     return { border: "border-l-sky-400/60",    bg: "bg-sky-400/[0.03]",    dot: "bg-sky-400",    empty: "border-sky-400/20"    };
  if (t === "dinner")    return { border: "border-l-violet-400/60", bg: "bg-violet-400/[0.03]", dot: "bg-violet-400", empty: "border-violet-400/20" };
  return                        { border: "border-l-rose-400/60",   bg: "bg-rose-400/[0.03]",   dot: "bg-rose-400",   empty: "border-rose-400/20"   };
}

function toneCard(tone: "emerald" | "amber" | "rose" | "slate") {
  if (tone === "emerald") return "border-l-4 border-l-emerald-400 border-t border-r border-b border-white/8 bg-emerald-500/[0.06]";
  if (tone === "amber")   return "border-l-4 border-l-amber-400  border-t border-r border-b border-white/8 bg-amber-500/[0.06]";
  if (tone === "rose")    return "border-l-4 border-l-rose-400   border-t border-r border-b border-white/8 bg-rose-500/[0.06]";
  return "border border-white/8 bg-white/[0.03]";
}

/* ─── Main page ──────────────────────────────────────── */
export default function TodayPage() {
  const router = useRouter();

  const [userId,   setUserId]   = useState<string>("");
  const [profile,  setProfile]  = useState<any>(null);
  const [meals,    setMeals]    = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [msg,      setMsg]      = useState("");
  const [loggedBurnToday, setLoggedBurnToday] = useState<number>(0);
  const [waterMl,  setWaterMl]  = useState<number>(0);
  const [selectedDate, setSelectedDate] = useState<string>(() => yyyyMmDd(new Date()));
  const logDate = selectedDate;

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return router.push("/login");
      setUserId(data.user.id);
      let p: any = null;
      const { data: p1, error: p1Err } = await supabase.from("profiles").select("*").eq("user_id", data.user.id).maybeSingle();
      if (!p1Err && p1) p = p1;
      else { const { data: p2 } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle(); p = p2 ?? null; }
      setProfile(p);
    })();
  }, [router]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setMsg("");
      const [mealsRes, workoutsRes, burnRes, waterRes] = await Promise.all([
        supabase.from("meals").select("*").eq("user_id", userId).eq("log_date", logDate).order("created_at", { ascending: true }),
        supabase.from("workout_logs").select("*").eq("user_id", userId).eq("log_date", logDate).order("created_at", { ascending: false }),
        supabase.from("workout_logs").select("calories_burned").eq("user_id", userId).eq("log_date", logDate),
        supabase.from("water_logs").select("ml").eq("user_id", userId).eq("log_date", logDate),
      ]);
      if (mealsRes.error)    setMsg(mealsRes.error.message);
      if (workoutsRes.error) setMsg(workoutsRes.error.message);
      setMeals(mealsRes.data ?? []);
      setWorkouts(workoutsRes.data ?? []);
      setLoggedBurnToday(round((burnRes.data ?? []).reduce((s, r: any) => s + n(r?.calories_burned, 0), 0)));
      setWaterMl(round((waterRes.data ?? []).reduce((s, r: any) => s + n(r?.ml, 0), 0)));
    })();
  }, [userId, logDate]);

  const plan            = useMemo(() => computeFromProfile(profile), [profile]);
  const totalCalories   = useMemo(() => meals.reduce((s, m) => s + n(m.calories, 0), 0), [meals]);
  const totalProtein    = useMemo(() => meals.reduce((s, m) => s + n(m.protein_g, 0), 0), [meals]);
  const workoutCalories = loggedBurnToday;
  const netCalories     = totalCalories - workoutCalories;
  const remainingCalories = plan.ok ? plan.targetCalories - round(totalCalories) : null;
  const remainingProtein  = plan.ok ? Math.max(0, plan.proteinTarget - round(totalProtein)) : null;

  const mealsByType = useMemo(() => {
    const out: Record<MealType, any[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    for (const m of meals) { const t = (String(m.meal_type ?? "").toLowerCase() as MealType) || "snack"; if (out[t]) out[t].push(m); else out.snack.push(m); }
    return out;
  }, [meals]);

  /* ── Calorie feedback — randomly picks from banks ── */
  const calorieFeedback = useMemo(() => {
    if (!plan.ok || !plan.targetCalories) {
      return { tone: "amber" as const, title: pick(COPY.calNoProfile.titles), text: pick(COPY.calNoProfile.texts), sub: pick(COPY.calNoProfile.subs) };
    }
    const delta = netCalories - plan.targetCalories;
    const pct   = Math.abs(delta) / plan.targetCalories;
    const burnLow = workoutCalories < plan.burnTarget * 0.9;

    if (pct <= 0.1) return {
      tone: "emerald" as const,
      title: pick(COPY.calOnPoint.titles),
      text: pick(COPY.calOnPoint.texts),
      sub: pick(COPY.calOnPoint.subs),
    };

    if (pct <= 0.25 && delta > 0) {
      const hint = pick(burnLow ? COPY.calSlightlyOver.hints.burnLow : COPY.calSlightlyOver.hints.burnOk);
      const textFn = pick(COPY.calSlightlyOver.texts);
      return { tone: "amber" as const, title: pick(COPY.calSlightlyOver.titles), text: typeof textFn === "function" ? textFn(round(Math.abs(delta)), hint) : textFn, sub: pick(COPY.calSlightlyOver.subs) };
    }

    if (pct <= 0.25 && delta < 0) {
      const textFn = pick(COPY.calSlightlyUnder.texts);
      return { tone: "amber" as const, title: pick(COPY.calSlightlyUnder.titles), text: typeof textFn === "function" ? textFn(round(Math.abs(delta))) : textFn, sub: pick(COPY.calSlightlyUnder.subs) };
    }

    if (delta > 0) {
      const textFn = pick(COPY.calBigOver.texts);
      return { tone: "rose" as const, title: pick(COPY.calBigOver.titles), text: typeof textFn === "function" ? textFn(round(Math.abs(delta)), burnLow) : textFn, sub: pick(COPY.calBigOver.subs) };
    }

    const textFn = pick(COPY.calBigUnder.texts);
    return { tone: "rose" as const, title: pick(COPY.calBigUnder.titles), text: typeof textFn === "function" ? textFn(round(Math.abs(delta))) : textFn, sub: pick(COPY.calBigUnder.subs) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.ok, plan.targetCalories, plan.burnTarget, netCalories, workoutCalories]);

  /* ── Burn feedback — randomly picks from banks ── */
  const burnFeedback = useMemo(() => {
    if (!plan.ok || !plan.burnTarget) {
      return { tone: "slate" as const, title: pick(COPY.burnNoProfile.titles), text: pick(COPY.burnNoProfile.texts), sub: COPY.burnNoProfile.subs[0] };
    }
    const target = plan.burnTarget;
    const delta  = workoutCalories - target;
    const pct    = Math.abs(delta) / Math.max(1, target);

    if (pct <= 0.1) {
      const textFn = pick(COPY.burnOnPoint.texts);
      return { tone: "emerald" as const, title: pick(COPY.burnOnPoint.titles), text: typeof textFn === "function" ? textFn(round(workoutCalories), target) : textFn, sub: pick(COPY.burnOnPoint.subs) };
    }
    if (delta < 0 && pct <= 0.5) {
      const textFn = pick(COPY.burnSlightlyUnder.texts);
      return { tone: "amber" as const, title: pick(COPY.burnSlightlyUnder.titles), text: typeof textFn === "function" ? textFn(round(Math.abs(delta))) : textFn, sub: pick(COPY.burnSlightlyUnder.subs) };
    }
    if (delta < 0) {
      const textFn = pick(COPY.burnBigMiss.texts);
      return { tone: "rose" as const, title: pick(COPY.burnBigMiss.titles), text: typeof textFn === "function" ? textFn(round(Math.abs(delta))) : textFn, sub: pick(COPY.burnBigMiss.subs) };
    }
    if (delta <= target * 0.5) {
      const textFn = pick(COPY.burnExtra.texts);
      return { tone: "emerald" as const, title: pick(COPY.burnExtra.titles), text: typeof textFn === "function" ? textFn(round(delta)) : textFn, sub: pick(COPY.burnExtra.subs) };
    }
    const textFn = pick(COPY.burnWayOver.texts);
    return { tone: "rose" as const, title: pick(COPY.burnWayOver.titles), text: typeof textFn === "function" ? textFn(round(workoutCalories)) : textFn, sub: pick(COPY.burnWayOver.subs) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.ok, plan.burnTarget, workoutCalories]);

  const isToday = logDate === yyyyMmDd(new Date());

  const emptyMessages: Record<MealType, string> = {
    breakfast: "No breakfast yet — a good morning meal sets the tone for the whole day.",
    lunch:     "Lunch not logged — midday fuel keeps energy steady through the afternoon.",
    dinner:    "Dinner not logged yet — finish the day strong.",
    snack:     "No snacks today — that's either great discipline or a forgotten log.",
  };

  return (
    <>
      <style>{`
        .card-l1 { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); }
        .card-l2 { background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.07); }
        .card-l3 { background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.06); }
        .meal-empty-dashed { border-style: dashed !important; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .fade-up  { animation: fadeUp 0.35s ease both; }
        .delay-1  { animation-delay: 0.05s; }
        .delay-2  { animation-delay: 0.10s; }
        .delay-3  { animation-delay: 0.15s; }
        .delay-4  { animation-delay: 0.20s; }
      `}</style>

      <div className="space-y-5">

        {/* ── HEADER ─────────────────────────────────── */}
        <div className="fade-up card-l1 rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">Today</h1>
              <p className="text-sm text-white/50">Your daily record — what went in, what went out.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { const d = new Date(logDate + "T00:00:00"); d.setDate(d.getDate() - 1); setSelectedDate(yyyyMmDd(d)); }}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-white/60 hover:bg-white/10 hover:text-white transition"
              >‹</button>
              <input
                type="date" value={logDate} onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              />
              <button
                onClick={() => { const d = new Date(logDate + "T00:00:00"); d.setDate(d.getDate() + 1); setSelectedDate(yyyyMmDd(d)); }}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-white/60 hover:bg-white/10 hover:text-white transition"
              >›</button>
              {!isToday && (
                <button onClick={() => setSelectedDate(yyyyMmDd(new Date()))}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 hover:bg-white/10 transition">
                  Today
                </button>
              )}
            </div>
          </div>
          {msg && <p className="mt-3 text-sm text-red-300">{msg}</p>}
        </div>

        {/* ── ENERGY SUMMARY ─────────────────────────── */}
        <div className="fade-up delay-1 card-l1 rounded-2xl p-5">
          <div className="mb-4 flex items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-white">Energy summary</h2>
              <p className="text-xs text-white/45">Net = intake − burn</p>
            </div>
          </div>

          {/* 4 boxes: Consumed | Target | Burned | Net */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">

            {/* Consumed — with remaining as subtext */}
            <div className="card-l2 rounded-xl p-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Consumed</div>
              <div className="mt-1.5 text-2xl font-bold text-white">{round(totalCalories)}</div>
              <div className="text-xs text-white/40">kcal eaten</div>
              {remainingCalories !== null && (
                <div className={cx(
                  "mt-1.5 text-[11px] font-medium",
                  remainingCalories <= 0 ? "text-emerald-400" : "text-sky-400/80"
                )}>
                  {remainingCalories <= 0
                    ? `${Math.abs(remainingCalories)} kcal over`
                    : `${remainingCalories} kcal left`}
                </div>
              )}
            </div>

            {/* Target */}
            <div className="card-l2 rounded-xl p-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Target</div>
              <div className="mt-1.5 text-2xl font-bold text-white">
                {plan.ok ? plan.targetCalories : "--"}
              </div>
              <div className="text-xs text-white/40">
                {plan.ok ? "kcal goal" : "set in profile"}
              </div>
              {plan.ok && (
                <div className="mt-1.5 text-[11px] text-white/30">
                  Protein {plan.proteinTarget}g
                </div>
              )}
            </div>

            {/* Burned */}
            <div className="card-l2 rounded-xl p-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Burned</div>
              <div className="mt-1.5 text-2xl font-bold text-white">{round(workoutCalories)}</div>
              <div className="text-xs text-white/40">kcal burned</div>
              {plan.ok && (
                <div className="mt-1.5 text-[11px] text-white/30">
                  target {plan.burnTarget} kcal
                </div>
              )}
            </div>

            {/* Net */}
            <div className="card-l2 rounded-xl p-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Net</div>
              <div className="mt-1.5 text-2xl font-bold text-white">{round(netCalories)}</div>
              <div className="text-xs text-white/40">kcal net</div>
              {plan.ok && (
                <div className={cx(
                  "mt-1.5 text-[11px] font-medium",
                  round(netCalories - plan.targetCalories) <= 0 ? "text-emerald-400/80" : "text-rose-400/80"
                )}>
                  {round(netCalories - plan.targetCalories) >= 0 ? "+" : ""}
                  {round(netCalories - plan.targetCalories)} vs target
                </div>
              )}
            </div>
          </div>

          {/* Protein + water — compact two-column row */}
          <div className="mt-3 grid grid-cols-2 gap-3">

            {/* Protein — small, like original */}
            <div className="card-l2 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Protein</div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-lg font-bold text-white">{round(totalProtein)}g</span>
                    {plan.ok && <span className="text-xs text-white/40">/ {plan.proteinTarget}g</span>}
                  </div>
                </div>
                {remainingProtein !== null && (
                  <span className={cx(
                    "text-xs font-semibold",
                    remainingProtein === 0 ? "text-emerald-400" : "text-white/40"
                  )}>
                    {remainingProtein === 0 ? "✓ hit" : `${remainingProtein}g left`}
                  </span>
                )}
              </div>
            </div>

            {/* Water — compact */}
            <div className="card-l2 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35">💧 Water</div>
                  <div className="mt-1 text-lg font-bold text-white">
                    {waterMl >= 1000 ? `${(waterMl / 1000).toFixed(1)} L` : `${waterMl} ml`}
                  </div>
                </div>
                {/* 5 tiny fill bars */}
                <div className="flex gap-0.5">
                  {[500, 1000, 1500, 2000, 2500].map((mark) => (
                    <div
                      key={mark}
                      className={cx("h-4 w-1.5 rounded-sm transition-all", waterMl >= mark ? "bg-sky-400" : "bg-white/10")}
                    />
                  ))}
                </div>
              </div>
              {waterMl === 0 && <div className="mt-1 text-[10px] text-white/25">Log water from the Log page</div>}
            </div>
          </div>
        </div>

        {/* ── FEEDBACK CARDS ─────────────────────────── */}
        <div className="fade-up delay-2 grid gap-4 md:grid-cols-2">
          <div className={cx("rounded-2xl p-5", toneCard(calorieFeedback.tone))}>
            <div className="text-base font-semibold text-white">{calorieFeedback.title}</div>
            <div className="mt-2 text-sm text-white/70">{calorieFeedback.text}</div>
            {calorieFeedback.sub && <div className="mt-2 text-xs text-white/50">{calorieFeedback.sub}</div>}
          </div>
          <div className={cx("rounded-2xl p-5", toneCard(burnFeedback.tone))}>
            <div className="text-base font-semibold text-white">{burnFeedback.title}</div>
            <div className="mt-2 text-sm text-white/70">{burnFeedback.text}</div>
            {burnFeedback.sub && <div className="mt-2 text-xs text-white/50">{burnFeedback.sub}</div>}
          </div>
        </div>

        {/* ── MEALS ──────────────────────────────────── */}
        <div className="fade-up delay-3 card-l1 rounded-2xl p-5">
          <div className="mb-4 flex items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-white">Meals logged</h2>
              <p className="text-xs text-white/45">
                {meals.length} item{meals.length === 1 ? "" : "s"} · {round(totalCalories)} kcal · {round(totalProtein)}g protein
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((t) => {
              const list    = mealsByType[t] ?? [];
              const colors  = mealColors(t);
              const sumC    = list.reduce((s, m) => s + n(m.calories, 0), 0);
              const sumP    = list.reduce((s, m) => s + n(m.protein_g, 0), 0);
              const hasItems = list.length > 0;

              return (
                <div
                  key={t}
                  className={cx(
                    "rounded-2xl border-l-4 border p-4",
                    colors.border, colors.bg,
                    "border-white/7",
                    !hasItems && "meal-empty-dashed"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={cx("inline-block h-2 w-2 rounded-full", colors.dot)} />
                      <span className="text-sm font-bold text-white">{mealLabel(t)}</span>
                    </div>
                    {hasItems && <span className="text-xs text-white/40">{round(sumC)} kcal</span>}
                  </div>
                  {hasItems && <div className="mt-0.5 pl-4 text-xs text-white/35">{round(sumP)}g protein</div>}

                  <div className="mt-3 space-y-2">
                    {!hasItems ? (
                      <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center">
                        <div className="text-xs text-white/30 leading-relaxed">{emptyMessages[t]}</div>
                      </div>
                    ) : (
                      list.map((m: any) => (
                        <div key={m.id ?? `${m.food_name}-${m.created_at}`} className="card-l3 rounded-xl p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-white/90">
                                {String(m.food_name ?? m.title ?? "Meal")}
                              </div>
                              <div className="mt-0.5 text-xs text-white/40">
                                {m.grams != null && n(m.grams, 0) > 0 ? `${round(m.grams)}g` : ""}
                                {m.grams != null && n(m.grams, 0) > 0 && m.created_at ? " · " : ""}
                                {m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-xs font-semibold text-white/70">{round(m.calories)} kcal</div>
                              <div className="text-xs text-white/40">{round(m.protein_g)}g P</div>
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

        {/* ── WORKOUTS ───────────────────────────────── */}
        <div className="fade-up delay-4 card-l1 rounded-2xl p-5">
          <div className="mb-4 flex items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-white">Workouts</h2>
              <p className="text-xs text-white/45">
                {workouts.length} session{workouts.length === 1 ? "" : "s"} · {round(workoutCalories)} kcal burned
              </p>
            </div>
          </div>

          {workouts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center">
              <div className="text-2xl mb-2">🏋️</div>
              <div className="text-sm font-medium text-white/40">No workout logged for this day</div>
              <div className="mt-1 text-xs text-white/25">Even a 20-minute walk counts — log it and watch the burn number move.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {workouts.map((w: any) => {
                const min  = n(w.duration_min ?? w.minutes ?? w.duration, 0);
                const kcal = round(n(w.calories_burned, 0));
                return (
                  <div key={w.id ?? `${w.workout_type}-${w.created_at}`} className="card-l2 rounded-2xl border-l-4 border-l-emerald-400/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                          <span className="text-sm font-semibold text-white">{String(w.workout_type ?? "Workout")}</span>
                        </div>
                        <div className="mt-1 pl-4 text-xs text-white/45">
                          {min} min{w.created_at ? ` · ${new Date(w.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                        </div>
                      </div>
                      <div className="shrink-0 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-2 text-center">
                        <div className="text-base font-bold text-emerald-300">{kcal}</div>
                        <div className="text-[10px] text-white/35">kcal</div>
                      </div>
                    </div>
                    {w.notes && <div className="mt-2 pl-4 text-xs text-white/50">{String(w.notes)}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="text-center text-xs text-white/30 pb-2">
          You don't need perfect days. You need consistent days.
        </div>
      </div>
    </>
  );
}