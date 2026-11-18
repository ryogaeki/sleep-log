import { KINDS, UUID, dayOf, timeOf, type Kind, type SleepEntry } from "./sleep";
export interface FormValues {
  id: string; revision?: number; kind: Kind | ""; startDate: string; startTime: string; endDate: string; endTime: string;
  note: string;
  note_locked?: boolean;
}
export interface Draft { userId: string; expiresAt: number; values: FormValues }
export const draftKey = (userId: string) => `sleep-log-draft:${userId}`;
export function initialForm(day: string, entry?: SleepEntry): FormValues {
  return entry ? { id: entry.id, revision: entry.revision, kind: entry.kind, startDate: dayOf(entry.start_at), startTime: timeOf(entry.start_at), endDate: dayOf(entry.end_at), endTime: timeOf(entry.end_at), note: entry.note ?? "", note_locked: Boolean(entry.note_locked) }
    : { id: crypto.randomUUID(), kind: "", startDate: day, startTime: "", endDate: day, endTime: "", note: "", note_locked: false };
}
export function readDraft(userId: string): Draft | null {
  try {
    const text = sessionStorage.getItem(draftKey(userId));
    if (!text) return null;
    const d = JSON.parse(text) as Draft;
    const v = d.values;
    if (d.userId !== userId || !Number.isFinite(d.expiresAt) || d.expiresAt <= Date.now() || !v || !UUID.test(v.id) || (v.kind !== "" && !KINDS.includes(v.kind)) || !["startDate","startTime","endDate","endTime","note"].every(k=>typeof v[k as keyof FormValues] === "string") || (v.revision !== undefined && (!Number.isInteger(v.revision) || v.revision < 1))) {
      sessionStorage.removeItem(draftKey(userId)); return null;
    }
    // 古い下書きの廃止項目は読み捨て、本文と日時を引き継ぐ。
    return { ...d, values: { id: v.id, revision: v.revision, kind: v.kind, startDate: v.startDate, startTime: v.startTime, endDate: v.endDate, endTime: v.endTime, note: v.note, note_locked: Boolean(v.note_locked) } };
  } catch { return null; }
}
export function clearDraft(userId: string) { try { sessionStorage.removeItem(draftKey(userId)); } catch {} }
