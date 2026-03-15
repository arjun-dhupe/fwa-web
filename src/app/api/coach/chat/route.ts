import { NextResponse } from "next/server";

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
      priorities?: Array<{
        title?: string;
        detail?: string;
        cta?: string;
        href?: string;
      }>;
      coachSummary?: string;
    };
    // Individual day objects (richer than averages alone)
    last7Days?: DaySnapshot[];
    // Legacy averages — still accepted for backwards compat
    last7?: {
      averageConsistency?: number;
      averageCalories?: number;
      averageBurn?: number;
      averageSleep?: number;
      averageWater?: number;
    };
    // User profile for personalisation
    profile?: {
      name?: string;
      goal?: string;           // e.g. "fat_loss", "muscle_gain"
      weightKg?: number;
      ageYears?: number;
      activityLevel?: string;
      daysLogged?: number;     // how many days they've used the app
    };
    recentMessages?: Array<{
      role?: "coach" | "user";
      text?: string;
    }>;
  };
};

/* ─────────────────────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────────────────────── */
function n(v: unknown, fallback = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}

function goalLabel(goal?: string): string {
  const map: Record<string, string> = {
    fat_loss:        "fat loss",
    muscle_gain:     "muscle gain",
    general_fitness: "general fitness",
    endurance:       "endurance / performance",
  };
  return map[goal || ""] || goal || "general fitness";
}

function activityLabel(level?: string): string {
  const map: Record<string, string> = {
    sedentary:   "sedentary (desk job, little exercise)",
    light:       "lightly active (walks, 1–3 workouts/week)",
    moderate:    "moderately active (3–5 workouts/week)",
    very_active: "very active (hard training 6–7 days/week)",
    athlete:     "athlete (twice-a-day or manual labour)",
  };
  return map[level || ""] || level || "unknown";
}

function timeOfDayContext(hour: number): string {
  if (hour < 6)  return "very early morning (before 6am)";
  if (hour < 12) return "morning";
  if (hour < 14) return "midday / lunchtime";
  if (hour < 17) return "afternoon";
  if (hour < 20) return "evening";
  return "late evening / night";
}

/* ─────────────────────────────────────────────────────────────
   TREND ANALYSIS  (server-side, injected as prose)
   ───────────────────────────────────────────────────────────── */
function computeTrends(days: DaySnapshot[]): string {
  if (!days || days.length === 0) return "No multi-day trend data available.";

  const with_cals = days.filter(d => n(d.calories) > 0);
  const with_prot = days.filter(d => n(d.protein) > 0);
  const with_sleep = days.filter(d => n(d.sleep) > 0);

  const lines: string[] = [];

  // Calorie trend
  if (with_cals.length >= 3) {
    const avgCal     = with_cals.reduce((s, d) => s + n(d.calories), 0) / with_cals.length;
    const avgTarget  = with_cals.reduce((s, d) => s + n(d.target_calories), 0) / with_cals.length;
    const overDays   = with_cals.filter(d => n(d.calories) > n(d.target_calories) * 1.05).length;
    const underDays  = with_cals.filter(d => n(d.calories) < n(d.target_calories) * 0.9 && n(d.target_calories) > 0).length;

    if (avgTarget > 0) {
      const gap = round(avgCal - avgTarget);
      if (underDays >= 3)
        lines.push(`Calories: under-eating pattern — average ${round(avgCal)} kcal/day vs ${round(avgTarget)} kcal target, below target on ${underDays}/${with_cals.length} days. This is a chronic under-fuelling signal.`);
      else if (overDays >= 3)
        lines.push(`Calories: over-eating pattern — average ${round(avgCal)} kcal/day vs ${round(avgTarget)} kcal target, over target on ${overDays}/${with_cals.length} days.`);
      else
        lines.push(`Calories: reasonably on track — average ${round(avgCal)} kcal/day vs ${round(avgTarget)} kcal target (${gap > 0 ? "+" : ""}${gap} kcal average gap).`);
    }
  }

  // Protein trend
  if (with_prot.length >= 3) {
    const missedDays = with_prot.filter(d => n(d.target_protein) > 0 && n(d.protein) < n(d.target_protein) * 0.8).length;
    const avgProt    = with_prot.reduce((s, d) => s + n(d.protein), 0) / with_prot.length;
    if (missedDays >= 3)
      lines.push(`Protein: missed target on ${missedDays}/${with_prot.length} days (avg ${round(avgProt)}g/day). This is a consistent gap that's limiting progress.`);
    else if (missedDays === 0)
      lines.push(`Protein: hitting target consistently over the last ${with_prot.length} days (avg ${round(avgProt)}g/day). Good.`);
    else
      lines.push(`Protein: mixed — hit target on ${with_prot.length - missedDays}/${with_prot.length} days (avg ${round(avgProt)}g/day).`);
  }

  // Sleep trend
  if (with_sleep.length >= 3) {
    const avgSleep   = with_sleep.reduce((s, d) => s + n(d.sleep), 0) / with_sleep.length;
    const poorDays   = with_sleep.filter(d => n(d.sleep) < 6.5).length;
    if (poorDays >= 3)
      lines.push(`Sleep: chronic recovery deficit — averaged ${round(avgSleep)}h/night, under 6.5h on ${poorDays}/${with_sleep.length} days. This will compound fatigue and reduce training results.`);
    else if (avgSleep >= 7.5)
      lines.push(`Sleep: strong recovery pattern — averaged ${round(avgSleep)}h/night over the last ${with_sleep.length} days.`);
    else
      lines.push(`Sleep: average ${round(avgSleep)}h/night — acceptable but could be better.`);
  }

  // Burn trend
  const with_burn = days.filter(d => n(d.burn) > 0);
  if (with_burn.length >= 3) {
    const activeDays = with_burn.filter(d => n(d.burn) > 0).length;
    const avgBurn    = with_burn.reduce((s, d) => s + n(d.burn), 0) / with_burn.length;
    lines.push(`Activity: ${activeDays} active days out of ${days.length} logged, averaging ${round(avgBurn)} kcal burned on active days.`);
  }

  return lines.length > 0 ? lines.join("\n") : "Insufficient data for trend analysis across the period.";
}

/* ─────────────────────────────────────────────────────────────
   NARRATIVE CONTEXT  (replaces the flat key-value dump)
   ───────────────────────────────────────────────────────────── */
function buildNarrativeContext(body: CoachPayload, nowHour: number): string {
  const today    = body.context?.today    || {};
  const last7    = body.context?.last7    || {};
  const last7Days= body.context?.last7Days || [];
  const profile  = body.context?.profile  || {};

  const cal       = n(today.calories);
  const calTarget = n(today.targetCalories);
  const prot      = n(today.protein);
  const protTarget= n(today.targetProtein);
  const burn      = n(today.burn);
  const burnTarget= n(today.targetBurn);
  const water     = n(today.water);
  const sleep     = n(today.sleep);
  const steps     = n(today.steps);
  const workouts  = n(today.workouts);
  const consistency= n(today.consistency);

  const parts: string[] = [];

  // Who the user is
  const name = profile.name ? `The user's name is ${profile.name}.` : "The user has not set a name.";
  const goal = `Their fitness goal is ${goalLabel(profile.goal)}.`;
  const activity = profile.activityLevel ? `Activity level: ${activityLabel(profile.activityLevel)}.` : "";
  const weight = profile.weightKg ? `They weigh ${profile.weightKg}kg.` : "";
  const age = profile.ageYears ? `Age: ${profile.ageYears}.` : "";
  const daysLogged = profile.daysLogged
    ? `They have been using this app for ${profile.daysLogged} days.`
    : "";
  parts.push([name, goal, activity, weight, age, daysLogged].filter(Boolean).join(" "));

  // Current date / time context
  parts.push(`It is currently ${timeOfDayContext(nowHour)} on ${today.date || "today"}.`);

  // Today's food
  if (cal > 0 || calTarget > 0) {
    const calGap = calTarget > 0 ? calTarget - cal : 0;
    const calStatus = calTarget <= 0
      ? `eaten ${round(cal)} kcal today (no target set)`
      : calGap > 50
        ? `eaten ${round(cal)} kcal of their ${round(calTarget)} kcal target — ${round(calGap)} kcal remaining`
        : calGap < -50
          ? `eaten ${round(cal)} kcal, which is ${round(Math.abs(calGap))} kcal over their ${round(calTarget)} kcal target`
          : `eaten ${round(cal)} kcal, essentially hitting their ${round(calTarget)} kcal target`;
    parts.push(`Calories: ${calStatus}.`);
  }

  if (prot > 0 || protTarget > 0) {
    const protGap = protTarget > 0 ? protTarget - prot : 0;
    const protStatus = protTarget <= 0
      ? `logged ${round(prot)}g protein (no target set)`
      : protGap > 10
        ? `logged ${round(prot)}g of ${round(protTarget)}g protein target — ${round(protGap)}g still to go`
        : protGap < -10
          ? `exceeded protein target — logged ${round(prot)}g vs ${round(protTarget)}g target`
          : `hit protein target — ${round(prot)}g of ${round(protTarget)}g`;
    parts.push(`Protein: ${protStatus}.`);
  }

  // Burn
  if (burn > 0 || burnTarget > 0) {
    const burnStatus = burnTarget <= 0
      ? `burned ${round(burn)} kcal today`
      : burn >= burnTarget * 0.9
        ? `burned ${round(burn)} kcal — at or near the ${round(burnTarget)} kcal target`
        : `burned ${round(burn)} kcal against a ${round(burnTarget)} kcal target — ${round(burnTarget - burn)} kcal short`;
    parts.push(`Exercise burn: ${burnStatus}. ${workouts > 0 ? `${workouts} workout(s) logged.` : "No workouts logged yet today."}`);
  }

  // Recovery
  const recoveryParts: string[] = [];
  if (sleep > 0) recoveryParts.push(`slept ${round(sleep)}h last night (${sleep < 6.5 ? "below the recommended 7–9h — a recovery concern" : sleep >= 8 ? "solid recovery" : "acceptable"})`);
  if (water > 0) recoveryParts.push(`logged ${round(water)}L of water (${water < 1.5 ? "low hydration" : water >= 2.5 ? "good hydration" : "moderate hydration"})`);
  if (steps > 0) recoveryParts.push(`${steps.toLocaleString()} steps`);
  if (recoveryParts.length > 0) parts.push(`Recovery & activity: ${recoveryParts.join(", ")}.`);

  // Consistency
  if (consistency > 0) parts.push(`Today's consistency score: ${round(consistency)}/100.`);

  // 7-day trends (computed as narrative, not just averages)
  const trends = computeTrends(last7Days);
  if (trends !== "No multi-day trend data available.") {
    parts.push(`\nLast 7-day trends:\n${trends}`);
  } else if (last7.averageCalories || last7.averageBurn || last7.averageSleep) {
    // Fallback to legacy averages if individual days not provided
    const avgLines: string[] = [];
    if (n(last7.averageCalories) > 0) avgLines.push(`avg calories ${round(n(last7.averageCalories))}`);
    if (n(last7.averageBurn) > 0)     avgLines.push(`avg burn ${round(n(last7.averageBurn))} kcal`);
    if (n(last7.averageSleep) > 0)    avgLines.push(`avg sleep ${round(n(last7.averageSleep))}h`);
    if (n(last7.averageWater) > 0)    avgLines.push(`avg water ${round(n(last7.averageWater))}L`);
    if (n(last7.averageConsistency) > 0) avgLines.push(`avg consistency ${round(n(last7.averageConsistency))}/100`);
    if (avgLines.length > 0) parts.push(`Last 7-day averages: ${avgLines.join(", ")}.`);
  }

  return parts.join("\n");
}

/* ─────────────────────────────────────────────────────────────
   QUESTION CLASSIFICATION
   4 modes: data_coaching | general_fitness | hybrid | open
   ───────────────────────────────────────────────────────────── */
type QuestionMode = "data_coaching" | "general_fitness" | "hybrid" | "open";

function classifyQuestion(question: string): QuestionMode {
  const q = question.toLowerCase().trim();

  // Very short or casual → open chat
  if (q.length < 12 || /^(hi|hey|hello|what's up|how are|thanks|ok|okay|cool|nice|great|lol|haha)/.test(q)) {
    return "open";
  }

  const dataSignals = [
    "my ", "i ", "am i", "should i", "did i", "have i", "today", "this week",
    "my calories", "my protein", "my burn", "my sleep", "my water", "my steps",
    "my workout", "my week", "my plan", "my target", "my goal", "my progress",
    "how far", "based on my", "according to my", "am i on track", "how am i doing",
    "what should i eat", "should i train", "will i", "can i",
  ];

  const generalSignals = [
    "what is", "what are", "why does", "how does", "how do you", "benefits of",
    "side effects", "is it safe", "best foods", "best exercises", "explain",
    "creatine", "whey", "protein powder", "progressive overload", "calorie deficit",
    "recomp", "fat loss", "muscle gain", "cardio", "strength training", "supplements",
    "nutrition", "hydration", "sleep", "intermittent fasting", "macro", "rep range",
    "sets", "volume", "recovery", "soreness", "cortisol", "testosterone", "bmr",
    "tdee", "metabolism", "weight loss", "cutting", "bulking",
  ];

  const hasData    = dataSignals.some(s => q.includes(s));
  const hasGeneral = generalSignals.some(s => q.includes(s));

  if (hasData && hasGeneral) return "hybrid";
  if (hasData)               return "data_coaching";
  if (hasGeneral)            return "general_fitness";
  return "open"; // anything else — just be helpful
}

/* ─────────────────────────────────────────────────────────────
   SYSTEM PROMPT  (richer, personality-driven, open-ended)
   ───────────────────────────────────────────────────────────── */
function buildSystemPrompt(mode: QuestionMode): string {
  const persona = `You are Arjun — a personal fitness coach in a fitness app. You know this person's data.

Your voice:
- Talk like a smart friend who happens to know fitness deeply. Not a coach giving a lecture.
- Short. 2-4 sentences max unless the question genuinely needs more.
- Specific. Use their actual numbers. Never say "your calories" when you can say "you're 340 kcal under".
- Honest over encouraging. If something's wrong, say it plainly.
- Varied. Never start two responses the same way. No "Great question!", no "Based on your data,", no "As your coach,".
- Casual punctuation is fine. Fragments are fine. You're texting a friend, not writing a report.

Hard rules:
- Never use the phrase "as your coach" or "based on your data" or "great question"
- Never repeat something you said in the last message
- If it's a general question, just answer it — don't force their fitness data into every reply
- If you have nothing useful to add from data, say something real and short instead of padding`;

  const modeAddons: Record<QuestionMode, string> = {
    data_coaching:    `Use their numbers. Be specific. One clear next action.`,
    general_fitness:  `Answer the question. Keep it practical. Connect to their situation only if it's natural.`,
    hybrid:           `Quick concept explanation, then apply it to their actual numbers.`,
    open:             `Just be human. Answer normally. No need to tie everything back to fitness.`,
  };

  return `${persona}\n\n${modeAddons[mode]}`;
}

/* ─────────────────────────────────────────────────────────────
   USER PROMPT  (narrative context, not flat key-value)
   ───────────────────────────────────────────────────────────── */
function buildUserPrompt(body: CoachPayload, nowHour: number): string {
  const question = String(body.question || "");
  const mode     = classifyQuestion(question);

  const narrativeContext = buildNarrativeContext(body, nowHour);

  const recentMessages = (body.context?.recentMessages || [])
    .filter(m => m?.text)
    .slice(-8)
    .map(m => `${m.role === "user" ? "User" : "Arjun"}: ${m.text}`)
    .join("\n");

  const priorities = (body.context?.today?.priorities || []).slice(0, 2);
  const priorityText = priorities.length > 0
    ? priorities.map(p => `• ${p.title}: ${p.detail}`).join("\n")
    : "";

  // Keep it tight — long prompts invite long answers
  return `${narrativeContext}${priorityText ? `\n\nTop priorities flagged:\n${priorityText}` : ""}

${recentMessages ? `Recent chat:\n${recentMessages}\n` : ""}
User: ${question}

Reply in 2-4 sentences. Mode: ${mode}.`;
}

/* ─────────────────────────────────────────────────────────────
   FALLBACK  (if Groq fails — uses same narrative logic locally)
   ───────────────────────────────────────────────────────────── */
function buildFallbackReply(body: CoachPayload): string {
  const q       = String(body.question || "").toLowerCase();
  const today   = body.context?.today || {};
  const last7   = body.context?.last7 || {};
  const priorities = today.priorities || [];

  const cal       = n(today.calories);
  const calTarget = n(today.targetCalories);
  const prot      = n(today.protein);
  const protTarget= n(today.targetProtein);
  const burn      = n(today.burn);
  const burnTarget= n(today.targetBurn);
  const water     = n(today.water);
  const sleep     = n(today.sleep);
  const consistency = n(today.consistency);

  if (q.includes("today") || q.includes("what should i do") || q.includes("how am i doing")) {
    if (priorities[0]?.detail) return priorities[0].detail;
    const gap = calTarget > 0 ? round(calTarget - cal) : 0;
    return gap > 100
      ? `You still have ${gap} kcal left for today and ${protTarget > 0 ? round(protTarget - prot) + "g protein to hit. " : ""}Focus on protein first.`
      : `You're close to your targets today — calories within range and consistency at ${round(consistency)}/100. Protect the rest of the day.`;
  }

  if (q.includes("calorie") || q.includes("intake") || q.includes("diet")) {
    if (!calTarget) return "Set your calorie target in Profile first — then I can give you specific guidance.";
    const delta = round(cal - calTarget);
    if (delta > 150)  return `You're ${delta} kcal over target. Keep the next meal lighter — or add a short walk to move the number.`;
    if (delta < -150) return `You're ${Math.abs(delta)} kcal under target. Under-eating slows recovery and metabolism. Add a clean snack.`;
    return "Calories are on track. Stay consistent through the rest of the day.";
  }

  if (q.includes("protein")) {
    if (!protTarget) return "Set your protein target in Profile to get specific guidance.";
    const gap = round(protTarget - prot);
    if (gap > 20) return `You need ${gap}g more protein today. Prioritise it in your next meal — chicken, paneer, eggs, whey, or Greek yogurt.`;
    return `Protein is on track at ${round(prot)}g. Keep going.`;
  }

  if (q.includes("train") || q.includes("workout") || q.includes("gym") || q.includes("exercise")) {
    if (sleep > 0 && sleep < 6.5) return `You logged ${round(sleep)}h sleep — train if you want, but keep it controlled. Poor recovery and max intensity is a recipe for injury.`;
    if (burnTarget > 0 && burn < burnTarget * 0.8) return `Your burn is ${round(burnTarget - burn)} kcal below target. A session makes sense today.`;
    return "Training is a good call today. Keep it purposeful — don't train hard just to feel busy.";
  }

  if (q.includes("sleep") || q.includes("recover") || q.includes("rest")) {
    if (sleep > 0 && sleep < 6.5) return `${round(sleep)}h is below optimal. If you can, protect tonight's sleep — it compounds. Every hour matters more than most people think.`;
    if (sleep >= 8) return "Sleep looks solid. Recovery is handled — now execute the training and nutrition.";
    return "Sleep is acceptable. If you want better results, 7.5–9h is the real target.";
  }

  if (q.includes("week") || q.includes("progress") || q.includes("trend")) {
    const avgCal  = n(last7.averageCalories);
    const avgCons = n(last7.averageConsistency);
    return `Over the last 7 days: avg ${round(avgCal)} kcal/day, consistency ${round(avgCons)}/100. ${avgCons >= 70 ? "That's a solid week." : "There's room to tighten things up."}`;
  }

  if (q.includes("water") || q.includes("hydrat")) {
    if (water < 1.5) return `${round(water)}L today is low. Aim for at least 2.5L — dehydration masks hunger, tanks energy, and slows recovery.`;
    return `${round(water)}L is reasonable. Keep sipping through the day.`;
  }

  // Generic fallback
  return today.coachSummary ||
    `Here's where you are: ${cal > 0 ? round(cal) + " kcal eaten" : "no food logged yet"}, ${prot > 0 ? round(prot) + "g protein" : "no protein logged"}, ${burn > 0 ? round(burn) + " kcal burned" : "no burn logged"}, ${sleep > 0 ? round(sleep) + "h sleep" : "no sleep logged"}, ${water > 0 ? round(water) + "L water" : "no water logged"}. Focus on the biggest open gap first.`;
}

/* ─────────────────────────────────────────────────────────────
   GROQ CALL
   ───────────────────────────────────────────────────────────── */
async function callGroq(body: CoachPayload, nowHour: number): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  const model  = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) throw new Error("Missing GROQ_API_KEY.");

  const mode           = classifyQuestion(String(body.question || ""));
  const systemPrompt   = buildSystemPrompt(mode);
  const userPrompt     = buildUserPrompt(body, nowHour);

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature:        0.9,    // high — sounds human, not template
      max_tokens:         220,    // hard cap — forces brevity
      frequency_penalty:  0.6,   // kills repetitive phrases across the reply
      presence_penalty:   0.4,   // encourages new angles, not retreading
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error?.message || `Groq request failed (${response.status}).`);
  }

  const reply = data?.choices?.[0]?.message?.content;
  if (!reply || typeof reply !== "string") throw new Error("Groq returned an empty reply.");

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

    const nowHour = new Date().getHours(); // server time — good enough for time-of-day context

    try {
      const reply = await callGroq(body, nowHour);
      return NextResponse.json({ reply, mode: classifyQuestion(question) });
    } catch (groqError: any) {
      // Groq failed — use the local fallback (never returns an error to the user)
      const fallbackReply = buildFallbackReply(body);
      return NextResponse.json({
        reply:   fallbackReply,
        mode:    "fallback",
        warning: groqError?.message || "AI provider unavailable.",
      });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}