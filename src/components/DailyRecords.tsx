import { useState } from "react";
import { dateLabel, dayOf, duration, formatDuration, KIND_LABEL, minutesOnDay, timeOf, type SleepEntry } from "../lib/sleep";
import { Icon } from "./Icon";

export function DailyRecords({ records, selected, onEdit }: { records: SleepEntry[]; selected: string; onEdit: (entry: SleepEntry) => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return <div className="record-list">{records.map(record => {
    const expanded = expandedId === record.id;
    const note = record.note?.trimEnd();
    return <article className={`record-card ${record.kind}`} key={record.id}>
      <button type="button" className="record-main" onClick={event => { event.currentTarget.focus(); onEdit(record); }} aria-label={`${KIND_LABEL[record.kind]} ${timeOf(record.start_at)}から${timeOf(record.end_at)} 編集`}>
        <span className="record-icon"><Icon name={record.kind === "normal" ? "moon" : record.kind === "nap" ? "sun" : record.kind === "doze" ? "spark" : "clock"} size={22} /></span>
        <span className="record-content"><span className="record-top"><strong>{KIND_LABEL[record.kind]}</strong></span><span className="record-times">{dayOf(record.start_at) !== selected && <small>{dayOf(record.start_at) < selected ? "前日以前から " : `${dateLabel(dayOf(record.start_at))} `}</small>}{timeOf(record.start_at)}<span className="time-dash">—</span>{timeOf(record.end_at)}{dayOf(record.end_at) !== selected && <small>翌日以降まで</small>}</span></span>
        <span className="record-duration"><strong>{formatDuration(duration(record))}</strong>{minutesOnDay(record, selected) !== duration(record) && <small>この日の分 {formatDuration(minutesOnDay(record, selected))}</small>}<Icon name="right" size={17} /></span>
      </button>
      {note && <button type="button" className={`record-note-toggle ${expanded ? "expanded" : ""}`} aria-label={`${KIND_LABEL[record.kind]} ${timeOf(record.start_at)}のノートを${expanded ? "閉じる" : "全文表示"}`} aria-expanded={expanded} aria-controls={`daily-note-${record.id}`} onClick={() => setExpandedId(expanded ? null : record.id)}><span className="record-note" id={`daily-note-${record.id}`}>{note}</span><Icon name="right" size={14} /></button>}
    </article>;
  })}</div>;
}
