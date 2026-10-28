export const KINDS = ["normal", "nap", "doze", "other"] as const;
export const INTENTIONS = ["intentional", "unintentional", "unknown"] as const;
export const ACCURACIES = ["exact", "estimated"] as const;
export type Kind = typeof KINDS[number];
export type Intention = typeof INTENTIONS[number];
export type Accuracy = typeof ACCURACIES[number];
export const KIND_LABEL: Record<Kind, string> = { normal: "通常睡眠", nap: "昼寝", doze: "寝落ち", other: "その他" };
export const INTENTION_LABEL: Record<Intention, string> = { intentional: "意図して", unintentional: "意図せず", unknown: "わからない" };
export const DEFAULT_INTENTION: Record<Kind, Intention> = { normal: "intentional", nap: "intentional", doze: "unintentional", other: "unknown" };
export const MINUTE = 60_000;
export const DAY = 86_400_000;
const JST = 9 * 60 * MINUTE;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SleepInput {
  id: string;
  start_at: string;
  end_at: string;
  kind: Kind;
  intention: Intention;
  start_accuracy: Accuracy;
  end_accuracy: Accuracy;
  record_timezone: "Asia/Tokyo";
  note: string | null;
}
export interface SleepEntry extends SleepInput {
  user_id: string;
  created_at: string;
  updated_at: string;
  revision: number;
}
export class AppError extends Error {
  constructor(public code: "invalid" | "overlap" | "conflict" | "permission" | "network", message: string) { super(message); }
}
export function dayOf(value: string | number | Date): string {
  const date = new Date(new Date(value).getTime() + JST);
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
export function timeOf(value: string | number | Date): string {
  const d = new Date(new Date(value).getTime() + JST);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
export function fromJst(day: string, time = "00:00"): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new AppError("invalid", "日時を確認してください。");
  const ms = Date.parse(`${day}T${time}:00+09:00`);
  if (!Number.isFinite(ms) || dayOf(ms) !== day || timeOf(ms) !== time || day.startsWith("0000")) throw new AppError("invalid", "存在しない日時です。日付と時刻を確認してください。");
  return new Date(ms).toISOString();
}
export function shiftDay(day: string, offset: number): string { return dayOf(Date.parse(fromJst(day)) + offset * DAY); }
export function monthStart(day: string): string { return day.slice(0, 7) + "-01"; }
export function shiftMonth(day: string, offset: number): string {
  const [year, month] = day.split("-").map(Number);
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1 + offset, 1);
  d.setUTCHours(12, 0, 0, 0);
  return monthStart(dayOf(d));
}
export function duration(entry: SleepInput): number { return (Date.parse(entry.end_at) - Date.parse(entry.start_at)) / MINUTE; }
export function minutesOnDay(entry: SleepInput, day: string): number {
  const a = Date.parse(fromJst(day));
  return Math.max(0, Math.min(Date.parse(entry.end_at), a + DAY) - Math.max(Date.parse(entry.start_at), a)) / MINUTE;
}
export function estimated(entry: SleepInput): boolean { return entry.start_accuracy === "estimated" || entry.end_accuracy === "estimated"; }
export function formatDuration(minutes: number): string {
  const n = Math.round(minutes);
  return `${Math.floor(n / 60)}時間${n % 60 ? `${n % 60}分` : ""}`;
}
export function shortDuration(minutes: number): string { return `${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}`; }
export function dateLabel(day: string, year = false): string {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", ...(year ? { year: "numeric" } : {}), month: "long", day: "numeric", weekday: "short" }).format(new Date(fromJst(day, "12:00")));
}
export function overlap(a: SleepInput, b: SleepInput): boolean {
  return a.id !== b.id && Date.parse(a.start_at) < Date.parse(b.end_at) && Date.parse(a.end_at) > Date.parse(b.start_at);
}
const CONTENT_FIELDS = ["id", "start_at", "end_at", "kind", "intention", "start_accuracy", "end_accuracy", "record_timezone", "note"] as const;
export function sameContent(a: SleepInput, b: SleepInput): boolean { return CONTENT_FIELDS.every(k => a[k] === b[k]); }
export function inputOnly(e: SleepInput): SleepInput {
  return Object.fromEntries(CONTENT_FIELDS.map(k => [k, e[k]])) as unknown as SleepInput;
}
export function validateInput(raw: unknown, now = Date.now()): SleepInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new AppError("invalid", "睡眠記録の形式を確認してください。");
  const x = { ...raw } as Record<string, unknown>;
  if (typeof x.id !== "string" || !UUID.test(x.id)) throw new AppError("invalid", "記録IDの形式が正しくありません。");
  x.id=x.id.toLowerCase();
  for (const k of ["start_at", "end_at"] as const) {
    const v = x[k];
    if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(v)) throw new AppError("invalid", "日時にはタイムゾーンが必要です。");
    const ms = Date.parse(v);
    if (!Number.isFinite(ms) || ms % MINUTE !== 0 || v.startsWith("0000")) throw new AppError("invalid", "日時は正しい日付と1分単位で入力してください。");
    // Date.parseは2月30日などを繰り上げるため、日付自体も検証する。
    const localDay = v.slice(0, 10);
    const test = new Date(localDay + "T12:00:00Z");
    if (test.toISOString().slice(0, 10) !== localDay) throw new AppError("invalid", "存在しない日付です。");
    x[k] = new Date(ms).toISOString();
  }
  if (Date.parse(x.end_at as string) <= Date.parse(x.start_at as string)) throw new AppError("invalid", "終了日時を開始日時より後にしてください。");
  if (Date.parse(x.end_at as string) > now) throw new AppError("invalid", "終了した睡眠を記録してください。終了日時が未来になっています。");
  if (!KINDS.includes(x.kind as Kind)) throw new AppError("invalid", "睡眠の種類を選んでください。");
  if (!INTENTIONS.includes(x.intention as Intention)) throw new AppError("invalid", "眠った意図を選んでください。");
  if (!ACCURACIES.includes(x.start_accuracy as Accuracy) || !ACCURACIES.includes(x.end_accuracy as Accuracy)) throw new AppError("invalid", "時刻の精度を確認してください。");
  if (x.record_timezone !== "Asia/Tokyo") throw new AppError("invalid", "初期版は日本時間の記録に対応しています。");
  if (x.note !== null && typeof x.note !== "string") throw new AppError("invalid", "メモはテキストで入力してください。");
  if (typeof x.note === "string" && [...x.note].length > 2000) throw new AppError("invalid", "メモは2,000文字以内にしてください。");
  return inputOnly({ ...x, note: x.note === "" ? null : x.note } as unknown as SleepInput);
}
export function validateEntry(raw: unknown): SleepEntry {
  const input = validateInput({ ...(raw as object) }, Infinity);
  const x = raw as Record<string, unknown>;
  if (typeof x.user_id !== "string" || !UUID.test(x.user_id) || !Number.isInteger(x.revision) || (x.revision as number) < 1 || typeof x.created_at !== "string" || !Number.isFinite(Date.parse(x.created_at)) || typeof x.updated_at !== "string" || !Number.isFinite(Date.parse(x.updated_at))) throw new AppError("invalid", "保存された記録の形式を確認できませんでした。");
  return { ...input, user_id: x.user_id, revision: x.revision as number, created_at: x.created_at, updated_at: x.updated_at };
}
export function summary(entries: SleepEntry[], day: string) {
  const records = entries.filter(e => minutesOnDay(e, day) > 0).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const byKind = Object.fromEntries(KINDS.map(k => [k, records.filter(e => e.kind === k).reduce((n, e) => n + minutesOnDay(e, day), 0)])) as Record<Kind, number>;
  return { records, minutes: records.reduce((n, e) => n + minutesOnDay(e, day), 0), estimated: records.some(estimated), byKind };
}
