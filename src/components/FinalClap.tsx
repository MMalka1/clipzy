import Link from "next/link";
import type landing from "@/i18n/dict/landing";
import CtaIcon from "./CtaIcon";

type T = (typeof landing)["ru"]["final"];

/** Финальный призыв — кинохлопушка: при появлении палка захлопывается, карточка вздрагивает. */
export default function FinalClap({ t }: { t: T }) {
  return (
    <section id="start" className="px-5 pb-24 pt-10">
      <div data-reveal="up" className="clap relative mx-auto max-w-2xl -rotate-[1deg] [--cta-cut:var(--color-signal)]">
        <div className="clap-stick clap-top" aria-hidden="true" />
        <div className="clap-stick" aria-hidden="true" />
        <div className="clap-body rounded-b-[16px] bg-[#17140f] px-6 pb-10 pt-7 text-[#f3eee3] shadow-[0_28px_50px_-28px_rgba(40,25,5,.7)] sm:px-12">
          <dl className="grid grid-cols-3 border border-[#f3eee3]/25 font-mono text-[11px] uppercase tracking-wider">
            {t.slate.map(([k, v]) => (
              <div key={k} className="border-r border-[#f3eee3]/25 px-3 py-2 last:border-r-0">
                <dt className="text-[#f3eee3]/60">{k}</dt>
                <dd className="mt-1 font-hand text-[20px] normal-case leading-tight tracking-normal">{v}</dd>
              </div>
            ))}
          </dl>
          <h2 className="mt-7 text-[32px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[44px]">{t.title}</h2>
          <p className="mt-3 max-w-md text-[17px] leading-relaxed text-[#cfc6b6]">{t.text}</p>
          <Link
            href="/app"
            className="cta relative mt-8 inline-flex h-13 items-center gap-2 rounded-full bg-signal px-7 text-[17px] font-semibold text-[#17140f] transition-transform hover:-rotate-1"
          >
            {t.cta}
            <CtaIcon />
          </Link>
          <p className="mt-4 text-sm text-[#cfc6b6]">{t.note}</p>
        </div>
      </div>
    </section>
  );
}
