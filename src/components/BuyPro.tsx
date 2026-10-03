"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/i18n/client";
import growth from "@/i18n/dict/growth";

type Offer = "pro" | "studio" | "studio_forever";
const OFFERS: Offer[] = ["pro", "studio", "studio_forever"];

/**
 * Выбор и покупка тарифа: Pro или Studio, у Studio — месяц или навсегда; цена на кнопке меняется.
 * Не вошли — ведём на вход и возвращаем сюда с ?buy=<тариф>, тогда оплата открывается сама.
 * Ссылку на оплату даёт сервер (/api/pay) — ключи Platega в браузер не попадают.
 */
export default function BuyPro({ className = "" }: { className?: string }) {
  const t = growth[useLocale()].pay;
  const router = useRouter();
  const [plan, setPlan] = useState<"pro" | "studio">("pro");
  const [forever, setForever] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const auto = useRef(false);
  const offer: Offer = plan === "pro" ? "pro" : forever ? "studio_forever" : "studio";

  async function buy(which: Offer = offer) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer: which }),
      });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (res.status === 401) {
        router.push(`/login?next=${encodeURIComponent(`/?buy=${which}#pricing`)}`);
        return;
      }
      if (!res.ok || !data?.url) throw new Error(data?.error || t.failed);
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failed);
      setBusy(false);
    }
  }

  // Вернулись после входа с ?buy=… — выбираем тот же тариф и открываем оплату (один раз)
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("buy") as Offer | null;
    if (auto.current || !want || !OFFERS.includes(want)) return;
    auto.current = true;
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    setPlan(want === "pro" ? "pro" : "studio");
    setForever(want === "studio_forever");
    buy(want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seg = (on: boolean) =>
    `h-10 flex-1 cursor-pointer rounded-lg text-[15px] font-semibold transition-colors ${on ? "bg-fg text-ink" : "text-dim hover:text-fg"}`;

  return (
    <div className={`mx-auto flex w-full max-w-sm flex-col items-stretch gap-3 ${className}`}>
      <div role="radiogroup" aria-label={t.plans.pro + " / " + t.plans.studio} className="flex rounded-xl border-2 border-fg p-1">
        {(["pro", "studio"] as const).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={plan === p} onClick={() => setPlan(p)} className={seg(plan === p)}>
            {t.plans[p]}
          </button>
        ))}
      </div>
      {plan === "studio" && (
        <div role="radiogroup" aria-label={t.periods.month + " / " + t.periods.forever} className="flex rounded-xl border border-line-strong p-1">
          {([false, true] as const).map((f) => (
            <button key={String(f)} type="button" role="radio" aria-checked={forever === f} onClick={() => setForever(f)} className={seg(forever === f)}>
              {f ? t.periods.forever : t.periods.month}
            </button>
          ))}
        </div>
      )}
      <p className="text-center text-[15px] leading-snug text-dim">{t.perks[offer]}</p>
      <button
        type="button"
        onClick={() => buy()}
        disabled={busy}
        className="flex h-14 cursor-pointer flex-col items-center justify-center rounded-xl bg-signal px-6 text-[#17140f] shadow-[0_3px_0_#17140f] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70"
      >
        {busy ? (
          <span className="text-[17px] font-bold">{t.going}</span>
        ) : (
          <>
            <span className="text-[17px] font-bold leading-tight">{t.buy(t.plans[plan])}</span>
            <span className="text-[13px] font-semibold leading-tight">{t.price[offer]}</span>
          </>
        )}
      </button>
      <p className="text-center text-sm text-dim">{t.note}</p>
      {error && (
        <p role="alert" className="text-center text-sm text-rec">
          {error}
        </p>
      )}
    </div>
  );
}
