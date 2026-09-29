import type { Locale } from "@/i18n/config";
import landing from "@/i18n/dict/landing";
import { SITE_URL } from "./support";

/** Структурированные данные schema.org для поисковиков (выводит компонент JsonLd). */
type Ld = Record<string, unknown>;

const CONTEXT = "https://schema.org";

/** Цена из прайса («2 490 ₽ / мес») — числом, как ждёт schema.org: «2490». */
const rub = (price: string) => price.replace(/\D/g, "");

const monthly = (price: string) => ({
  "@type": "UnitPriceSpecification",
  price: rub(price),
  priceCurrency: "RUB",
  referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" },
});

/** Clipzy как веб-приложение. Цены — из прайса главной и всегда в рублях, подписи — на языке страницы. */
export function appLd(locale: Locale): Ld {
  const t = landing[locale];
  const rubPlans = landing.ru.pricing.plans;
  const offers: Ld[] = t.pricing.plans.map((p, i) => ({
    "@type": "Offer",
    name: p.name,
    // платные планы пока не продаются — так и пишем («после беты»); заметки из прайса не берём: в EN там доллары
    ...(!p.now && { description: p.status }),
    price: rub(rubPlans[i].price),
    priceCurrency: "RUB",
    ...(rub(rubPlans[i].price) !== "0" && { priceSpecification: monthly(rubPlans[i].price) }),
  }));
  const studio = t.pricing.plans[2];
  offers.push({
    "@type": "Offer",
    name: `${studio.name} · ${t.pricing.receipt.stamp[0]}`,
    description: `${t.pricing.receipt.stamp[2]}, ${studio.status}`,
    price: rub(landing.ru.pricing.receipt.stamp[1]),
    priceCurrency: "RUB",
  });
  return {
    "@context": CONTEXT,
    "@type": "SoftwareApplication",
    name: "Clipzy",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    image: `${SITE_URL}/og/${locale}.png`,
    description: t.hero.lead,
    inLanguage: locale,
    featureList: t.features.items.map(([title]) => title),
    offers,
  };
}

/** Вопросы и ответы страницы — те же, что видны в блоке «Частые вопросы». */
export function faqLd(items: [string, string][]): Ld {
  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    mainEntity: items.map(([q, a]) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

/** «Хлебные крошки» для сниппета: главная → страница. */
export function breadcrumbLd(items: { name: string; url: string }[]): Ld {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  };
}
