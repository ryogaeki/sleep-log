import { useMemo, useState } from "react";
import { dateLabel, dayOf, timeOf, KIND_LABEL, type SleepEntry } from "../lib/sleep";
import { Icon } from "./Icon";

export function NotesPanel({ entries, loading, error, onEdit, onReload }: {
  entries: SleepEntry[]; loading: boolean; error: string; onEdit: (entry: SleepEntry) => void; onReload: () => void;
}) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);
  const notes = useMemo(() => entries.filter(entry => entry.note?.trim()).sort((a, b) => b.start_at.localeCompare(a.start_at) || b.id.localeCompare(a.id)), [entries]);
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return search ? notes.filter(entry => `${entry.note} ${dayOf(entry.start_at)} ${KIND_LABEL[entry.kind]}`.toLocaleLowerCase().includes(search)) : notes;
  }, [notes, query]);
  return <div className="notes-page">
    <div className="section-heading"><h1>ノート</h1><button type="button" className="text-button" onClick={onReload} disabled={loading}><Icon name="refresh" size={16} className={loading ? "spinning" : ""} />更新</button></div>
    <div className="notes-toolbar"><label className="notes-search"><Icon name="search" size={19} /><input type="search" aria-label="ノートを検索" placeholder="内容・日付・睡眠の種類で検索" value={query} onChange={event => { setQuery(event.target.value); setLimit(50); }} /></label><span className="notes-count">{loading || error ? "—" : `${filtered.length}件`}</span></div>
    {loading ? <div className="panel notes-empty" role="status">ノートを読み込んでいます…</div> : error ? <div className="panel notes-empty">ノートを取得できませんでした。上の「もう一度読み込む」から再試行してください。</div> : !filtered.length ? <div className="panel notes-empty"><Icon name="notebook" size={30} /><h2>{query.trim() ? "一致するノートがありません" : "ノートがありません"}</h2><p>{query.trim() ? "検索する内容を変更してください。" : "睡眠記録の「ノート」欄に入力すると、ここに表示されます。"}</p></div> : <>
      <div className="notes-list">{filtered.slice(0, limit).map(entry => <article className="panel note-card" key={entry.id}>
        <header><div><h2>{dateLabel(dayOf(entry.start_at), true)}</h2><span className="note-sleep"><i className={`dot ${entry.kind}`} />{KIND_LABEL[entry.kind]}<span>{timeOf(entry.start_at)}〜{dayOf(entry.end_at) !== dayOf(entry.start_at) ? `${dateLabel(dayOf(entry.end_at))} ` : ""}{timeOf(entry.end_at)}</span></span></div><button type="button" className="icon-button" aria-label={`${dayOf(entry.start_at)} ${KIND_LABEL[entry.kind]}のノートを編集`} onClick={() => onEdit(entry)}><Icon name="pencil" size={18} /></button></header>
        <p className="note-body">{entry.note}</p>
      </article>)}</div>
      {filtered.length > limit && <button type="button" className="button secondary notes-more" onClick={() => setLimit(n => n + 50)}>さらに表示（残り{filtered.length - limit}件）</button>}
    </>}
  </div>;
}
