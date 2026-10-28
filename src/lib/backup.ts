import { AppError, overlap, sameContent, validateInput, type SleepEntry, type SleepInput } from "./sleep";
export interface Backup {
  format: "sleep-log-backup";
  version: 1;
  exported_at: string;
  timezone: "Asia/Tokyo";
  count: number;
  entries: SleepInput[];
}
export function makeBackup(entries: SleepEntry[]): Backup {
  return { format: "sleep-log-backup", version: 1, exported_at: new Date().toISOString(), timezone: "Asia/Tokyo", count: entries.length, entries: entries.map(({ user_id: _owner, ...entry }) => entry) };
}
export function parseBackup(raw: unknown, now = Date.now()): Backup {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new AppError("invalid", "Sleep Logのバックアップファイルを選んでください。");
  const x = raw as Record<string, unknown>;
  if (x.format !== "sleep-log-backup" || x.version !== 1 || x.timezone !== "Asia/Tokyo" || typeof x.exported_at !== "string" || !/(Z|[+-]\d\d:\d\d)$/.test(x.exported_at) || !Number.isFinite(Date.parse(x.exported_at)) || !Array.isArray(x.entries) || x.count !== x.entries.length) throw new AppError("invalid", "バックアップの形式・版・件数を確認してください。対応する版は1です。");
  const entries = x.entries.map((entry, i) => {
    try { return validateInput({ ...entry }, now); } catch (error) { throw new AppError("invalid", `${i + 1}件目：${error instanceof Error ? error.message : "記録を確認してください。"}`); }
  });
  if (new Set(entries.map(e => e.id)).size !== entries.length) throw new AppError("invalid", "バックアップ内に同じ記録IDが複数あります。");
  const sorted = [...entries].sort((a,b) => a.start_at.localeCompare(b.start_at));
  for (let i = 1; i < sorted.length; i++) if (overlap(sorted[i - 1], sorted[i])) throw new AppError("overlap", "バックアップ内に時間帯が重なる記録があります。");
  return { format: "sleep-log-backup", version: 1, exported_at: x.exported_at, timezone: "Asia/Tokyo", count: entries.length, entries };
}
export function planRestore(backup: Backup, current: SleepInput[]) {
  const byId = new Map(current.map(e => [e.id, e]));
  const additions = backup.entries.filter(e => !byId.has(e.id));
  const changed = backup.entries.filter(e => byId.has(e.id) && !sameContent(e, byId.get(e.id)!));
  const collisions = additions.flatMap(e => current.filter(c => overlap(e,c)).map(c => ({ incoming: e, current: c })));
  return { additions, changed, existing: backup.count - additions.length, collisions };
}
