"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type GoalType = "general_fitness" | "fat_loss" | "muscle_gain" | "endurance";

export default function ProfilePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  // Profile
  const [name, setName] = useState("");
  const [heightCm, setHeightCm] = useState<string>("");
  const [weightKg, setWeightKg] = useState<string>("");

  // Goals
  const [goalType, setGoalType] = useState<GoalType>("general_fitness");
  const [stepsTarget, setStepsTarget] = useState<string>("8000");
  const [caloriesTarget, setCaloriesTarget] = useState<string>("2000");
  const [waterTarget, setWaterTarget] = useState<string>("2000");
  const [sleepTarget, setSleepTarget] = useState<string>("8");
  const [workoutsTarget, setWorkoutsTarget] = useState<string>("3");

  const [msg, setMsg] = useState("");

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
      }

      // Load goals
      const { data: goals, error: goalsErr } = await supabase
        .from("goals")
        .select("*")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (goalsErr) {
        setMsg(goalsErr.message);
        return;
      }

      if (goals) {
        setGoalType((goals.goal_type ?? "general_fitness") as GoalType);
        setStepsTarget(String(goals.steps_target ?? 8000));
        setCaloriesTarget(String(goals.calories_target ?? 2000));
        setWaterTarget(String(goals.water_ml_target ?? 2000));
        setSleepTarget(String(goals.sleep_hours_target ?? 8));
        setWorkoutsTarget(String(goals.workouts_per_week_target ?? 3));
      }
    })();
  }, [router]);

  async function saveAll() {
    setMsg("");
    if (!userId) return;

    const { error: profErr } = await supabase.from("profiles").upsert(
      {
        user_id: userId,
        name: name.trim() || null,
        height_cm: heightCm.trim() === "" ? null : parseInt(heightCm, 10),
        weight_kg: weightKg.trim() === "" ? null : parseFloat(weightKg),
      },
      { onConflict: "user_id" }
    );

    if (profErr) return setMsg(profErr.message);

    const { error: goalsErr } = await supabase.from("goals").upsert(
      {
        user_id: userId,
        goal_type: goalType,
        steps_target: parseInt(stepsTarget || "8000", 10),
        calories_target: parseInt(caloriesTarget || "2000", 10),
        water_ml_target: parseInt(waterTarget || "2000", 10),
        sleep_hours_target: parseFloat(sleepTarget || "8"),
        workouts_per_week_target: parseInt(workoutsTarget || "3", 10),
      },
      { onConflict: "user_id" }
    );

    if (goalsErr) return setMsg(goalsErr.message);

    setMsg("✅ Saved!");
    setTimeout(() => setMsg(""), 1200);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Profile & Goals</h1>
          <p className="text-sm text-zinc-400">{email}</p>
        </div>

        <button
          onClick={logout}
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
        >
          Logout
        </button>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-medium text-zinc-300">Personal info</h2>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
          />
          <input
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            placeholder="Height cm (optional)"
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
          />
          <input
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            placeholder="Weight kg (optional)"
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-medium text-zinc-300">Goals</h2>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div>
            <label className="text-xs text-zinc-500">Goal type</label>
            <select
              value={goalType}
              onChange={(e) => setGoalType(e.target.value as GoalType)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            >
              <option value="general_fitness">General fitness</option>
              <option value="fat_loss">Fat loss</option>
              <option value="muscle_gain">Muscle gain</option>
              <option value="endurance">Endurance</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-zinc-500">Steps/day</label>
            <input
              value={stepsTarget}
              onChange={(e) => setStepsTarget(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-500">Calories/day</label>
            <input
              value={caloriesTarget}
              onChange={(e) => setCaloriesTarget(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-500">Water/day (ml)</label>
            <input
              value={waterTarget}
              onChange={(e) => setWaterTarget(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-500">Sleep target (hrs)</label>
            <input
              value={sleepTarget}
              onChange={(e) => setSleepTarget(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-500">Workouts/week</label>
            <input
              value={workoutsTarget}
              onChange={(e) => setWorkoutsTarget(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <button
          onClick={saveAll}
          className="mt-4 w-full rounded-lg bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:opacity-90"
        >
          Save profile & goals
        </button>
      </div>

      <button
        onClick={() => router.push("/today")}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
      >
        Back to Today
      </button>

      {msg && (
        <p className={`text-sm ${msg.includes("✅") ? "text-emerald-400" : "text-red-400"}`}>
          {msg}
        </p>
      )}

      <p className="text-xs text-zinc-500">
        Note: This app provides general fitness guidance, not medical advice.
      </p>
    </div>
  );
}