"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type DayRow = {
  date: string;
  steps: number;
  waterMl: number;
  sleepHours: number;
  workoutMin: number;
  calories: number;
  protein: number;
  isIncomplete: boolean;
};

function yyyyMmDd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dateListInclusive(start: string, end: string) {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const out: string[] = [];
  for (let d = s; d <= e; d = addDays(d, 1)) out.push(yyyyMmDd(d));
  return out;
}

const FIELDS: { key: keyof Omit<DayRow, "date" | "isIncomplete">; label: string; unit: string }[] = [
  { key: "steps",      label: "Steps",    unit: "steps" },
  { key: "waterMl",   label: "Water",    unit: "ml"    },
  { key: "sleepHours",label: "Sleep",    unit: "hrs"   },
  { key: "workoutMin",label: "Workout",  unit: "min"   },
  { key: "calories",  label: "Calories", unit: "kcal"  },
  { key: "protein",   label: "Protein",  unit: "g"     },
];

export default function HistoryPage() {
  const router = useRouter();

  const today        = useMemo(() => yyyyMmDd(new Date()), []);
  const defaultStart = useMemo(() => yyyyMmDd(addDays(new Date(), -29)), []);

  const [userId, setUserId]     = useState<string>("");
  const [email, setEmail]       = useState<string>("");
  const [startDate, setStartDate] = useState<string>(defaultStart);
  const [endDate, setEndDate]   = useState<string>(today);
  const [rows, setRows]         = useState<DayRow[]>([]);
  const [loading, setLoading]   = useState<boolean>(true);
  const [msg, setMsg]           = useState<string>("");
  const [onlyIncomplete, setOnlyIncomplete] = useState<boolean>(false);

  // Auth
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.push("/login"); return; }
      setUserId(data.user.id);
      setEmail(data.user.email ?? "");
    })();
  }, [router]);

  async function loadRange() {
    setMsg("");
    if (!userId) return;
    setLoading(true);

    try {
      const [stepsRes, sleepRes, waterRes, mealsRes, workoutsRes] = await Promise.all([
        supabase.from("daily_logs").select("log_date, steps")
          .eq("user_id", userId).gte("log_date", startDate).lte("log_date", endDate),
        supabase.from("sleep_logs").select("log_date, hours")
          .eq("user_id", userId).gte("log_date", startDate).lte("log_date", endDate),
        supabase.from("water_logs").select("log_date, ml")
          .eq("user_id", userId).gte("log_date", startDate).lte("log_date", endDate),
        supabase.from("meals").select("log_date, calories, protein_g")
          .eq("user_id", userId).gte("log_date", startDate).lte("log_date", endDate),
        supabase.from("workout_logs").select("log_date, duration_min")
          .eq("user_id", userId).gte("log_date", startDate).lte("log_date", endDate),
      ]);

      for (const r of [stepsRes, sleepRes, waterRes, mealsRes, workoutsRes]) {
        if (r.error) throw new Error(r.error.message);
      }

      const stepsByDate    = new Map<string, number>();
      const sleepByDate    = new Map<string, number>();
      const waterByDate    = new Map<string, number>();
      const workoutByDate  = new Map<string, number>();
      const mealsAggByDate = new Map<string, { calories: number; protein: number }>();

      for (const r of stepsRes.data   ?? []) stepsByDate.set(r.log_date, r.steps ?? 0);
      for (const r of sleepRes.data   ?? []) sleepByDate.set(r.log_date, Number(r.hours ?? 0));
      for (const r of waterRes.data   ?? []) waterByDate.set(r.log_date, Number(r.ml ?? 0));
      for (const r of workoutsRes.data ?? []) {
        workoutByDate.set(r.log_date, (workoutByDate.get(r.log_date) ?? 0) + (r.duration_min ?? 0));
      }
      for (const r of mealsRes.data ?? []) {
        const prev = mealsAggByDate.get(r.log_date) ?? { calories: 0, protein: 0 };
        mealsAggByDate.set(r.log_date, {
          calories: prev.calories + (r.calories ?? 0),
          protein:  prev.protein  + (r.protein_g ?? 0),
        });
      }

      const dates = dateListInclusive(startDate, endDate);
      const built: DayRow[] = dates.map((date) => {
        const steps       = stepsByDate.get(date)  ?? 0;
        const sleepHours  = sleepByDate.get(date)  ?? 0;
        const waterMl     = waterByDate.get(date)  ?? 0;
        const workoutMin  = workoutByDate.get(date) ?? 0;
        const mealAgg     = mealsAggByDate.get(date) ?? { calories: 0, protein: 0 };

        // A day is "incomplete" if ANY tracked field has no data logged
        const isIncomplete = steps === 0 || waterMl === 0 || sleepHours === 0 || mealAgg.calories === 0;

        return {
          date,
          steps,
          waterMl,
          sleepHours,
          workoutMin,
          calories: mealAgg.calories,
          protein:  mealAgg.protein,
          isIncomplete,
        };
      });

      built.reverse();
      setRows(built);
    } catch (e: any) {
      setMsg(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!userId) return;
    loadRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const startOk       = startDate <= endDate;
  const visibleRows   = onlyIncomplete ? rows.filter((r) => r.isIncomplete) : rows;
  const incompleteCnt = rows.filter((r) => r.isIncomplete).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="hype">Activity Log</div>
        <h1 className="text-2xl font-semibold">History</h1>
        <p className="text-sm text-white/60">{email} • Day-by-day logged data</p>
      </div>

      {/* Controls */}
      <div className="glass glow-ring rounded-2xl p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="text-xs text-white/55">Start</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>

          <div>
            <label className="text-xs text-white/55">End</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="md:col-span-2 flex flex-wrap items-end gap-2">
            <button
              onClick={loadRange}
              disabled={!startOk || loading}
              className="btn-win rounded-lg px-3 py-2 text-sm disabled:opacity-50"
            >
              {loading ? "Loading…" : "Apply range"}
            </button>

            <button
              onClick={() => { setStartDate(defaultStart); setEndDate(today); }}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm hover:bg-white/10"
            >
              Last 30 days
            </button>

            {!startOk && <span className="text-sm text-red-300">Start must be ≤ End</span>}
          </div>
        </div>

        {/* Incomplete filter pill */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => setOnlyIncomplete((v) => !v)}
            className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-all ${
              onlyIncomplete
                ? "border-amber-400/60 bg-amber-400/15 text-amber-300"
                : "border-white/10 bg-black/30 text-white/60 hover:bg-white/10"
            }`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                onlyIncomplete ? "bg-amber-400" : "bg-white/30"
              }`}
            />
            Show incomplete days
            {incompleteCnt > 0 && (
              <span
                className={`ml-1 rounded-full px-1.5 py-0.5 text-xs ${
                  onlyIncomplete ? "bg-amber-400/30 text-amber-200" : "bg-white/10 text-white/50"
                }`}
              >
                {incompleteCnt}
              </span>
            )}
          </button>

          {onlyIncomplete && (
            <span className="text-xs text-white/40">
              Days missing steps, water, sleep, or calories
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="glass glow-ring overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full text-sm">
            <thead className="bg-black/40 text-white/60 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                {FIELDS.map((f) => (
                  <th key={f.key} className="px-4 py-3 text-right font-medium">
                    {f.label}
                    <span className="ml-1 text-white/30 normal-case tracking-normal font-normal">
                      ({f.unit})
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-white/[0.06]">
              {visibleRows.length === 0 && !loading ? (
                <tr>
                  <td className="px-4 py-6 text-white/40 text-center" colSpan={7}>
                    {onlyIncomplete ? "No incomplete days found in this range." : "No data in this range yet."}
                  </td>
                </tr>
              ) : (
                visibleRows.map((r) => (
                  <tr
                    key={r.date}
                    className={`transition-colors hover:bg-white/[0.04] ${
                      r.isIncomplete ? "bg-amber-500/[0.04]" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-white/85 font-medium">
                      {r.date}
                      {r.isIncomplete && (
                        <span className="ml-2 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] text-amber-300 font-normal">
                          incomplete
                        </span>
                      )}
                    </td>

                    {FIELDS.map((f) => {
                      const val = r[f.key] as number;
                      const empty = val === 0;
                      return (
                        <td
                          key={f.key}
                          className={`px-4 py-3 text-right tabular-nums ${
                            empty ? "text-white/20" : "text-white/75"
                          }`}
                        >
                          {empty ? "—" : val}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {msg && <p className="text-sm text-red-300">{msg}</p>}
    </div>
  );
}