import Link from "next/link";
import { Mail, Send } from "lucide-react";
import LangSwitch from "@/components/LangSwitch";
import Logo, { LogoIcon } from "@/components/Logo";
import { getLocale } from "@/i18n/server";
import supportDict from "@/i18n/dict/support";
import { SEO_SLUGS } from "@/lib/seo-pages";
import { SUPPORT } from "@/lib/support";

/** Подвал всех страниц: разделы сайта, решения (SEO-страницы), документы и контакты поддержки (их проверяет платёжный провайдер). */
export default async function SiteFooter({ logoLabel }: { logoLabel: string }) {
  const t = supportDict[await getLocale()].footer;
  const cols: { title: string; links: { href: string; label: string; hrefLang?: string }[] }[] = [
    {
      title: t.product,
      links: [
        { href: "/#example", label: t.example },
        { href: "/#features", label: t.features },
        { href: "/#pricing", label: t.pricing },
        { href: "/#faq", label: t.faq },
        { href: "/app", label: t.editor },
      ],
    },
    {
      title: t.useCases,
      // страницы только на русском — подсказываем это и браузеру, и поисковику
      links: SEO_SLUGS.map((s) => ({ href: `/${s}`, label: t.useCaseLinks[s], hrefLang: "ru" })),
    },
    {
      title: t.docs,
      links: [
        { href: "/terms", label: t.terms },
        { href: "/privacy", label: t.privacy },
      ],
    },
  ];

  return (
    <footer className="border-t border-line">
      {/* Логотип — отдельной строкой, пока пять колонок не влезают (телефон и планшет) */}
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-x-6 gap-y-8 px-5 py-8 text-sm md:grid-cols-4 md:py-10 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1.2fr]">
        <div className="col-span-2 flex flex-wrap items-center justify-between gap-4 md:col-span-4 lg:col-span-1 lg:flex-col lg:flex-nowrap lg:items-start lg:justify-start">
          <Logo size="sm" label={logoLabel} />
          <LangSwitch />
          <span className="flex items-center gap-2 text-dim">
            <LogoIcon className="h-5 w-5" /> © 2026 Clipzy
          </span>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-faint">{c.title}</h2>
            <ul className="space-y-2 text-dim">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} hrefLang={l.hrefLang} className="hover:text-fg">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <div className="min-w-0">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-faint">{t.help}</h2>
          <ul className="space-y-2 text-dim">
            <li>
              <Link href="/support" className="font-medium text-fg hover:underline">
                {t.writeUs}
              </Link>
            </li>
            {SUPPORT.email && (
              <li>
                <a href={`mailto:${SUPPORT.email}`} className="inline-flex items-center gap-1.5 [overflow-wrap:anywhere] hover:text-fg">
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" /> {SUPPORT.email}
                </a>
              </li>
            )}
            {SUPPORT.telegram && (
              <li>
                <a href={`https://t.me/${SUPPORT.telegram}`} className="inline-flex items-center gap-1.5 hover:text-fg" rel="noopener">
                  <Send className="h-3.5 w-3.5" aria-hidden="true" /> @{SUPPORT.telegram}
                </a>
              </li>
            )}
            {SUPPORT.bot && (
              <li>
                <a href={`https://t.me/${SUPPORT.bot}`} className="inline-flex items-center gap-1.5 hover:text-fg" rel="noopener">
                  <Send className="h-3.5 w-3.5" aria-hidden="true" /> {t.bot}: @{SUPPORT.bot}
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
    </footer>
  );
}
