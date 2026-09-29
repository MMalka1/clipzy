"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useReducedMotion } from "@/lib/useReducedMotion";

export type BeforeAfterText = { before: string; after: string; hint: string; aria: string };

const START = 38; // где стоит ручка: слева «до», справа уже виден готовый рилс
// Окно 9:16 в кадре 16:9 — там, где сидит героиня справа (как его выбрал движок для этого ролика)
const WIN_LEFT = 55.5;
const WIN_W = 31.64;

/**
 * «До → после»: широкий кадр подкаста и тот же кадр, превращённый в рилс. Ручку тянут мышью или пальцем
 * (тянуть можно за любое место картинки), стрелками с клавиатуры. При первом показе ручка сама покачивается,
 * а кольцо вокруг неё пульсирует, пока её не тронули, — чтобы было понятно, что её можно двигать.
 */
export default function BeforeAfter({ t }: { t: BeforeAfterText }) {
  const [pos, setPos] = useState(START);
  const [touched, setTouched] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const dragging = useRef(false);
  const motionOk = !useReducedMotion();

  // Подсказка движением: один раз, когда блок показался на экране и его ещё не трогали
  useEffect(() => {
    const el = box.current;
    if (!el || !motionOk || touched) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const step = (now: number) => {
          const k = Math.min((now - t0) / 1800, 1);
          setPos(START + Math.sin(k * Math.PI * 2) * 16 * (1 - k * 0.3));
          if (k < 1) raf = requestAnimationFrame(step);
          else setPos(START);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [motionOk, touched]);

  // Рилс играет, только пока блок на экране
  useEffect(() => {
    const el = box.current;
    const v = video.current;
    if (!el || !v || !motionOk) return;
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()));
    io.observe(el);
    return () => io.disconnect();
  }, [motionOk]);

  const moveTo = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.min(Math.max(((clientX - r.left) / r.width) * 100, 0), 100));
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    setTouched(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    moveTo(e.clientX);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => dragging.current && moveTo(e.clientX);
  const onUp = () => {
    dragging.current = false;
  };
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === "ArrowLeft" ? -5 : e.key === "ArrowRight" ? 5 : e.key === "Home" ? -100 : e.key === "End" ? 100 : 0;
    if (!d) return;
    e.preventDefault();
    setTouched(true);
    setPos((p) => Math.min(Math.max(p + d, 0), 100));
  };

  return (
    <div
      ref={box}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className="relative aspect-video w-full cursor-ew-resize touch-pan-y select-none overflow-hidden rounded-2xl border-2 border-fg bg-black shadow-[6px_6px_0_var(--color-fg)]"
    >
      {/* До: широкий кадр как есть */}
      {/* eslint-disable-next-line @next/next/no-img-element -- статичный кадр из public, размер задан рамкой */}
      <img src="/demo/source.jpg" alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
      <span className="absolute left-3 top-3 rounded-md bg-black/70 px-2 py-1 font-mono text-[11px] text-white sm:text-xs">{t.before}</span>

      {/* После: тот же кадр — затемнён, а в окне 9:16 готовый рилс с субтитрами. Виден справа от ручки */}
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
        <div className="absolute inset-0 bg-black/75 backdrop-blur-[3px]" />
        <div
          className="absolute top-0 h-full overflow-hidden bg-black outline outline-2 outline-[#FFD60A]"
          style={{ left: `${WIN_LEFT}%`, width: `${WIN_W}%` }}
        >
          <video
            ref={video}
            src="/demo/reel-3.mp4"
            poster="/demo/reel-3.jpg"
            muted
            loop
            playsInline
            preload="none"
            className="h-full w-full object-cover"
          />
        </div>
        <span className="absolute right-3 top-3 rounded-md bg-[#FFD60A] px-2 py-1 font-mono text-[11px] text-[#17140f] sm:text-xs">{t.after}</span>
      </div>

      {/* Ручка: линия во всю высоту, большой круг и подпись «тяните», пока не тронули */}
      <div className="pointer-events-none absolute inset-y-0 w-[3px] -translate-x-1/2 bg-[#FFD60A]" style={{ left: `${pos}%` }} />
      <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pos}%` }}>
        {!touched && motionOk && <span className="absolute inset-0 animate-ping rounded-full bg-[#FFD60A]/60" aria-hidden="true" />}
        <button
          type="button"
          role="slider"
          aria-label={t.aria}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos)}
          onKeyDown={onKey}
          className="relative flex h-14 w-14 cursor-ew-resize items-center justify-center rounded-full bg-[#FFD60A] shadow-[0_0_0_3px_#17140f] outline-offset-4 sm:h-16 sm:w-16"
        >
          <svg width="26" height="16" viewBox="0 0 26 16" aria-hidden="true">
            <path d="M8 2L2 8l6 6M18 2l6 6-6 6" stroke="#17140f" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {!touched && (
          <span className="absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#17140f] px-3 py-1 text-sm font-semibold text-[#FFD60A]">
            {t.hint}
          </span>
        )}
      </div>
    </div>
  );
}
