import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBackup, makeBackup, planRestore, type Backup } from "./backup";
import { AppError, fromJst, validateEntry, validateInput, sameContent, inputOnly, overlap, type SleepEntry, type SleepInput } from "./sleep";

export interface RestoreResult { added: number; kept: number; changed: number }
export interface Repository {
  list(first: string, until: string): Promise<SleepEntry[]>;
  get(id: string): Promise<SleepEntry | null>;
  save(entry: SleepInput, expectedRevision?: number): Promise<SleepEntry>;
  remove(id: string, revision: number): Promise<void>;
  export(): Promise<Backup>;
  restore(backup: Backup): Promise<RestoreResult>;
}
export function dbError(error: { code?: string; message?: string }): AppError {
  if (error.code === "23P01") return new AppError("overlap", "時間帯が重なる記録があります。最新の記録を確認して、日時を修正してください。");
  if (error.code === "42501" || error.code === "PGRST301" || error.code === "PGRST303") return new AppError("permission", "ログイン状態と、このアカウントの利用許可を確認してください。入力は残っています。");
  if (error.message?.includes("SLEEP_FUTURE")) return new AppError("invalid", "終了日時が保存先の現在時刻より後です。端末の時計と日時を確認してください。");
  if (error.code?.startsWith("22") || error.code === "23514" || error.code === "23502") return new AppError("invalid", "記録やバックアップの形式・日時・文字数を確認してください。");
  return new AppError("network", "保存先に接続できませんでした。通信状況や保存先の休止状態を確認して、もう一度お試しください。");
}
export class CloudRepository implements Repository {
  constructor(private sb: SupabaseClient, private userId: string) {}
  async list(first: string, until: string) {
    const entries: SleepEntry[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await this.sb.from("sleep_entries").select("*").eq("user_id", this.userId)
        .lt("start_at", fromJst(until)).gt("end_at", fromJst(first)).order("start_at").order("id").range(offset, offset + 499);
      if (error) throw dbError(error);
      entries.push(...data.map(validateEntry));
      if (data.length < 500) break;
    }
    return entries;
  }
  async get(id: string) {
    const { data, error } = await this.sb.from("sleep_entries").select("*").eq("user_id", this.userId).eq("id",id).maybeSingle();
    if (error) throw dbError(error);
    return data ? validateEntry(data) : null;
  }
  async save(raw: SleepInput, expectedRevision?: number) {
    const entry = validateInput({ ...raw });
    if (expectedRevision !== undefined) {
      const { id, ...fields } = entry;
      const { data, error } = await this.sb.from("sleep_entries").update(fields).eq("user_id", this.userId).eq("id", id).eq("revision", expectedRevision).select("*").maybeSingle();
      if (error) throw dbError(error);
      if (data) return validateEntry(data);
      const current = await this.get(id);
      if (current && current.revision === expectedRevision + 1 && sameContent(current, entry)) return current;
      throw new AppError("conflict", "別の画面で変更または削除されています。入力を残したまま、最新の記録を確認してください。");
    }
    const { data, error } = await this.sb.from("sleep_entries").insert({ ...entry, user_id: this.userId }).select("*").single();
    if (!error) return validateEntry(data);
    if (error.code === "23505") {
      const current = await this.get(entry.id);
      if (current && sameContent(current,entry)) return current;
      throw new AppError("conflict", "同じ記録IDの内容が変更されています。最新の記録を確認してください。");
    }
    throw dbError(error);
  }
  async remove(id: string, revision: number) {
    const { data, error } = await this.sb.from("sleep_entries").delete().eq("user_id", this.userId).eq("id",id).eq("revision",revision).select("id");
    if (error) throw dbError(error);
    if (data.length !== 1) throw new AppError("conflict", "別の画面で変更または削除されています。最新の記録を確認してください。");
  }
  async export() {
    const { data, error } = await this.sb.rpc("export_sleep_backup");
    if (error) throw dbError(error);
    // 保存先の時計が端末より進んでいても、既存の記録のバックアップは可能。
    const checked = parseBackup(data, Infinity);
    return { ...checked, entries: checked.entries.map((entry, index) => ({ ...(data as Backup).entries[index], ...entry })) };
  }
  async restore(backup: Backup) {
    const checked = parseBackup(backup);
    const { data, error } = await this.sb.rpc("restore_sleep_backup", { p_backup: checked });
    if (error) throw dbError(error);
    if (!data || !Number.isInteger(data.added) || !Number.isInteger(data.kept) || !Number.isInteger(data.changed)) throw new AppError("network", "復元結果を確認できませんでした。再読み込みして記録を確認してください。");
    return data as RestoreResult;
  }
}

export const DEMO_USER = "99999999-9999-4999-8999-000000000001";
export class DemoRepository implements Repository {
  private entries: SleepEntry[];
  constructor(initial: SleepEntry[], private persist: (entries: SleepEntry[]) => void = () => {}) { this.entries = structuredClone(initial); }
  private commit(next: SleepEntry[]) { this.persist(next); this.entries = next; }
  async list(first: string, until: string) { return structuredClone(this.entries.filter(e => e.start_at < fromJst(until) && e.end_at > fromJst(first))); }
  async get(id: string) { return structuredClone(this.entries.find(e => e.id === id) ?? null); }
  async save(raw: SleepInput, revision?: number) {
    const entry = validateInput({ ...raw });
    const previous = this.entries.find(e => e.id === entry.id);
    if (revision === undefined && previous && sameContent(previous,entry)) return structuredClone(previous);
    if ((revision !== undefined && previous?.revision !== revision) || (revision === undefined && previous)) throw new AppError("conflict", "別の画面で変更または削除されています。");
    if (this.entries.some(e => overlap(e,entry))) throw new AppError("overlap", "時間帯が重なる記録があります。日時を修正してください。");
    const now = new Date().toISOString();
    const saved: SleepEntry = { ...entry, user_id: DEMO_USER, created_at: previous?.created_at ?? now, updated_at: now, revision: (previous?.revision ?? 0) + 1 };
    this.commit([...this.entries.filter(e => e.id !== saved.id), saved]);
    return structuredClone(saved);
  }
  async remove(id: string, revision: number) {
    if (this.entries.find(e => e.id === id)?.revision !== revision) throw new AppError("conflict", "別の画面で変更または削除されています。");
    this.commit(this.entries.filter(e => e.id !== id));
  }
  async export() { return makeBackup(structuredClone(this.entries)); }
  async restore(raw: Backup) {
    const backup = parseBackup(raw);
    const plan = planRestore(backup,this.entries);
    if (plan.collisions.length) throw new AppError("overlap", "現在の記録と時間帯が重なるため復元できません。");
    const now = new Date().toISOString();
    const added = plan.additions.map(e => ({ ...inputOnly(e), user_id: DEMO_USER, created_at: now, updated_at: now, revision: 1 }));
    this.commit([...this.entries, ...added]);
    return { added: added.length, kept: plan.existing, changed: plan.changed.length };
  }
}
