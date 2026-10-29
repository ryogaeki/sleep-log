import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { analyze, entryLabel, periodRange, timePoints, timelineSegments, type Period, type PeriodRange } from "../lib/analytics";
import { KINDS, KIND_LABEL, dateLabel, dayOf, formatDuration, shiftDay, shiftMonth, timeOf, type Kind, type SleepEntry } from "../lib/sleep";
import { Icon } from "./Icon";

type Analysis = ReturnType<typeof analyze>;
const compactDate = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(-2))}`;
const color = (kind: Kind) => `var(--${kind})`;
const percent = (value: number) => `${value.toFixed(1)}%`;

function useChartScroll(selected: string, days: string[], enabled = true) {
  const ref = useRef<HTMLDivElement>(null);
  const index = days.indexOf(selected);
  const count = days.length;
  const first = days[0];
  useEffect(() => {
    const viewport = ref.current;
    if (viewport && index >= 0 && enabled) {
      viewport.scrollLeft = 40 + (viewport.scrollWidth - 40) * (index + 0.5) / count - viewport.clientWidth / 2;
    }
  }, [index, count, first, enabled]);
  return ref;
}

function KindLegend() {
  return <div className="analysis-legend">{KINDS.map(kind => <span key={kind}><i className={`dot ${kind}`} />{KIND_LABEL[kind]}</span>)}</div>;
}

function DailyChart({ data, selected, onSelect }: { data: Analysis; selected: string; onSelect: (day: string) => void }) {
  const scroll = useChartScroll(selected, data.days.map(day => day.day));
  const maximum = Math.max(480, Math.ceil(Math.max(...data.days.map(day => day.minutes)) / 240) * 240);
  const runs: string[][] = [];
  for (const [i, day] of data.days.entries()) {
    if (!day.records.length || day.future) { if (runs.at(-1)?.length) runs.push([]); continue; }
    if (!runs.length) runs.push([]);
    runs[runs.length - 1].push(`${(i + 0.5) / data.days.length * 1000},${200 - day.minutes / maximum * 200}`);
  }
  return <section className="panel analysis-panel" aria-labelledby="daily-chart-title">
    <div className="analysis-panel-heading"><div><h2 id="daily-chart-title">日ごとの睡眠時間</h2><p>棒は種類別の内訳、線は合計。日付を押すと記録を開きます。</p></div><Icon name="chart" /></div>
    <KindLegend />
    <p className="scroll-hint">横にスクロールして、ほかの日付も確認できます。</p>
    <div ref={scroll} className="chart-scroll" tabIndex={0} role="region" aria-label="日別睡眠時間グラフ。横にスクロールできます">
      <div className="daily-chart" style={{ minWidth: Math.max(320, data.days.length * 23 + 40) }}>
        <div className="chart-y-axis" aria-hidden="true">{[1, 0.75, 0.5, 0.25, 0].map(n => <span key={n} style={{ top: `${(1 - n) * 100}%` }}>{maximum * n / 60}h</span>)}</div>
        <div className="daily-chart-content">
          <div className="daily-chart-grid" aria-hidden="true" />
          <div className="daily-chart-bars">{data.days.map(day => <button type="button" className={`daily-chart-day ${day.future ? "future" : ""}`} key={day.day}
            aria-label={`${day.day} ${day.records.length ? `${day.estimated ? "約" : ""}${formatDuration(day.minutes)}` : day.future ? "これから" : "未記録"} 日別の記録を開く`}
            title={`${dateLabel(day.day)}：${day.records.length ? `${day.estimated ? "約" : ""}${formatDuration(day.minutes)}` : day.future ? "これから" : "未記録"}`}
            onClick={() => onSelect(day.day)}>
            <span className="daily-bar-area">{day.records.length ? <span className="daily-bar-stack" style={{ height: `${day.minutes / maximum * 100}%` }}>{KINDS.map(kind => day.byKind[kind] > 0 && <span key={kind} style={{ height: `${day.byKind[kind] / day.minutes * 100}%`, background: color(kind) }} />)}</span> : <span className="missing-bar">—</span>}</span>
            <span className="daily-bar-date">{Number(day.day.slice(-2))}</span>
          </button>)}</div>
          <svg className="daily-chart-line" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">{runs.filter(run => run.length > 1).map((run, i) => <polyline key={i} points={run.join(" ")} fill="none" stroke="#585078" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}{data.days.map((day, i) => day.records.length > 0 && !day.future && <circle key={day.day} cx={(i + 0.5) / data.days.length * 1000} cy={200 - day.minutes / maximum * 200} r="2.6" fill="#585078" />)}</svg>
        </div>
      </div>
    </div>
    <p className="analysis-caption">— は未記録です。未記録の日を0時間として結んでいません。</p>
    <details className="analysis-details"><summary>日別の集計を表で見る</summary><div className="table-scroll"><table><caption className="visually-hidden">日別の睡眠時間と種類別内訳</caption><thead><tr><th scope="col">日付</th><th scope="col">合計</th>{KINDS.map(kind => <th scope="col" key={kind}>{KIND_LABEL[kind]}</th>)}</tr></thead><tbody>{data.days.map(day => <tr key={day.day}><th scope="row"><button type="button" onClick={() => onSelect(day.day)}>{compactDate(day.day)}</button></th><td>{day.records.length ? `${day.estimated ? "約" : ""}${formatDuration(day.minutes)}` : day.future ? "これから" : "未記録"}</td>{KINDS.map(kind => <td key={kind}>{day.records.length ? formatDuration(day.byKind[kind]) : "—"}</td>)}</tr>)}</tbody></table></div></details>
  </section>;
}

function SleepTimeline({ entries, data, selected, onSelect, onEdit }: { entries: SleepEntry[]; data: Analysis; selected: string; onSelect: (day: string) => void; onEdit: (entry: SleepEntry) => void }) {
  const [highlight, setHighlight] = useState<string | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const selectedRow = useRef<HTMLDivElement>(null);
  const first = data.days[0]?.day;
  useEffect(() => {
    const viewport = scroll.current;
    const row = selectedRow.current;
    if (viewport && row) viewport.scrollTop += row.getBoundingClientRect().top - viewport.getBoundingClientRect().top - viewport.clientHeight / 2 + row.clientHeight / 2;
  }, [selected, first]);
  return <section className="panel analysis-panel" aria-labelledby="timeline-title">
    <div className="analysis-panel-heading"><div><h2 id="timeline-title">24時間タイムライン</h2><p>帯を押すと編集できます。矢印は前日・翌日へのつながりです。</p></div><Icon name="clock" /></div>
    <KindLegend />
    <p className="scroll-hint">横にスクロールして、0:00〜24:00を確認できます。</p>
    <div ref={scroll} className="timeline-scroll" tabIndex={0} role="region" aria-label="24時間タイムライン。横と縦にスクロールできます">
      <div className="sleep-timeline">
        <div className="timeline-axis"><span>日付</span><div>{[0, 6, 12, 18, 24].map(hour => <span key={hour} style={{ left: `${hour / 24 * 100}%` }}>{hour}:00</span>)}</div><span>合計</span></div>
        {data.days.map(day => <div ref={day.day === selected ? selectedRow : undefined} className={`timeline-row ${day.day === selected ? "selected" : ""} ${day.future ? "future" : ""}`} key={day.day}>
          <button type="button" className="timeline-date" aria-label={`${day.day} 日別の記録を開く`} onClick={() => onSelect(day.day)}>{compactDate(day.day)}<small>{dateLabel(day.day).slice(-3)}</small></button>
          <div className="timeline-track">{timelineSegments(entries, day.day).map(segment => <button type="button" key={segment.entry.id}
            className={`timeline-segment ${segment.continuesBefore ? "continues-before" : ""} ${segment.continuesAfter ? "continues-after" : ""} ${highlight === segment.entry.id ? "highlighted" : ""}`}
            style={{ left: `${segment.start / 1440 * 100}%`, width: `${(segment.end - segment.start) / 1440 * 100}%`, background: color(segment.entry.kind) }}
            aria-label={`${day.day} ${KIND_LABEL[segment.entry.kind]} ${entryLabel(segment.entry)} 編集`}
            title={`${KIND_LABEL[segment.entry.kind]} ${entryLabel(segment.entry)}`}
            onMouseEnter={() => setHighlight(segment.entry.id)} onMouseLeave={() => setHighlight(null)} onFocus={() => setHighlight(segment.entry.id)} onBlur={() => setHighlight(null)} onClick={() => onEdit(segment.entry)}>
            {segment.continuesBefore && <span className="continuation before" aria-hidden="true">←</span>}
            {segment.end - segment.start >= 90 && <span className="timeline-bar-label">{KIND_LABEL[segment.entry.kind]}</span>}
            {segment.continuesAfter && <span className="continuation after" aria-hidden="true">→</span>}
          </button>)}{!day.records.length && <span className="timeline-empty">{day.future ? "これから" : "未記録"}</span>}</div>
          <span className="timeline-total">{day.records.length ? `${day.estimated ? "約" : ""}${formatDuration(day.minutes)}` : "—"}</span>
        </div>)}
      </div>
    </div>
    <p className="analysis-caption">日付をまたぐ帯も、保存されている記録は同じ1件です。短い睡眠もすべて表示しています。</p>
  </section>;
}

function KindBreakdown({ data }: { data: Analysis }) {
  let edge = 0;
  const stops = KINDS.map(kind => { const start = edge; edge += data.shares[kind] ?? 0; return `${color(kind)} ${start}% ${edge}%`; });
  return <section className="panel analysis-panel" aria-labelledby="kind-breakdown-title">
    <div className="analysis-panel-heading"><div><h2 id="kind-breakdown-title">睡眠の種類と割合</h2><p>選んだ期間内の、睡眠時間に占める割合です。</p></div></div>
    <div className="kind-breakdown"><div className="kind-donut" style={{ background: data.minutes ? `conic-gradient(${stops.join(",")})` : "#eeedf4" }} aria-hidden="true"><div><span>期間の合計</span><strong>{data.recordedDays ? `${data.estimated ? "約" : ""}${Math.floor(data.minutes / 60)}` : "—"}</strong><small>{data.recordedDays ? `時間${data.minutes % 60 ? `${data.minutes % 60}分` : ""}` : "未記録"}</small></div></div>
      <dl className="kind-breakdown-list">{KINDS.map(kind => <div key={kind}><dt><i className={`dot ${kind}`} />{KIND_LABEL[kind]}</dt><dd><strong>{data.recordedDays ? `${data.estimatedByKind[kind] ? "約" : ""}${formatDuration(data.byKind[kind])}` : "—"}</strong><span>{data.shares[kind] === null ? "—" : percent(data.shares[kind])}</span></dd></div>)}</dl>
    </div>
    <p className="analysis-caption">各日0:00で配分し、この期間に含まれる時間だけを集計します。割合は小数第1位に丸めています。</p>
  </section>;
}

function DozeChart({ data }: { data: Analysis }) {
  const maximum = Math.max(1, ...data.dozeHours.map(bin => bin.count));
  return <section className="panel analysis-panel" aria-labelledby="doze-title">
    <div className="analysis-panel-heading"><div><h2 id="doze-title">寝落ちが始まった時間帯</h2><p>期間内に始まった記録を、1件1回として数えます。</p></div></div>
    <div className="doze-total"><strong>{data.recordedDays ? data.dozeCount : "—"}</strong><span>回の寝落ち</span>{data.estimatedDozeStarts && <span className="tag">推定時刻を含む</span>}</div>
    <div className="doze-bins">{data.dozeHours.map(bin => <div key={bin.first} className="doze-bin"><span>{bin.first}〜{bin.until}時</span><span className="doze-bin-track" aria-hidden="true"><i style={{ width: `${bin.count / maximum * 100}%` }} /></span><strong>{data.recordedDays ? `${bin.count}回` : "—"}</strong></div>)}</div>
    <p className="analysis-caption">日付をまたいでも発生は1回です。期間より前に始まった寝落ちは、今回の発生回数には含めません。</p>
  </section>;
}

function TimeTrends({ entries, range, selected, onEdit }: { entries: SleepEntry[]; range: PeriodRange; selected: string; onEdit: (entry: SleepEntry) => void }) {
  const [kind, setKind] = useState<Kind | "all">("all");
  const points = useMemo(() => timePoints(entries, range, kind), [entries, range, kind]);
  const scroll = useChartScroll(selected, range.days, points.length > 0);
  const rows = entries.filter(entry => (kind === "all" || entry.kind === kind) && (dayOf(entry.start_at) >= range.first && dayOf(entry.start_at) < range.until || dayOf(entry.end_at) >= range.first && dayOf(entry.end_at) < range.until)).sort((a, b) => a.start_at.localeCompare(b.start_at));
  return <section className="panel analysis-panel" aria-labelledby="time-trends-title">
    <div className="analysis-panel-heading"><div><h2 id="time-trends-title">睡眠開始・起床時刻の推移</h2><p>1日に何回あっても、すべての開始・起床を表示します。</p></div><label className="chart-filter">種類<select aria-label="時刻グラフの種類" value={kind} onChange={event => setKind(event.target.value as Kind | "all")}><option value="all">すべての睡眠</option>{KINDS.map(k => <option value={k} key={k}>{KIND_LABEL[k]}</option>)}</select></label></div>
    <div className="analysis-legend"><span><i className="time-symbol start" />睡眠開始</span><span><i className="time-symbol end" />起床</span><span>中が白い点：推定時刻</span></div>
    <p className="scroll-hint">横にスクロールして、ほかの日付も確認できます。</p>
    {!points.length ? <div className="analysis-empty">この期間に該当する開始・起床の記録はありません。</div> : <div ref={scroll} className="chart-scroll" tabIndex={0} role="region" aria-label="睡眠開始・起床時刻グラフ。横にスクロールできます"><div className="time-chart" style={{ minWidth: Math.max(320, range.days.length * 23 + 40) }}>
      <div className="chart-y-axis" aria-hidden="true">{[0, 6, 12, 18, 24].map(hour => <span key={hour} style={{ top: `${hour / 24 * 100}%` }}>{hour}:00</span>)}</div>
      <div className="time-chart-plot"><div className="daily-chart-grid" aria-hidden="true" />{points.map(point => <button type="button" key={`${point.entry.id}-${point.event}`} className={`time-point ${point.event} ${point.estimated ? "estimated" : ""}`}
        style={{ left: `${(range.days.indexOf(point.day) + 0.5) / range.days.length * 100}%`, top: `${point.minute / 1440 * 100}%` }}
        aria-label={`${point.day} ${point.event === "start" ? "睡眠開始" : "起床"} ${timeOf(point.event === "start" ? point.entry.start_at : point.entry.end_at)} ${KIND_LABEL[point.entry.kind]}${point.estimated ? " 推定" : ""} 編集`}
        title={`${compactDate(point.day)} ${point.event === "start" ? "開始" : "起床"} ${timeOf(point.event === "start" ? point.entry.start_at : point.entry.end_at)} ${KIND_LABEL[point.entry.kind]}${point.estimated ? "（推定）" : ""}`}
        onClick={() => onEdit(point.entry)}><i /></button>)}<div className="time-chart-dates" aria-hidden="true">{range.days.map(day => <span key={day}>{Number(day.slice(-2))}</span>)}</div></div>
    </div></div>}
    <p className="analysis-caption">点を押すと記録を編集できます。開始・起床それぞれの実際の日付に表示し、未記録は補いません。</p>
    <details className="analysis-details"><summary>開始・起床の日時を一覧で見る</summary><div className="table-scroll"><table><caption className="visually-hidden">睡眠開始・起床の日時一覧</caption><thead><tr><th scope="col">種類</th><th scope="col">睡眠開始</th><th scope="col">起床</th><th scope="col">操作</th></tr></thead><tbody>{rows.map(entry => <tr key={entry.id}><th scope="row">{KIND_LABEL[entry.kind]}</th><td>{compactDate(dayOf(entry.start_at))} {timeOf(entry.start_at)}{entry.start_accuracy === "estimated" ? "（推定）" : ""}</td><td>{compactDate(dayOf(entry.end_at))} {timeOf(entry.end_at)}{entry.end_accuracy === "estimated" ? "（推定）" : ""}</td><td><button type="button" onClick={() => onEdit(entry)} aria-label={`${KIND_LABEL[entry.kind]} ${entryLabel(entry)} 編集`}>編集</button></td></tr>)}</tbody></table>{!rows.length && <p>該当する記録はありません。</p>}</div></details>
  </section>;
}

export function AnalysisPanel({ entries, selected, loading, error, onSelect, onEdit }: {
  entries: SleepEntry[]; selected: string; loading: boolean; error: string;
  onSelect: (day: string, changeView?: boolean) => void; onEdit: (entry?: SleepEntry) => void;
}) {
  const [period, setPeriod] = useState<Period>("week");
  const today = dayOf(new Date());
  const range = useMemo(() => periodRange(selected || today, period), [selected, today, period]);
  const data = useMemo(() => analyze(entries, range, today), [entries, range, today]);
  const approximate = data.estimated ? "約" : "";
  const onDay = (day: string) => onSelect(day, true);
  const metricStyle = { "--metric-accent": "var(--doze)" } as CSSProperties;
  function move(offset: number) { onSelect(period === "week" ? shiftDay(selected, offset * 7) : shiftMonth(selected, offset)); }
  return <div className="analysis-page">
    <div className="section-heading"><div><p className="eyebrow">YOUR SLEEP PATTERNS</p><h1>眠りの分析</h1><p>記録を並べて、眠りの流れを見つける。</p></div><button type="button" className="button primary" onClick={() => onEdit()}><Icon name="plus" size={18} />睡眠を追加</button></div>
    <div className="analysis-controls"><div className="analysis-period" role="group" aria-label="分析する期間"><button type="button" aria-pressed={period === "week"} onClick={() => setPeriod("week")}>週間</button><button type="button" aria-pressed={period === "month"} onClick={() => setPeriod("month")}>月間</button></div><label className="analysis-date">基準日<input type="date" aria-label="分析の基準日" value={selected} onChange={event => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value) && !event.target.value.startsWith("0000")) onSelect(event.target.value); }} /></label><button type="button" className="today-button" onClick={() => onSelect(today)}>今日</button></div>
    <div className="analysis-range"><button type="button" className="icon-button" aria-label="前の分析期間" onClick={() => move(-1)}><Icon name="left" /></button><span>{dateLabel(range.first, true)} 〜 {dateLabel(shiftDay(range.until, -1))}</span><button type="button" className="icon-button" aria-label="次の分析期間" onClick={() => move(1)}><Icon name="right" /></button></div>
    {loading ? <div className="panel analysis-empty" role="status">分析する記録を読み込んでいます…</div> : error ? <div className="panel analysis-empty">記録を取得できなかったため、集計を表示できません。上の「もう一度読み込む」から再試行してください。</div> : <>
      <div className="analysis-metrics"><section className="analysis-metric primary-metric" aria-label="1日平均の睡眠時間"><span><Icon name="moon" size={17} />1日平均（記録日）</span><strong>{data.average === null ? "—" : `${approximate}${formatDuration(data.average)}`}</strong><small>{data.recordedDays ? `記録がある${data.recordedDays}日で計算` : "記録を追加すると表示されます"}</small></section><section className="analysis-metric" aria-label="期間の合計睡眠時間"><span><Icon name="clock" size={17} />期間の合計</span><strong>{data.recordedDays ? `${approximate}${formatDuration(data.minutes)}` : "—"}</strong><small>{period === "week" ? "月曜〜日曜" : "月の1日〜末日"}の記録</small></section><section className="analysis-metric" style={metricStyle} aria-label="昼寝と寝落ちの合計"><span><Icon name="sun" size={17} />昼寝＋寝落ち</span><strong>{data.recordedDays ? `${data.estimatedByKind.nap || data.estimatedByKind.doze ? "約" : ""}${formatDuration(data.napAndDoze)}` : "—"}</strong><small>この期間内に眠っていた時間</small></section><section className="analysis-metric" aria-label="記録日数"><span><Icon name="calendar" size={17} />記録のある日</span><strong>{data.recordedDays}<em>日</em></strong><small>経過{data.elapsedDays}日中・未記録{data.elapsedDays - data.recordedDays}日</small></section></div>
      <p className="analysis-method"><Icon name="info" size={15} />平均は記録がある日だけで計算し、未記録を0時間として扱いません。記録済みの日も入力途中の可能性があります。{range.first <= today && range.until > today && "今日の分も途中経過です。"}推定を含む時間には「約」を表示します。</p>
      <DailyChart data={data} selected={selected} onSelect={onDay} />
      <SleepTimeline entries={entries} data={data} selected={selected} onSelect={onDay} onEdit={onEdit} />
      <div className="analysis-two-column"><KindBreakdown data={data} /><DozeChart data={data} /></div>
      <TimeTrends entries={entries} range={range} selected={selected} onEdit={onEdit} />
    </>}
  </div>;
}
