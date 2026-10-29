import { DAY, MINUTE, KINDS, dayOf, estimated, fromJst, monthStart, shiftDay, shiftMonth, summary, timeOf, type Kind, type SleepEntry } from "./sleep";

export type Period = "week" | "month";
export interface PeriodRange { first: string; until: string; days: string[] }
export interface TimelineSegment {
  entry: SleepEntry;
  start: number;
  end: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}
export interface TimePoint {
  entry: SleepEntry;
  event: "start" | "end";
  day: string;
  minute: number;
  estimated: boolean;
}

export function periodRange(selected: string, period: Period): PeriodRange {
  const weekday = new Date(fromJst(selected, "12:00")).getUTCDay();
  const first = period === "month" ? monthStart(selected) : shiftDay(selected, -((weekday + 6) % 7));
  const until = period === "month" ? shiftMonth(first, 1) : shiftDay(first, 7);
  const count = Math.round((Date.parse(fromJst(until)) - Date.parse(fromJst(first))) / DAY);
  return { first, until, days: Array.from({ length: count }, (_, i) => shiftDay(first, i)) };
}

export function timelineSegments(entries: SleepEntry[], day: string): TimelineSegment[] {
  const first = Date.parse(fromJst(day));
  const until = first + DAY;
  return entries.filter(e => Date.parse(e.start_at) < until && Date.parse(e.end_at) > first)
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .map(entry => ({
      entry,
      start: (Math.max(Date.parse(entry.start_at), first) - first) / MINUTE,
      end: (Math.min(Date.parse(entry.end_at), until) - first) / MINUTE,
      continuesBefore: Date.parse(entry.start_at) < first,
      continuesAfter: Date.parse(entry.end_at) > until,
    }));
}

export function timePoints(entries: SleepEntry[], range: PeriodRange, kind: Kind | "all" = "all"): TimePoint[] {
  return entries.filter(entry => kind === "all" || entry.kind === kind).flatMap(entry => {
    return (["start", "end"] as const).map(event => {
      const value = event === "start" ? entry.start_at : entry.end_at;
      const [hours, minutes] = timeOf(value).split(":").map(Number);
      return { entry, event, day: dayOf(value), minute: hours * 60 + minutes,
        estimated: (event === "start" ? entry.start_accuracy : entry.end_accuracy) === "estimated" };
    }).filter(point => point.day >= range.first && point.day < range.until);
  }).sort((a, b) => a.day.localeCompare(b.day) || a.minute - b.minute || a.event.localeCompare(b.event));
}

export function analyze(entries: SleepEntry[], range: PeriodRange, today: string) {
  const days = range.days.map(day => ({ day, ...summary(entries, day), future: day > today }));
  const recorded = days.filter(day => !day.future && day.records.length > 0);
  const byKind = Object.fromEntries(KINDS.map(kind => [kind, recorded.reduce((total, day) => total + day.byKind[kind], 0)])) as Record<Kind, number>;
  const minutes = KINDS.reduce((total, kind) => total + byKind[kind], 0);
  const estimatedByKind = Object.fromEntries(KINDS.map(kind => [kind, recorded.some(day => day.records.some(entry => entry.kind === kind && estimated(entry)))])) as Record<Kind, boolean>;
  const dozes = entries.filter(entry => entry.kind === "doze" && dayOf(entry.start_at) >= range.first && dayOf(entry.start_at) < range.until && dayOf(entry.start_at) <= today);
  const dozeHours = Array.from({ length: 6 }, (_, i) => ({ first: i * 4, until: (i + 1) * 4, count: 0 }));
  for (const entry of dozes) dozeHours[Math.floor(Number(timeOf(entry.start_at).slice(0, 2)) / 4)].count++;
  return {
    days, byKind, estimatedByKind, minutes, recordedDays: recorded.length,
    elapsedDays: days.filter(day => !day.future).length,
    average: recorded.length ? minutes / recorded.length : null,
    estimated: recorded.some(day => day.estimated),
    dozeCount: dozes.length,
    dozeHours,
    estimatedDozeStarts: dozes.some(entry => entry.start_accuracy === "estimated"),
    napAndDoze: byKind.nap + byKind.doze,
    shares: Object.fromEntries(KINDS.map(kind => [kind, minutes ? byKind[kind] / minutes * 100 : null])) as Record<Kind, number | null>,
  };
}

export function entryLabel(entry: SleepEntry): string {
  return `${dayOf(entry.start_at)} ${timeOf(entry.start_at)}〜${dayOf(entry.end_at)} ${timeOf(entry.end_at)}${estimated(entry) ? "（推定を含む）" : ""}`;
}
