import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { Locale } from "@/i18n/config";
import auth from "@/i18n/dict/auth";
import { getLocale } from "@/i18n/server";
import { isLocalPath } from "./safe-path";

/**
 * Вход через Telegram Login Widget.
 * Telegram перенаправляет на /api/auth/sign-in/telegram?id=…&hash=… — проверяем подпись токеном бота
 * (https://core.telegram.org/widgets/login#checking-authorization), находим или создаём пользователя.
 */
function verify(params: Record<string, string>, botToken: string) {
  const { hash, ...data } = params;
  if (!hash) return false;
  const check = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join("\n");
  const secret = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(check).digest("hex");
  const fresh = Date.now() / 1000 - Number(data.auth_date || 0) < 86400;
  return fresh && expected.length === hash.length && timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
}

/** Язык для сообщений об ошибке; вне запроса Next (нет cookies) — русский. */
async function locale(): Promise<Locale> {
  try {
    return await getLocale();
  } catch {
    return "ru";
  }
}

export const telegramAuth = () =>
  ({
    id: "telegram",
    endpoints: {
      signInTelegram: createAuthEndpoint("/sign-in/telegram", { method: "GET" }, async (ctx) => {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) throw new APIError("NOT_FOUND", { message: auth[await locale()].telegram.notConfigured });
        const query = Object.fromEntries(
          Object.entries(ctx.query ?? {}).filter(([k]) => k !== "callbackURL").map(([k, v]) => [k, String(v)]),
        );
        if (!verify(query, botToken)) {
          throw new APIError("UNAUTHORIZED", { message: auth[await locale()].telegram.verifyFailed });
        }
        const tgId = query.id;
        const name = [query.first_name, query.last_name].filter(Boolean).join(" ") || query.username || "Telegram";

        const account = await ctx.context.adapter.findOne<{ userId: string }>({
          model: "account",
          where: [
            { field: "providerId", value: "telegram" },
            { field: "accountId", value: tgId },
          ],
        });
        let user = account ? await ctx.context.internalAdapter.findUserById(account.userId) : null;
        if (!user) {
          user = await ctx.context.internalAdapter.createUser(
            { name, email: `tg${tgId}@telegram.clipzy.invalid`, image: query.photo_url || null, emailVerified: false },
            { method: "oauth", oauth: { providerId: "telegram", profile: query } },
          );
          await ctx.context.internalAdapter.linkAccount({ userId: user.id, providerId: "telegram", accountId: tgId });
        }
        const session = await ctx.context.internalAdapter.createSession(user.id);
        await setSessionCookie(ctx, { session, user });
        const next = String(ctx.query?.callbackURL || "/app");
        throw ctx.redirect(isLocalPath(next) ? next : "/app"); // только свои пути, не //чужой-сайт
      }),
    },
  }) satisfies BetterAuthPlugin;
