"""Монтажный ритм: планы, акценты и звуки — по одной логике, как у монтажёра.

  • План = предложение. Планы чередуются: общий (1.0) и крупный (1.12) — классический джамп-кат.
    Внутри плана картинка медленно наезжает, чтобы кадр не был статичным.
  • Акцент = самое сильное слово предложения (цифры, деньги, «секрет», «ошибка»…).
    На нём быстрый плавный наезд и «дзынь». Не чаще раза в 5 секунд.
  • Звуки (версия 2) — по смыслу и по картинке, см. sfx_events():
      переходы («вжух») — только на настоящих склейках, пик звука ровно на склейке;
      акценты — у самого сильного момента «нарастание → удар», у остальных «дзынь»;
      смысловые — касса на деньгах, «неверно» на ошибках, блеск на секретах, скретч на «но»
      в начале фразы, «поп» на пунктах списка.
    События хранят момент «попадания» (anchor) в шкале исходника и пик сэмпла — движок и превью
    ставят начало сэмпла в map_time(anchor) − peak.

Все времена — в шкале исходного видео. Движок и превью считают зум по одним и тем же числам.
"""

import math
import re

from audio_fx import _n
from emoji_map import emoji_for
from sfx_synth import SOUNDS

PLAN_VERSION = 2  # поменялась логика — старые проекты пересчитывают план

SHOT_ZOOM = (1.0, 1.12)
PUSH = 0.035  # медленный наезд внутри плана
ACCENT_ZOOM = 0.09
ACCENT_IN, ACCENT_OUT = 0.18, 0.4
MIN_SHOT = 1.2  # короткие предложения не дробим на отдельные планы
ACCENT_GAP = 5.0
WHOOSH_GAP = 5.0

STRONG = ("секрет", "ошибк", "главн", "никогда", "никто", "деньг", "миллион", "бесплатн", "запомн", "важн",
          "шок", "правд", "stop", "secret", "never", "money", "free", "mistake")


def accent_score(text: str) -> float:
    t = _n(text)
    if len(t) < 2:
        return 0
    score = 0.0
    # Цифры — сильный акцент («35 фактов», «1000 рублей»), но год («2015 года») — просто дата
    if any(ch.isdigit() for ch in t) and not re.fullmatch(r"(19|20)\d\d", t):
        score += 3
    if t.startswith(STRONG):
        score += 2.5
    if emoji_for(text) in ("💰", "💸", "🤑", "🔥", "🏆", "❌", "🤫", "🚫"):
        score += 1.5
    return score


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

    # Акценты: лучшее слово предложения, если оно действительно сильное
    accents = []
    last = -99.0
    for s in sentences:
        best = max(s, key=lambda w: accent_score(w["text"]))
        if accent_score(best["text"]) < 2.5 or best["start"] - last < ACCENT_GAP or best["start"] < 1.0:
            continue
        end = min(best["end"] + 0.9, s[-1]["end"] + 0.2)
        accents.append({"start": round(best["start"] - 0.05, 3), "end": round(end, 3)})
        last = best["start"]

    return {"v": PLAN_VERSION, "shots": shots, "accents": accents,
            "sfx": sfx_events(sentences, groups, shots, accents)}


# ——— звуки ———
# Смысловые триггеры: основы слов (русская морфология) и английские слова
MONEY = ("деньг", "денег", "денежн", "рубл", "доллар", "евро", "миллион", "миллиард", "заработ", "зарплат", "бабк",
         "бабл", "прибыл", "доход", "выручк", "money", "cash", "dollar", "million", "billion", "salary", "profit", "revenue")
WRONG = ("ошибк", "ошибаю", "ошибал", "ошибёш", "ошибет", "нельзя", "неправильн", "провал", "mistake", "wrong", "fail")
SECRET = ("секрет", "лайфхак", "фишк", "хитрост", "магия", "магич", "secret", "hack", "trick", "magic")
CONTRAST = {"но", "однако", "стоп", "подожди", "подождите", "стоп-стоп", "but", "however", "wait", "stop"}
LIST = {"во-первых", "во-вторых", "в-третьих", "в-четвёртых", "в-четвертых", "первое", "второе", "третье",
        "firstly", "secondly", "thirdly", "first", "second", "third"}

# Приоритет (кто важнее при столкновении), минимальный интервал между звуками одного типа
KINDS = {
    "punch": (100, 18.0),    # нарастание → удар на самом сильном слове
    "cash": (80, 6.0),
    "buzzer": (78, 6.0),
    "sparkle": (76, 8.0),
    "scratch": (74, 25.0),
    "ding": (60, 4.0),
    "pop": (50, 2.5),
    "whoosh": (40, 7.0),
}
GLOBAL_GAP = 1.1        # между любыми двумя «попаданиями»
RISER_LEN = 1.1         # подводка занимает секунду до удара — в это время других звуков нет
EVENTS_PER_SEC = 1 / 3  # в среднем не чаще раза в 3 секунды


def _semantic(w: dict, first: bool, index: int) -> str | None:
    t = _n(w["text"])
    if not t:
        return None
    if t.startswith(MONEY) or "$" in w["text"] or "₽" in w["text"]:
        return "cash"
    if t.startswith(WRONG):
        return "buzzer"
    if t.startswith(SECRET):
        return "sparkle"
    if first and index > 0 and t in CONTRAST:
        return "scratch"
    if first and t in LIST:
        return "pop"
    return None


def sfx_events(sentences: list[list[dict]], groups: list[list[dict]], shots: list[dict],
               accents: list[dict]) -> list[dict]:
    """Кандидаты → жадный отбор по приоритету с интервалами → события со своим сэмплом, пиком и громкостью."""
    cands: list[tuple[int, float, str]] = []  # (приоритет, anchor, вид)

    # Акценты: в каждом окне ~18 с самый сильный — «нарастание → удар», остальные — «дзынь»
    scored = []
    for a in accents:
        word = next((w for s in sentences for w in s if abs(w["start"] - 0.05 - a["start"]) < 0.02), None)
        scored.append((accent_score(word["text"]) if word else 0, a["start"] + 0.05))
    for score, t in scored:
        best = max((sc for sc, tt in scored if abs(tt - t) < KINDS["punch"][1] / 2), default=score)
        kind = "punch" if score >= best and score >= 3 and t > RISER_LEN + 0.3 else "ding"
        cands.append((KINDS[kind][0], t, kind))

    # Смысловые звуки на словах
    for si, sent in enumerate(sentences):
        for wi, w in enumerate(sent):
            kind = _semantic(w, wi == 0, si)
            if kind:
                cands.append((KINDS[kind][0], w["start"], kind))

    # Переходы: склейка между планами, если перед ней есть пауза (вдох) — не посреди речи
    for k in range(1, len(groups)):
        gap = groups[k][0]["start"] - groups[k - 1][-1]["end"]
        if gap >= 0.3:
            cands.append((KINDS["whoosh"][0], shots[k]["start"], "whoosh"))

    duration = sentences[-1][-1]["end"] if sentences and sentences[-1] else 0.0
    cap = int(duration * EVENTS_PER_SEC) + 1
    chosen: list[tuple[float, str]] = []
    # на одном слове — один звук: выше приоритет, раньше время
    for prio, t, kind in sorted(cands, key=lambda c: (-c[0], c[1])):
        if len(chosen) >= cap:
            break
        if any(k == kind and abs(t - tt) < KINDS[kind][1] for tt, k in chosen):
            continue
        if any(abs(t - tt) < GLOBAL_GAP for tt, _ in chosen):
            continue
        # подводка перед ударом — тишина для других звуков, и сама не налезает на чужие
        if kind == "punch" and any(t - RISER_LEN - 0.2 < tt < t for tt, _ in chosen):
            continue
        if any(k == "punch" and tt - RISER_LEN - 0.2 < t < tt for tt, k in chosen):
            continue
        chosen.append((t, kind))

    events: list[dict] = []
    counters: dict[str, int] = {}
    for t, kind in sorted(chosen):
        i = counters[kind] = counters.get(kind, 0) + 1
        names = {"punch": ["sfx2_riser", "sfx2_impact"], "whoosh": [f"sfx2_whoosh_{(i - 1) % 3 + 1}"],
                 "pop": [f"sfx2_pop_{(i - 1) % 2 + 1}"]}.get(kind, [f"sfx2_{kind}"])
        for name in names:
            snd = SOUNDS[name]
            events.append({"t": round(t, 3), "type": name, "cat": snd["cat"], "peak": snd["peak"], "gain": snd["gain"]})
    return events


def hook_events(total: float) -> list[dict]:
    """События в шкале готового рилса, которых нет в плане: удар при появлении хука и «вжух» при его уходе.
    anchor — момент попадания. То же считает превью в Editor.tsx."""
    out = []
    if total > 4:
        imp, wh = SOUNDS["sfx2_impact"], SOUNDS["sfx2_whoosh_3"]
        out.append({"t": imp["peak"], "type": "sfx2_impact", "cat": "accent", "peak": imp["peak"], "gain": imp["gain"] * 0.8})
        out.append({"t": 3.2, "type": "sfx2_whoosh_3", "cat": "transition", "peak": wh["peak"], "gain": wh["gain"]})
    return out


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
