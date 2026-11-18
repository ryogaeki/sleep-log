import { useEffect, useRef } from "react";

export function useChartScroll(selected: string, days: string[], enabled = true) {
  const ref = useRef<HTMLDivElement>(null);
  const exact = days.indexOf(selected);
  const index = exact >= 0 ? exact : !days.length ? -1 : selected < days[0] ? 0 : days.length - 1;
  const count = days.length;
  const first = days[0];
  useEffect(() => {
    const viewport = ref.current;
    if (viewport && index >= 0 && enabled) viewport.scrollLeft = 40 + (viewport.scrollWidth - 40) * (index + 0.5) / count - viewport.clientWidth / 2;
  }, [index, count, first, enabled]);
  return ref;
}
