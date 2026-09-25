import Link from "next/link";
import { ArrowRight } from "lucide-react";
import DemoReel from "@/components/DemoReel";
import { HandArrow, HandCheck, Note } from "@/components/Hand";
import LangSwitch from "@/components/LangSwitch";
import Logo, { LogoIcon } from "@/components/Logo";
import StylePlayground from "@/components/StylePlayground";
import UserMenu from "@/components/UserMenu";
import WaitlistForm from "@/components/WaitlistForm";
import landing from "@/i18n/dict/landing";
import { getLocale } from "@/i18n/server";

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

  return (
    <div className="paper min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5">
        <Logo label={t.logoHome} />
        <nav aria-label={t.navMain} className="hidden items-center gap-7 text-[15px] text-dim md:flex">
          {nav.map((n) => (
            <a key={n.href} href={n.href} className="transition-colors hover:text-fg">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {/* На узком экране — компактная кнопка с текущим языком */}
          <LangSwitch compact className="sm:hidden" />
          <div className="hidden sm:flex">
            <LangSwitch />
          </div>
          <UserMenu compact />
          <Link
            href="/app"
            className="rounded-full bg-fg px-4 py-2 text-sm font-semibold text-ink transition-transform hover:-rotate-1"
          >
            {t.tryIt}
          </Link>
        </div>
      </header>

      <main>
        {/* Первый экран */}
        <section className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-14 px-5 pb-20 pt-10 md:grid-cols-[1.15fr_1fr] md:pt-16">
          <div>
            <Note className="inline-block -rotate-2 text-rec">{t.hero.badge}</Note>
            <h1 className="mt-3 text-[46px] font-extrabold leading-[1.02] tracking-[-0.04em] sm:text-[64px]">
              {t.hero.title} <span className="marker">{t.hero.titleMarker}</span>
            </h1>
            <div className="mt-1 flex items-start gap-1 pl-[5.5em] text-dim sm:pl-[7.5em]">
              <HandArrow kind="down" className="h-9 w-5 rotate-[200deg]" />
              <Note className="mt-3 rotate-2 text-[20px]">{t.hero.aside}</Note>
            </div>
            <p className="mt-4 max-w-lg text-[18px] leading-relaxed text-dim">{t.hero.lead}</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link
                href="/app"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-fg px-6 font-semibold text-ink transition-transform hover:-rotate-1"
              >
                {t.hero.cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <span className="text-sm text-dim">{t.hero.ctaNote}</span>
            </div>
          </div>

          <div className="relative mx-auto h-[520px] w-full max-w-[400px]">
            <div className="absolute left-0 top-6 w-[58%] -rotate-[5deg]">
              <span className="tape -top-3 left-8 -rotate-6" aria-hidden="true" />
              <DemoReel {...reel(1)} label={t.hero.reel1Label} />
            </div>
            <div className="absolute right-0 top-20 w-[54%] rotate-[4deg]">
              <span className="tape -top-3 right-6 rotate-3" aria-hidden="true" />
              <DemoReel {...reel(3)} label={t.hero.reel3Label} />
            </div>
            <div className="absolute -bottom-4 left-4 flex items-end gap-1 text-dim">
              <HandArrow kind="loop" className="h-16 w-16 -scale-x-100 rotate-[160deg]" />
              <Note>{t.hero.reelsNote}</Note>
            </div>
          </div>
        </section>

        {/* Было → стало */}
        <section id="example" className="scroll-mt-6 border-y-2 border-dashed border-line-strong">
          <div className="mx-auto max-w-5xl px-5 py-20">
            <h2 className="text-[34px] font-extrabold tracking-[-0.03em] sm:text-[44px]">{t.example.title}</h2>
            <p className="mt-3 max-w-xl text-[17px] text-dim">{t.example.lead}</p>

            <div className="mt-12 grid grid-cols-1 items-center gap-10 md:grid-cols-[1.35fr_auto_1fr]">
              <figure className="mx-auto w-full max-w-[440px] -rotate-2">
                <div className="photo relative">
                  <span className="tape -top-3 left-1/2 -translate-x-1/2 rotate-2" aria-hidden="true" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/demo/source.jpg" alt={t.example.sourceAlt} className="aspect-video w-full object-cover" />
                </div>
                <figcaption className="mt-3 text-center">
                  <Note>{t.example.before}</Note>
                </figcaption>
              </figure>

              <HandArrow kind="curve" className="mx-auto h-12 w-24 rotate-90 text-fg md:rotate-0" />

              <figure className="mx-auto w-full max-w-[250px] rotate-2">
                <DemoReel {...reel(2)} label={t.example.reelLabel} />
                <figcaption className="mt-3 text-center">
                  <Note>{t.example.after}</Note>
                </figcaption>
              </figure>
            </div>

            <ul className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-x-10 gap-y-3 text-[16px] sm:grid-cols-2">
              {t.example.checks.map((c) => (
                <li key={c} className="flex gap-3">
                  <HandCheck className="mt-0.5 h-5 w-5 shrink-0 text-fg" />
                  {c}
                </li>
              ))}
            </ul>
            <p className="mx-auto mt-8 max-w-3xl text-sm text-faint">{t.example.footnote}</p>
          </div>
        </section>

        {/* Письмо автора */}
        <section className="mx-auto max-w-3xl px-5 py-24">
          <article className="relative rotate-[0.6deg] rounded-sm bg-panel px-7 py-10 shadow-[0_20px_50px_-30px_rgba(60,40,10,0.5)] sm:px-12">
            <span className="tape -top-3 left-10 -rotate-3" aria-hidden="true" />
            <span className="tape -top-3 right-10 rotate-6" aria-hidden="true" />
            <Note className="text-[30px]">{t.letter.title}</Note>
            <div className="mt-5 space-y-4 text-[17px] leading-relaxed">
              {t.letter.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            <Note className="mt-6 block text-right text-[26px]">{t.letter.signature}</Note>
          </article>
        </section>

        {/* Что умеет */}
        <section id="features" className="scroll-mt-6 mx-auto max-w-5xl px-5 pb-24">
          <h2 className="text-[34px] font-extrabold tracking-[-0.03em] sm:text-[44px]">{t.features.title}</h2>
          <ul className="mt-10 grid grid-cols-1 gap-x-14 gap-y-7 md:grid-cols-2">
            {t.features.items.map(([title, text]) => (
              <li key={title} className="flex gap-4 border-b border-line pb-6">
                <HandCheck className="mt-1 h-6 w-6 shrink-0 text-rec" />
                <div>
                  <h3 className="text-[19px] font-bold">{title}</h3>
                  <p className="mt-1 leading-relaxed text-dim">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Стили */}
        <section id="styles" className="scroll-mt-6 bg-raised/60">
          <div className="mx-auto max-w-5xl px-5 py-20">
            <h2 className="text-[34px] font-extrabold tracking-[-0.03em] sm:text-[44px]">{t.styles.title}</h2>
            <div className="mt-10">
              <StylePlayground />
            </div>
          </div>
        </section>

        {/* Цены */}
        <section id="pricing" className="scroll-mt-6 mx-auto max-w-3xl px-5 py-24">
          <h2 className="text-[34px] font-extrabold tracking-[-0.03em] sm:text-[44px]">{t.pricing.title}</h2>
          <div className="mt-10 space-y-7">
            {t.pricing.plans.map((p) => (
              <div key={p.name}>
                <div className="flex items-baseline gap-3 text-[20px] font-bold">
                  <span>{p.name}</span>
                  <span className="leader" aria-hidden="true" />
                  <span className="whitespace-nowrap">{p.price}</span>
                </div>
                <p className="mt-1 text-dim">{p.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 flex items-center gap-2 text-dim">
            <Note className="text-rec">{t.pricing.asideNote}</Note> {t.pricing.aside}
          </p>
          <Link
            href="/app"
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-fg px-6 font-semibold text-ink transition-transform hover:-rotate-1"
          >
            {t.pricing.cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>

        {/* Вопросы */}
        <section id="faq" className="scroll-mt-6 border-t-2 border-dashed border-line-strong">
          <div className="mx-auto max-w-5xl px-5 py-20">
            <h2 className="text-[34px] font-extrabold tracking-[-0.03em] sm:text-[44px]">{t.faq.title}</h2>
            <dl className="mt-10 grid grid-cols-1 gap-x-14 gap-y-8 md:grid-cols-2">
              {t.faq.items.map(([q, a]) => (
                <div key={q}>
                  <dt className="text-[18px] font-bold">{q}</dt>
                  <dd className="mt-1.5 leading-relaxed text-dim">{a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Ранний доступ — стикер */}
        <section className="px-5 pb-24 pt-4">
          <div className="relative mx-auto max-w-xl -rotate-[1.5deg] bg-signal px-7 pb-9 pt-10 text-[#17140f] shadow-[0_24px_40px_-24px_rgba(60,40,10,0.55)] sm:px-10">
            <span className="tape -top-3 left-1/2 -translate-x-1/2 rotate-1" aria-hidden="true" />
            <LogoIcon className="absolute -right-4 -top-5 h-16 w-16 rotate-[12deg] drop-shadow-[0_6px_8px_rgba(40,25,5,0.35)] sm:-right-6 sm:h-20 sm:w-20" />
            <Note className="text-[34px]">{t.early.title}</Note>
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
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-8 text-sm text-dim sm:flex-row sm:items-center sm:justify-between">
          <Logo size="sm" label={t.logoHome} />
          <nav aria-label={t.navFooter} className="flex flex-wrap gap-x-6 gap-y-2">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className="hover:text-fg">
                {n.label}
              </a>
            ))}
            <Link href="/app" className="hover:text-fg">
              {t.editor}
            </Link>
          </nav>
          <span className="flex items-center gap-4">
            <LangSwitch />
            <span className="flex items-center gap-2">
              <LogoIcon className="h-5 w-5" /> © 2026 Clipzy
            </span>
          </span>
        </div>
      </footer>
    </div>
  );
}
