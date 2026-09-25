"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { authClient, authErrorText } from "@/lib/auth-client";
import { useLocale } from "@/i18n/client";
import auth from "@/i18n/dict/auth";

export type Providers = { google: boolean; telegram: boolean; telegramBot: string | null };
type Mode = "signin" | "signup" | "forgot";

const input =
  "h-11 w-full rounded-lg border border-line-strong bg-panel px-3.5 text-[15px] outline-none transition-colors placeholder:text-faint focus:border-dim";

export default function AuthForm({
  providers,
  initialMode = "signup",
  callbackURL = "/app",
  onSuccess,
}: {
  providers: Providers;
  initialMode?: Mode;
  callbackURL?: string;
  /** Для окна в редакторе: не уходить со страницы, а продолжить работу */
  onSuccess?: () => void;
}) {
  const locale = useLocale();
  const t = auth[locale].form;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        if (error) throw error;
        setSent(true);
        return;
      }
      const { error } =
        mode === "signup"
          ? await authClient.signUp.email({ name: name.trim() || email.split("@")[0], email, password, callbackURL: "/login?verified=1" })
          : await authClient.signIn.email({ email, password });
      if (error) throw error;
      if (onSuccess) onSuccess();
      else window.location.href = callbackURL;
    } catch (err) {
      setError(authErrorText(err as { code?: string; message?: string; status?: number }, locale));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError("");
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL });
    if (error) setError(authErrorText(error, locale));
  }

  if (mode === "forgot" && sent) {
    return (
      <div className="text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-signal/15">
          <Check className="h-5 w-5 text-signal" />
        </span>
        <p className="mt-4 font-medium">{t.sentTitle}</p>
        <p className="mt-1 text-sm text-dim">{t.sentText(email)}</p>
        <button onClick={() => { setMode("signin"); setSent(false); }} className="mt-5 cursor-pointer text-sm text-fg underline underline-offset-4">
          {t.backToSignin}
        </button>
      </div>
    );
  }

  return (
    <div>
      {mode !== "forgot" && (
        <div role="tablist" className="mb-6 grid grid-cols-2 rounded-lg border border-line-strong p-1">
          {(
            [
              ["signup", t.signup],
              ["signin", t.signin],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => { setMode(m); setError(""); }}
              className={`h-9 cursor-pointer rounded-md text-sm font-medium transition-colors ${
                mode === m ? "bg-fg text-ink" : "text-dim hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {mode !== "forgot" && (providers.google || providers.telegram) && (
        <>
          <div className="space-y-2.5">
            {providers.telegram && providers.telegramBot && (
              <TelegramButton bot={providers.telegramBot} callbackURL={callbackURL} lang={locale} />
            )}
            {providers.google && (
              <button
                onClick={google}
                className="flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg border border-line-strong bg-panel text-[15px] font-medium transition-colors hover:bg-raised"
              >
                <GoogleIcon /> {t.google}
              </button>
            )}
          </div>
          <div className="my-5 flex items-center gap-3 font-mono text-[11px] uppercase tracking-wider text-faint">
            <div className="h-px flex-1 bg-line" /> {t.orEmail} <div className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form onSubmit={submit} className="space-y-3">
        {mode === "forgot" && (
          <p className="text-sm text-dim">{t.forgotHint}</p>
        )}
        {mode === "signup" && (
          <div>
            <label htmlFor="auth-name" className="sr-only">{t.name}</label>
            <input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.name} autoComplete="name" className={input} />
          </div>
        )}
        <div>
          <label htmlFor="auth-email" className="sr-only">{t.email}</label>
          <input
            id="auth-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.email}
            autoComplete="email"
            className={input}
          />
        </div>
        {mode !== "forgot" && (
          <div className="relative">
            <label htmlFor="auth-password" className="sr-only">{t.password}</label>
            <input
              id="auth-password"
              type={show ? "text" : "password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? t.passwordNew : t.password}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className={`${input} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? t.hidePassword : t.showPassword}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center text-faint hover:text-fg"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-rec">
            {error}
          </p>
        )}
        <button
          disabled={busy}
          className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-signal font-semibold text-on-signal transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <>
              {mode === "signup" ? t.createAccount : mode === "signin" ? t.logIn : t.sendLink}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-4 text-center text-sm">
        {mode === "signin" && (
          <button onClick={() => { setMode("forgot"); setError(""); }} className="cursor-pointer text-dim hover:text-fg">
            {t.forgot}
          </button>
        )}
        {mode === "forgot" && (
          <button onClick={() => { setMode("signin"); setError(""); }} className="cursor-pointer text-dim hover:text-fg">
            {t.remembered}
          </button>
        )}
        {mode === "signup" && (
          <p className="text-xs leading-relaxed text-faint">
            {t.terms}
          </p>
        )}
      </div>
    </div>
  );
}

/** Официальный виджет Telegram: после входа Telegram сам перенаправит на наш адрес с подписью. */
function TelegramButton({ bot, callbackURL, lang }: { bot: string; callbackURL: string; lang: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", bot);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "8");
    s.setAttribute("data-request-access", "write");
    s.setAttribute("data-lang", lang);
    s.setAttribute(
      "data-auth-url",
      `${window.location.origin}/api/auth/sign-in/telegram?callbackURL=${encodeURIComponent(callbackURL)}`,
    );
    el.replaceChildren(s);
  }, [bot, callbackURL, lang]);
  return <div ref={box} className="flex min-h-11 justify-center" />;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.9-5.4 3.9-3.3 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}
