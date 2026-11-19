import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createLockSettings, verifyLockPassword, type NoteLockSettings } from "../lib/note-lock";
import { inputOnly, type SleepEntry } from "../lib/sleep";
import type { Repository } from "../lib/repository";
import { Icon } from "./Icon";

interface LockContext {
  unlocked: boolean;
  working: boolean;
  current: (entry: SleepEntry) => SleepEntry;
  hidden: (entry: SleepEntry) => boolean;
  protect: (entry: SleepEntry) => void;
  unlock: () => void;
  remove: (entry: SleepEntry) => void;
  lockAll: () => void;
  changePassword: () => void;
  passwordMessage: string;
}
const Context = createContext<LockContext | null>(null);
export function useNoteLock() { const context = useContext(Context); if (!context) throw new Error("日記ロックの表示設定がありません。"); return context; }
type Request = { mode: "protect" | "unlock" | "change"; entry?: SleepEntry; settings?: NoteLockSettings | null };

export function NoteLockProvider({ repository, onChanged, children }: { repository: Repository | null; onChanged: (entry: SleepEntry) => void; children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, SleepEntry>>({});
  const [request, setRequest] = useState<Request | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const mutex = useRef(false);
  const epoch = useRef(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const focusAfterClose = useRef<{ entry?: SleepEntry } | null>(null);
  function restoreFocus(entry?: SleepEntry) {
    focusAfterClose.current = { entry };
  }
  useLayoutEffect(() => {
    if (request || !focusAfterClose.current || document.hidden) return;
    const { entry } = focusAfterClose.current; focusAfterClose.current = null;
    const target = entry ? document.querySelector<HTMLElement>(`[aria-controls="note-body-${entry.id}"]`) : returnFocus.current?.isConnected ? returnFocus.current : null;
    target?.focus({ preventScroll: true });
  }, [request]);
  function lockAll() { epoch.current++; setUnlocked(false); setRequest(null); setError(""); }
  useEffect(() => {
    const visibility = () => { if (document.hidden) lockAll(); };
    document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", lockAll);
    return () => { epoch.current++; document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", lockAll); };
  }, []);
  function current(entry: SleepEntry) { const saved = overrides[entry.id]; return saved && saved.revision >= entry.revision ? saved : entry; }
  async function open(mode: Request["mode"], entry?: SleepEntry) {
    if (!repository || mutex.current) return;
    mutex.current = true; setWorking(true); setError(""); setPasswordMessage("");
    const version = epoch.current;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRequest({ mode, entry: entry && current(entry) });
    try {
      const settings = await repository.lockSettings();
      if (version === epoch.current) setRequest({ mode, entry: entry && current(entry), settings });
    } catch (error) { if (version === epoch.current) setError(error instanceof Error ? error.message : "ロック設定を確認できませんでした。"); }
    finally { mutex.current = false; setWorking(false); }
  }
  async function submit(password: string, confirmation: string, newPassword: string) {
    if (!repository || !request || request.settings === undefined || mutex.current) return;
    mutex.current = true; setWorking(true); setError("");
    const version = epoch.current;
    try {
      let settings = request.settings;
      if (request.mode === "change" && settings) {
        if (!await verifyLockPassword(password, settings)) throw new Error("現在のパスワードが違います。");
        if (newPassword !== confirmation) throw new Error("新しいパスワードと確認用のパスワードが一致しません。");
        const next = await createLockSettings(newPassword);
        if (version !== epoch.current) return;
        await repository.changeLockSettings(settings, next);
        setUnlocked(false);
        if (version === epoch.current) {
          setPasswordMessage("日記のパスワードを変更しました。日記は再ロックされています。");
          setRequest(null); restoreFocus();
        }
        return;
      }
      if (!settings) {
        if (password !== confirmation) throw new Error("確認用のパスワードが一致しません。");
        settings = await createLockSettings(password);
        if (version !== epoch.current) return;
        await repository.createLockSettings(settings);
      } else if (!await verifyLockPassword(password, settings)) throw new Error("パスワードが違います。");
      if (version !== epoch.current) return;
      const confirmed = await repository.lockSettings();
      if (!confirmed || confirmed.salt !== settings.salt || confirmed.verifier !== settings.verifier) {
        setUnlocked(false);
        throw new Error("パスワード設定が変更されています。閉じてからもう一度お試しください。");
      }
      if (version !== epoch.current) return;
      if (request.mode === "protect" && request.entry) {
        const entry = request.entry;
        const saved = await repository.save({ ...inputOnly(entry), note_locked: true }, entry.revision);
        setOverrides(previous => ({ ...previous, [saved.id]: saved }));
        setUnlocked(false); onChanged(saved);
      } else if (request.mode === "change") {
        setUnlocked(false); setPasswordMessage("日記のパスワードを設定しました。");
      } else setUnlocked(true);
      if (version === epoch.current) { setRequest(null); restoreFocus(request.entry); }
    } catch (error) { if (version === epoch.current) setError(error instanceof Error ? error.message : "ロックの操作を完了できませんでした。"); }
    finally { mutex.current = false; setWorking(false); }
  }
  async function remove(raw: SleepEntry) {
    if (!repository || !unlocked || mutex.current) return;
    mutex.current = true; setWorking(true); setError("");
    try {
      const entry = current(raw);
      const saved = await repository.save({ ...inputOnly(entry), note_locked: false }, entry.revision);
      setOverrides(previous => ({ ...previous, [saved.id]: saved })); onChanged(saved);
    } catch (error) { setError(error instanceof Error ? error.message : "ロックを外せませんでした。"); }
    finally { mutex.current = false; setWorking(false); }
  }
  return <Context.Provider value={{ unlocked, working, current, hidden: entry => Boolean(current(entry).note_locked) && !unlocked, protect: entry => { void open("protect", entry); }, unlock: () => { void open("unlock"); }, remove: entry => { void remove(entry); }, lockAll, changePassword: () => { void open("change"); }, passwordMessage }}>
    {children}
    {!request && error && <div className="diary-lock-error" role="alert">{error}<button type="button" onClick={() => setError("")}>閉じる</button></div>}
    {request && <LockDialog key={`${request.mode}:${request.entry?.id ?? "all"}`} request={request} busy={working} error={error} onSubmit={submit} onClose={() => { if (!mutex.current) { epoch.current++; setRequest(null); setError(""); restoreFocus(request.entry); } }} />}
  </Context.Provider>;
}

function LockDialog({ request, busy, error, onClose, onSubmit }: { request: Request; busy: boolean; error: string; onClose: () => void; onSubmit: (password: string, confirmation: string, newPassword: string) => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const setup = request.settings === null;
  const changing = request.mode === "change" && !setup;
  const title = setup ? "日記のパスワードを設定" : request.mode === "change" ? "日記のパスワードを変更" : request.mode === "protect" ? "この日記をロック" : "日記のロックを解除";
  useLayoutEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="diary-lock-dialog" aria-labelledby="diary-lock-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <form className={changing ? "diary-password-change" : undefined} onSubmit={event => { event.preventDefault(); void onSubmit(password, confirmation, newPassword); }}>
      <header className="dialog-heading"><h2 id="diary-lock-title">{title}</h2><button className="icon-button" type="button" onClick={onClose} disabled={busy} aria-label="閉じる"><Icon name="close" /></button></header>
      <div className="diary-lock-dialog-content"><Icon name="lock" size={30} /><p>{setup ? "ロックする日記に共通のパスワードです。8文字以上で設定してください。" : changing ? "現在のパスワードを確認して、8文字以上の新しいパスワードに変更します。変更後は日記が再ロックされます。" : request.mode === "protect" ? "共通パスワードを入力すると、この日記をロックします。" : "共通パスワードを入力すると、ロック付きの日記をすべて読めます。"}</p>
        {request.settings === undefined ? <p role="status">ロック設定を確認しています…</p> : <><label>{changing ? "現在のパスワード" : "パスワード"}<input type="password" aria-label={changing ? "現在のパスワード" : "日記のパスワード"} autoComplete={setup ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} required maxLength={1024} /></label>
        {changing && <label>新しいパスワード<input type="password" aria-label="新しいパスワード" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} disabled={busy} required maxLength={1024} /></label>}
        {(setup || changing) && <label>{changing ? "新しいパスワード（確認）" : "確認用パスワード"}<input type="password" aria-label={changing ? "新しいパスワード（確認）" : "確認用パスワード"} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} required maxLength={1024} /></label>}</>}
        {error && <p className="field-error" role="alert">{error}</p>}
        <p className="diary-lock-help">アプリ内の表示をロックします。バックアップやデータベースでは本文を読めます。</p>
      </div><footer className="dialog-footer"><button className="button primary save-button" type="submit" disabled={busy || request.settings === undefined}>{busy ? "確認中…" : setup ? request.mode === "protect" ? "設定してロックする" : request.mode === "change" ? "設定する" : "設定して開く" : changing ? "変更する" : request.mode === "protect" ? "ロックする" : "解除する"}</button></footer>
    </form>
  </dialog>;
}
