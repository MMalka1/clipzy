import { headers } from "next/headers";
import growth from "@/i18n/dict/growth";
import { getLocale } from "@/i18n/server";
import { PROMO_COOKIE } from "@/lib/attribution";
import { auth, authReady } from "@/lib/auth";
import { clientIp, hit } from "@/lib/db";
import { promoInfo, redeemPromo } from "@/lib/promo";

/** Для баннера: действует ли промокод и что даёт. Лимит — чтобы коды не перебирали. */
export async function GET(request: Request) {
  if (!(await hit(`promo-info:${clientIp(await headers())}`, 30, 600))) {
    return Response.json({ valid: false, days: 0, plan: null }, { status: 429 });
  }
  const code = new URL(request.url).searchParams.get("code");
  return Response.json(await promoInfo(code), { headers: { "Cache-Control": "no-store" } });
}

/** Включить промокод на свой аккаунт (форма в профиле, кнопка в баннере). */
export async function POST(request: Request) {
  const t = growth[await getLocale()].promo.errors;
  const h = await headers();
  await authReady();
  const session = await auth.api.getSession({ headers: h });
  const user = session?.user as
    | { id: string; isAnonymous?: boolean | null; plan?: string; planUntil?: Date | string | null; source?: string | null }
    | undefined;
  if (!user || user.isAnonymous) return Response.json({ error: t.anon }, { status: 401 });
  if (!(await hit(`promo:u:${user.id}`, 10, 3600)) || !(await hit(`promo:ip:${clientIp(h)}`, 30, 3600))) {
    return Response.json({ error: t.tooMany }, { status: 429 });
  }
  const body = await request.json().catch(() => null);
  try {
    const r = await redeemPromo(user, body?.code);
    if (!r.ok) {
      return Response.json({ error: t[r.error] ?? t.failed, code: r.error }, { status: r.error === "already" || r.error === "plan" ? 409 : 400 });
    }
    // Промокод включён — cookie с ним больше не нужна (баннер пропадёт)
    return Response.json(
      { ok: true, plan: r.plan, until: r.until.toISOString() },
      { headers: { "Set-Cookie": `${PROMO_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax` } },
    );
  } catch (e) {
    console.error("[promo] не удалось включить:", e instanceof Error ? e.message : e);
    return Response.json({ error: t.failed }, { status: 500 });
  }
}
