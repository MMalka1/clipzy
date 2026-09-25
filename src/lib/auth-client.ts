"use client";

import { anonymousClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { type Locale, isLocale, DEFAULT_LOCALE } from "@/i18n/config";
import auth from "@/i18n/dict/auth";

export const authClient = createAuthClient({ plugins: [anonymousClient()] });

/** Язык страницы (layout и LangSwitch выставляют <html lang>). */
function pageLocale(): Locale {
  const lang = typeof document === "undefined" ? "" : document.documentElement.lang;
  return isLocale(lang) ? lang : DEFAULT_LOCALE;
}

/** Понятные сообщения вместо кодов ошибок Better Auth. */
export function authErrorText(
  error: { code?: string; message?: string; status?: number } | null | undefined,
  locale: Locale = pageLocale(),
) {
  if (!error) return "";
  const t = auth[locale];
  if (error.code && t.errors[error.code]) return t.errors[error.code];
  if (error.status === 429) return t.tooMany;
  return error.message || t.unknown;
}
