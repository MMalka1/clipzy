"""Монтажный ритм: планы и акценты — по одной логике, как у монтажёра.

  • План = предложение. Планы чередуются: общий (1.0) и крупный (1.12) — классический джамп-кат.
    Внутри плана картинка медленно наезжает, чтобы кадр не был статичным.
  • Акцент = самое сильное слово предложения (цифры, деньги, «секрет», «ошибка»…). На нём быстрый
    плавный наезд, который «приземляется» ровно на начало слова. Не чаще раза в 5 секунд.
  • Метки (cues) — слова, на которые можно поставить мемный звук или «тик» пункта списка.
    Сами звуки выбирает sfx_logic уже в шкале готового клипа — по тому, что происходит в кадре.

Все времена — в шкале исходного видео. Движок и превью считают зум по одним и тем же числам.
"""

import math
import re

from audio_fx import _n
from emoji_map import emoji_for

PLAN_VERSION = 3  # поменялась логика — старые проекты пересчитывают план

SHOT_ZOOM = (1.0, 1.12)
PUSH = 0.035  # медленный наезд внутри плана
ACCENT_ZOOM = 0.09
ACCENT_IN, ACCENT_OUT = 0.18, 0.4
MIN_SHOT = 1.2  # короткие предложения не дробим на отдельные планы
ACCENT_GAP = 5.0
HOOK_END = 3.2  # хук на экране первые 3.2 с готового клипа

STRONG = ("главн", "никогда", "никто", "бесплатн", "запомн", "важн", "шок", "правд", "stop", "never", "free")

# Смысловые метки — целые слова (fullmatch), чтобы «доходит», «Европа» и «провалился» не срабатывали
MONEY = re.compile(r"деньг\w*|денег|денежн\w*|рубл(ь|я|ей|ям|ями|ях)|доллар\w*|евро|миллион\w*|миллиард\w*|"
                   r"зарплат\w*|бабк(и|ах|ами)|бабок|бабл\w*|прибыл(ь|и|ью)|доход(а|у|ом|е|ы|ов|ам|ами|ах)?|"
                   r"выручк\w*|заработ(ать|ал|ала|али|аю|ает|ок|ка|ку)|money|cash|dollars?|millions?|billions?|"
                   r"salary|profits?|revenue")
WRONG = re.compile(r"ошибк\w*|ошиба\w*|ошибёш\w*|неправильн\w*|провал(а|ом)?|mistakes?|wrong|fail(ed|ure)?")
SECRET = re.compile(r"секрет\w*|лайфхак\w*|фишк(а|и|у|ой|е)|хитрост\w*|secrets?|hacks?|tricks?")
STOP = {"стоп", "стоп-стоп", "подожди", "подождите", "wait", "stop"}
CTA = re.compile(r"подпиш\w*|подписыва\w*|ссылк\w*|subscribe\w*|links?")
LIST = {"во-первых", "во-вторых", "в-третьих", "в-четвёртых", "в-четвертых", "первое", "второе", "третье",
        "firstly", "secondly", "thirdly", "first", "second", "third"}
# Год («в 2015») и «10-летний», «90-х», «2-й» — не акцент: это не цифра-факт
YEAR = re.compile(r"(19|20)\d\d")
NUM_WORD = re.compile(r"\d+-?(летн\w*|лет|х|й|го|м|я)")


def accent_score(text: str) -> tuple[float, str | None]:
    """Сила слова как акцента и его тип: num | money | secret | wrong | strong."""
    t = _n(text)
    if len(t) < 2:
        return 0.0, None
    score, tag = 0.0, None
    if MONEY.fullmatch(t) or "$" in text or "₽" in text:
        score, tag = 2.5, "money"
    elif WRONG.fullmatch(t):
        score, tag = 2.5, "wrong"
    elif SECRET.fullmatch(t):
        score, tag = 2.5, "secret"
    elif t.startswith(STRONG):
        score, tag = 2.5, "strong"
    if any(ch.isdigit() for ch in t) and not YEAR.fullmatch(t) and not NUM_WORD.fullmatch(t):
        score += 3
        tag = "money" if tag == "money" else "num"
    if emoji_for(text) in ("💰", "💸", "🤑", "🔥", "🏆", "❌", "🤫", "🚫"):
        score += 1.5
    return score, tag


def split_sentences(words: list[dict]) -> list[list[dict]]:
    out, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        if nxt is None:
            break
        gap = nxt["start"] - w["end"]
        if re.search(r"[.!?…]$", w["text"]) or gap > 1.0 or (nxt["text"][:1].isupper() and gap > 0.2):
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def cue_kind(text: str, first: bool) -> str | None:
    t = _n(text)
    if not t:
        return None
    if MONEY.fullmatch(t) or "$" in text or "₽" in text:
        return "cash"
    if WRONG.fullmatch(t):
        return "fail"
    if SECRET.fullmatch(t):
        return "sparkle"
    if CTA.fullmatch(t):
        return "bell"
    if first and t in STOP:
        return "scratch"
    if first and t in LIST:
        return "list"
    return None


def cues(sentences: list[list[dict]]) -> list[dict]:
    out = []
    for sent in sentences:
        for i, w in enumerate(sent):
            kind = cue_kind(w["text"], i == 0)
            if kind:
                out.append({"t": round(w["start"], 3), "end": round(w["end"], 3), "kind": kind, "first": i == 0})
    return out


def build_plan(words: list[dict], fillers: list[bool]) -> dict:
    kept = [w for w, f in zip(words, fillers) if not f]
    sentences = split_sentences(kept)

    # Планы: одно или несколько коротких предложений подряд
    groups: list[list[dict]] = []
    for s in sentences:
        if groups and (s[-1]["end"] - s[0]["start"] < MIN_SHOT or groups[-1][-1]["end"] - groups[-1][0]["start"] < MIN_SHOT):
            groups[-1] += s
        else:
            groups.append(list(s))
    shots = []
    for k, g in enumerate(groups):
        start = max(0.0, g[0]["start"] - 0.1) if k else 0.0
        end = groups[k + 1][0]["start"] - 0.1 if k + 1 < len(groups) else g[-1]["end"] + 2.0
        shots.append({"start": round(start, 3), "end": round(max(end, start + 0.3), 3), "zoom": SHOT_ZOOM[k % 2]})

    # Акценты: лучшее слово предложения, если оно действительно сильное.
    # Наезд начинается чуть раньше слова и «приземляется» на его начало (ACCENT_IN).
    accents = []
    last = -99.0
    for s in sentences:
        scored = [(accent_score(w["text"]), w) for w in s]
        (score, tag), best = max(scored, key=lambda x: x[0][0])
        if score < 2.5 or best["start"] - last < ACCENT_GAP or best["start"] < 1.0:
            continue
        end = min(best["end"] + 0.9, s[-1]["end"] + 0.2)
        accents.append({"start": round(best["start"] - ACCENT_IN - 0.02, 3), "end": round(end, 3),
                        "score": score, "tag": tag})
        last = best["start"]

    return {"v": PLAN_VERSION, "shots": shots, "accents": accents, "cues": cues(sentences), "hookEnd": HOOK_END}


# ——— зум ———
def _ease(x: float) -> float:
    x = min(max(x, 0.0), 1.0)
    return (1 - math.cos(math.pi * x)) / 2


def zoom_at(t: float, plan: dict) -> float:
    """Зум в момент t (для проверок; в рендере та же формула — выражением FFmpeg)."""
    z = 1.0
    for sh in plan["shots"]:
        if sh["start"] <= t < sh["end"]:
            z = sh["zoom"] + PUSH * (t - sh["start"]) / (sh["end"] - sh["start"])
            break
    for a in plan["accents"]:
        end = a["end"] + ACCENT_OUT
        if a["start"] <= t <= end:
            z += ACCENT_ZOOM * _ease(min((t - a["start"]) / ACCENT_IN, (end - t) / ACCENT_OUT))
    return z


def zoom_expr(shots: list[dict], accents: list[dict]) -> str:
    """То же самое выражением FFmpeg от t (время уже в шкале готового рилса)."""
    parts = ["1"]
    for sh in shots:
        s, e = sh["start"], sh["end"]
        if e - s < 0.05:
            continue
        parts.append(f"gte(t,{s:.3f})*lt(t,{e:.3f})*({sh['zoom'] - 1:.3f}+{PUSH}*(t-{s:.3f})/{e - s:.3f})")
    for a in accents:
        s, e = a["start"], a["end"] + ACCENT_OUT
        x = f"min(clip((t-{s:.3f})/{ACCENT_IN},0,1),clip(({e:.3f}-t)/{ACCENT_OUT},0,1))"
        parts.append(f"between(t,{s:.3f},{e:.3f})*{ACCENT_ZOOM}*(1-cos(PI*{x}))/2")
    return "+".join(parts)
