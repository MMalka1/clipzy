import { callbackAuthentic, handleCallback } from "@/lib/payments";

/**
 * Callback от Platega об изменении статуса платежа (адрес указан в кабинете Platega → Настройки → Callback URLs).
 * Ответ 200 — «принято»; при ошибке отвечаем 500, и Platega повторит запрос (до 3 раз раз в 5 минут).
 */
export async function POST(request: Request) {
  if (!callbackAuthentic(request.headers)) return new Response("forbidden", { status: 403 });
  const body = await request.json().catch(() => null);
  try {
    await handleCallback(body ?? {});
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[pay] callback не обработан:", e instanceof Error ? e.message : e);
    return Response.json({ ok: false }, { status: 500 });
  }
}
