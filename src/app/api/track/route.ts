import { headers } from "next/headers";
import { isGoal } from "@/lib/analytics";
import { sourceFromCookie } from "@/lib/attribution";
import { auth, authReady } from "@/lib/auth";
import { clientIp, hit, recordEvent } from "@/lib/db";

/**
 * Цели воронки из браузера (track() в lib/analytics.ts). Имя — только из списка GOALS;
 * кто и откуда пришёл — берём из сессии (или из cookie с метками), а не из тела запроса.
 */
export async function POST(request: Request) {
  const h = await headers();
  // Честному посетителю хватит с большим запасом; скрипт, накручивающий статистику, упрётся
  if (!(await hit(`track:${clientIp(h)}`, 60, 600))) return new Response(null, { status: 429 });
  const body = await request.json().catch(() => null);
  const name: unknown = body?.name;
  if (!isGoal(name)) return Response.json({ error: "Неизвестное событие" }, { status: 400 });

  let userId: string | null = null;
  let source: string | null = null;
  try {
    await authReady();
    const session = await auth.api.getSession({ headers: h });
    if (session) {
      userId = session.user.id;
      source = (session.user as { source?: string | null }).source ?? null;
    }
  } catch {
    // событие запишем и без аккаунта
  }
  source ??= sourceFromCookie(h.get("cookie"));
  await recordEvent(name, userId, source).catch((e) => console.error("[track] событие не записано:", e instanceof Error ? e.message : e));
  return new Response(null, { status: 204 });
}
