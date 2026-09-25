import type { Metadata } from "next";
import AuthForm from "@/components/AuthForm";
import LangSwitch from "@/components/LangSwitch";
import Logo from "@/components/Logo";
import { getProviders } from "@/lib/providers";
import { getLocale } from "@/i18n/server";
import auth from "@/i18n/dict/auth";

export async function generateMetadata(): Promise<Metadata> {
  return { title: auth[await getLocale()].meta.loginTitle };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" && params.next.startsWith("/") ? params.next : "/app";
  const mode = params.mode === "signin" ? "signin" : "signup";
  const verified = params.verified === "1";
  const t = auth[await getLocale()].login;

  return (
    <main className="paper flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-5">
        <Logo />
        <LangSwitch />
      </header>
      <div className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-center text-[28px] font-semibold tracking-[-0.03em]">
            {mode === "signin" ? t.welcomeBack : t.signupTitle}
          </h1>
          <p className="mt-2 text-center text-dim">{t.sub}</p>
          {verified && (
            <p className="mt-4 rounded-lg border border-signal/30 bg-signal/10 px-3 py-2 text-center text-sm">
              {t.verified}
            </p>
          )}
          <div className="mt-8 rounded-2xl bg-panel p-6 shadow-[0_20px_50px_-30px_rgba(60,40,10,0.5)]">
            <AuthForm providers={getProviders()} initialMode={mode} callbackURL={next} />
          </div>
        </div>
      </div>
    </main>
  );
}
