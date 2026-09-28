import type { CSSProperties } from "react";

/** Рисунки «от руки»: стрелки и галочки — неровные, как маркером по бумаге.
 *  draw — линия рисуется при появлении, write — пометка «пишется» слева направо (только без reduced-motion). */

const ARROWS = {
  // вниз-влево, с петелькой
  loop: "M88 6 C 70 10, 58 24, 66 36 C 72 45, 86 40, 80 30 C 72 18, 44 26, 30 48 C 22 60, 18 70, 16 84",
  // плавная дуга вправо
  curve: "M6 40 C 30 8, 70 6, 102 30",
  // короткая вниз
  down: "M20 4 C 26 22, 24 40, 14 58",
} as const;

const HEADS = {
  loop: "M6 74 L16 86 L27 76",
  curve: "M88 18 L103 31 L86 37",
  down: "M6 46 L13 60 L26 52",
} as const;

const stroke = { stroke: "currentColor", strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function HandArrow({
  kind = "curve",
  className = "",
  color = "currentColor",
  draw = false,
  style,
}: {
  kind?: keyof typeof ARROWS;
  className?: string;
  color?: string;
  draw?: boolean;
  style?: CSSProperties;
}) {
  const box = kind === "loop" ? "0 0 100 92" : kind === "down" ? "0 0 36 64" : "0 0 110 50";
  return (
    <svg viewBox={box} className={`${draw ? "hand-draw " : ""}${className}`} style={style} fill="none" aria-hidden="true">
      <path d={ARROWS[kind]} pathLength={1} {...stroke} stroke={color} />
      <path d={HEADS[kind]} pathLength={1} {...stroke} stroke={color} />
    </svg>
  );
}

export function HandCheck({
  className = "h-5 w-5",
  draw = false,
  style,
}: {
  className?: string;
  draw?: boolean;
  style?: CSSProperties;
}) {
  return (
    <svg viewBox="0 0 24 24" className={`${draw ? "hand-draw " : ""}${className}`} style={style} fill="none" aria-hidden="true">
      <path d="M3.5 13.2 C 5.5 14.6, 7.4 16.8, 9 19.4 C 11.8 12.6, 15.6 7.4, 21 3.8" pathLength={1} {...stroke} />
    </svg>
  );
}

/** Плюсик от руки (раскрыть ответ в вопросах). */
export function HandPlus({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path d="M10 3 C 10.4 8, 9.6 12, 10 17" pathLength={1} {...stroke} strokeWidth={2.4} />
      <path d="M3 10.4 C 8 9.8, 12 10.2, 17 9.6" pathLength={1} {...stroke} strokeWidth={2.4} />
    </svg>
  );
}

/** Росчерк под подписью. */
export function HandLine({
  className = "h-3 w-40",
  draw = false,
  style,
}: {
  className?: string;
  draw?: boolean;
  style?: CSSProperties;
}) {
  return (
    <svg viewBox="0 0 180 12" className={`${draw ? "hand-draw " : ""}${className}`} style={style} fill="none" aria-hidden="true">
      <path d="M2 8 C 30 2, 60 12, 90 6 S 150 4, 178 8" pathLength={1} {...stroke} strokeWidth={2.4} />
    </svg>
  );
}

/** Рукописная пометка */
export function Note({
  children,
  className = "",
  write = false,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  write?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span className={`font-hand text-[22px] leading-tight ${write ? "note-write " : ""}${className}`} style={style}>
      {children}
    </span>
  );
}
