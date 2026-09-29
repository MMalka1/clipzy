import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowRight } from "lucide-react";
import CtaIcon from "@/components/CtaIcon";
import DemoReel from "@/components/DemoReel";
import FinalClap from "@/components/FinalClap";
import { HandArrow, HandCheck, HandPlus, Note } from "@/components/Hand";
import JsonLd from "@/components/JsonLd";
import LangSwitch from "@/components/LangSwitch";
import Logo from "@/components/Logo";
import Marked from "@/components/Marked";
import PriceReceipt from "@/components/PriceReceipt";
import RevealObserver from "@/components/RevealObserver";
import SiteFooter from "@/components/SiteFooter";
import landing from "@/i18n/dict/landing";
import { getLocale } from "@/i18n/server";
import { SEO_PAGES, SEO_SLUGS, SEO_UI, isSeoSlug } from "@/lib/seo-pages";
import { breadcrumbLd, faqLd } from "@/lib/structured-data";
import { SITE_URL } from "@/lib/support";

const H2 = "text-[28px] font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-[40px]";
const CTA = "cta relative inline-flex h-12 items-center gap-2 rounded-full bg-fg px-6 font-semibold text-ink transition-transform hover:-rotate-1";
const PAPER_SHADOW = "shadow-[0_20px_40px_-26px_rgba(60,40,10,.55)]";
// шаги «как это работает» лежат на бумаге чуть вразнобой
const TILT = ["-rotate-[1deg]", "rotate-[0.8deg]", "-rotate-[0.4deg]"];

// Только страницы из списка: любой другой адрес — 404
export const dynamicParams = false;

export function generateStaticParams() {
  return SEO_SLUGS.map((slug) => ({ slug }));
}

async function pageFor(params: Promise<{ slug: string }>) {
  const { slug } = await params;
  if (!isSeoSlug(slug)) notFound();
  return { slug, page: SEO_PAGES[slug] };
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug, page } = await pageFor(params);
  const url = `${SITE_URL}/${slug}`;
  // Превью ссылки — русское: страница только на русском
  const image = { url: `${SITE_URL}/og/ru.png`, width: 1200, height: 630, alt: SEO_UI.ogAlt };
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: url },
    openGraph: {
      title: page.title,
      description: page.description,
      url,
      siteName: "Clipzy",
      locale: "ru_RU",
      type: "website",
      images: [image],
    },
    twitter: { card: "summary_large_image", title: page.title, description: page.description, images: [image.url] },
  };
}

/**
 * Посадочная страница под поисковый запрос («нарезка подкаста», «субтитры для рилс» и др.).
 * Тексты — в lib/seo-pages.ts, только на русском; шапка и подвал — на языке посетителя, как на всём сайте.
 * Вид — как у главной: бумага, скотч, маркер, рукописные пометки.
 */
export default async function SeoLanding({ params }: PageProps<"/[slug]">) {
  const { slug, page } = await pageFor(params);
  const locale = await getLocale();
  const chrome = landing[locale];
  const pricing = landing.ru.pricing;
  const others = SEO_SLUGS.filter((s) => s !== slug);

  return (
    <div className="paper min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-fg focus:px-4 focus:py-3 focus:text-ink"
      >
        {chrome.skip}
      </a>

      <header className="site-head sticky top-0 z-40">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 min-[380px]:gap-4 min-[380px]:px-5 sm:py-3">
          <Logo label={chrome.logoHome} />
          <div className="flex items-center gap-1.5 min-[380px]:gap-2">
            <LangSwitch compact className="sm:hidden" />
            <div className="hidden sm:flex">
              <LangSwitch />
            </div>
            <Link
              href="/app"
              className="inline-flex h-11 items-center rounded-full bg-fg px-4 text-sm font-semibold min-[380px]:px-5 text-ink transition-transform hover:-rotate-1"
            >
              <span className="sm:hidden">{chrome.tryIt}</span>
              <span className="hidden sm:inline">{chrome.tryItLong}</span>
            </Link>
          </div>
        </div>
        <div className="scrub" aria-hidden="true">
          <i className="scrub-fill" />
          <i className="scrub-head" />
        </div>
      </header>

      <main id="main" lang="ru">
        {chrome.seoNote && (
          <p lang={locale} className="mx-auto mt-4 max-w-5xl px-5">
            <span className="inline-block rounded-md bg-raised px-3 py-2 text-sm text-dim">{chrome.seoNote}</span>
          </p>
        )}

        {/* Первый экран: запрос в заголовке, коротко о главном и пример готового рилса */}
        <section className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 px-5 pb-12 pt-8 md:grid-cols-[1.4fr_1fr] md:gap-14 md:pb-20 md:pt-14">
          <div>
            <Note className="inline-block -rotate-2 text-rec">{page.kicker}</Note>
            <h1 className="mt-3 text-balance text-[36px] font-extrabold leading-[1.04] tracking-[-0.04em] sm:text-[52px]">
              <Marked text={page.h1} mark={page.mark} />
            </h1>
            {page.intro.map((p) => (
              <p key={p} className="mt-4 max-w-xl text-[16px] leading-relaxed text-dim sm:text-[18px]">
                {p}
              </p>
            ))}
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/app" className={CTA}>
                {SEO_UI.cta}
                <CtaIcon />
              </Link>
              <a
                href="#how"
                className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium underline decoration-dotted decoration-2 underline-offset-4 hover:decoration-solid"
              >
                {SEO_UI.how.title}
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-dim sm:gap-y-2 sm:text-[14px]">
              {landing.ru.hero.trust.map((x) => (
                <li key={x} className="inline-flex items-center gap-1.5">
                  <HandCheck className="h-4 w-4 shrink-0 text-rec" />
                  {x}
                </li>
              ))}
            </ul>
          </div>

          <figure className="mx-auto w-full max-w-[220px] sm:max-w-[280px]">
            <div className="reel-slot relative rotate-[3deg]">
              <span className="tape -top-3 left-10 -rotate-6" aria-hidden="true" />
              <DemoReel
                src={`/demo/reel-${page.reel.n}.mp4`}
                poster={`/demo/reel-${page.reel.n}.jpg`}
                label={page.reel.label}
                slate={page.reel.slate}
              />
            </div>
            <figcaption className="mt-4">
              <span className="flex items-start gap-1 text-dim">
                <HandArrow kind="down" className="h-9 w-5 shrink-0 rotate-[200deg]" />
                <Note className="mt-3 rotate-2 text-[20px]">{SEO_UI.reelNote}</Note>
              </span>
              <span className="mt-2 block text-xs leading-snug text-faint">{SEO_UI.reelFootnote}</span>
            </figcaption>
          </figure>
        </section>

        {/* Как это работает: три шага-карточки */}
        <section id="how" className="scroll-mt-20 border-y-2 border-dashed border-line-strong">
          <div className="mx-auto max-w-5xl px-5 py-12 md:py-20">
            <h2 className={H2}>
              <Marked text={SEO_UI.how.title} mark={SEO_UI.how.mark} />
            </h2>
            <ol className="mt-8 grid grid-cols-1 gap-7 md:mt-10 md:grid-cols-3 md:gap-8">
              {page.steps.map((s, i) => (
                <li key={s.title} className={`relative bg-panel px-6 pb-6 pt-7 ${PAPER_SHADOW} ${TILT[i]}`}>
                  <span className="tape -top-3 left-8 -rotate-3" aria-hidden="true" />
                  <Note className="block text-[34px] leading-none text-rec">
                    <span aria-hidden="true">{i + 1}.</span>
                  </Note>
                  <h3 className="mt-2 text-[19px] font-bold leading-snug">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-dim">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Что умеет — именно для этого запроса */}
        <section className="mx-auto max-w-5xl px-5 py-12 md:py-20">
          <h2 className={H2}>
            <Marked text={page.benefits.title} mark={page.benefits.mark} />
          </h2>
          <ul className="mt-8 grid grid-cols-1 gap-x-12 gap-y-7 md:mt-10 md:grid-cols-2">
            {page.benefits.items.map((b) => (
              <li key={b.title} className="flex gap-3">
                <HandCheck className="mt-1 h-5 w-5 shrink-0 text-rec" />
                <div>
                  <h3 className="text-[17px] font-bold sm:text-[18px]">{b.title}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-dim sm:text-base">{b.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Коротко в строках: форматы, настройки, ограничения */}
        {page.table && (
          <section className="bg-raised/60">
            <div className="mx-auto max-w-5xl px-5 py-12 md:py-20">
              <h2 className={H2}>
                <Marked text={page.table.title} mark={page.table.mark} />
              </h2>
              {page.table.lead && <p className="mt-3 max-w-xl text-[15px] text-dim sm:text-[17px]">{page.table.lead}</p>}
              <div className={`relative mt-8 max-w-3xl -rotate-[0.4deg] bg-panel px-6 py-5 sm:px-8 md:mt-10 ${PAPER_SHADOW}`}>
                <span className="tape -top-3 right-10 rotate-3" aria-hidden="true" />
                <dl>
                  {page.table.rows.map(([k, v]) => (
                    <div
                      key={k}
                      className="grid grid-cols-1 gap-1 border-b-2 border-dashed border-line py-3.5 last:border-b-0 sm:grid-cols-[190px_1fr] sm:gap-6"
                    >
                      <dt className="font-mono text-[12px] uppercase leading-relaxed tracking-wider text-faint sm:pt-0.5">{k}</dt>
                      <dd className="text-[15.5px] leading-relaxed">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </section>
        )}

        {/* Прайс чеком — там, где разговор про оплату в рублях */}
        {page.prices && (
          <section className="mx-auto max-w-3xl px-5 py-12 md:py-20">
            <h2 className={H2}>
              <Marked text={SEO_UI.prices.title} mark={SEO_UI.prices.mark} />
            </h2>
            <p className="mt-3 max-w-xl text-[15px] text-dim sm:text-[17px]">{pricing.lead}</p>
            <PriceReceipt t={pricing} />
          </section>
        )}

        {/* Кому подойдёт */}
        <section className="mx-auto max-w-5xl px-5 py-12 md:py-20">
          <h2 className={H2}>
            <Marked text={page.audience.title} mark={page.audience.mark} />
          </h2>
          <ul className="mt-8 grid grid-cols-1 gap-7 md:mt-10 md:grid-cols-3 md:gap-8">
            {page.audience.items.map((a) => (
              <li key={a.title} className="border-t-2 border-fg pt-4">
                <h3 className="text-[18px] font-bold leading-snug">{a.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-dim">{a.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Вопросы (раскрываются) — те же, что в разметке FAQPage */}
        <section id="faq" className="scroll-mt-20 border-t-2 border-dashed border-line-strong">
          <div className="mx-auto max-w-3xl px-5 py-12 md:py-20">
            <h2 className={H2}>
              <Marked text={SEO_UI.faq.title} mark={SEO_UI.faq.mark} />
            </h2>
            <div className="mt-6 border-t border-line md:mt-8">
              {page.faq.map(([q, a], i) => (
                <details key={q} name="faq" open={i === 0} className="faq-item border-b border-line">
                  <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[16px] font-bold sm:min-h-14 sm:py-4 sm:text-[18px]">
                    {q}
                    <HandPlus className="faq-plus h-5 w-5 shrink-0 text-rec" />
                  </summary>
                  <p className="-mt-1 pb-4 pr-9 text-[15px] leading-relaxed text-dim sm:pb-5 sm:text-base">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Соседние страницы и главная — чтобы поисковик и человек нашли остальное */}
        <nav aria-labelledby="more-title" className="mx-auto max-w-5xl px-5 pb-6 pt-4 md:pb-10">
          <h2 id="more-title" className={H2}>
            <Marked text={SEO_UI.more.title} mark={SEO_UI.more.mark} />
          </h2>
          <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:mt-8">
            {others.map((s) => (
              <li key={s}>
                <Link
                  href={`/${s}`}
                  className="group flex h-full items-start justify-between gap-4 rounded-sm bg-panel px-5 py-4 shadow-[0_14px_30px_-24px_rgba(60,40,10,.6)] transition-transform hover:-rotate-[0.6deg]"
                >
                  <span>
                    <span className="block text-[17px] font-bold group-hover:underline">{SEO_PAGES[s].card.label}</span>
                    <span className="mt-1 block text-[14.5px] leading-relaxed text-dim">{SEO_PAGES[s].card.text}</span>
                  </span>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium underline decoration-dotted decoration-2 underline-offset-4 hover:decoration-solid"
            >
              {SEO_UI.home}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </p>
          {page.footnote && <p className="mt-6 text-xs text-faint">{page.footnote}</p>}
        </nav>

        {/* Финал: хлопушка с призывом */}
        <FinalClap t={page.final} />
        <RevealObserver key={slug} />
      </main>

      <SiteFooter logoLabel={chrome.logoHome} />
      {/* Для поисковиков: вопросы-ответы и «хлебные крошки» в сниппете (на странице не видно) */}
      <JsonLd data={faqLd(page.faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Clipzy", url: `${SITE_URL}/` },
          { name: page.card.label, url: `${SITE_URL}/${slug}` },
        ])}
      />
    </div>
  );
}
