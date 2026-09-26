import { headers } from "next/headers";
import { auth, authReady } from "@/lib/auth";
import { ensureEngine, peekEngine } from "@/lib/sandbox-engine";

// Пробуждение машины из снимка диска и первые шаги установки могут занять десятки секунд
export const maxDuration = 120;

/**
 * Будит движок в Vercel Sandbox (режим NEXT_PUBLIC_ENGINE_MODE=sandbox) и отдаёт его адрес.
 * Будим только по действию пользователя (загрузка, экспорт, открытие проекта), а не при заходе на страницу.
 * Браузер повторяет запрос, пока движок не станет online. Только для вошедших (в том числе гостей):
 * посторонние не должны тратить бесплатный лимит машины.
 */
export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_ENGINE_MODE !== "sandbox") {
    return Response.json({ error: "Движок работает не в Vercel Sandbox" }, { status: 404 });
  }
  await authReady();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Нужно войти" }, { status: 401 });
  // peek — только узнать, работает ли машина (и продлить сеанс, пока человек активен), не будя её
  const body = (await request.json().catch(() => ({}))) as { peek?: boolean; retry?: boolean };
  const result = body.peek ? await peekEngine() : await ensureEngine({ retry: Boolean(body.retry) });
  // Журнал установки — только создателю: остальным хватит «не получилось»
  const plan = (session.user as { plan?: string }).plan;
  if ((result.state === "failed" || result.state === "unavailable") && plan !== "creator") result.detail = "";
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
