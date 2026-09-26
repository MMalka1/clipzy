"""Расшифровка речи через faster-whisper с таймкодом каждого слова."""

import glob
import os
import sys

# Windows без прав администратора не умеет симлинки — кэш моделей работает и без них
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

# Полная large-v3 точнее turbo на русском (быстрая речь, сленг); turbo можно вернуть через переменную окружения
MODEL_NAME = os.environ.get("CLIPZY_WHISPER_MODEL", "large-v3")
# Сервер без видеокарты (Vercel Sandbox): CLIPZY_DEVICE=cpu — не тратим время на попытку CUDA
DEVICE = os.environ.get("CLIPZY_DEVICE", "auto")
# Ширина поиска: 5 — точнее, 1 — вдвое быстрее (на процессоре каждая минута на счету)
BEAM = int(os.environ.get("CLIPZY_BEAM", "5"))


def _add_cuda_dlls():
    """На Windows CUDA-библиотеки из pip-пакетов nvidia-* нужно явно добавить в поиск DLL."""
    if sys.platform != "win32":
        return
    import site

    for sp in site.getsitepackages():
        for d in glob.glob(os.path.join(sp, "nvidia", "*", "bin")):
            os.add_dll_directory(d)
            os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")


_add_cuda_dlls()

from faster_whisper import WhisperModel  # noqa: E402

_models: dict[str, WhisperModel] = {}
device_in_use = "not loaded"


def _load(device: str) -> WhisperModel:
    global device_in_use
    if device not in _models:
        compute = "float16" if device == "cuda" else "int8"
        threads = 0 if device == "cuda" else (os.cpu_count() or 4)
        _models[device] = WhisperModel(MODEL_NAME, device=device, compute_type=compute, cpu_threads=threads)
    device_in_use = device
    return _models[device]


# Подсказка в стиле живой речи: так Whisper не «причёсывает» текст и оставляет «э-э», «ну», «типа»
VERBATIM_PROMPT = {
    "ru": "Ну, э-э, короче, вот. Типа, как бы, мм, я думаю, что это важно.",
    "en": "Um, uh, so, like, you know, I think this is important.",
}


def _tokens(text: str) -> list[str]:
    return [t for t in "".join(ch.lower() if ch.isalnum() else " " for ch in text).split() if t]


def _run(model: WhisperModel, wav_path: str, on_progress, language: str | None):
    if language is None:
        _, probe = model.transcribe(wav_path, beam_size=1, vad_filter=True)  # определение языка — без расшифровки
        language = probe.language
    segments, info = model.transcribe(
        wav_path,
        language=language,
        initial_prompt=VERBATIM_PROMPT.get(language),
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
        beam_size=BEAM,
        condition_on_previous_text=False,  # не даём одной ошибке размножиться по всему тексту
        hallucination_silence_threshold=2.0,
    )
    prompt_tokens = set(_tokens(VERBATIM_PROMPT.get(language, "")))
    words: list[dict] = []
    dropped = 0
    for seg in segments:
        # Отсеиваем «выдуманный» текст: музыка/шум, зацикливание, эхо подсказки
        toks = _tokens(seg.text)
        if (
            (seg.no_speech_prob > 0.6 and seg.avg_logprob < -0.7)
            or seg.avg_logprob < -1.1
            or seg.compression_ratio > 2.4
            or (toks and len(toks) >= 2 and set(toks) <= prompt_tokens)
        ):
            dropped += 1
            continue
        for w in seg.words or []:
            text = w.word.strip()
            if not text:
                continue
            # «%», «—», «,» и т.п. отдельным словом не показываем — приклеиваем к предыдущему
            if words and not any(ch.isalnum() for ch in text):
                words[-1]["text"] += text if text in "%,.!?…:;" else " " + text
                words[-1]["end"] = round(w.end, 3)
                continue
            # «Э» + «-э,» → «Э-э,»: Whisper иногда режет слово по дефису
            if words and text.startswith("-") and w.start - words[-1]["end"] < 0.3:
                words[-1]["text"] += text
                words[-1]["end"] = round(w.end, 3)
                continue
            words.append({"text": text, "start": round(w.start, 3), "end": round(w.end, 3), "p": round(w.probability, 3)})
        if info.duration:
            on_progress(min(seg.end / info.duration, 1.0))
    return {"language": info.language, "words": words, "dropped": dropped}


def transcribe(wav_path: str, on_progress=lambda p: None, language: str | None = None) -> dict:
    """Пробуем видеокарту, при любой ошибке CUDA — откатываемся на процессор."""
    for attempt in range(0 if DEVICE == "cpu" else 2):
        try:
            return _run(_load("cuda"), wav_path, on_progress, language)
        except Exception as e:
            _models.pop("cuda", None)
            gpu_problem = any(k in str(e).lower() for k in ("cuda", "cudnn", "cublas", "out of memory"))
            # Ошибка не про видеокарту (например, сбой при скачивании модели) — пробуем ещё раз
            if not gpu_problem and attempt == 0:
                print(f"[whisper] повтор после ошибки: {e}", flush=True)
                continue
            print(f"[whisper] видеокарта недоступна ({e}), считаю на CPU", flush=True)
            break
    return _run(_load("cpu"), wav_path, on_progress, language)
