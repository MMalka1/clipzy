import "server-only";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Sandbox } from "@vercel/sandbox";
import { dropGuestMove, pendingGuestMoves } from "./db";

/**
 * Движок обработки видео в Vercel Sandbox — вместо своего сервера.
 *
 * Одна постоянная машина (4 ядра, 8 ГБ) на весь сайт. Бесплатный тариф даёт в месяц ~5 часов работы процессора
 * и 420 ГБ·ч памяти, поэтому машина работает, только пока ею пользуются: просыпается по действию пользователя
 * (загрузка, экспорт), браузер продлевает сеанс, пока человек активен, а без дела машина засыпает через ~12 минут.
 * Сон сохраняет диск в снимок; сеанс длится максимум 45 минут, потом машина так же засыпает и просыпается заново.
 * Первый запуск ставит движок (FFmpeg, Python, Whisper) — 5–10 минут, дальше старт занимает секунды.
 * Код движка лежит в папке engine/ рядом с сайтом и копируется на машину, когда меняется.
 */

const ENV = process.env.VERCEL_ENV || "dev";
// Боевой сайт и локальная разработка — разные машины: разработка не должна перезаписывать код боевого движка.
// Превью-деплои движок не запускают: вторая установка съела бы бесплатные лимиты.
const NAME = (process.env.CLIPZY_SANDBOX_NAME || "clipzy-engine") + (ENV === "production" ? "" : "-dev");
const REGION = process.env.CLIPZY_SANDBOX_REGION || "fra1"; // Франкфурт — ближе всего к России
const ROOT = "/vercel/sandbox/clipzy";
const PORT = 8000;
const IDLE_MS = 12 * 60_000; // столько машина живёт после последнего знака жизни от пользователя
const MODEL = process.env.CLIPZY_WHISPER_MODEL || "large-v3-turbo";
const MAX_STARTS = 3; // движок падает при запуске столько раз подряд — показываем ошибку, а не крутим вечно

export type EngineState =
  | { state: "online"; url: string; busy: number; maxMinutes: number | null }
  | { state: "asleep" }
  | { state: "installing"; step: string }
  | { state: "starting" }
  | { state: "failed"; detail: string }
  | { state: "quota" }
  | { state: "unavailable"; detail: string };

type Bundle = { files: { path: string; content: Buffer }[]; code: string; deps: string };
let bundle: Promise<Bundle> | null = null;

const sha = (...parts: (string | Buffer)[]) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p).update("\0");
  return h.digest("hex").slice(0, 12);
};

/** Адреса сайта, которым движок разрешит обращаться к себе из браузера. */
function siteOrigins() {
  const urls = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.BETTER_AUTH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
  ];
  return [...new Set(urls.filter((u): u is string => Boolean(u)).map((u) => new URL(u).origin))].join(",");
}

function engineEnv(): Record<string, string> {
  const secret = process.env.ENGINE_SECRET;
  if (!secret) throw new Error("ENGINE_SECRET не задан");
  return {
    ENGINE_SECRET: secret,
    CLIPZY_SITE_ORIGINS: siteOrigins(),
    CLIPZY_HOME: ROOT,
    HF_HOME: `${ROOT}/hf`,
    CLIPZY_DEVICE: "cpu",
    CLIPZY_WHISPER_MODEL: MODEL,
    CLIPZY_BEAM: process.env.CLIPZY_BEAM || "1", // процессорное время ограничено — ищем в ширину 1
    CLIPZY_MAX_MINUTES: process.env.CLIPZY_MAX_MINUTES || "20",
    CLIPZY_MAX_UPLOAD_GB: "2",
    CLIPZY_RENDERS_PER_DAY: process.env.CLIPZY_RENDERS_PER_DAY || "30",
    CLIPZY_JOB_TTL_HOURS: "48",
    ...(process.env.GOOGLE_TRANSLATE_KEY ? { GOOGLE_TRANSLATE_KEY: process.env.GOOGLE_TRANSLATE_KEY } : {}),
  };
}

/** Файлы движка из папки engine/ и их отпечатки: code — код и настройки, deps — что ставит установка. */
function loadBundle(): Promise<Bundle> {
  bundle ??= (async () => {
    const dir = path.join(process.cwd(), "engine");
    const files: Bundle["files"] = [];
    const walk = async (rel: string) => {
      for (const e of await readdir(path.join(dir, rel), { withFileTypes: true })) {
        const p = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(p);
        else {
          let content = await readFile(path.join(dir, p));
          // Скрипты с Windows-переводами строк bash не запустит
          if (/\.(sh|py|txt)$/.test(p)) content = Buffer.from(content.toString("utf8").replace(/\r\n/g, "\n"));
          files.push({ path: p, content });
        }
      }
    };
    await walk("");
    files.sort((a, b) => a.path.localeCompare(b.path));
    const env = engineEnv();
    const config = JSON.stringify({ ...env, ENGINE_SECRET: sha(env.ENGINE_SECRET) });
    const code = sha(...files.flatMap((f) => [f.path, f.content]), config);
    const req = files.find((f) => f.path === "requirements-cpu.txt")?.content ?? "";
    const setup = files.find((f) => f.path === "sandbox/setup.sh")?.content ?? "";
    return { files, code, deps: sha(req, setup, MODEL) };
  })().catch((e) => {
    bundle = null;
    throw e;
  });
  return bundle;
}

async function sh(sb: Sandbox, script: string) {
  const r = await sb.runCommand({ cmd: "bash", args: ["-c", script] });
  return (await r.stdout()).trim();
}

/** Одним вызовом: установлен ли движок, какая версия кода на диске, жив ли и отвечает ли сервер. */
const STATUS = `R=${ROOT}; mkdir -p $R/engine
echo "ready=$(cat $R/ready 2>/dev/null)"
echo "state=$(cat $R/setup.state 2>/dev/null)"
echo "failed=$(cat $R/failed 2>/dev/null)"
echo "code=$(cat $R/engine/.version 2>/dev/null)"
if flock -n /tmp/clipzy-setup.lock true 2>/dev/null; then echo setup=0; else echo setup=1; fi
P=$(cat /tmp/clipzy-engine.pid 2>/dev/null); if [ -n "$P" ] && kill -0 "$P" 2>/dev/null; then echo alive=1; else echo alive=0; fi
echo "starts=$(cat /tmp/clipzy-starts 2>/dev/null || echo 0)"
echo "health=$(curl -s -m 3 http://127.0.0.1:${PORT}/health)"
echo "log=$(tail -c 700 $R/setup.log 2>/dev/null | tr '\\n' ' ')"
echo "elog=$(tail -c 700 $R/engine.log 2>/dev/null | tr '\\n' ' ')"`;

function parseStatus(out: string) {
  const kv: Record<string, string> = {};
  for (const line of out.split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) kv[line.slice(0, i)] = line.slice(i + 1);
  }
  let health: { ok?: boolean; busy?: number; version?: string; maxMinutes?: number | null } | null = null;
  try {
    health = kv.health ? JSON.parse(kv.health) : null;
  } catch {
    health = null;
  }
  return {
    ready: kv.ready ?? "",
    state: kv.state ?? "",
    failed: kv.failed ?? "",
    code: kv.code ?? "",
    setup: kv.setup === "1",
    alive: kv.alive === "1",
    starts: Number(kv.starts) || 0,
    health,
    log: kv.log ?? "",
    elog: kv.elog ?? "",
  };
}

// Сервер держит блокировку всё время работы: второй одновременный запуск тихо выходит.
// PID и число запусков — в /tmp: после сна машины это новый сеанс, и счёт начинается заново.
const START = `exec 9>/tmp/clipzy-engine.lock; flock -n 9 || exit 0
echo $(( $(cat /tmp/clipzy-starts 2>/dev/null || echo 0) + 1 )) >/tmp/clipzy-starts
echo $$ >/tmp/clipzy-engine.pid
cd ${ROOT}/engine && exec ${ROOT}/venv/bin/python -m uvicorn app:app --host 0.0.0.0 --port ${PORT} --no-access-log \
  --timeout-graceful-shutdown 5 >>${ROOT}/engine.log 2>&1`;
// Останавливаем по PID (pkill -f задел бы и эту же оболочку) и ждём, пока освободится блокировка
const STOP = `P=$(cat /tmp/clipzy-engine.pid 2>/dev/null); [ -n "$P" ] && kill "$P" 2>/dev/null
flock -w 10 /tmp/clipzy-engine.lock true 2>/dev/null || { [ -n "$P" ] && kill -9 "$P" 2>/dev/null; flock -w 5 /tmp/clipzy-engine.lock true; }
echo 0 >/tmp/clipzy-starts`;
// Установка тоже под блокировкой: два одновременных запроса не запустят её дважды
const SETUP = (deps: string) => `exec 8>/tmp/clipzy-setup.lock; flock -n 8 || exit 0
rm -f ${ROOT}/failed; : >${ROOT}/setup.log; exec bash ${ROOT}/engine/sandbox/setup.sh ${deps}`;

const sandboxParams = {
  name: NAME,
  region: REGION,
  failoverRegions: REGION === "iad1" ? ["cle1"] : ["iad1"],
  ports: [PORT],
  resources: { vcpus: 4 },
  timeout: IDLE_MS,
  persistent: true,
  keepLastSnapshots: { count: 1, expiration: 0 }, // храним только последний снимок диска, без срока годности
};

function explain(e: unknown): EngineState {
  const text = e instanceof Error ? e.message : String(e);
  const status = (e as { response?: Response })?.response?.status ?? 0;
  console.error("[sandbox]", status, text);
  if (status === 402 || /quota|limit exceeded|paused|payment required/i.test(text)) return { state: "quota" };
  // Машина как раз засыпает или просыпается, сеть моргнула — это пройдёт, браузер спросит ещё раз
  if (status === 410 || status === 422 || status === 429 || status >= 500 || /stopping|snapshotting|timeout|ECONNRESET|fetch failed/i.test(text)) {
    return { state: "starting" };
  }
  return { state: "unavailable", detail: text.slice(0, 300) };
}

function refusePreview(): EngineState | null {
  return ENV === "preview" ? { state: "unavailable", detail: "Превью-деплой не запускает движок — проверяйте на боевом адресе" } : null;
}

/** Продлеваем сеанс так, чтобы до сна оставалось не меньше IDLE_MS (но не дольше потолка тарифа). */
async function keepAwake(sb: Sandbox) {
  const left = sb.expiresAt ? sb.expiresAt.getTime() - Date.now() : IDLE_MS;
  if (left >= IDLE_MS - 60_000) return;
  await sb.extendTimeout(Math.ceil((IDLE_MS - left) / 60_000) * 60_000).catch(() => {
    // упёрлись в 45 минут сеанса — машина уснёт, диск сохранится, следующий запрос её разбудит
  });
}

/** Проекты гостей, которые зарегистрировались, пока машина спала, — переносим в их аккаунты. */
async function flushGuestMoves(url: string) {
  const moves = await pendingGuestMoves().catch(() => []);
  for (const m of moves) {
    const res = await fetch(`${url}/internal/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Engine-Secret": process.env.ENGINE_SECRET ?? "" },
      body: JSON.stringify({ from: m.from, to: m.to }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);
    if (res?.ok) await dropGuestMove(m.from).catch(() => {});
  }
}

/**
 * Состояние движка без пробуждения: работает ли машина прямо сейчас. Заодно продлевает сеанс —
 * браузер зовёт это, пока пользователь активен.
 */
export async function peekEngine(): Promise<EngineState> {
  const refused = refusePreview();
  if (refused) return refused;
  try {
    const sb = await Sandbox.get({ name: NAME });
    if (sb.status !== "running") return { state: "asleep" };
    const st = parseStatus(await sh(sb, STATUS));
    if (!st.health?.ok) return { state: "asleep" };
    await keepAwake(sb);
    return { state: "online", url: sb.domain(PORT), busy: st.health.busy ?? 0, maxMinutes: st.health.maxMinutes ?? null };
  } catch (e) {
    // Машины ещё нет (сайт только что задеплоен) — это тоже «спит»: первое действие её создаст
    const status = (e as { response?: Response })?.response?.status;
    if (status === 404 || /not.?found/i.test(e instanceof Error ? e.message : String(e))) return { state: "asleep" };
    return explain(e);
  }
}

/**
 * Будит и при необходимости ставит движок. Каждый вызов короткий: долгие шаги идут на машине в фоне,
 * а браузер повторяет запрос, пока не получит online. retry — повторить установку после ошибки.
 */
export async function ensureEngine({ retry = false } = {}): Promise<EngineState> {
  const refused = refusePreview();
  if (refused) return refused;
  try {
    const [sb, b] = await Promise.all([Sandbox.getOrCreate(sandboxParams), loadBundle()]);
    // getOrCreate не меняет настройки уже созданной машины — сон через IDLE_MS задаём явно
    if (sb.timeout !== IDLE_MS) await sb.update({ timeout: IDLE_MS }).catch(() => {});
    let st = parseStatus(await sh(sb, STATUS)); // спящая машина проснётся на этом вызове
    await keepAwake(sb);

    // Код обновляем, пока движок свободен: иначе обработка на ходу подхватит новые файлы вперемешку со старыми
    if (st.code !== b.code && !st.health?.busy) {
      await sb.writeFiles(b.files.map((f) => ({ path: `${ROOT}/engine/${f.path}`, content: f.content })));
      await sh(sb, `echo ${b.code} > ${ROOT}/engine/.version`);
      st = { ...st, code: b.code };
    }

    if (st.ready !== b.deps) {
      if (st.setup) return { state: "installing", step: st.state || "system" };
      // Ставить новые зависимости можно только с новыми файлами — иначе отметим «готово» по старому списку
      if (st.code !== b.code) return online(sb, st);
      // Упавшую установку повторяем сами, только если с тех пор поменялись скрипт или зависимости
      if (st.state === "failed" && st.failed === b.deps && !retry) return { state: "failed", detail: st.log.slice(-500) };
      await sb.runCommand({ cmd: "bash", args: ["-c", SETUP(b.deps)], env: { CLIPZY_WHISPER_MODEL: MODEL }, detached: true });
      return { state: "installing", step: "system" };
    }

    const h = st.health;
    if (!h?.ok) {
      if (st.alive) return { state: "starting" }; // Python ещё загружается
      if (st.starts >= MAX_STARTS && !retry) return { state: "failed", detail: st.elog.slice(-500) };
      if (retry) await sh(sb, "echo 0 >/tmp/clipzy-starts");
      await sb.runCommand({ cmd: "bash", args: ["-c", START], env: { ...engineEnv(), CLIPZY_VERSION: b.code }, detached: true });
      return { state: "starting" };
    }
    // Новый код или настройки — перезапускаем, но только свободный движок: обработку и загрузки не обрываем
    if (h.version !== b.code && !h.busy && st.code === b.code) {
      await sh(sb, STOP);
      await sb.runCommand({ cmd: "bash", args: ["-c", START], env: { ...engineEnv(), CLIPZY_VERSION: b.code }, detached: true });
      return { state: "starting" };
    }
    return online(sb, st);
  } catch (e) {
    return explain(e);
  }
}

async function online(sb: Sandbox, st: ReturnType<typeof parseStatus>): Promise<EngineState> {
  if (!st.health?.ok) return { state: "starting" };
  const url = sb.domain(PORT);
  await flushGuestMoves(url);
  return { state: "online", url, busy: st.health.busy ?? 0, maxMinutes: st.health.maxMinutes ?? null };
}

/** Адрес движка для служебных вызовов с сервера — только если машина уже работает (будить ради них не стоит). */
export async function runningEngineUrl(): Promise<string | null> {
  try {
    const sb = await Sandbox.get({ name: NAME });
    return sb.status === "running" ? sb.domain(PORT) : null;
  } catch {
    return null;
  }
}
