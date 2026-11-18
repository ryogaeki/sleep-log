export function SleepRing({ minutes }: { minutes: number }) {
  const first = Math.min(720, Math.max(0, minutes));
  const second = Math.min(720, Math.max(0, minutes - 720));
  return <svg className="calendar-sleep-ring" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle className="sleep-ring-track" cx="12" cy="12" r="9" />
    {first > 0 && <circle className="sleep-ring-first" cx="12" cy="12" r="9" pathLength="720" strokeDasharray={`${first} 720`} transform="rotate(-90 12 12)" />}
    {second > 0 && <circle className="sleep-ring-second" cx="12" cy="12" r="9" pathLength="720" strokeDasharray={`${second} 720`} transform="rotate(-90 12 12)" />}
  </svg>;
}
