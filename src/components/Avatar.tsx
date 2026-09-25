/**
 * Аватарки-наклейки, нарисованные кодом. Без "use client": модуль нужен и серверу
 * (проверка значения `image` в auth.ts), и клиенту (меню, профиль).
 *
 * В базе выбор хранится в user.image как `preset:<id>`.
 * Приём «ризографа»: цветная заливка чуть сдвинута относительно чёрного контура — как печать с промахом.
 */

const K = "#0B0B0B";
const Y = "#F9DC0C";
const C = "#F4EFE6";
const W = "#FFFFFF";
const P = "#FF3DCF";
const CY = "#22E5FF";
const O = "#FF7A1A";
const L = "#B6FF3B";
const V = "#9B6BFF";

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Неровный овал: замкнутая кривая через слегка «дрожащие» точки. Детерминированно — одинаково на сервере и клиенте. */
const JITTER = [0.02, -0.025, 0.03, -0.01, 0.025, -0.03, 0.015, -0.02, 0.03, -0.015, 0.01, -0.025];
function blob(cx: number, cy: number, rx: number, ry: number, seed = 0, amount = 1) {
  const n = 10;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const j = 1 + JITTER[(i + seed) % JITTER.length] * amount;
    pts.push([cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j]);
  }
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d + "Z";
}

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

const rrect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;

/** Заливка со сдвигом + контур поверх. */
function Ink({ d, fill, dx = 2.2, dy = 1.8, sw }: { d: string; fill: string; dx?: number; dy?: number; sw?: number }) {
  return (
    <>
      <path d={d} fill={fill} stroke="none" transform={`translate(${dx} ${dy})`} />
      <path d={d} fill="none" strokeWidth={sw} />
    </>
  );
}

/** Сплошная заливка с контуром (для мелких деталей, где сдвиг выглядит грязно). */
const Solid = ({ d, fill, sw }: { d: string; fill: string; sw?: number }) => <path d={d} fill={fill} strokeWidth={sw} />;

/* ——— Глаза, рты, щёки ——— */

function Dot({ x, y, r = 3.6 }: { x: number; y: number; r?: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill={K} stroke="none" />
      <circle cx={x - r * 0.35} cy={y - r * 0.4} r={r * 0.32} fill={W} stroke="none" />
    </>
  );
}

function BigEye({ x, y, r = 6.5, lookX = 0, lookY = 0 }: { x: number; y: number; r?: number; lookX?: number; lookY?: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill={W} strokeWidth={2.4} />
      <circle cx={x + lookX} cy={y + lookY} r={r * 0.5} fill={K} stroke="none" />
      <circle cx={x + lookX - r * 0.18} cy={y + lookY - r * 0.2} r={r * 0.16} fill={W} stroke="none" />
    </>
  );
}

const Blush = ({ x, y, color = P }: { x: number; y: number; color?: string }) => (
  <ellipse cx={x} cy={y} rx={5.2} ry={3} fill={color} stroke="none" opacity={0.75} />
);

/** Диагональные полоски хлопушки. */
function Stripes({ x, y, w, h, n, color }: { x: number; y: number; w: number; h: number; n: number; color: string }) {
  const step = w / n;
  return (
    <>
      {Array.from({ length: n }, (_, i) =>
        i % 2 ? null : (
          <path
            key={i}
            d={`M${r1(x + i * step + step * 0.5)} ${y}h${r1(step)}l${r1(-step * 0.5)} ${h}h${r1(-step)}Z`}
            fill={color}
            stroke="none"
          />
        ),
      )}
    </>
  );
}

/* ——— Персонажи ——— */

/** only — аватарка только для этого плана (например, «Создатель» — только creator) */
type Def = { id: string; bg: string; art: React.ReactNode; only?: string };

/** Четырёхлучевая искра */
const spark = (x: number, y: number, r: number) =>
  `M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`;

const HEAD = blob(50, 54, 28, 29, 0);

const DEFS: Def[] = [
  {
    // «Создатель» — только для плана creator: корона, тёмные очки, искры на чёрном
    id: "creator",
    bg: K,
    only: "creator",
    art: (
      <>
        <path d={spark(16, 30, 6)} fill={Y} stroke="none" />
        <path d={spark(84, 24, 4.5)} fill={Y} stroke="none" />
        <path d={spark(85, 70, 3.5)} fill={C} stroke="none" />
        <path d={spark(15, 72, 3)} fill={C} stroke="none" />
        {/* голова: оранжевая «тень печати» и кремовый контур — на чёрном фоне обычный контур не виден */}
        <path d={blob(50, 58, 26, 27, 3)} fill={O} stroke="none" transform="translate(2.6 2.2)" />
        <path d={blob(50, 58, 26, 27, 3)} fill={Y} stroke={C} strokeWidth={2.6} />
        {/* корона */}
        <path d="M29 37 L27 17 L39 27 L50 11 L61 27 L73 17 L71 37 Z" fill={Y} stroke={C} strokeWidth={2.6} strokeLinejoin="round" />
        <path d="M29 37 H71" stroke={C} strokeWidth={2.6} />
        <circle cx={50} cy={27} r={3.2} fill={P} stroke={K} strokeWidth={1.6} />
        <circle cx={38.5} cy={31} r={2.3} fill={CY} stroke={K} strokeWidth={1.4} />
        <circle cx={61.5} cy={31} r={2.3} fill={L} stroke={K} strokeWidth={1.4} />
        {/* тёмные очки с бликом */}
        <path d="M30 51 H48 V55 C48 60.5 44.5 63 39.5 63 C34 63 30 59.5 30 55 Z" fill={K} strokeWidth={2} />
        <path d="M52 51 H70 V55 C70 60.5 66.5 63 61.5 63 C56 63 52 60.5 52 55 Z" fill={K} strokeWidth={2} />
        <path d="M48 53 Q50 51.5 52 53" strokeWidth={2.4} />
        <path d="M33.5 55.5 L37.5 52.5 M55.5 55.5 L59.5 52.5" stroke={W} strokeWidth={1.8} />
        {/* ухмылка */}
        <path d="M42 72 Q51 77 60 69" />
      </>
    ),
  },
  {
    id: "sunny",
    bg: CY,
    art: (
      <>
        <path d="M45 27 Q43 18 36 15 M50 26 Q51 16 47 10 M55 27 Q58 19 65 17" strokeWidth={3} />
        <Ink d={HEAD} fill={Y} />
        <Dot x={40} y={50} />
        <Dot x={60} y={50} />
        <path d="M37 60 Q50 78 63 60 Z" fill={K} />
        <path d="M44 67.5 Q50 63.5 56 67.5 Q50 72.5 44 67.5 Z" fill={P} stroke="none" />
        <Blush x={31} y={60} />
        <Blush x={69} y={60} />
      </>
    ),
  },
  {
    id: "shades",
    bg: P,
    art: (
      <>
        <Ink d={HEAD} fill={C} />
        <Ink d="M22 50 C18 28 32 16 52 17 C70 18 82 30 78 50 C72 38 62 32 50 33 C38 33 28 40 22 50 Z" fill={K} dx={0} dy={0} />
        <path d="M36 24 C42 12 58 8 70 16 C62 16 54 18 50 24" fill={K} />
        <path d="M27 45 H47 V50 C47 56 43 59 37.5 59 C31 59 27 55 27 50 Z" fill={K} strokeWidth={2} />
        <path d="M53 45 H73 V50 C73 56 69 59 63.5 59 C58 59 53 56 53 50 Z" fill={K} strokeWidth={2} />
        <path d="M47 47 Q50 45.5 53 47" strokeWidth={2.4} />
        <path d="M31 50 L35 47 M57 50 L61 47" stroke={W} strokeWidth={1.8} />
        <path d="M43 69 Q52 72 61 64" />
      </>
    ),
  },
  {
    id: "beanie",
    bg: L,
    art: (
      <>
        <Ink d={blob(50, 57, 28, 27, 3)} fill={C} />
        <Ink d="M21 45 C21 24 34 13 50 13 C66 13 79 24 79 45 Z" fill={O} />
        <Ink d={rrect(17, 39, 66, 12, 6)} fill={O} dx={1.5} dy={1.2} />
        <path d="M25 42 V48 M32 42 V48 M39 42 V48 M46 42 V48 M53 42 V48 M60 42 V48 M67 42 V48 M74 42 V48" strokeWidth={1.6} />
        <Solid d={blob(50, 11, 7.5, 7, 5, 2)} fill={Y} />
        <path d="M35 61 Q40 65.5 45 61 M55 61 Q60 65.5 65 61" />
        <ellipse cx={50} cy={72} rx={3} ry={3.6} fill={K} />
        <Blush x={31} y={68} />
        <Blush x={69} y={68} />
      </>
    ),
  },
  {
    id: "cap",
    bg: V,
    art: (
      <>
        <Ink d={HEAD} fill={Y} />
        <Ink d="M70 40 C80 36 92 37 97 43 C90 47 80 47 70 45 Z" fill={CY} dx={1.5} dy={1.2} />
        <Ink d="M21 44 C20 24 34 14 50 14 C66 14 80 24 79 44 C66 40 34 40 21 44 Z" fill={CY} />
        <path d="M50 15 V40" strokeWidth={1.6} />
        <circle cx={50} cy={14} r={2.6} fill={CY} strokeWidth={1.8} />
        <path d="M34 47 Q39 44 45 47" strokeWidth={2.6} />
        <path d="M55 45 Q61 41 66 44" strokeWidth={2.6} />
        <Dot x={40} y={54} r={3.3} />
        <Dot x={60} y={53} r={3.3} />
        <path d="M37 63 Q50 80 63 63 Z" fill={K} />
        <path d="M44 63.5 H56 V68 Q53 69 50 68.5 Q47 69 44 68 Z" fill={W} stroke="none" />
        <path d="M50 64 V68" strokeWidth={1.4} />
      </>
    ),
  },
  {
    id: "mustache",
    bg: O,
    art: (
      <>
        <Ink d={HEAD} fill={C} />
        <path d="M42 27 Q46 20 53 22 M49 26 Q53 20 59 23" strokeWidth={2.4} />
        <path d="M31 40 Q38 35 46 39 M54 39 Q62 35 69 40" strokeWidth={3.6} />
        <circle cx={39} cy={50} r={7.5} fill={W} strokeWidth={2.6} />
        <circle cx={61} cy={50} r={7.5} fill={W} strokeWidth={2.6} />
        <path d="M46.5 49 Q50 46.5 53.5 49" strokeWidth={2.4} />
        <circle cx={40} cy={51} r={2.4} fill={K} stroke="none" />
        <circle cx={62} cy={51} r={2.4} fill={K} stroke="none" />
        <path d="M49 55 Q45 61 51 62" strokeWidth={2.4} />
        <path
          d="M50 64 C45 60 37 60 33 65 C31 68 26.5 68 25.5 64.5 C27 72 36 73 42 69 C46 67 49 67 50 66 C51 67 54 67 58 69 C64 73 73 72 74.5 64.5 C73.5 68 69 68 67 65 C63 60 55 60 50 64 Z"
          fill={K}
          strokeWidth={1.5}
        />
      </>
    ),
  },
  {
    id: "curly",
    bg: Y,
    art: (
      <>
        {[
          [25, 44, 10],
          [26, 30, 10],
          [36, 21, 10],
          [50, 17, 10],
          [64, 21, 10],
          [74, 30, 10],
          [75, 44, 10],
        ].map(([x, y, r], i) => (
          <Solid key={i} d={blob(x, y, r, r, i, 2)} fill={V} />
        ))}
        <Ink d={HEAD} fill={P} />
        {[
          [36, 30, 8],
          [50, 27, 8.5],
          [64, 30, 8],
        ].map(([x, y, r], i) => (
          <Solid key={i} d={blob(x, y, r, r, i + 4, 2)} fill={V} />
        ))}
        <BigEye x={40} y={52} lookX={-1.4} lookY={-1.2} />
        <BigEye x={60} y={52} lookX={-1.4} lookY={-1.2} />
        <path d="M33 47 L30 44.5 M33.5 50 L29.5 49.5 M67 47 L70 44.5 M66.5 50 L70.5 49.5" strokeWidth={2} />
        <path d="M44 66 Q50 71.5 56 66" />
        <Blush x={31} y={62} color={O} />
        <Blush x={69} y={62} color={O} />
      </>
    ),
  },
  {
    id: "bun",
    bg: C,
    art: (
      <>
        <Solid d={blob(50, 15, 10, 9.5, 2, 2)} fill={K} />
        <Ink d={HEAD} fill={Y} />
        <Ink d="M22 50 C20 30 34 21 50 21 C66 21 80 30 78 50 C72 39 62 33 50 33 C39 33 29 39 22 50 Z" fill={K} dx={0} dy={0} />
        <path d={rrect(43, 21.5, 14, 5, 2.5)} fill={P} strokeWidth={1.8} />
        <Dot x={40} y={54} />
        <path d="M55 54 Q60 49.5 65 54" />
        <path d="M42 64 Q50 70 58 64" />
        <path d="M46.5 66.5 Q46 75 51 75 Q56 75 54.5 66.5" fill={P} strokeWidth={2.4} />
        <Blush x={31} y={63} color={P} />
        <Blush x={69} y={63} color={P} />
      </>
    ),
  },
  {
    id: "podcaster",
    bg: K,
    art: (
      <>
        <Ink d={HEAD} fill={Y} />
        <path d="M21 52 C18 20 82 20 79 52" stroke={C} strokeWidth={5} />
        <Solid d={rrect(13, 43, 13, 22, 5)} fill={P} sw={2.4} />
        <Solid d={rrect(74, 43, 13, 22, 5)} fill={P} sw={2.4} />
        <path d="M34 49 Q39 44.5 44 49 M56 49 Q61 44.5 66 49" />
        <ellipse cx={46} cy={65} rx={5.5} ry={6} fill={K} />
        <ellipse cx={46} cy={67.5} rx={3} ry={2.2} fill={P} stroke="none" />
        <path d="M68 97 L62 81" stroke={C} strokeWidth={4} />
        <Ink d={rrect(53, 63, 16, 20, 8)} fill={C} dx={1.5} dy={1.2} sw={2.6} />
        <path d="M56 70 H66 M56 75 H66" strokeWidth={1.4} />
        <Blush x={30} y={60} />
      </>
    ),
  },
  {
    id: "camera",
    bg: P,
    art: (
      <>
        <Ink d={rrect(25, 25, 19, 12, 3)} fill={C} dx={1.5} dy={1.2} />
        <Ink d={rrect(14, 33, 72, 48, 10)} fill={C} />
        <path d={rrect(66, 38, 13, 7, 2)} fill={Y} strokeWidth={2} />
        <circle cx={23} cy={41} r={3.2} fill={O} strokeWidth={1.6} />
        <circle cx={50} cy={60} r={18} fill={K} />
        <circle cx={50} cy={60} r={12} fill={CY} strokeWidth={2.4} />
        <circle cx={51.5} cy={61} r={6} fill={K} stroke="none" />
        <circle cx={46} cy={55} r={2.6} fill={W} stroke="none" />
        <path d="M38 38.5 Q50 33 62 38.5" strokeWidth={3.2} />
      </>
    ),
  },
  {
    id: "clapper",
    bg: Y,
    art: (
      <>
        <Ink d={rrect(17, 44, 66, 42, 5)} fill={K} dx={0} dy={0} />
        <path d={rrect(17, 44, 66, 10, 2)} fill={C} />
        <Stripes x={17} y={44} w={66} h={10} n={9} color={K} />
        <path d={rrect(17, 44, 66, 10, 2)} fill="none" />
        <g transform="rotate(-16 19 42)">
          <path d={rrect(17, 31, 66, 10, 2)} fill={C} />
          <Stripes x={17} y={31} w={66} h={10} n={9} color={K} />
          <path d={rrect(17, 31, 66, 10, 2)} fill="none" />
        </g>
        <circle cx={19} cy={42.5} r={2.6} fill={Y} strokeWidth={1.8} />
        <circle cx={38} cy={64} r={4.5} fill={C} stroke="none" />
        <circle cx={62} cy={64} r={4.5} fill={C} stroke="none" />
        <circle cx={39.2} cy={65} r={2.2} fill={K} stroke="none" />
        <circle cx={63.2} cy={65} r={2.2} fill={K} stroke="none" />
        <path d="M40 74 Q50 82 60 74" stroke={C} strokeWidth={3} />
        <Blush x={29} y={73} />
        <Blush x={71} y={73} />
      </>
    ),
  },
  {
    id: "cat",
    bg: L,
    art: (
      <>
        <Ink d="M21 50 L23 16 L45 33 Z" fill={O} />
        <Ink d="M79 50 L77 16 L55 33 Z" fill={O} />
        <path d="M27 38 L27.5 24 L38 32 Z M73 38 L72.5 24 L62 32 Z" fill={P} stroke="none" />
        <Ink d={blob(50, 57, 30, 26, 2)} fill={O} />
        <path d="M50 33 V39 M43.5 34 L45 39.5 M56.5 34 L55 39.5" strokeWidth={2.4} />
        <ellipse cx={39} cy={54} rx={5.5} ry={6.5} fill={Y} strokeWidth={2.4} />
        <ellipse cx={61} cy={54} rx={5.5} ry={6.5} fill={Y} strokeWidth={2.4} />
        <ellipse cx={39} cy={54} rx={1.7} ry={4.6} fill={K} stroke="none" />
        <ellipse cx={61} cy={54} rx={1.7} ry={4.6} fill={K} stroke="none" />
        <path d="M46.5 63 H53.5 L50 67 Z" fill={P} strokeWidth={2} />
        <path d="M43.5 69 Q47 73 50 68.5 Q53 73 56.5 69" strokeWidth={2.4} />
        <path d="M14 61 L32 64 M15 70 L32 68 M86 61 L68 64 M85 70 L68 68" strokeWidth={1.8} />
      </>
    ),
  },
  {
    id: "fox",
    bg: V,
    art: (
      <>
        <Ink d="M20 45 L17 11 L43 31 Z" fill={O} />
        <Ink d="M80 45 L83 11 L57 31 Z" fill={O} />
        <path d="M24 36 L22.5 19 L35 29 Z M76 36 L77.5 19 L65 29 Z" fill={K} stroke="none" />
        <Ink d="M16 40 C24 30 38 28 50 32 C62 28 76 30 84 40 C82 62 66 82 50 86 C34 82 18 62 16 40 Z" fill={O} />
        <path d="M18 48 C28 62 42 62 50 70 C58 62 72 62 82 48 C78 68 64 84 50 86 C36 84 22 68 18 48 Z" fill={C} strokeWidth={2.4} />
        <path d="M32 50 Q39 44 46 50 Q39 54 32 50 Z" fill={K} strokeWidth={1.6} />
        <path d="M54 50 Q61 44 68 50 Q61 54 54 50 Z" fill={K} strokeWidth={1.6} />
        <circle cx={40.5} cy={49} r={1.2} fill={W} stroke="none" />
        <circle cx={62.5} cy={49} r={1.2} fill={W} stroke="none" />
        <ellipse cx={50} cy={72} rx={4.5} ry={3.3} fill={K} />
        <path d="M50 75.5 Q51 79 56 78" strokeWidth={2.2} />
      </>
    ),
  },
  {
    id: "robot",
    bg: O,
    art: (
      <>
        <path d="M50 27 V14" strokeWidth={3} />
        <Solid d={circle(50, 12, 5)} fill={Y} sw={2.6} />
        <Solid d={rrect(12, 46, 10, 16, 3)} fill={C} sw={2.4} />
        <Solid d={rrect(78, 46, 10, 16, 3)} fill={C} sw={2.4} />
        <Ink d={rrect(20, 26, 60, 56, 13)} fill={CY} />
        <path d={rrect(28, 39, 44, 19, 9.5)} fill={K} />
        <path d={rrect(35, 44, 9, 9, 2.5)} fill={Y} stroke="none" />
        <path d={rrect(56, 44, 9, 9, 2.5)} fill={Y} stroke="none" />
        <path d={rrect(37, 65, 26, 9, 2.5)} fill={C} strokeWidth={2.4} />
        <path d="M43.5 65 V74 M50 65 V74 M56.5 65 V74" strokeWidth={1.6} />
        <circle cx={27} cy={32.5} r={1.6} fill={K} stroke="none" />
        <circle cx={73} cy={32.5} r={1.6} fill={K} stroke="none" />
        <circle cx={29} cy={69} r={3.4} fill={P} stroke="none" opacity={0.85} />
        <circle cx={71} cy={69} r={3.4} fill={P} stroke="none" opacity={0.85} />
      </>
    ),
  },
  {
    id: "alien",
    bg: K,
    art: (
      <>
        <path d="M39 22 Q33 12 25 10 M61 22 Q67 12 75 10" stroke={L} strokeWidth={3} />
        <circle cx={24} cy={10} r={4.5} fill={P} stroke="none" />
        <circle cx={76} cy={10} r={4.5} fill={P} stroke="none" />
        <Ink d="M50 17 C74 17 85 34 81 52 C77 70 63 87 50 87 C37 87 23 70 19 52 C15 34 26 17 50 17 Z" fill={L} />
        <path d="M25 47 C29 38 42 40 46 51 C43 58 30 58 25 47 Z" fill={K} />
        <path d="M75 47 C71 38 58 40 54 51 C57 58 70 58 75 47 Z" fill={K} />
        <ellipse cx={34} cy={47.5} rx={2.6} ry={1.9} fill={W} stroke="none" />
        <ellipse cx={66} cy={47.5} rx={2.6} ry={1.9} fill={W} stroke="none" />
        <path d="M45 72 Q50 76 55 72" strokeWidth={2.6} />
        <circle cx={60} cy={28} r={2.6} fill={Y} stroke="none" opacity={0.9} />
        <circle cx={66} cy={33} r={1.6} fill={Y} stroke="none" opacity={0.9} />
      </>
    ),
  },
  {
    id: "punk",
    bg: C,
    art: (
      <>
        <Ink d="M35 34 L28 7 L41 22 L46 2 L52 20 L61 4 L60 23 L72 11 L66 34 Z" fill={P} />
        <Ink d={HEAD} fill={Y} />
        <path d="M32 42 L45 46.5 M68 42 L55 46.5" strokeWidth={3.4} />
        <Dot x={40} y={52} r={3.3} />
        <Dot x={60} y={52} r={3.3} />
        <path d="M50 54 Q46 60 51 61.5" strokeWidth={2.4} />
        <path d="M48.8 62 A2.6 2.6 0 1 0 53.8 62.5" stroke={CY} strokeWidth={2} />
        <path d="M38 69 Q45 73 52 70 Q58 68 63 64" />
        <circle cx={22.5} cy={60} r={2.6} fill={CY} strokeWidth={1.4} />
      </>
    ),
  },
  {
    id: "phone",
    bg: CY,
    art: (
      <g transform="rotate(-9 50 52)">
        <Ink d={rrect(27, 10, 46, 84, 10)} fill={K} dx={0} dy={0} />
        <path d={rrect(31.5, 16, 37, 72, 5.5)} fill={Y} stroke="none" />
        <path d={rrect(44, 18.5, 12, 3.5, 1.75)} fill={K} stroke="none" />
        <Dot x={43} y={42} r={3.2} />
        <Dot x={57} y={42} r={3.2} />
        <path d="M42 52 Q50 60 58 52" />
        <path d={rrect(36, 68, 15, 6, 2)} fill={K} stroke="none" />
        <path d={rrect(53, 68, 11, 6, 2)} fill={P} stroke="none" />
        <path d={rrect(40, 77, 20, 4, 2)} fill={K} stroke="none" opacity={0.35} />
      </g>
    ),
  },
];

const BY_ID = new Map(DEFS.map((d) => [d.id, d]));

/** Аватарки для всех — в порядке показа. */
export const AVATARS: readonly string[] = DEFS.filter((d) => !d.only).map((d) => d.id);

/** Аватарки, доступные плану: общие + эксклюзивные (у creator — «Создатель» первым). */
export function avatarsFor(plan?: string | null): string[] {
  return [...DEFS.filter((d) => d.only && d.only === plan).map((d) => d.id), ...AVATARS];
}

/** Можно ли этому плану поставить аватарку id (эксклюзивные — только своему плану). */
export function avatarAllowed(id: string, plan?: string | null) {
  const d = BY_ID.get(id);
  return Boolean(d) && (!d!.only || d!.only === plan);
}

export const PRESET_PREFIX = "preset:";
export const isAvatarId = (v: unknown): v is string => typeof v === "string" && BY_ID.has(v);
export const presetImage = (id: string) => `${PRESET_PREFIX}${id}`;

/** Разбор user.image: своя аватарка, фото по ссылке или ничего. */
export function parseUserImage(image: string | null | undefined): { preset: string } | { url: string } | null {
  if (!image) return null;
  if (image.startsWith(PRESET_PREFIX)) {
    const id = image.slice(PRESET_PREFIX.length);
    return isAvatarId(id) ? { preset: id } : null;
  }
  return /^https?:\/\//i.test(image) ? { url: image } : null;
}

/** Первая буква имени (или почты) — запасной вариант, когда аватарка не выбрана. */
export function initialOf(name?: string | null, email?: string | null) {
  return ((name || "").trim() || (email || "").trim() || "?")[0].toUpperCase();
}

/**
 * Аватарка по id. Без id (или с неизвестным) — жёлтый круг с первой буквой `initial`.
 * title — подпись для скринридеров; без неё картинка декоративная.
 */
export default function Avatar({
  id,
  size = 40,
  initial = "?",
  title,
  className = "",
}: {
  id?: string | null;
  size?: number;
  initial?: string;
  title?: string;
  className?: string;
}) {
  const def = id ? BY_ID.get(id) : undefined;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`shrink-0 overflow-hidden rounded-full ${className}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {def ? (
        <>
          <circle cx={50} cy={50} r={50} fill={def.bg} />
          <g fill="none" stroke={K} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            {def.art}
          </g>
          {/* Кант наклейки: светлые фоны не теряются на бумаге */}
          <circle cx={50} cy={50} r={48.6} fill="none" stroke={K} strokeWidth={2.8} />
        </>
      ) : (
        <>
          <circle cx={50} cy={50} r={50} fill={Y} />
          <circle cx={50} cy={50} r={48.6} fill="none" stroke={K} strokeWidth={2.8} />
          <text
            x={50}
            y={52}
            textAnchor="middle"
            dominantBaseline="central"
            fill={K}
            fontSize={initial.length > 1 ? 40 : 52}
            fontWeight={700}
            fontFamily="var(--font-onest), ui-sans-serif, system-ui, sans-serif"
          >
            {initial}
          </text>
        </>
      )}
    </svg>
  );
}

/**
 * Аватарка пользователя из user.image: выбранная наклейка, иначе фото (Google/Telegram), иначе буква.
 */
export function UserAvatar({
  image,
  name,
  email,
  size = 40,
  title,
  className = "",
}: {
  image?: string | null;
  name?: string | null;
  email?: string | null;
  size?: number;
  title?: string;
  className?: string;
}) {
  const parsed = parseUserImage(image);
  if (parsed && "url" in parsed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={parsed.url}
        alt={title ?? ""}
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className={`shrink-0 rounded-full bg-signal object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <Avatar
      id={parsed && "preset" in parsed ? parsed.preset : null}
      size={size}
      initial={initialOf(name, email)}
      title={title}
      className={className}
    />
  );
}
