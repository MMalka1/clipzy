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
