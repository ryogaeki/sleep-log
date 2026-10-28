import { dayOf, shiftDay, fromJst, validateEntry, type SleepEntry, type Kind } from "./sleep";
import { DEMO_USER, DemoRepository } from "./repository";
export const DEMO_STORAGE = "sleep-log-demo-v1";
export function sampleEntries(today = dayOf(new Date())): SleepEntry[] {
  const yesterday = shiftDay(today, -1);
  const specifications: [string, string, string, Kind, string | null][] = [
    [yesterday,"02:00","08:00","normal", "夜の睡眠。目覚ましで起床。"],
    [yesterday,"13:00","14:00","nap", "授業のあとに少し昼寝。"],
    [yesterday,"17:00","23:30","doze", "机で作業中に寝落ち。開始時刻は推定。"],
    [shiftDay(today,-2),"01:20","08:10","normal",null],
    [shiftDay(today,-2),"15:00","15:40","nap",null],
    [shiftDay(today,-3),"00:30","07:10","normal",null],
  ];
  return specifications.map(([day,start,end,kind,note], i) => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i+1).padStart(12,"0")}`, user_id: DEMO_USER,
    start_at: fromJst(day,start), end_at: fromJst(day,end), kind,
    intention: kind === "doze" ? "unintentional" : "intentional",
    start_accuracy: "estimated", end_accuracy: "exact", record_timezone: "Asia/Tokyo", note,
    created_at: fromJst(day,end), updated_at: fromJst(day,end), revision: 1,
  }));
}
export function startDemo(): DemoRepository {
  let records = sampleEntries();
  try {
    const saved = sessionStorage.getItem(DEMO_STORAGE);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed)) records = parsed.map(validateEntry);
    }
  } catch { try{sessionStorage.removeItem(DEMO_STORAGE);}catch{} }
  return new DemoRepository(records, entries => {try{sessionStorage.setItem(DEMO_STORAGE,JSON.stringify(entries));}catch{/* 体験用の変更は現在の画面のメモリーに残す。 */}});
}
