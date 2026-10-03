import "server-only";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { Pool } from "pg";

/**
 * Где живут аккаунты и лист ожидания.
 * На сервере (Vercel и т.п.) — Postgres из DATABASE_URL: файлы там стираются при каждом запуске.
 * Локально — файл SQLite в data/ (встроен в Node, ничего ставить не нужно).
 */
export const pg = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 }) : null;
// Neon закрывает простаивающие соединения — без обработчика это роняет функцию
pg?.on("error", (e) => console.error("[db] соединение с базой оборвалось:", e.message));

let sqlite: DatabaseSync | null = null;
// Работающий сайт на Vercel (не сборка): там файлы не сохраняются, SQLite нельзя
const onVercelRuntime = Boolean(process.env.VERCEL) && process.env.NEXT_PHASE !== "phase-production-build";

function localDb(): DatabaseSync {
  if (onVercelRuntime) {
    throw new Error("DATABASE_URL не задан: подключите Neon (Storage → Neon) и сделайте Redeploy");
  }
  if (!sqlite) {
    // node:sqlite грузим только локально — на сервере с Postgres он не нужен
    const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
    const dir = path.join(process.cwd(), "data");
    mkdirSync(dir, { recursive: true });
    sqlite = new DatabaseSync(path.join(dir, "auth.db"));
  }
  return sqlite;
}

/** База для Better Auth. На Vercel без DATABASE_URL — понятная ошибка в логах вместо падения на записи в файл. */
export const authDatabase = pg ?? (onVercelRuntime ? missingDatabase() : localDb());

function missingDatabase(): never {
  throw new Error("DATABASE_URL не задан: подключите Neon (Storage → Neon) и сделайте Redeploy");
}

/** Лист ожидания. added=false — адрес уже был в списке. */
export async function addToWaitlist(email: string): Promise<{ added: boolean }> {
  if (pg) {
    await pg.query("create table if not exists waitlist (email text primary key, created_at timestamptz not null default now())");
    const r = await pg.query("insert into waitlist (email) values ($1) on conflict do nothing", [email]);
    return { added: (r.rowCount ?? 0) > 0 };
  }
  const db = localDb();
  db.exec("create table if not exists waitlist (email text primary key, created_at text not null)");
  importOldWaitlist(db);
  const r = db.prepare("insert or ignore into waitlist (email, created_at) values (?, ?)").run(email, new Date().toISOString());
  return { added: Number(r.changes) > 0 };
}

/** Раньше лист ожидания лежал в data/waitlist.json — переносим один раз в таблицу. */
function importOldWaitlist(db: DatabaseSync) {
  const file = path.join(process.cwd(), "data", "waitlist.json");
  if (!existsSync(file)) return;
  try {
    const list = JSON.parse(readFileSync(file, "utf8")) as { email: string; createdAt: string }[];
    const ins = db.prepare("insert or ignore into waitlist (email, created_at) values (?, ?)");
    for (const e of list) ins.run(e.email, e.createdAt);
    renameSync(file, file + ".imported");
  } catch {
    // битый файл не мешает записи новых адресов
  }
}

/*
 * Перенос проектов гостя в аккаунт, когда движок спал (Vercel Sandbox): запоминаем пару «гость → аккаунт»
 * и переносим, как только движок проснётся.
 */
export async function queueGuestMove(from: string, to: string) {
  if (pg) {
    await pg.query("create table if not exists guest_moves (from_id text primary key, to_id text not null, created_at timestamptz not null default now())");
    await pg.query("insert into guest_moves (from_id, to_id) values ($1, $2) on conflict (from_id) do update set to_id = excluded.to_id", [from, to]);
    return;
  }
  const db = localDb();
  db.exec("create table if not exists guest_moves (from_id text primary key, to_id text not null, created_at text not null)");
  db.prepare("insert or replace into guest_moves (from_id, to_id, created_at) values (?, ?, ?)").run(from, to, new Date().toISOString());
}

export async function pendingGuestMoves(): Promise<{ from: string; to: string }[]> {
  if (pg) {
    const r = await pg.query("select from_id, to_id from guest_moves limit 50").catch(() => ({ rows: [] }));
    return r.rows.map((x: { from_id: string; to_id: string }) => ({ from: x.from_id, to: x.to_id }));
  }
  const db = localDb();
  db.exec("create table if not exists guest_moves (from_id text primary key, to_id text not null, created_at text not null)");
  return (db.prepare("select from_id, to_id from guest_moves limit 50").all() as { from_id: string; to_id: string }[]).map((x) => ({
    from: x.from_id,
    to: x.to_id,
  }));
}

export async function dropGuestMove(from: string) {
  if (pg) await pg.query("delete from guest_moves where from_id = $1", [from]);
  else localDb().prepare("delete from guest_moves where from_id = ?").run(from);
}

/* ——— Обращения в поддержку (страница /support) ——— */
export type Ticket = {
  id: number;
  email: string;
  topic: string;
  message: string;
  userId: string | null;
  status: "open" | "closed";
  createdAt: string;
};

const TICKETS_PG = `create table if not exists support_tickets (
  id serial primary key, email text not null, topic text not null, message text not null,
  user_id text, ip text, status text not null default 'open', created_at timestamptz not null default now())`;
const TICKETS_SQLITE = `create table if not exists support_tickets (
  id integer primary key autoincrement, email text not null, topic text not null, message text not null,
  user_id text, ip text, status text not null default 'open', created_at text not null)`;

/** Новое обращение. Возвращает номер или null, если с этого адреса за час их уже слишком много. */
export async function createTicket(t: { email: string; topic: string; message: string; userId: string | null; ip: string }) {
  if (pg) {
    await pg.query(TICKETS_PG);
    const recent = await pg.query("select count(*)::int as n from support_tickets where ip = $1 and created_at > now() - interval '1 hour'", [t.ip]);
    if (recent.rows[0].n >= 5) return null;
    const r = await pg.query(
      "insert into support_tickets (email, topic, message, user_id, ip) values ($1, $2, $3, $4, $5) returning id",
      [t.email, t.topic, t.message, t.userId, t.ip],
    );
    return r.rows[0].id as number;
  }
  const db = localDb();
  db.exec(TICKETS_SQLITE);
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const n = db.prepare("select count(*) as n from support_tickets where ip = ? and created_at > ?").get(t.ip, hourAgo) as { n: number };
  if (n.n >= 5) return null;
  const r = db
    .prepare("insert into support_tickets (email, topic, message, user_id, ip, created_at) values (?, ?, ?, ?, ?, ?)")
    .run(t.email, t.topic, t.message, t.userId, t.ip, new Date().toISOString());
  return Number(r.lastInsertRowid);
}

export async function listTickets(): Promise<Ticket[]> {
  const map = (x: Record<string, unknown>): Ticket => ({
    id: Number(x.id),
    email: String(x.email),
    topic: String(x.topic),
    message: String(x.message),
    userId: (x.user_id as string | null) ?? null,
    status: x.status === "closed" ? "closed" : "open",
    createdAt: x.created_at instanceof Date ? x.created_at.toISOString() : String(x.created_at),
  });
  if (pg) {
    await pg.query(TICKETS_PG);
    const r = await pg.query("select * from support_tickets order by (status = 'open') desc, id desc limit 200");
    return r.rows.map(map);
  }
  const db = localDb();
  db.exec(TICKETS_SQLITE);
  return (db.prepare("select * from support_tickets order by (status = 'open') desc, id desc limit 200").all() as Record<string, unknown>[]).map(map);
}

export async function setTicketStatus(id: number, status: "open" | "closed") {
  if (pg) await pg.query("update support_tickets set status = $1 where id = $2", [status, id]);
  else localDb().prepare("update support_tickets set status = ? where id = ?").run(status, id);
}

/*
 * Ограничение частоты запросов для своих API (запись в лист ожидания, пробуждение движка).
 * Счётчик в базе, а не в памяти: на Vercel у каждого экземпляра функции своя память.
 * Окно фиксированное: в пределах окна считаем запросы, в новом — начинаем с единицы.
 */
const HITS_PG = "create table if not exists rate_hits (key text primary key, win bigint not null, n integer not null)";
const HITS_SQLITE = "create table if not exists rate_hits (key text primary key, win integer not null, n integer not null)";
const UPSERT_HIT = `insert into rate_hits (key, win, n) values (%1, %2, 1)
  on conflict (key) do update set n = case when rate_hits.win = excluded.win then rate_hits.n + 1 else 1 end, win = excluded.win
  returning n`;

/** true — можно; false — лимит на это окно исчерпан. При сбое базы пропускаем: лимит не должен ронять сайт. */
export async function hit(key: string, max: number, windowSec: number): Promise<boolean> {
  const win = Math.floor(Date.now() / 1000 / windowSec);
  try {
    if (pg) {
      await pg.query(HITS_PG);
      const r = await pg.query(UPSERT_HIT.replace("%1", "$1").replace("%2", "$2"), [key, win]);
      return Number(r.rows[0].n) <= max;
    }
    const db = localDb();
    db.exec(HITS_SQLITE);
    const r = db.prepare(UPSERT_HIT.replace("%1", "?").replace("%2", "?")).get(key, win) as { n: number };
    return r.n <= max;
  } catch (e) {
    console.error("[rate] счётчик недоступен:", e instanceof Error ? e.message : e);
    return true;
  }
}

/** IP посетителя. На Vercel x-forwarded-for перезаписывается платформой и содержит один настоящий адрес. */
export function clientIp(h: Headers) {
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}

/*
 * Таблицы для рекламы и промокодов создаём один раз на процесс, а не перед каждым запросом:
 * события пишутся на каждую загрузку и экспорт.
 */
const created = new Set<string>();
async function ensureTables(key: string, ddl: { pg: string[]; sqlite: string[] }) {
  if (created.has(key)) return;
  if (pg) for (const q of ddl.pg) await pg.query(q);
  else for (const q of ddl.sqlite) localDb().exec(q);
  created.add(key);
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

/* ——— События воронки: регистрация, загрузка, экспорт… (сводка — на /admin) ——— */
const EVENTS = {
  pg: [
    `create table if not exists events (id bigserial primary key, name text not null, user_id text, source text,
      created_at timestamptz not null default now())`,
    "create index if not exists events_created_at on events (created_at)",
  ],
  sqlite: [
    `create table if not exists events (id integer primary key autoincrement, name text not null, user_id text, source text,
      created_at text not null)`,
    "create index if not exists events_created_at on events (created_at)",
  ],
};

export async function recordEvent(name: string, userId: string | null, source: string | null) {
  await ensureTables("events", EVENTS);
  if (pg) {
    await pg.query("insert into events (name, user_id, source) values ($1, $2, $3)", [name, userId, source]);
    return;
  }
  localDb()
    .prepare("insert into events (name, user_id, source, created_at) values (?, ?, ?, ?)")
    .run(name, userId, source, new Date().toISOString());
}

export type FunnelRow = { source: string | null; name: string; n: number };

/** Сколько каких событий было с момента since — по источникам. */
export async function funnel(since: Date): Promise<FunnelRow[]> {
  await ensureTables("events", EVENTS);
  // Считаем людей, а не нажатия: один человек с десятью экспортами — это один экспорт в воронке
  const q =
    "select source, name, count(distinct coalesce(user_id, 'e' || id)) as n from events where created_at > %1 group by source, name";
  const map = (x: Record<string, unknown>): FunnelRow => ({
    source: (x.source as string | null) ?? null,
    name: String(x.name),
    n: Number(x.n),
  });
  if (pg) return (await pg.query(q.replace("%1", "$1"), [since])).rows.map(map);
  return (localDb().prepare(q.replace("%1", "?")).all(since.toISOString()) as Record<string, unknown>[]).map(map);
}

/* ——— Промокоды: пробный Pro на N дней, одна активация на аккаунт ——— */
export type PromoCode = {
  code: string;
  plan: string;
  days: number;
  maxUses: number | null;
  used: number;
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
};

const PROMO = {
  pg: [
    `create table if not exists promo_codes (code text primary key, plan text not null default 'pro', days integer not null default 7,
      max_uses integer, used integer not null default 0, label text, created_at timestamptz not null default now(), expires_at timestamptz)`,
    `create table if not exists promo_redemptions (code text not null, user_id text not null unique,
      created_at timestamptz not null default now())`,
  ],
  sqlite: [
    `create table if not exists promo_codes (code text primary key, plan text not null default 'pro', days integer not null default 7,
      max_uses integer, used integer not null default 0, label text, created_at text not null, expires_at text)`,
    `create table if not exists promo_redemptions (code text not null, user_id text not null unique, created_at text not null)`,
  ],
};

const mapPromo = (x: Record<string, unknown>): PromoCode => ({
  code: String(x.code),
  plan: String(x.plan),
  days: Number(x.days),
  maxUses: x.max_uses == null ? null : Number(x.max_uses),
  used: Number(x.used),
  label: (x.label as string | null) ?? null,
  createdAt: iso(x.created_at) ?? "",
  expiresAt: iso(x.expires_at),
});

/** Новый промокод. false — такой код уже есть. */
export async function createPromoCode(p: {
  code: string;
  plan: string;
  days: number;
  maxUses: number | null;
  label: string | null;
  expiresAt: Date | null;
}): Promise<boolean> {
  await ensureTables("promo", PROMO);
  if (pg) {
    const r = await pg.query(
      "insert into promo_codes (code, plan, days, max_uses, label, expires_at) values ($1, $2, $3, $4, $5, $6) on conflict do nothing",
      [p.code, p.plan, p.days, p.maxUses, p.label, p.expiresAt],
    );
    return (r.rowCount ?? 0) > 0;
  }
  const r = localDb()
    .prepare("insert or ignore into promo_codes (code, plan, days, max_uses, label, created_at, expires_at) values (?, ?, ?, ?, ?, ?, ?)")
    .run(p.code, p.plan, p.days, p.maxUses, p.label, new Date().toISOString(), p.expiresAt?.toISOString() ?? null);
  return Number(r.changes) > 0;
}

export async function listPromoCodes(): Promise<PromoCode[]> {
  await ensureTables("promo", PROMO);
  const q = "select * from promo_codes order by created_at desc limit 200";
  if (pg) return (await pg.query(q)).rows.map(mapPromo);
  return (localDb().prepare(q).all() as Record<string, unknown>[]).map(mapPromo);
}

export async function getPromoCode(code: string): Promise<PromoCode | null> {
  await ensureTables("promo", PROMO);
  if (pg) {
    const r = await pg.query("select * from promo_codes where code = $1", [code]);
    return r.rows[0] ? mapPromo(r.rows[0]) : null;
  }
  const row = localDb().prepare("select * from promo_codes where code = ?").get(code) as Record<string, unknown> | undefined;
  return row ? mapPromo(row) : null;
}

/** Выключить промокод: срок действия — «уже закончился». */
export async function endPromoCode(code: string) {
  await ensureTables("promo", PROMO);
  if (pg) {
    await pg.query("update promo_codes set expires_at = now() where code = $1 and (expires_at is null or expires_at > now())", [code]);
    return;
  }
  const now = new Date().toISOString();
  localDb()
    .prepare("update promo_codes set expires_at = ? where code = ? and (expires_at is null or expires_at > ?)")
    .run(now, code, now);
}

/**
 * Забрать одну активацию промокода для аккаунта. "already" — аккаунт уже активировал какой-то промокод,
 * "gone" — код закончился или истёк (проверка и списание — одним запросом, без гонок).
 */
export async function claimPromoCode(code: string, userId: string): Promise<{ plan: string; days: number } | "already" | "gone"> {
  await ensureTables("promo", PROMO);
  if (pg) {
    const ins = await pg.query("insert into promo_redemptions (code, user_id) values ($1, $2) on conflict (user_id) do nothing", [code, userId]);
    if (!ins.rowCount) return "already";
    const r = await pg.query(
      `update promo_codes set used = used + 1
        where code = $1 and (max_uses is null or used < max_uses) and (expires_at is null or expires_at > now())
        returning plan, days`,
      [code],
    );
    if (!r.rows[0]) {
      await pg.query("delete from promo_redemptions where code = $1 and user_id = $2", [code, userId]);
      return "gone";
    }
    return { plan: String(r.rows[0].plan), days: Number(r.rows[0].days) };
  }
  const db = localDb();
  const now = new Date().toISOString();
  const ins = db.prepare("insert or ignore into promo_redemptions (code, user_id, created_at) values (?, ?, ?)").run(code, userId, now);
  if (!Number(ins.changes)) return "already";
  const row = db
    .prepare(
      `update promo_codes set used = used + 1
        where code = ? and (max_uses is null or used < max_uses) and (expires_at is null or expires_at > ?)
        returning plan, days`,
    )
    .get(code, now) as { plan: string; days: number } | undefined;
  if (!row) {
    db.prepare("delete from promo_redemptions where code = ? and user_id = ?").run(code, userId);
    return "gone";
  }
  return { plan: String(row.plan), days: Number(row.days) };
}

/** Вернуть активацию, если план включить не удалось. */
export async function releasePromoCode(code: string, userId: string) {
  if (pg) {
    const r = await pg.query("delete from promo_redemptions where code = $1 and user_id = $2", [code, userId]);
    if (r.rowCount) await pg.query("update promo_codes set used = greatest(used - 1, 0) where code = $1", [code]);
    return;
  }
  const db = localDb();
  const r = db.prepare("delete from promo_redemptions where code = ? and user_id = ?").run(code, userId);
  if (Number(r.changes)) db.prepare("update promo_codes set used = max(used - 1, 0) where code = ?").run(code);
}

/*
 * План пользователя пишем прямо в таблицу Better Auth ("user": plan и "planUntil" — дополнительные поля из auth.ts).
 * Даты — как их хранит Better Auth: timestamptz в Postgres, ISO-строка в SQLite.
 */

/** Пробный план до until — только тому, у кого сейчас free или истёк срок. false — план уже другой. */
export async function setTrialPlan(userId: string, plan: string, until: Date): Promise<boolean> {
  if (pg) {
    const r = await pg.query(
      `update "user" set plan = $1, "planUntil" = $2, "updatedAt" = now()
        where id = $3 and (plan = 'free' or ("planUntil" is not null and "planUntil" <= now()))`,
      [plan, until, userId],
    );
    return (r.rowCount ?? 0) > 0;
  }
  const now = new Date().toISOString();
  const r = localDb()
    .prepare(
      `update "user" set plan = ?, "planUntil" = ?, "updatedAt" = ?
        where id = ? and (plan = 'free' or ("planUntil" is not null and "planUntil" <= ?))`,
    )
    .run(plan, until.toISOString(), now, userId, now);
  return Number(r.changes) > 0;
}

/** Срок плана вышел — возвращаем free (если за это время план не продлили). creator не трогаем никогда. */
export async function expireTrial(userId: string) {
  if (pg) {
    await pg.query(
      `update "user" set plan = 'free', "planUntil" = null, "updatedAt" = now()
        where id = $1 and plan <> 'creator' and "planUntil" is not null and "planUntil" <= now()`,
      [userId],
    );
    return;
  }
  const now = new Date().toISOString();
  localDb()
    .prepare(
      `update "user" set plan = 'free', "planUntil" = null, "updatedAt" = ?
        where id = ? and plan <> 'creator' and "planUntil" is not null and "planUntil" <= ?`,
    )
    .run(now, userId, now);
}

/* ——— Оплата (Platega): платёж создаём до перехода на оплату, тариф включаем по подтверждённому callback ——— */
const PAYMENTS = {
  pg: [
    `create table if not exists payments (id text primary key, user_id text not null, plan text not null, days int not null,
      amount int not null, status text not null default 'pending', tx_id text, created_at timestamptz not null default now(),
      paid_at timestamptz)`,
    "create index if not exists payments_created_at on payments (created_at)",
  ],
  sqlite: [
    `create table if not exists payments (id text primary key, user_id text not null, plan text not null, days integer not null,
      amount integer not null, status text not null default 'pending', tx_id text, created_at text not null, paid_at text)`,
    "create index if not exists payments_created_at on payments (created_at)",
  ],
};

export type Payment = {
  id: string;
  user_id: string;
  plan: string;
  days: number;
  amount: number;
  status: "pending" | "paid" | "canceled" | "chargeback";
  tx_id: string | null;
  created_at: string | null;
  paid_at: string | null;
};

const asPayment = (x: Record<string, unknown>): Payment => ({
  id: String(x.id),
  user_id: String(x.user_id),
  plan: String(x.plan),
  days: Number(x.days),
  amount: Number(x.amount),
  status: String(x.status) as Payment["status"],
  tx_id: (x.tx_id as string | null) ?? null,
  created_at: iso(x.created_at),
  paid_at: iso(x.paid_at),
});

export async function createPayment(p: { id: string; userId: string; plan: string; days: number; amount: number }) {
  await ensureTables("payments", PAYMENTS);
  if (pg) {
    await pg.query("insert into payments (id, user_id, plan, days, amount) values ($1, $2, $3, $4, $5)", [
      p.id, p.userId, p.plan, p.days, p.amount,
    ]);
    return;
  }
  localDb()
    .prepare("insert into payments (id, user_id, plan, days, amount, created_at) values (?, ?, ?, ?, ?, ?)")
    .run(p.id, p.userId, p.plan, p.days, p.amount, new Date().toISOString());
}

export async function setPaymentTx(id: string, txId: string) {
  await ensureTables("payments", PAYMENTS);
  if (pg) await pg.query("update payments set tx_id = $1 where id = $2", [txId, id]);
  else localDb().prepare("update payments set tx_id = ? where id = ?").run(txId, id);
}

export async function getPayment(id: string): Promise<Payment | null> {
  await ensureTables("payments", PAYMENTS);
  const row = pg
    ? (await pg.query("select * from payments where id = $1", [id])).rows[0]
    : localDb().prepare("select * from payments where id = ?").get(id);
  return row ? asPayment(row as Record<string, unknown>) : null;
}

/** Ждущий платёж → оплачен. Одним UPDATE: повторный callback не продлит тариф второй раз. */
export async function markPaymentPaid(id: string): Promise<boolean> {
  await ensureTables("payments", PAYMENTS);
  if (pg) {
    const r = await pg.query("update payments set status = 'paid', paid_at = now() where id = $1 and status = 'pending'", [id]);
    return (r.rowCount ?? 0) > 0;
  }
  const r = localDb()
    .prepare("update payments set status = 'paid', paid_at = ? where id = ? and status = 'pending'")
    .run(new Date().toISOString(), id);
  return Number(r.changes) > 0;
}

/** canceled — только для ждущего; chargeback — для оплаченного (банк вернул деньги). */
export async function setPaymentStatus(id: string, status: "canceled" | "chargeback"): Promise<boolean> {
  await ensureTables("payments", PAYMENTS);
  const from = status === "canceled" ? "pending" : "paid";
  if (pg) {
    const r = await pg.query("update payments set status = $1 where id = $2 and status = $3", [status, id, from]);
    return (r.rowCount ?? 0) > 0;
  }
  const r = localDb().prepare("update payments set status = ? where id = ? and status = ?").run(status, id, from);
  return Number(r.changes) > 0;
}

export async function listPayments(limit = 30): Promise<(Payment & { email: string | null })[]> {
  await ensureTables("payments", PAYMENTS);
  const q = `select p.*, u.email from payments p left join "user" u on u.id = p.user_id order by p.created_at desc limit ${Number(limit)}`;
  const rows = pg ? (await pg.query(q)).rows : localDb().prepare(q).all();
  return (rows as Record<string, unknown>[]).map((x) => ({ ...asPayment(x), email: (x.email as string | null) ?? null }));
}

/**
 * Оплаченный тариф на days дней. Если такой же тариф ещё действует — продлеваем от его конца, иначе от сейчас.
 * Создателя и бессрочный платный тариф не трогаем.
 */
export async function grantPaidPlan(userId: string, plan: string, days: number): Promise<Date | "forever" | null> {
  if (days <= 0) {
    // Навсегда: тариф без срока. Создателя не трогаем
    if (pg) {
      const r = await pg.query(`update "user" set plan = $1, "planUntil" = null, "updatedAt" = now() where id = $2 and plan <> 'creator'`, [plan, userId]);
      return (r.rowCount ?? 0) > 0 ? "forever" : null;
    }
    const r = localDb()
      .prepare(`update "user" set plan = ?, "planUntil" = null, "updatedAt" = ? where id = ? and plan <> 'creator'`)
      .run(plan, new Date().toISOString(), userId);
    return Number(r.changes) > 0 ? "forever" : null;
  }
  if (pg) {
    const r = await pg.query(
      `update "user" set plan = $1,
          "planUntil" = greatest(case when plan = $1 then coalesce("planUntil", now()) else now() end, now()) + make_interval(days => $2),
          "updatedAt" = now()
        where id = $3 and plan <> 'creator' and not (plan <> 'free' and "planUntil" is null)
        returning "planUntil"`,
      [plan, days, userId],
    );
    return r.rows[0] ? new Date(r.rows[0].planUntil) : null;
  }
  const db = localDb();
  const u = db.prepare(`select plan, "planUntil" from "user" where id = ?`).get(userId) as
    | { plan: string | null; planUntil: string | null }
    | undefined;
  if (!u || u.plan === "creator" || (u.plan && u.plan !== "free" && !u.planUntil)) return null;
  const cur = u.plan === plan && u.planUntil ? new Date(u.planUntil).getTime() : 0;
  const until = new Date(Math.max(cur, Date.now()) + days * 86400_000);
  db.prepare(`update "user" set plan = ?, "planUntil" = ?, "updatedAt" = ? where id = ?`).run(
    plan, until.toISOString(), new Date().toISOString(), userId,
  );
  return until;
}

/** Банк вернул деньги — оплаченный срок снимаем (создателя не трогаем). */
export async function revokePaidPlan(userId: string) {
  if (pg) {
    await pg.query(
      `update "user" set plan = 'free', "planUntil" = null, "updatedAt" = now() where id = $1 and plan <> 'creator' and "planUntil" is not null`,
      [userId],
    );
    return;
  }
  localDb()
    .prepare(`update "user" set plan = 'free', "planUntil" = null, "updatedAt" = ? where id = ? and plan <> 'creator' and "planUntil" is not null`)
    .run(new Date().toISOString(), userId);
}

/** Сколько оплачено (или ждёт оплаты последние 30 минут) платежей с такой суммой и сроком — для ограниченных предложений. */
export async function countTaken(amount: number, days: number): Promise<number> {
  await ensureTables("payments", PAYMENTS);
  if (pg) {
    const r = await pg.query(
      `select count(*)::int as n from payments where amount = $1 and days = $2
        and (status = 'paid' or (status = 'pending' and created_at > now() - interval '30 minutes'))`,
      [amount, days],
    );
    return Number(r.rows[0]?.n ?? 0);
  }
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const row = localDb()
    .prepare(
      "select count(*) as n from payments where amount = ? and days = ? and (status = 'paid' or (status = 'pending' and created_at > ?))",
    )
    .get(amount, days, since) as { n: number };
  return Number(row.n);
}
