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
