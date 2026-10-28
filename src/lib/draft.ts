import { KINDS, INTENTIONS, UUID, dayOf, timeOf, type Kind, type Intention, type SleepEntry } from "./sleep";
export interface FormValues {
  id: string; revision?: number; kind: Kind | ""; startDate: string; startTime: string; endDate: string; endTime: string;
  startEstimated: boolean; endEstimated: boolean; intention: Intention; intentionTouched: boolean; note: string;
}
export interface Draft { userId: string; expiresAt: number; values: FormValues }
export const draftKey = (userId: string) => `sleep-log-draft:${userId}`;
export function initialForm(day: string, entry?: SleepEntry): FormValues {
  return entry ? { id: entry.id, revision: entry.revision, kind: entry.kind, startDate: dayOf(entry.start_at), startTime: timeOf(entry.start_at), endDate: dayOf(entry.end_at), endTime: timeOf(entry.end_at), startEstimated: entry.start_accuracy === "estimated", endEstimated: entry.end_accuracy === "estimated", intention: entry.intention, intentionTouched: true, note: entry.note ?? "" }
    : { id: crypto.randomUUID(), kind: "", startDate: day, startTime: "", endDate: day, endTime: "", startEstimated: true, endEstimated: true, intention: "unknown", intentionTouched: false, note: "" };
}
export function readDraft(userId: string): Draft | null {
  try {
    const text = sessionStorage.getItem(draftKey(userId));
    if (!text) return null;
    const d = JSON.parse(text) as Draft;
    const v = d.values;
    if (d.userId !== userId || !Number.isFinite(d.expiresAt) || d.expiresAt <= Date.now() || !v || !UUID.test(v.id) || (v.kind !== "" && !KINDS.includes(v.kind)) || !INTENTIONS.includes(v.intention) || !["startDate","startTime","endDate","endTime","note"].every(k=>typeof v[k as keyof FormValues] === "string") || !["startEstimated","endEstimated","intentionTouched"].every(k=>typeof v[k as keyof FormValues] === "boolean") || (v.revision !== undefined && (!Number.isInteger(v.revision) || v.revision < 1))) {
      sessionStorage.removeItem(draftKey(userId)); return null;
    }
    return d;
  } catch { return null; }
}
export function clearDraft(userId: string) { try { sessionStorage.removeItem(draftKey(userId)); } catch {} }
