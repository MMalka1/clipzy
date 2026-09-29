"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Gift, LoaderCircle, X } from "lucide-react";
import { useLocale } from "@/i18n/client";
import growth from "@/i18n/dict/growth";
import { PROMO_COOKIE, PROMO_EVENT, forgetPromo, normalizeCode, readCookie } from "@/lib/attribution";
import { authClient } from "@/lib/auth-client";
import { effectivePlan } from "@/lib/plan";

function subscribe(onChange: () => void) {
  window.addEventListener(PROMO_EVENT, onChange);
  return () => window.removeEventListener(PROMO_EVENT, onChange);
}
const readPromo = () => normalizeCode(readCookie(document.cookie, PROMO_COOKIE));

type Info = { code: string; days: number; plan: string };
type SessionUser = { isAnonymous?: boolean | null; plan?: string; planUntil?: string | null };

/**
 * Тонкая полоска «Промокод X: N дней Pro бесплатно», пока промокод из ссылки ещё не включён.
 * Гостю — «зарегистрируйтесь» (включится сам при регистрации), вошедшему на Free — кнопка «Включить».
 * bar — полоса над шапкой лендинга; float — карточка внизу экрана (в редакторе, чтобы не сдвигать его вёрстку).
 */
export default function PromoBanner({ variant = "bar" }: { variant?: "bar" | "float" }) {
  const locale = useLocale();
  const t = growth[locale].promo;
  const code = useSyncExternalStore(subscribe, readPromo, () => null);
  const { data, isPending, refetch } = authClient.useSession();
  const [info, setInfo] = useState<Info | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    if (!code) return;
    let alive = true;
    fetch(`/api/promo?code=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { valid?: boolean; days?: number; plan?: string } | null) => {
        if (!alive || !d) return;
        if (d.valid) setInfo({ code, days: Number(d.days) || 0, plan: d.plan || "pro" });
        else forgetPromo(); // кода нет или он закончился — не показываем и не пробуем при регистрации
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [code]);

  const user = data?.user as SessionUser | undefined;
  const member = Boolean(user && !user.isAnonymous);

  async function activate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || t.errors.failed);
      const date = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "long" });
      setDone(t.activated(d.plan, date.format(new Date(d.until))));
      forgetPromo();
      refetch();
      // Движок верит плану из токена — берём новый, чтобы экспорт шёл уже без водяного знака
      import("@/lib/engine").then((m) => m.engineSession(true)).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.failed);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setHidden(true);
    // Вошедший сам закрыл — больше не предлагаем (код можно ввести в профиле). Гостю код ещё пригодится при регистрации
    if (member) forgetPromo();
  }

  const current = info && info.code === code ? info : null;
  if (hidden) return null;
  if (!done && (!current || isPending || (member && effectivePlan(user!) !== "free"))) return null;

  const box =
    variant === "bar"
      ? "relative z-50 bg-signal text-on-signal"
      : "fixed inset-x-3 bottom-3 z-50 rounded-xl bg-signal text-on-signal shadow-[0_18px_40px_-16px_rgba(0,0,0,0.6)] lg:left-auto lg:max-w-md";

  return (
    <div role="status" className={box}>
      <div className={`flex items-center gap-3 text-[13px] leading-snug sm:text-sm ${variant === "bar" ? "mx-auto max-w-5xl px-4 py-2" : "px-4 py-3"}`}>
        <Gift className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          {done || (
            <>
              <b className="font-semibold">{t.banner(current!.code, current!.days, current!.plan)}</b> —{" "}
              {error || (member ? t.userTail : (
                <>
                  {/* На телефоне кнопка не помещается — ссылкой становится сам текст */}
                  <Link href="/login?mode=signup" className="underline underline-offset-2 sm:hidden">
                    {t.guestTail}
                  </Link>
                  <span className="max-sm:hidden">{t.guestTail}</span>
                </>
              ))}
            </>
          )}
        </p>
        {!done &&
          (member ? (
            <button
              type="button"
              onClick={activate}
              disabled={busy}
              className="flex h-8 shrink-0 cursor-pointer items-center rounded-full bg-[#0b0b0b] px-3.5 text-[13px] font-semibold text-signal disabled:opacity-60"
            >
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : t.activate}
            </button>
          ) : (
            <Link
              href="/login?mode=signup"
              className="flex h-8 shrink-0 items-center rounded-full bg-[#0b0b0b] px-3.5 text-[13px] font-semibold text-signal max-sm:hidden"
            >
              {t.signUp}
            </Link>
          ))}
        <button
          type="button"
          onClick={close}
          aria-label={t.hide}
          title={t.hide}
          className="-mr-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-black/10"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
