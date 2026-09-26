"""Поиск сильных моментов без AI: хуки в тексте + темп речи + громкость."""

import re
import wave

import numpy as np

from audio_fx import strip_fillers

SENTENCE_END = re.compile(r"[.!?…]$")

HOOK_STEMS = [
    "почему", "как ", "зачем", "секрет", "ошибк", "никогда", "всегда", "главн", "правд", "честн", "никто",
    "все ", "самый", "сам", "лучш", "худш", "деньг", "миллион", "шок", "запомн", "важн", "проблем", "вы ",
    "ты ", "представ", "смотри", "стоп", "внимани", "нельзя", "факт", "совет", "способ", "причин",
    "why", "how", "secret", "mistake", "never", "always", "truth", "nobody", "best", "worst", "money",
]


def load_rms(wav_path: str, hop_s: float = 0.1) -> tuple[np.ndarray, float]:
    """Громкость (RMS) по окнам в 100 мс из моно-wav 16 кГц."""
    with wave.open(wav_path, "rb") as w:
        sr = w.getframerate()
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    hop = int(sr * hop_s)
    n = len(data) // hop
    if n == 0:
        return np.zeros(1), hop_s
    frames = data[: n * hop].reshape(n, hop)
    return np.sqrt((frames**2).mean(axis=1)), hop_s


def split_sentences(words: list[dict]) -> list[dict]:
    sentences, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        long_pause = nxt is not None and nxt["start"] - w["end"] > 1.2
        capital_next = nxt is not None and nxt["text"][:1].isupper() and nxt["start"] - w["end"] > 0.25
        if SENTENCE_END.search(w["text"]) or long_pause or capital_next or len(cur) >= 40:
            sentences.append(cur)
            cur = []
    if cur:
        sentences.append(cur)
    return [
        {"start": s[0]["start"], "end": s[-1]["end"], "text": " ".join(w["text"] for w in s), "n": len(s)}
        for s in sentences
    ]


def hook_score(text: str) -> float:
    t = " " + text.lower() + " "
    score = sum(1.0 for stem in HOOK_STEMS if stem in t)
    if "?" in text:
        score += 1.5
    if re.search(r"\d", text):
        score += 0.8
    return min(score, 5.0)


STOP = set("""
и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще
нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом
себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под
будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда
зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много
разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между
это просто очень типа короче значит вообще как-то например то-есть кстати действительно давайте smth
the a an and or but is are was were be to of in on at for with that this it you i we they he she
""".split())
LEADING = ("и ", "а ", "но ", "поэтому ", "так ", "вот ", "то есть ", "значит ", "кстати ", "короче ", "ну ", "и вот ")


def _stems(text: str) -> list[str]:
    words = "".join(ch.lower() if ch.isalnum() else " " for ch in text).split()
    return [w[:6] if len(w) > 6 else w for w in words if w not in STOP and len(w) > 2]


def topic_title(clip_sentences: list[dict], all_sentences: list[dict]) -> str:
    """Заголовок по главной теме: фраза, в которой больше всего ключевых слов этого клипа."""
    import math
    from collections import Counter

    df = Counter(s for sent in all_sentences for s in set(_stems(sent["text"])))
    n_all = max(len(all_sentences), 1)
    tf = Counter(s for sent in clip_sentences for s in _stems(sent["text"]))
    # вес слова: как часто звучит в клипе × насколько оно отличает клип от остального ролика
    weight = {s: c * math.log(1 + n_all / (1 + df[s])) for s, c in tf.items()}

    candidates = []
    for k, sent in enumerate(clip_sentences):
        text = strip_fillers(sent["text"])
        parts = [text] + ([p.strip() for p in text.split(",")] if len(text.split()) > 10 else [])
        for part in parts:
            low = part.lower() + " "
            for lead in LEADING:
                if low.startswith(lead):
                    part = part[len(lead):]
                    low = low[len(lead):]
            n = len(part.split())
            if n < 3:
                continue
            stems = set(_stems(part))
            score = sum(weight.get(s, 0) for s in stems) / math.sqrt(n)
            score += 1.5 * ("?" in part) + 0.6 * min(hook_score(part), 3) + (0.4 if k < 2 else 0)
            score -= max(0, n - 12) * 0.35
            candidates.append((score, part))
    if not candidates:
        return make_title(clip_sentences)
    best = max(candidates, key=lambda c: c[0])[1]
    words = best.split()
    title = " ".join(words[:9]).rstrip(",.;:—-…")
    if len(words) > 9:
        title += "…"
    return title[:1].upper() + title[1:]


def make_title(sentences: list[dict]) -> str:
    """Хук-заголовок: вопрос из клипа или первая фраза, до 7 слов."""
    candidates = [strip_fillers(s["text"]) for s in sentences[:4]]
    candidates = [c for c in candidates if len(c.split()) >= 2] or [strip_fillers(sentences[0]["text"])]
    src = next((c for c in candidates if "?" in c), candidates[0])
    words = src.replace(" ,", ",").split()
    # Whisper не всегда ставит точки — обрываем на слове с заглавной (начало следующего предложения)
    for i, w in enumerate(words[1:], start=1):
        if w[:1].isupper() and not words[i - 1][:1].isdigit():
            words = words[:i]
            break
    title = " ".join(words[:8]).rstrip(",.;:—-…")
    if len(words) > 8:
        title += "…"
    return title[:1].upper() + title[1:]


def find_highlights(words: list[dict], wav_path: str, limit: int = 8, min_len: float = 15, max_len: float = 60):
    if not words:
        return []
    sentences = split_sentences(words)
    rms, hop = load_rms(wav_path)
    global_loud = float(rms.mean()) or 1e-6

    candidates = []
    for i in range(len(sentences)):
        for j in range(i, len(sentences)):
            start, end = sentences[i]["start"], sentences[j]["end"]
            dur = end - start
            if dur > max_len:
                break
            if dur < min_len:
                continue
            chunk = sentences[i : j + 1]
            n_words = sum(s["n"] for s in chunk)
            pace = n_words / dur  # слов в секунду
            loud = float(rms[int(start / hop) : int(end / hop) + 1].mean()) / global_loud
            hook = hook_score(chunk[0]["text"]) * 1.6 + sum(hook_score(s["text"]) for s in chunk[1:]) * 0.3
            ideal = 1 - abs(dur - 35) / 45  # клипы около 35 секунд смотрятся лучше
            score = hook + pace * 0.8 + loud * 1.2 + ideal
            candidates.append((score, start, end, chunk))

    if not candidates:  # видео короче минимальной длины — отдаём его целиком
        sents = sentences
        return [{
            "id": 0, "start": sents[0]["start"], "end": sents[-1]["end"],
            "title": topic_title(sents, sents), "score": 80,
        }]

    candidates.sort(key=lambda c: c[0], reverse=True)
    picked = []
    for c in candidates:
        if all(c[2] <= p[1] or c[1] >= p[2] for p in picked):
            picked.append(c)
        if len(picked) >= limit:
            break

    top = picked[0][0]
    low = picked[-1][0] if len(picked) > 1 else top - 1
    result = []
    for k, (score, start, end, chunk) in enumerate(picked):
        norm = 70 + 28 * (score - low) / ((top - low) or 1)  # 70..98 — для отображения
        result.append({
            "id": k,
            "start": round(max(0.0, start - 0.15), 2),
            "end": round(end + 0.25, 2),
            "title": topic_title(chunk, sentences),
            "score": int(round(norm)),
        })
    return result
