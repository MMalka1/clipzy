import Link from "next/link";
import { Mail, Send } from "lucide-react";
import LangSwitch from "@/components/LangSwitch";
import Logo, { LogoIcon } from "@/components/Logo";
import { getLocale } from "@/i18n/server";
import supportDict from "@/i18n/dict/support";
import { SUPPORT } from "@/lib/support";

/** Подвал всех страниц: разделы сайта, документы и контакты поддержки (их проверяет платёжный провайдер). */
export default async function SiteFooter({ logoLabel }: { logoLabel: string }) {
  const t = supportDict[await getLocale()].footer;
  const cols = [
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
      title: t.docs,
      links: [
        { href: "/terms", label: t.terms },
        { href: "/privacy", label: t.privacy },
      ],
    },
  ];

  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-5 py-10 text-sm sm:grid-cols-2 md:grid-cols-[1.2fr_1fr_1fr_1.2fr]">
        <div className="flex flex-col items-start gap-4">
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
                  <Link href={l.href} className="hover:text-fg">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <div>
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-faint">{t.help}</h2>
          <ul className="space-y-2 text-dim">
            <li>
              <Link href="/support" className="font-medium text-fg hover:underline">
                {t.writeUs}
              </Link>
            </li>
            {SUPPORT.email && (
              <li>
                <a href={`mailto:${SUPPORT.email}`} className="inline-flex items-center gap-1.5 hover:text-fg">
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
