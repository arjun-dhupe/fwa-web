"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round(v: number) {
  return Math.round(v * 10) / 10;
}

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

function pct(value: number) {
  return `${Math.round(value)}%`;
}

function ymdLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startDateFromDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  return ymdLocal(d);
}

const ranges = [
  { key: "week", label: "Weekly", days: 7 },
  { key: "biweek", label: "Bi-Weekly", days: 14 },
  { key: "month", label: "Monthly", days: 30 },
  { key: "quarter", label: "Quarterly", days: 90 },
  { key: "half", label: "Half-Year", days: 180 },
  { key: "year", label: "Yearly", days: 365 },
] as const;

type RangeKey = (typeof ranges)[number]["key"];

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
  calorie_delta?: number | null;
  protein_delta?: number | null;
  burn_delta?: number | null;
  hit_calorie_target?: boolean | null;
  hit_protein_target?: boolean | null;
  hit_burn_target?: boolean | null;
  hit_water_target?: boolean | null;
  hit_sleep_target?: boolean | null;
  consistency_score?: number | null;
};

type AskPrompt = "month" | "quarter" | "fatloss" | "sleep" | "burn";

function GlassCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-3xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-white/60">{subtitle}</p> : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Pill({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <div className="text-xs uppercase tracking-wide text-white/45">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      {sub ? <div className="mt-1 text-xs text-white/50">{sub}</div> : null}
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  suffix = "",
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
}) {
  const width = max > 0 ? Math.max(6, Math.min(100, (value / max) * 100)) : 6;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <div className="text-white/70">{label}</div>
        <div className="font-semibold text-white">{round(value)}{suffix}</div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full bg-white/70" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default function AnalysisPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [selectedPrompt, setSelectedPrompt] = useState<AskPrompt | null>(null);

  const range = ranges.find((r) => r.key === rangeKey)!;

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setLoading(false);
        return;
      }

      setUserId(data.user.id);

      const startIso = startDateFromDays(range.days);

      const { data: rows, error } = await supabase
        .from("daily_analysis_snapshots")
        .select("*")
        .eq("user_id", data.user.id)
        .gte("log_date", startIso)
        .order("log_date", { ascending: true });

      if (error) {
        setMsg(error.message);
        setSnapshots([]);
        setLoading(false);
        return;
      }

      setSnapshots((rows || []) as Snapshot[]);
      setLoading(false);
    })();
  }, [rangeKey]);

  const totals = useMemo(() => {
    const count = snapshots.length || 1;
    const calorieIntake = snapshots.reduce((s, x) => s + num(x.calorie_intake), 0);
    const protein = snapshots.reduce((s, x) => s + num(x.protein_g), 0);
    const burn = snapshots.reduce((s, x) => s + num(x.calories_burned), 0);
    const water = snapshots.reduce((s, x) => s + num(x.water_l), 0);
    const sleep = snapshots.reduce((s, x) => s + num(x.sleep_hours), 0);
    const steps = snapshots.reduce((s, x) => s + num(x.steps), 0);
    const workouts = snapshots.reduce((s, x) => s + num(x.workout_sessions), 0);
    const calorieHits = snapshots.filter((x) => x.hit_calorie_target).length;
    const proteinHits = snapshots.filter((x) => x.hit_protein_target).length;
    const burnHits = snapshots.filter((x) => x.hit_burn_target).length;
    const waterHits = snapshots.filter((x) => x.hit_water_target).length;
    const sleepHits = snapshots.filter((x) => x.hit_sleep_target).length;
    const consistency = snapshots.reduce((s, x) => s + num(x.consistency_score), 0) / count;

    return {
      calorieIntake,
      protein,
      burn,
      water,
      sleep,
      steps,
      workouts,
      count,
      avgCalories: calorieIntake / count,
      avgProtein: protein / count,
      avgBurn: burn / count,
      avgWater: water / count,
      avgSleep: sleep / count,
      avgSteps: steps / count,
      avgWorkouts: workouts / count,
      calorieHits,
      proteinHits,
      burnHits,
      waterHits,
      sleepHits,
      consistency,
    };
  }, [snapshots]);

  const disciplineScore = useMemo(() => {
    if (snapshots.length === 0) return 0;

    const hitRateAvg =
      ((totals.calorieHits + totals.proteinHits + totals.burnHits + totals.waterHits + totals.sleepHits) /
        (snapshots.length * 5)) *
      100;

    const score = round(hitRateAvg * 0.65 + totals.consistency * 0.35);
    return Math.max(0, Math.min(100, score));
  }, [snapshots, totals]);

  const wentWell = useMemo(() => {
    const items: string[] = [];
    if (totals.proteinHits >= Math.max(3, Math.floor(snapshots.length * 0.6))) {
      items.push(`Protein target was hit on ${totals.proteinHits} days — strong nutrition discipline.`);
    }
    if (totals.burn > 0 && totals.avgWorkouts >= 0.6) {
      items.push(`You maintained regular movement with ${Math.round(totals.workouts)} logged workout sessions.`);
    }
    if (totals.avgSleep >= 7) {
      items.push(`Recovery looks solid with an average sleep of ${round(totals.avgSleep)} hours.`);
    }
    if (totals.avgWater >= 2.5) {
      items.push(`Hydration stayed respectable at ${round(totals.avgWater)}L per day on average.`);
    }
    if (items.length === 0) {
      items.push("You are building the habit base. The most important thing is that data is now visible and actionable.");
    }
    return items.slice(0, 3);
  }, [totals, snapshots.length]);

  const wentBad = useMemo(() => {
    const items: string[] = [];
    if (totals.avgSleep > 0 && totals.avgSleep < 7) {
      items.push(`Sleep averaged only ${round(totals.avgSleep)}h, which is likely holding back recovery.`);
    }
    if (totals.avgWater > 0 && totals.avgWater < 2.5) {
      items.push(`Water intake averaged ${round(totals.avgWater)}L, below a strong daily rhythm.`);
    }
    if (totals.calorieHits < Math.max(2, Math.floor(snapshots.length * 0.4))) {
      items.push(`Calorie adherence was inconsistent — only ${totals.calorieHits} days were close to target.`);
    }
    if (totals.burnHits < Math.max(2, Math.floor(snapshots.length * 0.4))) {
      items.push(`Burn target was not hit often enough to create reliable momentum.`);
    }
    if (items.length === 0) {
      items.push("No major weak area stands out in this time range — now focus on compounding the basics.");
    }
    return items.slice(0, 3);
  }, [totals, snapshots.length]);

  const overdid = useMemo(() => {
    const items: string[] = [];
    const highBurnDays = snapshots.filter((x) => num(x.burn_delta) > Math.max(250, num(x.target_burn) * 0.4)).length;
    const highCalorieDays = snapshots.filter((x) => num(x.calorie_delta) > Math.max(300, num(x.target_calories) * 0.15)).length;
    const proteinHighDays = snapshots.filter((x) => num(x.protein_delta) > 40).length;

    if (highBurnDays > 0) items.push(`You pushed burn significantly above target on ${highBurnDays} day(s). Watch recovery.`);
    if (highCalorieDays > 0) items.push(`Calorie intake spiked well above target on ${highCalorieDays} day(s).`);
    if (proteinHighDays > 0) items.push(`Protein overshot target by 40g+ on ${proteinHighDays} day(s). More isn't always better.`);
    if (items.length === 0) items.push("No clear overdoing pattern detected in this period.");
    return items.slice(0, 3);
  }, [snapshots]);

  const patterns = useMemo(() => {
    const items: string[] = [];
    if (snapshots.length > 0) {
      const weekdayMap = new Map<string, number>();
      for (const row of snapshots) {
        const name = new Date(`${row.log_date}T00:00:00`).toLocaleDateString([], { weekday: "long" });
        weekdayMap.set(name, (weekdayMap.get(name) || 0) + num(row.workout_sessions));
      }
      const sorted = [...weekdayMap.entries()].sort((a, b) => b[1] - a[1]);
      if (sorted[0]?.[1] > 0) {
        items.push(`Most training tends to happen on ${sorted[0][0]}.`);
      }
    }

    const lowWaterDays = snapshots.filter((x) => num(x.water_l) > 0 && num(x.water_l) < 2).length;
    if (lowWaterDays >= 2) items.push(`Hydration dipped below 2L on ${lowWaterDays} days.`);

    const lowSleepDays = snapshots.filter((x) => num(x.sleep_hours) > 0 && num(x.sleep_hours) < 6.5).length;
    if (lowSleepDays >= 2) items.push(`Recovery risk pattern: ${lowSleepDays} low-sleep day(s) detected.`);

    if (items.length === 0) items.push("Your current data does not yet show a strong repeated pattern — keep logging to unlock sharper insights.");
    return items.slice(0, 3);
  }, [snapshots]);

  const nextPlan = useMemo(() => {
    const actions: string[] = [];

    if (totals.avgSleep < 7) actions.push("Target 7 to 7.5 hours of sleep consistently before pushing harder on training.");
    if (totals.avgWater < 2.5) actions.push("Raise hydration by 0.5L to 1L daily and make it non-negotiable.");
    if (totals.proteinHits < Math.floor(Math.max(3, snapshots.length * 0.6))) actions.push("Anchor each day with at least one high-protein meal and close the protein gap earlier in the day.");
    if (totals.burnHits < Math.floor(Math.max(3, snapshots.length * 0.6))) actions.push("Add 2 to 3 more structured activity blocks each week to improve burn consistency.");
    if (totals.calorieHits < Math.floor(Math.max(3, snapshots.length * 0.6))) actions.push("Tighten calorie control on the days that usually drift off-plan.");

    if (actions.length === 0) {
      actions.push("Maintain your current structure and focus on repeating the same quality days more often.");
      actions.push("Use this next period to improve slightly, not dramatically — consistency is already working.");
    }

    return actions.slice(0, 4);
  }, [totals, snapshots.length]);

  const askAnswer = useMemo(() => {
    if (!selectedPrompt) return "";

    if (selectedPrompt === "month") {
      return `For the next month, focus on consistency over intensity. Aim for about ${Math.max(3, Math.round(totals.avgWorkouts * 7))} workout touches per week, keep protein above ${Math.max(100, Math.round(totals.avgProtein))}g, and treat sleep as a performance tool.`;
    }

    if (selectedPrompt === "quarter") {
      return "For the next quarter, build a repeatable system: stable calories, stronger weekly workout rhythm, and fewer low-recovery days. Your goal should be fewer chaotic days, not more extreme days.";
    }

    if (selectedPrompt === "fatloss") {
      return "If fat loss is the goal, your best lever is calorie consistency plus reliable burn. Keep intake tighter on drift days and create 2 to 3 repeatable activity anchors each week.";
    }

    if (selectedPrompt === "sleep") {
      return `Your sleep average is ${round(totals.avgSleep)}h. The next big win is getting that closer to 7 to 7.5h because recovery will improve everything else.`;
    }

    return `Your current burn average is ${round(totals.avgBurn)} kcal/day. The best next target is to make that number more consistent, not necessarily much higher.`;
  }, [selectedPrompt, totals]);

  const fitnessDNA = useMemo(() => {
    if (disciplineScore >= 80) {
      return {
        title: "The Consistent Builder",
        text: "You respond well to structure. Your best results will come from repeating strong basics, not chasing extremes.",
      };
    }
    if (totals.workouts > 0 && totals.avgSleep < 6.8) {
      return {
        title: "The Recovery Challenger",
        text: "You are willing to put in effort, but recovery may be limiting how much progress you actually keep.",
      };
    }
    if (totals.calorieHits < Math.max(2, Math.floor(snapshots.length * 0.4))) {
      return {
        title: "The Weekend Drifter",
        text: "You have the ability to stay on track, but consistency drops often enough to reduce the overall result.",
      };
    }
    return {
      title: "The Momentum Starter",
      text: "You are in the phase where habits are forming. The next jump comes from stringing good days together more often.",
    };
  }, [disciplineScore, totals, snapshots.length]);

  const trendBars = useMemo(() => {
    const days = snapshots.map((x) => ({
      date: x.log_date,
      intake: num(x.calorie_intake),
      burn: num(x.calories_burned),
      protein: num(x.protein_g),
    }));
    return days.slice(-8);
  }, [snapshots]);

  const maxTrend = useMemo(() => {
    return Math.max(
      1,
      ...trendBars.flatMap((d) => [d.intake, d.burn, d.protein])
    );
  }, [trendBars]);

  return (
    <div className="space-y-6">
      <div className="glass rounded-3xl p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Performance Analysis</h1>
            <p className="mt-1 text-white/60">
              Your personal fitness intelligence report — what worked, what drifted, what to improve next.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
            {loading ? "Loading analysis..." : `${snapshots.length} day snapshots analyzed`}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {ranges.map((r) => {
          const active = rangeKey === r.key;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setRangeKey(r.key)}
              className={cx(
                "rounded-2xl border px-4 py-2 text-sm font-semibold transition",
                active
                  ? "border-white/20 bg-white/10 text-white"
                  : "border-white/10 bg-black/20 text-white/60 hover:bg-black/30"
              )}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {msg ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{msg}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Pill label="Discipline Score" value={`${round(disciplineScore)}/100`} sub="Consistency + target adherence" />
        <Pill label="Avg Intake" value={`${round(totals.avgCalories)} kcal`} sub={`${round(totals.calorieIntake)} total`} />
        <Pill label="Avg Burn" value={`${round(totals.avgBurn)} kcal`} sub={`${round(totals.burn)} total`} />
        <Pill label="Avg Protein" value={`${round(totals.avgProtein)} g`} sub={`${round(totals.protein)} total`} />
        <Pill label="Workout Rhythm" value={round(totals.avgWorkouts)} sub={`${Math.round(totals.workouts)} sessions`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <GlassCard title="Performance Breakdown" subtitle="Averages and hit rates across the selected time range.">
          <div className="space-y-4">
            <BarRow label="Calorie target hit rate" value={(totals.calorieHits / Math.max(1, snapshots.length)) * 100} max={100} suffix="%" />
            <BarRow label="Protein target hit rate" value={(totals.proteinHits / Math.max(1, snapshots.length)) * 100} max={100} suffix="%" />
            <BarRow label="Burn target hit rate" value={(totals.burnHits / Math.max(1, snapshots.length)) * 100} max={100} suffix="%" />
            <BarRow label="Hydration hit rate" value={(totals.waterHits / Math.max(1, snapshots.length)) * 100} max={100} suffix="%" />
            <BarRow label="Sleep hit rate" value={(totals.sleepHits / Math.max(1, snapshots.length)) * 100} max={100} suffix="%" />
          </div>
        </GlassCard>

        <GlassCard title="Fitness DNA" subtitle="A personality-style reading based on your recent behavior.">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm uppercase tracking-wide text-white/45">Your type</div>
            <div className="mt-2 text-2xl font-bold text-white">{fitnessDNA.title}</div>
            <div className="mt-3 text-sm leading-6 text-white/70">{fitnessDNA.text}</div>
          </div>
        </GlassCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <GlassCard title="What went well" subtitle="Wins worth preserving.">
          <div className="space-y-3">
            {wentWell.map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/75">
                ✅ {item}
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard title="What needs work" subtitle="Weak spots reducing results.">
          <div className="space-y-3">
            {wentBad.map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/75">
                ⚠️ {item}
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard title="What you may be overdoing" subtitle="Important so progress stays sustainable.">
          <div className="space-y-3">
            {overdid.map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/75">
                🔥 {item}
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <GlassCard title="Pattern detection" subtitle="Behavior clues from your actual logs.">
          <div className="space-y-3">
            {patterns.map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/75">
                🧩 {item}
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard title="Next period strategy" subtitle={`What to focus on for the next ${range.label.toLowerCase()} block.`}>
          <div className="space-y-3">
            {nextPlan.map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/75">
                ➜ {item}
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      <GlassCard title="Trend snapshot" subtitle="A quick visual feel for how intake, burn, and protein have moved lately.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {trendBars.map((d) => (
            <div key={d.date} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-wide text-white/45">{d.date}</div>
              <div className="mt-4 space-y-3">
                <BarRow label="Intake" value={d.intake} max={maxTrend} suffix="" />
                <BarRow label="Burn" value={d.burn} max={maxTrend} suffix="" />
                <BarRow label="Protein" value={d.protein} max={maxTrend} suffix="" />
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard title="Ask your analysis" subtitle="Interactive planning prompts based on your data.">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "month", label: "What should I follow for a month?" },
            { key: "quarter", label: "What should I target this quarter?" },
            { key: "fatloss", label: "How should I approach fat loss?" },
            { key: "sleep", label: "How do I improve recovery?" },
            { key: "burn", label: "What should my activity target be?" },
          ].map((x) => {
            const active = selectedPrompt === x.key;
            return (
              <button
                key={x.key}
                type="button"
                onClick={() => setSelectedPrompt(x.key as AskPrompt)}
                className={cx(
                  "rounded-2xl border px-4 py-2 text-sm font-semibold transition",
                  active
                    ? "border-white/20 bg-white/10 text-white"
                    : "border-white/10 bg-black/20 text-white/65 hover:bg-black/30"
                )}
              >
                {x.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-3xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/75">
          {selectedPrompt ? askAnswer : "Choose a question above and the page will suggest a next-step answer from your current data."}
        </div>
      </GlassCard>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Pill label="Water Avg" value={`${round(totals.avgWater)}L`} sub={`${totals.waterHits}/${snapshots.length || 0} days hit`} />
        <Pill label="Sleep Avg" value={`${round(totals.avgSleep)}h`} sub={`${totals.sleepHits}/${snapshots.length || 0} days hit`} />
        <Pill label="Avg Steps" value={Math.round(totals.avgSteps)} sub={`${Math.round(totals.steps)} total`} />
        <Pill label="Calorie Hits" value={pct((totals.calorieHits / Math.max(1, snapshots.length)) * 100)} />
        <Pill label="Protein Hits" value={pct((totals.proteinHits / Math.max(1, snapshots.length)) * 100)} />
        <Pill label="Burn Hits" value={pct((totals.burnHits / Math.max(1, snapshots.length)) * 100)} />
      </div>
    </div>
  );
}