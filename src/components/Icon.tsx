import type { CSSProperties } from "react";
const paths = {
  moon: ["M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"],
  sun: ["M12 3V1m0 22v-2M3 12H1m22 0h-2M4.2 4.2l1.5 1.5m12.6 12.6 1.5 1.5M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5", "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"],
  calendar: ["M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2ZM7 2v4m10-4v4M3 10h18m-14 4h2m3 0h2m3 0h1m-11 4h2m3 0h2"],
  plus: ["M12 5v14M5 12h14"],
  left: ["m14 6-6 6 6 6"], right: ["m10 6 6 6-6 6"],
  close: ["m6 6 12 12M18 6 6 18"],
  check: ["m5 12 4 4L19 6"],
  download: ["M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"],
  upload: ["M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"],
  settings: ["M4 6h16M4 12h16M4 18h16M9 3v6m6 0v6m-5 0v6"],
  logout: ["M9 4H4v16h5m5-12 4 4-4 4M8 12h13"],
  cloud: ["M7 18a5 5 0 1 1 .5-9.9 6 6 0 0 1 11.8 1.6A4.2 4.2 0 0 1 18 18Z"],
  refresh: ["M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 19.8 11M4.2 13A8 8 0 0 0 17.9 17.9"],
  info: ["M12 11v6m0-10v.1", "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z"],
  spark: ["m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7Z"],
  trash: ["M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"],
  pencil: ["m15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z"],
  clock: ["M12 6v6l4 2", "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z"],
  github: ["M9 19c-5 1-5-2-7-2m14 5v-3.9c0-1.1-.4-1.8-1-2.2 3.3-.4 6.8-1.6 6.8-7.2 0-1.6-.6-2.8-1.5-3.8.2-.4.7-1.8-.2-3.8 0 0-1.2-.4-4 1.5a13.9 13.9 0 0 0-7.3 0c-2.8-1.9-4-1.5-4-1.5-.9 2-.4 3.4-.2 3.8C1.7 6.9 1 8.1 1 9.7c0 5.6 3.5 6.8 6.8 7.2-.4.4-.8 1-.9 1.9V22"],
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 20, style, className = "" }: { name: IconName; size?: number; style?: CSSProperties; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>{paths[name].map((d,i) => <path key={i} d={d} />)}</svg>;
}
