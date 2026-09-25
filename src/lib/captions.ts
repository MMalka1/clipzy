import type React from "react";

export type Word = { text: string; start: number; end: number; filler?: boolean; key?: boolean; p?: number };
export type Segment = { id: number; start: number; end: number; words: Word[] };

export const CAPTION_STYLES = [
  { id: "beat", name: "Бит" },
  { id: "box", name: "Плашка" },
  { id: "outline", name: "Контур" },
  { id: "karaoke", name: "Караоке" },
  { id: "minimal", name: "Минимал" },
  { id: "neon", name: "Неон" },
  { id: "comic", name: "Комикс" },
  { id: "typewriter", name: "Стикеры" },
  { id: "marker", name: "Маркер" },
  { id: "podcast", name: "Подкаст" },
  { id: "glass", name: "Стекло" },
  { id: "retro", name: "Ретро" },
  { id: "pop", name: "Одно слово" },
  { id: "mrbeast", name: "Жирный" },
  { id: "gradient", name: "Градиент" },
] as const;

export type CaptionStyleId = (typeof CAPTION_STYLES)[number]["id"];

/** Делит фразу на слова и равномерно раскладывает их по времени сегмента. */
export function buildSegment(id: number, text: string, start: number, end: number): Segment {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const step = tokens.length ? (end - start) / tokens.length : 0;
  return {
    id,
    start,
    end,
    words: tokens.map((t, i) => ({
      text: t,
      start: start + i * step,
      end: start + (i + 1) * step,
    })),
  };
}

export function segmentText(s: Segment) {
  return s.words.map((w) => w.text).join(" ");
}

/** Демо-расшифровка, пока бэкенд с Whisper не подключён. */
export const DEMO_LINES = [
  "Главная ошибка новичков в контенте",
  "они снимают длинные видео",
  "и никто их не досматривает",
  "а короткий клип с субтитрами",
  "досматривают гораздо чаще",
  "поэтому режьте эфиры на рилсы",
  "и выкладывайте каждый день",
];

export function demoSegments(duration: number): Segment[] {
  const len = Math.max(duration / DEMO_LINES.length, 1.5);
  return DEMO_LINES.map((line, i) => buildSegment(i, line, i * len, (i + 1) * len));
}

export function formatTime(t: number, withTenths = false) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const base = `${m}:${s.toString().padStart(2, "0")}`;
  return withTenths ? `${base}.${Math.floor((t % 1) * 10)}` : base;
}

/** Класс слова в субтитре относительно текущего индекса. */
export function wordState(i: number, active: number) {
  if (i === active) return "cap-w on";
  if (i < active) return "cap-w past";
  return "cap-w";
}

/** Палитра акцентов: подсветка слова, плашка, маркер, свечение. null — цвет стиля по умолчанию. */
export const ACCENTS: { name: string; value: string | null }[] = [
  { name: "Как в стиле", value: null },
  { name: "Жёлтый", value: "#FFD60A" },
  { name: "Лайм", value: "#B6FF3B" },
  { name: "Бирюзовый", value: "#22E5FF" },
  { name: "Розовый", value: "#FF3DCF" },
  { name: "Оранжевый", value: "#FF7A1A" },
  { name: "Красный", value: "#FF3B30" },
  { name: "Фиолетовый", value: "#9B6BFF" },
  { name: "Белый", value: "#FFFFFF" },
];

export const TEXT_COLORS: { name: string; value: string | null }[] = [
  { name: "Белый", value: null },
  { name: "Кремовый", value: "#FFF3D6" },
  { name: "Жёлтый", value: "#FFE14D" },
  { name: "Мятный", value: "#C8FFE9" },
];

function hexRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Тёмный или светлый текст поверх акцента — та же формула, что в движке. */
export function inkFor(hex: string) {
  const [r, g, b] = hexRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? "#111111" : "#FFFFFF";
}

/** CSS-переменные для блока субтитров. */
export function captionVars(accent: string | null, text: string | null): React.CSSProperties {
  const vars: Record<string, string> = {};
  if (accent) {
    vars["--cap-accent"] = accent;
    vars["--cap-ink"] = inkFor(accent);
    vars["--cap-glow2"] = `color-mix(in srgb, ${accent} 65%, #fff)`;
  }
  if (text) vars["--cap-text"] = text;
  return vars as React.CSSProperties;
}
