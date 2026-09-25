"use client";

import { useState } from "react";
import { useLocale } from "@/i18n/client";
import captions, { localizeColors } from "@/i18n/dict/captions";
import landing from "@/i18n/dict/landing";
import { ACCENTS, CAPTION_STYLES, type CaptionStyleId, captionVars, wordState } from "@/lib/captions";
import { useTicker } from "@/lib/useTicker";
import ColorSwatches from "./ColorSwatches";
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

export default function StylePlayground() {
  const locale = useLocale();
  const t = landing[locale].playground;
  const names = captions[locale];
  const [style, setStyle] = useState<CaptionStyleId>("beat");
  const [accent, setAccent] = useState<string | null>(null);
  const vars = captionVars(accent, null);
  const tick = useTicker(420);
  const total = t.phrases.reduce((n, p) => n + p.length, 0);
  const { phrase, active } = frameAt(t.phrases, tick % total);

  return (
    <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-[280px_1fr] md:gap-12 lg:grid-cols-[300px_1fr] lg:gap-20">
      {/* Живое видео, субтитры поверх — меняются сразу */}
      <div className="relative mx-auto w-[230px] -rotate-[1.5deg] md:sticky md:top-24 md:w-full">
        <span className="tape -top-3 left-1/2 -translate-x-1/2 rotate-2" aria-hidden="true" />
        <DemoReel src="/demo/loop.mp4" poster="/demo/loop.jpg" label={t.videoLabel}>
          <div
            className={`cap cap-${style} pointer-events-none absolute inset-x-3 top-[68%] -translate-y-1/2 text-[23px] lg:text-[26px]`}
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
        <Note className="text-[26px]">{t.styleNote}</Note>
        <div
          role="radiogroup"
          aria-label={t.styleAria}
          className="-mx-5 mt-3 flex gap-3 overflow-x-auto px-5 py-3 [scrollbar-width:none] md:mx-0 md:mt-4 md:flex-wrap md:gap-y-4 md:overflow-visible md:px-0 md:py-0"
        >
          {CAPTION_STYLES.map((s, i) => {
            const on = s.id === style;
            const name = names.styles[s.id];
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={name}
                onClick={() => setStyle(s.id)}
                className={`relative flex h-14 min-w-[104px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-[#16130f] px-4 shadow-[0_8px_16px_-10px_rgba(40,25,5,0.6)] transition-transform duration-150 hover:-translate-y-0.5 ${
                  on ? "rotate-0 scale-105 ring-[3px] ring-rec ring-offset-2 ring-offset-ink" : TILT[i % TILT.length]
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

        <div className="mt-10 flex items-start gap-2 text-dim">
          <HandArrow kind="curve" className="mt-1 hidden h-8 w-16 -scale-x-100 md:block" />
          <p className="max-w-sm text-[15px] leading-relaxed">{t.hint}</p>
        </div>
      </div>
    </div>
  );
}
