import { test } from "node:test";
import assert from "node:assert/strict";
import { createLockSettings, validateLockSettings, verifyLockPassword } from "../src/lib/note-lock";
import { DemoRepository, DEMO_USER } from "../src/lib/repository";
import { parseBackup } from "../src/lib/backup";
import { type SleepEntry } from "../src/lib/sleep";

test("日記の共通パスワードはsalt付き照合値だけを保存し、正誤を判定する", async () => {
  const settings = await createLockSettings("diary-test-password");
  assert.equal(JSON.stringify(settings).includes("diary-test-password"), false);
  assert.equal(await verifyLockPassword("diary-test-password", settings), true);
  assert.equal(await verifyLockPassword("wrong-password", settings), false);
  assert.equal(await verifyLockPassword("", settings), false);
  assert.notEqual((await createLockSettings("diary-test-password")).salt, settings.salt);
  await assert.rejects(createLockSettings("short"));
  assert.throws(() => validateLockSettings({ ...settings, version: 2 }));
});

test("ロックの指定と本文をバックアップ・復元で保持し、旧形式は未ロックとして読む", async () => {
  const entry: SleepEntry = { id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", user_id: DEMO_USER, start_at: "2026-10-17T02:00:00Z", end_at: "2026-10-17T03:00:00Z", kind: "normal", record_timezone: "Asia/Tokyo", note: "バックアップでは読める日記", note_locked: true, created_at: "2026-10-17T03:00:00Z", updated_at: "2026-10-17T03:00:00Z", revision: 1 };
  const repo = new DemoRepository([entry]);
  const settings = await createLockSettings("diary-test-password");
  await repo.createLockSettings(settings);
  await assert.rejects(repo.createLockSettings(settings));
  const backup = await repo.export();
  assert.equal(backup.entries[0].note, entry.note); assert.equal(backup.entries[0].note_locked, true);
  assert.equal(JSON.stringify(backup).includes(settings.verifier), false);
  const restored = new DemoRepository([]); await restored.restore(backup);
  assert.equal((await restored.get(entry.id))?.note_locked, true);
  const legacy = structuredClone(backup); delete legacy.entries[0].note_locked;
  assert.equal(parseBackup(legacy).entries[0].note_locked, false);
  const updated = await restored.save({ ...entry, note: "" }, 1);
  assert.equal(updated.note, null); assert.equal(updated.note_locked, false);
});
