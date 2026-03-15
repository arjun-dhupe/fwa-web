"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { rebuildDailyAnalysisSnapshot } from "@/lib/analysis";

/* ─── Types ──────────────────────────────────────────── */
type Mode = "steps" | "cardio" | "gym";

type Exercise = {
  id: string;
  name: string;
  category: string;
  muscle_group: string | null;
  default_met: number | null;
  default_sets: number | null;
  default_reps: number | null;
  default_duration_min?: number | null;
};

type WorkoutLog = {
  id: string;
  workout_type?: string | null;
  exercise_name?: string | null;
  category?: string | null;
  calories_burned?: number | null;
  steps?: number | null;
  avg_incline?: number | null;
  duration_min?: number | null;
  sets?: number | null;
  avg_reps?: number | null;
  log_date?: string;
  created_at?: string;
};

/* ─── Helpers ────────────────────────────────────────── */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round(v: number) { return Math.round(v * 10) / 10; }

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

function caloriesFromMET(weight: number, met: number, minutes: number) {
  return round(met * weight * (minutes / 60));
}

function walkingCalories(steps: number, incline: number, weight: number) {
  const base = steps * 0.04 * (weight / 70);
  return round(base * (1 + incline * 0.025));
}

/** Estimate walking duration from steps (~100 steps/min moderate pace) */
function walkingMinutes(steps: number) {
  return Math.max(1, Math.round(steps / 100));
}

function formatWhen(ts?: string) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Derive calories purely for DISPLAY — never writes to DB.
 * Historical entries are immutable; we only use saved calories_burned.
 */
function deriveCaloriesForDisplay(log: Partial<WorkoutLog>, weightKg: number): number {
  const saved = num(log.calories_burned, 0);
  if (saved > 0) return saved;

  const wt = Math.max(num(weightKg, 70), 35);
  const steps = num(log.steps, 0);
  const incline = num(log.avg_incline, 0);
  const minutes = num(log.duration_min, 0);
  const sets = num(log.sets, 0);

  if (steps > 0) return walkingCalories(steps, incline, wt);

  const key = String(log.exercise_name || log.workout_type || "").toLowerCase();
  if (minutes > 0) {
    let met = 6;
    if (key.includes("walk"))                                                met = 3.5 + incline * 0.08;
    else if (key.includes("run"))                                            met = 8.0;
    else if (key.includes("cycle") || key.includes("bike"))                 met = 7.5;
    else if (key.includes("row"))                                            met = 7.0;
    else if (key.includes("stair"))                                          met = 8.5;
    else if (key.includes("yoga") || key.includes("stretch"))               met = 3.0;
    else if (key.includes("gym") || key.includes("press") || key.includes("curl") ||
             key.includes("squat") || key.includes("deadlift") || key.includes("pull")) met = 5.5;
    return caloriesFromMET(wt, met, minutes);
  }
  if (sets > 0) return caloriesFromMET(wt, 5.5, Math.max(8, sets * 2.5));
  return 0;
}

function estimateRepsFromSets(sets: number, defaultReps: number) {
  return Math.max(0, Math.round(Math.max(sets, 0) * Math.max(defaultReps, 0)));
}

/* ─── Workout type config ────────────────────────────── */
const MODE_CONFIG: Record<Mode, { label: string; icon: string; color: string; desc: string }> = {
  steps:  { label: "Steps / Walking", icon: "🚶", color: "#f59e0b", desc: "Steps, treadmill walking, incline walks" },
  cardio: { label: "Cardio",          icon: "🔥", color: "#38bdf8", desc: "Running, cycling, rower, stair climber" },
  gym:    { label: "Gym",             icon: "🏋️", color: "#a78bfa", desc: "Strength training by muscle group" },
};

function logTypeColor(log: WorkoutLog): string {
  const key = String(log.exercise_name || log.workout_type || "").toLowerCase();
  if (log.steps && num(log.steps) > 0) return "#f59e0b";
  if (key.includes("walk") || key.includes("run") || key.includes("cycle") ||
      key.includes("bike") || key.includes("row") || key.includes("stair") ||
      key.includes("cardio") || key.includes("yoga")) return "#38bdf8";
  return "#a78bfa";
}

function logTypeIcon(log: WorkoutLog): string {
  const key = String(log.exercise_name || log.workout_type || "").toLowerCase();
  if (log.steps && num(log.steps) > 0) return "🚶";
  if (key.includes("run"))  return "🏃";
  if (key.includes("cycle") || key.includes("bike")) return "🚴";
  if (key.includes("row"))  return "🚣";
  if (key.includes("stair")) return "🪜";
  if (key.includes("yoga") || key.includes("stretch")) return "🧘";
  if (key.includes("walk")) return "🚶";
  return "🏋️";
}

/* ─── Small components ───────────────────────────────── */
function FancyInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white placeholder:text-white/30 outline-none transition focus:border-white/25 focus:bg-black/35",
        props.className
      )}
    />
  );
}

function FancyDropdown({
  label, value, open, onToggle, options, onSelect, placeholder, onClose,
}: {
  label: string; value: string; open: boolean; onToggle: () => void;
  options: { label: string; value: string; hint?: string | null }[];
  onSelect: (v: string) => void; placeholder: string; onClose: () => void;
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <div className="relative">
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/35">{label}</div>
      <button
        type="button"
        onClick={onToggle}
        className={cx(
          "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition",
          open ? "border-white/25 bg-black/35" : "border-white/10 bg-black/25 hover:bg-black/30"
        )}
      >
        <div className="min-w-0">
          <div className={cx("truncate text-sm font-semibold", selected ? "text-white" : "text-white/35")}>
            {selected?.label || placeholder}
          </div>
          {selected?.hint && <div className="mt-0.5 truncate text-[10px] text-white/35 uppercase tracking-wide">{selected.hint}</div>}
        </div>
        <span className="ml-3 text-white/40 text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-2 max-h-60 w-full overflow-auto rounded-xl border border-white/10 bg-[#0d0d0f] p-1.5 shadow-2xl">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onSelect(opt.value); onClose(); }}
              className={cx(
                "w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-white/6",
                value === opt.value && "bg-white/8"
              )}
            >
              <div className="text-sm font-semibold text-white/90">{opt.label}</div>
              {opt.hint && <div className="text-[10px] text-white/35 uppercase tracking-wide mt-0.5">{opt.hint}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Burn progress ring */
function BurnRing({ burned, target }: { burned: number; target: number }) {
  const pct = target > 0 ? Math.min(burned / target, 1) : 0;
  const r   = 36;
  const circ = 2 * Math.PI * r;
  const color = pct >= 1 ? "#22c55e" : pct >= 0.6 ? "#f59e0b" : "#38bdf8";
  return (
    <div className="relative flex h-24 w-24 items-center justify-center flex-shrink-0">
      <svg className="absolute inset-0 -rotate-90" width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${pct * circ} ${circ}`}
          style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.4s ease" }}
        />
      </svg>
      <div className="text-center z-10">
        <div className="text-lg font-black text-white leading-none">{round(burned)}</div>
        <div className="text-[9px] text-white/35 mt-0.5 uppercase tracking-wider">kcal</div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */
export default function LogWorkoutPage() {
  const router = useRouter();

  const [mode,     setMode]     = useState<Mode>("steps");
  const [userId,   setUserId]   = useState("");
  const [logDate,  setLogDate]  = useState(todayISO());
  const [weightKg, setWeightKg] = useState(70);
  const [burnTarget, setBurnTarget] = useState(0);

  const [msg,      setMsg]      = useState("");
  const [library,  setLibrary]  = useState<Exercise[]>([]);
  const [todayLogs, setTodayLogs] = useState<WorkoutLog[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  /* steps */
  const [steps,   setSteps]   = useState("");
  const [incline, setIncline] = useState("");

  /* cardio */
  const [cardioId,  setCardioId]  = useState("");
  const [duration,  setDuration]  = useState("");

  /* gym */
  const [muscle,     setMuscle]     = useState("");
  const [exerciseId, setExerciseId] = useState("");
  const [sets,       setSets]       = useState("");
  const [reps,       setReps]       = useState("");

  const [openSelect, setOpenSelect] = useState<"cardio" | "muscle" | "exercise" | null>(null);
  const repsTouchedRef = useRef(false);
  const isToday = logDate === todayISO();

  /* ── Load logs — display-only calories, never patches DB ── */
  const loadLogs = useCallback(async (uid: string, date: string) => {
    const { data, error } = await supabase
      .from("workout_logs").select("*")
      .eq("user_id", uid).eq("log_date", date)
      .order("created_at", { ascending: false });

    if (error) { setTodayLogs([]); return; }
    setTodayLogs((data || []) as WorkoutLog[]);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.push("/login"); return; }
      setUserId(data.user.id);

      const { data: profile } = await supabase.from("profiles")
        .select("weight_kg, target_burn_calories")
        .eq("user_id", data.user.id).maybeSingle();

      if (profile?.weight_kg)          setWeightKg(num(profile.weight_kg, 70));
      if (profile?.target_burn_calories) setBurnTarget(num(profile.target_burn_calories, 0));

      const { data: exercises } = await supabase.from("workout_exercises")
        .select("*").eq("is_active", true)
        .order("category").order("muscle_group").order("name");

      setLibrary((exercises || []) as Exercise[]);
      await loadLogs(data.user.id, todayISO());
    })();
  }, [router, loadLogs]);

  useEffect(() => {
    if (userId) loadLogs(userId, logDate);
  }, [logDate, userId, loadLogs]);

  /* ── Exercise lists ── */
  const cardioExercises = useMemo(
    () => library.filter((x) => x.category === "cardio" || x.category === "walking" || x.category === "mobility"),
    [library]
  );
  const gymExercises = useMemo(() => library.filter((x) => x.category === "strength"), [library]);
  const muscles      = useMemo(
    () => Array.from(new Set(gymExercises.map((x) => x.muscle_group).filter(Boolean))).sort() as string[],
    [gymExercises]
  );
  const filteredGym  = useMemo(
    () => gymExercises.filter((x) => !muscle || x.muscle_group === muscle),
    [gymExercises, muscle]
  );
  const selectedCardio = useMemo(() => cardioExercises.find((x) => x.id === cardioId) || null, [cardioId, cardioExercises]);
  const selectedGym    = useMemo(() => filteredGym.find((x) => x.id === exerciseId) || null, [exerciseId, filteredGym]);

  useEffect(() => { if (!cardioId && cardioExercises.length > 0) setCardioId(cardioExercises[0].id); }, [cardioId, cardioExercises]);
  useEffect(() => { if (!muscle && muscles.length > 0) setMuscle(muscles[0]); }, [muscle, muscles]);
  const gymInitialisedRef = useRef(false);
  useEffect(() => {
    // Only auto-select on first load, never after user resets
    if (!gymInitialisedRef.current && filteredGym.length > 0 && !exerciseId) {
      setExerciseId(filteredGym[0].id);
      gymInitialisedRef.current = true;
      repsTouchedRef.current = false;
    }
  }, [filteredGym, exerciseId]);
  useEffect(() => {
    if (!selectedGym || !exerciseId) return;
    if (!sets && selectedGym.default_sets) setSets(String(selectedGym.default_sets));
    if (!repsTouchedRef.current) {
      const nextSets = num(sets || selectedGym.default_sets, 0);
      setReps(String(estimateRepsFromSets(nextSets, num(selectedGym.default_reps, 10))));
    }
  }, [selectedGym, sets, exerciseId]);

  /* ── Live estimates ── */
  const walkCal   = walkingCalories(num(steps), num(incline), weightKg);
  const cardioCal = caloriesFromMET(weightKg, num(selectedCardio?.default_met, 6), num(duration));
  const gymMin    = Math.max(8, num(sets) * 2.5);
  const gymCal    = caloriesFromMET(weightKg, num(selectedGym?.default_met, 5.5), gymMin);

  /* ── Display calories per log entry (read-only, never patches DB) ── */
  const displayCal = (log: WorkoutLog) => round(deriveCaloriesForDisplay(log, weightKg));

  /* ── Totals ── */
  const totalBurn = useMemo(() =>
    todayLogs.reduce((s, l) => s + deriveCaloriesForDisplay(l, weightKg), 0),
    [todayLogs, weightKg]
  );
  const totalMin   = useMemo(() => todayLogs.reduce((s, l) => s + num(l.duration_min, 0), 0), [todayLogs]);
  const totalSteps = useMemo(() => todayLogs.reduce((s, l) => s + num(l.steps, 0), 0), [todayLogs]);

  const burnPct     = burnTarget > 0 ? Math.min(totalBurn / burnTarget, 1) : 0;
  const burnColor   = burnPct >= 1 ? "#22c55e" : burnPct >= 0.6 ? "#f59e0b" : "#38bdf8";
  const burnLabel   = burnPct >= 1 ? "Target hit! 🎉" : burnPct >= 0.6 ? "Getting close" : "Keep going";

  const headline = useMemo(() => {
    if (totalBurn >= 600) return "Power day. You showed up hard.";
    if (totalBurn >= 300) return "Solid work. Momentum is building.";
    if (todayLogs.length > 0) return "Nice start. Stack one more win today.";
    return "Choose a workout type and start logging.";
  }, [totalBurn, todayLogs.length]);

  /* ── Generic insert with graceful column fallback ── */
  async function insert(payload: any, successMsg: string): Promise<boolean> {
    setMsg("Saving…");
    let p: Record<string, any> = { user_id: userId, log_date: logDate, body_weight_kg: weightKg, ...payload };

    for (let attempt = 0; attempt < 8; attempt++) {
      const { error } = await supabase.from("workout_logs").insert(p);
      if (!error) {
        setMsg(successMsg);
        await loadLogs(userId, logDate);
        return true;
      }
      const m = typeof error.message === "string" ? error.message : "";
      const match = m.match(/Could not find the '([^']+)' column/i);
      if (match?.[1]) { const { [match[1]]: _, ...rest } = p; p = rest; continue; }
      setMsg(m || "Failed to save");
      return false;
    }
    setMsg("Failed to save");
    return false;
  }

  /* ── Add steps ── */
  async function addStepsEntry() {
    const errs: Record<string, string> = {};
    if (!steps || num(steps) <= 0) errs.steps = "Enter a step count";
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setFormErrors({});

    const inc = num(incline, 0);
    const walkMin = walkingMinutes(num(steps));
    const ok = await insert({
      workout_type:    "walking",
      exercise_name:   "Walking",
      steps:           num(steps),
      avg_incline:     inc || null,
      duration_min:    walkMin,        // ← fix: steps now contribute to active minutes
      calories_burned: walkCal,
    }, "✅ Steps added");

    if (!ok) return;
    await rebuildDailyAnalysisSnapshot(userId, logDate);
    setSteps(""); setIncline("");
  }

  /* ── Add cardio ── */
  async function addCardioEntry() {
    const errs: Record<string, string> = {};
    if (!duration || num(duration) <= 0) errs.duration = "Enter a duration";
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setFormErrors({});

    const ex = cardioExercises.find((x) => x.id === cardioId);
    if (!ex) return;

    const ok = await insert({
      workout_type:    ex.name,
      exercise_id:     ex.id,
      exercise_name:   ex.name,
      duration_min:    num(duration),
      calories_burned: cardioCal,
    }, "✅ Cardio added");

    if (!ok) return;
    await rebuildDailyAnalysisSnapshot(userId, logDate);
    // Keep cardio type selected — just clear the duration
    setDuration("");
    setOpenSelect(null);
  }

  /* ── Add gym ── */
  async function addGymEntry() {
    const errs: Record<string, string> = {};
    if (!sets || num(sets) <= 0)  errs.sets = "Enter sets";
    if (!reps || num(reps) <= 0)  errs.reps = "Enter reps";
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setFormErrors({});

    const ex = filteredGym.find((x) => x.id === exerciseId);
    if (!ex) return;

    const ok = await insert({
      workout_type:    ex.name,
      exercise_id:     ex.id,
      exercise_name:   ex.name,
      sets:            num(sets),
      avg_reps:        num(reps),      // ← fix: reps now saved
      duration_min:    gymMin,
      calories_burned: gymCal,
    }, "✅ Gym workout added");

    if (!ok) return;
    await rebuildDailyAnalysisSnapshot(userId, logDate);
    repsTouchedRef.current = false;
    setOpenSelect(null);
    // Keep muscle group — reset exercise, sets, reps to blank
    setExerciseId("");
    setSets("");
    setReps("");
  }

  /* ── Delete ── */
  async function deleteEntry(log: WorkoutLog) {
    if (!userId) return;
    setMsg("Deleting…");
    const { error } = await supabase.from("workout_logs").delete()
      .eq("id", log.id).eq("user_id", userId);

    if (error) { setMsg(error.message || "Failed to delete"); return; }
    setMsg("✅ Deleted");

    // Rebuild snapshot for the log's own date (not necessarily today)
    const targetDate = log.log_date || logDate;
    await rebuildDailyAnalysisSnapshot(userId, targetDate);
    await loadLogs(userId, logDate);
  }

  /* ── Render ── */
  const activeModeConf = MODE_CONFIG[mode];

  return (
    <>
      <style>{`
        .wk-card { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); }
        .wk-card-inner { background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.07); }
        .wk-card-deep  { background:rgba(0,0,0,0.35); border:1px solid rgba(255,255,255,0.06); }

        .mode-tab { transition:all 0.18s ease; cursor:pointer; }
        .mode-tab:hover { background:rgba(255,255,255,0.06); }

        .burn-box {
          position:relative; overflow:hidden;
          border-radius:16px; padding:20px;
          border:1px solid rgba(255,255,255,0.1);
          background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.3) 100%);
        }
        .burn-box-glow {
          position:absolute; inset:0; border-radius:16px;
          pointer-events:none; transition:box-shadow 0.4s ease;
        }

        .log-item { transition:background 0.15s ease; }
        .log-item:hover { background:rgba(255,255,255,0.03); }

        .form-panel { animation: wkSlideIn 0.2s ease both; }
        @keyframes wkSlideIn {
          from { opacity:0; transform:translateX(8px); }
          to   { opacity:1; transform:translateX(0); }
        }
        @keyframes wkFadeUp {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .wk-fade { animation:wkFadeUp 0.35s ease both; }
        .wk-d1  { animation-delay:0.06s; }
        .wk-d2  { animation-delay:0.12s; }
        .wk-d3  { animation-delay:0.18s; }

        .err-field { border-color: rgba(239,68,68,0.5) !important; }
        .err-msg   { color:#fca5a5; font-size:11px; margin-top:4px; }
      `}</style>

      <div className="space-y-5">

        {/* ── HEADER ─────────────────────────────────── */}
        <div className="wk-fade wk-card rounded-2xl p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Log Workout</h1>
              <p className="mt-1 text-sm text-white/45">{headline}</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-white/35">Date</div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { const d = new Date(logDate+"T00:00:00"); d.setDate(d.getDate()-1); setLogDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`); }}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-white/50 hover:bg-white/10 hover:text-white transition"
                  >‹</button>
                  <FancyInput type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className="w-40" />
                  <button
                    onClick={() => { const d = new Date(logDate+"T00:00:00"); d.setDate(d.getDate()+1); setLogDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`); }}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-white/50 hover:bg-white/10 hover:text-white transition"
                  >›</button>
                  {!isToday && (
                    <button onClick={() => setLogDate(todayISO())} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/50 hover:bg-white/10 transition">
                      Today
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── BURN STAT (single, compact) ──────────── */}
        <div className="wk-fade wk-d1 wk-card rounded-2xl p-4 flex items-center gap-4">
          <BurnRing burned={round(totalBurn)} target={burnTarget} />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">Burned today</div>
            <div className="text-2xl font-black text-white mt-1">{round(totalBurn)}<span className="text-sm font-normal text-white/40 ml-1">kcal</span></div>
            {burnTarget > 0 && (
              <div className="text-xs mt-1 font-semibold" style={{ color: burnColor }}>{burnLabel}</div>
            )}
            {burnTarget > 0 && (
              <div className="text-[10px] text-white/30 mt-0.5">target {burnTarget} kcal</div>
            )}
          </div>
        </div>

        {/* ── MODE TABS + FORM ───────────────────────── */}
        <div className="wk-fade wk-d2 wk-card rounded-2xl overflow-hidden">

          {/* Horizontal mode tabs */}
          <div className="grid grid-cols-3 border-b border-white/8">
            {(["steps", "cardio", "gym"] as Mode[]).map((m) => {
              const c = MODE_CONFIG[m];
              const isActive = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setFormErrors({}); setMsg(""); }}
                  className="mode-tab flex flex-col items-center gap-1.5 py-4 px-2 text-center relative"
                  style={isActive ? {
                    background: `${c.color}12`,
                    borderBottom: `2px solid ${c.color}`,
                  } : { borderBottom: "2px solid transparent" }}
                >
                  <span className="text-xl leading-none">{c.icon}</span>
                  <span className="text-xs font-bold" style={{ color: isActive ? c.color : "rgba(255,255,255,0.45)" }}>
                    {c.label}
                  </span>
                  <span className="hidden sm:block text-[9px] text-white/25 leading-tight">{c.desc}</span>
                </button>
              );
            })}
          </div>

          {/* Form panels */}
          <div className="p-5">

            {/* STEPS */}
            {mode === "steps" && (
              <div key="steps" className="form-panel space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/35">Steps</div>
                    <FancyInput
                      placeholder="e.g. 5000"
                      value={steps}
                      onChange={(e) => { setSteps(e.target.value); setFormErrors((p) => ({ ...p, steps: "" })); }}
                      className={formErrors.steps ? "err-field" : ""}
                    />
                    {formErrors.steps && <div className="err-msg">{formErrors.steps}</div>}
                  </div>
                  <div>
                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/35">Incline % <span className="text-white/20 normal-case tracking-normal">(optional)</span></div>
                    <FancyInput
                      placeholder="e.g. 5"
                      value={incline}
                      onChange={(e) => setIncline(e.target.value)}
                    />
                  </div>
                </div>

                {/* Live burn box */}
                <div className="burn-box" style={{ ["--glow" as any]: `${MODE_CONFIG.steps.color}20` }}>
                  <div className="burn-box-glow" style={{ boxShadow: `0 0 30px ${MODE_CONFIG.steps.color}12 inset` }} />
                  <div className="relative flex items-end justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">Live burn estimate</div>
                      <div className="mt-1.5 text-5xl font-black leading-none" style={{ color: MODE_CONFIG.steps.color }}>
                        {walkCal}
                      </div>
                      <div className="mt-1.5 text-xs text-white/40">kcal · updates as you type</div>
                    </div>
                    {num(steps) > 0 && (
                      <div className="wk-card-inner rounded-xl px-3 py-2 text-right flex-shrink-0">
                        <div className="text-[10px] text-white/30 uppercase tracking-wide">Est. time</div>
                        <div className="text-sm font-bold text-white mt-0.5">{walkingMinutes(num(steps))} min</div>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button" onClick={addStepsEntry}
                  className="w-full rounded-xl py-3 text-sm font-black text-black transition hover:brightness-110 active:scale-[0.99]"
                  style={{ background: MODE_CONFIG.steps.color }}
                >
                  Add steps entry →
                </button>
                {msg && <div className={cx("text-sm", msg.startsWith("✅") ? "text-emerald-300" : "text-red-300")}>{msg}</div>}
              </div>
            )}

            {/* CARDIO */}
            {mode === "cardio" && (
              <div key="cardio" className="form-panel space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FancyDropdown
                    label="Cardio type"
                    value={cardioId}
                    open={openSelect === "cardio"}
                    onToggle={() => setOpenSelect(openSelect === "cardio" ? null : "cardio")}
                    options={cardioExercises.map((x) => ({ label: x.name, value: x.id, hint: x.category }))}
                    onSelect={setCardioId}
                    placeholder="Select activity"
                    onClose={() => setOpenSelect(null)}
                  />
                  <div>
                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/35">Duration (minutes)</div>
                    <FancyInput
                      placeholder="e.g. 30"
                      value={duration}
                      onChange={(e) => { setDuration(e.target.value); setFormErrors((p) => ({ ...p, duration: "" })); }}
                      className={formErrors.duration ? "err-field" : ""}
                    />
                    {formErrors.duration && <div className="err-msg">{formErrors.duration}</div>}
                  </div>
                </div>

                <div className="burn-box">
                  <div className="burn-box-glow" style={{ boxShadow: `0 0 30px ${MODE_CONFIG.cardio.color}12 inset` }} />
                  <div className="relative">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">Live burn estimate</div>
                    <div className="mt-1.5 text-5xl font-black leading-none" style={{ color: MODE_CONFIG.cardio.color }}>
                      {cardioCal}
                    </div>
                    <div className="mt-1.5 text-xs text-white/40">kcal · based on activity, weight & duration</div>
                  </div>
                </div>

                <button
                  type="button" onClick={addCardioEntry}
                  className="w-full rounded-xl py-3 text-sm font-black text-black transition hover:brightness-110 active:scale-[0.99]"
                  style={{ background: MODE_CONFIG.cardio.color }}
                >
                  Add cardio entry →
                </button>
                {msg && <div className={cx("text-sm", msg.startsWith("✅") ? "text-emerald-300" : "text-red-300")}>{msg}</div>}
              </div>
            )}

            {/* GYM */}
            {mode === "gym" && (
              <div key="gym" className="form-panel space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FancyDropdown
                    label="Muscle group"
                    value={muscle}
                    open={openSelect === "muscle"}
                    onToggle={() => setOpenSelect(openSelect === "muscle" ? null : "muscle")}
                    options={muscles.map((m) => ({ label: m, value: m }))}
                    onSelect={(v) => { setMuscle(v); repsTouchedRef.current = false; }}
                    placeholder="Choose muscle group"
                    onClose={() => setOpenSelect(null)}
                  />
                  <FancyDropdown
                    label="Exercise"
                    value={exerciseId}
                    open={openSelect === "exercise"}
                    onToggle={() => setOpenSelect(openSelect === "exercise" ? null : "exercise")}
                    options={filteredGym.map((x) => ({ label: x.name, value: x.id, hint: x.muscle_group }))}
                    onSelect={(v) => { setExerciseId(v); repsTouchedRef.current = false; }}
                    placeholder="Choose exercise"
                    onClose={() => setOpenSelect(null)}
                  />
                  <div>
                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/35">Sets</div>
                    <FancyInput
                      placeholder="e.g. 3"
                      value={sets}
                      onChange={(e) => {
                        const next = e.target.value;
                        setSets(next);
                        setFormErrors((p) => ({ ...p, sets: "" }));
                        if (!repsTouchedRef.current && selectedGym) {
                          setReps(String(estimateRepsFromSets(num(next), num(selectedGym.default_reps, 10))));
                        }
                      }}
                      className={formErrors.sets ? "err-field" : ""}
                    />
                    {formErrors.sets && <div className="err-msg">{formErrors.sets}</div>}
                  </div>
                  <div>
                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/35">
                      Total reps <span className="text-white/20 normal-case tracking-normal">(auto-fills)</span>
                    </div>
                    <FancyInput
                      placeholder="Auto from sets"
                      value={reps}
                      onChange={(e) => { repsTouchedRef.current = true; setReps(e.target.value); setFormErrors((p) => ({ ...p, reps: "" })); }}
                      className={formErrors.reps ? "err-field" : ""}
                    />
                    {formErrors.reps && <div className="err-msg">{formErrors.reps}</div>}
                  </div>
                </div>

                <div className="burn-box">
                  <div className="burn-box-glow" style={{ boxShadow: `0 0 30px ${MODE_CONFIG.gym.color}12 inset` }} />
                  <div className="relative flex items-end justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">Live burn estimate</div>
                      <div className="mt-1.5 text-5xl font-black leading-none" style={{ color: MODE_CONFIG.gym.color }}>
                        {gymCal}
                      </div>
                      <div className="mt-1.5 text-xs text-white/40">kcal · estimated from sets, reps & exercise</div>
                    </div>
                    <div className="wk-card-inner rounded-xl px-3 py-2 text-right flex-shrink-0">
                      <div className="text-[10px] text-white/30 uppercase tracking-wide">Est. duration</div>
                      <div className="text-sm font-bold text-white mt-0.5">{round(gymMin)} min</div>
                    </div>
                  </div>
                </div>

                <button
                  type="button" onClick={addGymEntry}
                  className="w-full rounded-xl py-3 text-sm font-black text-black transition hover:brightness-110 active:scale-[0.99]"
                  style={{ background: MODE_CONFIG.gym.color }}
                >
                  Add gym workout →
                </button>
                {msg && <div className={cx("text-sm", msg.startsWith("✅") ? "text-emerald-300" : "text-red-300")}>{msg}</div>}
              </div>
            )}
          </div>
        </div>

        {/* ── TODAY'S ACTIVITY LOG ───────────────────── */}
        <div className="wk-fade wk-d3 wk-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white">Today's activity</h2>
              <p className="text-xs text-white/35 mt-0.5">{logDate}</p>
            </div>
            {todayLogs.length > 0 && (
              <div className="flex items-center gap-3 text-xs text-white/40">
                <span><b className="text-white font-bold">{round(totalBurn)}</b> kcal</span>
                <span>·</span>
                <span><b className="text-white font-bold">{round(totalMin)}</b> min</span>
              </div>
            )}
          </div>

          {todayLogs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center">
              <div className="text-3xl mb-3">💪</div>
              <div className="text-sm font-semibold text-white/35">No workouts logged for this day</div>
              <div className="text-xs text-white/20 mt-1">Use the form above to log your first session</div>
            </div>
          ) : (
            <div className="space-y-2">
              {todayLogs.map((log) => {
                // Cast to any so we can access whatever columns actually exist in the DB
                const raw = log as any;

                // Try every plausible column name variant
                const stepsVal   = num(raw.steps ?? raw.step_count ?? 0);
                const inclineVal = num(raw.avg_incline ?? raw.incline ?? 0);
                const durVal     = num(raw.duration_min ?? raw.duration ?? raw.minutes ?? 0);
                const setsVal    = num(raw.sets ?? raw.set_count ?? 0);
                const repsVal    = num(raw.avg_reps ?? raw.reps ?? raw.total_reps ?? raw.rep_count ?? 0);

                const isWalking = stepsVal > 0 ||
                  String(raw.exercise_name || raw.workout_type || "").toLowerCase().includes("walk");

                const title = isWalking
                  ? "Walking"
                  : (raw.exercise_name || raw.workout_type || "Workout");

                const icon  = logTypeIcon(log);
                const color = logTypeColor(log);
                const cal   = displayCal(log);

                const parts: string[] = [];
                if (stepsVal > 0)   parts.push(`${stepsVal.toLocaleString()} steps`);
                if (inclineVal > 0) parts.push(`${round(inclineVal)}% incline`);
                if (durVal > 0)     parts.push(`${round(durVal)} min`);
                if (setsVal > 0)    parts.push(`${setsVal} sets`);
                if (repsVal > 0)    parts.push(`${repsVal} reps`);
                if (raw.created_at) parts.push(formatWhen(raw.created_at));

                return (
                  <div
                    key={log.id}
                    className="log-item wk-card-inner rounded-2xl border-l-4 px-4 py-3 flex items-center justify-between gap-4"
                    style={{ borderLeftColor: color }}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-base"
                        style={{ background: `${color}18` }}
                      >
                        {icon}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white/90 truncate">{title}</div>
                        <div className="text-[10px] text-white/40 mt-0.5 leading-relaxed">
                          {parts.join(" · ")}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-bold" style={{ color }}>{cal} kcal</div>
                      </div>
                      <button
                        type="button" onClick={() => deleteEntry(log)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-rose-400/20 bg-rose-400/8 text-rose-400/60 hover:bg-rose-400/15 hover:text-rose-300 transition text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </>
  );
}