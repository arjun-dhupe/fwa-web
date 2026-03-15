import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const preferredRegion = ["sin1", "bom1", "iad1", "dub1", "cle1"];
export const maxDuration = 30;

/* ─────────────────────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────────────────────── */
type DaySnapshot = {
  date: string;
  calories?: number;
  target_calories?: number;
  protein?: number;
  target_protein?: number;
  burn?: number;
  target_burn?: number;
  water?: number;
  sleep?: number;
};

type CoachPayload = {
  question?: string;
  context?: {
    today?: {
      date?: string;
      calories?: number;
      targetCalories?: number;
      protein?: number;
      targetProtein?: number;
      burn?: number;
      targetBurn?: number;
      water?: number;
      sleep?: number;
      steps?: number;
      workouts?: number;
      consistency?: number;
      priorities?: Array<{ title?: string; detail?: string; cta?: string; href?: string }>;
      coachSummary?: string;
    };
    last7Days?: DaySnapshot[];
    last7?: {
      averageConsistency?: number;
      averageCalories?: number;
      averageBurn?: number;
      averageSleep?: number;
      averageWater?: number;
    };
    profile?: {
      name?: string;
      goal?: string;
      weightKg?: number;
      ageYears?: number;
      activityLevel?: string;
      heightCm?: number;
      bodyType?: string;
      daysLogged?: number;
    };
    recentMessages?: Array<{ role?: "coach" | "user"; text?: string }>;
  };
};

/* ─────────────────────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────────────────────── */
function n(v: unknown, fallback = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}
function round(v: number): number { return Math.round(v * 10) / 10; }
function firstName(name?: string): string {
  if (!name || !name.trim()) return "";
  return name.trim().split(" ")[0];
}
function goalLabel(goal?: string): string {
  const map: Record<string, string> = {
    fat_loss: "fat loss",
    muscle_gain: "muscle gain",
    general_fitness: "general fitness",
    endurance: "endurance",
  };
  return map[goal || ""] || goal || "general fitness";
}
function activityLabel(level?: string): string {
  const map: Record<string, string> = {
    sedentary: "sedentary",
    light: "lightly active",
    moderate: "moderately active",
    very_active: "very active",
    athlete: "athlete-level",
  };
  return map[level || ""] || level || "moderately active";
}
function timeOfDay(hour: number): string {
  if (hour < 6)  return "very early morning";
  if (hour < 12) return "morning";
  if (hour < 14) return "midday";
  if (hour < 17) return "afternoon";
  if (hour < 20) return "evening";
  return "late night";
}

/* ─────────────────────────────────────────────────────────────
   TIMEOUT
   ───────────────────────────────────────────────────────────── */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Timed out after " + ms + "ms")), ms)
    ),
  ]);
}

/* ─────────────────────────────────────────────────────────────
   TREND ANALYSIS
   ───────────────────────────────────────────────────────────── */
function computeTrends(days: DaySnapshot[]): string {
  if (!days || days.length < 3) return "";
  const lines: string[] = [];
  const withCals  = days.filter(d => n(d.calories) > 0);
  const withProt  = days.filter(d => n(d.protein) > 0);
  const withSleep = days.filter(d => n(d.sleep) > 0);
  const withBurn  = days.filter(d => n(d.burn) > 0);

  if (withCals.length >= 3) {
    const avg    = withCals.reduce((s, d) => s + n(d.calories), 0) / withCals.length;
    const avgTgt = withCals.reduce((s, d) => s + n(d.target_calories), 0) / withCals.length;
    const under  = withCals.filter(d => n(d.target_calories) > 0 && n(d.calories) < n(d.target_calories) * 0.9).length;
    const over   = withCals.filter(d => n(d.calories) > n(d.target_calories) * 1.05).length;
    if (avgTgt > 0) {
      if (under >= 3) lines.push("Calories: under-eating on " + under + "/" + withCals.length + " days (avg " + round(avg) + " vs " + round(avgTgt) + " target) — chronic under-fuelling.");
      else if (over >= 3) lines.push("Calories: over target on " + over + "/" + withCals.length + " days (avg " + round(avg) + " vs " + round(avgTgt) + " target).");
      else lines.push("Calories: roughly on track (avg " + round(avg) + " vs " + round(avgTgt) + " target).");
    }
  }
  if (withProt.length >= 3) {
    const avg    = withProt.reduce((s, d) => s + n(d.protein), 0) / withProt.length;
    const missed = withProt.filter(d => n(d.target_protein) > 0 && n(d.protein) < n(d.target_protein) * 0.8).length;
    if (missed >= 3) lines.push("Protein: missed on " + missed + "/" + withProt.length + " days (avg " + round(avg) + "g) — recurring gap.");
    else if (missed === 0) lines.push("Protein: hitting target consistently (avg " + round(avg) + "g/day).");
    else lines.push("Protein: hit target " + (withProt.length - missed) + "/" + withProt.length + " days (avg " + round(avg) + "g/day).");
  }
  if (withSleep.length >= 3) {
    const avg  = withSleep.reduce((s, d) => s + n(d.sleep), 0) / withSleep.length;
    const poor = withSleep.filter(d => n(d.sleep) < 6.5).length;
    if (poor >= 3) lines.push("Sleep: chronic deficit — avg " + round(avg) + "h, under 6.5h on " + poor + "/" + withSleep.length + " nights.");
    else if (avg >= 7.5) lines.push("Sleep: strong — avg " + round(avg) + "h.");
    else lines.push("Sleep: avg " + round(avg) + "h — room to improve.");
  }
  if (withBurn.length >= 2) {
    const avg = withBurn.reduce((s, d) => s + n(d.burn), 0) / withBurn.length;
    lines.push("Active " + withBurn.length + "/" + days.length + " days, avg " + round(avg) + " kcal burn on active days.");
  }
  return lines.join("\n");
}

/* ─────────────────────────────────────────────────────────────
   NARRATIVE CONTEXT
   ───────────────────────────────────────────────────────────── */
function buildNarrativeContext(body: CoachPayload, nowHour: number): string {
  const today   = body.context?.today    || {};
  const last7   = body.context?.last7    || {};
  const days    = body.context?.last7Days || [];
  const profile = body.context?.profile  || {};

  const cal        = n(today.calories);
  const calTarget  = n(today.targetCalories);
  const prot       = n(today.protein);
  const protTarget = n(today.targetProtein);
  const burn       = n(today.burn);
  const burnTarget = n(today.targetBurn);
  const water      = n(today.water);
  const sleep      = n(today.sleep);
  const steps      = n(today.steps);
  const workouts   = n(today.workouts);
  const consistency = n(today.consistency);

  const parts: string[] = [];

  const who: string[] = [];
  if (profile.name)          who.push("Name: " + firstName(profile.name) + ".");
  if (profile.goal)          who.push("Goal: " + goalLabel(profile.goal) + ".");
  if (profile.activityLevel) who.push("Activity: " + activityLabel(profile.activityLevel) + ".");
  if (profile.weightKg)      who.push("Weight: " + profile.weightKg + "kg.");
  if (profile.ageYears)      who.push("Age: " + profile.ageYears + ".");
  if (who.length)            parts.push(who.join(" "));

  parts.push("Time: " + timeOfDay(nowHour) + " on " + (today.date || "today") + ".");

  if (cal > 0 || calTarget > 0) {
    if (calTarget <= 0)   parts.push("Eaten " + round(cal) + " kcal (no target set).");
    else {
      const gap = round(calTarget - cal);
      if (gap > 50)   parts.push("Eaten " + round(cal) + " of " + round(calTarget) + " kcal target — " + round(gap) + " kcal remaining.");
      else if (gap < -50) parts.push("Eaten " + round(cal) + " kcal — " + round(Math.abs(gap)) + " over " + round(calTarget) + " target.");
      else            parts.push("Eaten " + round(cal) + " kcal — on target (" + round(calTarget) + ").");
    }
  }
  if (prot > 0 || protTarget > 0) {
    if (protTarget <= 0)  parts.push("Protein: " + round(prot) + "g logged.");
    else {
      const gap = round(protTarget - prot);
      if (gap > 10)   parts.push("Protein: " + round(prot) + "g of " + round(protTarget) + "g target — " + round(gap) + "g short.");
      else if (gap < -10) parts.push("Protein: exceeded at " + round(prot) + "g vs " + round(protTarget) + "g target.");
      else            parts.push("Protein: on target at " + round(prot) + "g.");
    }
  }
  if (burn > 0 || burnTarget > 0) {
    if (burnTarget <= 0)  parts.push("Burned " + round(burn) + " kcal." + (workouts > 0 ? " " + workouts + " workouts." : ""));
    else {
      const gap = round(burnTarget - burn);
      if (gap > 20)   parts.push("Burned " + round(burn) + " of " + round(burnTarget) + " kcal target — " + round(gap) + " short." + (workouts > 0 ? " " + workouts + " workout(s)." : " No workouts yet."));
      else            parts.push("Burn target met — " + round(burn) + " kcal.");
    }
  }

  const rec: string[] = [];
  if (sleep > 0) rec.push(round(sleep) + "h sleep (" + (sleep < 6.5 ? "below optimal" : sleep >= 8 ? "solid" : "ok") + ")");
  if (water > 0) rec.push(round(water) + "L water (" + (water < 1.5 ? "low" : water >= 2.5 ? "good" : "moderate") + ")");
  if (steps > 0) rec.push(steps.toLocaleString() + " steps");
  if (rec.length) parts.push("Recovery: " + rec.join(", ") + ".");
  if (consistency > 0) parts.push("Consistency: " + round(consistency) + "/100.");

  const trends = computeTrends(days);
  if (trends) {
    parts.push("\n7-day trends:\n" + trends);
  } else if (n(last7.averageCalories) > 0 || n(last7.averageBurn) > 0) {
    const avg: string[] = [];
    if (n(last7.averageCalories) > 0)    avg.push("avg " + round(n(last7.averageCalories)) + " kcal/day");
    if (n(last7.averageBurn) > 0)        avg.push("avg burn " + round(n(last7.averageBurn)) + " kcal");
    if (n(last7.averageSleep) > 0)       avg.push("avg sleep " + round(n(last7.averageSleep)) + "h");
    if (n(last7.averageConsistency) > 0) avg.push("consistency " + round(n(last7.averageConsistency)) + "/100");
    if (avg.length) parts.push("Last 7 days: " + avg.join(", ") + ".");
  }

  return parts.join("\n");
}

/* ─────────────────────────────────────────────────────────────
   PROACTIVE INSIGHT
   ───────────────────────────────────────────────────────────── */
function proactiveInsight(body: CoachPayload): string {
  const today   = body.context?.today    || {};
  const days    = body.context?.last7Days || [];
  const profile = body.context?.profile  || {};
  const goal    = profile.goal || "";

  const sleep = n(today.sleep);
  const water = n(today.water);
  const cal   = n(today.calories);
  const burn  = n(today.burn);

  if (days.length >= 4) {
    const protMisses = days.filter(d => n(d.target_protein) > 0 && n(d.protein) < n(d.target_protein) * 0.75).length;
    if (protMisses >= 4) return "Protein has been under target " + protMisses + " of the last " + days.length + " days — biggest thing holding back " + (goal === "muscle_gain" ? "muscle gain" : "progress") + " right now.";
  }
  if (days.length >= 4) {
    const underDays = days.filter(d => n(d.target_calories) > 0 && n(d.calories) < n(d.target_calories) * 0.8).length;
    if (underDays >= 4) return "Consistently under calorie target (" + underDays + "/" + days.length + " days) — chronic under-eating slows metabolism" + (goal === "muscle_gain" ? " and kills gains" : "") + ".";
  }
  if (days.length >= 4) {
    const poorSleep = days.filter(d => n(d.sleep) > 0 && n(d.sleep) < 6.5).length;
    if (poorSleep >= 4) return "Sleep under 6.5h for " + poorSleep + "/" + days.length + " days — compounding fatigue and reducing training results.";
  }
  if (sleep > 0 && sleep < 6 && burn === 0) return "Only " + round(sleep) + "h sleep — light session only today, skip high intensity.";
  if (water < 1 && cal > 500) return "Only " + round(water) + "L water despite eating " + round(cal) + " kcal — dehydration will tank energy.";
  return "";
}

/* ─────────────────────────────────────────────────────────────
   QUESTION CLASSIFICATION
   ───────────────────────────────────────────────────────────── */
type QuestionMode = "data_coaching" | "general_fitness" | "hybrid" | "open";

function classifyQuestion(question: string): QuestionMode {
  const q = question.toLowerCase().trim();
  if (q.length < 8 || /^(hi|hey|hello|thanks|ok|okay|cool|nice|great|lol|haha|sup|yo|bye|good|wow|hm|hmm|sure|yep|nope|yes|no)/.test(q)) return "open";

  const dataSignals = ["my ", " i ", "am i", "should i", "did i", "have i", "today", "this week", "my calories", "my protein", "my burn", "my sleep", "my water", "my steps", "my workout", "my plan", "my target", "my goal", "my progress", "how far", "am i on track", "how am i", "what should i", "will i", "can i", "my name", "my weight", "my goal"];
  const generalSignals = ["what is", "what are", "why does", "how does", "how do you", "benefits of", "creatine", "whey", "protein powder", "progressive overload", "calorie deficit", "intermittent fasting", "macro", "rep range", "bmr", "tdee", "metabolism", "weight loss", "cutting", "bulking", "recomp", "supplements", "explain", "difference between", "is it better", "how many", "which is", "what's the best"];

  const hasData    = dataSignals.some(s => q.includes(s));
  const hasGeneral = generalSignals.some(s => q.includes(s));
  if (hasData && hasGeneral) return "hybrid";
  if (hasData)               return "data_coaching";
  if (hasGeneral)            return "general_fitness";
  return "open";
}

/* ─────────────────────────────────────────────────────────────
   SYSTEM PROMPT — Arjun's full personality
   ───────────────────────────────────────────────────────────── */
function buildSystemPrompt(mode: QuestionMode, name?: string, goal?: string): string {
  const callName = firstName(name);
  const goalDesc = goal ? goalLabel(goal) : "";

  const goalInstructions: Record<string, string> = {
    fat_loss:        "Goal context: fat loss. Be direct about deficits, don't sugarcoat overeating. Filling, low-calorie foods. Every 100 kcal gap matters.",
    muscle_gain:     "Goal context: muscle gain. Protein is religion. Under-eating is as bad as over-eating. Push calories and carbs confidently.",
    general_fitness: "Goal context: general fitness. Balance. Consistency over perfection.",
    endurance:       "Goal context: endurance. Carbs are fuel, not enemy. Timing around training is crucial.",
  };
  const goalInstruction = goal ? (goalInstructions[goal] || "") : "";

  const nameInstruction = callName
    ? "User's name is " + callName + ". Use it occasionally — once every 3-4 messages feels natural. When you do use it, make it feel warm not formal. If they ask their name, just say it."
    : "User hasn't set a name yet.";

  const modeInstructions: Record<QuestionMode, string> = {
    data_coaching:   "Use their actual numbers. Be specific. End with one concrete action.",
    general_fitness: "Answer the fitness question clearly. Only connect to their data if it genuinely adds value.",
    hybrid:          "Quick concept, then apply it to their exact numbers.",
    open:            "JUST answer what was asked. Zero fitness redirect for casual messages. If they say hey, say hey. If they ask their name, just say it and stop. Do NOT pivot to burn gaps.",
  };

  return [
    "You are Arjun — a personal fitness coach inside the FWA fitness app.",
    nameInstruction,
    goalDesc ? "Their goal: " + goalDesc + "." : "",
    "",

    "=== WHO ARJUN IS ===",
    "You're the friend who happens to have a nutrition science degree and trains 5x a week.",
    "You give real advice, not generic chatbot advice.",
    "You know when to be serious and when to make someone smile.",
    "You've seen every excuse in the book and you call them out — kindly.",
    "",

    "=== PERSONALITY ===",
    "- Witty and sharp. Not corporate. Not boring.",
    "- Occasionally crack a gym/fitness joke. Keep it actually funny, not dad-joke level.",
    "- Sometimes drop a fitness paradox to make them think. Example: 'Funny thing about rest days — the gains literally happen when you're NOT in the gym.'",
    "- Mildly playful/flirty when appropriate — light, never weird. Example: 'That protein number though... impressive.' or 'Look at you, actually hitting targets.'",
    "- Use casual language: 'yeah', 'nah', 'honestly', 'real talk', 'not gonna lie', 'that's actually solid'.",
    "- Occasionally use emojis — sparingly, not every message. 💪 🔥 when something genuinely deserves it.",
    "- If someone is slacking, call it out with humour: 'Your calorie log says snacks. Your mirror will say something else in 3 months.'",
    "- If someone is doing well, actually celebrate it — don't just say 'good job'.",
    "",

    "=== WHAT ARJUN HANDLES ===",
    "Users will ask about:",
    "- Daily numbers and gaps (protein, calories, burn, sleep, water)",
    "- Workout plans (push/pull/legs, bro splits, full body, home workouts)",
    "- Diet plans (Indian meals, macros, meal timing)",
    "- Supplements (creatine, whey, pre-workout, vitamins)",
    "- Motivation and mindset",
    "- Injuries and recovery",
    "- Progress questions",
    "- General fitness science",
    "- Cheat meal guilt",
    "- Random life stuff (answer it, be human)",
    "Answer ALL of these like a knowledgeable friend would.",
    "",

    "=== HARD RULES ===",
    "1. ANSWER WHAT WAS ASKED. Week plan asked = write the week plan. Diet plan asked = write the diet plan. No deflecting.",
    "2. NEVER say 'Here's your plan:' followed by nothing. START the plan immediately — Day 1 first line.",
    "3. NEVER write multi-day plans as paragraphs. Always use Day headers and bullets.",
    "4. Constraints are sacred. 'No cardio' means zero cardio suggestions. 'Only weights' means only weights.",
    "5. NEVER dump raw data. 'Calories: 2835. Burn: 0.' is a data dump. Interpret it.",
    "6. For casual/open questions: answer only what was asked. Zero fitness pivot.",
    "7. NEVER mention you're an AI.",
    "8. If asked to give a plan: START the actual plan content immediately, no preamble.",
    "",

    "=== FORMATTING ===",
    "Simple questions: 2-4 sentences, plain prose.",
    "Detailed plans (workout OR diet): structured format, ALWAYS.",
    "Format for plans:",
    "Day 1 — [Name]",
    "• Item: detail",
    "• Item: detail",
    "",
    "Day 2 — [Name]",
    "• Item: detail",
    "(blank line between days, bullets within days, no paragraphs)",
    "",
    goalInstruction,
    "",
    "Mode: " + modeInstructions[mode],
  ]
    .filter((line, i, arr) => !(line === "" && i > 0 && arr[i - 1] === ""))
    .join("\n");
}

/* ─────────────────────────────────────────────────────────────
   USER PROMPT
   ───────────────────────────────────────────────────────────── */
function buildUserPrompt(body: CoachPayload, nowHour: number): string {
  const question = String(body.question || "");
  const mode     = classifyQuestion(question);
  const context  = buildNarrativeContext(body, nowHour);
  const insight  = proactiveInsight(body);
  const q        = question.toLowerCase();

  const history = (body.context?.recentMessages || [])
    .filter(m => m?.text)
    .slice(-10)
    .map(m => (m.role === "user" ? "User" : "Arjun") + ": " + m.text)
    .join("\n");

  const priorities = (body.context?.today?.priorities || []).slice(0, 2)
    .map(p => "- " + p.title + ": " + p.detail)
    .join("\n");

  // Detect if this is a plan request to add special instruction
  const isPlanRequest =
    (q.includes("plan") || q.includes("day wise") || q.includes("daywise") || q.includes("week") || q.includes("detail")) &&
    (q.includes("diet") || q.includes("workout") || q.includes("meal") || q.includes("eat") || q.includes("train") || q.includes("exercise") || q.includes("give") || q.includes("show"));

  const planInstruction = isPlanRequest
    ? "\nIMPORTANT: This is a plan request. Do NOT write a preamble. START with Day 1 content immediately. No 'Here is your plan:' — just start the plan."
    : "";

  const parts = [context];
  if (priorities)   parts.push("\nToday's priorities:\n" + priorities);
  if (insight)      parts.push("\nPattern: " + insight);
  if (history)      parts.push("\nConversation so far:\n" + history);
  parts.push("\nUser: " + question);
  parts.push("\nMode: " + mode + planInstruction);

  return parts.join("\n");
}

/* ─────────────────────────────────────────────────────────────
   FOOD HELPERS
   ───────────────────────────────────────────────────────────── */
function proteinFoods(goal: string): string {
  if (goal === "muscle_gain") return "chicken breast, paneer bhurji, eggs, whey shake, or Greek yogurt";
  if (goal === "fat_loss")    return "grilled chicken, boiled eggs, paneer (small portion), moong dal, or Greek yogurt";
  if (goal === "endurance")   return "eggs, dal, chicken with rice, banana with peanut butter, or whey shake";
  return "chicken, paneer, eggs, Greek yogurt, dal, sprouts, or whey";
}

function mealIdea(goal: string, tod: string): string {
  const isEvening = tod === "evening" || tod === "late night";
  if (goal === "fat_loss")   return isEvening ? "grilled chicken or paneer with sabzi and 1 roti — skip the rice" : "poha with sprouts, eggs on toast, or dal-rice bowl";
  if (goal === "muscle_gain") return isEvening ? "rice with chicken curry or paneer + dal — biggest meal, don't skip carbs" : "oats with banana + protein powder, or eggs with paratha";
  return isEvening ? "dal-rice, roti-sabzi, or grilled chicken" : "eggs, poha, or an oats bowl";
}

/* ─────────────────────────────────────────────────────────────
   FALLBACK — coached responses when Groq fails
   ───────────────────────────────────────────────────────────── */
function buildFallbackReply(body: CoachPayload): string {
  const q        = String(body.question || "").toLowerCase();
  const today    = body.context?.today   || {};
  const last7    = body.context?.last7   || {};
  const profile  = body.context?.profile || {};

  const name = firstName(profile.name);
  const hi   = name ? name + " — " : "";
  const goal = profile.goal || "general_fitness";
  const tod  = timeOfDay(new Date().getHours());

  const cal        = n(today.calories);
  const calTarget  = n(today.targetCalories);
  const prot       = n(today.protein);
  const protTarget = n(today.targetProtein);
  const burn       = n(today.burn);
  const burnTarget = n(today.targetBurn);
  const water      = n(today.water);
  const sleep      = n(today.sleep);
  const consistency = n(today.consistency);
  const priorities  = today.priorities || [];

  if (q.includes("what is my name") || q.includes("what's my name") || q.includes("whats my name") || (q.includes("my name") && q.includes("what"))) {
    if (name) return "Your name is " + name + ". Don't forget it, apparently.";
    return "You haven't set your name in Profile yet. Go add it — I'll feel weird calling you 'user'.";
  }

  if (q.includes("eat") || q.includes("food") || q.includes("meal") || (q.includes("what should i") && !q.includes("train"))) {
    const protGap = protTarget > 0 ? round(protTarget - prot) : 0;
    const calGap  = calTarget > 0  ? round(calTarget - cal)   : 0;
    if (protGap > 30) return hi + "you're " + protGap + "g short on protein. Go for " + proteinFoods(goal) + (calGap < 0 ? " — keep it lean, you're already over on calories" : "") + ".";
    if (calGap > 200) return hi + round(calGap) + " kcal left. " + mealIdea(goal, tod) + " — don't snack your way there.";
    if (calGap < -100) return hi + "you're " + Math.abs(round(calGap)) + " kcal over. Vegetables, cucumber, or a small protein source if hunger hits.";
    return hi + "you're close to target. Keep it lean — " + mealIdea(goal, tod) + ".";
  }

  if (q.includes("calorie") || q.includes("intake")) {
    if (!calTarget) return "Set your calorie target in Profile first — I'm flying blind without it.";
    const delta = round(cal - calTarget);
    if (delta > 200) return hi + delta + " kcal over. Kitchen's closed for today unless it's vegetables.";
    if (delta < -200) return hi + Math.abs(delta) + " kcal under" + (goal === "muscle_gain" ? " — that's killing your gains, eat more" : "") + ". A real meal, not a snack.";
    return hi + "calories are solid. Finish the day clean.";
  }

  if (q.includes("protein")) {
    if (!protTarget) return "Set your protein target in Profile first.";
    const gap = round(protTarget - prot);
    if (gap > 30) return hi + gap + "g protein to go. " + proteinFoods(goal) + " — pick one.";
    if (gap > 0)  return hi + "just " + gap + "g left. Greek yogurt or a boiled egg closes it.";
    return hi + "protein target done. That's the most important box ticked today. 💪";
  }

  if (q.includes("train") || q.includes("workout") || q.includes("gym") || q.includes("exercise")) {
    if (sleep > 0 && sleep < 6) return hi + round(sleep) + "h sleep is rough. Train if you want but keep it short and controlled — injuries love tired muscles.";
    if (sleep > 0 && sleep < 6.5) return hi + "sleep was light. You can train, just don't go full beast mode today.";
    if (burnTarget > 0 && burn < burnTarget * 0.7) return hi + "you're " + round(burnTarget - burn) + " kcal short of your burn target and recovery looks fine. Get in there.";
    if (burnTarget > 0 && burn >= burnTarget * 0.9) return hi + "burn target hit. Rest day or light recovery is probably smarter.";
    return hi + "recovery looks good. Train. Make it count, not just tiring.";
  }

  if (q.includes("sleep") || q.includes("recover") || q.includes("rest")) {
    if (sleep >= 8)  return hi + round(sleep) + "h sleep — that's actually elite. Your body is rebuilding right now. Don't waste it with junk food.";
    if (sleep >= 7)  return hi + round(sleep) + "h is solid. 7.5–8.5h is the sweet spot if you want to actually feel the gains compound.";
    if (sleep > 0)   return hi + round(sleep) + "h isn't cutting it. Sleep is when you actually build muscle — protect it tonight.";
    return "Log your sleep — I can't coach recovery if I don't know how you're recovering.";
  }

  if (q.includes("water") || q.includes("hydrat")) {
    if (water < 1)  return hi + round(water) + "L is genuinely bad. Drink water. Right now. Before anything else.";
    if (water < 2)  return hi + round(water) + "L is below target. Another litre through the day.";
    return hi + round(water) + "L — hydration sorted. You're ahead of 90% of gym-goers on this one.";
  }

  if (q.includes("week") || q.includes("progress") || q.includes("trend")) {
    const avgCons = n(last7.averageConsistency);
    if (avgCons === 0) return "Not enough data yet for a weekly picture. Keep logging — give it a few days.";
    if (avgCons >= 70) return hi + "consistency at " + round(avgCons) + "/100 this week. That's genuinely good. The boring truth about fitness? This is literally all it takes — just keep doing this.";
    if (avgCons >= 40) return hi + "consistency at " + round(avgCons) + "/100 — decent foundation. One thing to tighten up, not everything at once.";
    return hi + "consistency at " + round(avgCons) + "/100. Here's a paradox for you: the days you least want to track are the days tracking matters most.";
  }

  if (q.includes("today") || q.includes("how am i") || q.includes("doing")) {
    if (priorities[0]?.detail) return priorities[0].detail;
    if (consistency >= 80) return hi + "today is a " + round(consistency) + "/100 day. Rare. Protect it through to midnight.";
    const biggest = protTarget > 0 && prot < protTarget * 0.7 ? "protein"
      : burnTarget > 0 && burn < burnTarget * 0.5 ? "activity"
      : water < 1.5 ? "hydration"
      : sleep > 0 && sleep < 6.5 ? "recovery" : null;
    if (biggest) return hi + biggest + " is the biggest gap today. Fix that one thing and the day is salvageable.";
    return hi + "things look decent. Don't overthink it — finish clean.";
  }

  const protGap = protTarget > 0 ? round(protTarget - prot) : 0;
  if (protGap > 30) return hi + "biggest open gap is protein — " + protGap + "g short. Everything else can wait.";
  if (burnTarget > 0 && burn < burnTarget * 0.5) return hi + "burn is at " + round(burn) + " of " + round(burnTarget) + " kcal. A workout would move the needle today.";
  return hi + "numbers look solid. Real talk — consistency is the only thing that separates people who transform and people who don't.";
}

/* ─────────────────────────────────────────────────────────────
   FOLLOW-UP SUGGESTIONS — conversation-aware, non-repeating
   ───────────────────────────────────────────────────────────── */
function buildSuggestions(body: CoachPayload, question: string, reply: string, nowHour: number): string[] {
  const q        = question.toLowerCase();
  const today    = body.context?.today   || {};
  const profile  = body.context?.profile || {};
  const goal     = profile.goal || "";

  const prot       = n(today.protein);
  const protTarget = n(today.targetProtein);
  const cal        = n(today.calories);
  const calTarget  = n(today.targetCalories);
  const burn       = n(today.burn);
  const burnTarget = n(today.targetBurn);
  const water      = n(today.water);
  const sleep      = n(today.sleep);
  const isLateNight = nowHour >= 20;
  const isMorning   = nowHour < 12;

  const recentMessages = body.context?.recentMessages || [];
  const askedSet = new Set(
    recentMessages
      .filter(m => m.role === "user" && m.text)
      .map(m => m.text!.toLowerCase().trim())
  );
  askedSet.add(q);

  function fresh(s: string): boolean {
    const sl = s.toLowerCase();
    return ![...askedSet].some(a => a.includes(sl.slice(0, 18)) || sl.includes(a.slice(0, 18)));
  }

  // Reply is a plan — offer to drill down
  const replyIsWorkoutPlan = reply.includes("Day 1") && (reply.includes("press") || reply.includes("squat") || reply.includes("pull") || reply.includes("sets"));
  const replyIsDietPlan    = reply.includes("Day 1") && (reply.includes("Breakfast") || reply.includes("breakfast") || reply.includes("Lunch") || reply.includes("lunch") || reply.includes("roti") || reply.includes("rice"));

  if (replyIsWorkoutPlan) {
    return [
      "Give me a matching diet plan for this week",
      "How many rest days and when?",
      "What should I eat pre and post workout?",
    ].filter(fresh).slice(0, 3);
  }

  if (replyIsDietPlan) {
    return [
      "How many calories is this plan?",
      "Can I swap any meals for something quicker?",
      "What supplements go with this plan?",
    ].filter(fresh).slice(0, 3);
  }

  // Topic-based suggestion pools
  let pool: string[] = [];

  if (q.includes("workout plan") || q.includes("week plan") || (q.includes("plan") && (q.includes("week") || q.includes("workout")))) {
    pool = ["Give me a matching diet plan", "Add rest days to the plan", "What should I eat pre-workout?", "How many sets for hypertrophy?", "Can I do this at home?"];
  } else if (q.includes("diet plan") || q.includes("meal plan") || q.includes("day wise") || (q.includes("detail") && (q.includes("diet") || q.includes("eat")))) {
    pool = ["How many calories is this?", "What to eat pre-workout?", "Best post-workout meal?", "Can I have cheat meals?", "What snacks work with this?"];
  } else if (q.includes("eat") || q.includes("food") || q.includes("meal")) {
    const snackQ = protTarget > 0 && prot < protTarget * 0.8 ? "Quick " + round(protTarget - prot) + "g protein fix?" : "Best high-protein snack right now?";
    const goalQ  = goal === "fat_loss" ? "Foods to avoid for fat loss?" : goal === "muscle_gain" ? "What to eat post-workout?" : "Best balanced meal right now?";
    pool = ["Give me a full week diet plan", snackQ, goalQ, "What should I eat tomorrow?", "Meal timing tips?"];
  } else if (q.includes("train") || q.includes("workout") || q.includes("gym") || q.includes("exercise") || q.includes("lifting") || q.includes("weights")) {
    pool = ["Give me a week workout plan", "What should I eat around workouts?", sleep < 6.5 ? "How to train on low sleep?" : "Best split for " + goalLabel(goal) + "?", burnTarget > 0 && burn < burnTarget * 0.6 ? "How to hit " + round(burnTarget) + " kcal burn?" : "Optimal sets and reps for my goal?", "Should I train today or rest?"];
  } else if (q.includes("today") || q.includes("how am i") || q.includes("doing")) {
    pool = [isLateNight ? "What to focus on tomorrow?" : "Biggest gap right now?", "What should I eat next?", burnTarget > 0 && burn < burnTarget * 0.5 ? "Should I work out today?" : "Am I on track this week?", "What would make today a win?"];
  } else if (q.includes("calorie") || q.includes("intake")) {
    pool = [calTarget > 0 && cal > calTarget ? "How to fix going over?" : "How to hit my calorie target?", "What to eat to stay in range?", isLateNight ? "What to aim for tomorrow?" : "Will I hit target today?", "Should I eat more on workout days?"];
  } else if (q.includes("protein")) {
    pool = ["Best Indian protein sources?", goal === "muscle_gain" ? "Protein needs post-workout?" : "Am I getting enough protein this week?", "Quick high-protein snack?", "Should I take whey protein?", "Protein timing — does it matter?"];
  } else if (q.includes("sleep") || q.includes("recover") || q.includes("rest")) {
    pool = ["Should I train today?", "How does poor sleep affect gains?", "What to eat before bed?", "Best recovery foods?", "How to improve sleep quality?"];
  } else if (q.includes("supplement") || q.includes("creatine") || q.includes("whey") || q.includes("pre-workout")) {
    pool = ["Is creatine worth it?", "Best time to take whey?", "Do I need pre-workout?", "What supplements for muscle gain?", "Supplements for fat loss?"];
  } else if (q.includes("week") || q.includes("progress") || q.includes("trend")) {
    pool = ["What's my biggest weakness this week?", "Am I on track for my goal?", isMorning ? "What to focus on today?" : "Plan for tomorrow?", "How to improve consistency?"];
  } else if (q.includes("water") || q.includes("hydrat")) {
    pool = ["How much water daily?", "Does hydration affect fat loss?", "Hydrating foods to add?", "Best time to drink water?"];
  } else if (q.includes("cheat") || q.includes("junk") || q.includes("pizza") || q.includes("burger")) {
    pool = ["How to recover after a cheat meal?", "How often can I have cheat meals?", "Does one cheat meal ruin progress?", "How to get back on track?"];
  } else if (q.includes("injury") || q.includes("pain") || q.includes("sore")) {
    pool = ["Should I train through soreness?", "How long to rest an injury?", "What can I train while injured?", "Recovery foods for muscle repair?"];
  } else {
    // Generic based on current gaps
    pool = [
      protTarget > 0 && prot < protTarget * 0.7 ? "What to eat for protein?" : "How's my nutrition today?",
      burnTarget > 0 && burn < burnTarget * 0.6 ? "Should I work out today?" : "How's my week looking?",
      isLateNight ? "Plan for tomorrow?" : water < 2 ? "Am I drinking enough water?" : "Biggest gap right now?",
      "Give me a week workout plan",
      "Give me a diet plan for my goal",
    ];
  }

  const filtered = pool.filter(fresh);
  if (filtered.length === 0) {
    return ["Give me a week workout plan", "Give me a diet plan", isLateNight ? "Plan for tomorrow?" : "How's today looking?"];
  }
  return filtered.slice(0, 3);
}

/* ─────────────────────────────────────────────────────────────
   GROQ CALL
   ───────────────────────────────────────────────────────────── */
async function callGroq(body: CoachPayload, nowHour: number): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  const model  = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  if (!apiKey) throw new Error("Missing GROQ_API_KEY.");

  const name   = body.context?.profile?.name;
  const goal   = body.context?.profile?.goal;
  const mode   = classifyQuestion(String(body.question || ""));
  const system = buildSystemPrompt(mode, name, goal);
  const user   = buildUserPrompt(body, nowHour);

  const response = await withTimeout(
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model,
        temperature:       0.9,
        max_tokens:        700,   // enough for a full 7-day plan
        frequency_penalty: 0.4,
        presence_penalty:  0.3,
        messages: [
          { role: "system", content: system },
          { role: "user",   content: user   },
        ],
      }),
    }),
    14000
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data?.error?.message as string) || "Groq " + response.status);
  const reply = data?.choices?.[0]?.message?.content;
  if (!reply || typeof reply !== "string") throw new Error("Empty reply from Groq.");
  return reply.trim();
}

/* ─────────────────────────────────────────────────────────────
   ROUTE HANDLER
   ───────────────────────────────────────────────────────────── */
export async function POST(req: Request) {
  try {
    const body     = (await req.json()) as CoachPayload;
    const question = String(body?.question || "").trim();

    if (!question) {
      return NextResponse.json({ error: "Missing question." }, { status: 400 });
    }

    const nowHour = new Date().getHours();

    try {
      const reply       = await callGroq(body, nowHour);
      const suggestions = buildSuggestions(body, question, reply, nowHour);

      return NextResponse.json({
        reply,
        suggestions,
        mode:   classifyQuestion(question),
        source: "groq",
      });
    } catch (groqErr: any) {
      const reply       = buildFallbackReply(body);
      const suggestions = buildSuggestions(body, question, reply, nowHour);

      return NextResponse.json({
        reply,
        suggestions,
        mode:    "fallback",
        source:  "fallback",
        warning: groqErr?.message || "AI unavailable",
      });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error." },
      { status: 500 }
    );
  }
}