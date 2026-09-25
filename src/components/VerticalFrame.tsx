import type { CSSProperties } from "react";
import { wordState } from "@/lib/captions";

/** Вертикальный кадр 9:16 с субтитром. Без людей — расфокусированная «студия». */
export default function VerticalFrame({
  words,
  active = -1,
  captionStyle = "beat",
  timecode,
  progress,
  className = "",
  captionClass = "text-[15px]",
  live = false,
  vars,
}: {
  words: string[];
  active?: number;
  captionStyle?: string;
  timecode?: string;
  progress?: number;
  className?: string;
  captionClass?: string;
  live?: boolean;
  /** CSS-переменные цвета субтитров (--cap-accent и т.д.) */
  vars?: CSSProperties;
}) {
  return (
    <div className={`frame-bg grain relative aspect-[9/16] overflow-hidden rounded-lg ${className}`}>
      {timecode && (
        <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[10px] text-white/85">
          {live && <span className="h-1.5 w-1.5 animate-blink rounded-full bg-rec" />}
          {timecode}
        </div>
      )}
      <div
        className={`cap cap-${captionStyle} absolute inset-x-2 top-[64%] z-10 -translate-y-1/2 ${captionClass}`}
        style={vars}
      >
        {words.map((w, i) => (
          <span key={i} className={wordState(i, active)}>
            {w}
          </span>
        ))}
      </div>
      {progress !== undefined && (
        <div className="absolute inset-x-0 bottom-0 z-10 h-[3px] bg-white/15">
          <div className="h-full bg-white transition-[width] duration-300 ease-linear" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}
