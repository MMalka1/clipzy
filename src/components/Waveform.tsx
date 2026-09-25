/** Детерминированная «звуковая волна» для макетов (одинакова на сервере и клиенте). */
export function fakePeaks(count: number, seed = 7) {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  return Array.from({ length: count }, (_, i) => {
    const phrase = 0.55 + 0.45 * Math.sin(i / 5.3) * Math.sin(i / 17);
    const pause = i % 23 < 2 ? 0.15 : 1;
    const v = Math.max(0.08, Math.min(1, (0.35 + rand() * 0.65) * Math.abs(phrase) * pause));
    // Округляем, чтобы SSR и браузер дали одинаковую разметку
    return Math.round(v * 1000) / 1000;
  });
}

export default function Waveform({
  peaks,
  className = "",
  highlight,
}: {
  peaks: number[];
  className?: string;
  /** Диапазоны [начало, конец] в долях 0..1, которые подсвечиваются. */
  highlight?: [number, number][];
}) {
  const n = peaks.length;
  return (
    <svg viewBox={`0 0 ${n * 3} 40`} preserveAspectRatio="none" className={className} aria-hidden="true">
      {peaks.map((p, i) => {
        const x = i / n;
        const on = highlight?.some(([a, b]) => x >= a && x <= b);
        const h = Math.round(Math.max(1.5, p * 36) * 100) / 100;
        return (
          <rect
            key={i}
            x={i * 3}
            y={Math.round((20 - h / 2) * 100) / 100}
            width={1.8}
            height={h}
            rx={0.9}
            fill={on ? "var(--color-signal)" : "currentColor"}
          />
        );
      })}
    </svg>
  );
}
