import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "@/i18n/server";
import supportDict from "@/i18n/dict/support";
import { auth, authReady } from "@/lib/auth";
import { listTickets, setTicketStatus } from "@/lib/db";

export const metadata: Metadata = { title: "Обращения — Clipzy", robots: { index: false } };

async function requireCreator() {
  await authReady();
  const session = await auth.api.getSession({ headers: await headers() });
  if ((session?.user as { plan?: string } | undefined)?.plan !== "creator") notFound();
}

async function toggle(formData: FormData) {
  "use server";
  await requireCreator(); // серверное действие проверяет права само: вызвать его можно и в обход страницы
  const id = Number(formData.get("id"));
  const status = formData.get("status") === "closed" ? "closed" : "open";
  if (Number.isInteger(id)) await setTicketStatus(id, status);
  revalidatePath("/support/inbox");
}

/** Обращения в поддержку — только для создателя сервиса. Остальным страница «не найдена». */
export default async function InboxPage() {
  await requireCreator();
  const locale = await getLocale();
  const t = supportDict[locale].support;
  const tickets = await listTickets();
  const date = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { dateStyle: "medium", timeStyle: "short" });

  return (
    <main className="paper min-h-dvh px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/support" className="text-sm text-dim hover:text-fg">
          ← {t.title}
        </Link>
        <h1 className="mt-3 text-[34px] font-extrabold tracking-[-0.03em]">{t.inboxTitle}</h1>
        {tickets.length === 0 ? (
          <p className="mt-6 text-dim">{t.inboxEmpty}</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {tickets.map((k) => (
              <li key={k.id} className={`rounded-xl border border-line bg-panel p-5 ${k.status === "closed" ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-mono font-semibold">№{k.id}</span>
                  <span className="rounded bg-raised px-1.5 py-0.5 text-xs">{t.topics[k.topic] ?? k.topic}</span>
                  <a href={`mailto:${k.email}?subject=${encodeURIComponent(`Clipzy: обращение №${k.id}`)}`} className="underline">
                    {k.email}
                  </a>
                  <span className="text-faint">{date.format(new Date(k.createdAt))}</span>
                  <span className="ml-auto text-xs text-faint">{k.status === "open" ? t.statusOpen : t.statusClosed}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed">{k.message}</p>
                <form action={toggle} className="mt-3">
                  <input type="hidden" name="id" value={k.id} />
                  <input type="hidden" name="status" value={k.status === "open" ? "closed" : "open"} />
                  <button className="cursor-pointer rounded-md border border-line-strong px-3 py-1 text-sm hover:bg-raised">
                    {k.status === "open" ? t.close : t.reopen}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
