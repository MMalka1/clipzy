import "server-only";
import { createHmac } from "node:crypto";

const ENGINE_URL = (process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

function secret() {
  const s = process.env.ENGINE_SECRET;
  if (!s) throw new Error("ENGINE_SECRET не задан в .env.local");
  return s;
}

/**
 * Короткоживущий токен для движка: кто пользователь, гость ли он и какой тариф.
 * Формат: base64url(JSON).base64url(HMAC-SHA256) — движок проверяет тем же ENGINE_SECRET.
 */
export function signEngineToken(user: { id: string; isAnonymous?: boolean | null; plan?: string | null }) {
  const payload = {
    uid: user.id,
    anon: Boolean(user.isAnonymous),
    plan: user.plan || "free",
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 6,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return { token: `${body}.${sig}`, exp: payload.exp };
}

/** Служебный вызов движка с сервера сайта (например, перенос проектов гостя). */
export async function engineInternal(pathname: string, body: unknown) {
  // Движок в Vercel Sandbox: зовём, только если машина уже работает
  const base = process.env.NEXT_PUBLIC_ENGINE_MODE === "sandbox" && !process.env.NEXT_PUBLIC_ENGINE_URL
    ? await (await import("./sandbox-engine")).runningEngineUrl()
    : ENGINE_URL;
  if (!base) throw new Error("движок спит");
  const res = await fetch(`${base}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Engine-Secret": secret() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000), // движок недоступен — не держим регистрацию
  });
  if (!res.ok) throw new Error(`движок ответил ${res.status}`);
  return res.json();
}
