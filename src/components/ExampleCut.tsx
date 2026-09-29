"use client";

import { useCallback, useRef, useState } from "react";
import type landing from "@/i18n/dict/landing";
import { cssVars } from "@/lib/cssVars";
import { useReducedMotion } from "@/lib/useReducedMotion";
import DemoReel from "./DemoReel";
import { HandArrow, HandCheck, Note } from "./Hand";

// В reel-2 (и reel-2-en) склейка на вторую ведущую — на 8,8 с (нашли ffmpeg-детектором сцен)
const SWITCH_AT = 8.8;
// Когда отмечается t.checks[i]: кадр, переход на вторую ведущую, слова, водяной знак
const TICK_AT = [0.3, SWITCH_AT, 1.0, 1.8];

/**
 * «Было → стало» вживую: жёлтая рамка 9:16 стоит на той ведущей, которую сейчас показывает настоящий рилс,
 * и переезжает ровно в момент склейки. Галочки отмечаются по мере того, как ролик до них доходит.
 * Пока ролик не заиграл (нет JS, reduced-motion, браузер запретил автозапуск) — статичный кадр:
 * рамка на правой ведущей, как на обложке, все галочки на месте.
 */
export default function ExampleCut({
  reel,
  t,
}: {
  reel: { src: string; poster: string };
  t: (typeof landing)["ru"]["example"];
}) {
  const motionOk = !useReducedMotion();
  const [started, setStarted] = useState(false);
  const [host, setHost] = useState<0 | 1>(0); // 0 — правая ведущая (начало ролика), 1 — левая
  const [cuts, setCuts] = useState(0); // сколько настоящих склеек случилось — для вспышки и толчка
  const [done, setDone] = useState(0); // битовая маска отмеченных пунктов, только растёт
  const hostRef = useRef<0 | 1>(0);
  const live = motionOk && started;

  const onTime = useCallback((time: number) => {
    setStarted(true); // то же значение каждый кадр — React не перерисовывает
    const h = time >= SWITCH_AT ? 1 : 0;
    if (h !== hostRef.current) {
      hostRef.current = h;
      setHost(h);
      setCuts((c) => c + 1);
    }
    setDone((m) => TICK_AT.reduce((acc, at, i) => (time >= at ? acc | (1 << i) : acc), m));
  }, []);

  const on = (i: number) => !live || ((done >> i) & 1) === 1;

  return (
    <div className="excut" data-live={live || undefined} data-host={live ? host : 0} data-cut={live && cuts > 0 ? cuts % 2 : undefined}>
      <div className="mt-8 grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-center gap-4 md:mt-12 md:grid-cols-[1.35fr_auto_1fr] md:gap-10">
        <figure className="mx-auto w-full max-w-[440px] -rotate-2">
          {/* место под подсказку держим всегда — чтобы ничего не прыгало */}
          <Note className="mb-2 block -rotate-1 text-center text-[16px] text-rec sm:text-[20px]" style={{ visibility: live ? "visible" : "hidden" }}>
            {t.watch}
          </Note>
          <div className="photo relative">
            <span className="tape -top-3 left-1/2 -translate-x-1/2 rotate-2" aria-hidden="true" />
            <div className="excut-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/demo/source.jpg" alt={t.sourceAlt} className="aspect-video w-full object-cover" />
              <div className="excut-crop" aria-hidden="true">
                <b>{t.cropTag}</b>
                {live && cuts > 0 && <i key={cuts} className="excut-flash" />}
              </div>
              <span
                className="excut-face"
                data-face="0"
                data-label={t.face}
                style={{ left: "68.5%", top: "28%", width: "10%", height: "20%" }}
                aria-hidden="true"
              />
              <span
                className="excut-face"
                data-face="1"
                data-label={t.face}
                style={{ left: "20%", top: "27%", width: "10%", height: "20%" }}
                aria-hidden="true"
              />
            </div>
          </div>
          <figcaption className="mt-3 text-center">
            <Note>{t.before}</Note>
          </figcaption>
        </figure>

        <div data-reveal="up" style={cssVars({ "--d": "200ms" })} className="hidden md:block">
          <HandArrow kind="curve" draw className="mx-auto h-12 w-24 rotate-90 text-fg md:rotate-0" />
        </div>

        <figure className="excut-reel mx-auto w-full max-w-[250px] rotate-2">
          <DemoReel {...reel} label={t.reelLabel} onTime={motionOk ? onTime : undefined} />
          <figcaption className="mt-3 text-center">
            <Note>{t.after}</Note>
          </figcaption>
        </figure>
      </div>

      <ul className="excut-checks mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-x-10 gap-y-2 text-[14px] sm:grid-cols-2 sm:gap-y-3 sm:text-[16px] md:mt-12">
        {t.checks.map((c, i) => (
          <li key={i} className="flex gap-3" data-on={on(i) || undefined}>
            <HandCheck className="mt-0.5 h-5 w-5 shrink-0 text-fg" />
            <span className="excut-hl">{c}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
