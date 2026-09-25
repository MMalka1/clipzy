import "server-only";
import type { Providers } from "@/components/AuthForm";

/** Какие способы входа включены — по ключам в .env.local. */
export function getProviders(): Providers {
  const telegramBot = process.env.NEXT_PUBLIC_TELEGRAM_BOT || null;
  return {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && telegramBot),
    telegramBot,
  };
}
