import Link from "next/link";
import { ICON_Z, STICKER, WORDMARK, WORDMARK_CLIP, WORDMARK_PLAY, WORDMARK_ZY_LETTERS } from "./brand-paths";

/**
 * «zy», «play» и плейхед — отдельными слоями: внутри ссылки с классом logo-hover на наведении логотип
 * проигрывается как заставка «clip → clipzy» (анимация — в globals.css, .lz-*).
 */
function Animated({ zy }: { zy: string }) {
  return (
    <>
      <path className="lz-zy" d={WORDMARK_ZY_LETTERS} fill={zy} fillRule="evenodd" />
      <path className="lz-play" d={WORDMARK_PLAY} fill={zy} fillRule="evenodd" />
      <g className="lz-head">
        <rect x={-90} width={90} height={STICKER.h} fill="#F9DC0C" opacity={0.28} />
        <rect x={-3} width={6} height={STICKER.h} fill="#F9DC0C" />
      </g>
    </>
  );
}

/** Надпись clipzy: «clip» цветом текста (currentColor), «zy» — фирменный жёлтый. */
export function Wordmark({ className = "h-6" }: { className?: string }) {
  return (
    <svg
      viewBox={`${WORDMARK.x} ${WORDMARK.y} ${WORDMARK.w} ${WORDMARK.h}`}
      className={`w-auto ${className}`}
      role="img"
      aria-label="clipzy"
    >
      <path d={WORDMARK_CLIP} fill="currentColor" fillRule="evenodd" />
      <Animated zy="#F9DC0C" />
    </svg>
  );
}

/** Значок: жёлтая Z с «play» на чёрном. */
export function LogoIcon({ className = "h-8 w-8" }: { className?: string }) {
  const k = (100 * 0.62) / ICON_Z.side;
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <rect width="100" height="100" rx="22" fill="#0B0B0B" />
      <path
        d={ICON_Z.d}
        fill="#F9DC0C"
        fillRule="evenodd"
        transform={`translate(${50 - ICON_Z.cx * k} ${50 - ICON_Z.cy * k}) scale(${k})`}
      />
    </svg>
  );
}

/** Логотип-наклейка целиком, как в исходнике: чёрная плашка, кремовый «clip», жёлтый «zy». */
export function Sticker({ className = "h-9", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox={`0 0 ${STICKER.w} ${STICKER.h}`}
      className={`w-auto ${className}`}
      style={style}
      role="img"
      aria-label="clipzy"
    >
      <rect width={STICKER.w} height={STICKER.h} rx={STICKER.rx} fill="#0B0B0B" />
      <path d={WORDMARK_CLIP} fill="#F4EFE6" fillRule="evenodd" />
      <Animated zy="#F9DC0C" />
    </svg>
  );
}

/** Логотип-ссылка на главную. label — переведённая подпись для скринридеров (по умолчанию нейтральная). */
export default function Logo({ size = "md", label = "Clipzy" }: { size?: "sm" | "md"; label?: string }) {
  return (
    <Link
      href="/"
      aria-label={label}
      className="logo-hover inline-flex shrink-0 transition-transform hover:-rotate-2"
    >
      <Sticker className={size === "sm" ? "h-7" : "h-8 sm:h-10"} />
    </Link>
  );
}
