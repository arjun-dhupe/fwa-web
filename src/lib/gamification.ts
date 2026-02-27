export function xpForLevel(level: number) {
  return 100 + (level - 1) * 50;
}

export function levelFromXp(xp: number) {
  let level = 1;
  let remaining = xp;

  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level += 1;
    if (level > 100) break;
  }

  return { level, xpIntoLevel: remaining, xpNeeded: xpForLevel(level) };
}

export function isoDate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function addDays(iso: string, delta: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

export function isSameDay(a?: string | null, b?: string | null) {
  if (!a || !b) return false;
  return a === b;
}

export function computeStreak(prevStreak: number, lastCompletedDate: string | null, completedDate: string) {
  if (!lastCompletedDate) return 1;

  if (isSameDay(lastCompletedDate, completedDate)) return prevStreak;

  const yesterday = addDays(completedDate, -1);
  if (isSameDay(lastCompletedDate, yesterday)) return prevStreak + 1;

  return 1;
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function computeFitScore(opts: {
  steps: number;
  stepsGoal: number;
  sleepHours: number;
  waterMl: number;
  workoutsCount: number;
}) {
  const stepsPart = clamp((opts.steps / Math.max(1, opts.stepsGoal)) * 40, 0, 40);
  const sleepPart = clamp((opts.sleepHours / 8) * 25, 0, 25);
  const waterPart = clamp((opts.waterMl / 2000) * 20, 0, 20);
  const workoutPart = clamp(opts.workoutsCount > 0 ? 15 : 0, 0, 15);

  return Math.round(stepsPart + sleepPart + waterPart + workoutPart);
}