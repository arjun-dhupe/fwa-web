"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { rebuildDailyAnalysisSnapshot } from "@/lib/analysis";
import { useRouter } from "next/navigation";

type Gender        = "male" | "female" | "other" | "prefer_not_to_say";
type GoalType      = "general_fitness" | "fat_loss" | "muscle_gain" | "endurance";
type ActivityLevel = "sedentary" | "light" | "moderate" | "very_active" | "athlete";
type BodyType      = "slim" | "average" | "athletic" | "curvy" | "stocky";

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">
      {children}
    </div>
  );
}

function clampNum(v: any, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function round(n: number) { return Math.round(n); }

/* ─── Calculation engine (unchanged) ────────────────── */
function calcBMR({ kg, cm, age, gender, bodyType }: {
  kg: number; cm: number; age: number; gender: Gender; bodyType: BodyType;
}): number {
  const genderK = gender === "female" ? -161 : 5;
  const baseBMR = 10 * kg + 6.25 * cm - 5 * age + genderK;
  const bodyTypeCorrection: Record<BodyType, number> = { athletic:1.07, slim:1.03, average:1.00, curvy:0.97, stocky:0.95 };
  const ageFactor = age > 30 ? 1 - ((age - 30) / 10) * 0.018 : 1.0;
  return baseBMR * bodyTypeCorrection[bodyType] * ageFactor;
}

function calcTDEE(bmr: number, activity: ActivityLevel): number {
  const m: Record<ActivityLevel, number> = { sedentary:1.20, light:1.375, moderate:1.55, very_active:1.725, athlete:1.90 };
  return bmr * m[activity];
}

function calcCalorieTarget(maintenance: number, goal: GoalType, kg: number): { target: number; delta: number; label: string } {
  let delta = 0, label = "";
  switch (goal) {
    case "fat_loss":    delta = kg < 65 ? -350 : -500; label = "Cut";         break;
    case "muscle_gain": delta = kg < 70 ? 200  : 250;  label = "Lean bulk";   break;
    case "endurance":   delta = 150;                    label = "Performance"; break;
    default:            delta = 0;                      label = "Maintain";    break;
  }
  const rawTarget = maintenance + delta;
  return { target: Math.max(Math.max(1200, kg * 22), Math.min(Math.min(5000, kg * 55), rawTarget)), delta, label };
}

function calcProtein(kg: number, goal: GoalType): number {
  const g: Record<GoalType, number> = { fat_loss:2.0, muscle_gain:1.8, endurance:1.6, general_fitness:1.5 };
  return Math.round(g[goal] * kg);
}

function calcMacros(targetCalories: number, proteinG: number, goal: GoalType): { carbsG: number; fatG: number } {
  const proteinCalories = proteinG * 4;
  const remaining = Math.max(0, targetCalories - proteinCalories);
  const cf: Record<GoalType, number> = { fat_loss:0.35, muscle_gain:0.55, endurance:0.60, general_fitness:0.50 };
  return { carbsG: Math.round((remaining * cf[goal]) / 4), fatG: Math.round((remaining * (1 - cf[goal])) / 9) };
}

function calcActiveBurnTarget(kg: number, goal: GoalType, maintenance: number, target: number): number {
  const base = Math.round(kg * 3.5);
  switch (goal) {
    case "fat_loss":    return Math.max(base, Math.min(600, Math.max(0, maintenance - target) + 150));
    case "muscle_gain": return Math.max(200, Math.min(350, Math.round(base * 0.7)));
    case "endurance":   return Math.max(350, Math.min(700, Math.round(base * 1.3)));
    default:            return Math.max(250, Math.min(450, base));
  }
}

/* ─── Snapshot of form state for dirty detection ─────── */
type FormSnapshot = {
  name: string; gender: Gender; ageYears: string; heightCm: string;
  weightKg: string; bodyType: BodyType; activity: ActivityLevel; goalType: GoalType;
};

function snapshot(s: Omit<FormSnapshot, never>): string {
  return JSON.stringify(s);
}

/* ─── ProfilePage ────────────────────────────────────── */
export default function ProfilePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string>("");
  const [email,  setEmail]  = useState<string>("");

  const [name,      setName]      = useState("");
  const [gender,    setGender]    = useState<Gender>("prefer_not_to_say");
  const [ageYears,  setAgeYears]  = useState<string>("");
  const [heightCm,  setHeightCm]  = useState<string>("");
  const [weightKg,  setWeightKg]  = useState<string>("");
  const [bodyType,  setBodyType]  = useState<BodyType>("average");
  const [activity,  setActivity]  = useState<ActivityLevel>("light");
  const [goalType,  setGoalType]  = useState<GoalType>("general_fitness");

  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState("");
  const [errors,   setErrors]   = useState<Record<string, string>>({});

  // Track the last-saved state to detect dirty changes
  const savedSnapshot = useRef<string>("");

  const currentSnap = snapshot({ name, gender, ageYears, heightCm, weightKg, bodyType, activity, goalType });
  const isDirty = savedSnapshot.current !== "" && currentSnap !== savedSnapshot.current;
  // Also dirty if savedSnapshot is empty (never saved) and user has filled something
  const isFirstSave = savedSnapshot.current === "";

  /* ── Computed targets ── */
  const computed = useMemo(() => {
    const kg  = clampNum(weightKg,  25, 300);
    const cm  = clampNum(heightCm, 120, 230);
    const age = clampNum(ageYears,  13,  95);
    if (!kg || !cm || !age) return { ready:false, kg, cm, age, bmr:null, maintenance:null, target:null, delta:null, proteinG:null, carbsG:null, fatG:null, activeBurn:null, label:"" };
    const bmr         = calcBMR({ kg, cm, age, gender, bodyType });
    const maintenance = calcTDEE(bmr, activity);
    const { target, delta, label } = calcCalorieTarget(maintenance, goalType, kg);
    const proteinG    = calcProtein(kg, goalType);
    const { carbsG, fatG } = calcMacros(target, proteinG, goalType);
    const activeBurn  = calcActiveBurnTarget(kg, goalType, maintenance, target);
    return { ready:true, kg, cm, age, bmr:round(bmr), maintenance:round(maintenance), target:round(target), delta:round(delta), label, proteinG, carbsG, fatG, activeBurn:round(activeBurn) };
  }, [weightKg, heightCm, ageYears, gender, bodyType, activity, goalType]);

  /* ── Load profile ── */
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.push("/login"); return; }
      setUserId(data.user.id);
      setEmail(data.user.email ?? "");

      const { data: prof, error: profErr } = await supabase.from("profiles").select("*").eq("user_id", data.user.id).maybeSingle();
      if (profErr) { setMsg(profErr.message); return; }

      if (prof) {
        const n   = prof.name ?? "";
        const g   = (prof.gender as Gender) || "prefer_not_to_say";
        const a   = prof.age_years != null ? String(prof.age_years) : "";
        const h   = prof.height_cm ? String(prof.height_cm) : "";
        const w   = prof.weight_kg ? String(prof.weight_kg) : "";
        const bt  = (prof.body_type as BodyType) || "average";
        const al  = (prof.activity_level as ActivityLevel) || "light";
        const gt  = (prof.goal_type as GoalType) || "general_fitness";

        setName(n); setGender(g); setAgeYears(a); setHeightCm(h);
        setWeightKg(w); setBodyType(bt); setActivity(al); setGoalType(gt);

        savedSnapshot.current = snapshot({ name:n, gender:g, ageYears:a, heightCm:h, weightKg:w, bodyType:bt, activity:al, goalType:gt });
      }

      const { data: goals } = await supabase.from("goals").select("goal_type").eq("user_id", data.user.id).maybeSingle();
      if (goals?.goal_type && !prof?.goal_type) setGoalType(goals.goal_type as GoalType);
    })();
  }, [router]);

  /* ── Validation ── */
  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!ageYears.trim() || !clampNum(ageYears, 13, 95))   errs.age      = "Age is required (13–95 years)";
    if (!heightCm.trim() || !clampNum(heightCm, 120, 230)) errs.heightCm = "Height is required (120–230 cm)";
    if (!weightKg.trim() || !clampNum(weightKg, 25, 300))  errs.weightKg = "Weight is required (25–300 kg)";
    if (gender === "prefer_not_to_say")                    errs.gender   = "Please select a gender for accurate targets";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  /* ── Save ── */
  async function saveAll() {
    setMsg("");
    if (!userId) return;
    if (!validate()) {
      setMsg("Please fix the errors above before saving.");
      return;
    }

    setSaving(true);
    try {
      const profPayload: any = {
        user_id:   userId,
        name:      name.trim() || null,
        height_cm: parseInt(heightCm, 10),
        weight_kg: parseFloat(weightKg),
        gender,
        age_years:             parseInt(ageYears, 10),
        body_type:             bodyType,
        activity_level:        activity,
        goal_type:             goalType,
        target_calorie_intake: computed.ready ? computed.target    : null,
        target_protein_g:      computed.ready ? computed.proteinG  : null,
        target_burn_calories:  computed.ready ? computed.activeBurn : null,
      };

      let { error: profErr } = await supabase.from("profiles").upsert(profPayload, { onConflict: "user_id" });

      if (profErr && typeof profErr.message === "string" && profErr.message.toLowerCase().includes("column")) {
        const { gender:_g, age_years:_a, body_type:_b, activity_level:_al, goal_type:_gt,
          target_calorie_intake:_tci, target_protein_g:_tpg, target_burn_calories:_tbc, ...fallback } = profPayload;
        const retry = await supabase.from("profiles").upsert(fallback, { onConflict: "user_id" });
        profErr = retry.error;
      }
      if (profErr) throw profErr;

      const { error: goalsErr } = await supabase.from("goals").upsert(
        { user_id: userId, goal_type: goalType, calories_target: computed.ready ? computed.target : 2000 },
        { onConflict: "user_id" }
      );
      if (goalsErr) { setMsg(`✅ Saved profile. (Goals not saved: ${goalsErr.message})`); setTimeout(() => setMsg(""), 1800); return; }

      const d = new Date();
      await rebuildDailyAnalysisSnapshot(userId, `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);

      // Mark snapshot as saved — makes save button disappear
      savedSnapshot.current = currentSnap;
      setErrors({});
      setMsg("✅ Profile saved!");
      setTimeout(() => setMsg(""), 1800);

      // 🔑 Notify AppShell instantly — no manual refresh needed
      window.dispatchEvent(new CustomEvent("fwa:profile-saved"));

    } catch (e: any) {
      setMsg(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function logout() { await supabase.auth.signOut(); router.push("/login"); }

  const deltaLabel = computed.ready && computed.delta != null
    ? computed.delta < 0 ? `Deficit ~${round(Math.abs(computed.delta))} kcal/day`
    : computed.delta > 0 ? `Surplus ~${round(computed.delta)} kcal/day` : "Maintain"
    : "";

  /* ── Options ── */
  const genderOptions: { k: Gender; label: string; icon: string }[] = [
    { k: "male",             label: "Male",   icon: "♂" },
    { k: "female",           label: "Female", icon: "♀" },
    { k: "prefer_not_to_say", label: "Not specified", icon: "—" },
  ];

  const bodyTypeOptions = [
    { k: "slim"    as BodyType, label: "Slim",     icon: "🪶", desc: "Lean frame, low body fat, find it hard to gain weight" },
    { k: "average" as BodyType, label: "Average",  icon: "⚖️", desc: "Typical build, moderate fat, gains and loses weight normally" },
    { k: "athletic"as BodyType, label: "Athletic", icon: "💪", desc: "Visibly muscular, low fat, regular strength or sport training" },
    { k: "curvy"   as BodyType, label: "Curvy",    icon: "🌊", desc: "Softer build, carries weight in hips/thighs, moderate fat" },
    { k: "stocky"  as BodyType, label: "Stocky",   icon: "🪨", desc: "Dense and solid build, higher body fat, gains weight easily" },
  ];

  const activityOptions = [
    { k: "sedentary"  as ActivityLevel, label: "Sedentary",  icon: "🪑", desc: "Desk job, little or no exercise" },
    { k: "light"      as ActivityLevel, label: "Light",      icon: "🚶", desc: "Walking, light workouts 1–3×/week" },
    { k: "moderate"   as ActivityLevel, label: "Moderate",   icon: "🏃", desc: "Gym or sports 3–5×/week" },
    { k: "very_active"as ActivityLevel, label: "Very active",icon: "🔥", desc: "Hard training 6–7×/week" },
    { k: "athlete"    as ActivityLevel, label: "Athlete",    icon: "⚡", desc: "Twice-a-day training or heavy manual work" },
  ];

  const goalOptions = [
    { k: "general_fitness"as GoalType, label: "General fitness", icon: "🎯", desc: "Stay healthy and feel good" },
    { k: "fat_loss"       as GoalType, label: "Fat loss",         icon: "🔻", desc: "Lose body fat, keep the muscle" },
    { k: "muscle_gain"    as GoalType, label: "Muscle gain",      icon: "📈", desc: "Build size and strength" },
    { k: "endurance"      as GoalType, label: "Endurance",        icon: "🏅", desc: "Run, cycle, or train for performance" },
  ];

  const showSave = isFirstSave || isDirty;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass glow-ring rounded-2xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white">Your Fitness Profile</h1>
            <p className="text-sm text-white/70">{email}</p>
            <p className="mt-1 text-xs text-white/50">Fill this once — we'll automatically generate your daily targets.</p>
          </div>
          <button onClick={logout} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-semibold text-white/80 hover:bg-black/40">
            Logout
          </button>
        </div>
      </div>

      {/* Dirty state banner */}
      {isDirty && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          <p className="text-sm text-amber-300/80">You have unsaved changes — scroll down and hit Save to apply them.</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">

        {/* ── LEFT: Form ── */}
        <Card title="🧬 About you">
          <div className="space-y-5">

            {/* Name */}
            <div>
              <SectionLabel>Name <span className="text-white/20 font-normal normal-case tracking-normal">(optional)</span></SectionLabel>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/30"
              />
            </div>

            {/* Gender */}
            <div>
              <SectionLabel>
                Gender <span className="text-rose-400/60 font-normal normal-case tracking-normal ml-1">*</span>
              </SectionLabel>
              <div className="grid grid-cols-3 gap-2">
                {genderOptions.map((g) => (
                  <button
                    key={g.k}
                    type="button"
                    onClick={() => { setGender(g.k); setErrors((e) => ({ ...e, gender: "" })); }}
                    className={cx(
                      "flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition",
                      gender === g.k ? "border-emerald-400/50 bg-emerald-400/10 text-white" : "border-white/10 bg-black/20 text-white/55 hover:bg-black/30"
                    )}
                  >
                    <span className="text-lg">{g.icon}</span>
                    <span className="text-xs font-semibold leading-tight">{g.label}</span>
                  </button>
                ))}
              </div>
              {errors.gender && <p className="mt-1.5 text-xs text-rose-400">{errors.gender}</p>}
            </div>

            {/* Body stats */}
            <div>
              <SectionLabel>
                Body stats <span className="text-rose-400/60 font-normal normal-case tracking-normal ml-1">* all required</span>
              </SectionLabel>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-white/50">Age</label>
                  <input
                    value={ageYears}
                    onChange={(e) => { setAgeYears(e.target.value); setErrors((err) => ({ ...err, age: "" })); }}
                    placeholder="yrs"
                    inputMode="numeric"
                    className={cx("mt-1 w-full rounded-xl border bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30", errors.age ? "border-rose-400/50" : "border-white/10")}
                  />
                  {errors.age && <p className="mt-1 text-[10px] text-rose-400 leading-tight">{errors.age}</p>}
                </div>
                <div>
                  <label className="text-xs text-white/50">Height</label>
                  <div className="relative mt-1">
                    <input
                      value={heightCm}
                      onChange={(e) => { setHeightCm(e.target.value); setErrors((err) => ({ ...err, heightCm: "" })); }}
                      placeholder="175"
                      inputMode="numeric"
                      className={cx("w-full rounded-xl border bg-black/30 px-3 py-2 pr-8 text-sm text-white placeholder:text-white/30", errors.heightCm ? "border-rose-400/50" : "border-white/10")}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30">cm</span>
                  </div>
                  {errors.heightCm && <p className="mt-1 text-[10px] text-rose-400 leading-tight">{errors.heightCm}</p>}
                </div>
                <div>
                  <label className="text-xs text-white/50">Weight</label>
                  <div className="relative mt-1">
                    <input
                      value={weightKg}
                      onChange={(e) => { setWeightKg(e.target.value); setErrors((err) => ({ ...err, weightKg: "" })); }}
                      placeholder="72"
                      inputMode="decimal"
                      className={cx("w-full rounded-xl border bg-black/30 px-3 py-2 pr-8 text-sm text-white placeholder:text-white/30", errors.weightKg ? "border-rose-400/50" : "border-white/10")}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30">kg</span>
                  </div>
                  {errors.weightKg && <p className="mt-1 text-[10px] text-rose-400 leading-tight">{errors.weightKg}</p>}
                </div>
              </div>
            </div>

            {/* Body type */}
            <div>
              <SectionLabel>Body type</SectionLabel>
              <div className="grid grid-cols-1 gap-2">
                {bodyTypeOptions.map((b) => (
                  <button
                    key={b.k}
                    type="button"
                    onClick={() => setBodyType(b.k)}
                    className={cx(
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                      bodyType === b.k ? "border-emerald-400/50 bg-emerald-400/10" : "border-white/10 bg-black/20 hover:bg-black/30"
                    )}
                  >
                    <span className="text-xl">{b.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className={cx("text-sm font-semibold", bodyType === b.k ? "text-white" : "text-white/75")}>{b.label}</div>
                      <div className="text-xs text-white/40 leading-snug">{b.desc}</div>
                    </div>
                    {bodyType === b.k && <span className="shrink-0 text-emerald-400 text-sm">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Activity level */}
            <div>
              <SectionLabel>Activity level</SectionLabel>
              <div className="grid grid-cols-1 gap-2">
                {activityOptions.map((a) => (
                  <button
                    key={a.k}
                    type="button"
                    onClick={() => setActivity(a.k)}
                    className={cx(
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                      activity === a.k ? "border-emerald-400/50 bg-emerald-400/10" : "border-white/10 bg-black/20 hover:bg-black/30"
                    )}
                  >
                    <span className="text-xl">{a.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className={cx("text-sm font-semibold", activity === a.k ? "text-white" : "text-white/75")}>{a.label}</div>
                      <div className="text-xs text-white/40 leading-snug">{a.desc}</div>
                    </div>
                    {activity === a.k && <span className="shrink-0 text-emerald-400 text-sm">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Goal */}
            <div>
              <SectionLabel>Your goal</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                {goalOptions.map((g) => (
                  <button
                    key={g.k}
                    type="button"
                    onClick={() => setGoalType(g.k)}
                    className={cx(
                      "flex flex-col gap-1 rounded-xl border px-3 py-3 text-left transition",
                      goalType === g.k ? "border-emerald-400/50 bg-emerald-400/10" : "border-white/10 bg-black/20 hover:bg-black/30"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-lg">{g.icon}</span>
                      {goalType === g.k && <span className="text-emerald-400 text-xs">✓</span>}
                    </div>
                    <div className={cx("text-sm font-semibold", goalType === g.k ? "text-white" : "text-white/75")}>{g.label}</div>
                    <div className="text-xs text-white/40 leading-snug">{g.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Save button — only shows when dirty or first save */}
            {showSave ? (
              <button
                onClick={saveAll}
                disabled={saving}
                className={cx(
                  "w-full rounded-xl px-3 py-2.5 text-sm font-extrabold transition",
                  saving ? "bg-white/50 text-zinc-900" : "bg-white text-zinc-900 hover:opacity-90 active:scale-[0.99]"
                )}
              >
                {saving ? "Saving…" : isDirty ? "Save changes" : "Save profile"}
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] py-2.5">
                <span className="text-emerald-400 text-sm">✓</span>
                <span className="text-sm text-white/40 font-medium">Profile saved — no changes to save</span>
              </div>
            )}

            {msg && (
              <p className={cx("text-sm", msg.includes("✅") ? "text-emerald-300" : "text-red-300")}>{msg}</p>
            )}

            <p className="text-xs text-white/40">These are approximate estimates for planning, not medical advice.</p>
          </div>
        </Card>

        {/* ── RIGHT: Smart targets ── */}
        <Card title="🎯 Your smart targets (auto)">
          {!computed.ready ? (
            <div className="space-y-2">
              <p className="text-sm text-white/70">
                Add <b className="text-white">age</b>, <b className="text-white">height</b>, and{" "}
                <b className="text-white">weight</b> to unlock your personalised targets.
              </p>
              <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-white/60">
                We'll estimate:
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Maintenance calories</li>
                  <li>Goal-based target intake</li>
                  <li>Suggested daily active burn</li>
                  <li>Protein, carbs &amp; fat targets</li>
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
                    <div className="text-lg font-extrabold text-white">{computed.maintenance} kcal</div>
                    <div className="mt-1 text-xs text-white/50">per day</div>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="text-xs text-white/60">Target calorie intake</div>
                    <div className="mt-1 text-2xl font-extrabold text-white">{computed.target} kcal</div>
                    <div className="mt-1 text-xs text-white/50">What we'll aim to log each day.</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="text-xs text-white/60">Daily burn target</div>
                    <div className="mt-1 text-2xl font-extrabold text-white">{computed.activeBurn} kcal</div>
                    <div className="mt-1 text-xs text-white/50">Scaled to your body weight.</div>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-white/60">Protein target</div>
                      <div className="mt-1 text-xl font-extrabold text-white">{computed.proteinG} g/day</div>
                      <div className="mt-1 text-xs text-white/50">
                        {goalType === "fat_loss" ? "Higher — preserves muscle while cutting"
                          : goalType === "muscle_gain" ? "Optimised for muscle growth"
                          : "Recovery & general performance"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-white/60">BMR</div>
                      <div className="text-sm font-bold text-white">{computed.bmr} kcal</div>
                      <div className="mt-1 text-[11px] text-white/45">base burn</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/8 pt-3">
                    <div>
                      <div className="text-xs text-white/60">Carbs</div>
                      <div className="text-base font-extrabold text-white">{computed.carbsG} g</div>
                    </div>
                    <div>
                      <div className="text-xs text-white/60">Fat</div>
                      <div className="text-base font-extrabold text-white">{computed.fatG} g</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="text-sm font-extrabold text-white">How this will feel in the app</div>
                <div className="mt-2 space-y-2 text-sm text-white/70">
                  <p>• In <b className="text-white">Log</b>, you'll record meals and we'll track against your target intake.</p>
                  <p>• Change your <b className="text-white">goal</b> or <b className="text-white">activity level</b> and all targets update instantly.</p>
                  <p>• Workouts logging will be a separate tab — this page stays profile-first.</p>
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