import { supabase } from "@/lib/supabase";

function n(v: any, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function round(v: number) {
  return Math.round(v * 100) / 100;
}

function boolHit(actual: number, target: number, toleranceRatio = 0.1) {
  if (target <= 0) return false;
  const low = target * (1 - toleranceRatio);
  const high = target * (1 + toleranceRatio);
  return actual >= low && actual <= high;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export async function rebuildDailyAnalysisSnapshot(userId: string, logDate: string) {
  const [mealsRes, waterRes, sleepRes, workoutsRes, profileRes] = await Promise.all([
    supabase
      .from("meals")
      .select("*")
      .eq("user_id", userId)
      .eq("log_date", logDate),

    supabase
      .from("water_logs")
      .select("*")
      .eq("user_id", userId)
      .eq("log_date", logDate)
      .maybeSingle(),

    supabase
      .from("sleep_logs")
      .select("*")
      .eq("user_id", userId)
      .eq("log_date", logDate)
      .maybeSingle(),

    supabase
      .from("workout_logs")
      .select("*")
      .eq("user_id", userId)
      .eq("log_date", logDate),

    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (mealsRes.error) throw new Error(mealsRes.error.message);
  if (waterRes.error) throw new Error(waterRes.error.message);
  if (sleepRes.error) throw new Error(sleepRes.error.message);
  if (workoutsRes.error) throw new Error(workoutsRes.error.message);
  if (profileRes.error) throw new Error(profileRes.error.message);

  const meals = mealsRes.data ?? [];
  const workouts = workoutsRes.data ?? [];
  const water = waterRes.data;
  const sleep = sleepRes.data;
  const profile = profileRes.data ?? {};

  const calorieIntake = round(meals.reduce((sum, m) => sum + n(m.calories, 0), 0));
  const proteinG = round(meals.reduce((sum, m) => sum + n(m.protein_g, 0), 0));

  const waterL = round(n(water?.ml, 0) / 1000);
  const sleepHours = round(n(sleep?.hours, 0));

  const caloriesBurned = round(
    workouts.reduce((sum, w) => sum + n(w.calories_burned, 0), 0)
  );

  const workoutSessions = workouts.length;

  const steps = Math.round(
    workouts.reduce((sum, w) => sum + n(w.steps, 0), 0)
  );

  const targetCalories = round(
    n(
      profile?.target_calorie_intake ??
        profile?.target_calories ??
        profile?.daily_calorie_intake,
      0
    )
  );

  const targetProteinG = round(
    n(
      profile?.target_protein_g ??
        profile?.target_protein ??
        profile?.daily_protein_target,
      0
    )
  );

  const targetBurn = round(
    n(
      profile?.target_burn_calories ??
        profile?.target_burn ??
        profile?.daily_burn_target,
      0
    )
  );

  const calorieDelta = round(calorieIntake - targetCalories);
  const proteinDelta = round(proteinG - targetProteinG);
  const burnDelta = round(caloriesBurned - targetBurn);

  const hitCalorieTarget = boolHit(calorieIntake, targetCalories, 0.1);
  const hitProteinTarget = targetProteinG > 0 ? proteinG >= targetProteinG * 0.9 : false;
  const hitBurnTarget = boolHit(caloriesBurned, targetBurn, 0.1);
  const hitWaterTarget = waterL >= 3;
  const hitSleepTarget = sleepHours >= 7;

  const consistencyChecks = [
    hitCalorieTarget ? 20 : 0,
    hitProteinTarget ? 20 : 0,
    hitBurnTarget ? 20 : 0,
    hitWaterTarget ? 20 : 0,
    hitSleepTarget ? 20 : 0,
  ];

  const consistencyScore = clamp(
    round(consistencyChecks.reduce((a, b) => a + b, 0)),
    0,
    100
  );

  const payload = {
    user_id: userId,
    log_date: logDate,

    calorie_intake: calorieIntake,
    protein_g: proteinG,
    water_l: waterL,
    sleep_hours: sleepHours,
    calories_burned: caloriesBurned,
    workout_sessions: workoutSessions,
    steps,

    target_calories: targetCalories,
    target_protein_g: targetProteinG,
    target_burn: targetBurn,

    calorie_delta: calorieDelta,
    protein_delta: proteinDelta,
    burn_delta: burnDelta,

    hit_calorie_target: hitCalorieTarget,
    hit_protein_target: hitProteinTarget,
    hit_burn_target: hitBurnTarget,
    hit_water_target: hitWaterTarget,
    hit_sleep_target: hitSleepTarget,

    consistency_score: consistencyScore,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertErr } = await supabase
    .from("daily_analysis_snapshots")
    .upsert(payload, { onConflict: "user_id,log_date" });

  if (upsertErr) throw new Error(upsertErr.message);

  return payload;
}