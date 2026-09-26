"""Звук: слова-паразиты, события звуковых эффектов, синтез «вжух»/«дзынь» и фоновой музыки.

Все звуки генерируются кодом — без сторонних файлов и лицензий.
"""

import os
import re
import wave

import numpy as np

from emoji_map import emoji_for
from sfx_synth import SOUNDS
from paths import HOME

SR = 44100
ASSETS = os.path.join(HOME, "assets")

# ——— слова-паразиты ———
FILLERS_1 = {"э", "ээ", "эээ", "э-э", "э-э-э", "эм", "эмм", "мм", "ммм", "м-м", "а-а", "ну", "типа", "короче",
             "uh", "um", "uhm", "erm", "hmm"}
FILLERS_2 = {("как", "бы"), ("так", "сказать"), ("это", "самое"), ("в", "общем"), ("you", "know")}
_norm = re.compile(r"[^\w-]+", re.UNICODE)


def _n(text: str) -> str:
    return _norm.sub("", text.lower()).strip("-")


def mark_fillers(words: list[dict]) -> list[bool]:
    """Какие слова — паразиты. «ну» считаем паразитом только в начале фразы (после паузы/точки)."""
    flags = [False] * len(words)
    for i, w in enumerate(words):
        t = _n(w["text"])
        prev = words[i - 1] if i else None
        starts = prev is None or w["start"] - prev["end"] > 0.25 or re.search(r"[.!?…,]$", prev["text"])
        if t in FILLERS_1 and (t != "ну" or starts):
            flags[i] = True
        if i + 1 < len(words) and (t, _n(words[i + 1]["text"])) in FILLERS_2:
            flags[i] = flags[i + 1] = True
    return flags


def strip_fillers(text: str) -> str:
    """Убирает паразитов из обычного текста (для хук-заголовков)."""
    tokens = text.split()
    fake = [{"text": t, "start": i, "end": i + 0.5} for i, t in enumerate(tokens)]  # паузы нет — «ну» ловим только в начале
    flags = mark_fillers(fake)
    if tokens and _n(tokens[0]) == "ну":
        flags[0] = True
    kept: list[str] = []
    for t, f in zip(tokens, flags):
        if not f:
            kept.append(t)
        elif kept and t.endswith(",") and kept[-1].endswith(","):
            kept[-1] = kept[-1][:-1]  # «расскажу, типа, главный» → «расскажу главный»
    cleaned = " ".join(kept).strip(" ,.;:—-")
    return re.sub(r"\s+,", ",", cleaned)


def compute_peaks(wav_path: str, count: int = 600) -> list[float]:
    """Огибающая громкости для таймлайна редактора (0..1)."""
    with wave.open(wav_path, "rb") as w:
        data = np.abs(np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32))
    if not len(data):
        return []
    block = max(1, len(data) // count)
    peaks = data[: block * count].reshape(-1, block).max(axis=1) if len(data) >= count else data
    peaks = peaks / (peaks.max() or 1)
    return [round(max(0.04, float(p)), 3) for p in peaks]


# ——— события звуковых эффектов ———
KEY_STEMS = ("секрет", "ошибк", "главн", "никогда", "всегда", "деньг", "миллион", "важн", "запомн", "бесплатн",
             "лучш", "проблем", "правд", "stop", "secret", "never", "money", "free")


def is_key(text: str) -> bool:
    t = _n(text)
    if not t:
        return False
    return any(ch.isdigit() for ch in t) or t.startswith(KEY_STEMS) or emoji_for(text) in ("💰", "💸", "🤑", "🔥", "🏆", "❌")


# ——— синтез ———
def _write(path: str, data: np.ndarray):
    """data: float [-1..1], shape (n,) или (n, 2)."""
    if data.ndim == 1:
        data = np.stack([data, data], axis=1)
    pcm = (np.clip(data, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def _read(path: str) -> np.ndarray:
    with wave.open(path, "rb") as w:
        raw = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32767
        return raw.reshape(-1, w.getnchannels())


def _lowpass(x: np.ndarray, cutoff: np.ndarray | float) -> np.ndarray:
    """Однополюсный фильтр; cutoff может меняться во времени."""
    c = np.broadcast_to(np.asarray(cutoff, dtype=np.float64), x.shape)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def synth_whoosh() -> np.ndarray:
    n = int(SR * 0.5)
    t = np.linspace(0, 1, n)
    rng = np.random.default_rng(7)
    noise = rng.standard_normal(n)
    cutoff = 400 + 5200 * np.sin(np.pi * t) ** 2  # фильтр раскрывается и закрывается
    body = _lowpass(noise, cutoff) - _lowpass(noise, cutoff * 0.25)
    env = np.sin(np.pi * t) ** 1.6
    mono = body * env
    mono /= np.abs(mono).max() + 1e-9
    pan = t  # пролёт слева направо
    return np.stack([mono * (1 - pan * 0.7), mono * (0.3 + pan * 0.7)], axis=1) * 0.55


def synth_ding() -> np.ndarray:
    n = int(SR * 1.3)
    t = np.arange(n) / SR
    f0 = 1318.5  # E6
    partials = [(1.0, 1.0, 2.2), (2.76, 0.45, 3.5), (5.40, 0.22, 5.0), (8.93, 0.1, 7.0)]  # колокольные обертоны
    x = sum(a * np.sin(2 * np.pi * f0 * r * t) * np.exp(-d * t) for r, a, d in partials)
    x *= np.minimum(1, t / 0.003)
    x /= np.abs(x).max()
    return x * 0.5


def _note(freq: float, dur: float, kind: str) -> np.ndarray:
    n = int(SR * dur)
    t = np.arange(n) / SR
    if kind == "ep":  # электропиано
        x = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(4 * np.pi * freq * t) * np.exp(-6 * t)
        env = np.exp(-2.2 * t) * np.minimum(1, t / 0.005)
    elif kind == "pad":
        x = sum(np.sin(2 * np.pi * freq * d * t) for d in (0.997, 1.0, 1.004)) / 3
        env = np.minimum(1, t / 0.6) * np.minimum(1, (dur - t) / 0.8)
    else:  # pluck
        x = np.sign(np.sin(2 * np.pi * freq * t)) * 0.4 + np.sin(2 * np.pi * freq * t)
        env = np.exp(-9 * t)
    return x * env


def _kick() -> np.ndarray:
    t = np.arange(int(SR * 0.35)) / SR
    f = 45 + 90 * np.exp(-18 * t)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-9 * t)


def _noise_hit(dur: float, decay: float, bright: bool, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    x = rng.standard_normal(int(SR * dur))
    if bright:
        x = np.diff(x, prepend=0)
    return x * np.exp(-decay * np.arange(len(x)) / SR) * 0.3


MIDI = lambda m: 440 * 2 ** ((m - 69) / 12)  # noqa: E731
PROGRESSIONS = {
    "lofi": [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]],  # Am7 Fmaj7 Cmaj7 G7
    "ambient": [[48, 55, 60, 64], [45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59]],
    "drive": [[45, 52, 57, 60], [41, 48, 53, 57], [48, 55, 60, 64], [43, 50, 55, 59]],
}
TRACKS = {"lofi": ("Лоуфай", 84), "ambient": ("Эмбиент", 70), "drive": ("Драйв", 118)}


def synth_track(kind: str) -> np.ndarray:
    """8 тактов, закольцовываются без щелчка."""
    bpm = TRACKS[kind][1]
    beat = 60 / bpm
    bars = 8
    total = int(SR * beat * 4 * bars)
    out = np.zeros((total, 2))

    def add(sig, at, gain, pan=0.0):
        i = int(at * SR)
        if i >= total:
            return
        seg = sig[: total - i] * gain
        out[i : i + len(seg), 0] += seg * (1 - max(pan, 0))
        out[i : i + len(seg), 1] += seg * (1 + min(pan, 0))

    prog = PROGRESSIONS[kind]
    for bar in range(bars):
        chord = prog[bar % 4]
        t0 = bar * 4 * beat
        if kind == "ambient":
            for k, m in enumerate(chord):
                add(_note(MIDI(m), 4 * beat + 0.8, "pad"), t0, 0.16, pan=(k - 1.5) * 0.3)
        elif kind == "lofi":
            for k, m in enumerate(chord):
                add(_note(MIDI(m), 2 * beat, "ep"), t0 + k * 0.012, 0.13, pan=(k - 1.5) * 0.2)
                add(_note(MIDI(m), 2 * beat, "ep"), t0 + 2.5 * beat + k * 0.012, 0.09, pan=(k - 1.5) * 0.2)
            add(_note(MIDI(chord[0] - 12), 4 * beat, "pad"), t0, 0.2)
            for b in range(4):
                swing = 0.06 if b % 2 else 0
                add(_kick(), t0 + b * beat, 0.55 if b in (0, 2) else 0)
                add(_noise_hit(0.18, 22, False, bar * 4 + b), t0 + b * beat, 0.35 if b in (1, 3) else 0)
                add(_noise_hit(0.05, 60, True, 99 + b), t0 + (b + 0.5 + swing) * beat, 0.18, pan=0.3)
        else:  # drive
            arp = chord + [chord[1] + 12, chord[2] + 12, chord[1] + 12, chord[3]]
            for s in range(16):
                add(_note(MIDI(arp[s % 8]), beat * 0.5, "pluck"), t0 + s * beat / 4, 0.07, pan=0.4 if s % 2 else -0.4)
            add(_note(MIDI(chord[0] - 12), 4 * beat, "pad"), t0, 0.22)
            for b in range(4):
                add(_kick(), t0 + b * beat, 0.6)
                add(_noise_hit(0.05, 55, True, 7 + b), t0 + (b + 0.5) * beat, 0.22, pan=-0.2)
                add(_noise_hit(0.2, 18, False, 50 + b), t0 + b * beat, 0.3 if b in (1, 3) else 0)

    if kind == "lofi":  # треск пластинки
        rng = np.random.default_rng(3)
        crackle = (rng.random(total) > 0.9993) * rng.standard_normal(total) * 0.25
        out += crackle[:, None]
    out /= np.abs(out).max() + 1e-9
    return out * 0.8


def asset(name: str) -> str:
    """Путь к сгенерированному звуку (whoosh, ding, music_lofi…), генерируем один раз."""
    os.makedirs(ASSETS, exist_ok=True)
    path = os.path.join(ASSETS, f"{name}.wav")
    if not os.path.exists(path):
        if name in SOUNDS:
            _write(path, SOUNDS[name]["make"]())
        elif name == "whoosh":
            _write(path, synth_whoosh())
        elif name == "ding":
            _write(path, synth_ding())
        elif name.startswith("music_") and name[6:] in TRACKS:
            _write(path, synth_track(name[6:]))
        else:
            raise KeyError(name)
    return path


def build_music_track(music_path: str, ffmpeg: str, total: float, speech: list[tuple[float, float]],
                      volume: float, out_path: str, duck: float = 0.22):
    """Музыка под рилс: закольцована, тише на речи (по таймкодам слов), с плавными входом и концовкой."""
    import subprocess

    raw = subprocess.run(
        [ffmpeg, "-v", "error", "-i", music_path, "-ac", "2", "-ar", str(SR), "-f", "s16le", "-"],
        capture_output=True, check=True,
    ).stdout
    src = np.frombuffer(raw, dtype=np.int16).astype(np.float32).reshape(-1, 2) / 32767
    n = int(SR * total)
    if not len(src) or not n:
        _write(out_path, np.zeros((max(n, 1), 2)))
        return
    reps = n // len(src) + 1
    music = np.tile(src, (reps, 1))[:n]

    # Огибающая: 1 в паузах, duck на речи; короткие паузы между словами не «проваливаются»
    target = np.ones(n, dtype=np.float32)
    merged: list[list[float]] = []
    for a, b in sorted(speech):
        if merged and a - merged[-1][1] < 0.35:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    for a, b in merged:
        target[int(max(a - 0.08, 0) * SR) : int(min(b + 0.15, total) * SR)] = duck
    win = int(SR * 0.12)  # сглаживание ~120 мс, чтобы не было «качелей»
    kernel = np.ones(win, dtype=np.float32) / win
    env = np.convolve(target, kernel, mode="same")

    fade_in, fade_out = min(int(SR * 0.6), n // 4), min(int(SR * 1.2), n // 3)
    env[:fade_in] *= np.linspace(0, 1, fade_in)
    env[n - fade_out :] *= np.linspace(1, 0, fade_out)
    _write(out_path, music * (env * volume)[:, None])


OLD_GAIN = {"whoosh": 0.7, "ding": 0.45}  # звуки первой версии (для старых событий без gain)


def build_sfx_track(events: list[dict], total: float, out_path: str, volume: float = 1.0):
    """Все эффекты клипа — одной дорожкой. t — начало сэмпла в шкале готового рилса (может быть < 0:
    у «нарастания» начало обрезается), gain — громкость звука в миксе."""
    n = int(SR * (total + 1.5))
    track = np.zeros((n, 2), dtype=np.float32)
    samples: dict[str, np.ndarray] = {}
    for e in events:
        if e["type"] not in samples:
            samples[e["type"]] = _read(asset(e["type"]))
        s = samples[e["type"]]
        i = int(round(e["t"] * SR))
        if i < 0:
            s, i = s[-i:], 0
        if i >= n or not len(s):
            continue
        seg = s[: n - i]
        g = e.get("gain", OLD_GAIN.get(e["type"], 0.5))
        track[i : i + len(seg)] += seg * g * volume
    _write(out_path, track[: int(SR * total)])
