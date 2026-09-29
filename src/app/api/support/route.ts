import { headers } from "next/headers";
import supportDict from "@/i18n/dict/support";
import { getLocale } from "@/i18n/server";
import { auth, authReady } from "@/lib/auth";
import { clientIp, createTicket } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { SUPPORT } from "@/lib/support";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOPICS = ["help", "bug", "payment", "refund", "account", "other"];

/** Обращение в поддержку: сохраняем в базе (список — /support/inbox) и, если настроена почта, пересылаем. */
export async function POST(request: Request) {
  const t = supportDict[await getLocale()].support;
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const topic = TOPICS.includes(body?.topic) ? String(body.topic) : "other";
  const message = String(body?.message ?? "").trim();
  if (!EMAIL_RE.test(email) || email.length > 200) return Response.json({ error: t.badEmail }, { status: 400 });
  if (message.length < 10 || message.length > 5000) return Response.json({ error: t.badMessage }, { status: 400 });

  const h = await headers();
  const ip = clientIp(h);
  let userId: string | null = null;
  try {
    await authReady();
    userId = (await auth.api.getSession({ headers: h }))?.user.id ?? null;
  } catch {
    // обращение принимаем и без аккаунта
  }

  const id = await createTicket({ email, topic, message, userId, ip });
  if (id === null) return Response.json({ error: t.tooMany }, { status: 429 });

  if (SUPPORT.email) {
    await sendMail(SUPPORT.email, `Clipzy: обращение №${id} (${topic})`, `От: ${email}\n\n${message}`).catch((e) =>
      console.error("[support] письмо не ушло:", e instanceof Error ? e.message : e),
    );
  }
  return Response.json({ ok: true, id });
}
