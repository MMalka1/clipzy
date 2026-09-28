"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Dices } from "lucide-react";
import { useLocale } from "@/i18n/client";
import captions, { localizeColors } from "@/i18n/dict/captions";
import landing from "@/i18n/dict/landing";
import { ACCENTS, CAPTION_STYLES, type CaptionStyleId, captionVars, wordState } from "@/lib/captions";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useTicker } from "@/lib/useTicker";
import ColorSwatches from "./ColorSwatches";
import CtaIcon from "./CtaIcon";
import DemoReel from "./DemoReel";
import { HandArrow, Note } from "./Hand";

/** Какая фраза сейчас на экране и какое слово в ней активно. */
function frameAt(phrases: string[][], pos: number) {
  let acc = 0;
  for (const p of phrases) {
    if (pos < acc + p.length) return { phrase: p, active: pos - acc };
    acc += p.length;
  }
  return { phrase: phrases[0], active: 0 };
}

// Наклейки чуть вразнобой — как налеплены руками
const TILT = ["-rotate-2", "rotate-1", "-rotate-1", "rotate-2", "rotate-0", "-rotate-[1.5deg]"];
// Экскурсия по самым непохожим стилям, пока посетитель ничего не трогал
const TOUR: CaptionStyleId[] = ["beat", "box", "neon", "comic", "typewriter", "marker", "mrbeast", "gradient", "glass", "pop"];

export default function StylePlayground() {
  const locale = useLocale();
  const t = landing[locale].playground;
  const names = captions[locale];
  const [style, setStyle] = useState<CaptionStyleId>("beat");
  const [accent, setAccent] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [inView, setInView] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const calm = useReducedMotion();
  const touring = auto && !calm; // с reduced-motion сам ничего не листает
  const tour = useTicker(1800, touring && inView);
  const shown: CaptionStyleId = touring ? TOUR[tour % TOUR.length] : style;
  const vars = captionVars(accent, null);
  const tick = useTicker(420, inView);
  const total = t.phrases.reduce((n, p) => n + p.length, 0);
  const { phrase, active } = frameAt(t.phrases, tick % total);

  // Любое касание, клавиша или фокус внутри — экскурсия останавливается на том, что сейчас на экране
  const stopTour = () => {
    if (touring) {
      setStyle(shown);
      setAuto(false);
    }
  };

  function surprise() {
    const others = CAPTION_STYLES.filter((s) => s.id !== shown);
    const colors = ACCENTS.filter((a) => a.value !== accent);
    setStyle(others[Math.floor(Math.random() * others.length)].id);
    setAccent(colors[Math.floor(Math.random() * colors.length)].value);
    setAuto(false);
  }

  return (
    <div
      ref={box}
      onPointerDownCapture={(e) => e.pointerType !== "touch" && stopTour()}
      onClickCapture={stopTour}
      onKeyDownCapture={stopTour}
      onFocusCapture={stopTour}
      className="grid grid-cols-1 items-start gap-8 md:grid-cols-[280px_1fr] md:gap-12 lg:grid-cols-[300px_1fr] lg:gap-20"
    >
      {/* Живое видео, субтитры поверх — меняются сразу */}
      <div className="relative mx-auto w-[230px] -rotate-[1.5deg] md:sticky md:top-24 md:w-full">
        <span className="tape -top-3 left-1/2 -translate-x-1/2 rotate-2" aria-hidden="true" />
        <DemoReel src="/demo/loop.mp4" poster="/demo/loop.jpg" label={t.videoLabel}>
          <div
            key={shown + (accent ?? "")}
            className={`cap cap-${shown} cap-enter pointer-events-none absolute inset-x-3 top-[68%] -translate-y-1/2 text-[23px] lg:text-[26px]`}
            style={vars}
            aria-live="off"
          >
            {phrase.map((w, i) => (
              <span key={i} className={wordState(i, active)}>
                {w}
              </span>
            ))}
          </div>
        </DemoReel>
      </div>

      <div>
        <div className="flex flex-wrap items-baseline">
          <Note className="text-[26px]">{t.styleNote}</Note>
          <Note
            className="ml-3 text-[20px] text-rec transition-opacity duration-300 motion-reduce:hidden"
            style={{ opacity: touring ? 1 : 0 }}
          >
            <span aria-hidden="true">{t.autoHint}</span>
          </Note>
        </div>
        <div
          role="radiogroup"
          aria-label={t.styleAria}
          className="-mx-5 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 py-3 [mask-image:linear-gradient(90deg,transparent,#000_16px,#000_calc(100%-28px),transparent)] [scrollbar-width:none] md:mx-0 md:mt-4 md:flex-wrap md:gap-y-4 md:overflow-visible md:px-0 md:py-0 md:[mask-image:none]"
        >
          {CAPTION_STYLES.map((s, i) => {
            const picked = !touring && s.id === style; // выбор пользователя
            const onTour = touring && s.id === shown; // сейчас показывает экскурсия
            const name = names.styles[s.id];
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={s.id === style}
                aria-label={name}
                onClick={() => {
                  setStyle(s.id);
                  setAuto(false);
                }}
                className={`relative flex h-14 min-w-[104px] shrink-0 cursor-pointer snap-start items-center justify-center rounded-[10px] bg-[#16130f] px-4 shadow-[0_8px_16px_-10px_rgba(40,25,5,0.6)] transition-transform duration-150 hover:-translate-y-0.5 ${
                  picked
                    ? "chip-on rotate-0 scale-105 ring-[3px] ring-rec ring-offset-2 ring-offset-ink"
                    : onTour
                      ? "rotate-0 scale-105 outline-2 outline-offset-4 outline-rec outline-dashed"
                      : TILT[i % TILT.length]
                }`}
              >
                <span className={`cap cap-${s.id} pointer-events-none text-[17px]`} style={vars} aria-hidden="true">
                  <span className="cap-w on">{name}</span>
                </span>
              </button>
            );
          })}
        </div>

        <Note className="mt-10 block text-[26px]">{t.colorNote}</Note>
        <div className="mt-4">
          <ColorSwatches
            label={t.colorAria}
            options={localizeColors(ACCENTS, names.accents)}
            value={accent}
            onChange={setAccent}
          />
        </div>
        <button
          type="button"
          onClick={surprise}
          className="group mt-6 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-dashed border-line-strong px-4 font-semibold transition-colors hover:border-fg"
        >
          <Dices className="h-4 w-4 transition-transform group-hover:rotate-[20deg]" aria-hidden="true" />
          {t.surprise}
        </button>

        <div className="mt-10 flex items-start gap-2 text-dim">
          <HandArrow kind="curve" className="mt-1 hidden h-8 w-16 -scale-x-100 md:block" />
          <p className="max-w-sm text-[15px] leading-relaxed">{t.hint}</p>
        </div>
        <Link
          href="/app"
          className="cta relative mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-fg px-6 font-semibold text-ink transition-transform hover:-rotate-1"
        >
          {t.cta}
          <CtaIcon />
        </Link>
      </div>
    </div>
  );
}
