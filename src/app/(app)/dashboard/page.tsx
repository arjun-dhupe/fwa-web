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

function n(v: any, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function round(v: number) {
  return Math.round(v * 10) / 10;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Snapshot = {
  log_date: string;
  calorie_intake?: number | null;
  protein_g?: number | null;
  water_l?: number | null;
  sleep_hours?: number | null;
  calories_burned?: number | null;
  workout_sessions?: number | null;
  steps?: number | null;
  target_calories?: number | null;
  target_protein_g?: number | null;
  target_burn?: number | null;
  hit_calorie_target?: boolean | null;
  hit_protein_target?: boolean | null;
  hit_burn_target?: boolean | null;
  hit_water_target?: boolean | null;
  hit_sleep_target?: boolean | null;
  consistency_score?: number | null;
};

type PromptKey = "today" | "calories" | "train" | "eat" | "week";
type ChatMessage = {
  id: string;
  role: "coach" | "user";
  text: string;
};

function Pill({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-wide text-white/45">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      {sub ? <div className="mt-1 text-xs text-white/50">{sub}</div> : null}
    </div>
  );
}

function MiniBar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: string;
}) {
  const pct = max > 0 ? clamp((value / max) * 100, 6, 100) : 6;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <div className="text-white/55">{label}</div>
        <div className="font-semibold text-white">{round(value)}</div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/8">
        <div className={cx("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [email, setEmail] = useState("");
  const [todaySnapshot, setTodaySnapshot] = useState<Snapshot | null>(null);
  const [last7, setLast7] = useState<Snapshot[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptKey | null>(null);
  const [chatInput, setChatInput] = useState("");
const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
  {
    id: "welcome",
    role: "coach",
    text: "Arjun Says: tell me what you need help with today — calories, workout, recovery, food, or your weekly focus.",
  },
]);

  const todayIso = useMemo(() => yyyyMmDd(new Date()), []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) {
          router.push("/login");
          return;
        }

        setEmail(data.user.email ?? "");

        const d0 = new Date();
        const days: string[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(d0);
          d.setDate(d.getDate() - i);
          days.push(yyyyMmDd(d));
        }

        const [{ data: todayRow, error: todayErr }, { data: weekRows, error: weekErr }] =
          await Promise.all([
            supabase
              .from("daily_analysis_snapshots")
              .select("*")
              .eq("user_id", data.user.id)
              .eq("log_date", todayIso)
              .maybeSingle(),
            supabase
              .from("daily_analysis_snapshots")
              .select("*")
              .eq("user_id", data.user.id)
              .in("log_date", days)
              .order("log_date", { ascending: true }),
          ]);

        if (todayErr) throw new Error(todayErr.message);
        if (weekErr) throw new Error(weekErr.message);

        setTodaySnapshot((todayRow as Snapshot | null) ?? null);
        setLast7((weekRows as Snapshot[]) ?? []);
      } catch (e: any) {
        setMsg(e?.message ?? "Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
  }, [router, todayIso]);

  const intake = n(todaySnapshot?.calorie_intake, 0);
  const protein = n(todaySnapshot?.protein_g, 0);
  const burn = n(todaySnapshot?.calories_burned, 0);
  const water = n(todaySnapshot?.water_l, 0);
  const sleep = n(todaySnapshot?.sleep_hours, 0);
  const steps = n(todaySnapshot?.steps, 0);
  const workouts = n(todaySnapshot?.workout_sessions, 0);
  const targetCalories = n(todaySnapshot?.target_calories, 0);
  const targetProtein = n(todaySnapshot?.target_protein_g, 0);
  const targetBurn = n(todaySnapshot?.target_burn, 0);
  const consistency = n(todaySnapshot?.consistency_score, 0);

  const status = useMemo(() => {
    const hitCount = [
      !!todaySnapshot?.hit_calorie_target,
      !!todaySnapshot?.hit_protein_target,
      !!todaySnapshot?.hit_burn_target,
      !!todaySnapshot?.hit_water_target,
      !!todaySnapshot?.hit_sleep_target,
    ].filter(Boolean).length;

    if (hitCount >= 4) {
      return {
        title: "Strong day so far",
        detail:
          "You are mostly on track today. Keep the basics clean and don’t get careless tonight.",
        tone: "ok",
      };
    }
    if (hitCount >= 2) {
      return {
        title: "Decent day, needs tightening",
        detail:
          "There is good momentum, but one or two weak areas still need attention before the day ends.",
        tone: "mid",
      };
    }
    return {
      title: "Coach attention needed",
      detail:
        "Today can still be rescued. Focus on the next right action instead of trying to fix everything at once.",
      tone: "warn",
    };
  }, [todaySnapshot]);

  const priorities = useMemo(() => {
    const items: { title: string; detail: string; cta: string; href: string }[] = [];

    if (targetProtein > 0 && protein < targetProtein * 0.8) {
      items.push({
        title: "Protein is lagging",
        detail: `You are at ${round(protein)}g vs target ${round(
          targetProtein
        )}g. Close the gap earlier instead of forcing it late at night.`,
        cta: "Log food",
        href: "/log",
      });
    }

    if (water < 2.5) {
      items.push({
        title: "Hydration needs work",
        detail: `You are only at ${round(
          water
        )}L today. A simple hydration push could improve energy and recovery quickly.`,
        cta: "Log water",
        href: "/log",
      });
    }

    if (targetBurn > 0 && burn < targetBurn * 0.85) {
      items.push({
        title: "Burn is below target",
        detail: `You have burned ${round(burn)} kcal vs target ${round(
          targetBurn
        )} kcal. A short session still moves the day back in your favor.`,
        cta: "Log workout",
        href: "/log-workout",
      });
    }

    if (sleep > 0 && sleep < 7) {
      items.push({
        title: "Recovery is the weak point",
        detail: `Sleep logged is ${round(
          sleep
        )}h. If you train hard with weak recovery, tomorrow’s performance usually pays the price.`,
        cta: "Review today",
        href: "/today",
      });
    }

    if (items.length === 0) {
      items.push({
        title: "Protect the good work",
        detail:
          "Today already looks solid. Your job now is to avoid drift and finish the day clean.",
        cta: "Open Today",
        href: "/today",
      });
    }

    return items.slice(0, 3);
  }, [protein, targetProtein, water, burn, targetBurn, sleep]);

  const quickActions = useMemo(
    () => [
      { label: "+ Water", sub: "Hydrate fast", href: "/log" },
      { label: "+ Meal", sub: "Fix protein / calories", href: "/log" },
      { label: "+ Workout", sub: "Close the burn gap", href: "/log-workout" },
      { label: "Review Analysis", sub: "See patterns", href: "/analysis" },
    ],
    []
  );

  const todayPlan = useMemo(() => {
    const mainFocus =
      priorities[0]?.title || (sleep > 0 && sleep < 7 ? "Recovery first" : "Protect momentum");

    const secondaryFocus =
      water < 2.5
        ? "Push hydration"
        : targetProtein > 0 && protein < targetProtein * 0.85
        ? "Close protein gap"
        : targetBurn > 0 && burn < targetBurn * 0.9
        ? "Add a short activity block"
        : "Keep the basics clean";

    const avoid =
      targetCalories > 0 && intake > targetCalories * 1.08
        ? "Avoid casual extra calories tonight"
        : sleep > 0 && sleep < 6.5
        ? "Avoid turning today into an all-out training day"
        : "Avoid drifting into random decisions";

    const winCondition =
      priorities[0]?.detail ||
      "End the day with one more smart action than a few careless ones.";

    return {
      mainFocus,
      secondaryFocus,
      avoid,
      winCondition,
    };
  }, [
    priorities,
    sleep,
    water,
    targetProtein,
    protein,
    targetBurn,
    burn,
    targetCalories,
    intake,
  ]);

  const coachSummary = useMemo(() => {
    if (!todaySnapshot) {
      return "Start logging today’s food, water, sleep, and training so Coach can give precise guidance instead of generic advice.";
    }

    const calorieText =
      targetCalories > 0
        ? `Calories are ${round(intake)} vs target ${round(targetCalories)}.`
        : `Calories logged: ${round(intake)}.`;

    const burnText =
      targetBurn > 0
        ? `Burn is ${round(burn)} vs target ${round(targetBurn)}.`
        : `Burn logged: ${round(burn)}.`;

    const recoveryText =
      sleep > 0
        ? `Sleep is ${round(sleep)}h and water is ${round(water)}L.`
        : `Water is ${round(water)}L and recovery data still needs filling in.`;

    return `${calorieText} ${burnText} ${recoveryText} Your current consistency score is ${round(
      consistency
    )}/100, so focus on the smallest next move that improves today instead of trying to perfect everything.`;
  }, [todaySnapshot, intake, targetCalories, burn, targetBurn, sleep, water, consistency]);

  const askCoachAnswer = useMemo(() => {
    if (!selectedPrompt) {
      return "Choose a prompt and Coach will turn your current data into a direct recommendation.";
    }

    if (selectedPrompt === "today") {
      return (
        priorities[0]?.detail ||
        "The smartest move today is to keep logging accurately so the app can guide you properly."
      );
    }

    if (selectedPrompt === "calories") {
      if (targetCalories <= 0) {
        return "Set your calorie target in Profile first so Coach can guide intake decisions properly.";
      }
      const delta = round(intake - targetCalories);
      if (delta > 120) {
        return `You are about ${delta} kcal over target. Keep the next meal lighter and avoid unnecessary snacking.`;
      }
      if (delta < -120) {
        return `You are about ${Math.abs(
          delta
        )} kcal under target. Add a clean meal or snack so the day doesn’t finish too low.`;
      }
      return "Calories are close enough to target. Avoid over-correcting — just keep the rest of the day calm and accurate.";
    }

    if (selectedPrompt === "train") {
      if (sleep > 0 && sleep < 6.5) {
        return "Train if you want, but keep it controlled. Today is better suited for moderate quality work than heroic intensity.";
      }
      if (targetBurn > 0 && burn < targetBurn * 0.8) {
        return "Yes — a short, focused session makes sense today because burn is behind target.";
      }
      return "Training is optional today. If you do it, treat it as a smart consistency session rather than a punishment session.";
    }

    if (selectedPrompt === "eat") {
      if (targetProtein > 0 && protein < targetProtein * 0.8) {
        return "Your next meal should prioritize protein first, then keep calories controlled. That is the highest-value food decision right now.";
      }
      return "Your next meal should be simple, high-quality, and aligned with your calorie target. Avoid making the day harder than it needs to be.";
    }

    const avgConsistency =
      last7.length > 0
        ? round(last7.reduce((sum, x) => sum + n(x.consistency_score, 0), 0) / last7.length)
        : 0;

    return `This week should be about repeatability. Your recent average consistency is ${avgConsistency}/100, so the target is more stable days, not more extreme days.`;
  }, [
    selectedPrompt,
    priorities,
    targetCalories,
    intake,
    sleep,
    targetBurn,
    burn,
    targetProtein,
    protein,
    last7,
  ]);
  function buildCoachReply(question: string) {
  const q = question.toLowerCase();

  if (q.includes("today") || q.includes("what should i do")) {
    return (
      priorities[0]?.detail ||
      "Today is about keeping the basics tight. Log accurately and do the next easy win first."
    );
  }

  if (q.includes("calorie") || q.includes("diet") || q.includes("intake")) {
    if (targetCalories <= 0) {
      return "Set your calorie target in Profile first, then I can coach your intake more precisely.";
    }
    const delta = round(intake - targetCalories);
    if (delta > 120) {
      return `You are about ${delta} kcal over target. Keep the next meal lighter and avoid unnecessary snacking.`;
    }
    if (delta < -120) {
      return `You are about ${Math.abs(
        delta
      )} kcal under target. Add a clean meal or snack so the day doesn’t finish too low.`;
    }
    return "Calories are close to target. Don’t over-correct now — keep the rest of the day calm and clean.";
  }

  if (q.includes("train") || q.includes("workout") || q.includes("exercise")) {
    if (sleep > 0 && sleep < 6.5) {
      return "You can train, but keep it controlled. Today is better for quality and consistency than all-out intensity.";
    }
    if (targetBurn > 0 && burn < targetBurn * 0.8) {
      return "Yes — a short focused workout makes sense today because your burn is still behind target.";
    }
    return "Training is optional today. If you do it, make it a smart consistency session rather than a punishment session.";
  }

  if (q.includes("eat") || q.includes("meal") || q.includes("protein") || q.includes("food")) {
    if (targetProtein > 0 && protein < targetProtein * 0.8) {
      return "Your next meal should prioritize protein first, then keep calories controlled. That is the highest-value food move right now.";
    }
    return "Keep your next meal simple: quality protein, controlled calories, and no random extras.";
  }

  if (q.includes("week") || q.includes("plan") || q.includes("focus")) {
    const avgConsistency =
      last7.length > 0
        ? round(last7.reduce((sum, x) => sum + n(x.consistency_score, 0), 0) / last7.length)
        : 0;
    return `This week should be about repeatability. Your recent average consistency is ${avgConsistency}/100, so the target is more stable days, not more extreme days.`;
  }

  if (q.includes("sleep") || q.includes("recovery") || q.includes("rest")) {
    if (sleep > 0 && sleep < 7) {
      return `Recovery is one of today’s weak spots. You logged ${round(
        sleep
      )}h sleep, so train smart and protect tonight’s recovery.`;
    }
    return "Recovery looks acceptable today. Keep hydration strong and avoid turning a decent day into a messy one.";
  }

  return `${coachSummary} Arjun says: do the next useful thing, not the perfect thing.`;
}

function addCoachMessage(text: string) {
  setChatMessages((prev) => [
    ...prev,
    {
      id: `${Date.now()}-${Math.random()}`,
      role: "coach",
      text,
    },
  ]);
}

function sendChatMessage(rawText: string) {
  const text = rawText.trim();
  if (!text) return;

  const reply = buildCoachReply(text);

  setChatMessages((prev) => [
    ...prev,
    {
      id: `${Date.now()}-user`,
      role: "user",
      text,
    },
    {
      id: `${Date.now()}-coach`,
      role: "coach",
      text: reply,
    },
  ]);

  setChatInput("");
}

  const trendLabels = useMemo(
    () =>
      last7.map((x) =>
        new Date(`${x.log_date}T00:00:00`).toLocaleDateString(undefined, {
          weekday: "short",
        })
      ),
    [last7]
  );

  const intakeTrend = last7.map((x) => n(x.calorie_intake, 0));
  const burnTrend = last7.map((x) => n(x.calories_burned, 0));
  const recoveryTrend = last7.map((x) => n(x.sleep_hours, 0));

  const trendMax = Math.max(1, ...intakeTrend, ...burnTrend, ...recoveryTrend.map((v) => v * 250));

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/12 to-white/5 p-6 backdrop-blur-md">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-white/45">Arjun Says</div>
            <h1 className="mt-2 text-3xl font-bold text-white">Today is still fixable.</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
              Short, direct, and useful. This page is your daily coach desk — less overthinking,
              more next-right-move energy.
            </p>
            <div className="mt-3 text-xs text-white/45">
              {todayIso} • {email}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => router.push("/log")}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              ➕ Log Data
            </button>
            <button
              onClick={() => router.push("/log-workout")}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              🏋️ Log Workout
            </button>
            <button
              onClick={() => router.push("/analysis")}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              🧠 Open Analysis
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="glass rounded-3xl p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-white/40">
                Arjun Says: today’s truth
              </div>
              <h2 className="mt-2 text-2xl font-bold text-white">{status.title}</h2>
              <p className="mt-2 text-sm text-white/60">Daily guidance, not a data dump.</p>
            </div>
            <div
              className={cx(
                "rounded-full px-3 py-1 text-xs font-semibold",
                status.tone === "ok" && "bg-emerald-400/15 text-emerald-300",
                status.tone === "mid" && "bg-amber-400/15 text-amber-300",
                status.tone === "warn" && "bg-red-400/15 text-red-300"
              )}
            >
              {status.tone === "ok"
                ? "Good momentum"
                : status.tone === "mid"
                ? "Tighten up"
                : "Needs attention"}
            </div>
          </div>

          <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/75">
            {coachSummary}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-wide text-white/45">Coach score</div>
              <div className="mt-2 text-3xl font-bold text-white">{round(consistency)}</div>
              <div className="mt-1 text-xs text-white/50">Today’s consistency out of 100</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-wide text-white/45">Main gap</div>
              <div className="mt-2 text-lg font-bold text-white">
                {priorities[0]?.title || "Keep momentum"}
              </div>
              <div className="mt-1 text-xs text-white/50">Highest-value thing to fix first</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-wide text-white/45">Arjun says</div>
              <div className="mt-2 text-lg font-bold text-white">Do the next easy win</div>
              <div className="mt-1 text-xs text-white/50">Protein first. Drama later.</div>
            </div>
          </div>
        </div>

        <div className="glass rounded-3xl p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-white/40">
            Arjun Says: fix these first
          </div>
          <h2 className="mt-2 text-2xl font-bold text-white">Top 3 priorities</h2>
          <p className="mt-2 text-sm text-white/60">
            Before you try to perfect the day, fix the highest-value weak spots.
          </p>

          <div className="mt-5 space-y-3">
            {priorities.map((item, i) => (
              <div key={item.title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-white/40">
                      Priority {i + 1}
                    </div>
                    <div className="mt-1 text-base font-bold text-white">{item.title}</div>
                    <div className="mt-2 text-sm leading-6 text-white/70">{item.detail}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(item.href)}
                    className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                  >
                    {item.cta}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="glass rounded-3xl p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-white/40">
            Arjun Says: ask anything
          </div>
          <h2 className="mt-2 text-2xl font-bold text-white">Coach prompts</h2>
          <p className="mt-2 text-sm text-white/60">
            This is the first interactive step. Later this becomes full AI chat.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { key: "today", label: "What should I do today?" },
              { key: "calories", label: "How do I fix calories?" },
              { key: "train", label: "Should I train today?" },
              { key: "eat", label: "What should I eat next?" },
              { key: "week", label: "What should I focus on this week?" },
            ].map((q) => {
              const active = selectedPrompt === q.key;
              return (
                <button
                  key={q.key}
                  type="button"
                  onClick={() => {
  setSelectedPrompt(q.key as PromptKey);

  const promptText = q.label;
  const reply =
    q.key === "today"
      ? priorities[0]?.detail || askCoachAnswer
      : q.key === "calories"
      ? buildCoachReply("calories")
      : q.key === "train"
      ? buildCoachReply("train today")
      : q.key === "eat"
      ? buildCoachReply("what should i eat next")
      : buildCoachReply("what should i focus on this week");

  setChatMessages((prev) => [
    ...prev,
    {
      id: `${Date.now()}-prompt-user`,
      role: "user",
      text: promptText,
    },
    {
      id: `${Date.now()}-prompt-coach`,
      role: "coach",
      text: reply,
    },
  ]);
}}
                  className={cx(
                    "rounded-2xl border px-4 py-2 text-sm font-semibold transition",
                    active
                      ? "border-white/20 bg-white/10 text-white"
                      : "border-white/10 bg-black/20 text-white/65 hover:bg-black/30"
                  )}
                >
                  {q.label}
                </button>
              );
            })}
          </div>

          <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-4">
  <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1">
    {chatMessages.map((message) => (
      <div
        key={message.id}
        className={cx(
          "max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6",
          message.role === "coach"
            ? "bg-white/8 text-white/80"
            : "ml-auto bg-white text-black"
        )}
      >
        {message.text}
      </div>
    ))}
  </div>

  <div className="mt-4 flex gap-2">
    <input
      value={chatInput}
      onChange={(e) => setChatInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          sendChatMessage(chatInput);
        }
      }}
      placeholder="Ask Arjun Says anything about today..."
      className="flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none"
    />
    <button
      type="button"
      onClick={() => sendChatMessage(chatInput)}
      className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-semibold text-black hover:opacity-95"
    >
      Send
    </button>
  </div>
</div>
        </div>

        <div className="glass rounded-3xl p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-white/40">Quick actions</div>
          <h2 className="mt-2 text-2xl font-bold text-white">Fast moves</h2>
          <p className="mt-2 text-sm text-white/60">
            Because sometimes the best coaching is one tap away.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {quickActions.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => router.push(item.href)}
                className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:bg-black/30"
              >
                <div className="text-base font-bold text-white">{item.label}</div>
                <div className="mt-1 text-sm text-white/60">{item.sub}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
        <div className="glass rounded-3xl p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-white/40">Slim diagnostics</div>
          <h2 className="mt-2 text-2xl font-bold text-white">Today at a glance</h2>
          <p className="mt-2 text-sm text-white/60">
            Enough data to guide action. Not enough to overwhelm you.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Pill
              label="Calories"
              value={`${round(intake)} kcal`}
              sub={targetCalories > 0 ? `Target ${round(targetCalories)}` : "Set target in Profile"}
            />
            <Pill
              label="Burn"
              value={`${round(burn)} kcal`}
              sub={targetBurn > 0 ? `Target ${round(targetBurn)}` : "From workout logs"}
            />
            <Pill
              label="Protein"
              value={`${round(protein)} g`}
              sub={targetProtein > 0 ? `Target ${round(targetProtein)}` : "Nutrition quality"}
            />
            <Pill
              label="Recovery"
              value={`${round(sleep)}h / ${round(water)}L`}
              sub={`${steps} steps • ${workouts} workouts`}
            />
          </div>
        </div>

        <div className="glass rounded-3xl p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-white/40">
            Arjun Says: today’s plan
          </div>
          <h2 className="mt-2 text-2xl font-bold text-white">Win the day like this</h2>
          <p className="mt-2 text-sm text-white/60">A tiny operating plan for the rest of the day.</p>

          <div className="mt-5 grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-wide text-white/40">Main focus</div>
              <div className="mt-1 text-base font-bold text-white">{todayPlan.mainFocus}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-wide text-white/40">Secondary focus</div>
              <div className="mt-1 text-base font-bold text-white">{todayPlan.secondaryFocus}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-wide text-white/40">Avoid this</div>
              <div className="mt-1 text-base font-bold text-white">{todayPlan.avoid}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-wide text-white/40">Win condition</div>
              <div className="mt-1 text-sm leading-6 text-white/75">{todayPlan.winCondition}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="glass rounded-3xl p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-white/40">7-day signal</div>
            <h2 className="mt-2 text-2xl font-bold text-white">Recent momentum</h2>
            <p className="mt-2 text-sm text-white/60">
              A lighter trend view than Analysis — just enough for daily context.
            </p>
          </div>
          <div className="text-xs text-white/45">
            Arjun says: trends matter, but today still matters more.
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3 xl:grid-cols-7">
          {last7.map((row, i) => (
            <div key={row.log_date} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-wide text-white/45">
                {trendLabels[i] || row.log_date}
              </div>
              <div className="mt-4 space-y-3">
                <MiniBar label="Intake" value={intakeTrend[i] || 0} max={trendMax} tone="bg-white/75" />
                <MiniBar label="Burn" value={burnTrend[i] || 0} max={trendMax} tone="bg-emerald-300/75" />
                <MiniBar
                  label="Recovery"
                  value={(recoveryTrend[i] || 0) * 250}
                  max={trendMax}
                  tone="bg-purple-300/75"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Pill
            label="Weekly Avg Intake"
            value={`${round(
              last7.reduce((s, x) => s + n(x.calorie_intake, 0), 0) / Math.max(1, last7.length)
            )} kcal`}
          />
          <Pill
            label="Weekly Avg Burn"
            value={`${round(
              last7.reduce((s, x) => s + n(x.calories_burned, 0), 0) / Math.max(1, last7.length)
            )} kcal`}
          />
          <Pill
            label="Weekly Avg Sleep"
            value={`${round(
              last7.reduce((s, x) => s + n(x.sleep_hours, 0), 0) / Math.max(1, last7.length)
            )} h`}
          />
          <Pill
            label="Weekly Avg Water"
            value={`${round(
              last7.reduce((s, x) => s + n(x.water_l, 0), 0) / Math.max(1, last7.length)
            )} L`}
          />
        </div>
      </div>

      {loading && <div className="text-sm text-white/50">Loading Arjun Says...</div>}
      {msg && <div className="text-sm text-red-300">{msg}</div>}
    </div>
  );
}