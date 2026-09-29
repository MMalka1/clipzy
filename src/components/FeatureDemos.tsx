import { Fragment } from "react";
import { AudioLines, Languages, Palette, Ratio, ScanFace, Scissors, TextCursorInput } from "lucide-react";
import type landing from "@/i18n/dict/landing";
import { captionVars, wordState } from "@/lib/captions";
import { cssVars } from "@/lib/cssVars";
import LoopClip from "./LoopClip";
import Waveform, { fakePeaks } from "./Waveform";

type T = (typeof landing)["ru"]["features"];

const ICONS = [ScanFace, Palette, AudioLines, Languages, Ratio, TextCursorInput];

/**
 * «Что умеет»: четыре главные функции — маленькие работающие демо (чистый CSS, крутятся только на экране),
 * остальные — компактным списком. Демо декоративны (aria-hidden), смысл — в заголовках и тексте.
 * Базовые стили — финальный кадр: так их видят без JS и с reduced-motion.
 */
export default function FeatureDemos({ t, phrase }: { t: T; phrase: string[] }) {
  const d = t.demos;
  const first = d.fillers.clean.split(" ")[0];
  const cards = [
    {
      key: "karaoke",
      title: d.karaoke.title,
      text: d.karaoke.text,
      demo: (
        <>
          <LoopClip className="absolute inset-0 h-full w-full object-cover object-[50%_22%] brightness-[.75]" />
          <div className="cap cap-beat absolute inset-x-3 bottom-[16%] text-[clamp(18px,7cqw,28px)]">
            {phrase.map((w, i) => (
              <span key={i} className="cap-w kw" style={cssVars({ "--i": i })}>
                {w}
              </span>
            ))}
          </div>
        </>
      ),
    },
    {
      key: "fillers",
      title: d.fillers.title,
      text: d.fillers.text,
      demo: (
        <>
          <span className="absolute left-3 top-3 font-mono text-[10px] uppercase tracking-wider text-white/60">{d.fillers.label}</span>
          <Scissors className="fl-snip absolute right-3 top-3 h-5 w-5 text-[#ff453a]" />
          <div className="fl-stage">
            <p className="fl-raw text-[clamp(15px,4.6cqw,20px)] font-semibold leading-snug text-[#f3eee3]">
              {/* паразиты — соседние <s>: по порядку среди них CSS вычёркивает их по очереди */}
              {d.fillers.raw.map(([w, filler], i) => (
                <Fragment key={i}>
                  {i > 0 && " "}
                  {filler ? <s className="fl">{w}</s> : <span>{w}</span>}
                </Fragment>
              ))}
            </p>
            <p className="fl-clean text-[clamp(16px,5cqw,22px)] font-extrabold leading-snug text-white">
              <span className="rounded bg-signal px-1 text-[#17140f]">{first}</span> {d.fillers.clean.slice(first.length + 1)}
            </p>
          </div>
          <span className="absolute bottom-3 left-3 font-mono text-[11px] text-[#ff9a82]">{d.fillers.count}</span>
          <span className="absolute bottom-2 right-3 font-hand text-[16px] text-white/70">{d.fillers.note}</span>
        </>
      ),
    },
    {
      key: "hook",
      title: d.hook.title,
      text: d.hook.text,
      demo: (
        <>
          <LoopClip className="absolute inset-0 h-full w-full object-cover object-[50%_22%] brightness-[.55]" />
          <div className="absolute inset-x-0 top-[20%] flex justify-center">
            <span className="hk-plate rounded-md bg-white px-3 py-1.5 text-[clamp(13px,4.4cqw,17px)] font-bold leading-tight text-[#111]">
              {d.hook.plate}
            </span>
          </div>
          <span className="hk-note absolute inset-x-0 top-[44%] text-center font-hand text-[18px] text-signal">{d.hook.note}</span>
          <div className="absolute inset-x-3 bottom-3 h-[28%] rounded-md bg-black/55 p-1.5">
            <Waveform peaks={fakePeaks(60, 5)} className="h-full w-full text-white/45" />
            <i className="hk-sel absolute inset-y-0.5 left-[34%] w-[26%] rounded border-[3px] border-signal" />
            <i className="hk-head absolute -inset-y-1 left-0 w-0.5 bg-[#ff453a]" />
          </div>
        </>
      ),
    },
    {
      key: "split",
      title: d.split.title,
      text: d.split.text,
      demo: (
        <>
          <div className="flex h-full items-center justify-between gap-[4cqw] px-[5cqw]">
            <div className="relative w-[52cqw]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/demo/source.jpg" alt="" loading="lazy" decoding="async" className="aspect-video w-full rounded-[6px] object-cover" />
              <i className="sp-box sp-box-1" style={{ left: "7.5%", top: "15%", width: "35%", height: "55%" }}>
                <b className="sp-n">1</b>
              </i>
              <i className="sp-box sp-box-2" style={{ left: "56%", top: "15%", width: "35%", height: "55%" }}>
                <b className="sp-n">2</b>
              </i>
            </div>
            <div className="relative aspect-[9/16] w-[32cqw] overflow-hidden rounded-[8px] bg-black">
              <div className="sp-panel sp-top">
                <b className="sp-n">1</b>
              </div>
              <div className="sp-panel sp-bot">
                <b className="sp-n">2</b>
              </div>
              <div
                className="sp-cap cap cap-box absolute inset-x-1 top-1/2 -translate-y-1/2 text-[clamp(9px,3cqw,13px)]"
                style={captionVars("#FF3DCF", null)}
              >
                {d.split.caption.map((w, i) => (
                  <span key={i} className={wordState(i, 1)}>
                    {w}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <span className="absolute bottom-[3cqw] left-[5cqw] max-w-[52cqw] font-hand text-[clamp(11px,4.6cqw,15px)] leading-none text-white/70">
            {d.split.note}
          </span>
        </>
      ),
    },
  ];

  return (
    <>
      {/* Телефон: карточки листаются вбок (одна на экран), компьютер — сетка 2×2 */}
      <p className="mt-2 font-hand text-[18px] text-dim md:hidden" aria-hidden="true">
        {t.swipe}
      </p>
      <div className="-mx-5 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-6 pt-3 [scrollbar-width:none] md:mx-0 md:mt-10 md:grid md:grid-cols-2 md:gap-8 md:overflow-visible md:px-0 md:pb-0 md:pt-0">
        {cards.map((c, i) => (
          <article
            key={c.key}
            data-reveal="up"
            style={cssVars({ "--d": `${i * 90}ms` })}
            className="relative w-[84%] shrink-0 snap-center rounded-[4px] bg-panel p-4 pb-5 shadow-[0_18px_40px_-26px_rgba(60,40,10,.55)] odd:-rotate-[0.6deg] even:rotate-[0.5deg] sm:w-[60%] sm:p-5 md:w-auto md:pb-6"
          >
            <span className="tape -top-3 left-1/2 -translate-x-1/2 rotate-2" aria-hidden="true" />
            <div className="demo relative aspect-[16/10] overflow-hidden rounded-[10px] bg-[#16130f]" data-loop aria-hidden="true">
              {c.demo}
            </div>
            <h3 className="mt-4 text-[17px] font-bold sm:text-[19px]">{c.title}</h3>
            <p className="mt-1 text-[14px] leading-relaxed text-dim sm:text-base">{c.text}</p>
          </article>
        ))}
      </div>

      <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 sm:gap-x-10 sm:gap-y-7 md:mt-14 lg:grid-cols-3">
        {t.items.map(([title, text], i) => {
          const Icon = ICONS[i % ICONS.length];
          return (
            <li key={title} data-reveal="up" style={cssVars({ "--d": `${i * 70}ms` })} className="flex items-start gap-3 sm:gap-4">
              <span className="blob">
                <Icon className="h-5 w-5 text-[#17140f]" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-[14px] font-bold leading-snug sm:text-[17px]">{title}</h3>
                {/* описание — с планшета: на телефоне хватает названия */}
                <p className="mt-1 hidden text-[15px] leading-relaxed text-dim sm:block">{text}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
