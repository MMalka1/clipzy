/** Рисунки «от руки»: стрелки и галочки — неровные, как маркером по бумаге. */

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

export function HandArrow({
  kind = "curve",
  className = "",
  color = "currentColor",
}: {
  kind?: keyof typeof ARROWS;
  className?: string;
  color?: string;
}) {
  const box = kind === "loop" ? "0 0 100 92" : kind === "down" ? "0 0 36 64" : "0 0 110 50";
  return (
    <svg viewBox={box} className={className} fill="none" aria-hidden="true">
      <path d={ARROWS[kind]} stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d={HEADS[kind]} stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HandCheck({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M3.5 13.2 C 5.5 14.6, 7.4 16.8, 9 19.4 C 11.8 12.6, 15.6 7.4, 21 3.8"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Рукописная пометка */
export function Note({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-hand text-[22px] leading-tight ${className}`}>{children}</span>;
}
