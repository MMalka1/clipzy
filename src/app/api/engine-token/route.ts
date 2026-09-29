import { headers } from "next/headers";
import { auth, authReady } from "@/lib/auth";
import { expireTrial } from "@/lib/db";
import { signEngineToken } from "@/lib/engine-token";
import { effectivePlan, planExpired } from "@/lib/plan";

/** Выдаёт токен для движка текущему пользователю (включая гостя). */
export async function GET() {
  await authReady();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Нужно войти" }, { status: 401 });
  const user = session.user as typeof session.user & {
    isAnonymous?: boolean | null;
    plan?: string;
    planUntil?: Date | string | null;
  };
  // Движок верит плану из токена (водяной знак, лимит в день): пробный Pro после срока — снова Free.
  // В базе поправляем сразу, чтобы меню и профиль тоже показывали Free
  const plan = effectivePlan(user);
  if (planExpired(user)) {
    await expireTrial(user.id).catch((e) => console.error("[plan] не удалось вернуть Free:", e instanceof Error ? e.message : e));
  }
  // Срок режет токен только у пробного плана; у создателя и оплаченных навсегда старый planUntil не мешает
  const until = plan !== "free" && plan !== "creator" && user.planUntil ? new Date(user.planUntil) : null;
  return Response.json(
    {
      ...signEngineToken({ ...user, plan }, until),
      user: { name: user.name, email: user.isAnonymous ? null : user.email, anon: Boolean(user.isAnonymous), plan },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
