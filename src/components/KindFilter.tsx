import { useRef, type TouchEvent } from "react";
import { KIND_FILTERS, KIND_FILTER_LABEL, type KindFilter } from "../lib/analytics";
import { Icon } from "./Icon";

export function useKindSwipe(value: KindFilter, onChange: (kind: KindFilter) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart(event: TouchEvent) {
      if ((event.target as Element).closest("select,button") || event.touches.length !== 1) { start.current = null; return; }
      start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    },
    onTouchEnd(event: TouchEvent) {
      const origin = start.current; start.current = null;
      const touch = event.changedTouches[0];
      if (!origin || !touch) return;
      const dx = touch.clientX - origin.x, dy = touch.clientY - origin.y;
      if (Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy) * 1.4) return;
      const next = Math.max(0, Math.min(KIND_FILTERS.length - 1, KIND_FILTERS.indexOf(value) + (dx < 0 ? 1 : -1)));
      if (KIND_FILTERS[next] !== value) onChange(KIND_FILTERS[next]);
    },
    onTouchCancel() { start.current = null; },
  };
}

export function KindFilterControl({ label, value, onChange }: { label: string; value: KindFilter; onChange: (kind: KindFilter) => void }) {
  const index = KIND_FILTERS.indexOf(value);
  return <div className="kind-filter-control">
    <button type="button" className="icon-button" aria-label={`${label}を前へ`} disabled={index === 0} onClick={() => onChange(KIND_FILTERS[index - 1])}><Icon name="left" size={17} /></button>
    <label className="chart-filter">種類<select aria-label={label} value={value} onChange={event => onChange(event.target.value as KindFilter)}>{KIND_FILTERS.map(kind => <option key={kind} value={kind}>{KIND_FILTER_LABEL[kind]}</option>)}</select></label>
    <button type="button" className="icon-button" aria-label={`${label}を次へ`} disabled={index === KIND_FILTERS.length - 1} onClick={() => onChange(KIND_FILTERS[index + 1])}><Icon name="right" size={17} /></button>
  </div>;
}
