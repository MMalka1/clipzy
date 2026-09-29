"""Набор звуков для sfx_logic: сэмплы из sfx/ (CC0 — источники в sfx/sources.json, разметка в sfx/kit.json)
и синтез sfx_synth для семейств, где файлов нет. Движок работает и совсем без файлов.

Сайт получает тот же набор (public()) вместе с проектом — превью выбирает звуки по тем же правилам.
"""

import hashlib
import json
import math
import os
import threading
import wave

import numpy as np

import sfx_synth
from paths import HERE, HOME

DIR = os.path.join(HERE, "sfx")
CACHE = os.path.join(HOME, "assets")
SR = 44100
FAMILIES = ("hit", "zoomin", "swish", "whoosh", "pop", "tick", "riser", "cash", "fail", "sparkle", "scratch", "bell")

_lock = threading.Lock()
_kit: dict | None = None
_paths: dict[str, str] = {}


def write_wav(path: str, data: np.ndarray):
    """float −1..1, форма (n,) или (n, каналы) — 16 бит, 44.1 кГц, сколько каналов, столько и пишем."""
    if data.ndim == 1:
        data = data[:, None]
    pcm = (np.clip(data, -1, 1) * 32767).astype("<i2")
    tmp = path + ".tmp"
    with wave.open(tmp, "wb") as w:
        w.setnchannels(data.shape[1])
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    os.replace(tmp, path)


def read_wav(path: str) -> np.ndarray | None:
    """(n, каналы) float; None — файла нет или он не 16 бит / 44.1 кГц."""
    try:
        with wave.open(path, "rb") as w:
            if w.getsampwidth() != 2 or w.getframerate() != SR or w.getnchannels() not in (1, 2):
                return None
            raw = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32767
            return raw.reshape(-1, w.getnchannels())
    except (OSError, wave.Error, EOFError):
        return None


def _sha(path: str) -> str:
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:8]


def _synth(name: str) -> str:
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name + ".wav")
    if read_wav(path) is None:
        write_wav(path, sfx_synth.SOUNDS[name]["make"]())
    return path


def _measure(x: np.ndarray, peak: float | None) -> tuple[float, float]:
    """Где «попадание» (если не задано) и уровень пика в dBFS. Попадание короткого звука — его атака:
    первый момент, когда огибающая (5 мс) доходит до половины максимума."""
    mono = np.abs(x).max(axis=1)
    if peak is None:
        win = max(1, int(SR * 0.005))
        env = np.convolve(mono, np.ones(win) / win, mode="same")
        peak = float(np.argmax(env >= env.max() * 0.5)) / SR
    return peak, 20 * math.log10(max(float(mono.max()), 1e-6))


def load() -> dict:
    global _kit
    with _lock:
        if _kit is not None:
            return _kit
        with open(os.path.join(DIR, "rules.json"), encoding="utf-8") as f:
            rules = json.load(f)
        samples: dict[str, dict] = {}
        families: dict[str, list[str]] = {f: [] for f in FAMILIES}
        # Сэмплы-файлы (если собраны tools/build_sfx_kit.py)
        kit_path = os.path.join(DIR, "kit.json")
        if os.path.exists(kit_path):
            with open(kit_path, encoding="utf-8") as f:
                meta = json.load(f)
            for name, s in meta.get("samples", {}).items():
                path = os.path.join(DIR, name + ".wav")
                x = read_wav(path)
                if x is None or s.get("fam") not in families:
                    continue
                samples[name] = {"fam": s["fam"], "peak": round(float(s["peak"]), 4), "dur": round(len(x) / SR, 4),
                                 "refDb": round(float(s["refDb"]), 2), "sha": _sha(path)}
                families[s["fam"]].append(name)
                _paths[name] = path
        # Синтез — для семейств без файлов
        synth_fams = {f for f, names in families.items() if not names}
        for name, s in sfx_synth.SOUNDS.items():
            if s["fam"] not in synth_fams:
                continue
            path = _synth(name)
            x = read_wav(path)
            peak, ref = _measure(x, s["peak"])
            samples[name] = {"fam": s["fam"], "peak": round(peak, 4), "dur": round(len(x) / SR, 4),
                             "refDb": round(ref, 2), "sha": _sha(path)}
            families[s["fam"]].append(name)
            _paths[name] = path
        _kit = {"v": 3, "rules": rules, "samples": samples, "families": {f: n for f, n in families.items() if n}}
        return _kit


def public() -> dict:
    return load()


def path(name: str) -> str:
    load()
    return _paths[name]


def names() -> set[str]:
    return set(load()["samples"])
