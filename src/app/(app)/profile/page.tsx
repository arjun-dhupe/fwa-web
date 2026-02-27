"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type Gender = "male" | "female" | "other" | "prefer_not_to_say";
type GoalType = "general_fitness" | "fat_loss" | "muscle_gain" | "endurance";
type ActivityLevel = "sedentary" | "light" | "moderate" | "very_active" | "athlete";
type BodyType = "slim" | "average" | "athletic" | "curvy" | "stocky";

function cx(...s: (string | false | null | undefined)[]) {
  return s.filter(Boolean).join(" ");
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass glow-ring rounded-2xl p-4">
      <div className="text-lg font-extrabold tracking-tight text-white">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function clampNum(v: any, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function round(n: number) {
  return Math.round(n);
}

function activityMultiplier(level: ActivityLevel) {
  switch (level) {
    case "sedentary":
      return 1.2;
    case "light":
      return 1.375;
    case "moderate":
      return 1.55;
    case "very_active":
      return 1.725;
    case "athlete":
      return 1.9;
    default:
      return 1.2;
  }
}

function mifflinStJeorBmr({
  kg,
  cm,
  age,
  gender,
}: {
  kg: number;
  cm: number;
  age: number;
  gender: Gender;
}) {
  // Men: 10*kg + 6.25*cm - 5*age + 5
  // Women: 10*kg + 6.25*cm - 5*age - 161
  // Other/unknown: neutral constant (0)
  const base = 10 * kg + 6.25 * cm - 5 * age;
  const k = gender === "male" ? 5 : gender === "female" ? -161 : 0;
  return base + k;
}

function goalAdjustment(goal: GoalType) {
  // Conservative adjustment from maintenance
  switch (goal) {
    case "fat_loss":
      return { pct: -0.18, label: "Cut" };
    case "muscle_gain":
      return { pct: 0.12, label: "Lean bulk" };
    case "endurance":
      return { pct: 0.05, label: "Performance" };
    case "general_fitness":
    default:
      return { pct: 0, label: "Maintain" };
  }
}

function proteinPerKg(goal: GoalType) {
  switch (goal) {
    case "fat_loss":
      return 1.8;
    case "muscle_gain":
      return 1.7;
    case "endurance":
      return 1.5;
    case "general_fitness":
    default:
      return 1.4;
  }
}

function suggestedActiveBurn(goal: GoalType, maintenance: number, target: number) {
  const gap = Math.max(0, maintenance - target);
  if (goal === "fat_loss") return clampNum(Math.max(300, Math.min(550, gap)), 150, 800) ?? 350;
  if (goal === "muscle_gain") return 250;
  if (goal === "endurance") return 350;
  return 250;
}

export default function ProfilePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  // Profile
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("prefer_not_to_say");
  const [ageYears, setAgeYears] = useState<string>("");
  const [heightCm, setHeightCm] = useState<string>("");
  const [weightKg, setWeightKg] = useState<string>("");
  const [bodyType, setBodyType] = useState<BodyType>("average");
  const [activity, setActivity] = useState<ActivityLevel>("light");

  // Goal (no manual goals like steps anymore)
  const [goalType, setGoalType] = useState<GoalType>("general_fitness");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const computed = useMemo(() => {
    const kg = clampNum(weightKg, 25, 300);
    const cm = clampNum(heightCm, 120, 230);
    const age = clampNum(ageYears, 13, 95);

    if (!kg || !cm || !age) {
      return {
        ready: false,
        kg: kg ?? null,
        cm: cm ?? null,
        age: age ?? null,
        bmr: null as number | null,
        maintenance: null as number | null,
        target: null as number | null,
        delta: null as number | null,
        proteinG: null as number | null,
        activeBurn: null as number | null,
        label: "",
      };
    }

    const bmr = mifflinStJeorBmr({ kg, cm, age, gender });
    const maintenance = bmr * activityMultiplier(activity);
    const adj = goalAdjustment(goalType);

    const rawTarget = maintenance * (1 + adj.pct);
    const floor = Math.max(1200, kg * 18);
    const ceil = Math.min(4500, kg * 55);
    const target = Math.max(floor, Math.min(ceil, rawTarget));

    const delta = target - maintenance;

    const ppk = proteinPerKg(goalType);
    const proteinG = Math.round(ppk * kg);

    const activeBurn = suggestedActiveBurn(goalType, maintenance, target);

    return {
      ready: true,
      kg,
      cm,
      age,
      bmr,
      maintenance,
      target,
      delta,
      proteinG,
      activeBurn,
      label: adj.label,
    };
  }, [weightKg, heightCm, ageYears, gender, activity, goalType]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }

      setUserId(data.user.id);
      setEmail(data.user.email ?? "");

      // Load profile
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (profErr) {
        setMsg(profErr.message);
        return;
      }

      if (prof) {
        setName(prof.name ?? "");
        setHeightCm(prof.height_cm ? String(prof.height_cm) : "");
        setWeightKg(prof.weight_kg ? String(prof.weight_kg) : "");

        if (prof.gender) setGender(prof.gender as Gender);
        if (prof.age_years != null) setAgeYears(String(prof.age_years));
        if (prof.body_type) setBodyType(prof.body_type as BodyType);
        if (prof.activity_level) setActivity(prof.activity_level as ActivityLevel);
        if (prof.goal_type) setGoalType(prof.goal_type as GoalType);
      }

      // Fallback: if you historically stored goal_type in goals table
      const { data: goals } = await supabase
        .from("goals")
        .select("goal_type")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (goals?.goal_type && !prof?.goal_type) {
        setGoalType(goals.goal_type as GoalType);
      }
    })();
  }, [router]);

  async function saveAll() {
    setMsg("");
    if (!userId) return;

    try {
      setSaving(true);

      const profPayload: any = {
        user_id: userId,
        name: name.trim() || null,
        height_cm: heightCm.trim() === "" ? null : parseInt(heightCm, 10),
        weight_kg: weightKg.trim() === "" ? null : parseFloat(weightKg),

        // richer profile (best effort)
        gender,
        age_years: ageYears.trim() === "" ? null : parseInt(ageYears, 10),
        body_type: bodyType,
        activity_level: activity,
        goal_type: goalType,
      };

      let { error: profErr } = await supabase.from("profiles").upsert(profPayload, { onConflict: "user_id" });

      // If columns don't exist yet, retry without them
      if (profErr && typeof profErr.message === "string" && profErr.message.toLowerCase().includes("column")) {
        const { gender: _g, age_years: _a, body_type: _b, activity_level: _al, goal_type: _gt, ...fallback } =
          profPayload;

        const retry = await supabase.from("profiles").upsert(fallback, { onConflict: "user_id" });
        profErr = retry.error;
      }

      if (profErr) throw profErr;

      // Auto-write computed targets to goals table (so other pages can read it)
      const caloriesTarget = computed.ready && computed.target ? round(computed.target) : 2000;
      const waterTarget = 2000;
      const sleepTarget = 8;

      const { error: goalsErr } = await supabase.from("goals").upsert(
        {
          user_id: userId,
          goal_type: goalType,
          calories_target: caloriesTarget,
          water_ml_target: waterTarget,
          sleep_hours_target: sleepTarget,
          // steps/workouts intentionally NOT set here anymore
        },
        { onConflict: "user_id" }
      );

      if (goalsErr) {
        setMsg(`✅ Saved profile. (Goals not saved: ${goalsErr.message})`);
        setTimeout(() => setMsg(""), 1800);
        return;
      }

      setMsg("✅ Saved!");
      setTimeout(() => setMsg(""), 1200);
    } catch (e: any) {
      setMsg(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const deltaLabel =
    computed.ready && computed.delta != null
      ? computed.delta < 0
        ? `Deficit ~${round(Math.abs(computed.delta))} kcal/day`
        : computed.delta > 0
          ? `Surplus ~${round(computed.delta)} kcal/day`
          : "Maintain"
      : "";

  return (
    <div className="space-y-4">
      <div className="glass glow-ring rounded-2xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white">Your Fitness Profile</h1>
            <p className="text-sm text-white/70">{email}</p>
            <p className="mt-1 text-xs text-white/50">Fill this once — we’ll automatically generate your daily targets.</p>
          </div>

          <button
            onClick={logout}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-semibold text-white/80 hover:bg-black/40"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="🧬 About you">
          <div className="grid gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40"
            />

            <div className="grid gap-2 md:grid-cols-3">
              <div>
                <label className="text-xs text-white/60">Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as Gender)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                >
                  <option value="prefer_not_to_say">Prefer not to say</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-white/60">Age</label>
                <input
                  value={ageYears}
                  onChange={(e) => setAgeYears(e.target.value)}
                  placeholder="Years"
                  inputMode="numeric"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40"
                />
              </div>

              <div>
                <label className="text-xs text-white/60">Body type</label>
                <select
                  value={bodyType}
                  onChange={(e) => setBodyType(e.target.value as BodyType)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                >
                  <option value="slim">Slim</option>
                  <option value="average">Average</option>
                  <option value="athletic">Athletic</option>
                  <option value="curvy">Curvy</option>
                  <option value="stocky">Stocky</option>
                </select>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <div>
                <label className="text-xs text-white/60">Height (cm)</label>
                <input
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  placeholder="e.g., 175"
                  inputMode="numeric"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40"
                />
              </div>

              <div>
                <label className="text-xs text-white/60">Weight (kg)</label>
                <input
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  placeholder="e.g., 72"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40"
                />
              </div>

              <div>
                <label className="text-xs text-white/60">Activity</label>
                <select
                  value={activity}
                  onChange={(e) => setActivity(e.target.value as ActivityLevel)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                >
                  <option value="sedentary">Sedentary (mostly sitting)</option>
                  <option value="light">Light (walks / light workouts)</option>
                  <option value="moderate">Moderate (3–5x/week)</option>
                  <option value="very_active">Very active (hard training)</option>
                  <option value="athlete">Athlete (2x/day / manual labor)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-white/60">Goal</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    { k: "general_fitness", label: "General fitness" },
                    { k: "fat_loss", label: "Fat loss" },
                    { k: "muscle_gain", label: "Muscle gain" },
                    { k: "endurance", label: "Endurance" },
                  ] as { k: GoalType; label: string }[]
                ).map((g) => (
                  <button
                    key={g.k}
                    type="button"
                    onClick={() => setGoalType(g.k)}
                    className={cx(
                      "rounded-xl px-3 py-2 text-sm font-semibold transition",
                      goalType === g.k ? "bg-emerald-400/20 text-white" : "bg-black/30 text-white/70 hover:bg-black/40"
                    )}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={saveAll}
              disabled={saving}
              className={cx(
                "mt-2 w-full rounded-xl px-3 py-2 text-sm font-extrabold transition",
                saving ? "bg-white/50 text-zinc-900" : "bg-white text-zinc-900 hover:opacity-90"
              )}
            >
              {saving ? "Saving…" : "Save profile"}
            </button>

            {msg && (
              <p className={cx("text-sm", msg.includes("✅") ? "text-emerald-300" : "text-red-300")}>{msg}</p>
            )}

            <p className="text-xs text-white/45">Note: These are approximate estimates for planning, not medical advice.</p>
          </div>
        </Card>

        <Card title="🎯 Your smart targets (auto)">
          {!computed.ready ? (
            <div className="space-y-2">
              <p className="text-sm text-white/70">
                Add <b className="text-white">age</b>, <b className="text-white">height</b>, and{" "}
                <b className="text-white">weight</b> to unlock your personalized targets.
              </p>
              <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-white/60">
                We’ll estimate:
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Maintenance calories</li>
                  <li>Goal-based target intake</li>
                  <li>Suggested daily active burn</li>
                  <li>Protein target</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-white/60">Plan mode</div>
                    <div className="text-lg font-extrabold text-white">{computed.label}</div>
                    <div className="mt-1 text-xs text-white/55">{deltaLabel}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-white/60">Maintenance</div>
                    <div className="text-lg font-extrabold text-white">{round(computed.maintenance!)} kcal</div>
                    <div className="mt-1 text-xs text-white/50">per day</div>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="text-xs text-white/60">Target calorie intake</div>
                    <div className="mt-1 text-2xl font-extrabold text-white">{round(computed.target!)} kcal</div>
                    <div className="mt-1 text-xs text-white/50">This is what we’ll aim to log.</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="text-xs text-white/60">Daily burn target (active)</div>
                    <div className="mt-1 text-2xl font-extrabold text-white">{round(computed.activeBurn!)} kcal</div>
                    <div className="mt-1 text-xs text-white/50">
                      Replaces steps here. Workouts/steps will be its own tab later.
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs text-white/60">Protein target</div>
                      <div className="mt-1 text-xl font-extrabold text-white">{computed.proteinG} g/day</div>
                      <div className="mt-1 text-xs text-white/50">
                        Helps with{" "}
                        {goalType === "fat_loss"
                          ? "satiety + muscle retention"
                          : goalType === "muscle_gain"
                            ? "muscle growth"
                            : "recovery"}
                        .
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-white/60">BMR</div>
                      <div className="text-sm font-bold text-white">{round(computed.bmr!)} kcal</div>
                      <div className="mt-1 text-[11px] text-white/45">base burn</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="text-sm font-extrabold text-white">How this will feel in the app</div>
                <div className="mt-2 space-y-2 text-sm text-white/70">
                  <p>
                    • In <b className="text-white">Log</b>, you’ll simply record meals and we’ll keep you aligned to
                    your target intake.
                  </p>
                  <p>
                    • Here, you can adjust your <b className="text-white">goal</b> or{" "}
                    <b className="text-white">activity</b> and the targets update instantly.
                  </p>
                  <p>
                    • Steps/workouts logging will be a separate tab later — this page stays clean and “profile-first”.
                  </p>
                </div>
              </div>

              <button
                onClick={() => router.push("/today")}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-semibold text-white/85 hover:bg-black/40"
              >
                Back to Today
              </button>
            </div>
          )}
        </Card>
      </div>

      <p className="text-xs text-white/40">Note: This app provides general fitness guidance, not medical advice.</p>
    </div>
  );
}