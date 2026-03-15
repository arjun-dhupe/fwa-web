"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { rebuildDailyAnalysisSnapshot } from "@/lib/analysis";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

type RecentFood = {
  id?: string | null;
  name: string;
  calories_per_100g: number | null;
  protein_g_per_100g: number | null;
  last_used_at: string;
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function cx(...s: (string | false | null | undefined)[]) {
  return s.filter(Boolean).join(" ");
}

/* ─── Meal type config ───────────────────────────────── */
const MEAL_CONFIG: Record<MealType, { label: string; icon: string; color: string; time: string }> = {
  breakfast: { label: "Breakfast", icon: "🌅", color: "#f59e0b", time: "Morning"   },
  lunch:     { label: "Lunch",     icon: "☀️",  color: "#38bdf8", time: "Midday"    },
  dinner:    { label: "Dinner",    icon: "🌙",  color: "#a78bfa", time: "Evening"   },
  snack:     { label: "Snack",     icon: "⚡",  color: "#f97316", time: "Any time"  },
};

/* ─── Sleep quality helper ───────────────────────────── */
function sleepQuality(h: number): { label: string; color: string; bar: string } {
  if (h === 0)     return { label: "Not logged",   color: "#475569", bar: "bg-slate-500/40" };
  if (h < 5.5)     return { label: "Insufficient", color: "#ef4444", bar: "bg-rose-500"     };
  if (h < 6.5)     return { label: "Below target", color: "#f97316", bar: "bg-orange-500"   };
  if (h < 7.5)     return { label: "Good",         color: "#eab308", bar: "bg-yellow-500"   };
  if (h <= 9)      return { label: "Optimal",      color: "#22c55e", bar: "bg-emerald-500"  };
  return              { label: "Long",          color: "#38bdf8", bar: "bg-sky-500"      };
}

export default function LogPage() {
  const router   = useRouter();
  const todayIso = useMemo(() => yyyyMmDd(new Date()), []);
  const [logDateIso, setLogDateIso] = useState<string>(todayIso);

  const [userId, setUserId] = useState<string>("");

  /* sleep + water */
  const [sleepHours,  setSleepHours]  = useState<number>(0);
  const [waterLitres, setWaterLitres] = useState<number>(0);

  /* meals */
  const [mealType,     setMealType]     = useState<MealType>("breakfast");
  const [mealCalories, setMealCalories] = useState<number>(0);
  const [mealProtein,  setMealProtein]  = useState<number>(0);
  const [mealsToday,   setMealsToday]   = useState<any[]>([]);
  const [recentFoods,  setRecentFoods]  = useState<RecentFood[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  /* food search */
  const [foodQuery,    setFoodQuery]    = useState<string>("");
  const [foodItems,    setFoodItems]    = useState<any[]>([]);
  const [foodOpen,     setFoodOpen]     = useState(false);
  const [foodLoading,  setFoodLoading]  = useState(false);
  const [foodSelected, setFoodSelected] = useState<any | null>(null);

  // Fixed-position coords for the dropdown portal
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const [foodGrams,  setFoodGrams]  = useState<number>(100);
  const [qtyMode,    setQtyMode]    = useState<"grams" | "unit">("grams");
  const [unitLabel,  setUnitLabel]  = useState<string>("serving");
  const [unitGrams,  setUnitGrams]  = useState<number>(0);
  const [unitCount,  setUnitCount]  = useState<number>(1);

  const foodBoxRef  = useRef<HTMLDivElement | null>(null);
  const foodInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [msg,     setMsg]     = useState<string>("");

  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const foodTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── daily totals ── */
  const totalCalories = useMemo(() => mealsToday.reduce((s, m) => s + (m.calories ?? 0), 0), [mealsToday]);
  const totalProtein  = useMemo(() => mealsToday.reduce((s, m) => s + (m.protein_g ?? 0), 0), [mealsToday]);

  /* ── date navigation helpers ── */
  function shiftDate(days: number) {
    const d = new Date(logDateIso + "T00:00:00");
    d.setDate(d.getDate() + days);
    const next = yyyyMmDd(d);
    setLogDateIso(next);
    setMsg("");
    resetMealEntry(false);
  }
  const isToday = logDateIso === todayIso;

  /* ══════════════════ DATA LOADING ══════════════════ */
  async function loadLogsForDate(uid: string, dateIso: string) {
    if (!uid || !dateIso) return;
    try {
      const [sleepRes, waterRes, mealsRes] = await Promise.all([
        supabase.from("sleep_logs").select("hours").eq("user_id", uid).eq("log_date", dateIso).maybeSingle(),
        supabase.from("water_logs").select("ml").eq("user_id", uid).eq("log_date", dateIso).maybeSingle(),
        supabase.from("meals").select("id,meal_type,title,food_name,grams,calories,protein_g,created_at")
          .eq("user_id", uid).eq("log_date", dateIso).order("created_at", { ascending: false }),
      ]);
      setSleepHours(sleepRes.data?.hours != null ? Number(sleepRes.data.hours) : 0);
      setWaterLitres(waterRes.data?.ml != null ? Number(waterRes.data.ml) / 1000 : 0);
      setMealsToday(Array.isArray(mealsRes.data) ? mealsRes.data : []);
      await fetchRecentFoods(uid, mealType);
    } catch {}
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.push("/login"); return; }
      setUserId(data.user.id);
      await loadLogsForDate(data.user.id, logDateIso);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, todayIso]);

  useEffect(() => {
    if (!userId) return;
    fetchRecentFoods(userId, mealType);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealType, userId]);

  useEffect(() => {
    if (!userId) return;
    loadLogsForDate(userId, logDateIso);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logDateIso, userId]);

  // Portal needs document.body to be position:relative so absolute coords work correctly
  useEffect(() => {
    const prev = document.body.style.position;
    if (!prev) document.body.style.position = "relative";
    return () => { if (!prev) document.body.style.position = ""; };
  }, []);

  // Reposition dropdown on scroll so it stays glued to the input
  useEffect(() => {
    if (!foodOpen) return;
    function onScroll() { openDropdownAtInput(); }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foodOpen]);

  function openDropdownAtInput() {
    if (!foodInputRef.current) return;
    const rect = foodInputRef.current.getBoundingClientRect();
    setDropdownPos({
      top:   rect.bottom + window.scrollY + 6,  // absolute = document space, needs scrollY
      left:  rect.left   + window.scrollX,
      width: rect.width,
    });
    setFoodOpen(true);
  }

  /* ══════════════════ AUTOSAVE ══════════════════ */
  function scheduleAutosave(kind: "sleep" | "water", value: number) {
    const ref = kind === "sleep" ? sleepTimer : waterTimer;
    if (ref.current) clearTimeout(ref.current);
    ref.current = setTimeout(async () => {
      try {
        setLoading(true);
        setMsg("");
        if (kind === "sleep") await supabase.from("sleep_logs").upsert({ user_id: userId, log_date: logDateIso, hours: value }, { onConflict: "user_id,log_date" });
        if (kind === "water") await supabase.from("water_logs").upsert({ user_id: userId, log_date: logDateIso, ml: Math.round(value * 1000) }, { onConflict: "user_id,log_date" });
        await rebuildDailyAnalysisSnapshot(userId, logDateIso);
        setMsg("✅ Saved.");
      } catch (e: any) {
        setMsg(e?.message ?? "Autosave failed");
      } finally {
        setLoading(false);
      }
    }, 600);
  }

  /* ══════════════════ RECENTS ══════════════════ */
  async function fetchRecentFoods(uid: string, type: MealType) {
    if (!uid) return;

    async function fallbackFromMeals() {
      const { data: meals, error: mErr } = await supabase.from("meals")
        .select("food_item_id,food_name,created_at").eq("user_id", uid).eq("meal_type", type)
        .order("created_at", { ascending: false }).limit(60);
      if (mErr) throw mErr;
      const seen = new Set<string>();
      const picked: { food_item_id: string | null; food_name: string; created_at: string }[] = [];
      for (const m of meals || []) {
        const key = (m.food_item_id ? `id:${m.food_item_id}` : `name:${(m.food_name || "").toLowerCase().trim()}`).trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        picked.push({ food_item_id: m.food_item_id ?? null, food_name: (m.food_name || "").trim() || "Unknown", created_at: m.created_at });
        if (picked.length >= 8) break;
      }
      const ids = picked.map((p) => p.food_item_id).filter((x): x is string => typeof x === "string" && x.length > 0);
      let foods: any[] = [];
      if (ids.length > 0) {
        const { data: fd, error: fe } = await supabase.from("food_items").select("id,name,calories_per_100g,protein_g_per_100g,measure_mode,unit_label,grams_per_unit,default_units,default_grams").in("id", ids);
        if (fe) throw fe;
        foods = fd || [];
      }
      const map = new Map<string, any>(foods.map((f: any) => [f.id, f]));
      setRecentFoods(picked.map((p) => {
        const f = p.food_item_id ? map.get(p.food_item_id) : null;
        if (f) return { id:f.id, name:f.name, calories_per_100g:f.calories_per_100g??null, protein_g_per_100g:f.protein_g_per_100g??null, last_used_at:p.created_at, measure_mode:(f.measure_mode??null) as any, unit_label:f.unit_label??null, grams_per_unit:f.grams_per_unit!=null?Number(f.grams_per_unit):null, default_units:f.default_units!=null?Number(f.default_units):null, default_grams:f.default_grams!=null?Number(f.default_grams):null };
        return { id:null, name:p.food_name, calories_per_100g:null, protein_g_per_100g:null, last_used_at:p.created_at, measure_mode:"grams", default_grams:100 };
      }));
    }

    try {
      setRecentLoading(true);
      const { data: rec, error: recErr } = await supabase.from("recent_foods").select("food_item_id,last_used_at").eq("user_id", uid).eq("meal_type", type).order("last_used_at", { ascending: false }).limit(8);
      if (recErr) { await fallbackFromMeals(); return; }
      const ids = (rec || []).map((r: any) => r.food_item_id).filter((x: any) => typeof x === "string" && x.length > 0);
      if (ids.length === 0) { await fallbackFromMeals(); return; }
      const { data: foods, error: fe } = await supabase.from("food_items").select("id,name,calories_per_100g,protein_g_per_100g,measure_mode,unit_label,grams_per_unit,default_units,default_grams").in("id", ids);
      if (fe) throw fe;
      const map = new Map<string, any>((foods || []).map((f: any) => [f.id, f]));
      const merged: RecentFood[] = (rec || []).map((r: any) => {
        const f = map.get(r.food_item_id);
        if (!f) return null;
        return { id:f.id, name:f.name, calories_per_100g:f.calories_per_100g??null, protein_g_per_100g:f.protein_g_per_100g??null, last_used_at:r.last_used_at, measure_mode:(f.measure_mode??null) as any, unit_label:f.unit_label??null, grams_per_unit:f.grams_per_unit!=null?Number(f.grams_per_unit):null, default_units:f.default_units!=null?Number(f.default_units):null, default_grams:f.default_grams!=null?Number(f.default_grams):null } as RecentFood;
      }).filter(Boolean) as RecentFood[];
      setRecentFoods(merged);
    } catch {
      setRecentFoods([]);
    } finally {
      setRecentLoading(false);
    }
  }

  /* ══════════════════ FOOD SEARCH ══════════════════ */
  useEffect(() => {
    if (foodTimer.current) clearTimeout(foodTimer.current);
    if (foodQuery.trim().length < 2) { setFoodItems([]); return; }
    foodTimer.current = setTimeout(() => runFoodSearch(foodQuery), 250);
    return () => { if (foodTimer.current) clearTimeout(foodTimer.current); };
  }, [foodQuery]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!foodOpen) return;
      if (foodBoxRef.current && !foodBoxRef.current.contains(e.target as Node)) setFoodOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (foodOpen && e.key === "Escape") setFoodOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [foodOpen]);

  async function runFoodSearch(q: string) {
    try {
      setFoodLoading(true);
      const { data, error } = await supabase.from("food_items").select("*").ilike("name", `%${q}%`).limit(20);
      if (error) throw error;
      setFoodItems(data || []);
    } catch { setFoodItems([]); } finally { setFoodLoading(false); }
  }

  function recalcMeal(selected: any, grams: number) {
    if (!selected) return;
    const g = Number(grams) || 0;
    setMealCalories(Math.round(((Number(selected?.calories_per_100g ?? 0)) * g) / 100));
    setMealProtein(Math.round(((Number(selected?.protein_g_per_100g ?? 0)) * g) / 100));
  }

  function applyFoodDefaults(it: any) {
    if (!it) return;
    const mode = (it?.measure_mode ?? "grams") as "grams" | "unit";
    const gPerUnit = it?.grams_per_unit != null ? Number(it.grams_per_unit) : 0;
    const uLabel   = (it?.unit_label ?? null) as string | null;
    if (mode === "unit" && gPerUnit > 0) {
      setQtyMode("unit"); setUnitLabel(uLabel?.trim() || "unit"); setUnitGrams(gPerUnit);
      const count = it?.default_units && it.default_units > 0 ? Number(it.default_units) : 1;
      setUnitCount(count);
      const grams = Math.round(gPerUnit * count);
      setFoodGrams(grams); recalcMeal(it, grams);
      return;
    }
    const grams = it?.default_grams && it.default_grams > 0 ? Number(it.default_grams) : 100;
    setQtyMode("grams"); setUnitLabel("serving"); setUnitGrams(0); setUnitCount(1);
    setFoodGrams(grams); recalcMeal(it, grams);
  }

  function setUnitCountSafe(next: number, it: any) {
    const n = Math.max(0, Math.min(50, Number(next) || 0));
    setUnitCount(n);
    const grams = Math.round((Number(unitGrams) || 0) * n);
    setFoodGrams(grams);
    if (it) recalcMeal(it, grams);
  }

  function resetMealEntry(focus = false) {
    setFoodSelected(null); setFoodQuery(""); setFoodItems([]);
    setFoodGrams(100); setQtyMode("grams"); setUnitLabel("serving"); setUnitGrams(0); setUnitCount(1);
    setMealCalories(0); setMealProtein(0); setFoodOpen(false);
    if (focus) setTimeout(() => foodInputRef.current?.focus(), 0);
  }

  /* ══════════════════ ADD MEAL ══════════════════ */
  async function addMeal() {
    if (!userId || !foodSelected) { setMsg("Pick a food first."); return; }
    setLoading(true); setMsg("");
    try {
      const title = (foodSelected?.name || "Meal").trim() || "Meal";
      const insertPayload: any = {
        user_id: userId, log_date: logDateIso, meal_type: mealType,
        food_item_id: isUuid(foodSelected?.id) ? foodSelected.id : null,
        title, food_name: (foodSelected?.name || title).trim(),
        grams: Number(foodGrams) || 0,
        calories: Math.round(Number(mealCalories) || 0),
        protein_g: Math.round(Number(mealProtein) || 0),
      };
      if (qtyMode === "unit") { insertPayload.quantity = Number(unitCount)||0; insertPayload.unit_label = unitLabel; insertPayload.measure_mode = "unit"; }
      else { insertPayload.quantity = Number(foodGrams)||0; insertPayload.unit_label = "g"; insertPayload.measure_mode = "grams"; }

      let { error } = await supabase.from("meals").insert(insertPayload);
      if (error && typeof error.message === "string" && error.message.toLowerCase().includes("column")) {
        const { quantity, unit_label, measure_mode, ...fallback } = insertPayload;
        const retry = await supabase.from("meals").insert(fallback);
        error = retry.error;
      }
      if (error) throw error;

      const { data } = await supabase.from("meals").select("id,meal_type,title,food_name,grams,calories,protein_g,created_at")
        .eq("user_id", userId).eq("log_date", logDateIso).order("created_at", { ascending: false });
      setMealsToday(data || []);
      await rebuildDailyAnalysisSnapshot(userId, logDateIso);
      fetchRecentFoods(userId, mealType);
      resetMealEntry(true);
      setMsg("✅ Meal added.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to add meal");
    } finally {
      setLoading(false);
    }
  }

  /* ══════════════════ DELETE MEAL ══════════════════ */
  async function deleteMeal(mealId: string) {
    if (!userId || !mealId) return;
    setMsg(""); setLoading(true);
    try {
      const { error } = await supabase.from("meals").delete().eq("id", mealId).eq("user_id", userId);
      if (error) throw error;
      setMealsToday((prev) => prev.filter((m) => m.id !== mealId));
      await rebuildDailyAnalysisSnapshot(userId, logDateIso);
      setMsg("✅ Deleted.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to delete");
    } finally {
      setLoading(false);
    }
  }

  /* ══════════════════ RENDER ══════════════════ */
  const sq = sleepQuality(sleepHours);
  const mealConf = MEAL_CONFIG[mealType];
  const mealsByType = useMemo(() => {
    const out: Record<MealType, any[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    for (const m of mealsToday) {
      const t = (m.meal_type as MealType) || "snack";
      if (out[t]) out[t].push(m);
    }
    return out;
  }, [mealsToday]);

  return (
    <>
      <style>{`
        .log-card-l1 { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); }
        .log-card-l2 { background: rgba(0,0,0,0.25);      border: 1px solid rgba(255,255,255,0.07); }
        .log-card-l3 { background: rgba(0,0,0,0.35);      border: 1px solid rgba(255,255,255,0.06); }

        @keyframes logFadeUp {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .log-fade { animation: logFadeUp 0.35s ease both; }
        .log-d1 { animation-delay:0.05s; }
        .log-d2 { animation-delay:0.10s; }
        .log-d3 { animation-delay:0.15s; }
        .log-d4 { animation-delay:0.20s; }

        /* Sleep arc */
        .sleep-arc-bg  { stroke: rgba(255,255,255,0.07); }
        .sleep-arc-bar { transition: stroke-dasharray 0.6s ease; stroke-linecap: round; }

        /* Meal type button active state handled inline */
        .meal-type-btn { transition: all 0.18s ease; }
        .meal-type-btn:hover { transform: translateY(-1px); }

        /* Recent food chips */
        .recent-chip {
          transition: all 0.15s ease;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
        }
        .recent-chip:hover {
          border-color: rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.08);
          transform: translateY(-1px);
        }
        .recent-chip.selected {
          border-color: rgba(163,230,53,0.4);
          background: rgba(163,230,53,0.08);
        }

        /* Search dropdown — portal-rendered at viewport level */
        .food-dropdown {
          background: #0e1008;
          border: 1px solid rgba(163,230,53,0.25);
          border-radius: 16px;
          overflow: hidden;
          animation: logFadeUp 0.15s ease;
          box-shadow:
            0 32px 64px rgba(0,0,0,0.8),
            0 0 0 1px rgba(163,230,53,0.08) inset,
            0 1px 0 rgba(163,230,53,0.15) inset;
        }
        .food-dropdown-item {
          border-bottom: 1px solid rgba(255,255,255,0.04);
          transition: background 0.1s ease;
          cursor: pointer;
        }
        .food-dropdown-item:last-child { border-bottom: none; }
        .food-dropdown-item:hover {
          background: rgba(163,230,53,0.07);
        }
        .food-dropdown-item:hover .food-item-name { color: #ffffff; }
        .food-dropdown-item:hover .food-kcal { color: #a3e635; }
        .food-dropdown-scroll::-webkit-scrollbar { width: 3px; }
        .food-dropdown-scroll::-webkit-scrollbar-track { background: transparent; }
        .food-dropdown-scroll::-webkit-scrollbar-thumb { background: rgba(163,230,53,0.2); border-radius: 99px; }
      `}</style>

      <div className="space-y-5">

        {/* ── HEADER ─────────────────────────────────── */}
        <div className="log-fade log-card-l1 rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">Log Data</h1>
              <p className="text-xs text-white/40 mt-0.5">Track food, sleep and water</p>
            </div>

            {/* Date navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => shiftDate(-1)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-white/60 hover:bg-white/10 hover:text-white transition"
              >‹</button>
              <input
                type="date"
                value={logDateIso}
                onChange={(e) => { setLogDateIso(e.target.value); setMsg(""); resetMealEntry(false); }}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              />
              <button
                onClick={() => shiftDate(1)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-white/60 hover:bg-white/10 hover:text-white transition"
              >›</button>
              {!isToday && (
                <button onClick={() => { setLogDateIso(todayIso); setMsg(""); resetMealEntry(false); }}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60 hover:bg-white/10 transition">
                  Today
                </button>
              )}
            </div>
          </div>

          {/* Daily totals bar */}
          {mealsToday.length > 0 && (
            <div className="mt-4 flex items-center gap-4 rounded-xl border border-white/6 bg-black/20 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">Today so far</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold text-white">{totalCalories}</span>
                <span className="text-xs text-white/40">kcal</span>
              </div>
              <div className="h-3 w-px bg-white/10" />
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold text-white">{totalProtein}g</span>
                <span className="text-xs text-white/40">protein</span>
              </div>
              <div className="h-3 w-px bg-white/10" />
              <div className="text-xs text-white/35">
                {mealsToday.length} item{mealsToday.length !== 1 ? "s" : ""} logged
              </div>
            </div>
          )}
        </div>

        {/* ── SLEEP + WATER ── side by side ──────────── */}
        <div className="log-fade log-d1 grid gap-4 sm:grid-cols-2">

          {/* Sleep */}
          <div className="log-card-l1 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">😴</span>
              <span className="text-base font-bold text-white">Sleep</span>
              <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: `${sq.color}18`, color: sq.color }}>
                {sq.label}
              </span>
            </div>

            {/* Visual sleep arc */}
            <div className="flex justify-center mb-4">
              <div className="relative">
                <svg width="120" height="68" viewBox="0 0 120 68">
                  {/* bg arc */}
                  <path d="M10 65 A50 50 0 0 1 110 65" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" strokeLinecap="round" />
                  {/* fill arc — 10h max */}
                  <path
                    d="M10 65 A50 50 0 0 1 110 65"
                    fill="none"
                    stroke={sq.color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${Math.min(sleepHours / 10, 1) * 157} 157`}
                    style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.4s ease" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
                  <span className="text-2xl font-bold text-white">{sleepHours || "—"}</span>
                  <span className="text-[10px] text-white/35">hours</span>
                </div>
              </div>
            </div>

            {/* Input */}
            <input
              type="number" step={0.5} value={sleepHours}
              onChange={(e) => { const v = Number(e.target.value); setSleepHours(v); scheduleAutosave("sleep", v); }}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-center text-sm text-white mb-3"
            />

            {/* Quick picks */}
            <div className="grid grid-cols-4 gap-1.5">
              {[5.5, 6, 7, 8].map((h) => (
                <button key={h} type="button"
                  onClick={() => { setSleepHours(h); scheduleAutosave("sleep", h); }}
                  className={cx(
                    "rounded-xl py-2 text-xs font-bold transition",
                    sleepHours === h ? "text-black" : "border border-white/10 bg-black/20 text-white/60 hover:bg-black/30"
                  )}
                  style={sleepHours === h ? { background: sq.color } : {}}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>

          {/* Water */}
          <div className="log-card-l1 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">💧</span>
              <span className="text-base font-bold text-white">Water</span>
              <span className="ml-auto text-xs text-white/40">Goal: 2.5 L</span>
            </div>

            {/* Visual water fill */}
            <div className="flex justify-center mb-4">
              <div className="relative flex items-end justify-center" style={{ width: 64, height: 80 }}>
                {/* Glass outline */}
                <div className="absolute inset-0 rounded-b-2xl rounded-t-lg border border-white/15" />
                {/* Water fill */}
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-b-2xl transition-all duration-700"
                  style={{
                    height: `${Math.min((waterLitres / 2.5) * 100, 100)}%`,
                    background: "linear-gradient(to top, rgba(56,189,248,0.5), rgba(125,211,252,0.25))",
                    borderRadius: "0 0 14px 14px",
                  }}
                />
                <div className="relative z-10 pb-2 text-center">
                  <span className="text-lg font-bold text-white leading-none">
                    {waterLitres >= 1 ? waterLitres.toFixed(1) : (waterLitres * 1000).toFixed(0)}
                  </span>
                  <div className="text-[9px] text-white/50">{waterLitres >= 1 ? "L" : "ml"}</div>
                </div>
              </div>
            </div>

            {/* Input */}
            <input
              type="number" step={0.1} value={waterLitres}
              onChange={(e) => { const v = Number(e.target.value); setWaterLitres(v); scheduleAutosave("water", v); }}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-center text-sm text-white mb-3"
            />

            {/* Increment buttons */}
            <div className="grid grid-cols-4 gap-1.5">
              {[0.25, 0.5, 1, 1.5].map((amt) => (
                <button key={amt} type="button"
                  onClick={() => { const v = Number((waterLitres + amt).toFixed(2)); setWaterLitres(v); scheduleAutosave("water", v); }}
                  className="rounded-xl border border-sky-400/20 bg-sky-400/8 py-2 text-xs font-bold text-sky-300 hover:bg-sky-400/15 transition"
                >
                  +{amt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── MEAL LOGGER ─────────────────────────────── */}
        <div className="log-fade log-d2 log-card-l1 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <span className="text-lg">🍽️</span>
            <span className="text-base font-bold text-white">Log a meal</span>
          </div>

          {/* Meal type — large coloured tiles */}
          <div className="grid grid-cols-4 gap-2 mb-5">
            {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((t) => {
              const c = MEAL_CONFIG[t];
              const isActive = mealType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMealType(t)}
                  className="meal-type-btn rounded-xl py-3 text-center"
                  style={isActive ? {
                    background: `${c.color}18`,
                    border: `1px solid ${c.color}40`,
                    boxShadow: `0 0 16px ${c.color}15`,
                  } : {
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div className="text-xl mb-1">{c.icon}</div>
                  <div className="text-xs font-bold" style={{ color: isActive ? c.color : "rgba(255,255,255,0.5)" }}>
                    {c.label}
                  </div>
                  <div className="text-[9px] mt-0.5" style={{ color: isActive ? `${c.color}70` : "rgba(255,255,255,0.2)" }}>
                    {c.time}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Food entry area */}
          <div ref={foodBoxRef} className="space-y-3">

            {/* Recents */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                  Recent · {mealConf.label}
                </span>
                {recentLoading && <span className="text-[10px] text-white/30">Loading…</span>}
              </div>

              {recentFoods.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {recentFoods.slice(0, 6).map((f, idx) => {
                    const isSelected = foodSelected?.name === f.name;
                    return (
                      <button
                        key={f.id ?? `${f.name}-${idx}`}
                        type="button"
                        onClick={() => {
                          const it = { id:f.id??null, name:f.name, calories_per_100g:f.calories_per_100g, protein_g_per_100g:f.protein_g_per_100g, measure_mode:f.measure_mode??"grams", unit_label:f.unit_label??null, grams_per_unit:f.grams_per_unit??null, default_units:f.default_units??null, default_grams:f.default_grams??null, source:"master" };
                          setFoodSelected(it); setFoodOpen(false); applyFoodDefaults(it);
                        }}
                        className={cx("recent-chip rounded-full px-3 py-1.5 text-xs font-semibold text-white/80", isSelected && "selected")}
                      >
                        {f.name}
                        {f.calories_per_100g && <span className="ml-1.5 text-white/30">{f.calories_per_100g}kcal/100g</span>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                !recentLoading && (
                  <p className="text-xs text-white/25 italic">
                    No recents yet for {mealConf.label.toLowerCase()} — search below to add your first.
                  </p>
                )
              )}
            </div>

            {/* Search input */}
            <div className="relative" style={{ isolation: "isolate" }}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">🔍</span>
                <input
                  ref={foodInputRef}
                  value={foodQuery}
                  onChange={(e) => { setFoodQuery(e.target.value); openDropdownAtInput(); }}
                  onFocus={() => { if (foodQuery.trim().length >= 2) openDropdownAtInput(); }}
                  placeholder="Search food… (banana, oats, paneer, roti…)"
                  className="w-full rounded-xl border border-white/10 bg-black/30 pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-white/20 focus:outline-none transition"
                />
                {foodQuery && (
                  <button onClick={() => { setFoodQuery(""); setFoodItems([]); setFoodOpen(false); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 text-xs">
                    ✕
                  </button>
                )}
              </div>

              {/* Dropdown portal — fixed position, viewport-level, no CSS class needed */}
              {foodOpen && foodQuery.trim().length >= 2 && dropdownPos && typeof window !== "undefined" && createPortal(
                <div
                  style={{
                    position:     "absolute",
                    top:          dropdownPos.top,
                    left:         dropdownPos.left,
                    width:        dropdownPos.width,
                    zIndex:       99999,
                    background:   "#0e1008",
                    border:       "1px solid rgba(163,230,53,0.3)",
                    borderRadius: "16px",
                    overflow:     "hidden",
                    boxShadow:    "0 32px 64px rgba(0,0,0,0.85), 0 0 0 1px rgba(163,230,53,0.08) inset",
                    animation:    "logFadeUp 0.15s ease",
                  }}
                >
                  {/* Scroll area */}
                  <div style={{ maxHeight: 288, overflowY: "auto" }}>
                    {foodLoading ? (
                      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="inline-block h-3 w-3 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Searching…</span>
                      </div>
                    ) : foodItems.length === 0 ? (
                      <div style={{ padding: "20px 16px", textAlign: "center" }}>
                        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>No results for "{foodQuery}"</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 4 }}>Try a different keyword</div>
                      </div>
                    ) : (
                      foodItems.map((it, idx) => (
                        <button
                          key={it.id ?? it.name}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setFoodSelected(it);
                            setFoodOpen(false);
                            applyFoodDefaults(it);
                          }}
                          style={{
                            display:       "block",
                            width:         "100%",
                            padding:       "11px 16px",
                            textAlign:     "left",
                            background:    "transparent",
                            border:        "none",
                            borderBottom:  idx < foodItems.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                            cursor:        "pointer",
                            transition:    "background 0.1s ease",
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(163,230,53,0.08)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.88)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {it.name}
                              </div>
                              {(it.brand || it.source) && (
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                  {it.brand ? `${it.brand} · ` : ""}{it.source}
                                </div>
                              )}
                            </div>
                            <div style={{ flexShrink: 0, textAlign: "right" }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>
                                {it.calories_per_100g ?? "–"}<span style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.3)", marginLeft: 3 }}>kcal</span>
                              </div>
                              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                                {it.protein_g_per_100g ?? "–"}g protein · /100g
                              </div>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>

                  {/* Footer */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.06)", padding: "8px 16px" }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
                      {foodItems.length > 0 ? `${foodItems.length} results` : ""}
                    </span>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); setFoodOpen(false); }}
                      style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", background: "none", border: "none", cursor: "pointer" }}
                    >
                      Close ✕
                    </button>
                  </div>
                </div>,
                document.body
              )}
            </div>

            {/* Selected food + quantity */}
            {foodSelected ? (
              <div className="log-card-l2 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1">Selected</div>
                    <div className="text-base font-bold text-white">{foodSelected.name}</div>
                    {foodSelected.brand && <div className="text-xs text-white/40 mt-0.5">{foodSelected.brand}</div>}
                  </div>
                  <button onClick={() => resetMealEntry(true)} className="text-xs text-white/30 hover:text-white/60 mt-1">
                    ✕ Clear
                  </button>
                </div>

                {/* Quantity control */}
                <div className="mb-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">Quantity</div>

                  {qtyMode === "unit" && unitGrams > 0 ? (
                    <div className="flex items-center gap-3">
                      <button onClick={() => setUnitCountSafe(unitCount - 1, foodSelected)}
                        className="h-9 w-9 flex items-center justify-center rounded-xl border border-white/10 bg-black/30 text-white hover:bg-white/10 text-lg font-bold transition">−</button>
                      <div className="flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-center text-sm font-bold text-white">
                        {unitCount} <span className="font-normal text-white/50">{unitLabel}</span>
                        <span className="ml-2 text-[10px] text-white/30">({foodGrams}g)</span>
                      </div>
                      <button onClick={() => setUnitCountSafe(unitCount + 1, foodSelected)}
                        className="h-9 w-9 flex items-center justify-center rounded-xl border border-white/10 bg-black/30 text-white hover:bg-white/10 text-lg font-bold transition">+</button>
                      <button onClick={() => { setQtyMode("grams"); setUnitCount(1); }}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/50 hover:bg-white/10">g</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <input
                        type="number" min={0} value={foodGrams}
                        onChange={(e) => { const g = Number(e.target.value); setFoodGrams(g); if (foodSelected) recalcMeal(foodSelected, g); }}
                        className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-center text-sm font-bold text-white focus:border-white/25 focus:outline-none"
                      />
                      <span className="text-sm text-white/50 font-semibold">grams</span>
                      {foodSelected?.measure_mode === "unit" && foodSelected?.unit_label && foodSelected?.grams_per_unit && (
                        <button
                          onClick={() => {
                            setQtyMode("unit"); setUnitLabel(String(foodSelected.unit_label)); setUnitGrams(Number(foodSelected.grams_per_unit));
                            const count = foodSelected.default_units && Number(foodSelected.default_units) > 0 ? Number(foodSelected.default_units) : 1;
                            setUnitCount(count);
                            const g = Math.round(Number(foodSelected.grams_per_unit) * count);
                            setFoodGrams(g); recalcMeal(foodSelected, g);
                          }}
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/50 hover:bg-white/10 whitespace-nowrap"
                        >
                          Use {String(foodSelected.unit_label)}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Calorie / protein result — big and clear */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="log-card-l3 rounded-xl p-4 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1">Calories</div>
                    <div className="text-3xl font-black text-white">{mealCalories || 0}</div>
                    <div className="text-xs text-white/35 mt-0.5">kcal</div>
                  </div>
                  <div className="log-card-l3 rounded-xl p-4 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1">Protein</div>
                    <div className="text-3xl font-black text-white">{mealProtein || 0}</div>
                    <div className="text-xs text-white/35 mt-0.5">grams</div>
                  </div>
                </div>

                {/* Add button — full width, prominent */}
                <button
                  type="button"
                  onClick={addMeal}
                  disabled={loading}
                  className="mt-4 w-full rounded-xl py-3.5 text-sm font-black text-black transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
                  style={{ background: mealConf.color }}
                >
                  {loading ? "Adding…" : `Add to ${mealConf.label} →`}
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center">
                <div className="text-2xl mb-2">{mealConf.icon}</div>
                <div className="text-sm text-white/35">
                  Search or tap a recent food to start logging {mealConf.label.toLowerCase()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── MEALS LOGGED TODAY ─────────────────────── */}
        {mealsToday.length > 0 && (
          <div className="log-fade log-d3 log-card-l1 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-white">Logged today</h2>
                <p className="text-xs text-white/35 mt-0.5">{logDateIso}</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-white/40">
                <span><b className="text-white font-bold">{totalCalories}</b> kcal</span>
                <span>·</span>
                <span><b className="text-white font-bold">{totalProtein}g</b> protein</span>
              </div>
            </div>

            {/* Group by meal type */}
            <div className="space-y-3">
              {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((t) => {
                const list = mealsByType[t];
                if (list.length === 0) return null;
                const c = MEAL_CONFIG[t];
                const sumCal = list.reduce((s, m) => s + (m.calories ?? 0), 0);
                const sumPro = list.reduce((s, m) => s + (m.protein_g ?? 0), 0);
                return (
                  <div key={t} className="log-card-l2 rounded-2xl overflow-hidden">
                    {/* Group header */}
                    <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{c.icon}</span>
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: c.color }}>{c.label}</span>
                      </div>
                      <span className="text-xs text-white/40">{sumCal} kcal · {sumPro}g protein</span>
                    </div>
                    {/* Items */}
                    <div className="divide-y divide-white/[0.04]">
                      {list.map((m: any) => (
                        <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.03] transition">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-white/90">{m.title || m.food_name}</div>
                            <div className="text-[10px] text-white/35 mt-0.5">
                              {m.grams != null ? `${m.grams}g` : ""}
                              {m.created_at ? ` · ${new Date(m.created_at).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}` : ""}
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-xs font-bold text-white/80">{m.calories ?? 0} kcal</div>
                              <div className="text-[10px] text-white/40">{m.protein_g ?? 0}g P</div>
                            </div>
                            <button
                              onClick={() => deleteMeal(m.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-rose-400/20 bg-rose-400/8 text-rose-400/60 hover:bg-rose-400/15 hover:text-rose-300 transition text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {msg && (
          <div className={cx("text-sm", msg.startsWith("✅") ? "text-emerald-300" : "text-red-300")}>
            {msg}
          </div>
        )}
      </div>
    </>
  );
}