"""Clipzy Engine — HTTP API для сайта: загрузка, расшифровка, хайлайты, рендер рилсов.

Запуск:  .venv\\Scripts\\python -m uvicorn app:app --port 8000
"""

import base64
import hashlib
import hmac
import json
import os
import re
import shutil
import subprocess
import threading
import time
import traceback
import uuid
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor

from fastapi import Depends, FastAPI, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask
from starlette.exceptions import HTTPException as StarletteHTTPException
from pydantic import BaseModel, Field

import audio_fx
import captions_render
import i18n
import edit_plan
import face_track
import render
import sfx_kit
from paths import HOME
from emoji_map import phrase_emoji
from highlights import find_highlights, split_sentences, topic_title

def _load_env():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


_load_env()
ENGINE_SECRET = os.environ.get("ENGINE_SECRET", "")
if not ENGINE_SECRET:
    print("[auth] ВНИМАНИЕ: ENGINE_SECRET не задан — движок не пустит ни одного пользователя", flush=True)

# Данные храним в пути без кириллицы: OpenCV на Windows не открывает такие пути
DATA = os.environ.get("CLIPZY_DATA") or os.path.join(HOME, "jobs")
os.makedirs(DATA, exist_ok=True)
MAX_UPLOAD_GB = float(os.environ.get("CLIPZY_MAX_UPLOAD_GB") or 4)
MAX_UPLOAD = int(MAX_UPLOAD_GB * 1024**3)
# Бесплатный режим (Vercel Sandbox): сеанс машины — до 45 минут, поэтому видео ограничиваем по длине,
# а старые проекты удаляем, чтобы снимок диска оставался маленьким. 0 — без ограничений (свой компьютер).
MAX_MINUTES = float(os.environ.get("CLIPZY_MAX_MINUTES") or 0)
JOB_TTL_HOURS = float(os.environ.get("CLIPZY_JOB_TTL_HOURS") or 0)
MAX_ATTEMPTS = 3  # столько раз обработку может прервать перезапуск машины — дальше честная ошибка
RENDERS_PER_DAY = int(os.environ.get("CLIPZY_RENDERS_PER_DAY") or 0)  # экспортов в сутки во Free; 0 — без лимита
MUSIC_DIR = os.path.join(os.path.dirname(DATA), "music")
os.makedirs(MUSIC_DIR, exist_ok=True)

app = FastAPI(title="Clipzy Engine")
inflight = 0  # запросы в работе: загрузки, отдача видео — пока они идут, машину нельзя перезапускать


def upload_too_big_text() -> str:
    return f"Файл больше {MAX_UPLOAD_GB:g} ГБ"


MUSIC_MAX = 100 * 1024**2
BODY_MAX = 2 * 1024**2  # обычные запросы (рендер, перевод, обложка) — JSON в пару килобайт


class BodyTooBig(Exception):
    pass


class Guard:
    """Считает запросы в работе и ограничивает размер тела ДО того, как FastAPI его прочитает:
    иначе он сперва сохранит весь файл на диск (или JSON в память) и только потом проверит вход.
    Размер считаем по байтам, а не только по Content-Length — его может и не быть (chunked)."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        global inflight
        if scope["type"] != "http" or scope["path"] == "/health":
            return await self.inner(scope, receive, send)
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        upload = scope["method"] == "POST" and scope["path"] in ("/jobs", "/music")
        limit = (MUSIC_MAX if scope["path"] == "/music" else MAX_UPLOAD) + 1024**2 if upload else BODY_MAX
        problem = None
        if upload:
            auth = headers.get("authorization", "")
            if decode_token(auth[7:] if auth.lower().startswith("bearer ") else "") is None:
                problem = (401, "Сессия истекла — обновите страницу")
        try:
            declared = int(headers.get("content-length") or 0)
        except ValueError:
            declared = limit + 1
        if not problem and declared > limit:
            problem = (413, upload_too_big_text() if upload else "Слишком большой запрос")
        if problem:
            resp = JSONResponse({"detail": i18n.tr(problem[1], i18n.lang_of(headers))}, status_code=problem[0])
            return await resp(scope, receive, send)

        got = 0
        started = False

        async def counted():
            nonlocal got
            msg = await receive()
            if msg["type"] == "http.request":
                got += len(msg.get("body", b""))
                if got > limit:
                    raise BodyTooBig()
            return msg

        async def tracked(msg):
            nonlocal started
            if msg["type"] == "http.response.start":
                started = True
            await send(msg)

        inflight += 1
        try:
            await self.inner(scope, counted, tracked)
        except BodyTooBig:
            if not started:
                text = upload_too_big_text() if upload else "Слишком большой запрос"
                resp = JSONResponse({"detail": i18n.tr(text, i18n.lang_of(headers))}, status_code=413)
                await resp(scope, receive, send)
        finally:
            inflight -= 1


app.add_middleware(Guard)  # внутри CORS: отказ тоже уходит с заголовками CORS и браузер видит причину
# Кто может обращаться к движку из браузера: локальный сайт и адреса из CLIPZY_SITE_ORIGINS
# (через запятую, например https://clipzy.vercel.app) — для сайта на Vercel
_SITE_ORIGINS = [o.strip().rstrip("/") for o in os.environ.get("CLIPZY_SITE_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_SITE_ORIGINS,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.exception_handler(StarletteHTTPException)
async def localized_http_error(request: Request, exc: StarletteHTTPException):
    """Ошибки — на языке сайта (заголовок X-Lang)."""
    return JSONResponse({"detail": i18n.tr(exc.detail, i18n.lang_of(request.headers))},
                        status_code=exc.status_code, headers=getattr(exc, "headers", None))


jobs: dict[str, dict] = {}
renders: dict[str, dict] = {}
lock = threading.Lock()


BROKEN: list[str] = []
INTERRUPTED: list[str] = []  # обработка оборвалась перезапуском — продолжим (скачивание или расшифровку)
GAVE_UP: list[str] = []  # прерывалась слишком часто — ошибку сохраним на диск


def too_long_text() -> str:
    return f"Видео длиннее {int(MAX_MINUTES)} минут. В бесплатном режиме загрузите кусок покороче."


def restore_jobs():
    """Готовые видео переживают перезапуск движка. Повреждённый файл проекта — обработаем заново,
    прерванный перезапуском — продолжим. Проекты старше JOB_TTL_HOURS удаляем."""
    now = time.time()
    for d in os.listdir(DATA):
        folder = os.path.join(DATA, d)
        if not os.path.isdir(folder):
            continue
        path = os.path.join(folder, "job.json")
        # Срок хранения — от последнего открытия проекта (get_job обновляет время файла)
        if not os.path.exists(path):
            if JOB_TTL_HOURS:  # загрузка оборвалась на полпути (перезапуск машины) — проекта нет
                shutil.rmtree(folder, ignore_errors=True)
            continue
        if JOB_TTL_HOURS and now - os.path.getmtime(path) > JOB_TTL_HOURS * 3600:
            shutil.rmtree(folder, ignore_errors=True)
            continue
        try:
            with open(path, encoding="utf-8") as f:
                jobs[d] = json.load(f)
            job = jobs[d]
            if job.get("status") not in ("ready", "error"):
                job["attempts"] = job.get("attempts", 0) + 1
                if job["attempts"] > MAX_ATTEMPTS:
                    job.update(status="error", error="Обработка прерывалась несколько раз. Попробуйте видео покороче.")
                    GAVE_UP.append(d)
                else:
                    job.update(status="queued", progress=0.0)
                    INTERRUPTED.append(d)
        except (OSError, json.JSONDecodeError):
            raw = open(path, encoding="utf-8", errors="replace").read()
            sources = [x for x in os.listdir(folder) if x.startswith("source.")]
            if not sources:
                continue
            name = re.search(r'"name": "([^"]*)"', raw)
            owner = re.search(r'"owner": "([^"]*)"', raw)
            created = re.search(r'"created": ([0-9.]+)', raw)
            jobs[d] = {"id": d, "dir": folder, "source": os.path.join(folder, sources[0]),
                       "name": name.group(1) if name else sources[0], "status": "queued", "stage": "queued",
                       "progress": 0.0, "created": float(created.group(1)) if created else os.path.getmtime(path),
                       "language": None}
            if owner:
                jobs[d]["owner"] = owner.group(1)
            BROKEN.append(d)
            print(f"[restore] проект {d} повреждён — обработаю заново", flush=True)
            continue
        # Готовые клипы переживают перезапуск: их можно скачать и после сна машины
        for f in os.listdir(folder):
            if f.startswith("render_") and f.endswith(".json"):
                try:
                    with open(os.path.join(folder, f), encoding="utf-8") as fh:
                        r = json.load(fh)
                    if r.get("status") == "done" and os.path.exists(r.get("file", "")):
                        renders[r["id"]] = r
                except (OSError, json.JSONDecodeError, KeyError):
                    pass


restore_jobs()
if JOB_TTL_HOURS:
    for _f in os.listdir(MUSIC_DIR):
        _p = os.path.join(MUSIC_DIR, _f)
        if time.time() - os.path.getmtime(_p) > JOB_TTL_HOURS * 3600:
            os.remove(_p)
gpu_queue = ThreadPoolExecutor(max_workers=1)  # расшифровка — по одной, видеокарта одна
render_queue = ThreadPoolExecutor(max_workers=2)


def build_phrases(words: list[dict], max_words: int = 3, max_chars: int = 18, max_gap: float = 0.6):
    """Слова → экранные фразы по 1–3 слова, с разрывом на паузах и концах предложений."""
    phrases, cur = [], []
    for w in words:
        if cur:
            gap = w["start"] - cur[-1]["end"]
            chars = sum(len(x["text"]) + 1 for x in cur) + len(w["text"])
            # Новое предложение: знак в конце прошлого слова или заглавная буква (Whisper не всегда ставит точки)
            new_sentence = bool(re.search(r"[.!?…]$", cur[-1]["text"])) or w["text"][:1].isupper()
            if len(cur) >= max_words or chars > max_chars or gap > max_gap or new_sentence:
                phrases.append(cur)
                cur = []
        cur.append(w)
    if cur:
        phrases.append(cur)
    return [
        {"id": i, "start": p[0]["start"], "end": p[-1]["end"], "words": p,
         "emoji": phrase_emoji([w["text"] for w in p])}
        for i, p in enumerate(phrases)
    ]


ANNOTATED = 4  # версия разметки: при изменении логики пересчитываем


def annotate(job: dict) -> bool:
    """Помечаем слова-паразиты и ключевые слова, строим монтажный план, меряем громкость голоса (один раз).
    True — разметку пересчитали (проект стоит сохранить)."""
    if (job.get("annotated") == ANNOTATED and (job.get("plan") or {}).get("v") == edit_plan.PLAN_VERSION) or not job.get("phrases"):
        return False
    words = [w for p in job["phrases"] for w in p["words"]]
    flags = audio_fx.mark_fillers(words)
    for w, f in zip(words, flags):
        w["filler"] = f
        w["key"] = audio_fx.is_key(w["text"])
    job["plan"] = edit_plan.build_plan(words, flags)
    # Заголовки клипов — по главной теме, а не по первым словам
    all_sentences = split_sentences(words)
    for h in job.get("highlights") or []:
        clip = split_sentences([w for w in words if h["start"] <= w["start"] < h["end"]])
        if clip:
            h["title"] = topic_title(clip, all_sentences)
    wav = os.path.join(job["dir"], "audio.wav")
    if not job.get("peaks") and os.path.exists(wav):
        job["peaks"] = audio_fx.compute_peaks(wav)
    if os.path.exists(wav):
        job["voiceDb"] = audio_fx.voice_level(wav, [w for w, f in zip(words, flags) if not f])
    job["annotated"] = ANNOTATED
    return True


def update(store: dict, key: str, **kw):
    with lock:
        store[key].update(kw)


# ——— пользователи и лимиты ———
FREE_PER_DAY = 3
GUEST_TOTAL = 1
GUEST_PER_IP_DAY = 3
USAGE_FILE = os.path.join(DATA, "usage.json")


def _load_usage() -> dict[str, list[float]]:
    try:
        with open(USAGE_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}  # нет файла или он битый — движок всё равно запускается


usage: dict[str, list[float]] = _load_usage()
usage_lock = threading.Lock()


def _b64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def decode_token(token: str) -> dict | None:
    """Проверенный токен сайта или None."""
    try:
        body, sig = token.split(".")
        expected = base64.urlsafe_b64encode(hmac.new(ENGINE_SECRET.encode(), body.encode(), hashlib.sha256).digest())
        if not ENGINE_SECRET or not hmac.compare_digest(expected.decode().rstrip("="), sig):
            return None
        payload = json.loads(_b64(body))
        return payload if payload["exp"] >= time.time() else None
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None


def current_user(request: Request) -> dict:
    """Токен от сайта: заголовок Authorization: Bearer … или ?t=… (для <video> и ссылок на скачивание)."""
    auth = request.headers.get("authorization", "")
    payload = decode_token(auth[7:] if auth.lower().startswith("bearer ") else request.query_params.get("t", ""))
    if payload is None:
        raise HTTPException(401, "Сессия истекла — обновите страницу")
    return payload


def owned_job(job_id: str, user: dict) -> dict:
    job = jobs.get(job_id)
    if not job or job.get("owner") != user["uid"]:
        raise HTTPException(404, "Проект не найден")
    if JOB_TTL_HOURS and job.get("status") in ("ready", "error"):
        try:  # срок хранения — от последнего обращения к проекту
            os.utime(os.path.join(job["dir"], "job.json"))
        except OSError:
            pass
    return job


def _save_usage():
    tmp = USAGE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(usage, f)
    os.replace(tmp, USAGE_FILE)


def record_usage(key: str, now: float | None = None):
    now = now or time.time()
    with usage_lock:
        usage[key] = [t for t in usage.get(key, []) if now - t < 86400 * 2] + [now]
        _save_usage()


def refund_usage(key: str, t: float):
    """Попытка не засчитывается: видео отклонено не по вине пользователя (например, длиннее лимита)."""
    with usage_lock:
        if t in usage.get(key, []):
            usage[key].remove(t)
            _save_usage()


def client_ip(request: Request) -> str:
    """Адрес посетителя для гостевых лимитов. Левые элементы X-Forwarded-For присылает сам клиент (подделать —
    одна строка), правый дописал прокси Vercel перед движком — ему и верим."""
    xff = request.headers.get("x-forwarded-for", "")
    last = xff.split(",")[-1].strip() if xff else ""
    return last or (request.client.host if request.client else "?")


limits_lock = threading.Lock()


def reserve(user: dict, ip: str) -> float:
    """Проверка лимита и запись попытки — одним шагом: иначе десяток одновременных загрузок
    проскочит проверку до того, как первая запишется. Не получилось — refund_usage."""
    with limits_lock:
        check_limits(user, ip)
        now = time.time()
        record_usage(user["uid"], now)
        if user["anon"]:
            record_usage("ip:" + ip, now)
        return now


def release(user: dict, ip: str, now: float):
    refund_usage(user["uid"], now)
    if user["anon"]:
        refund_usage("ip:" + ip, now)


def check_limits(user: dict, ip: str):
    now = time.time()
    day = [t for t in usage.get(user["uid"], []) if now - t < 86400]
    if user["anon"]:
        if len(usage.get(user["uid"], [])) >= GUEST_TOTAL:
            raise HTTPException(403, "Гостю доступно одно видео. Зарегистрируйтесь — это бесплатно — и загружайте до 3 видео в день.")
        if len([t for t in usage.get("ip:" + ip, []) if now - t < 86400]) >= GUEST_PER_IP_DAY:
            raise HTTPException(429, "С этого устройства уже пробовали. Зарегистрируйтесь, чтобы продолжить.")
    elif user["plan"] == "free" and len(day) >= FREE_PER_DAY:
        wait = int((min(day) + 86400 - now) / 3600) + 1
        raise HTTPException(429, f"Во Free — {FREE_PER_DAY} видео в сутки. Следующее — через {wait} ч. Или перейдите на Pro без лимитов.")


class TooLong(Exception):
    """Видео длиннее лимита бесплатного режима."""


def refund_job(job: dict):
    if job.get("owner") and job.get("created"):
        refund_usage(job["owner"], job["created"])
        if job.get("ip"):
            refund_usage("ip:" + job["ip"], job["created"])


def friendly_error(e: Exception) -> str:
    """Ошибка человеческим языком, а не трассировка."""
    text = str(e)
    if isinstance(e, TooLong):
        return text
    if isinstance(e, subprocess.CalledProcessError) or "ffprobe" in text or "Invalid data" in text:
        return "Не удалось прочитать видео: файл повреждён или этот формат не поддерживается. Попробуйте MP4 или MOV."
    if "нет видеодорожки" in text:
        return "В файле нет видео — только звук. Загрузите видеофайл."
    if "out of memory" in text.lower():
        return "Не хватило памяти видеокарты. Закройте игры и тяжёлые программы и попробуйте снова."
    return f"Не удалось обработать видео: {text[:200]}"


def track_for(job: dict, on_progress=lambda p: None, words: list[dict] | None = None) -> dict | None:
    """Путь кадра за спикером по всему ролику (считается один раз).
    Если в кадре двое и больше — камера режет на того, кто говорит (по губам во время каждой фразы)."""
    if "track" in job:
        return job["track"]
    meta = job["meta"]
    sw, sh = meta["width"], meta["height"]
    cw = sh * 9 / 16 if sw / sh > 9 / 16 else sw
    frames = face_track.detect_faces(job["source"], meta, render.tool("ffmpeg"), on_progress)
    job["people_v"] = face_track.PEOPLE_VERSION  # участников считали нынешней логикой
    samples = face_track.pick_track(frames)
    job["track"] = face_track.camera_path(samples, cw / sw)
    job["faces"] = [s for s in samples if s]
    sp = face_track.speaker_path(frames, words or [], meta, cw / sw)
    if sp:
        job["speakers"] = sp["speakers"]  # для «экрана пополам»
        if sp.get("points") and job["track"]:
            job["track"] = {"points": sp["points"], "fy": sp["fy"], "mode": "speaker", "shots": sp["shots"]}
    return job["track"]


def face_in_range(job: dict, start: float, end: float) -> tuple[float | None, float | None]:
    xs = [f for f in job.get("faces", []) if start <= f[0] <= end] or job.get("faces", [])
    if not xs:
        return None, None
    return round(float(sorted(f[1] for f in xs)[len(xs) // 2]), 4), round(float(sorted(f[2] for f in xs)[len(xs) // 2]), 4)


def save_snapshot(job_id: str):
    with lock:
        snapshot = {k: v for k, v in jobs[job_id].items() if k not in ("words", "faces")}
        path = os.path.join(jobs[job_id]["dir"], "job.json")
        text = json.dumps(snapshot, ensure_ascii=False, default=float)  # сначала целиком в память
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)  # атомарно: либо старый файл, либо новый целиком


def process_job(job_id: str):
    job = jobs[job_id]
    d = job["dir"]
    try:
        update(jobs, job_id, status="processing", stage="audio", progress=0.02)
        meta = render.probe(job["source"])
        if MAX_MINUTES and meta["duration"] > MAX_MINUTES * 60 + 5:
            refund_job(job)
            raise TooLong(too_long_text())
        update(jobs, job_id, **{k: meta[k] for k in ("duration", "width", "height")}, meta=meta)
        wav = os.path.join(d, "audio.wav")
        if meta["has_audio"]:
            render.extract_audio(job["source"], wav)
            # Для распознавания — очищенная копия; оригинал остаётся для громкости, хайлайтов и волны
            asr_wav = os.path.join(d, "asr.wav")
            render.extract_audio(job["source"], asr_wav, clean=True)
        update(jobs, job_id, stage="transcribe", progress=0.08)

        words: list[dict] = []
        language = None
        if meta["has_audio"]:
            import transcribe  # тяжёлый импорт — только когда нужен

            res = transcribe.transcribe(
                asr_wav, on_progress=lambda p: update(jobs, job_id, progress=0.08 + 0.7 * p), language=job.get("language")
            )
            words, language = res["words"], res["language"]
            update(jobs, job_id, device=transcribe.device_in_use)

        update(jobs, job_id, stage="highlights", progress=0.8, language=language)
        hl = find_highlights(words, wav) if words else []

        update(jobs, job_id, stage="face", progress=0.82)
        track_for(job, on_progress=lambda p: update(jobs, job_id, progress=0.82 + 0.17 * p), words=words)
        for h in hl:
            h["faceX"], h["faceY"] = face_in_range(job, h["start"], h["end"])
        face_x, face_y = face_in_range(job, 0, meta["duration"])

        # Понятный статус вместо «фигни»: речи нет или она распознана неуверенно
        mean_p = sum(w.get("p", 1) for w in words) / len(words) if words else 0
        speech_note = None
        if not meta["has_audio"]:
            speech_note = "no_audio"
        elif not words:
            speech_note = "no_speech"
        elif mean_p < 0.6 or len(words) < 3:
            speech_note = "unclear"

        with open(os.path.join(d, "words.json"), "w", encoding="utf-8") as f:
            json.dump(words, f, ensure_ascii=False)
        update(jobs, job_id, status="ready", stage="done", progress=1.0, words=words,
               phrases=build_phrases(words), highlights=hl, faceX=face_x, faceY=face_y, speech=speech_note)
        save_snapshot(job_id)
    except Exception as e:
        traceback.print_exc()
        update(jobs, job_id, status="error", error=friendly_error(e))
        save_snapshot(job_id)


@app.post("/internal/reassign")
async def reassign(request: Request):
    """Сайт сообщает: гость зарегистрировался — его проекты переходят в аккаунт."""
    if not ENGINE_SECRET or not hmac.compare_digest(request.headers.get("x-engine-secret", ""), ENGINE_SECRET):
        raise HTTPException(403)
    body = await request.json()
    src, dst = body.get("from"), body.get("to")
    moved = []
    with lock:
        for j in jobs.values():
            if j.get("owner") == src:
                j["owner"] = dst
                moved.append(j["id"])
        for r in renders.values():
            if r.get("owner") == src:
                r["owner"] = dst
    for jid in moved:
        if jobs[jid].get("status") == "ready":
            save_snapshot(jid)
    return {"moved": moved}


@app.on_event("startup")
def warm_sfx():
    # Синтез запасных звуков — заранее, чтобы первый открытый проект не ждал
    threading.Thread(target=sfx_kit.load, daemon=True).start()


@app.on_event("startup")
def requeue_broken():
    for jid in BROKEN:
        gpu_queue.submit(process_job, jid)
    for jid in INTERRUPTED:
        job = jobs[jid]
        if job.get("source") and os.path.exists(job["source"]):
            gpu_queue.submit(process_job, jid)
        elif job.get("url"):
            download_pool.submit(download_job, jid, job["url"])
        else:
            job.update(status="error", error="Обработка прервалась. Загрузите видео ещё раз.")
        save_snapshot(jid)
    for jid in GAVE_UP:
        save_snapshot(jid)


@app.get("/health")
def health():
    try:
        ff = render.tool("ffmpeg")
    except RuntimeError:
        ff = None
    with lock:
        busy = sum(j.get("status") in ("queued", "processing") for j in jobs.values()) + \
            sum(r.get("status") in ("queued", "rendering") for r in renders.values()) + inflight
    return {"ok": True, "ffmpeg": bool(ff), "nvenc": render.has_nvenc() if ff else False, "busy": busy,
            "version": os.environ.get("CLIPZY_VERSION", "dev"), "maxMinutes": MAX_MINUTES or None}


@app.post("/jobs")
async def create_job(file: UploadFile, request: Request, language: str | None = None, user: dict = Depends(current_user)):
    ip = client_ip(request)
    now = reserve(user, ip)
    try:
        return await _create_job(file, language, user, ip, now)
    except BaseException:
        release(user, ip, now)
        raise


async def _create_job(file: UploadFile, language: str | None, user: dict, ip: str, now: float):
    job_id = uuid.uuid4().hex[:12]
    d = os.path.join(DATA, job_id)
    os.makedirs(d)
    ext = os.path.splitext(file.filename or "")[1].lower() or ".mp4"
    if not re.fullmatch(r"\.[a-z0-9]{2,5}", ext):
        ext = ".mp4"
    src = os.path.join(d, "source" + ext)
    size = 0
    with open(src, "wb") as out:
        while chunk := await file.read(8 * 1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD:
                out.close()
                shutil.rmtree(d, ignore_errors=True)
                raise HTTPException(413, upload_too_big_text())
            out.write(chunk)
    if MAX_MINUTES:
        try:
            duration = (await run_in_threadpool(render.probe, src))["duration"]
        except Exception:
            duration = 0  # не прочиталось — понятную ошибку покажет обработка
        if duration > MAX_MINUTES * 60 + 5:
            shutil.rmtree(d, ignore_errors=True)
            raise HTTPException(400, too_long_text())
    jobs[job_id] = {"id": job_id, "dir": d, "source": src, "name": file.filename, "status": "queued",
                    "stage": "queued", "progress": 0.0, "created": now, "language": language,
                    "owner": user["uid"], "ip": ip if user["anon"] else None}
    save_snapshot(job_id)
    gpu_queue.submit(process_job, job_id)
    return {"id": job_id}


# ——— Видео по ссылке (YouTube, VK Видео, Rutube) ———
LINK_HOSTS = ("youtube.com", "youtu.be", "vk.com", "vkvideo.ru", "rutube.ru")
MAX_LINK_DURATION = 3 * 3600
download_pool = ThreadPoolExecutor(max_workers=2)  # скачивание не занимает видеокарту


class LinkRequest(BaseModel):
    url: str
    rights: bool = False  # пользователь подтвердил, что видео его или у него есть права
    language: str | None = None


class LinkError(Exception):
    """Понятная пользователю причина, почему видео по ссылке не скачать."""


def link_host(url: str) -> str | None:
    try:
        u = urlparse(url.strip())
    except ValueError:
        return None
    if u.scheme not in ("http", "https"):
        return None
    host = (u.hostname or "").lower()
    return next((h for h in LINK_HOSTS if host == h or host.endswith("." + h)), None)


def link_error_text(e: Exception) -> str:
    text = str(e).lower()
    if "private" in text:
        return "Видео закрыто. Откройте доступ по ссылке или загрузите файл."
    if "age" in text and ("confirm" in text or "restricted" in text):
        return "У видео возрастное ограничение — скачать по ссылке нельзя. Загрузите файл."
    if "country" in text or "geo" in text:
        return "Видео недоступно в этой стране. Загрузите файл."
    if "not a bot" in text or "sign in" in text or "login" in text:
        return "Сайт не отдал видео без входа в аккаунт. Загрузите файл."
    if "unavailable" in text or "removed" in text or "404" in text:
        return "Видео недоступно или удалено."
    return "Не удалось скачать видео по ссылке. Попробуйте ещё раз или загрузите файл."


def download_job(job_id: str, url: str):
    import yt_dlp  # тяжёлый импорт — только когда нужен

    job = jobs[job_id]
    d = job["dir"]

    def hook(st: dict):
        if st.get("status") == "downloading":
            total = st.get("total_bytes") or st.get("total_bytes_estimate")
            if total:
                if total > MAX_UPLOAD:
                    raise LinkError("Видео больше 4 ГБ — загрузите файл поменьше.")
                update(jobs, job_id, progress=round(min(st.get("downloaded_bytes", 0) / total, 1.0) * 0.95, 3))

    opts = {
        # До 1080p: для вертикального рилса больше не нужно, а качается в разы быстрее
        "format": "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b",
        "merge_output_format": "mp4",
        "outtmpl": os.path.join(d, "source.%(ext)s"),
        "ffmpeg_location": os.path.dirname(render.tool("ffmpeg")),
        "noplaylist": True,
        "allowed_extractors": [r"(?i)youtube.*", r"(?i)vk.*", r"(?i)rutube.*"],
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "progress_hooks": [hook],
    }
    try:
        update(jobs, job_id, status="processing", stage="download", progress=0.0)
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if info.get("_type") == "playlist":
                raise LinkError("Это плейлист — вставьте ссылку на одно видео.")
            if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming"):
                raise LinkError("Трансляция ещё идёт. Дождитесь записи и вставьте ссылку снова.")
            if (info.get("duration") or 0) > MAX_LINK_DURATION:
                raise LinkError("Видео длиннее 3 часов. Загрузите нужный кусок файлом.")
            if MAX_MINUTES and (info.get("duration") or 0) > MAX_MINUTES * 60 + 5:
                refund_job(job)
                raise LinkError(too_long_text())
            update(jobs, job_id, name=(info.get("title") or url)[:200])
            ydl.process_info(info)
        src = next((os.path.join(d, f) for f in os.listdir(d) if f.startswith("source.")), None)
        if not src or not os.path.getsize(src):
            raise LinkError("Не удалось скачать видео по ссылке. Попробуйте ещё раз или загрузите файл.")
        update(jobs, job_id, source=src, stage="queued", progress=0.0)
        save_snapshot(job_id)
        gpu_queue.submit(process_job, job_id)
    except LinkError as e:
        update(jobs, job_id, status="error", error=str(e))
        save_snapshot(job_id)
    except Exception as e:
        traceback.print_exc()
        update(jobs, job_id, status="error", error=link_error_text(e))
        save_snapshot(job_id)


@app.post("/jobs/from-url")
def create_job_from_url(req: LinkRequest, request: Request, user: dict = Depends(current_user)):
    if not req.rights:
        raise HTTPException(400, "Подтвердите, что это ваше видео или у вас есть права на него.")
    url = req.url.strip()
    if len(url) > 500 or not link_host(url):
        raise HTTPException(400, "Нужна ссылка на видео с YouTube, VK Видео или Rutube.")
    ip = client_ip(request)
    now = reserve(user, ip)
    job_id = uuid.uuid4().hex[:12]
    d = os.path.join(DATA, job_id)
    os.makedirs(d)
    jobs[job_id] = {"id": job_id, "dir": d, "source": "", "name": url, "status": "queued", "stage": "download",
                    "progress": 0.0, "created": now, "language": req.language, "owner": user["uid"],
                    "url": url, "rights_confirmed": now, "ip": ip if user["anon"] else None}
    save_snapshot(job_id)
    download_pool.submit(download_job, job_id, url)
    return {"id": job_id}


PUBLIC_JOB = ("id", "name", "status", "stage", "progress", "error", "duration", "width", "height",
              "language", "device", "phrases", "highlights", "faceX", "faceY", "plan", "peaks", "track", "speech", "speakers",
              "voiceDb")


@app.get("/jobs")
def list_jobs(user: dict = Depends(current_user)):
    """Недавние готовые проекты пользователя — чтобы открыть без повторной загрузки."""
    with lock:
        ready = [j for j in jobs.values() if j.get("owner") == user["uid"] and j.get("status") == "ready"
                 and os.path.exists(j.get("source", ""))]
        ready.sort(key=lambda j: j.get("created", 0), reverse=True)
        return [
            {"id": j["id"], "name": j.get("name"), "duration": j.get("duration"), "created": j.get("created"),
             "clips": len(j.get("highlights") or [])}
            for j in ready[:12]
        ]


@app.delete("/jobs/{job_id}")
def delete_job(job_id: str, user: dict = Depends(current_user)):
    """Удаляет проект вместе с исходником и готовыми клипами."""
    job = owned_job(job_id, user)
    if job.get("status") not in ("ready", "error"):
        raise HTTPException(409, "Проект ещё обрабатывается")
    d = job.get("dir", "")
    if not os.path.abspath(d).startswith(os.path.abspath(DATA)):
        raise HTTPException(400, "Неверный путь проекта")
    with lock:
        jobs.pop(job_id, None)
        for rid in [r for r, v in renders.items() if v["job"] == job_id]:
            renders.pop(rid, None)
    shutil.rmtree(d, ignore_errors=True)
    return {"ok": True}


@app.get("/jobs/{job_id}/source")
def job_source(job_id: str, user: dict = Depends(current_user)):
    job = owned_job(job_id, user)
    if not os.path.exists(job.get("source", "")):
        raise HTTPException(404, "Исходник не найден")
    return FileResponse(job["source"])


@app.get("/jobs/{job_id}")
def get_job(job_id: str, request: Request, user: dict = Depends(current_user)):
    job = owned_job(job_id, user)
    with lock:
        changed = annotate(job)
        out = {k: job.get(k) for k in PUBLIC_JOB}
    if changed:  # иначе пересчёт (и заголовки клипов) повторялся бы после каждого перезапуска
        threading.Thread(target=save_snapshot, args=(job_id,), daemon=True).start()
    out["error"] = i18n.tr(out["error"], i18n.lang_of(request.headers))
    out["sfxKit"] = sfx_kit.public()  # звуки и правила — превью выбирает эффекты так же, как рендер
    # Участников старых проектов считали прежней логикой (путала людей с картинками) — «пополам» им не предлагаем
    if job.get("people_v") != face_track.PEOPLE_VERSION:
        out["speakers"] = None
    return out


# Границы входных данных рендера: без них size=5000 или 100 тысяч слов съели бы память и процессор
class Word(BaseModel):
    text: str = Field(max_length=100)
    start: float
    end: float
    filler: bool = False


class Phrase(BaseModel):
    words: list[Word] = Field(max_length=80)
    emoji: str | None = Field("auto", max_length=16)  # эмодзи из превью; None — без эмодзи, auto — по словам


class RenderRequest(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    phrases: list[Phrase] = Field(max_length=4000)
    style: str = Field("beat", max_length=32)
    size: float = Field(24, ge=10, le=60)
    captionY: float = Field(68, ge=0, le=100)
    accent: str | None = None
    textColor: str | None = None
    cropX: float = Field(50, ge=0, le=100)
    faceX: float | None = Field(None, ge=0, le=1)
    faceY: float | None = Field(None, ge=0, le=1)
    frameScale: float = Field(1.0, ge=0, le=1)  # 1 — заполнить 9:16, 0 — весь кадр целиком на размытом фоне
    hook: str | None = Field(None, max_length=200)
    removePauses: bool = False
    zoom: bool = False
    progressBar: bool = False
    emoji: bool = False
    removeFillers: bool = False
    sfx: str | None = None  # звуковые эффекты: off | clean (аккуратно) | punchy (динамично)
    sfxMeme: bool = False  # мемные звуки: касса, «неверно», блеск… — на эмодзи или в паузе
    sfxVolume: float = Field(70, ge=0, le=100)  # громкость эффектов 0–100
    sfxWhoosh: bool | None = None  # старые клиенты: три флажка вместо стиля
    sfxDing: bool | None = None
    sfxSmart: bool | None = None
    music: str | None = Field(None, max_length=40)  # lofi | ambient | drive | custom:<id>
    musicVolume: float = Field(35, ge=0, le=100)
    watermark: bool = True  # решает сервер по плану: во Free всегда включён
    layout: str = "single"  # single | split — «экран пополам»: двое участников сверху и снизу (в 16:9 — рядом)
    aspect: str = "9:16"  # формат готового видео: 9:16 (Reels/Shorts), 16:9 (YouTube), 1:1 (лента)


HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


def run_render(rid: str):
    r = renders[rid]
    job = jobs[r["job"]]
    try:
        update(renders, rid, status="rendering")
        words = json.load(open(os.path.join(job["dir"], "words.json"), encoding="utf-8"))
        with lock:
            annotate(job)
        if r["request"].get("faceX") is not None and "track" not in job:
            update(renders, rid, status="rendering", progress=0.0)
            track_for(job, words=words)  # проекты, обработанные до слежения за лицом
            save_snapshot(r["job"])
        result = render.render_clip(
            job["source"], job["meta"], words, r["request"], r["workdir"], r["file"],
            on_progress=lambda p: update(renders, rid, progress=round(p, 3)),
            plan=job.get("plan"), music_path=music_path(r["request"].get("music")), track=job.get("track"),
            speakers=job.get("speakers") if job.get("people_v") == face_track.PEOPLE_VERSION else None,
            voice_db=job.get("voiceDb"),
        )
        update(renders, rid, status="done", progress=1.0, duration=result["duration"])
        save_render(rid)
    except Exception as e:
        traceback.print_exc()
        update(renders, rid, status="error", error="Не удалось собрать клип. Попробуйте ещё раз — если не выйдет, напишите в поддержку.")


def save_render(rid: str):
    with lock:
        r = {k: v for k, v in renders[rid].items() if k != "request"}
    path = os.path.join(jobs[r["job"]]["dir"], f"render_{rid}.json")
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(r, f, ensure_ascii=False)
    os.replace(path + ".tmp", path)


MUSIC_PER_USER = 10


def _music_owner(mid: str) -> str | None:
    try:
        with open(os.path.join(MUSIC_DIR, mid + ".owner"), encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return None


def music_path(music: str | None, uid: str | None = None) -> str | None:
    """Путь к музыке. Свои треки — только их владельцу (uid)."""
    if not music:
        return None
    if music in audio_fx.TRACKS:
        return audio_fx.asset("music_" + music)
    if music.startswith("custom:"):
        mid = music.split(":", 1)[1]
        if re.fullmatch(r"[0-9a-f]{12}", mid) and (uid is None or _music_owner(mid) == uid):
            found = [f for f in os.listdir(MUSIC_DIR) if f.startswith(mid + ".") and not f.endswith(".owner")]
            if found:
                return os.path.join(MUSIC_DIR, found[0])
    raise ValueError("Музыка не найдена")


@app.get("/assets/{name}.wav")
def get_asset(name: str):
    if name not in sfx_kit.names() and name.removeprefix("music_") not in audio_fx.TRACKS:
        raise HTTPException(404)
    # Имя звука + ?v=<хеш> от сайта — можно кэшировать надолго
    return FileResponse(audio_fx.asset(name), media_type="audio/wav", headers={"Cache-Control": "public, max-age=604800"})


@app.post("/music")
async def upload_music(file: UploadFile, user: dict = Depends(current_user)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"):
        raise HTTPException(400, "Нужен аудиофайл: MP3, WAV, M4A, OGG или FLAC")
    mine = [f for f in os.listdir(MUSIC_DIR) if f.endswith(".owner") and _music_owner(f[:-6]) == user["uid"]]
    if len(mine) >= MUSIC_PER_USER:
        raise HTTPException(429, f"Можно загрузить до {MUSIC_PER_USER} своих треков")
    mid = uuid.uuid4().hex[:12]
    path = os.path.join(MUSIC_DIR, mid + ext)
    size = 0
    with open(path, "wb") as out:
        while chunk := await file.read(4 * 1024 * 1024):
            size += len(chunk)
            if size > MUSIC_MAX:
                out.close()
                os.remove(path)
                raise HTTPException(413, "Файл больше 100 МБ")
            out.write(chunk)
    with open(os.path.join(MUSIC_DIR, mid + ".owner"), "w", encoding="utf-8") as f:
        f.write(user["uid"])
    return {"id": mid, "name": file.filename}


@app.get("/music/{mid}")
def get_music(mid: str, user: dict = Depends(current_user)):
    try:
        return FileResponse(music_path("custom:" + mid, user["uid"]))
    except ValueError:
        raise HTTPException(404)


class TranslateRequest(BaseModel):
    target: str


@app.post("/jobs/{job_id}/translate")
def translate_subtitles(job_id: str, req: TranslateRequest, user: dict = Depends(current_user)):
    """Субтитры на другом языке (RU ↔ EN). Результат кэшируется в проекте."""
    import translate

    job = owned_job(job_id, user)
    if job["status"] != "ready":
        raise HTTPException(409, "Видео ещё не обработано")
    src = job.get("language") or "ru"
    if req.target not in translate.LANGS or req.target == src:
        raise HTTPException(400, "Этот перевод недоступен")
    cache = job.setdefault("translations", {})
    if req.target not in cache:
        words = json.load(open(os.path.join(job["dir"], "words.json"), encoding="utf-8"))
        if not words:
            raise HTTPException(400, "В видео нет речи — переводить нечего")
        try:
            cache[req.target] = translate.translate_job(words, job.get("highlights") or [], src, req.target)
        except translate.Busy as e:
            raise HTTPException(503, "Переводчик сейчас перегружен — попробуйте через минуту") from e
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(502, "Не удалось перевести — проверьте интернет и попробуйте ещё раз") from e
        save_snapshot(job_id)
    return cache[req.target]


@app.post("/jobs/{job_id}/render")
def create_render(job_id: str, req: RenderRequest, user: dict = Depends(current_user)):
    job = owned_job(job_id, user)
    if user["anon"]:
        raise HTTPException(403, "Зарегистрируйтесь — это бесплатно — чтобы скачать клип.")
    if job["status"] != "ready":
        raise HTTPException(409, "Видео ещё не обработано")
    with lock:
        active = any(r.get("owner") == user["uid"] and r.get("status") in ("queued", "rendering") for r in renders.values())
    if active and RENDERS_PER_DAY:
        raise HTTPException(429, "Дождитесь, пока закончится предыдущий экспорт.")
    req.end = min(req.end, float(job.get("duration") or req.end))
    if RENDERS_PER_DAY and user.get("plan", "free") == "free":
        done = [t for t in usage.get("r:" + user["uid"], []) if time.time() - t < 86400]
        if len(done) >= RENDERS_PER_DAY:
            raise HTTPException(429, f"Во Free — {RENDERS_PER_DAY} экспортов в сутки. Завтра лимит обновится.")
    if req.end - req.start < 1 or req.start < 0:
        raise HTTPException(400, "Неверный отрезок")
    for c in (req.accent, req.textColor):
        if c is not None and not HEX.match(c):
            raise HTTPException(400, "Цвет в формате #RRGGBB")
    if req.aspect not in captions_render.FORMATS:
        raise HTTPException(400, "Формат видео: 9:16, 16:9 или 1:1")
    # Водяной знак — только во Free; платные планы и creator — без него
    req.watermark = user.get("plan", "free") == "free"
    try:
        music_path(req.music, user["uid"])
    except ValueError as e:
        raise HTTPException(400, str(e))
    rid = uuid.uuid4().hex[:12]
    workdir = os.path.join(job["dir"], "render_" + rid)
    renders[rid] = {"id": rid, "job": job_id, "status": "queued", "progress": 0.0, "workdir": workdir,
                    "file": os.path.join(job["dir"], f"clip_{rid}.mp4"), "request": req.model_dump(),
                    "owner": user["uid"]}
    if RENDERS_PER_DAY:
        record_usage("r:" + user["uid"])
    render_queue.submit(run_render, rid)
    return {"id": rid}


class CoverRequest(BaseModel):
    t: float
    title: str = ""
    accent: str | None = None
    cropX: float = 50
    faceX: float | None = None
    faceY: float | None = None
    frameScale: float = 1.0
    layout: str = "single"
    aspect: str = "9:16"


@app.post("/jobs/{job_id}/cover")
def create_cover(job_id: str, req: CoverRequest, user: dict = Depends(current_user)):
    """Обложка для рилса: кадр в выбранный момент + крупный заголовок. JPG 1080×1920."""
    job = owned_job(job_id, user)
    if user["anon"]:
        raise HTTPException(403, "Зарегистрируйтесь — это бесплатно — чтобы скачать клип.")
    if job["status"] != "ready":
        raise HTTPException(409, "Видео ещё не обработано")
    if req.accent is not None and not HEX.match(req.accent):
        raise HTTPException(400, "Цвет в формате #RRGGBB")
    if req.aspect not in captions_render.FORMATS:
        raise HTTPException(400, "Формат видео: 9:16, 16:9 или 1:1")
    body = req.model_dump()
    body["t"] = min(max(req.t, 0.0), max(float(job.get("duration") or 0) - 0.05, 0.0))
    body["title"] = req.title[:120]
    body["watermark"] = user.get("plan", "free") == "free"
    now = time.time()
    with limits_lock:
        recent = [t for t in cover_calls.get(user["uid"], []) if now - t < 600]
        if len(recent) >= 20:
            raise HTTPException(429, "Слишком много обложек подряд — подождите пару минут")
        cover_calls[user["uid"]] = recent + [now]
    out = os.path.join(job["dir"], f"cover_{uuid.uuid4().hex[:8]}.jpg")
    render.render_cover(job["source"], job["meta"], body, out, track=job.get("track"),
                        speakers=job.get("speakers") if job.get("people_v") == face_track.PEOPLE_VERSION else None)
    return FileResponse(out, media_type="image/jpeg", filename="clipzy-cover.jpg",
                        background=BackgroundTask(lambda: os.path.exists(out) and os.remove(out)))


cover_calls: dict[str, list[float]] = {}


@app.get("/renders/{rid}")
def get_render(rid: str, request: Request, user: dict = Depends(current_user)):
    r = renders.get(rid)
    if not r or r.get("owner") != user["uid"]:
        raise HTTPException(404, "Рендер не найден")
    with lock:
        out = {k: r.get(k) for k in ("id", "status", "progress", "error", "duration")}
    out["error"] = i18n.tr(out["error"], i18n.lang_of(request.headers))
    return out


@app.get("/renders/{rid}/file")
def render_file(rid: str, user: dict = Depends(current_user)):
    r = renders.get(rid)
    if not r or r.get("owner") != user["uid"] or r["status"] != "done":
        raise HTTPException(404, "Файл ещё не готов")
    return FileResponse(r["file"], media_type="video/mp4", filename=f"clipzy_{rid}.mp4")
