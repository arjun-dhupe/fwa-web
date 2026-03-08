"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { rebuildDailyAnalysisSnapshot } from "@/lib/analysis";

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
  created_at?: string;
};

function today() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

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

function caloriesFromMET(weight: number, met: number, minutes: number) {
  return round(met * weight * (minutes / 60));
}

function walkingCalories(steps: number, incline: number, weight: number) {
  const base = steps * 0.04 * (weight / 70);
  return round(base * (1 + incline * 0.025));
}

function formatWhen(ts?: string) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function deriveCaloriesFromLog(log: Partial<WorkoutLog>, weightKg: number) {
  const wt = Math.max(num(weightKg, 70), 35);
  const steps = num(log.steps, 0);
  const incline = num(log.avg_incline, 0);
  const minutes = num(log.duration_min, 0);
  const sets = num(log.sets, 0);

  if (steps > 0) {
    return walkingCalories(steps, incline, wt);
  }

  const workoutKey = String(log.exercise_name || log.workout_type || "").toLowerCase();

  if (minutes > 0) {
    let met = 6;

    if (workoutKey.includes("walk")) met = 3.5 + incline * 0.08;
    else if (workoutKey.includes("run")) met = 8.0;
    else if (workoutKey.includes("cycle") || workoutKey.includes("bike")) met = 7.5;
    else if (workoutKey.includes("row")) met = 7.0;
    else if (workoutKey.includes("stair")) met = 8.5;
    else if (workoutKey.includes("yoga") || workoutKey.includes("mobility") || workoutKey.includes("stretch")) met = 3.0;
    else if (
      workoutKey.includes("gym") ||
      workoutKey.includes("press") ||
      workoutKey.includes("curl") ||
      workoutKey.includes("squat") ||
      workoutKey.includes("deadlift") ||
      workoutKey.includes("row") ||
      workoutKey.includes("pull")
    ) {
      met = 5.5;
    }

    return caloriesFromMET(wt, met, minutes);
  }

  if (sets > 0) {
    const estMinutes = Math.max(8, sets * 2.5);
    return caloriesFromMET(wt, 5.5, estMinutes);
  }

  return 0;
}

function estimateRepsFromSets(sets: number, defaultReps: number) {
  return Math.max(0, Math.round(Math.max(sets, 0) * Math.max(defaultReps, 0)));
}

function Pill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-wide text-white/45">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function VerticalChooser({
  active,
  onClick,
  title,
  subtitle,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  icon: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "w-full rounded-2xl border p-4 text-left transition-all",
        active
          ? "border-white/25 bg-white/12 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
          : "border-white/10 bg-black/20 hover:bg-black/30"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cx("text-2xl transition", active && "scale-110")}>{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-base font-bold text-white">{title}</div>
            {active && (
              <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                Selected
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-white/60">{subtitle}</div>
        </div>
      </div>
    </button>
  );
}

function FancyInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "w-full rounded-2xl border border-white/12 bg-black/25 px-4 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-300/40 focus:bg-black/35 focus:ring-2 focus:ring-emerald-300/10",
        props.className
      )}
    />
  );
}

function FancyDropdown({
  label,
  value,
  open,
  onToggle,
  options,
  onSelect,
  placeholder,
  onClose,
}: {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  options: { label: string; value: string; hint?: string | null }[];
  onSelect: (v: string) => void;
  placeholder: string;
  onClose: () => void;
}) {
  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/50">{label}</div>
      <button
        type="button"
        onClick={onToggle}
        className={cx(
          "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition",
          open ? "border-emerald-300/40 bg-black/35 ring-2 ring-emerald-300/10" : "border-white/12 bg-black/25 hover:bg-black/30"
        )}
      >
        <div className="min-w-0">
          <div className={cx("truncate font-medium", selected ? "text-white" : "text-white/40")}>
            {selected?.label || placeholder}
          </div>
          {selected?.hint ? <div className="mt-0.5 truncate text-xs text-white/45">{selected.hint}</div> : null}
        </div>
        <div className="ml-3 text-white/55">▾</div>
      </button>

      {open && (
        <div className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-2xl border border-white/10 bg-[#121212] p-2 shadow-2xl">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onSelect(opt.value);
                onClose();
              }}
              className={cx(
                "w-full rounded-xl px-3 py-2 text-left transition hover:bg-white/6",
                value === opt.value && "bg-white/8"
              )}
            >
              <div className="font-medium text-white">{opt.label}</div>
              {opt.hint ? <div className="text-xs text-white/45">{opt.hint}</div> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LogWorkoutPage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode | null>("steps");
  const [userId, setUserId] = useState("");
  const [logDate, setLogDate] = useState(today());
  const [weightKg, setWeightKg] = useState(70);

  const [msg, setMsg] = useState("");
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [todayLogs, setTodayLogs] = useState<WorkoutLog[]>([]);

  const [steps, setSteps] = useState("");
  const [incline, setIncline] = useState("");

  const [cardioId, setCardioId] = useState("");
  const [duration, setDuration] = useState("");

  const [muscle, setMuscle] = useState("");
  const [exerciseId, setExerciseId] = useState("");
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");

  const [openSelect, setOpenSelect] = useState<"cardio" | "muscle" | "exercise" | null>(null);
  const repsTouchedRef = useRef(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }

      setUserId(data.user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("weight_kg")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (profile?.weight_kg) setWeightKg(profile.weight_kg);

      const { data: exercises } = await supabase
        .from("workout_exercises")
        .select("*")
        .eq("is_active", true)
        .order("category")
        .order("muscle_group")
        .order("name");

      setLibrary((exercises || []) as Exercise[]);
      await loadTodayLogs(data.user.id, today());
    })();
  }, [router]);

  async function loadTodayLogs(uid: string, dateValue = logDate) {
  const { data, error } = await supabase
    .from("workout_logs")
    .select("*")
    .eq("user_id", uid)
    .eq("log_date", dateValue)
    .order("created_at", { ascending: false });

  if (error) {
    setTodayLogs([]);
    return;
  }

  const rows = (data || []) as WorkoutLog[];
  const patchedRows: WorkoutLog[] = [];

  for (const row of rows) {
    const savedBurn = num(row.calories_burned, 0);

    if (savedBurn > 0) {
      patchedRows.push(row);
      continue;
    }

    const derivedBurn = deriveCaloriesFromLog(row, weightKg);

    if (derivedBurn > 0) {
      const { error: updErr } = await supabase
        .from("workout_logs")
        .update({ calories_burned: derivedBurn })
        .eq("id", row.id)
        .eq("user_id", uid);

      if (!updErr) {
        patchedRows.push({ ...row, calories_burned: derivedBurn });
        continue;
      }
    }

    patchedRows.push(row);
  }

  setTodayLogs(patchedRows);
}

 useEffect(() => {
  if (userId) loadTodayLogs(userId, logDate);
}, [logDate, userId, weightKg]);

  const cardioExercises = useMemo(
    () => library.filter((x) => x.category === "cardio" || x.category === "walking" || x.category === "mobility"),
    [library]
  );

  const gymExercises = useMemo(() => library.filter((x) => x.category === "strength"), [library]);

  const muscles = useMemo(
    () => Array.from(new Set(gymExercises.map((x) => x.muscle_group).filter(Boolean))).sort() as string[],
    [gymExercises]
  );

  const filteredGym = useMemo(
    () => gymExercises.filter((x) => !muscle || x.muscle_group === muscle),
    [gymExercises, muscle]
  );

  const selectedCardio = useMemo(
    () => cardioExercises.find((x) => x.id === cardioId) || null,
    [cardioId, cardioExercises]
  );

  const selectedGym = useMemo(
    () => filteredGym.find((x) => x.id === exerciseId) || null,
    [exerciseId, filteredGym]
  );

  useEffect(() => {
    if (!cardioId && cardioExercises.length > 0) {
      setCardioId(cardioExercises[0].id);
    }
  }, [cardioId, cardioExercises]);

  useEffect(() => {
    if (!muscle && muscles.length > 0) {
      setMuscle(muscles[0]);
    }
  }, [muscle, muscles]);

  useEffect(() => {
    if (!filteredGym.some((x) => x.id === exerciseId)) {
      setExerciseId(filteredGym[0]?.id || "");
      repsTouchedRef.current = false;
    }
  }, [filteredGym, exerciseId]);

  useEffect(() => {
    if (!selectedGym) return;

    if (!sets && selectedGym.default_sets) {
      setSets(String(selectedGym.default_sets));
    }

    if (!repsTouchedRef.current) {
      const nextSets = num(sets || selectedGym.default_sets, 0);
      const nextDefaultReps = num(selectedGym.default_reps, 10);
      setReps(String(estimateRepsFromSets(nextSets, nextDefaultReps)));
    }
  }, [selectedGym, sets, reps]);

  const walkCalories = walkingCalories(num(steps), num(incline), weightKg);
  const cardioCalories = caloriesFromMET(weightKg, num(selectedCardio?.default_met, 6), num(duration));
  const gymMinutes = Math.max(8, num(sets) * 2.5);
  const gymCalories = caloriesFromMET(weightKg, num(selectedGym?.default_met, 5.5), gymMinutes);

  const totalBurnToday = useMemo(
    () => todayLogs.reduce((sum, log) => sum + num(log.calories_burned, 0), 0),
    [todayLogs]
  );

  const totalEntries = todayLogs.length;
  const totalActiveMin = todayLogs.reduce((sum, log) => sum + num(log.duration_min, 0), 0);
  const totalStepsToday = todayLogs.reduce((sum, log) => sum + num(log.steps, 0), 0);

  const headline = useMemo(() => {
    if (totalBurnToday >= 600) return "Power day. You showed up hard.";
    if (totalBurnToday >= 300) return "Solid work. Momentum is building.";
    if (totalEntries > 0) return "Nice start. Stack one more win today.";
    return "Pick a workout type below and start logging.";
  }, [totalBurnToday, totalEntries]);

  async function insert(payload: any, successMessage: string) {
    setMsg("Saving...");

    let insertPayload: Record<string, any> = {
      user_id: userId,
      log_date: logDate,
      body_weight_kg: weightKg,
      ...payload,
    };

    for (let attempt = 0; attempt < 8; attempt++) {
      const { error } = await supabase.from("workout_logs").insert(insertPayload);

      if (!error) {
        setMsg(successMessage);
        await loadTodayLogs(userId, logDate);
        return true;
      }

      const message = typeof error.message === "string" ? error.message : "";
      const match = message.match(/Could not find the '([^']+)' column of 'workout_logs' in the schema cache/i);

      if (match?.[1]) {
        const missingColumn = match[1];

        if (missingColumn === "calories_burned") {
          setMsg("Supabase is missing the calories_burned column in workout_logs. Add that column first so Burn shows correctly on Today.");
          return false;
        }

        const { [missingColumn]: _removed, ...rest } = insertPayload;
        insertPayload = rest;
        continue;
      }

      setMsg(message || "Failed to save workout");
      return false;
    }

    setMsg("Failed to save workout");
    return false;
  }

  async function deleteWorkoutEntry(id: string) {
    if (!userId || !id) return;

    setMsg("Deleting...");

    const { error } = await supabase
      .from("workout_logs")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      setMsg(error.message || "Failed to delete workout");
      return;
    }

    setMsg("✅ Activity deleted");
    await rebuildDailyAnalysisSnapshot(userId, logDate);
    await loadTodayLogs(userId, logDate);
  }

  async function addStepsEntry() {
    if (!userId || num(steps) <= 0) return;

    const ok = await insert(
      {
        workout_type: "walking",
        exercise_name: "Walking",
        steps: num(steps),
        avg_incline: num(incline) || null,
        calories_burned: walkCalories,
      },
      "✅ Steps added"
    );

    if (!ok) return;
    await rebuildDailyAnalysisSnapshot(userId, logDate);

    setSteps("");
    setIncline("");
  }

  async function addCardioEntry() {
    if (!userId) return;
    const ex = cardioExercises.find((x) => x.id === cardioId);
    if (!ex || num(duration) <= 0) return;

    const ok = await insert(
      {
        workout_type: ex.name,
        exercise_id: ex.id,
        exercise_name: ex.name,
        duration_min: num(duration),
        calories_burned: cardioCalories,
      },
      "✅ Cardio added"
    );

    if (!ok) return;
    await rebuildDailyAnalysisSnapshot(userId, logDate);

    setDuration("");
    setOpenSelect(null);
  }

  async function addGymEntry() {
    if (!userId) return;
    const ex = filteredGym.find((x) => x.id === exerciseId);
    if (!ex || num(sets) <= 0 || num(reps) <= 0) return;

    const ok = await insert(
      {
        workout_type: ex.name,
        exercise_id: ex.id,
        exercise_name: ex.name,
        sets: num(sets),
        duration_min: gymMinutes,
        calories_burned: gymCalories,
      },
      "✅ Gym workout added"
    );

    if (!ok) return;
    await rebuildDailyAnalysisSnapshot(userId, logDate);

    repsTouchedRef.current = false;
    setOpenSelect(null);
    setSets("");
    setReps("");
  }


  return (
    <div className="space-y-6">
      <div className="glass rounded-3xl p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Log Workout</h1>
            <p className="mt-1 text-white/60">{headline}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:w-[420px]">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/50">Workout date</div>
              <FancyInput type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/50">Body weight (kg)</div>
              <FancyInput
                type="number"
                step="0.1"
                value={String(weightKg)}
                onChange={(e) => setWeightKg(num(e.target.value, 70))}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Pill label="Burned today" value={`${round(totalBurnToday)} kcal`} />
        <Pill label="Workouts logged" value={totalEntries} />
        <Pill label="Active minutes" value={round(totalActiveMin)} />
        <Pill label="Steps logged" value={totalStepsToday} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-3">
          <VerticalChooser
            active={mode === "steps"}
            onClick={() => setMode("steps")}
            icon="🚶"
            title="Steps / Walking"
            subtitle="Best for steps, treadmill walking, and incline walks."
          />
          <VerticalChooser
            active={mode === "cardio"}
            onClick={() => setMode("cardio")}
            icon="🔥"
            title="Cardio Workout"
            subtitle="Running, cycling, rower, stair climber, treadmill and more."
          />
          <VerticalChooser
            active={mode === "gym"}
            onClick={() => setMode("gym")}
            icon="🏋️"
            title="Gym Workout"
            subtitle="Choose muscle group, then exercise, then sets and reps."
          />
        </div>

        <div className="glass rounded-3xl p-6">
          {mode === "steps" && (
            <div className="space-y-5">
              <div>
                <div className="text-2xl font-bold text-white">Steps / walking</div>
                <div className="mt-1 text-sm text-white/58">
                  Add your steps and optional incline, then click Add to log the entry below.
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/50">Steps</div>
                  <FancyInput
                    placeholder="e.g. 5000"
                    value={steps}
                    onChange={(e) => setSteps(e.target.value)}
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/50">
                    Incline % (optional)
                  </div>
                  <FancyInput
                    placeholder="e.g. 5"
                    value={incline}
                    onChange={(e) => setIncline(e.target.value)}
                  />
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="text-xs uppercase tracking-wide text-white/45">Live burn estimate</div>
                <div className="mt-2 text-4xl font-bold text-white">{walkCalories} kcal</div>
                <div className="mt-2 text-sm text-white/58">
                  Live estimate updates instantly. Click Add when this entry looks right.
                </div>
              </div>

              {msg && <div className="text-sm text-emerald-300">{msg}</div>}
              <button
                type="button"
                onClick={addStepsEntry}
                className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:opacity-95"
              >
                Add steps entry
              </button>
            </div>
          )}

          {mode === "cardio" && (
            <div className="space-y-5">
              <div>
                <div className="text-2xl font-bold text-white">Cardio workout</div>
                <div className="mt-1 text-sm text-white/58">
                  Pick the cardio type and duration, then click Add to log it below.
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FancyDropdown
                  label="Cardio type"
                  value={cardioId}
                  open={openSelect === "cardio"}
                  onToggle={() => setOpenSelect(openSelect === "cardio" ? null : "cardio")}
                  options={cardioExercises.map((x) => ({
                    label: x.name,
                    value: x.id,
                    hint: x.category,
                  }))}
                  onSelect={setCardioId}
                  placeholder="Select cardio activity"
                  onClose={() => setOpenSelect(null)}
                />

                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/50">Duration (min)</div>
                  <FancyInput
                    placeholder="e.g. 30"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="text-xs uppercase tracking-wide text-white/45">Live burn estimate</div>
                <div className="mt-2 text-4xl font-bold text-white">{cardioCalories} kcal</div>
                <div className="mt-2 text-sm text-white/58">
                  Based on activity type, your body weight, and duration.
                </div>
              </div>

              {msg && <div className="text-sm text-emerald-300">{msg}</div>}
              <button
                type="button"
                onClick={addCardioEntry}
                className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:opacity-95"
              >
                Add cardio entry
              </button>
            </div>
          )}

          {mode === "gym" && (
            <div className="space-y-5">
              <div>
                <div className="text-2xl font-bold text-white">Gym workout</div>
                <div className="mt-1 text-sm text-white/58">
                  Choose the body part, then the exercise. Sets will auto-fill reps using your defaults. Click Add when
                  you want to log this workout.
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FancyDropdown
                  label="Muscle group"
                  value={muscle}
                  open={openSelect === "muscle"}
                  onToggle={() => setOpenSelect(openSelect === "muscle" ? null : "muscle")}
                  options={muscles.map((m) => ({ label: m, value: m }))}
                  onSelect={(v) => {
                    setMuscle(v);
                    repsTouchedRef.current = false;
                  }}
                  placeholder="Choose muscle group"
                  onClose={() => setOpenSelect(null)}
                />

                <FancyDropdown
                  label="Exercise"
                  value={exerciseId}
                  open={openSelect === "exercise"}
                  onToggle={() => setOpenSelect(openSelect === "exercise" ? null : "exercise")}
                  options={filteredGym.map((x) => ({
                    label: x.name,
                    value: x.id,
                    hint: x.muscle_group,
                  }))}
                  onSelect={(v) => {
                    setExerciseId(v);
                    repsTouchedRef.current = false;
                  }}
                  placeholder="Choose exercise"
                  onClose={() => setOpenSelect(null)}
                />

                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/50">Sets</div>
                  <FancyInput
                    placeholder="e.g. 3"
                    value={sets}
                    onChange={(e) => {
                      const next = e.target.value;
                      setSets(next);
                      if (!repsTouchedRef.current && selectedGym) {
                        setReps(String(estimateRepsFromSets(num(next), num(selectedGym.default_reps, 10))));
                      }
                    }}
                  />
                </div>

                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/50">Total reps</div>
                  <FancyInput
                    placeholder="Auto-filled from sets"
                    value={reps}
                    onChange={(e) => {
                      repsTouchedRef.current = true;
                      setReps(e.target.value);
                    }}
                  />
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-white/45">Live burn estimate</div>
                    <div className="mt-2 text-4xl font-bold text-white">{gymCalories} kcal</div>
                    <div className="mt-2 text-sm text-white/58">
                      Estimated from your selected exercise, sets, and total reps.
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/65">
                    Est. duration <span className="font-semibold text-white">{round(gymMinutes)} min</span>
                  </div>
                </div>
              </div>

              {msg && <div className="text-sm text-emerald-300">{msg}</div>}
              <button
                type="button"
                onClick={addGymEntry}
                className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:opacity-95"
              >
                Add gym workout
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="glass rounded-3xl p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-white">Today’s activity</h2>
          <div className="text-sm text-white/45">Newest first</div>
        </div>

        <div className="mt-4 space-y-3">
          {todayLogs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 p-5 text-sm text-white/50">
              No workouts logged yet for this date.
            </div>
          ) : (
            todayLogs.map((log) => {
              const title = log.exercise_name || log.workout_type || "Workout";
              const metaParts = [
                log.workout_type && log.workout_type !== log.exercise_name ? log.workout_type : null,
                log.steps ? `${log.steps} steps` : null,
                log.avg_incline ? `${round(num(log.avg_incline))}% incline` : null,
                log.duration_min ? `${round(num(log.duration_min))} min` : null,
                log.sets ? `${log.sets} sets` : null,
                log.avg_reps ? `${log.avg_reps} reps` : null,
              ].filter(Boolean);

              return (
                <div key={log.id} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-semibold text-white">{title}</div>
                      <div className="mt-1 text-sm text-white/55">{metaParts.length > 0 ? metaParts.join(" • ") : "Workout logged"}</div>
                    </div>

                    <div className="flex items-center gap-3 md:gap-4">
                      <div className="text-right">
                        <div className="text-lg font-bold text-white">{round(num(log.calories_burned))} kcal</div>
                        <div className="text-xs text-white/45">{formatWhen(log.created_at)}</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteWorkoutEntry(log.id)}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}