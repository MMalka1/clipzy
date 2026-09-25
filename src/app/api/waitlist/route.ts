import landing from "@/i18n/dict/landing";
import { getLocale } from "@/i18n/server";
import { addToWaitlist } from "@/lib/db";

// Лист ожидания — в той же базе, что и аккаунты (Postgres на сервере, SQLite локально)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) {
    const t = landing[await getLocale()].waitlist;
    return Response.json({ error: t.badEmail }, { status: 400 });
  }

  const { added } = await addToWaitlist(email);
  return Response.json({ ok: true, already: !added });
}
