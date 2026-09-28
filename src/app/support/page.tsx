import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Inbox, Mail, Send } from "lucide-react";
import LangSwitch from "@/components/LangSwitch";
import Logo from "@/components/Logo";
import SiteFooter from "@/components/SiteFooter";
import { getLocale } from "@/i18n/server";
import landing from "@/i18n/dict/landing";
import supportDict from "@/i18n/dict/support";
import { auth, authReady } from "@/lib/auth";
import { SUPPORT } from "@/lib/support";
import SupportForm from "./SupportForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: supportDict[await getLocale()].support.metaTitle };
}

/** Поддержка: контакты и форма обращения (обращения сохраняются и видны создателю на /support/inbox). */
export default async function SupportPage() {
  const locale = await getLocale();
  const t = supportDict[locale];
  const logoLabel = landing[locale].logoHome;

  // Почту вошедшего подставляем сами; если вход сейчас не работает — форма всё равно открывается
  let email = "";
  let creator = false;
  try {
    await authReady();
    const session = await auth.api.getSession({ headers: await headers() });
    const user = session?.user as { email?: string; isAnonymous?: boolean; plan?: string } | undefined;
    if (user && !user.isAnonymous) email = user.email ?? "";
    creator = user?.plan === "creator";
  } catch {
    // без сессии
  }

  const contacts = [
    SUPPORT.email && { href: `mailto:${SUPPORT.email}`, icon: Mail, label: t.footer.email, value: SUPPORT.email },
    SUPPORT.telegram && { href: `https://t.me/${SUPPORT.telegram}`, icon: Send, label: t.footer.telegram, value: `@${SUPPORT.telegram}` },
    SUPPORT.bot && { href: `https://t.me/${SUPPORT.bot}`, icon: Send, label: t.footer.bot, value: `@${SUPPORT.bot}` },
  ].filter(Boolean) as { href: string; icon: typeof Mail; label: string; value: string }[];

  return (
    <div className="paper flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-5">
        <Logo label={logoLabel} />
        <LangSwitch />
      </header>
      <main className="flex-1 px-5 pb-20 pt-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-[38px] font-extrabold tracking-[-0.03em] sm:text-[48px]">{t.support.title}</h1>
            {creator && (
              <Link
                href="/support/inbox"
                className="mt-3 inline-flex items-center gap-2 rounded-md border border-line-strong px-3 py-1.5 text-sm hover:bg-raised"
              >
                <Inbox className="h-4 w-4" aria-hidden="true" /> {t.support.inboxTitle}
              </Link>
            )}
          </div>
          <p className="mt-3 max-w-xl text-[17px] leading-relaxed text-dim">{t.support.lead}</p>

          <div className={`mt-10 grid gap-8 ${contacts.length ? "md:grid-cols-[1fr_1.6fr]" : ""}`}>
            {contacts.length > 0 && (
              <section>
                <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-faint">{t.support.contactsTitle}</h2>
                <ul className="space-y-3">
                  {contacts.map((c) => (
                    <li key={c.href}>
                      <a href={c.href} className="group flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 hover:border-dim">
                        <c.icon className="h-4 w-4 shrink-0 text-dim" aria-hidden="true" />
                        <span>
                          <span className="block text-xs text-faint">{c.label}</span>
                          <span className="font-medium group-hover:underline">{c.value}</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="rounded-sm bg-panel px-6 py-7 shadow-[0_20px_50px_-30px_rgba(60,40,10,0.5)] sm:px-8">
              <h2 className="mb-5 text-[20px] font-semibold">{t.support.formTitle}</h2>
              <SupportForm defaultEmail={email} />
            </section>
          </div>
        </div>
      </main>
      <SiteFooter logoLabel={logoLabel} />
    </div>
  );
}
