"""Перевод субтитров RU ↔ EN с сохранением ритма речи.

Переводим целыми предложениями (так перевод естественнее), затем режем перевод на экранные фразы
и раскладываем по времени, когда человек реально говорил, — субтитры не попадают в вырезанные паузы.

Переводчик: официальный Google Cloud Translation, если в .env задан GOOGLE_TRANSLATE_KEY;
иначе — бесплатный неофициальный адрес Google (только для разработки).
"""

import html
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from audio_fx import mark_fillers, strip_fillers
from emoji_map import phrase_emoji
from highlights import split_sentences

LANGS = {"ru": "Русский", "en": "English"}


def _official(texts: list[str], src: str, dst: str, key: str) -> list[str]:
    data = json.dumps({"q": texts, "source": src, "target": dst, "format": "text"}).encode()
    req = urllib.request.Request(
        f"https://translation.googleapis.com/language/translate/v2?key={urllib.parse.quote(key)}",
        data=data, headers={"Content-Type": "application/json"},
    )
    out = json.load(urllib.request.urlopen(req, timeout=30))
    return [html.unescape(t["translatedText"]) for t in out["data"]["translations"]]


class Busy(Exception):
    """Переводчик отвечает «слишком много запросов» и после повторов."""


def _retry(fn, *args):
    """Бесплатный адрес быстро отвечает 429 (у серверов Vercel общий IP) — ждём и повторяем."""
    for wait in (1, 3, 6, None):
        try:
            return fn(*args)
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500:
                raise
            if wait is None:
                raise Busy() from e
            time.sleep(wait)


def _free(text: str, src: str, dst: str) -> str:
    # POST: длинный текст не влезает в адрес запроса
    req = urllib.request.Request(
        f"https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl={src}&tl={dst}",
        data=urllib.parse.urlencode({"q": text}).encode(),
        headers={"User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"},
    )
    data = json.load(urllib.request.urlopen(req, timeout=30))
    return "".join(part[0] for part in data[0] if part and part[0])


def _free_batch(texts: list[str], src: str, dst: str) -> list[str]:
    """Много строк — одним запросом через перевод строки; если строки «склеились», переводим по одной."""
    lines = _retry(_free, "\n".join(texts), src, dst).split("\n")
    if len(lines) == len(texts):
        return [line.strip() for line in lines]
    return [_retry(_free, t, src, dst) for t in texts]


def translate_texts(texts: list[str], src: str, dst: str) -> list[str]:
    if not texts:
        return []
    key = os.environ.get("GOOGLE_TRANSLATE_KEY")
    if key:
        out: list[str] = []
        for i in range(0, len(texts), 100):  # лимит API — 128 строк за запрос
            out += _official(texts[i : i + 100], src, dst, key)
        return out
    # Бесплатный адрес: пачками по ~1500 символов, не больше двух запросов одновременно
    items = [(i, " ".join(t.split())) for i, t in enumerate(texts) if t.strip()]
    batches: list[list[tuple[int, str]]] = [[]]
    for it in items:
        if batches[-1] and sum(len(t) + 1 for _, t in batches[-1]) + len(it[1]) > 1500:
            batches.append([])
        batches[-1].append(it)
    result = [""] * len(texts)
    with ThreadPoolExecutor(max_workers=2) as pool:
        done = pool.map(lambda b: _free_batch([t for _, t in b], src, dst), [b for b in batches if b])
        for b, tr in zip([b for b in batches if b], done):
            for (i, _), t in zip(b, tr):
                result[i] = t
    return result


def _chunks(words: list[str], max_words: int = 3, max_chars: int = 18) -> list[list[str]]:
    """Перевод → экранные фразы по 1–3 слова (как build_phrases для оригинала)."""
    out, cur = [], []
    for w in words:
        chars = sum(len(x) + 1 for x in cur) + len(w)
        if cur and (len(cur) >= max_words or chars > max_chars or re.search(r"[.!?…]$", cur[-1])):
            out.append(cur)
            cur = []
        cur.append(w)
    if cur:
        out.append(cur)
    return out


def translate_job(words: list[dict], highlights: list[dict], src: str, dst: str) -> dict:
    """Переведённые фразы с таймингом + переведённые хуки клипов."""
    flags = mark_fillers(words)
    kept = [w for w, f in zip(words, flags) if not f]  # паразитов не переводим и не показываем
    sentences = split_sentences(kept)
    # Слова каждого предложения — чтобы разложить перевод по времени реальной речи
    groups, i = [], 0
    for s in sentences:
        groups.append(kept[i : i + s["n"]])
        i += s["n"]

    texts = [strip_fillers(s["text"]) or s["text"] for s in sentences]
    titles = [h["title"] for h in highlights]
    translated = translate_texts(texts + titles, src, dst)
    tr_sentences, tr_titles = translated[: len(texts)], translated[len(texts):]

    phrases = []
    for group, text in zip(groups, tr_sentences):
        tokens = text.split()
        if not tokens or not group:
            continue
        # Шкала «времени речи»: длительности исходных слов подряд, без пауз между ними
        spans = [(w["start"], max(w["end"], w["start"] + 0.05)) for w in group]
        total_speech = sum(b - a for a, b in spans)

        def at(u: float) -> float:
            """Доля речи предложения (0..1) → время исходника внутри реально сказанных слов."""
            left = u * total_speech
            for a, b in spans:
                if left <= b - a:
                    return a + left
                left -= b - a
            return spans[-1][1]

        weights = [len(t) + 2 for t in tokens]  # длинное слово звучит дольше
        total_w = sum(weights)
        pos = 0
        timed = []
        for t, wgt in zip(tokens, weights):
            timed.append({"text": t, "start": round(at(pos / total_w), 3), "end": round(at((pos + wgt) / total_w), 3)})
            pos += wgt
        k = 0
        for chunk in _chunks(tokens):
            ws = timed[k : k + len(chunk)]
            k += len(chunk)
            phrases.append({
                "id": len(phrases), "start": ws[0]["start"], "end": ws[-1]["end"], "words": ws,
                "emoji": phrase_emoji([w["text"] for w in ws]),
            })
    titles_map = {h["id"]: (t[:1].upper() + t[1:]) if t else h["title"] for h, t in zip(highlights, tr_titles)}
    return {"phrases": phrases, "titles": titles_map}
