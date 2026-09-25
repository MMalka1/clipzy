import { headers } from "next/headers";
import { auth, authReady } from "@/lib/auth";
import { signEngineToken } from "@/lib/engine-token";

/** Выдаёт токен для движка текущему пользователю (включая гостя). */
export async function GET() {
  await authReady();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Нужно войти" }, { status: 401 });
  const user = session.user as typeof session.user & { isAnonymous?: boolean | null; plan?: string };
  return Response.json(
    {
      ...signEngineToken(user),
      user: { name: user.name, email: user.isAnonymous ? null : user.email, anon: Boolean(user.isAnonymous), plan: user.plan ?? "free" },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
