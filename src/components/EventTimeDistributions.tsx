import { useMemo } from "react";
import { eventTimeDistribution, isKindFilter, KIND_FILTER_LABEL, matchesKind, type KindFilter, type PeriodRange } from "../lib/analytics";
import { KINDS, KIND_LABEL, type SleepEntry } from "../lib/sleep";
import { useDisplayPreference } from "../lib/display-preference";
import { KindFilterControl, useKindSwipe } from "./KindFilter";

export function EventTimeDistributions({ userId, entries, range }: { userId: string; entries: SleepEntry[]; range: PeriodRange }) {
  const [kind, setKind] = useDisplayPreference<KindFilter>(userId, "event-time-kind", "all", isKindFilter);
  const data = useMemo(() => eventTimeDistribution(entries, range, kind), [entries, range, kind]);
  const swipe = useKindSwipe(kind, setKind);
  const kinds = KINDS.filter(k => matchesKind(k, kind));
  return <section className="panel analysis-panel event-time-panel" aria-labelledby="event-time-title" {...swipe}>
    <div className="analysis-panel-heading"><div><h2 id="event-time-title">就寝・起床の時間帯</h2><p>期間内の就寝と起床を、それぞれ1件1回で集計します。</p></div><KindFilterControl label="時間帯の種類" value={kind} onChange={setKind} /></div>
    <p className="event-swipe-hint">左右のスワイプでも種類を切り替えられます。</p>
    <div className="event-time-charts">{(["start", "end"] as const).map(event => {
      const totals = data[event];
      const title = event === "start" ? "就寝の時間帯" : "起床の時間帯";
      const maximum = Math.max(1, ...totals.bins.map(bin => bin.count));
      return <section className={`event-time-chart ${event}`} key={event} aria-label={title}>
        <h3>{title}<span>{totals.total ? `${totals.total}回` : "記録なし"}</span></h3>
        <div className="event-kind-share" role="img" aria-label={`${title} ${KIND_FILTER_LABEL[kind]} ${totals.total}回。種類別の回数の割合`}>{totals.total > 0 && kinds.map(k => totals.byKind[k] > 0 && <i key={k} style={{ width: `${totals.byKind[k] / totals.total * 100}%`, background: `var(--${k})` }} />)}</div>
        <div className="event-kind-counts">{kinds.map(k => <span key={k}><i className={`dot ${k}`} />{KIND_LABEL[k]}<strong>{totals.byKind[k]}回</strong><small>{totals.total ? `${(totals.byKind[k] / totals.total * 100).toFixed(1)}%` : "—"}</small></span>)}</div>
        <div className="event-time-bins">{totals.bins.map(bin => <div className="event-time-bin" key={bin.first} aria-label={`${title} ${bin.first}〜${bin.until}時 ${bin.count}回`}>
          <span>{bin.first}〜{bin.until}時</span><div className="event-bin-track" aria-hidden="true"><div className="event-bin-stack" style={{ width: `${bin.count / maximum * 100}%` }}>{kinds.map(k => bin.byKind[k] > 0 && <i key={k} style={{ width: `${bin.byKind[k] / bin.count * 100}%`, background: `var(--${k})` }} />)}</div></div><strong>{totals.total ? `${bin.count}回` : "—"}</strong>
        </div>)}</div>
      </section>;
    })}</div>
    <p className="analysis-caption">割合は睡眠時間ではなく回数です。日付をまたぐ記録も、実際の就寝日・起床日に1回ずつ数えます。</p>
  </section>;
}
