import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import LangSwitch from "@/components/LangSwitch";
import Logo from "@/components/Logo";
import growth from "@/i18n/dict/growth";
import landing from "@/i18n/dict/landing";
import { getLocale } from "@/i18n/server";
import { normalizeCode } from "@/lib/attribution";
import { auth, authReady } from "@/lib/auth";
import { type FunnelRow, type PromoCode, createPromoCode, endPromoCode, funnel, listPromoCodes } from "@/lib/db";
import { SITE_URL } from "@/lib/support";
import CopyLink from "./CopyLink";

export async function generateMetadata(): Promise<Metadata> {
  return { title: growth[await getLocale()].admin.metaTitle, robots: { index: false, follow: false } };
}

async function requireCreator() {
  await authReady();
  const session = await auth.api.getSession({ headers: await headers() });
  if ((session?.user as { plan?: string } | undefined)?.plan !== "creator") notFound();
}

const PLANS = ["pro", "studio"];
const COLUMNS = ["signup", "guest", "upload", "processed", "export", "download", "promo", "waitlist"] as const;
// Готовые ссылки для рекламы: [ключ подписи, utm_source, utm_medium]
const CHANNELS = [
  ["telegram", "telegram", "social"],
  ["vk", "vk", "social"],
  ["youtube", "youtube", "video"],
  ["yandex", "yandex", "cpc"],
  ["plain", "", ""],
] as const;

const daysAgo = (days: number) => new Date(Date.now() - days * 86400_000);

function shareLink(code: string, source: string, medium: string) {
  const q = new URLSearchParams({ promo: code });
  if (source) {
    q.set("utm_source", source);
    q.set("utm_medium", medium);
    q.set("utm_campaign", code.toLowerCase());
  }
  return `${SITE_URL}/?${q}`;
}

function codeStatus(c: PromoCode): "active" | "ended" | "used" {
  if (c.expiresAt && new Date(c.expiresAt).getTime() <= Date.now()) return "ended";
  if (c.maxUses !== null && c.used >= c.maxUses) return "used";
  return "active";
}

/** События по источникам → строки таблицы (больше регистраций — выше) и итог. */
function pivot(rows: FunnelRow[]) {
  const by = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const key = r.source ?? "";
    const row = by.get(key) ?? {};
    row[r.name] = (row[r.name] ?? 0) + r.n;
    by.set(key, row);
  }
  const sum = (x: Record<string, number>) => Object.values(x).reduce((a, b) => a + b, 0);
  const total: Record<string, number> = {};
  for (const row of by.values()) for (const [k, v] of Object.entries(row)) total[k] = (total[k] ?? 0) + v;
  const list = [...by.entries()].sort((a, b) => (b[1].signup ?? 0) - (a[1].signup ?? 0) || sum(b[1]) - sum(a[1]));
  return { list, total };
}

async function createCode(formData: FormData) {
  "use server";
  await requireCreator(); // серверное действие проверяет права само: вызвать его можно и в обход страницы
  const code = normalizeCode(formData.get("code"));
  if (!code) redirect("/admin?error=code#promo");
  const days = Number(formData.get("days"));
  if (!Number.isInteger(days) || days < 1 || days > 90) redirect("/admin?error=days#promo");
  const rawMax = String(formData.get("maxUses") ?? "").trim();
  const maxUses = rawMax ? Number(rawMax) : null;
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100_000)) redirect("/admin?error=maxUses#promo");
  // Дата из формы — до конца этого дня по Москве
  const rawExp = String(formData.get("expires") ?? "").trim();
  const expiresAt = rawExp ? new Date(`${rawExp}T23:59:59+03:00`) : null;
  if (expiresAt && !(expiresAt.getTime() > Date.now())) redirect("/admin?error=expires#promo");
  const planRaw = String(formData.get("plan"));
  const plan = PLANS.includes(planRaw) ? planRaw : "pro";
  const label = String(formData.get("label") ?? "").trim().slice(0, 80) || null;
  const ok = await createPromoCode({ code, plan, days, maxUses, label, expiresAt });
  revalidatePath("/admin");
  redirect(ok ? `/admin?created=${code}#promo` : "/admin?error=exists#promo");
}

async function endCode(formData: FormData) {
  "use server";
  await requireCreator();
  const code = normalizeCode(formData.get("code"));
  if (code) await endPromoCode(code);
  revalidatePath("/admin");
}

/** Статистика рекламы и промокоды — только для создателя сервиса. Остальным страница «не найдена». */
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  await requireCreator();
  const locale = await getLocale();
  const t = growth[locale].admin;
  const params = await searchParams;
  const [week, month, codes] = await Promise.all([funnel(daysAgo(7)), funnel(daysAgo(30)), listPromoCodes()]);
  const date = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { dateStyle: "medium", timeZone: "Europe/Moscow" });
  const created = typeof params.created === "string" ? normalizeCode(params.created) : null;
  const error = typeof params.error === "string" ? t.errors[params.error] : undefined;
  const field = "h-10 w-full rounded-lg border border-line-strong bg-ink px-3 text-[15px] outline-none focus:border-dim";

  return (
    <main className="paper min-h-dvh px-5 pb-16">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 py-5">
        <Logo label={landing[locale].logoHome} />
        <LangSwitch />
      </header>
      <div className="mx-auto max-w-5xl">
        <h1 className="text-[34px] font-extrabold tracking-[-0.03em]">{t.title}</h1>

        {/* Воронка: откуда пришли и до какого шага дошли */}
        <section className="mt-8">
          <h2 className="text-xl font-bold">{t.funnelTitle}</h2>
          <p className="mt-1 max-w-2xl text-sm text-dim">{t.funnelNote}</p>
          <FunnelTable title={t.period(7)} rows={week} t={t} />
          <FunnelTable title={t.period(30)} rows={month} t={t} />
        </section>

        {/* Промокоды */}
        <section id="promo" className="mt-12 scroll-mt-6">
          <h2 className="text-xl font-bold">{t.promoTitle}</h2>

          <form action={createCode} className="mt-4 rounded-xl border border-line bg-panel p-5">
            <h3 className="font-semibold">{t.createTitle}</h3>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-sm">
                <span className="text-dim">{t.code}</span>
                <input
                  name="code"
                  required
                  minLength={3}
                  maxLength={32}
                  pattern="[A-Za-z0-9\-]{3,32}"
                  autoComplete="off"
                  spellCheck={false}
                  className={`${field} mt-1 font-mono uppercase`}
                />
                <span className="mt-1 block text-xs text-faint">{t.codeHint}</span>
              </label>
              <label className="block text-sm">
                <span className="text-dim">{t.plan}</span>
                <select name="plan" defaultValue="pro" className={`${field} mt-1`}>
                  {PLANS.map((p) => (
                    <option key={p} value={p}>
                      {p[0].toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-dim">{t.days}</span>
                <input name="days" type="number" required min={1} max={90} defaultValue={7} className={`${field} mt-1`} />
              </label>
              <label className="block text-sm">
                <span className="text-dim">{t.maxUses}</span>
                <input name="maxUses" type="number" min={1} max={100000} defaultValue={100} className={`${field} mt-1`} />
                <span className="mt-1 block text-xs text-faint">{t.maxUsesHint}</span>
              </label>
              <label className="block text-sm">
                <span className="text-dim">{t.expires}</span>
                <input name="expires" type="date" className={`${field} mt-1`} />
                <span className="mt-1 block text-xs text-faint">{t.expiresHint}</span>
              </label>
              <label className="block text-sm">
                <span className="text-dim">{t.label}</span>
                <input name="label" maxLength={80} placeholder={t.labelPlaceholder} className={`${field} mt-1`} />
              </label>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <button className="h-10 cursor-pointer rounded-full bg-fg px-5 text-sm font-semibold text-ink transition-transform hover:-rotate-1">
                {t.create}
              </button>
              <p role="status" className="text-sm">
                {error && <span className="text-rec">{error}</span>}
                {!error && created && <span className="text-dim">{t.created(created)}</span>}
              </p>
            </div>
          </form>

          {codes.length === 0 ? (
            <p className="mt-6 text-dim">{t.promoEmpty}</p>
          ) : (
            <ul className="mt-6 space-y-3">
              {codes.map((c) => {
                const status = codeStatus(c);
                return (
                  <li key={c.code} className={`rounded-xl border border-line bg-panel p-5 ${status === "active" ? "" : "opacity-70"}`}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                      <span className="font-mono text-base font-semibold">{c.code}</span>
                      {c.label && <span className="text-dim">{c.label}</span>}
                      <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-xs">
                        {c.plan} · {c.days} {t.days.toLowerCase()}
                      </span>
                      <span className="tabular-nums">
                        {t.uses}: {c.used} / {c.maxUses ?? t.unlimited}
                      </span>
                      <span className="text-faint">
                        {t.expires}: {c.expiresAt ? date.format(new Date(c.expiresAt)) : t.noExpiry}
                      </span>
                      <span className={`ml-auto text-xs ${status === "active" ? "text-fg" : "text-faint"}`}>
                        {status === "active" ? t.statusActive : status === "used" ? t.statusUsed : t.statusEnded}
                      </span>
                      {status === "active" && (
                        <form action={endCode}>
                          <input type="hidden" name="code" value={c.code} />
                          <button className="cursor-pointer rounded-md border border-line-strong px-3 py-1 text-sm hover:bg-raised">
                            {t.deactivate}
                          </button>
                        </form>
                      )}
                    </div>
                    {status === "active" && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm text-dim hover:text-fg">{t.links}</summary>
                        <p className="mt-2 text-xs text-faint">{t.linksHint}</p>
                        <div className="mt-3 space-y-2">
                          {CHANNELS.map(([key, source, medium]) => (
                            <CopyLink
                              key={key}
                              label={t.channels[key]}
                              url={shareLink(c.code, source, medium)}
                              copy={t.copy}
                              copied={t.copied}
                            />
                          ))}
                        </div>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function FunnelTable({ title, rows, t }: { title: string; rows: FunnelRow[]; t: (typeof growth)["ru"]["admin"] }) {
  const { list, total } = pivot(rows);
  return (
    <div className="mt-5">
      <h3 className="font-semibold">{title}</h3>
      {list.length === 0 ? (
        <p className="mt-2 text-sm text-dim">{t.empty}</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-faint">
                <th scope="col" className="px-3 py-2.5 font-medium">
                  {t.source}
                </th>
                {COLUMNS.map((k) => (
                  <th key={k} scope="col" className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                    {t.columns[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {list.map(([source, row]) => (
                <tr key={source} className="border-b border-line last:border-0">
                  <th scope="row" className="max-w-64 truncate px-3 py-2 text-left font-mono text-xs font-normal">
                    {source || <span className="font-sans text-faint">{t.direct}</span>}
                  </th>
                  {COLUMNS.map((k) => (
                    <td key={k} className={`px-3 py-2 text-right ${row[k] ? "" : "text-faint"}`}>
                      {row[k] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="tabular-nums">
              <tr className="border-t border-line-strong font-semibold">
                <th scope="row" className="px-3 py-2 text-left">
                  {t.total}
                </th>
                {COLUMNS.map((k) => (
                  <td key={k} className="px-3 py-2 text-right">
                    {total[k] ?? 0}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
