import Link from "next/link";
import LangSwitch from "@/components/LangSwitch";
import Logo from "@/components/Logo";
import SiteFooter from "@/components/SiteFooter";
import { getLocale } from "@/i18n/server";
import landing from "@/i18n/dict/landing";
import supportDict from "@/i18n/dict/support";
import type { LegalDoc } from "@/lib/legal";
import { LEGAL_DATE } from "@/lib/support";

/** Страница документа: политика конфиденциальности или пользовательское соглашение. */
export default async function LegalPage({ doc, other }: { doc: LegalDoc; other: "privacy" | "terms" }) {
  const locale = await getLocale();
  const t = supportDict[locale].legal;
  const logoLabel = landing[locale].logoHome;

  return (
    <div className="paper flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-5">
        <Logo label={logoLabel} />
        <LangSwitch />
      </header>
      <main className="flex-1 px-5 pb-20 pt-6">
        <article className="mx-auto max-w-3xl rounded-sm bg-panel px-6 py-10 shadow-[0_20px_50px_-30px_rgba(60,40,10,0.5)] sm:px-12">
          <h1 className="text-[30px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[38px]">{doc.title}</h1>
          <p className="mt-2 font-mono text-xs text-faint">
            {t.edition} {LEGAL_DATE}
          </p>
          {t.enNote && <p className="mt-4 rounded-md bg-raised px-3 py-2 text-sm text-dim">{t.enNote}</p>}
          {doc.intro && <p className="mt-6 text-[16px] leading-relaxed text-dim">{doc.intro}</p>}
          {doc.sections.map((s) => (
            <section key={s.title} className="mt-8">
              <h2 className="text-[19px] font-semibold">{s.title}</h2>
              <div className="mt-3 space-y-2.5 text-[15.5px] leading-relaxed">
                {s.items.map((item, i) =>
                  Array.isArray(item) ? (
                    <ul key={i} className="list-disc space-y-1.5 pl-6 marker:text-faint">
                      {item.map((li) => (
                        <li key={li}>{li}</li>
                      ))}
                    </ul>
                  ) : (
                    <p key={i}>{item}</p>
                  ),
                )}
              </div>
            </section>
          ))}
          {doc.outro && <p className="mt-8 border-t border-line pt-6 text-[15px] leading-relaxed text-dim">{doc.outro}</p>}
          <p className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/" className="text-dim hover:text-fg">
              ← {t.back}
            </Link>
            <Link href={`/${other}`} className="text-dim hover:text-fg">
              {supportDict[locale].footer[other]}
            </Link>
          </p>
        </article>
      </main>
      <SiteFooter logoLabel={logoLabel} />
    </div>
  );
}
