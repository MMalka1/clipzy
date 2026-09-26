/** Клиент движка Clipzy (Python, FastAPI). По умолчанию работает на этом же компьютере. */

import type { Segment } from "./captions";

/** Свой компьютер или сервер — постоянный адрес из NEXT_PUBLIC_ENGINE_URL.
 *  Режим sandbox — движок в Vercel Sandbox: адрес выдаёт /api/engine, когда будит машину. */
const FIXED_URL = process.env.NEXT_PUBLIC_ENGINE_URL?.replace(/\/+$/, "");
export const SANDBOX = process.env.NEXT_PUBLIC_ENGINE_MODE === "sandbox" && !FIXED_URL;
let ENGINE_URL = FIXED_URL ?? "http://localhost:8000";

export type Highlight = {
  id: number;
  start: number;
  end: number;
  title: string;
  score: number;
  faceX: number | null;
  faceY?: number | null;
};

export type Phrase = Segment & { emoji?: string | null };

/** Звук в плане: t — момент «попадания» в шкале исходника, peak — где пик внутри сэмпла, gain — громкость.
 *  У планов первой версии нет cat/peak/gain: тогда type — "whoosh" или "ding", t — начало сэмпла. */
export type SfxEvent = { t: number; type: string; cat?: SfxCat; peak?: number; gain?: number };
export type SfxCat = "transition" | "accent" | "meaning";
/** Звук в готовом рилсе: t — начало сэмпла (может быть < 0 — начало обрезается), gain уже с громкостью эффектов */
export type ClipSfx = { t: number; type: string; gain: number };

// Звуки хука — как hook_events() в edit_plan.py (пики и громкости из sfx_synth.SOUNDS)
const HOOK_IMPACT = { type: "sfx2_impact", peak: 0.013, gain: 0.42 * 0.8 };
const HOOK_WHOOSH = { type: "sfx2_whoosh_3", peak: 0.26, gain: 0.5, at: 3.2 };

/**
 * Звуки клипа в шкале готового рилса — ровно как render.clip_sfx() в движке, чтобы превью звучало как видео.
 * mapTime/inside — перевод времени исходника в время рилса с учётом вырезанных пауз.
 */
export function clipSfx(
  planSfx: SfxEvent[],
  opts: { transitions: boolean; accents: boolean; meaning: boolean; volume: number; hook: boolean },
  range: { start: number; end: number },
  total: number,
  mapTime: (t: number) => number,
  inside: (t: number) => boolean,
): ClipSfx[] {
  const cats = new Set<SfxCat>();
  if (opts.transitions) cats.add("transition");
  if (opts.accents) cats.add("accent");
  if (opts.meaning) cats.add("meaning");
  const vol = Math.min(Math.max(opts.volume, 0), 100) / 70;
  const out: (ClipSfx & { a: number; cat: SfxCat })[] = [];
  for (const e of planSfx) {
    const cat: SfxCat = e.cat ?? (e.type === "whoosh" ? "transition" : "accent");
    if (!cats.has(cat) || e.t < range.start || e.t > range.end || !inside(e.t)) continue;
    const a = mapTime(e.t);
    if (a < 0.4 || a > total - 0.25) continue; // не в первый миг (там хук) и не на самом обрыве
    out.push({ a, t: a - (e.peak ?? 0), type: e.type, cat, gain: (e.gain ?? (e.type === "whoosh" ? 0.7 : 0.45)) * vol });
  }
  if (opts.hook && total > 4) {
    if (cats.has("accent")) out.push({ a: HOOK_IMPACT.peak, t: 0, type: HOOK_IMPACT.type, cat: "accent", gain: HOOK_IMPACT.gain * vol });
    const clash = out.some((x) => x.cat === "transition" && Math.abs(x.a - HOOK_WHOOSH.at) < 1.2);
    if (cats.has("transition") && !clash)
      out.push({ a: HOOK_WHOOSH.at, t: HOOK_WHOOSH.at - HOOK_WHOOSH.peak, type: HOOK_WHOOSH.type, cat: "transition", gain: HOOK_WHOOSH.gain * vol });
  }
  return out.sort((x, y) => x.t - y.t).map(({ t, type, gain }) => ({ t, type, gain }));
}

/** Монтажный ритм из движка (время исходника): планы, акценты, звуки. */
export type EditPlan = {
  shots: { start: number; end: number; zoom: number }[];
  accents: { start: number; end: number }[];
  sfx: SfxEvent[];
};

// Те же константы, что в edit_plan.py
const PUSH = 0.035;
const ACCENT_ZOOM = 0.09;
const ACCENT_IN = 0.18;
const ACCENT_OUT = 0.4;

/** Зум в момент t — формула совпадает с zoom_expr в движке (время готового рилса). */
export function zoomAt(t: number, shots: EditPlan["shots"], accents: EditPlan["accents"]) {
  let z = 1;
  for (const s of shots) {
    if (t >= s.start && t < s.end) {
      z += s.zoom - 1 + (PUSH * (t - s.start)) / (s.end - s.start);
      break;
    }
  }
  for (const a of accents) {
    const end = a.end + ACCENT_OUT;
    if (t >= a.start && t <= end) {
      const x = Math.min(Math.max(Math.min((t - a.start) / ACCENT_IN, (end - t) / ACCENT_OUT), 0), 1);
      z += (ACCENT_ZOOM * (1 - Math.cos(Math.PI * x))) / 2;
    }
  }
  return z;
}

export const MUSIC_TRACKS = [
  { id: "lofi", name: "Лоуфай" },
  { id: "ambient", name: "Эмбиент" },
  { id: "drive", name: "Драйв" },
] as const;

export type Job = {
  id: string;
  name: string;
  status: "queued" | "processing" | "ready" | "error";
  stage: "download" | "queued" | "audio" | "transcribe" | "highlights" | "face" | "done";
  progress: number;
  error?: string | null;
  duration?: number;
  width?: number;
  height?: number;
  language?: string | null;
  device?: string | null;
  phrases?: Phrase[];
  highlights?: Highlight[];
  faceX?: number | null;
  faceY?: number | null;
  plan?: EditPlan;
  /** Путь кадра за спикером: [время исходника, положение 0..1]. mode=speaker — камера режет на того, кто говорит */
  track?: { points: [number, number][]; fy: number; mode?: "speaker" } | null;
  /** Постоянные участники (двое и больше) — для «экрана пополам» */
  speakers?: Speaker[];
  /** no_audio — нет звука, no_speech — речь не найдена, unclear — распознано неуверенно */
  speech?: "no_audio" | "no_speech" | "unclear" | null;
  peaks?: number[];
};

/** Участник подкаста: где лицо и какое окно исходника показать в половине экрана (доли кадра) */
export type Panel = { x: number; y: number; w: number; h: number };
export type Speaker = { x: number; y: number; size: number; panel: Panel };

export type RecentJob = { id: string; name: string; duration: number; created: number; clips: number };

export type RenderOptions = {
  start: number;
  end: number;
  phrases: { words: { text: string; start: number; end: number; filler?: boolean }[] }[];
  style: string;
  size: number;
  captionY: number;
  accent: string | null;
  textColor: string | null;
  cropX: number;
  faceX: number | null;
  faceY: number | null;
  frameScale: number;
  hook: string | null;
  removePauses: boolean;
  zoom: boolean;
  progressBar: boolean;
  emoji: boolean;
  removeFillers: boolean;
  sfxWhoosh: boolean;
  sfxDing: boolean;
  sfxSmart: boolean;
  sfxVolume: number;
  music: string | null;
  musicVolume: number;
  layout: "single" | "split";
  aspect: Aspect;
};

export type RenderState = {
  id: string;
  status: "queued" | "rendering" | "done" | "error";
  progress: number;
  error?: string | null;
  duration?: number;
};

/** Язык сайта в момент вызова: <html lang> держат в актуальном виде layout и переключатель RU/EN. */
const uiLang = (): "ru" | "en" =>
  typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "ru";

/** Запасные тексты ошибок клиента — на языке сайта (сообщения самого движка переводит движок по X-Lang). */
const ERR = {
  ru: {
    engine: (status: number) => `Ошибка движка (${status})`,
    upload: "Не удалось загрузить файл",
    offline: "Движок недоступен",
    tooLong: (m: number) => `Видео длиннее ${m} минут. В бесплатном режиме загрузите кусок покороче.`,
    fromUrl: "Не удалось добавить видео по ссылке",
  },
  en: {
    engine: (status: number) => `Engine error (${status})`,
    upload: "Couldn't upload the file",
    offline: "The engine is unavailable",
    tooLong: (m: number) => `The video is longer than ${m} minutes. In free mode, upload a shorter part.`,
    fromUrl: "Couldn't add the video from this link",
  },
};
const err = () => ERR[uiLang()];

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new EngineError(body?.detail || err().engine(res.status), res.status);
  }
  return res.json();
}

/* ——— Доступ к движку: токен выдаёт сайт (/api/engine-token) по сессии пользователя ——— */
export type EngineUser = { name: string; email: string | null; anon: boolean; plan: string };
let session: { token: string; exp: number; user: EngineUser } | null = null;

/** Токен и пользователь. Если никто не вошёл — тихо создаём гостя (первое видео без регистрации). */
export async function engineSession(force = false) {
  if (!force && session && session.exp - Date.now() / 1000 > 60) return session;
  let res = await fetch("/api/engine-token", { cache: "no-store" });
  if (res.status === 401) {
    const { authClient } = await import("./auth-client");
    await authClient.signIn.anonymous();
    res = await fetch("/api/engine-token", { cache: "no-store" });
  }
  session = await json<typeof session & object>(res);
  return session;
}

/** Токен для адресов <video>/<a>, где нельзя передать заголовок. */
const withToken = (url: string) => (session ? `${url}${url.includes("?") ? "&" : "?"}t=${session.token}` : url);

async function efetch(path: string, init: RequestInit = {}, retry = true, fresh = false): Promise<Response> {
  const { token } = await engineSession(fresh);
  let res: Response;
  try {
    res = await fetch(`${ENGINE_URL}${path}`, {
      cache: "no-store",
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}`, "X-Lang": uiLang() },
    });
  } catch (e) {
    // Машина Vercel Sandbox уснула — будим и повторяем один раз
    if (SANDBOX && retry && (await wakeEngine())) return efetch(path, init, false, fresh);
    throw e;
  }
  if (SANDBOX && retry && res.status >= 502 && res.status <= 504 && (await wakeEngine())) {
    return efetch(path, init, false, fresh);
  }
  if (res.status === 401 && retry) {
    await engineSession(true);
    return efetch(path, init, false);
  }
  return res;
}

/* ——— Движок в Vercel Sandbox: машина спит, пока не нужна ——— */
export type WakeState =
  | { state: "online"; url: string; busy: number; maxMinutes: number | null }
  | { state: "asleep" }
  | { state: "installing"; step: string }
  | { state: "starting" }
  | { state: "failed"; detail: string }
  | { state: "quota" }
  | { state: "unavailable"; detail: string };

/** Ограничения бесплатного сервера: видео длиннее — не берём (узнаём, когда движок проснётся). */
export const engineLimits: { maxMinutes: number | null } = { maxMinutes: null };

let waking: Promise<boolean> | null = null;
let failedAt = 0; // последняя неудача: пару десятков секунд не дёргаем сервер снова
let lastFail: WakeState | null = null;
const wakeListeners = new Set<(s: WakeState) => void>();

async function askEngine(body: { peek?: boolean; retry?: boolean }): Promise<{ status: number; state: WakeState }> {
  try {
    const res = await fetch("/api/engine", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const state: WakeState = await res.json();
      if (state.state === "online") {
        ENGINE_URL = state.url.replace(/\/+$/, "");
        engineLimits.maxMinutes = state.maxMinutes;
      }
      return { status: res.status, state };
    }
    return { status: res.status, state: { state: "unavailable", detail: `HTTP ${res.status}` } };
  } catch {
    return { status: 0, state: { state: "starting" } }; // сеть моргнула — спросим ещё раз
  }
}

/**
 * Будит движок и ждёт, пока он ответит (первая установка — до 10 минут, дальше — секунды).
 * Никогда не бросает исключений: false — движок недоступен, причину получат подписчики onState.
 * retry — повторить установку после ошибки.
 */
export function wakeEngine(opts: { retry?: boolean; onState?: (s: WakeState) => void } = {}): Promise<boolean> {
  if (!SANDBOX) return Promise.resolve(true);
  // Только что не получилось — не долбим сервер (опрос проекта зовёт нас раз в секунду)
  if (!opts.retry && lastFail && Date.now() - failedAt < 20_000) {
    opts.onState?.(lastFail);
    return Promise.resolve(false);
  }
  if (opts.onState) wakeListeners.add(opts.onState);
  const done = (ok: boolean) => {
    if (opts.onState) wakeListeners.delete(opts.onState);
    return ok;
  };
  // Кто-то уже будит — ждём вместе; просьба переустановить идёт своим запросом
  if (waking && !opts.retry) return waking.then(done);
  const notify = (s: WakeState) => wakeListeners.forEach((fn) => fn(s));
  const fail = (s: WakeState) => {
    lastFail = s;
    failedAt = Date.now();
    notify(s);
    return false;
  };
  const run = async () => {
    try {
      await engineSession(); // /api/engine пускает только вошедших (гость тоже подходит)
    } catch (e) {
      return fail({ state: "unavailable", detail: e instanceof Error ? e.message : String(e) });
    }
    const installDeadline = Date.now() + 20 * 60_000;
    let startingSince = 0;
    let reauthed = false;
    let serverErrors = 0;
    let first = true;
    while (Date.now() < installDeadline) {
      const { status, state: s } = await askEngine({ retry: first && opts.retry });
      first = false;
      if (status === 401 && !reauthed) {
        reauthed = true; // вышли в другой вкладке или сессия истекла — входим гостем заново
        await engineSession(true).catch(() => null);
        continue;
      }
      if (status >= 500 && ++serverErrors <= 5) {
        notify({ state: "starting" }); // функция сайта не дождалась машины — спросим ещё раз
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      if (s.state === "online") {
        lastFail = null;
        notify(s);
        return true;
      }
      if (s.state === "failed" || s.state === "quota" || s.state === "unavailable") return fail(s);
      notify(s);
      if (s.state === "starting") {
        startingSince ||= Date.now();
        // После установки старт — секунды; четыре минуты «запуска» значат, что что-то не так
        if (Date.now() - startingSince > 4 * 60_000) return fail({ state: "unavailable", detail: "timeout" });
      } else startingSince = 0;
      await new Promise((r) => setTimeout(r, s.state === "installing" ? 5000 : 2000));
    }
    return fail({ state: "unavailable", detail: "timeout" });
  };
  const p = run().finally(() => {
    if (waking === p) waking = null;
  });
  waking = p;
  return p.then(done);
}

/** Постоянная подписка на ход пробуждения (экран ожидания в редакторе). Возвращает отписку. */
export function subscribeWake(fn: (s: WakeState) => void) {
  wakeListeners.add(fn);
  return () => {
    wakeListeners.delete(fn);
  };
}

/** Работает ли движок прямо сейчас — не будя машину. Заодно продлевает её сеанс, пока человек активен. */
export async function peekEngine(): Promise<WakeState> {
  if (!SANDBOX) return { state: "online", url: ENGINE_URL, busy: 0, maxMinutes: null };
  try {
    await engineSession();
  } catch (e) {
    return { state: "unavailable", detail: e instanceof Error ? e.message : String(e) };
  }
  return (await askEngine({ peek: true })).state;
}

/**
 * Есть ли связь с движком. В режиме Vercel Sandbox машину не будим: asleep — спит и проснётся,
 * когда пользователь загрузит видео или откроет проект.
 */
export async function engineHealth(
  onState?: (s: WakeState) => void,
): Promise<{ ok: boolean; asleep?: boolean; ffmpeg?: boolean; nvenc?: boolean } | null> {
  if (SANDBOX) {
    const s = await peekEngine();
    onState?.(s);
    if (s.state === "online") return { ok: true };
    if (s.state === "asleep" || s.state === "starting" || s.state === "installing") return { ok: true, asleep: true };
    return null;
  }
  try {
    const res = await fetch(`${ENGINE_URL}/health`, { cache: "no-store" });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

/** Длина видеофайла в секундах (по метаданным в браузере) — чтобы не загружать заведомо слишком длинное. */
export function fileDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    const finish = (d: number | null) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.preload = "metadata";
    v.onloadedmetadata = () => finish(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => finish(null);
    setTimeout(() => finish(null), 8000);
    v.src = url;
  });
}

/** Загрузка через XHR — ради прогресса. Токен свежий: лимиты зависят от плана, а план могли сменить. */
export async function uploadVideo(file: File, onProgress: (p: number) => void): Promise<{ id: string }> {
  if (!(await wakeEngine())) throw new Error(err().offline);
  const max = engineLimits.maxMinutes;
  if (max) {
    const d = await fileDuration(file);
    if (d && d > max * 60 + 5) throw new EngineError(err().tooLong(max), 400);
  }
  const { token } = await engineSession(true);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${ENGINE_URL}/jobs`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("X-Lang", uiLang());
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new EngineError(body?.detail || err().upload, xhr.status));
      } catch {
        reject(new Error(err().upload));
      }
    };
    xhr.onerror = () => reject(new Error(err().offline));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

/** Видео по ссылке (YouTube, VK Видео, Rutube): движок скачает его сам. rights — пользователь подтвердил права. */
export async function createJobFromUrl(url: string, rights: boolean): Promise<{ id: string }> {
  if (!(await wakeEngine())) throw new Error(err().offline);
  // Свежий токен: лимиты зависят от плана
  const res = await efetch(
    "/jobs/from-url",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, rights }) },
    true,
    true,
  );
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new EngineError(body?.detail || err().fromUrl, res.status);
  return body;
}

export type CoverOptions = {
  t: number;
  title: string;
  accent: string | null;
  cropX: number;
  faceX: number | null;
  faceY: number | null;
  frameScale: number;
  layout: "single" | "split";
  aspect: Aspect;
};

/** Обложка рилса (JPG 1080×1920): кадр в момент t с кадрированием клипа и крупный заголовок. */
export async function makeCover(jobId: string, opts: CoverOptions): Promise<Blob> {
  const res = await efetch(
    `/jobs/${jobId}/cover`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(opts) },
    true,
    true, // водяной знак зависит от плана
  );
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new EngineError(body?.detail || `Engine error (${res.status})`, res.status);
  }
  return res.blob();
}

/** Ошибка движка с HTTP-статусом: 403/429 — упёрлись в лимит, нужна регистрация или Pro. */
export class EngineError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export const listJobs = () => efetch("/jobs").then(json<RecentJob[]>);

export const deleteJob = (id: string) => efetch(`/jobs/${id}`, { method: "DELETE" }).then(json<{ ok: boolean }>);

export const sourceUrl = (id: string) => withToken(`${ENGINE_URL}/jobs/${id}/source`);

export const getJob = (id: string) => efetch(`/jobs/${id}`).then(json<Job>);

export async function startRender(jobId: string, opts: RenderOptions) {
  if (!(await wakeEngine())) throw new Error(err().offline);
  // Свежий токен: водяной знак зависит от плана
  const res = await efetch(
    `/jobs/${jobId}/render`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(opts) },
    true,
    true,
  );
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new EngineError(body?.detail || err().engine(res.status), res.status);
  }
  return res.json() as Promise<{ id: string }>;
}

/** Субтитры на другом языке: фразы с таймингом по речи и переведённые хуки. */
export const translateJob = (id: string, target: string) =>
  efetch(`/jobs/${id}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target }),
  }).then(json<{ phrases: Phrase[]; titles: Record<string, string> }>);

export const getRender = (id: string) => efetch(`/renders/${id}`).then(json<RenderState>);

export const renderFileUrl = (id: string) => withToken(`${ENGINE_URL}/renders/${id}/file`);

/** Положение кадра в момент t — линейно между опорными точками, как в движке. */
/** Формат готового видео и его размер в пикселях (короткая сторона всегда 1080 — как FORMATS в движке) */
export type Aspect = "9:16" | "16:9" | "1:1";
export const ASPECTS: Aspect[] = ["9:16", "1:1", "16:9"];
export const CANVAS: Record<Aspect, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "16:9": { w: 1920, h: 1080 },
  "1:1": { w: 1080, h: 1080 },
};

/** Ширина окна (доля кадра), под которую движок посчитал путь камеры: вертикальный рилс 9:16 (track_frac). */
export function trackFrac(sw: number, sh: number) {
  return sw / sh > 9 / 16 ? (sh * 9) / 16 / sw : 1;
}

/** Путь камеры, посчитанный для окна frac0, — для окна frac1 с тем же центром (face_track.retarget). */
export function retarget(p: number, frac0: number, frac1: number) {
  const lo0 = frac0 / 2;
  const lo1 = frac1 / 2;
  if (1 - 2 * lo1 <= 1e-6) return 0.5;
  const center = lo0 + p * (1 - 2 * lo0);
  return Math.min(Math.max((center - lo1) / (1 - 2 * lo1), 0), 1);
}

/** Окно исходника вокруг участника под окно «экрана пополам» с пропорцией aspect (face_track.panel_rect). */
export function panelRect(person: { x: number; y: number; size: number }, sw: number, sh: number, aspect: number): Panel {
  const cw = Math.min(Math.max(person.size * sw * 3.4, sw * 0.28), sw, sh * aspect);
  const ch = cw / aspect;
  const x0 = Math.min(Math.max(person.x * sw - cw / 2, 0), sw - cw);
  const y0 = Math.min(Math.max(person.y * sh - ch * 0.52, 0), sh - ch);
  return { x: x0 / sw, y: y0 / sh, w: cw / sw, h: ch / sh };
}

export function trackAt(t: number, points: [number, number][]) {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t1, p1] = points[i];
    if (t < t1) {
      const [t0, p0] = points[i - 1];
      return p0 + ((p1 - p0) * (t - t0)) / (t1 - t0 || 1);
    }
  }
  return points[points.length - 1][1];
}

export const assetUrl = (name: string) => `${ENGINE_URL}/assets/${name}.wav`;

/** Адрес трека для превью: встроенный (lofi…) или загруженный (custom:<id>). */
export const musicUrl = (music: string) =>
  music.startsWith("custom:") ? withToken(`${ENGINE_URL}/music/${music.slice(7)}`) : assetUrl(`music_${music}`);

export async function uploadMusic(file: File): Promise<{ id: string; name: string }> {
  const form = new FormData();
  form.append("file", file);
  return efetch("/music", { method: "POST", body: form }).then(json<{ id: string; name: string }>);
}
