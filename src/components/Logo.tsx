import Link from "next/link";
import { ICON_Z, STICKER, WORDMARK, WORDMARK_CLIP, WORDMARK_ZY } from "./brand-paths";

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
      <path d={WORDMARK_ZY} fill="#F9DC0C" fillRule="evenodd" />
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
      <path d={WORDMARK_ZY} fill="#F9DC0C" fillRule="evenodd" />
    </svg>
  );
}

/** Логотип-ссылка на главную. label — переведённая подпись для скринридеров (по умолчанию нейтральная). */
export default function Logo({ size = "md", label = "Clipzy" }: { size?: "sm" | "md"; label?: string }) {
  return (
    <Link
      href="/"
      aria-label={label}
      className="inline-flex shrink-0 transition-transform hover:-rotate-2"
    >
      <Sticker className={size === "sm" ? "h-7" : "h-8 sm:h-10"} />
    </Link>
  );
}
