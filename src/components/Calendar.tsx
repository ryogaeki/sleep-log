import { dayOf, shiftDay, shiftMonth, monthStart, fromJst, summary, shortDuration, KINDS, type SleepEntry } from "../lib/sleep";
import { Icon } from "./Icon";
export function Calendar({ selected, entries, compact = false, onSelect, onMonth }: { selected: string; entries: SleepEntry[]; compact?: boolean; onSelect: (day:string)=>void; onMonth:(day:string)=>void }) {
  const first = monthStart(selected);
  const weekday = (new Date(fromJst(first,"12:00")).getUTCDay() + 6) % 7;
  const start = shiftDay(first,-weekday);
  const today = dayOf(new Date());
  const [year, month] = selected.split("-");
  return <section className={`calendar ${compact ? "compact" : "full-calendar"}`} aria-label="月間カレンダー">
    <div className="calendar-heading"><h2>{year}<span>年</span> {Number(month)}<span>月</span></h2><div className="row gap-1"><button type="button" className="icon-button" aria-label="前の月" onClick={()=>onMonth(shiftMonth(selected,-1))}><Icon name="left" size={18}/></button><button type="button" className="icon-button" aria-label="次の月" onClick={()=>onMonth(shiftMonth(selected,1))}><Icon name="right" size={18}/></button></div></div>
    <div className="calendar-grid">{["月","火","水","木","金","土","日"].map((label,i)=><div key={label} className={`weekday ${i===6 ? "sunday" : ""}`}>{label}</div>)}
      {Array.from({length:42},(_,i)=>shiftDay(start,i)).map(day=>{
        const data = summary(entries,day);
        const outside = day.slice(0,7) !== selected.slice(0,7);
        return <button key={day} type="button" aria-label={`${day} ${data.records.length ? `記録合計${data.estimated ? "約" : ""}${data.minutes}分` : "未記録"}`} aria-pressed={day===selected} className={`calendar-day ${day===selected ? "selected" : ""} ${day===today ? "is-today" : ""} ${outside ? "outside" : ""}`} onClick={()=>onSelect(day)}>
          <span className="day-number">{Number(day.slice(-2))}</span>
          {!compact && <span className="calendar-time">{data.records.length ? `${data.estimated ? "約" : ""}${shortDuration(data.minutes)}` : "—"}</span>}
          <span className="calendar-dots">{!outside && KINDS.filter(k=>data.byKind[k]>0).map(k=><i key={k} className={`dot ${k}`} />)}</span>
        </button>;
      })}
    </div>
    <div className="calendar-footer"><span><i className="today-mark"/> 今日</span><button type="button" className="text-button" onClick={()=>onSelect(today)}>今日に戻る</button></div>
  </section>;
}
