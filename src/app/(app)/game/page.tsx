"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { computeStreak, levelFromXp, isoDate } from "@/lib/gamification";

type GameState = {
  xp: number;
  level: number;
  streak: number;
  last_completed_date: string | null;
};

type Quest = {
  quest_id: string;
  title: string;
  xp_reward: number;
  completed: boolean;
};

export default function GamePage() {
  const router = useRouter();
  const today = useMemo(() => isoDate(new Date()), []);

  const [userId, setUserId] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  const [state, setState] = useState<GameState>({
    xp: 0,
    level: 1,
    streak: 0,
    last_completed_date: null,
  });

  const [quests, setQuests] = useState<Quest[]>([]);
  const [badges, setBadges] = useState<any[]>([]);
  const [userBadges, setUserBadges] = useState<any[]>([]);
  const [msg, setMsg] = useState("");

  const progress = levelFromXp(state.xp);
  const xpPct = Math.round((progress.xpIntoLevel / Math.max(1, progress.xpNeeded)) * 100);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return router.push("/login");
      setUserId(data.user.id);
      setEmail(data.user.email ?? "");

      // Ensure gamification_state exists
      const { data: gs, error: gsErr } = await supabase
        .from("gamification_state")
        .select("*")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (gsErr) return setMsg(gsErr.message);

      if (!gs) {
        const { error: insErr } = await supabase.from("gamification_state").insert({ user_id: data.user.id });
        if (insErr) return setMsg(insErr.message);
        setState({ xp: 0, level: 1, streak: 0, last_completed_date: null });
      } else {
        setState({
          xp: gs.xp ?? 0,
          level: gs.level ?? 1,
          streak: gs.streak ?? 0,
          last_completed_date: gs.last_completed_date ?? null,
        });
      }

      // Ensure quests exist for today
      await ensureDailyQuests(data.user.id, today);

      // Load quests
      const { data: qRows, error: qErr } = await supabase
        .from("daily_quests")
        .select("quest_id,title,xp_reward,completed")
        .eq("user_id", data.user.id)
        .eq("log_date", today)
        .order("quest_id", { ascending: true });

      if (qErr) return setMsg(qErr.message);
      setQuests((qRows ?? []) as any);

      // Load badges catalog + user's badges
      const { data: bRows } = await supabase.from("badges").select("*").order("id");
      setBadges(bRows ?? []);

      const { data: ubRows } = await supabase.from("user_badges").select("*").eq("user_id", data.user.id);
      setUserBadges(ubRows ?? []);
    })();
  }, [router, today]);

  async function ensureDailyQuests(uId: string, date: string) {
    const template: Quest[] = [
      { quest_id: "log_steps", title: "Log your steps", xp_reward: 15, completed: false },
      { quest_id: "log_water", title: "Drink & log 500ml water", xp_reward: 15, completed: false },
      { quest_id: "log_sleep", title: "Log sleep hours", xp_reward: 10, completed: false },
      { quest_id: "do_workout", title: "Log a workout session", xp_reward: 20, completed: false },
    ];

    for (const q of template) {
      await supabase.from("daily_quests").upsert(
        {
          user_id: uId,
          log_date: date,
          quest_id: q.quest_id,
          title: q.title,
          xp_reward: q.xp_reward,
          completed: false,
        },
        { onConflict: "user_id,log_date,quest_id" }
      );
    }
  }

  function hasBadge(id: string) {
    return userBadges.some((b) => b.badge_id === id);
  }

  async function awardBadge(badgeId: string) {
    if (!userId) return;
    if (hasBadge(badgeId)) return;
    const { error } = await supabase.from("user_badges").insert({ user_id: userId, badge_id: badgeId });
    if (!error) {
      const { data: ubRows } = await supabase.from("user_badges").select("*").eq("user_id", userId);
      setUserBadges(ubRows ?? []);
    }
  }

  async function toggleQuest(q: Quest) {
    setMsg("");
    if (!userId) return;

    const newCompleted = !q.completed;

    // 1) update quest row
    const { error: qErr } = await supabase
      .from("daily_quests")
      .update({ completed: newCompleted })
      .eq("user_id", userId)
      .eq("log_date", today)
      .eq("quest_id", q.quest_id);

    if (qErr) return setMsg(qErr.message);

    // 2) update local quests
    const newQuests = quests.map((x) => (x.quest_id === q.quest_id ? { ...x, completed: newCompleted } : x));
    setQuests(newQuests);

    // 3) XP change
    const deltaXp = newCompleted ? q.xp_reward : -q.xp_reward;
    let finalXp = Math.max(0, state.xp + deltaXp);

    // 4) If completing ALL quests, streak + bonus + badges
    const allDone = newQuests.length > 0 && newQuests.every((x) => x.completed);
    let finalStreak = state.streak;
    let finalLast = state.last_completed_date;

    if (allDone && finalLast !== today) {
      finalXp += 25; // bonus
      finalStreak = computeStreak(state.streak, state.last_completed_date, today);
      finalLast = today;

      await awardBadge("first_log");
      if (finalStreak >= 3) await awardBadge("streak_3");
      if (finalStreak >= 7) await awardBadge("streak_7");

      setMsg("🎉 Daily quests complete! +25 XP streak bonus!");
    } else {
      setMsg(newCompleted ? `✅ +${q.xp_reward} XP` : `↩️ -${q.xp_reward} XP`);
    }

    const finalLevel = levelFromXp(finalXp).level;

    // 5) Persist gamification_state
    const { error: sErr } = await supabase
      .from("gamification_state")
      .upsert(
        { user_id: userId, xp: finalXp, level: finalLevel, streak: finalStreak, last_completed_date: finalLast },
        { onConflict: "user_id" }
      );

    if (sErr) return setMsg(sErr.message);

    setState({ xp: finalXp, level: finalLevel, streak: finalStreak, last_completed_date: finalLast });
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const earnedBadgeIds = new Set(userBadges.map((b) => b.badge_id));
  const earned = badges.filter((b) => earnedBadgeIds.has(b.id));
  const locked = badges.filter((b) => !earnedBadgeIds.has(b.id));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Game</h1>
          <p className="text-sm text-white/60">{email}</p>

          <div className="mt-2 flex flex-wrap gap-2">
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm backdrop-blur">
              🔥 Streak: <b className="text-white/90">{state.streak}</b>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm backdrop-blur">
              ⭐ Level: <b className="text-white/90">{progress.level}</b>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm backdrop-blur">
              XP: <b className="text-white/90">{progress.xpIntoLevel}</b>/{progress.xpNeeded}
            </div>
          </div>
        </div>

        <button
          onClick={logout}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 backdrop-blur"
        >
          Logout
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="text-sm text-white/80">Level progress</div>
          <div className="text-xs text-white/60">{xpPct}%</div>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-2 bg-emerald-400" style={{ width: `${xpPct}%` }} />
        </div>
        <div className="mt-2 text-xs text-white/60">
          Next level in <b className="text-white/90">{Math.max(0, progress.xpNeeded - progress.xpIntoLevel)}</b> XP
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-white/90">Daily Quests</div>
            <div className="text-xs text-white/60">{today}</div>
          </div>
          <div className="text-xs text-white/60">
            Completed {quests.filter((q) => q.completed).length}/{quests.length}
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {quests.map((q) => (
            <button
              key={q.quest_id}
              onClick={() => toggleQuest(q)}
              className={`flex items-center justify-between rounded-xl border px-3 py-3 text-left transition ${
                q.completed ? "border-emerald-400/30 bg-emerald-400/10" : "border-white/10 bg-black/20 hover:bg-white/5"
              }`}
            >
              <div>
                <div className="text-sm font-medium">{q.title}</div>
                <div className="text-xs text-white/60">+{q.xp_reward} XP</div>
              </div>
              <div className="text-sm">{q.completed ? "✅" : "⬜️"}</div>
            </button>
          ))}
        </div>

        {msg && <div className="mt-3 text-sm text-emerald-300">{msg}</div>}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
        <div className="text-sm font-medium text-white/90">Badges</div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {earned.map((b) => (
            <div key={b.id} className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3">
              <div className="text-2xl">{b.icon}</div>
              <div className="mt-1 text-sm font-medium">{b.name}</div>
              <div className="text-xs text-white/60">{b.description}</div>
              <div className="mt-2 text-xs text-emerald-300">Earned</div>
            </div>
          ))}

          {locked.map((b) => (
            <div key={b.id} className="rounded-xl border border-white/10 bg-black/20 p-3 opacity-80">
              <div className="text-2xl">{b.icon}</div>
              <div className="mt-1 text-sm font-medium">{b.name}</div>
              <div className="text-xs text-white/60">{b.description}</div>
              <div className="mt-2 text-xs text-white/50">Locked</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}