"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import LangSwitch from "@/components/LangSwitch";
import Logo from "@/components/Logo";
import { authClient, authErrorText } from "@/lib/auth-client";
import { useLocale } from "@/i18n/client";
import auth from "@/i18n/dict/auth";

type AuthError = { code?: string; message?: string; status?: number };

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const locale = useLocale();
  const t = auth[locale].reset;
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // Храним саму ошибку, а не текст: при смене языка сообщение перерисуется
  const [error, setError] = useState<AuthError | null>(params.get("error") ? { code: "INVALID_TOKEN" } : null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    if (error) setError(error);
    else setDone(true);
  }

  if (done) {
    return (
      <div className="text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-signal/15">
          <Check className="h-5 w-5 text-signal" />
        </span>
        <p className="mt-4 font-medium">{t.done}</p>
        <Link href="/login?mode=signin" className="mt-5 inline-block text-sm underline underline-offset-4">
          {t.loginWithNew}
        </Link>
      </div>
    );
  }

  if (!token || error?.code === "INVALID_TOKEN") {
    return (
      <div className="text-center">
        <p className="font-medium">{t.invalidTitle}</p>
        <p className="mt-1 text-sm text-dim">{t.invalidText}</p>
        <Link href="/login?mode=signin" className="mt-5 inline-block text-sm underline underline-offset-4">
          {t.toLogin}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="new-password" className="text-sm text-dim">
        {t.label}
      </label>
      <input
        id="new-password"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t.placeholder}
        className="h-11 w-full rounded-lg border border-line-strong bg-panel px-3.5 text-[15px] outline-none focus:border-dim"
      />
      {error && <p className="text-sm text-rec">{authErrorText(error, locale)}</p>}
      <button
        disabled={busy}
        className="flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-signal font-semibold text-on-signal disabled:opacity-60"
      >
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : t.save}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = auth[useLocale()].reset;
  return (
    <main className="paper flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-5">
        <Logo />
        <LangSwitch />
      </header>
      <div className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm rounded-2xl border border-line p-6">
          <h1 className="mb-5 text-xl font-semibold">{t.title}</h1>
          <Suspense>
            <ResetForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
