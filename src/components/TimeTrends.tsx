import { useMemo } from "react";
import { daysBetween, entryLabel, isKindFilter, matchesKind, timePoints, type KindFilter, type PeriodRange } from "../lib/analytics";
import { dayOf, KIND_LABEL, shiftDay, timeOf, type SleepEntry } from "../lib/sleep";
import { useDisplayPreference } from "../lib/display-preference";
import { useChartScroll } from "../lib/use-chart-scroll";
import { KindFilterControl } from "./KindFilter";

const compactDate = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(-2))}`;

export function TimeTrends({ userId, entries, range, selected, onEdit }: { userId: string; entries: SleepEntry[]; range: PeriodRange; selected: string; onEdit: (entry: SleepEntry) => void }) {
  const [kind, setKind] = useDisplayPreference<KindFilter>(userId, "time-trend-kind", "all", isKindFilter);
  const points = useMemo(() => timePoints(entries, range, kind), [entries, range, kind]);
  const plotDays = useMemo(() => range.trimmed && points.length ? daysBetween(points[0].day, shiftDay(points[points.length - 1].day, 1)) : range.days, [range, points]);
  const dayIndex = new Map(plotDays.map((day, index) => [day, index]));
  const tick = plotDays.length > 400 ? 30 : plotDays.length > 31 ? 7 : 1;
  const showYear = plotDays[0]?.slice(0, 4) !== plotDays.at(-1)?.slice(0, 4);
  const scroll = useChartScroll(selected, plotDays, points.length > 0);
  const rows = entries.filter(entry => matchesKind(entry.kind, kind) && (dayOf(entry.start_at) >= range.first && dayOf(entry.start_at) < range.until || dayOf(entry.end_at) >= range.first && dayOf(entry.end_at) < range.until)).sort((a, b) => a.start_at.localeCompare(b.start_at));
  return <section className="panel analysis-panel time-trends-panel" aria-labelledby="time-trends-title">
    <div className="analysis-panel-heading"><div><h2 id="time-trends-title">就寝・起床時刻の推移</h2><p>同じ日の左側に就寝、右側に起床を並べています。</p></div><KindFilterControl label="時刻グラフの種類" value={kind} onChange={setKind} /></div>
    <div className="analysis-legend"><span><i className="time-symbol start" />就寝（左）</span><span><i className="time-symbol end" />起床（右）</span></div>
    <p className="scroll-hint">横にスクロールして、ほかの日付も確認できます。</p>
    {!points.length ? <div className="analysis-empty">この期間に該当する就寝・起床の記録はありません。</div> : <div ref={scroll} className="chart-scroll" tabIndex={0} role="region" aria-label="就寝・起床時刻グラフ。横にスクロールできます"><div className="time-chart" style={{ minWidth: Math.max(320, plotDays.length * 20 + 40) }}>
      <div className="chart-y-axis" aria-hidden="true">{[0, 6, 12, 18, 24].map(hour => <span key={hour} style={{ top: `${hour / 24 * 100}%` }}>{hour}:00</span>)}</div>
      <div className="time-chart-plot"><div className="time-day-bands" aria-hidden="true">{plotDays.map(day => <span key={day} />)}</div><div className="daily-chart-grid" aria-hidden="true" />{points.map(point => <button type="button" key={`${point.entry.id}-${point.event}`} className={`time-point ${point.event}`}
        style={{ left: `${((dayIndex.get(point.day) ?? 0) + (point.event === "start" ? .25 : .75)) / plotDays.length * 100}%`, top: `${point.minute / 1440 * 100}%` }}
        aria-label={`${point.day} ${point.event === "start" ? "就寝" : "起床"} ${timeOf(point.event === "start" ? point.entry.start_at : point.entry.end_at)} ${KIND_LABEL[point.entry.kind]} 編集`}
        title={`${compactDate(point.day)} ${point.event === "start" ? "就寝" : "起床"} ${timeOf(point.event === "start" ? point.entry.start_at : point.entry.end_at)} ${KIND_LABEL[point.entry.kind]}`}
        onClick={() => onEdit(point.entry)}><i /></button>)}<div className="time-chart-dates" aria-hidden="true">{plotDays.map((day, index) => <span key={day}>{index % tick === 0 ? plotDays.length <= 31 ? Number(day.slice(-2)) : `${showYear ? `${day.slice(2, 4)}/` : ""}${compactDate(day)}` : ""}</span>)}</div></div>
    </div></div>}
    <p className="analysis-caption">点を押すと編集できます。1日に複数回あっても、実際の就寝日・起床日にすべて表示します。</p>
    <details className="analysis-details"><summary>就寝・起床の日時を一覧で見る</summary><div className="table-scroll"><table><caption className="visually-hidden">就寝・起床の日時一覧</caption><thead><tr><th scope="col">種類</th><th scope="col">就寝</th><th scope="col">起床</th><th scope="col">操作</th></tr></thead><tbody>{rows.map(entry => <tr key={entry.id}><th scope="row">{KIND_LABEL[entry.kind]}</th><td>{compactDate(dayOf(entry.start_at))} {timeOf(entry.start_at)}</td><td>{compactDate(dayOf(entry.end_at))} {timeOf(entry.end_at)}</td><td><button type="button" onClick={() => onEdit(entry)} aria-label={`${KIND_LABEL[entry.kind]} ${entryLabel(entry)} 編集`}>編集</button></td></tr>)}</tbody></table>{!rows.length && <p>該当する記録はありません。</p>}</div></details>
  </section>;
}
