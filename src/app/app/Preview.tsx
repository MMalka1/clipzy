"use client";

import { type CSSProperties, type RefObject, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { Sticker } from "@/components/Logo";
import type { Panel, Phrase } from "@/lib/engine";
import { wordState } from "@/lib/captions";
import { useLocale } from "@/i18n/client";
import inspector from "@/i18n/dict/inspector";

/**
 * Превью строится в «координатах» кадра, где короткая сторона — 340 (у 9:16 это 340×604), и масштабируется
 * под контейнер. У всех форматов короткая сторона 1080, поэтому K одинаковый и размер текста совпадает с движком.
 */
export const PREVIEW_W = 340;
const K = PREVIEW_W / 1080; // пиксели видео → пиксели превью
/** Ширина превью в его координатах для кадра canvas (для расчёта масштаба в редакторе) */
export const previewWidth = (canvas: { w: number; h: number }) => canvas.w * K;

/** Видео так, чтобы в контейнер попало окно исходника p (доли кадра) — как crop в движке. */
function panelStyle(p: Panel): CSSProperties {
  return {
    position: "absolute",
    maxWidth: "none",
    objectFit: "fill",
    width: `${100 / p.w}%`,
    height: `${100 / p.h}%`,
    left: `${(-p.x / p.w) * 100}%`,
    top: `${(-p.y / p.h) * 100}%`,
  };
}

/** Куда поставить хук (px кадра высотой canvasH), чтобы он не закрыл лицо. Та же формула — hook_top в captions_render.py. */
function hookTop(blockH: number, faceY: number | null, captionY: number, canvasH: number) {
  const TOP = Math.round(canvasH * 0.13);
  const MIN_TOP = Math.round(canvasH * 0.0625);
  if (faceY == null) return TOP;
  const f0 = (faceY - 0.12) * canvasH;
  const f1 = (faceY + 0.12) * canvasH;
  if (TOP + blockH <= f0 || TOP >= f1) return TOP;
  const above = f0 - 36 - blockH;
  if (above >= MIN_TOP) return above;
  const below = f1 + 36;
  if (below + blockH <= (captionY / 100) * canvasH - 170) return below;
  return TOP;
}

export default function Preview({
  videoRef,
  videoUrl,
  playing,
  onToggle,
  onPlaying,
  onLoaded,
  onTime,
  phrase,
  activeWord,
  zoom,
  focus,
  style,
  vars,
  size,
  captionY,
  objectPosition,
  hook,
  progress,
  emoji,
  scale,
  frame,
  faceY,
  split = null,
  canvas = { w: 1080, h: 1920 },
  watermark = true,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  videoUrl: string;
  playing: boolean;
  onToggle: () => void;
  onPlaying: (p: boolean) => void;
  onLoaded: () => void;
  onTime: (t: number) => void;
  phrase: Phrase | undefined;
  activeWord: number;
  zoom: number;
  focus: string;
  style: string;
  vars: CSSProperties;
  size: number;
  captionY: number;
  objectPosition: string;
  hook: string | null;
  progress: number | null;
  emoji: boolean;
  scale: number;
  /** Размер картинки в кадре 9:16 (доли): 1×1 — заполнить, меньше — вокруг размытый фон */
  frame: { w: number; h: number };
  /** Центр лица в готовом кадре (0..1) — хук обходит лицо */
  faceY: number | null;
  /** «Экран пополам»: окна исходника для двух половин (в горизонтальном кадре — левая и правая) */
  split?: [Panel, Panel] | null;
  /** Размер готового кадра в пикселях: 1080×1920, 1920×1080 или 1080×1080 */
  canvas?: { w: number; h: number };
  /** Во Free водяной знак есть в итоговом видео — показываем и в превью */
  watermark?: boolean;
}) {
  const t = inspector[useLocale()].preview;
  const bgRef = useRef<HTMLVideoElement>(null);
  // Высота плашки хука в пикселях кадра — от неё зависит, влезет ли хук над головой
  const hookRef = useRef<HTMLParagraphElement>(null);
  const [hookH, setHookH] = useState(0);
  const hasHook = Boolean(hook);
  useEffect(() => {
    const el = hookRef.current;
    if (!el) return;
    // Считаем строки и берём высоту плашки как в движке: строка 66×1.18 + 6, поля 26
    const ro = new ResizeObserver(() => {
      const lines = Math.max(1, Math.round(el.offsetHeight / K / (66 * (1.18 + 32 / 66))));
      setHookH(lines * (66 * 1.18 + 6) - 6 + 26);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasHook]);
  const blur = frame.w < 0.999 || frame.h < 0.999;
  const side = canvas.w > canvas.h; // «пополам» рядом, а не друг над другом
  // Ширина строки субтитров и хука — как caption_max_w / hook_wrap_w в движке
  const capW = Math.min(canvas.w - 120, Math.round(Math.min(canvas.w, canvas.h) * 1.25));
  const hookW = Math.min(canvas.w - 300, 1300);

  // Размытый фон — вторая копия видео, идёт синхронно с основной
  useEffect(() => {
    const bg = bgRef.current;
    const v = videoRef.current;
    if (!bg || !v) return;
    if (playing) bg.play().catch(() => {});
    else bg.pause();
    const sync = () => {
      if (Math.abs(bg.currentTime - v.currentTime) > 0.25) bg.currentTime = v.currentTime;
    };
    sync();
    const id = setInterval(sync, 400);
    v.addEventListener("seeked", sync);
    return () => {
      clearInterval(id);
      v.removeEventListener("seeked", sync);
    };
  }, [playing, blur, split, videoRef]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-black ring-1 ring-line">
      {split ? (
        // Вторая половина (нижняя или правая) — вторая копия видео, идёт синхронно с основной
        <div className={`absolute overflow-hidden ${side ? "inset-y-0 right-0 w-1/2" : "inset-x-0 bottom-0 h-1/2"}`}>
          <video ref={bgRef} src={videoUrl} muted playsInline aria-hidden="true" className="pointer-events-none" style={panelStyle(split[1])} />
        </div>
      ) : blur && (
        <video
          ref={bgRef}
          src={videoUrl}
          muted
          playsInline
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.88] saturate-[1.15]"
        />
      )}
      <div
        className="absolute overflow-hidden"
        style={
          split
            ? { left: 0, top: 0, width: side ? "50%" : "100%", height: side ? "100%" : "50%" }
            : { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: `${frame.w * 100}%`, height: `${frame.h * 100}%` }
        }
      >
        <video
          ref={videoRef}
          src={videoUrl}
          playsInline
          onClick={onToggle}
          onPlay={() => onPlaying(true)}
          onPause={() => onPlaying(false)}
          onLoadedMetadata={onLoaded}
          onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
          className="h-full w-full cursor-pointer object-cover will-change-transform"
          style={split ? panelStyle(split[0]) : { objectPosition, transform: `scale(${zoom})`, transformOrigin: focus }}
        />
      </div>
      {split && (
        <div
          className={`absolute bg-black/85 ${side ? "inset-y-0 left-1/2 w-[3px] -translate-x-1/2" : "inset-x-0 top-1/2 h-[3px] -translate-y-1/2"}`}
          aria-hidden="true"
        />
      )}

      {/* Все оверлеи — в масштабе движка */}
      <div
        className="pointer-events-none absolute left-0 top-0 origin-top-left"
        style={{ width: canvas.w * K, height: canvas.h * K, transform: `scale(${scale})` }}
      >
        {hook && (
          <p
            ref={hookRef}
            className="absolute left-1/2 -translate-x-1/2 text-center font-extrabold text-[#0c0c0c]"
            style={{ width: hookW * K, top: hookTop(hookH, faceY, captionY, canvas.h) * K, fontSize: 66 * K, lineHeight: 1.18 + 32 / 66 }}
          >
            {/* Каждая строка — своя белая плашка, как в движке */}
            <span
              className="rounded-[6px] bg-white [box-decoration-break:clone] [-webkit-box-decoration-break:clone]"
              style={{ padding: `${13 * K}px ${38 * K}px` }}
            >
              {hook}
            </span>
          </p>
        )}

        {phrase && (
          <div
            className={`cap cap-${style} absolute -translate-y-1/2`}
            style={{ ...vars, top: `${captionY}%`, left: ((canvas.w - capW) / 2) * K, right: ((canvas.w - capW) / 2) * K, fontSize: size }}
          >
            {emoji && phrase.emoji && (
              <span className="absolute bottom-full left-1/2 mb-[0.35em] -translate-x-1/2 text-[1.15em] leading-none">
                {phrase.emoji}
              </span>
            )}
            {phrase.words.map((w, i) => (
              <span key={i} className={wordState(i, activeWord)}>
                {w.text.replace(/[,.;:…]+$/, "")}
              </span>
            ))}
          </div>
        )}

        {/* Водяной знак у обоих краёв — как в итоговом видео */}
        {watermark && <Watermark side="left" />}
        {watermark && <Watermark side="right" />}

        {progress !== null && (
          <div className="absolute inset-x-0 bottom-0 bg-transparent" style={{ height: 14 * K }}>
            <div className="h-full bg-[#ffd60a]/95" style={{ width: `${Math.min(progress, 1) * 100}%` }} />
          </div>
        )}
      </div>

      {!playing && (
        <button
          onClick={onToggle}
          aria-label={t.play}
          className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/55 backdrop-blur transition-colors hover:bg-black/70"
        >
          <Play className="ml-0.5 h-6 w-6 fill-white text-white" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function Watermark({ side }: { side: "left" | "right" }) {
  const left = side === "left";
  // Как в движке: наклейка высотой 58px, центр в 47px от края, на 36% / 64% высоты
  return (
    <span
      className="absolute opacity-[0.82] drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]"
      style={{
        top: `${left ? 36 : 64}%`,
        [left ? "left" : "right"]: 47 * K,
        transform: `translate(${left ? "-50%" : "50%"}, -50%) rotate(${left ? -90 : 90}deg)`,
      }}
    >
      <Sticker className="block" style={{ height: 58 * K }} />
    </span>
  );
}
