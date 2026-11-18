import { useMemo, useState } from "react";
import { dateLabel, dayOf, duration, formatDuration, fromJst, shiftDay, timeOf, KIND_LABEL, type SleepEntry } from "../lib/sleep";
import { useDisplayPreference } from "../lib/display-preference";
import { Icon } from "./Icon";

export function NotesPanel({ userId, entries, loading, error, onEdit, onReload }: {
  userId: string; entries: SleepEntry[]; loading: boolean; error: string; onEdit: (entry: SleepEntry) => void; onReload: () => void;
}) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previousDay, setPreviousDay] = useDisplayPreference(userId, "notes-previous-day", true, (value): value is boolean => typeof value === "boolean");
  const noteDate = (entry: SleepEntry) => shiftDay(dayOf(entry.start_at), previousDay ? -1 : 0);
  const notes = useMemo(() => entries.filter(entry => entry.note?.trim()).sort((a, b) => b.start_at.localeCompare(a.start_at) || b.id.localeCompare(a.id)), [entries]);
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return search ? notes.filter(entry => `${entry.note} ${shiftDay(dayOf(entry.start_at), previousDay ? -1 : 0)} ${KIND_LABEL[entry.kind]}`.toLocaleLowerCase().includes(search)) : notes;
  }, [notes, query, previousDay]);
  const groups: { day: string; entries: SleepEntry[] }[] = [];
  for (const entry of filtered.slice(0, limit)) {
    const day = noteDate(entry);
    if (groups.at(-1)?.day !== day) groups.push({ day, entries: [] });
    groups[groups.length - 1].entries.push(entry);
  }
  return <div className="notes-page">
    <div className="section-heading"><h1>ノート</h1><button type="button" className="text-button" onClick={onReload} disabled={loading}><Icon name="refresh" size={16} className={loading ? "spinning" : ""} />更新</button></div>
    <div className="notes-toolbar"><label className="notes-search"><Icon name="search" size={19} /><input type="search" aria-label="ノートを検索" placeholder="内容・表示日付・睡眠の種類で検索" value={query} onChange={event => { setQuery(event.target.value); setLimit(50); setExpandedId(null); }} /></label><span className="notes-count">{loading || error ? "—" : `${filtered.length}件`}</span></div>
    <div className="notes-display-setting"><label className="notes-date-switch"><input type="checkbox" role="switch" checked={previousDay} onChange={event => { setPreviousDay(event.target.checked); setLimit(50); setExpandedId(null); }} /><span>ノートの日付を1日前に表示</span></label></div>
    {loading ? <div className="panel notes-empty" role="status">ノートを読み込んでいます…</div> : error ? <div className="panel notes-empty">ノートを取得できませんでした。上の「もう一度読み込む」から再試行してください。</div> : !filtered.length ? <div className="panel notes-empty"><Icon name="notebook" size={30} /><h2>{query.trim() ? "一致するノートがありません" : "ノートがありません"}</h2><p>{query.trim() ? "検索する内容を変更してください。" : "睡眠記録の「ノート」欄に入力すると、ここに表示されます。"}</p></div> : <>
      <div className="notes-list">{groups.map(group => <section className="note-day" key={group.day}>
        {group.entries.map((entry, index) => {
          const expanded = expandedId === entry.id;
          const label = `${dayOf(entry.start_at)} ${KIND_LABEL[entry.kind]}のノート`;
          return <article className="note-entry" key={entry.id}>
            <header className={`note-entry-header ${index ? "continued" : ""}`}>
              {index === 0 && <h2 className="note-day-heading"><time dateTime={group.day} aria-label={dateLabel(group.day, true)}><span className="note-date-day">{Number(group.day.slice(-2))}</span><span className="note-date-detail"><span className="note-date-weekday">{new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: "Asia/Tokyo" }).format(new Date(fromJst(group.day)))}</span><span className="note-date-month">{group.day.slice(0, 4)}/{Number(group.day.slice(5, 7))}</span></span></time></h2>}
              <div className="note-sleep"><i className={`dot ${entry.kind}`} /><span className="note-sleep-detail"><span className="note-sleep-kind">{KIND_LABEL[entry.kind]}</span><span className="note-sleep-time">{timeOf(entry.start_at)}〜{timeOf(entry.end_at)}</span><span className="note-sleep-duration">{formatDuration(duration(entry))}</span></span></div>
              {expanded && <div className="note-actions"><button type="button" className="icon-button" aria-label={`${label}を編集`} onClick={event => { event.currentTarget.focus(); onEdit(entry); }}><Icon name="pencil" size={17} /></button></div>}
            </header>
            <div className={`panel note-card ${expanded ? "expanded" : ""}`}>
              <button type="button" className="note-content-toggle" aria-label={`${label}を${expanded ? "閉じる" : "全文表示"}`} aria-expanded={expanded} aria-controls={`note-body-${entry.id}`} onClick={event => { event.currentTarget.focus({ preventScroll: true }); setExpandedId(expanded ? null : entry.id); }}><span className="note-body" id={`note-body-${entry.id}`}>{entry.note?.trimEnd()}</span></button>
            </div>
          </article>;
        })}
      </section>)}</div>
      {filtered.length > limit && <button type="button" className="button secondary notes-more" onClick={() => setLimit(n => n + 50)}>さらに表示（残り{filtered.length - limit}件）</button>}
    </>}
  </div>;
}
