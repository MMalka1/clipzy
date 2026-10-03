import { headers } from "next/headers";
import growth from "@/i18n/dict/growth";
import { getLocale } from "@/i18n/server";
import { auth, authReady } from "@/lib/auth";
import { clientIp, hit } from "@/lib/db";
import { OFFERS, type OfferKey, paymentsEnabled, startPayment } from "@/lib/payments";

/** Начать оплату: создаём платёж и отдаём ссылку на страницу оплаты Platega. Только для своего аккаунта (не гостя). */
export async function POST(request: Request) {
  const t = growth[await getLocale()].pay;
  const h = await headers();
  await authReady();
  const session = await auth.api.getSession({ headers: h });
  const user = session?.user as { id: string; isAnonymous?: boolean | null } | undefined;
  if (!user || user.isAnonymous) return Response.json({ error: t.login }, { status: 401 });
  if (!paymentsEnabled()) return Response.json({ error: t.soon }, { status: 503 });
  if (!(await hit(`pay:u:${user.id}`, 10, 3600)) || !(await hit(`pay:ip:${clientIp(h)}`, 30, 3600))) {
    return Response.json({ error: t.tooMany }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as { offer?: string } | null;
  const key = (body?.offer ?? "pro") as OfferKey;
  if (!(key in OFFERS)) return Response.json({ error: t.failed }, { status: 400 });
  try {
    return Response.json({ url: await startPayment(user.id, key) });
  } catch (e) {
    console.error("[pay] не удалось создать платёж:", e instanceof Error ? e.message : e);
    return Response.json({ error: t.failed }, { status: 502 });
  }
}
