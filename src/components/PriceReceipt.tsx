import type landing from "@/i18n/dict/landing";
import { cssVars } from "@/lib/cssVars";
import { Note } from "./Hand";
import { Sticker } from "./Logo";

type T = (typeof landing)["ru"]["pricing"];

/**
 * Прайс чеком: при появлении «печатается» сверху вниз, точки-заполнители дорисовываются по строке,
 * и на чек падает штамп «навсегда». Статусы честные: сейчас работает только бесплатный план.
 * Без JS и с reduced-motion — готовый чек со штампом.
 */
export default function PriceReceipt({ t }: { t: T }) {
  return (
    <div className="receipt relative mx-auto mt-12 max-w-[480px]" data-reveal="print">
      <div className="flex items-center justify-between gap-4">
        <Sticker className="h-6" />
        <span className="font-mono text-[11px] uppercase tracking-wider text-dim">{t.receipt.head}</span>
      </div>
      <div className="mt-4 border-t-2 border-dashed border-line-strong" />
      <ul className="mt-5 space-y-6">
        {t.plans.map((p, i) => (
          <li key={p.name}>
            <div className="flex items-baseline gap-3">
              <span className="text-[19px] font-bold">{p.name}</span>
              <span className="leader" style={cssVars({ "--i": i })} aria-hidden="true" />
              <span className={`whitespace-nowrap font-mono text-[16px] font-bold tabular-nums sm:text-[18px] ${p.featured ? "marker" : ""}`}>
                {p.price}
              </span>
            </div>
            <p className="mt-1 text-[15px] text-dim">{p.note}</p>
            {p.featured && <Note className="mt-1 block -rotate-1 text-[20px] text-rec">{t.proNote}</Note>}
            <span
              className={`mt-1.5 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider ${
                p.now ? "text-rec" : "text-faint"
              }`}
            >
              {p.now && <span className="rec-dot h-1.5 w-1.5 rounded-full bg-rec" aria-hidden="true" />}
              {p.status}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-6 border-t-2 border-dashed border-line-strong" />
      <p className="mt-4 font-mono text-[13px] leading-relaxed text-dim">
        {t.receipt.foot.map((l) => (
          <span key={l} className="block">
            {l}
          </span>
        ))}
      </p>
      <div className="barcode mt-4" aria-hidden="true" />
      <div className="stamp" aria-hidden="true">
        <small>{t.receipt.stamp[0]}</small>
        <b>{t.receipt.stamp[1]}</b>
        <small>{t.receipt.stamp[2]}</small>
      </div>
    </div>
  );
}
