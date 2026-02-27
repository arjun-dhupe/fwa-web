"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

type RecentFood = {
  id?: string | null;
  name: string;
  calories_per_100g: number | null;
  protein_g_per_100g: number | null;
  last_used_at: string;

  // NEW master defaults (food_items)
  measure_mode?: "grams" | "unit" | null;
  unit_label?: string | null;
  grams_per_unit?: number | null;
  default_units?: number | null;
  default_grams?: number | null;
};

function isUuid(v: any) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function yyyyMmDd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

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

export default function LogPage() {
  const router = useRouter();
  const todayIso = useMemo(() => yyyyMmDd(new Date()), []);
  const [logDateIso, setLogDateIso] = useState<string>(todayIso);

  const [userId, setUserId] = useState<string>("");

  // Steps
  const [steps, setSteps] = useState<number>(0);
  // Sleep
  const [sleepHours, setSleepHours] = useState<number>(0);
  // Water
  const [waterMl, setWaterMl] = useState<number>(0);

  // Meals
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [mealCalories, setMealCalories] = useState<number>(0);
  const [mealProtein, setMealProtein] = useState<number>(0);
  const [mealsToday, setMealsToday] = useState<any[]>([]);
  const [recentFoods, setRecentFoods] = useState<RecentFood[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  // Food search
  const [foodQuery, setFoodQuery] = useState<string>("");
  const [foodItems, setFoodItems] = useState<any[]>([]);
  const [foodOpen, setFoodOpen] = useState(false);
  const [foodLoading, setFoodLoading] = useState(false);
  const [foodSelected, setFoodSelected] = useState<any | null>(null);

  // grams always stored (we compute grams from unit mode too)
  const [foodGrams, setFoodGrams] = useState<number>(100);

  // Quantity mode (unit OR grams)
  const [qtyMode, setQtyMode] = useState<"grams" | "unit">("grams");
  const [unitLabel, setUnitLabel] = useState<string>("serving");
  const [unitGrams, setUnitGrams] = useState<number>(0);
  const [unitCount, setUnitCount] = useState<number>(1);

  const foodBoxRef = useRef<HTMLDivElement | null>(null);
  const foodInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const stepsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const foodTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper to load logs for a specific date
  async function loadLogsForDate(uid: string, dateIso: string) {
    if (!uid || !dateIso) return;

    try {
      const [stepsRes, sleepRes, waterRes, mealsRes] = await Promise.all([
        supabase
          .from("daily_logs")
          .select("steps")
          .eq("user_id", uid)
          .eq("log_date", dateIso)
          .maybeSingle(),
        supabase
          .from("sleep_logs")
          .select("hours")
          .eq("user_id", uid)
          .eq("log_date", dateIso)
          .maybeSingle(),
        supabase
          .from("water_logs")
          .select("ml")
          .eq("user_id", uid)
          .eq("log_date", dateIso)
          .maybeSingle(),
        supabase
          .from("meals")
          .select("id,meal_type,title,food_name,grams,calories,protein_g,created_at")
          .eq("user_id", uid)
          .eq("log_date", dateIso)
          .order("created_at", { ascending: false }),
      ]);

      setSteps(stepsRes.data?.steps != null ? Number(stepsRes.data.steps) : 0);
      setSleepHours(sleepRes.data?.hours != null ? Number(sleepRes.data.hours) : 0);
      setWaterMl(waterRes.data?.ml != null ? Number(waterRes.data.ml) : 0);
      setMealsToday(Array.isArray(mealsRes.data) ? mealsRes.data : []);

      // Keep recents per meal type (not date-specific)
      await fetchRecentFoods(uid, mealType);
    } catch {
      // If anything fails, don't crash the page
    }
  }

  // ================= INIT =================
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      setUserId(data.user.id);
      setLogDateIso((prev) => prev || todayIso);
      try {
        await loadLogsForDate(data.user.id, logDateIso);
      } catch {}
    })();
  }, [router, todayIso, logDateIso]);

  // Refresh smart recents when user switches meal type
  useEffect(() => {
    if (!userId) return;
    fetchRecentFoods(userId, mealType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealType, userId]);

  // Reload logs when the selected date changes
  useEffect(() => {
    if (!userId) return;
    loadLogsForDate(userId, logDateIso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logDateIso, userId]);

  // ================= AUTOSAVE =================
  function scheduleAutosave(kind: "steps" | "sleep" | "water", value: number) {
    const ref = kind === "steps" ? stepsTimer : kind === "sleep" ? sleepTimer : waterTimer;
    if (ref.current) clearTimeout(ref.current);

    ref.current = setTimeout(async () => {
      try {
        setLoading(true);
        setMsg("");
        if (kind === "steps")
          await supabase.from("daily_logs").upsert(
            { user_id: userId, log_date: logDateIso, steps: value },
            { onConflict: "user_id,log_date" }
          );
        if (kind === "sleep")
          await supabase.from("sleep_logs").upsert(
            { user_id: userId, log_date: logDateIso, hours: value },
            { onConflict: "user_id,log_date" }
          );
        if (kind === "water")
          await supabase.from("water_logs").upsert(
            { user_id: userId, log_date: logDateIso, ml: value },
            { onConflict: "user_id,log_date" }
          );
        setMsg("✅ Autosaved.");
      } catch (e: any) {
        setMsg(e?.message ?? "Autosave failed");
      } finally {
        setLoading(false);
      }
    }, 600);
  }

  // ================= RECENTS =================
  async function fetchRecentFoods(uid: string, type: MealType) {
    if (!uid) return;

    // Fallback: compute recents from meals table when the view fails/empty
    async function fallbackFromMeals() {
      const { data: meals, error: mErr } = await supabase
        .from("meals")
        .select("food_item_id,food_name,created_at")
        .eq("user_id", uid)
        .eq("meal_type", type)
        .order("created_at", { ascending: false })
        .limit(60);

      if (mErr) throw mErr;

      const seen = new Set<string>();
      const picked: { food_item_id: string | null; food_name: string; created_at: string }[] = [];

      for (const m of meals || []) {
        const key = (m.food_item_id
          ? `id:${m.food_item_id}`
          : `name:${(m.food_name || "").toLowerCase().trim()}`).trim();

        if (!key || seen.has(key)) continue;
        seen.add(key);

        picked.push({
          food_item_id: m.food_item_id ?? null,
          food_name: (m.food_name || "").trim() || "Unknown",
          created_at: m.created_at,
        });

        if (picked.length >= 8) break;
      }

      const ids = picked
        .map((p) => p.food_item_id)
        .filter((x): x is string => typeof x === "string" && x.length > 0);

      let foods: any[] = [];
      if (ids.length > 0) {
        const { data: foodsData, error: foodsErr } = await supabase
          .from("food_items")
          .select(
            "id,name,calories_per_100g,protein_g_per_100g,measure_mode,unit_label,grams_per_unit,default_units,default_grams"
          )
          .in("id", ids);

        if (foodsErr) throw foodsErr;
        foods = foodsData || [];
      }

      const map = new Map<string, any>(foods.map((f: any) => [f.id, f]));

      const merged: RecentFood[] = picked.map((p) => {
        const f = p.food_item_id ? map.get(p.food_item_id) : null;

        if (f) {
          return {
            id: f.id,
            name: f.name,
            calories_per_100g: f.calories_per_100g ?? null,
            protein_g_per_100g: f.protein_g_per_100g ?? null,
            last_used_at: p.created_at,
            measure_mode: (f.measure_mode ?? null) as any,
            unit_label: f.unit_label ?? null,
            grams_per_unit: f.grams_per_unit != null ? Number(f.grams_per_unit) : null,
            default_units: f.default_units != null ? Number(f.default_units) : null,
            default_grams: f.default_grams != null ? Number(f.default_grams) : null,
          };
        }

        // If meal was saved without a food_item_id, still show the name
        return {
          id: null,
          name: p.food_name,
          calories_per_100g: null,
          protein_g_per_100g: null,
          last_used_at: p.created_at,
          measure_mode: "grams",
          default_grams: 100,
        };
      });

      setRecentFoods(merged);
    }

    try {
      setRecentLoading(true);

      // 1) Try the view first
      const { data: rec, error: recErr } = await supabase
        .from("recent_foods")
        .select("food_item_id,last_used_at")
        .eq("user_id", uid)
        .eq("meal_type", type)
        .order("last_used_at", { ascending: false })
        .limit(8);

      if (recErr) {
        await fallbackFromMeals();
        return;
      }

      const ids = (rec || [])
        .map((r: any) => r.food_item_id)
        .filter((x: any) => typeof x === "string" && x.length > 0);

      if (ids.length === 0) {
        await fallbackFromMeals();
        return;
      }

      // 2) Pull those items from master list (NEW columns)
      const { data: foods, error: foodsErr } = await supabase
        .from("food_items")
        .select(
          "id,name,calories_per_100g,protein_g_per_100g,measure_mode,unit_label,grams_per_unit,default_units,default_grams"
        )
        .in("id", ids);

      if (foodsErr) throw foodsErr;

      // 3) Merge (keep recency order)
      const map = new Map<string, any>((foods || []).map((f: any) => [f.id, f]));
      const merged: RecentFood[] = (rec || [])
        .map((r: any) => {
          const f = map.get(r.food_item_id);
          if (!f) return null;
          return {
            id: f.id,
            name: f.name,
            calories_per_100g: f.calories_per_100g ?? null,
            protein_g_per_100g: f.protein_g_per_100g ?? null,
            last_used_at: r.last_used_at,
            measure_mode: (f.measure_mode ?? null) as any,
            unit_label: f.unit_label ?? null,
            grams_per_unit: f.grams_per_unit != null ? Number(f.grams_per_unit) : null,
            default_units: f.default_units != null ? Number(f.default_units) : null,
            default_grams: f.default_grams != null ? Number(f.default_grams) : null,
          } as RecentFood;
        })
        .filter(Boolean) as RecentFood[];

      setRecentFoods(merged);
    } catch {
      setRecentFoods([]);
    } finally {
      setRecentLoading(false);
    }
  }

  // ================= FOOD SEARCH =================
  useEffect(() => {
    if (foodTimer.current) clearTimeout(foodTimer.current);
    if (foodQuery.trim().length < 2) {
      setFoodItems([]);
      return;
    }
    foodTimer.current = setTimeout(() => runFoodSearch(foodQuery), 250);
    return () => {
      if (foodTimer.current) clearTimeout(foodTimer.current);
    };
  }, [foodQuery]);

  // Close dropdown on outside click + Esc
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!foodOpen) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (foodBoxRef.current && !foodBoxRef.current.contains(target)) {
        setFoodOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (!foodOpen) return;
      if (e.key === "Escape") setFoodOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [foodOpen]);

  async function runFoodSearch(q: string) {
    try {
      setFoodLoading(true);

      const { data, error } = await supabase
        .from("food_items")
        .select("*")
        .ilike("name", `%${q}%`)
        .limit(20);

      if (error) throw error;

      setFoodItems(data || []);
    } catch {
      setFoodItems([]);
    } finally {
      setFoodLoading(false);
    }
  }

  function recalcMeal(selected: any, grams: number) {
    if (!selected) return;
    const g = Number(grams) || 0;
    const cal100 = Number(selected?.calories_per_100g ?? 0) || 0;
    const pro100 = Number(selected?.protein_g_per_100g ?? 0) || 0;

    const cal = Math.round((cal100 * g) / 100);
    const pro = Math.round((pro100 * g) / 100);

    setMealCalories(cal);
    setMealProtein(pro);
  }

  function applyFoodDefaults(it: any) {
    if (!it) return;

    const mode = (it?.measure_mode ?? "grams") as "grams" | "unit";
    const gPerUnit = it?.grams_per_unit != null ? Number(it.grams_per_unit) : 0;
    const uLabel = (it?.unit_label ?? null) as string | null;
    const dUnits = it?.default_units != null ? Number(it.default_units) : null;
    const dGrams = it?.default_grams != null ? Number(it.default_grams) : null;

    // Prefer unit mode if the item is configured as unit-based
    if (mode === "unit" && gPerUnit > 0) {
      setQtyMode("unit");
      setUnitLabel(uLabel && uLabel.trim().length > 0 ? uLabel : "unit");
      setUnitGrams(gPerUnit);

      const count = dUnits && dUnits > 0 ? dUnits : 1;
      setUnitCount(count);

      const grams = Math.round(gPerUnit * count);
      setFoodGrams(grams);
      recalcMeal(it, grams);
      return;
    }

    // grams mode
    const grams = dGrams && dGrams > 0 ? dGrams : 100;
    setQtyMode("grams");
    setUnitLabel("serving");
    setUnitGrams(0);
    setUnitCount(1);

    setFoodGrams(grams);
    recalcMeal(it, grams);
  }

  function setUnitCountSafe(next: number, it: any) {
    const n = Math.max(0, Math.min(50, Number(next) || 0));
    setUnitCount(n);
    const grams = Math.round((Number(unitGrams) || 0) * n);
    setFoodGrams(grams);
    if (it) recalcMeal(it, grams);
  }

  function resetMealEntry(focus = false) {
    setFoodSelected(null);
    setFoodQuery("");
    setFoodItems([]);

    setFoodGrams(100);
    setQtyMode("grams");
    setUnitLabel("serving");
    setUnitGrams(0);
    setUnitCount(1);

    setMealCalories(0);
    setMealProtein(0);
    setFoodOpen(false);

    if (focus) setTimeout(() => foodInputRef.current?.focus(), 0);
  }

  // ================= ADD MEAL =================
  async function addMeal() {
    if (!userId) return;
    if (!foodSelected) {
      setMsg("Pick a food first.");
      return;
    }

    setLoading(true);
    setMsg("");

    try {
      const title = (foodSelected?.name || "Meal").trim() || "Meal";

      const insertPayload: any = {
        user_id: userId,
        log_date: logDateIso,
        meal_type: mealType,
        food_item_id: isUuid(foodSelected?.id) ? foodSelected.id : null,
        title,
        food_name: (foodSelected?.name || title).trim(),
        grams: Number(foodGrams) || 0,
        calories: Math.round(Number(mealCalories) || 0),
        protein_g: Math.round(Number(mealProtein) || 0),
      };

      // Save quantity + unit + grams IF the meals table has these columns.
      // If not present, we retry without them (so app still works).
      if (qtyMode === "unit") {
        insertPayload.quantity = Number(unitCount) || 0;
        insertPayload.unit_label = unitLabel;
        insertPayload.measure_mode = "unit";
      } else {
        insertPayload.quantity = Number(foodGrams) || 0;
        insertPayload.unit_label = "g";
        insertPayload.measure_mode = "grams";
      }

      let { error } = await supabase.from("meals").insert(insertPayload);

      // If meals table doesn't have these new columns, retry safely
      if (error && typeof error.message === "string" && error.message.toLowerCase().includes("column")) {
        const { quantity, unit_label, measure_mode, ...fallback } = insertPayload;
        const retry = await supabase.from("meals").insert(fallback);
        error = retry.error;
      }

      if (error) throw error;

      const { data } = await supabase
        .from("meals")
        .select("id,meal_type,title,food_name,grams,calories,protein_g,created_at")
        .eq("user_id", userId)
        .eq("log_date", logDateIso)
        .order("created_at", { ascending: false });

      setMealsToday(data || []);

      // Refresh recents (so it learns)
      fetchRecentFoods(userId, mealType);

      // Clear entry area for next add
      resetMealEntry(true);

      setMsg("✅ Meal added.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to add meal");
    } finally {
      setLoading(false);
    }
  }

  // ================= DELETE MEAL =================
  async function deleteMeal(mealId: string) {
    if (!userId || !mealId) return;
    setMsg("");

    try {
      setLoading(true);
      const { error } = await supabase.from("meals").delete().eq("id", mealId).eq("user_id", userId);
      if (error) throw error;

      setMealsToday((prev) => prev.filter((m) => m.id !== mealId));
      loadLogsForDate(userId, logDateIso);
      setMsg("✅ Meal deleted.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to delete meal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass glow-ring rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold text-white">Log Data</h1>
            <p className="text-sm text-white/70">Selected date: {logDateIso}</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-white/60">Log date</div>
            <input
              type="date"
              value={logDateIso}
              onChange={(e) => {
                const next = e.target.value;
                setLogDateIso(next);
                setMsg("");
                resetMealEntry(false);
              }}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="😴 Sleep">
          <input
            type="number"
            step={0.5}
            value={sleepHours}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSleepHours(v);
              scheduleAutosave("sleep", v);
            }}
            className="w-full rounded-lg bg-black/30 px-3 py-2 text-white"
          />
        </Card>

        <Card title="💧 Water">
          <input
            type="number"
            value={waterMl}
            onChange={(e) => {
              const v = Number(e.target.value);
              setWaterMl(v);
              scheduleAutosave("water", v);
            }}
            className="w-full rounded-lg bg-black/30 px-3 py-2 text-white"
          />
        </Card>

        <Card title="👣 Steps">
          <input
            type="number"
            value={steps}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSteps(v);
              scheduleAutosave("steps", v);
            }}
            className="w-full rounded-lg bg-black/30 px-3 py-2 text-white"
          />
        </Card>

        <Card title="🍽️ Meal">
          {/* meal type pills */}
          <div className="grid grid-cols-2 gap-2">
            {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setMealType(t)}
                className={cx(
                  "rounded-xl px-3 py-2 text-sm font-semibold transition",
                  mealType === t ? "bg-emerald-400/20 text-white" : "bg-black/30 text-white/70 hover:bg-black/40"
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="mt-3" ref={foodBoxRef}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-white/70">Search food</div>
              <div className="text-[11px] text-white/50">Smart recents per meal type</div>
            </div>

            {/* Recent foods */}
            <div className="mt-2">
              {recentLoading ? (
                <div className="text-xs text-white/55">Loading recent foods…</div>
              ) : recentFoods.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {recentFoods.slice(0, 6).map((f, idx) => (
                    <button
                      key={f.id ?? `${f.name}-${idx}`}
                      type="button"
                      onClick={() => {
                        const it = {
                          id: f.id ?? null,
                          name: f.name,
                          calories_per_100g: f.calories_per_100g,
                          protein_g_per_100g: f.protein_g_per_100g,
                          measure_mode: f.measure_mode ?? "grams",
                          unit_label: f.unit_label ?? null,
                          grams_per_unit: f.grams_per_unit ?? null,
                          default_units: f.default_units ?? null,
                          default_grams: f.default_grams ?? null,
                          source: "master",
                        };
                        setFoodSelected(it);
                        setFoodOpen(false);
                        applyFoodDefaults(it);
                      }}
                      className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-semibold text-white/85 hover:bg-black/40"
                      title="Tap to select"
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-white/55">No recent foods for this meal type yet.</div>
              )}
            </div>

            {/* search input */}
            <div className="relative mt-2">
              <input
                ref={foodInputRef}
                value={foodQuery}
                onChange={(e) => {
                  setFoodQuery(e.target.value);
                  setFoodOpen(true);
                }}
                onFocus={() => setFoodOpen(true)}
                placeholder="Search… (e.g., banana, oats, paneer, roti)"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40"
              />

              {/* Dropdown */}
              {foodOpen && foodQuery.trim().length >= 2 && (
                <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-black/85 backdrop-blur-xl">
                  <div className="max-h-60 overflow-auto">
                    {foodLoading ? (
                      <div className="px-3 py-3 text-sm text-white/70">Searching…</div>
                    ) : foodItems.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-white/70">No results. Try another keyword.</div>
                    ) : (
                      foodItems.map((it) => {
                        const key = it.id ?? it.name;
                        const cal100 = it.calories_per_100g ?? "–";
                        const pro100 = it.protein_g_per_100g ?? "–";
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              setFoodSelected(it);
                              setFoodOpen(false);
                              applyFoodDefaults(it);
                            }}
                            className="w-full px-3 py-2 text-left text-sm transition hover:bg-white/5"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-semibold text-white/95">{it.name}</div>
                                <div className="mt-0.5 text-xs text-white/55">
                                  {it.brand ? `${it.brand} • ` : ""}
                                  {it.source}
                                </div>
                              </div>

                              <div className="shrink-0 text-right text-xs text-white/65">
                                <div>{cal100} kcal/100g</div>
                                <div>{pro100}g protein/100g</div>

                                {it.measure_mode === "unit" && it.unit_label && it.grams_per_unit ? (
                                  <div className="mt-1 text-[11px] text-white/55">
                                    Default: {it.default_units ?? 1} {it.unit_label} ({it.grams_per_unit}g each)
                                  </div>
                                ) : it.default_grams ? (
                                  <div className="mt-1 text-[11px] text-white/55">Default: {it.default_grams}g</div>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-xs text-white/60">
                    <span>Click outside (or Esc) to close</span>
                    <button
                      type="button"
                      onClick={() => setFoodOpen(false)}
                      className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 hover:bg-white/10"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Selected summary + quantity mode */}
            <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-white/60">Selected</div>
                  <div className="truncate text-sm font-semibold text-white">
                    {foodSelected ? foodSelected.name : "Nothing selected yet"}
                  </div>
                  {foodSelected?.brand ? <div className="text-xs text-white/55">{foodSelected.brand}</div> : null}
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-xs text-white/60">Quantity</div>

                  {qtyMode === "unit" && unitGrams > 0 ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setUnitCountSafe(unitCount - 1, foodSelected)}
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white/90 hover:bg-white/10"
                      >
                        −
                      </button>

                      <div className="min-w-[90px] rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
                        <b className="text-white">{unitCount}</b> {unitLabel}
                      </div>

                      <button
                        type="button"
                        onClick={() => setUnitCountSafe(unitCount + 1, foodSelected)}
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white/90 hover:bg-white/10"
                      >
                        +
                      </button>

                      <div className="text-xs text-white/60">({foodGrams}g)</div>

                      <button
                        type="button"
                        onClick={() => {
                          setQtyMode("grams");
                          setUnitCount(1);
                        }}
                        className="ml-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                      >
                        Use grams
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-white/60">Qty (g)</div>
                      <input
                        type="number"
                        min={0}
                        value={foodGrams}
                        onChange={(e) => {
                          const g = Number(e.target.value);
                          setFoodGrams(g);
                          if (foodSelected) recalcMeal(foodSelected, g);
                        }}
                        className="w-24 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                      />

                      {foodSelected?.measure_mode === "unit" &&
                      foodSelected?.unit_label &&
                      foodSelected?.grams_per_unit ? (
                        <button
                          type="button"
                          onClick={() => {
                            setQtyMode("unit");
                            setUnitLabel(String(foodSelected.unit_label));
                            setUnitGrams(Number(foodSelected.grams_per_unit));

                            const count =                               foodSelected.default_units && Number(foodSelected.default_units) > 0
                                ? Number(foodSelected.default_units)
                                : 1;
                            setUnitCount(count);

                            const g = Math.round(Number(foodSelected.grams_per_unit) * count);
                            setFoodGrams(g);
                            recalcMeal(foodSelected, g);
                          }}
                          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                        >
                          Use {String(foodSelected.unit_label)}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-xs text-white/60">Calories</div>
                  <div className="mt-1 text-lg font-extrabold text-white">{mealCalories || 0}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-xs text-white/60">Protein (g)</div>
                  <div className="mt-1 text-lg font-extrabold text-white">{mealProtein || 0}</div>
                </div>
              </div>

              <div className="mt-2 text-xs text-white/55">
                Tip: pick food → adjust quantity → hit “Add”.
              </div>
            </div>

            {/* Add button */}
            <button
              type="button"
              onClick={addMeal}
              disabled={loading || !foodSelected}
              className={cx(
                "mt-3 w-full rounded-xl px-4 py-3 text-sm font-extrabold transition",
                !foodSelected
                  ? "cursor-not-allowed border border-white/10 bg-white/5 text-white/40"
                  : "btn-win login-btn !text-white",
                loading && "opacity-80"
              )}
            >
              {loading ? "Adding…" : `Add ${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`}
            </button>

            {/* Added meals list + delete */}
            <div className="mt-4 space-y-2">
              {mealsToday.length > 0 ? (
                <>
                  <div className="text-xs font-semibold text-white/70">Added for selected date</div>

                  {mealsToday.map((m) => (
                    <div
                      key={m.id}
                      className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white/85 hover:bg-black/35"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => resetMealEntry(true)}
                          className="min-w-0 flex-1 text-left"
                          title="Tap to clear the entry area and add another meal"
                        >
                          <div className="truncate font-semibold text-white">{m.title}</div>
                          <div className="mt-0.5 text-xs text-white/60">
                            {m.meal_type}
                            {m.grams != null ? ` • ${m.grams}g` : ""}
                          </div>
                        </button>

                        <div className="shrink-0 text-right text-xs text-white/65">
                          <div>{m.calories ?? 0} kcal</div>
                          <div>{m.protein_g ?? 0}g protein</div>

                          <button
                            type="button"
                            onClick={() => deleteMeal(m.id)}
                            className="mt-2 rounded-lg border border-red-400/30 bg-red-400/10 px-2 py-1 text-[11px] font-bold text-red-200 hover:bg-red-400/15"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="text-[11px] text-white/50">
                    Tip: tap any item above to clear search quickly. Use Delete to remove mistakes.
                  </div>
                </>
              ) : (
                <div className="text-xs text-white/55">No meals added yet.</div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {msg && (
        <div className={cx("text-sm", msg.startsWith("✅") ? "text-emerald-300" : "text-red-300")}>
          {msg}
        </div>
      )}
    </div>
  );
}
                             