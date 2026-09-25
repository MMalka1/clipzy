import "server-only";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { avatarAllowed, parseUserImage } from "@/components/Avatar";
import { authDatabase } from "./db";
import { sendMail } from "./mail";
import { engineInternal } from "./engine-token";
import { telegramAuth } from "./telegram-auth";

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }
    : undefined;

export const providers = {
  google: Boolean(google),
  telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.NEXT_PUBLIC_TELEGRAM_BOT),
};

const options = {
  appName: "Clipzy",
  // Аккаунты: Postgres на сервере (DATABASE_URL), SQLite-файл локально — см. db.ts
  database: authDatabase,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      await sendMail(user.email, "Сброс пароля", "Чтобы задать новый пароль для Clipzy, откройте ссылку:", url);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail(user.email, "Подтвердите почту", "Подтвердите почту, чтобы не потерять доступ к Clipzy:", url);
    },
  },
  socialProviders: google ? { google } : {},
  user: {
    additionalFields: {
      plan: { type: "string", defaultValue: "free", input: false },
    },
  },
  databaseHooks: {
    user: {
      update: {
        before: async (data, ctx) => {
          const next = { ...data };
          if ("image" in next && next.image != null && next.image !== "") {
            const img = parseUserImage(String(next.image));
            if (!img) return false; // только наклейка preset:<id> или фото по https-ссылке
            // Эксклюзивные наклейки («Создатель») — только своему плану; план берём из сессии, не из запроса
            const plan = (ctx?.context.session?.user as { plan?: string } | undefined)?.plan;
            if ("preset" in img && !avatarAllowed(img.preset, plan)) return false;
          }
          if (typeof next.name === "string") {
            const name = next.name.trim().replace(/\s+/g, " ").slice(0, 60);
            if (!name) return false;
            next.name = name;
          }
          return { data: next };
        },
      },
    },
  },
  account: {
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },
  rateLimit: { enabled: true, window: 60, max: 30 },
  plugins: [
    anonymous({
      emailDomainName: "guest.clipzy.invalid",
      generateName: () => "Гость",
      // Гость зарегистрировался — его проекты переходят в новый аккаунт
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        await engineInternal("/internal/reassign", { from: anonymousUser.user.id, to: newUser.user.id }).catch((e) =>
          console.error("[auth] не удалось перенести проекты гостя:", e),
        );
      },
    }),
    telegramAuth(),
    nextCookies(), // должен быть последним
  ],
} satisfies BetterAuthOptions;

export const auth = betterAuth(options);

/** Таблицы создаются автоматически при первом обращении.
 *  Ошибку не кэшируем (обрыв связи с базой, гонка двух холодных стартов) — следующий запрос попробует снова. */
let ready: Promise<void> | null = null;
async function migrate() {
  for (let i = 0; ; i++) {
    try {
      await (await getMigrations(options)).runMigrations();
      return;
    } catch (e) {
      if (i >= 2) throw e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
}
export function authReady() {
  ready ??= migrate().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}
