import { Fragment } from "react";
import Link from "next/link";
import { ArrowDown, Scissors, Send } from "lucide-react";
import CtaIcon from "@/components/CtaIcon";
import DemoReel from "@/components/DemoReel";
import ExampleCut from "@/components/ExampleCut";
import FeatureDemos from "@/components/FeatureDemos";
import FinalClap from "@/components/FinalClap";
import IntroVideo from "@/components/IntroVideo";
import { HandArrow, HandCheck, HandLine, HandPlus, Note } from "@/components/Hand";
import LangSwitch from "@/components/LangSwitch";
import Logo, { LogoIcon } from "@/components/Logo";
import Marked from "@/components/Marked";
import PriceReceipt from "@/components/PriceReceipt";
import RevealObserver from "@/components/RevealObserver";
import SiteFooter from "@/components/SiteFooter";
import StylePlayground from "@/components/StylePlayground";
import TapeMarquee from "@/components/TapeMarquee";
import UserMenu from "@/components/UserMenu";
import WaitlistForm from "@/components/WaitlistForm";
import landing from "@/i18n/dict/landing";
import { getLocale } from "@/i18n/server";
import { cssVars } from "@/lib/cssVars";
import { SUPPORT } from "@/lib/support";

const H2 = "text-[34px] font-extrabold tracking-[-0.03em] sm:text-[44px]";
const CTA = "cta relative inline-flex h-12 items-center gap-2 rounded-full bg-fg px-6 font-semibold text-ink transition-transform hover:-rotate-1";

/**
 * Главная: «страница монтируется сама». Заголовок играет как субтитр, кусочки альбома налепляются,
 * пример едет за настоящим роликом, функции — маленькие демо, прайс печатается чеком.
 * Всё движение — CSS и немного IntersectionObserver; с reduced-motion и без JS это статичная страница.
 */
export default async function Home() {
  const locale = await getLocale();
  const t = landing[locale];
  const reel = (n: number) => ({
    src: `/demo/reel-${n}${t.reelSuffix}.mp4`,
    poster: `/demo/reel-${n}${t.reelSuffix}.jpg`,
  });
  const nav = [
    { href: "#example", label: t.nav.example },
    { href: "#features", label: t.nav.features },
    { href: "#pricing", label: t.nav.pricing },
    { href: "#faq", label: t.nav.faq },
  ];
  const words = t.hero.title.split(" ");

  return (
    <div className="paper min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-fg focus:px-4 focus:py-3 focus:text-ink"
      >
        {t.skip}
      </a>

      <header className="site-head sticky top-0 z-40">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 min-[380px]:gap-4 min-[380px]:px-5 sm:py-3">
          <Logo label={t.logoHome} />
          <nav aria-label={t.navMain} className="hidden items-center gap-7 text-[15px] text-dim md:flex">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className="transition-colors hover:text-fg">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5 min-[380px]:gap-2">
            {/* На узком экране — компактная кнопка с текущим языком */}
            <LangSwitch compact className="sm:hidden" />
            <div className="hidden sm:flex">
              <LangSwitch />
            </div>
            {/* Совсем узкий телефон: «Войти» прячем — вход есть в редакторе, куда ведёт кнопка */}
            <div className="max-[379px]:hidden">
              <UserMenu compact />
            </div>
            <Link
              href="/app"
              className="inline-flex h-11 items-center rounded-full bg-fg px-4 text-sm font-semibold min-[380px]:px-5 text-ink transition-transform hover:-rotate-1"
            >
              <span className="sm:hidden">{t.tryIt}</span>
              <span className="hidden sm:inline">{t.tryItLong}</span>
            </Link>
          </div>
        </div>
        <div className="scrub" aria-hidden="true">
          <i className="scrub-fill" />
          <i className="scrub-head" />
        </div>
      </header>

      <main id="main">
        {/* Первый экран: заголовок играет как субтитр, рилсы налепляются на бумагу */}
        <section className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-14 px-5 pb-16 pt-10 md:grid-cols-[1.15fr_1fr] md:pt-16">
          <div>
            <Note className="inline-flex -rotate-2 items-center gap-2 text-rec">
              <span aria-hidden="true" className="rec-dot inline-block h-2.5 w-2.5 rounded-full bg-rec" />
              {t.hero.badge}
            </Note>
            <h1 className="mt-3 text-[46px] font-extrabold leading-[1.02] tracking-[-0.04em] sm:text-[64px]">
              {words.map((w, i) => (
                <Fragment key={i}>
                  <span className="hw" style={cssVars({ "--i": i })}>
                    {w}
                  </span>{" "}
                </Fragment>
              ))}
              <span className="marker hw hw-land" style={cssVars({ "--i": words.length })}>
                {t.hero.titleMarker}
              </span>
            </h1>
            <div className="mt-1 flex items-start gap-1 pl-[5.5em] text-dim sm:pl-[7.5em]">
              <HandArrow kind="down" draw style={cssVars({ "--draw-delay": "1000ms" })} className="h-9 w-5 rotate-[200deg]" />
              <Note write style={cssVars({ "--write-delay": "1150ms" })} className="mt-3 rotate-2 text-[20px]">
                {t.hero.aside}
              </Note>
            </div>
            <p className="mt-4 max-w-lg text-[18px] leading-relaxed text-dim">{t.hero.lead}</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/app" className={CTA}>
                {t.hero.cta}
                <CtaIcon />
              </Link>
              <a
                href="#example"
                className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium underline decoration-dotted decoration-2 underline-offset-4 hover:decoration-solid"
              >
                {t.hero.ctaSecondary}
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-dim">
              {t.hero.trust.map((x) => (
                <li key={x} className="inline-flex items-center gap-1.5">
                  <HandCheck className="h-4 w-4 shrink-0 text-rec" />
                  {x}
                </li>
              ))}
            </ul>
          </div>

          <div className="hero-reels relative mx-auto h-[500px] w-full max-w-[400px] sm:h-[548px]">
            <div className="reel-slot drop-in absolute left-0 top-6 w-[58%] -rotate-[5deg]" style={cssVars({ "--drop": "120ms" })}>
              <span className="tape -top-3 left-8 -rotate-6" aria-hidden="true" />
              <DemoReel {...reel(1)} label={t.hero.reel1Label} slate={t.hero.slate1} />
            </div>
            <div className="reel-slot drop-in absolute right-0 top-20 w-[54%] rotate-[4deg]" style={cssVars({ "--drop": "300ms" })}>
              <span className="tape -top-3 right-6 rotate-3" aria-hidden="true" />
              <DemoReel {...reel(3)} label={t.hero.reel3Label} slate={t.hero.slate3} />
            </div>
            <div className="absolute -bottom-4 left-4 flex items-end gap-1 text-dim">
              <HandArrow kind="loop" draw style={cssVars({ "--draw-delay": "1400ms" })} className="h-16 w-16 -scale-x-100 rotate-[160deg]" />
              <Note write style={cssVars({ "--write-delay": "1600ms" })}>
                {t.hero.reelsNote}
              </Note>
            </div>
          </div>
        </section>

        {/* Две ленты-скотча с фактами */}
        <TapeMarquee a={t.tape.a} b={t.tape.b} />

        {/* Ролик «как это работает» и «а руками было бы так» */}
        <section className="mx-auto max-w-5xl px-5 pb-24">
          <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-[minmax(0,1fr)_270px] md:gap-0">
            <figure data-reveal="settle" className="relative mx-auto w-full max-w-3xl rotate-[-0.8deg]">
              <div className="photo relative">
                <span className="tape tape-slap -top-3 left-10 -rotate-6" style={cssVars({ "--tape-d": "420ms" })} aria-hidden="true" />
                <span className="tape tape-slap -top-3 right-10 rotate-3" style={cssVars({ "--tape-d": "520ms" })} aria-hidden="true" />
                <IntroVideo label={t.intro.label} />
              </div>
              <figcaption className="mt-4 flex flex-wrap items-baseline justify-center gap-x-3 text-center">
                <Note write style={cssVars({ "--write-delay": "700ms" })} className="text-[24px]">
                  {t.intro.note}
                </Note>
                <span className="text-sm text-faint">{t.intro.aside}</span>
              </figcaption>
            </figure>
            <aside
              data-reveal="slap"
              style={cssVars({ "--d": "250ms" })}
              className="relative z-10 mx-auto w-full max-w-[300px] rotate-[2deg] bg-panel px-6 pb-6 pt-7 shadow-[0_20px_40px_-26px_rgba(60,40,10,.55)] md:-ml-8 md:mt-24"
            >
              <span className="tape -top-3 left-1/2 -translate-x-1/2 -rotate-3" aria-hidden="true" />
              <Note className="text-[24px] text-dim">{t.manual.title}</Note>
              <ol className="mt-3 space-y-1.5 text-[16px]">
                {t.manual.steps.map((s, i) => (
                  <li key={s}>
                    <span className="strike" style={cssVars({ "--n": i })}>
                      {s}
                    </span>
                  </li>
                ))}
              </ol>
              <Note write style={cssVars({ "--write-delay": "2200ms" })} className="mt-3 block text-[22px] text-rec">
                {t.manual.tail}
              </Note>
            </aside>
          </div>
        </section>

        {/* Было → стало: рамка едет за настоящим роликом */}
        <section id="example" className="scroll-mt-20 border-y-2 border-dashed border-line-strong">
          <div className="mx-auto max-w-5xl px-5 py-20">
            <h2 data-reveal="up" className={H2}>
              <Marked text={t.example.title} mark={t.example.mark} />
            </h2>
            <p className="mt-3 max-w-xl text-[17px] text-dim">{t.example.lead}</p>
            <ExampleCut reel={reel(2)} t={t.example} />
            <p className="mx-auto mt-8 max-w-3xl text-sm text-faint">{t.example.footnote}</p>
          </div>
        </section>

        {/* Что умеет: четыре живых демо и компактный список */}
        <section id="features" className="scroll-mt-20 mx-auto max-w-5xl px-5 py-24">
          <h2 data-reveal="up" className={H2}>
            <Marked text={t.features.title} mark={t.features.mark} />
          </h2>
          <FeatureDemos t={t.features} phrase={t.playground.phrases[0]} />
        </section>

        {/* Стили */}
        <section id="styles" className="scroll-mt-20 bg-raised/60">
          <div className="mx-auto max-w-5xl px-5 py-20">
            <h2 data-reveal="up" className={H2}>
              <Marked text={t.styles.title} mark={t.styles.mark} />
            </h2>
            <div className="mt-10">
              <StylePlayground />
            </div>
          </div>
        </section>

        {/* Цены: чек со штампом и купон раннего доступа */}
        <section id="pricing" className="scroll-mt-20 mx-auto max-w-3xl px-5 py-24">
          <h2 data-reveal="up" className={H2}>
            <Marked text={t.pricing.title} mark={t.pricing.mark} />
          </h2>
          <p className="mt-3 max-w-xl text-[17px] text-dim">{t.pricing.lead}</p>
          <PriceReceipt t={t.pricing} />
          <div className="mt-14 text-center">
            <Link href="/app" className={CTA}>
              {t.pricing.cta}
              <CtaIcon />
            </Link>
          </div>
          <div
            data-reveal="slap"
            style={cssVars({ "--d": "150ms" })}
            className="coupon relative mx-auto mt-16 max-w-xl -rotate-[1.2deg] bg-signal px-6 pb-8 pt-9 text-[#17140f] sm:px-10"
          >
            <Scissors aria-hidden="true" className="absolute left-7 top-[-1px] h-5 w-5 bg-signal px-0.5 text-[#17140f]" />
            <LogoIcon className="sticker-peel absolute -right-4 -top-5 h-14 w-14 rotate-[12deg] drop-shadow-[0_6px_8px_rgba(40,25,5,0.35)] sm:-right-6 sm:h-16 sm:w-16" />
            <Note write style={cssVars({ "--write-delay": "400ms" })} className="text-[32px]">
              {t.early.title}
            </Note>
            <p className="mt-2 text-[18px] leading-relaxed">
              {t.early.before}
              <b>{t.early.price}</b>
              {t.early.after}
            </p>
            <div className="mt-6">
              <WaitlistForm tone="accent" />
            </div>
          </div>
        </section>

        {/* Вопросы (раскрываются) и письмо автора рядом */}
        <section id="faq" className="scroll-mt-20 border-t-2 border-dashed border-line-strong">
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-x-12 gap-y-12 px-5 py-20 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <div className="md:col-start-2 md:row-start-1">
              <h2 data-reveal="up" className={H2}>
                <Marked text={t.faq.title} mark={t.faq.mark} />
              </h2>
              <div className="mt-8 border-t border-line">
                {t.faq.items.map(([q, a], i) => (
                  <details
                    key={q}
                    name="faq"
                    open={i === 0}
                    data-reveal="up"
                    style={cssVars({ "--d": `${i * 50}ms` })}
                    className="faq-item border-b border-line"
                  >
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[18px] font-bold">
                      {q}
                      <HandPlus className="faq-plus h-5 w-5 shrink-0 text-rec" />
                    </summary>
                    <p className="-mt-1 pb-5 pr-9 leading-relaxed text-dim">{a}</p>
                  </details>
                ))}
              </div>
            </div>
            <aside
              data-reveal="settle"
              className="relative self-start rotate-[0.6deg] rounded-sm bg-panel px-7 pb-8 pt-9 shadow-[0_20px_50px_-30px_rgba(60,40,10,0.5)] md:sticky md:top-24 md:col-start-1 md:row-start-1"
            >
              <span className="tape -top-3 left-8 -rotate-3" aria-hidden="true" />
              <span className="tape -top-3 right-8 rotate-6" aria-hidden="true" />
              <Note className="text-[30px]">{t.letter.title}</Note>
              <div className="mt-4 space-y-3 text-[16px] leading-relaxed">
                {t.letter.paragraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
              <Note write style={cssVars({ "--write-delay": "600ms" })} className="mt-5 block text-right text-[26px]">
                {t.letter.signature}
              </Note>
              <HandLine draw style={cssVars({ "--draw-delay": "1300ms" })} className="ml-auto block h-3 w-40 text-rec" />
              {SUPPORT.telegram && (
                <a
                  href={`https://t.me/${SUPPORT.telegram}`}
                  rel="noopener"
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-full border-2 border-fg px-5 font-semibold transition-colors hover:bg-fg hover:text-ink"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {t.letter.cta}
                </a>
              )}
            </aside>
          </div>
        </section>

        {/* Финал: хлопушка */}
        <FinalClap t={t.final} />
        <RevealObserver key={locale} />
      </main>

      <SiteFooter logoLabel={t.logoHome} />
    </div>
  );
}
