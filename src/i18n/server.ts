import "server-only";
import { cookies, headers } from "next/headers";
import { type Locale, LOCALE_COOKIE, isLocale } from "./config";

// Русскоязычная аудитория: сайт по умолчанию на русском
const RU_FAMILY = ["ru", "uk", "be", "kk", "uz", "ky", "tg", "hy", "az"];

/** Язык запроса: выбранный пользователем (cookie), иначе — первый язык браузера. */
export async function getLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  const first = ((await headers()).get("accept-language") ?? "").split(",")[0]?.trim().slice(0, 2).toLowerCase();
  return !first || RU_FAMILY.includes(first) ? "ru" : "en";
}
