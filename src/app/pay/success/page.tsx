import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import LangSwitch from "@/components/LangSwitch";
import Logo from "@/components/Logo";
import growth from "@/i18n/dict/growth";
import { getLocale } from "@/i18n/server";
import { auth, authReady } from "@/lib/auth";
import { getPayment } from "@/lib/db";
import { effectivePlan } from "@/lib/plan";
import Refresh from "./Refresh";

export const metadata: Metadata = { title: "Оплата — Clipzy", robots: { index: false } };

/** Сюда Platega возвращает после оплаты. Тариф включает callback — здесь только показываем, дошёл ли он. */
export default async function PaySuccess({ searchParams }: PageProps<"/pay/success">) {
  const locale = await getLocale();
  const t = growth[locale].pay;
  await authReady();
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user as { id: string; plan?: string; planUntil?: Date | string | null } | undefined;
  const p = (await searchParams).p;
  const payment = user && typeof p === "string" && /^[0-9a-f-]{36}$/i.test(p) ? await getPayment(p) : null;
  const mine = payment && payment.user_id === user?.id ? payment : null;
  const paid = mine?.status === "paid";
  const plan = user ? effectivePlan(user) : "free";
  const until = paid && plan !== "free" && user?.planUntil ? new Date(user.planUntil) : null;
  const forever = paid && plan !== "free" && plan !== "creator" && !user?.planUntil;
  const planName = plan[0].toUpperCase() + plan.slice(1);
  const date = until
    ? new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "long", year: "numeric" }).format(until)
    : null;

  return (
    <main className="paper flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5">
        <Logo />
        <LangSwitch />
      </header>
      <div className="mx-auto w-full max-w-xl flex-1 px-5 pt-10">
        <h1 className="text-[34px] font-extrabold leading-tight tracking-[-0.03em]">{t.successTitle}</h1>
        <p className="mt-4 text-[18px] leading-relaxed text-dim">{forever ? t.forever(planName) : date ? t.active(planName, date) : t.waiting}</p>
        {mine && !paid && <Refresh />}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/app" className="inline-flex h-12 items-center rounded-xl bg-signal px-6 font-bold text-[#17140f] shadow-[0_3px_0_#17140f]">
            {t.toEditor}
          </Link>
          <Link href="/profile" className="inline-flex h-12 items-center rounded-xl border-2 border-fg px-6 font-semibold">
            {t.toProfile}
          </Link>
        </div>
      </div>
    </main>
  );
}
