import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, periodRange, timePoints, timelineSegments } from "../src/lib/analytics";
import { fromJst, type Kind, type SleepEntry } from "../src/lib/sleep";

function entry(n: number, start: string, end: string, kind: Kind = "normal"): SleepEntry {
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`,
    user_id: "99999999-9999-4999-8999-000000000001",
    start_at: fromJst(start.slice(0, 10), start.slice(11)), end_at: fromJst(end.slice(0, 10), end.slice(11)),
    kind, intention: "unknown", start_accuracy: "exact", end_accuracy: "exact", record_timezone: "Asia/Tokyo",
    note: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", revision: 1,
  };
}
test("週は月曜始まりで年と月をまたぎ、うるう年の月も実日数で作る", () => {
  const week = periodRange("2027-01-01", "week");
  assert.equal(week.first, "2026-12-28"); assert.equal(week.until, "2027-01-04"); assert.equal(week.days.length, 7);
  assert.equal(periodRange("2026-10-18", "week").first, "2026-10-12");
  assert.equal(periodRange("2024-02-15", "month").days.length, 29);
  assert.equal(periodRange("2026-02-15", "month").days.length, 28);
});
test("月境界の睡眠は各月に配分し、週では全時間を一度だけ集計する", () => {
  const entries = [entry(1, "2026-09-30 23:00", "2026-10-01 07:00")];
  const sept = analyze(entries, periodRange("2026-09-30", "month"), "2026-10-18");
  const oct = analyze(entries, periodRange("2026-10-01", "month"), "2026-10-18");
  const week = analyze(entries, periodRange("2026-10-01", "week"), "2026-10-18");
  assert.equal(sept.minutes, 60); assert.equal(oct.minutes, 420); assert.equal(week.minutes, 480);
  assert.equal(week.recordedDays, 2); assert.equal(week.average, 240);
});
test("未記録と未来を平均の分母にせず、記録0件は平均・割合をnullにする", () => {
  const range = periodRange("2026-10-14", "week");
  const data = analyze([entry(1, "2026-10-12 02:00", "2026-10-12 08:00"), entry(2, "2026-10-14 02:00", "2026-10-14 10:00")], range, "2026-10-14");
  assert.equal(data.average, 420); assert.equal(data.recordedDays, 2); assert.equal(data.elapsedDays, 3);
  assert.equal(data.days.filter(day => day.future).length, 4);
  const empty = analyze([], range, "2026-10-14");
  assert.equal(empty.average, null); assert.equal(empty.shares.normal, null); assert.equal(empty.recordedDays, 0);
});
test("長時間睡眠の24時間区間と0時終了を扱い、時間も日数も二重計上しない", () => {
  const sleep = entry(1, "2026-10-12 18:00", "2026-10-14 00:00");
  const data = analyze([sleep], periodRange("2026-10-14", "week"), "2026-10-18");
  assert.equal(data.minutes, 1800); assert.equal(data.recordedDays, 2); assert.equal(data.average, 900);
  const middle = timelineSegments([sleep], "2026-10-13")[0];
  assert.equal(middle.start, 0); assert.equal(middle.end, 1440);
  assert.equal(middle.continuesBefore, true); assert.equal(middle.continuesAfter, false);
  assert.deepEqual(timelineSegments([sleep], "2026-10-14"), []);
});
test("タイムラインの日付またぎは同じIDを保持し、前後への継続を判別する", () => {
  const sleep = entry(1, "2026-10-12 23:00", "2026-10-13 07:00");
  const before = timelineSegments([sleep], "2026-10-12")[0];
  const after = timelineSegments([sleep], "2026-10-13")[0];
  assert.equal(before.entry.id, after.entry.id); assert.equal(before.start, 1380); assert.equal(before.end, 1440);
  assert.equal(before.continuesBefore, false); assert.equal(before.continuesAfter, true);
  assert.equal(after.start, 0); assert.equal(after.end, 420); assert.equal(after.continuesBefore, true); assert.equal(after.continuesAfter, false);
});
test("寝落ちの発生は開始日で1回だけ数え、前期間からの継続は時間だけに含める", () => {
  const sleeps = [entry(1, "2026-09-30 23:00", "2026-10-01 02:00", "doze"), entry(2, "2026-10-02 23:00", "2026-10-03 05:00", "doze")];
  const data = analyze(sleeps, periodRange("2026-10-01", "month"), "2026-10-18");
  assert.equal(data.byKind.doze, 480); assert.equal(data.dozeCount, 1);
  assert.equal(data.dozeHours[5].count, 1); assert.equal(data.dozeHours.reduce((n, bin) => n + bin.count, 0), 1);
});
test("寝落ちの開始時刻の4時間境界を日本時間で分類する", () => {
  const sleeps = [entry(1, "2026-10-12 00:00", "2026-10-12 00:01", "doze"), entry(2, "2026-10-12 03:59", "2026-10-12 04:00", "doze"), entry(3, "2026-10-12 04:00", "2026-10-12 04:01", "doze"), entry(4, "2026-10-12 23:59", "2026-10-13 00:00", "doze")];
  const data = analyze(sleeps, periodRange("2026-10-12", "week"), "2026-10-18");
  assert.deepEqual(data.dozeHours.map(bin => bin.count), [2, 1, 0, 0, 0, 1]);
});
test("その他も含めた時間の割合と昼寝＋寝落ちを集計し、推定を保持する", () => {
  const sleeps = [entry(1, "2026-10-12 01:00", "2026-10-12 05:00"), entry(2, "2026-10-12 12:00", "2026-10-12 13:00", "nap"), entry(3, "2026-10-12 15:00", "2026-10-12 17:00", "doze"), entry(4, "2026-10-12 20:00", "2026-10-12 21:00", "other")];
  sleeps[2].start_accuracy = "estimated";
  const data = analyze(sleeps, periodRange("2026-10-12", "week"), "2026-10-18");
  assert.equal(data.minutes, 480); assert.equal(data.napAndDoze, 180);
  assert.deepEqual(data.shares, { normal: 50, nap: 12.5, doze: 25, other: 12.5 });
  assert.equal(data.estimated, true); assert.equal(data.estimatedDozeStarts, true);
});
test("時刻の推移は1日に複数回の端点をすべて保持し、それぞれの精度と境界日を使う", () => {
  const sleeps = [entry(1, "2026-09-30 23:00", "2026-10-01 07:00"), entry(2, "2026-10-01 12:00", "2026-10-01 13:00", "nap"), entry(3, "2026-10-01 17:00", "2026-10-01 18:00", "doze"), entry(4, "2026-10-31 23:00", "2026-11-01 00:00")];
  sleeps[2].start_accuracy = "estimated";
  const range = periodRange("2026-10-01", "month");
  const points = timePoints(sleeps, range);
  assert.equal(points.length, 6);
  assert.equal(points.filter(point => point.day === "2026-10-01").length, 5);
  assert.equal(points.some(point => point.day === "2026-11-01"), false);
  const doze = timePoints(sleeps, range, "doze");
  assert.equal(doze.length, 2); assert.equal(doze[0].minute, 1020); assert.equal(doze[0].estimated, true); assert.equal(doze[1].estimated, false);
});
