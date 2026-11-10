import { DAY, MINUTE, KINDS, dayOf, estimated, fromJst, minutesOnDay, monthStart, shiftDay, shiftMonth, timeOf, type Kind, type SleepEntry } from "./sleep";

export type Period = "week" | "month" | "year" | "all";
export interface PeriodRange { first: string; until: string; days: string[]; trimmed?: boolean }
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

export function daysBetween(first: string, until: string): string[] {
  const start = Date.parse(fromJst(first));
  const count = Math.max(0, Math.round((Date.parse(fromJst(until)) - start) / DAY));
  return Array.from({ length: count }, (_, i) => dayOf(start + i * DAY));
}

export function periodRange(selected: string, period: Period, entries: SleepEntry[] = []): PeriodRange {
  const weekday = new Date(fromJst(selected, "12:00")).getUTCDay();
  let first = period === "week" ? shiftDay(selected, -((weekday + 6) % 7)) : period === "month" ? monthStart(selected) : `${selected.slice(0, 4)}-01-01`;
  let until = period === "week" ? shiftDay(first, 7) : period === "month" ? shiftMonth(first, 1) : shiftMonth(first, 12);
  if (period === "all") {
    if (!entries.length) return { first: selected, until: selected, days: [], trimmed: true };
    first = dayOf(entries.reduce((min, entry) => Math.min(min, Date.parse(entry.start_at)), Infinity));
    // 全期間には、最後の記録の起床時刻も実際の日付で含める。
    until = shiftDay(dayOf(entries.reduce((max, entry) => Math.max(max, Date.parse(entry.end_at)), -Infinity)), 1);
  }
  if (period === "year" || period === "all") {
    const start = Date.parse(fromJst(first)), end = Date.parse(fromJst(until));
    const records = entries.filter(entry => Date.parse(entry.start_at) < end && Date.parse(entry.end_at) > start);
    if (!records.length) return { first, until, days: [], trimmed: true };
    const firstDay = dayOf(records.reduce((min, entry) => Math.min(min, Math.max(start, Date.parse(entry.start_at))), Infinity));
    const lastDay = dayOf(records.reduce((max, entry) => Math.max(max, Math.min(end, Date.parse(entry.end_at)) - 1), -Infinity));
    return { first, until, days: daysBetween(firstDay, shiftDay(lastDay, 1)), trimmed: true };
  }
  return { first, until, days: daysBetween(first, until) };
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
  const days = range.days.map(day => ({ day, records: [] as SleepEntry[], minutes: 0, estimated: false,
    byKind: Object.fromEntries(KINDS.map(kind => [kind, 0])) as Record<Kind, number>, future: day > today }));
  const byDay = new Map(days.map(day => [day.day, day]));
  if (days.length) for (const entry of entries) {
    const first = [dayOf(entry.start_at), days[0].day].sort().at(-1)!;
    const last = [dayOf(Date.parse(entry.end_at) - 1), days[days.length - 1].day].sort()[0];
    for (let day = first; day <= last; day = shiftDay(day, 1)) {
      const totals = byDay.get(day);
      if (!totals) continue;
      const minutes = minutesOnDay(entry, day);
      if (minutes <= 0) continue;
      totals.records.push(entry); totals.minutes += minutes; totals.byKind[entry.kind] += minutes;
      totals.estimated ||= estimated(entry);
    }
  }
  for (const day of days) day.records.sort((a, b) => a.start_at.localeCompare(b.start_at));
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
