"""Какие звуки и где звучат в готовом рилсе. Чистая функция, без файлов и сети.

Правило одно: звук — только там, где что-то происходит в кадре (появился и ушёл хук, наезд на акценте,
склейка в более крупный план, смена спикера, эмодзи). Склейки от вырезанных пауз и «эканий» — без звука.
Мемные звуки (касса, «неверно», блеск…) — по желанию: на подходящем эмодзи или в паузе после слова.

Ровно тот же алгоритм — clipSfx3() в src/lib/sfx.ts сайта: превью звучит как готовое видео.
Все числа — в sfx/rules.json (его читают обе стороны). Проверка совпадения — npm run test:sfx.
"""

import math

HOOK = ("hook_in", "hook_out")


def fnv1a(text: str) -> int:
    h = 0x811C9DC5
    for b in text.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def _r(x: float, digits: int) -> float:
    k = 10**digits
    return math.floor(x * k + 0.5) / k


def clip_sfx(ctx: dict, kit: dict, settings: dict) -> list[dict]:
    """ctx — события клипа в шкале готового рилса (см. render.clip_sfx), kit — sfx_kit.public(),
    settings — {style: off|clean|punchy, meme: bool, volume: 0..100}.
    Возвращает [{a, t, type, fam, gain, rate}]: a — момент «попадания», t — начало сэмпла (может быть < 0)."""
    R = kit["rules"]
    style = settings.get("style")
    vol = min(max(float(settings.get("volume", 70)), 0.0), 100.0)
    total = float(ctx.get("total") or 0)
    if style not in R["presets"] or vol <= 0 or total <= 0:
        return []
    P = R["presets"][style]
    M = R["meme"]
    prio = R["prio"]
    fams = kit["families"]
    samples = kit["samples"]
    meme_on = bool(settings.get("meme"))
    words = ctx.get("words") or []
    hook = bool(ctx.get("hook")) and total > R["hookMinTotal"]

    def voiced(a: float) -> bool:
        pad = R["voicedPad"]
        return any(w[0] + pad < a < w[1] - pad for w in words)

    def tail(fam: str) -> float:
        m = 0.0
        for n in fams.get(fam) or []:
            m = max(m, samples[n]["dur"] - samples[n]["peak"])
        return min(m, R["tailMax"])

    cands: list[dict] = []

    def add(kind: str, a: float, p: float, fam: str | None = None):
        cands.append({"kind": kind, "a": a, "prio": p, "fam": fam or R["fam"][kind], "i": len(cands)})

    # ——— кандидаты ———
    if hook:
        add("hook_in", R["hookIn"], prio["hook_in"])
        if total >= R["hookOutMinTotal"]:
            add("hook_out", R["hookEnd"] - R["hookOutLead"], prio["hook_out"])

    top = R["top"]
    top_min = top["minHook"] if hook else top["min"]
    for acc in ctx.get("accents") or []:
        a = acc["start"] + R["accentIn"]  # наезд «приземляется» на ключевое слово
        score = float(acc.get("score") or 0)
        s5 = min(score, 5.0)
        if (acc.get("tag") in top["tags"] or score >= top["score"]) and a >= top_min:
            add("hit", a, prio["hit"] + s5)
        add("zoomin", a, prio["zoomin"] + s5)  # запасной вариант, если удар не пройдёт по правилам

    shots = ctx.get("shots") or []
    for k in range(1, len(shots)):
        if shots[k]["zoom"] > shots[k - 1]["zoom"] + R["cutMinStep"]:  # склейка в более крупный план
            a = shots[k]["start"]
            if not voiced(a):
                add("cut", a, prio["cut"])

    for a in ctx.get("speakerCuts") or []:
        add("speaker", a, prio["speaker"])

    j = 0
    for e in ctx.get("emoji") or []:
        fam = M["emoji"].get(e["emo"]) if meme_on else None
        if fam:
            add("meme", e["t"], prio["meme"], fam)
        if fam or j % P["popEvery"] == 0:
            add("pop", e["t"], prio["pop"])
        if not fam:
            j += 1

    cues = ctx.get("cues") or []
    lists = [c for c in cues if c["kind"] == "list"]
    if len(lists) >= R["tickMinCount"]:
        for c in lists:
            add("tick", c["a0"] - min(R["tickLead"], c["gapBefore"]), prio["tick"])
    if meme_on:
        for c in cues:
            kind = c["kind"]
            if kind == "list":
                continue
            if kind == "scratch":
                if c["first"] and c["gapBefore"] >= M["pauseMin"]:
                    add("meme", c["a0"] - M["scratchLead"], prio["meme"], "scratch")
            elif c["gapAfter"] >= M["pauseMin"] and (kind != "bell" or c["a0"] >= total - M["bellLast"]):
                add("meme", c["a1"] + M["pauseLead"], prio["meme"], kind)

    # ——— отбор: важнее — раньше; интервалы, бюджет, тишина под хуком ———
    order = sorted(cands, key=lambda c: (-c["prio"], c["a"], c["i"]))
    budget = math.ceil(total / P["per"])
    meme_budget = min(M["max"], math.ceil(total / M["per"]))
    rs = R["riser"]
    chosen: list[dict] = []
    n_main = n_meme = n_hits = 0
    riser_at: float | None = None
    for c in order:
        a, kind = c["a"], c["kind"]
        if not fams.get(c["fam"]):
            continue
        if kind != "hook_in" and a < R["startGuard"]:
            continue
        if hook and kind not in HOOK and R["quiet"][0] <= a < R["quiet"][1]:
            continue
        if a + tail(c["fam"]) > total - R["endGuard"]:
            continue
        g = P["gap"].get(kind)
        if g is not None and any(x["kind"] == kind and abs(x["a"] - a) < g for x in chosen):
            continue
        if any(abs(x["a"] - a) < P["minGap"] for x in chosen):
            continue
        if riser_at is not None and riser_at - rs["clear"] <= a < riser_at:
            continue
        if kind == "hit" and n_hits >= P["hitsMax"]:
            continue
        if kind == "meme":
            if n_meme >= meme_budget:
                continue
            prev = nxt = None
            for x in chosen:
                if x["kind"] != "meme":
                    continue
                if x["a"] < a and (prev is None or x["a"] > prev["a"]):
                    prev = x
                if x["a"] > a and (nxt is None or x["a"] < nxt["a"]):
                    nxt = x
            if (prev and prev["fam"] == c["fam"]) or (nxt and nxt["fam"] == c["fam"]):
                continue
        elif kind not in HOOK and n_main >= budget:
            continue
        c = dict(c)
        if kind == "hit":
            n_hits += 1
            # Нарастание — один раз, перед самым сильным ударом, если перед ним тихо
            if (P["riser"] and riser_at is None and fams.get("riser") and a - rs["len"] >= rs["minStart"]
                    and not any(a - rs["clear"] <= x["a"] < a for x in chosen)):
                c["riser"] = True
                riser_at = a
        if kind == "meme":
            n_meme += 1
        elif kind not in HOOK:
            n_main += 1
        chosen.append(c)

    # ——— без «метронома»: четыре звука через равные промежутки — убираем один из средних ———
    seq = sorted((x for x in chosen if x["kind"] not in HOOK), key=lambda x: (x["a"], x["i"]))
    tol = R["periodicTol"]
    i = 0
    while i + 3 < len(seq):
        gaps = [seq[i + d + 1]["a"] - seq[i + d]["a"] for d in range(3)]
        m = (gaps[0] + gaps[1] + gaps[2]) / 3
        if m > 0 and all(abs(gp - m) <= tol * m for gp in gaps):
            del seq[i + 1 if seq[i + 1]["prio"] < seq[i + 2]["prio"] else i + 2]
        i += 1
    final = sorted([x for x in chosen if x["kind"] in HOOK] + seq, key=lambda x: (x["a"], x["i"]))

    # ——— сэмплы по кругу (без повторов подряд), лёгкий разброс высоты и громкости ———
    lo, hi = R["voiceClamp"]
    voice = ctx.get("voiceDb")
    voice_ref = min(max(float(voice if voice is not None else R["voiceDefault"]), lo), hi) + R["voiceRefOffset"]
    vol_db = (vol - 70) / 4
    seed = int(ctx.get("seed") or 0)
    counters: dict[str, int] = {}
    out: list[dict] = []

    def emit(a: float, fam: str, rel_key: str, duck: float):
        names = fams.get(fam) or []
        if not names:
            return
        n = len(names)
        k = counters.get(fam, 0)
        counters[fam] = k + 1
        name = names[(fnv1a(f"{seed}|{fam}") % n + k) % n]
        h = fnv1a(f"{seed}|{fam}|{k}")
        st, db = R["jitter"].get(fam, [0, 0])
        semis = (((h >> 8) % 1001) / 1000 * 2 - 1) * st
        jdb = (((h >> 18) % 1001) / 1000 * 2 - 1) * db
        rate = 2 ** (semis / 12)
        s = samples[name]
        gdb = voice_ref + P["rel"][rel_key] - s["refDb"] + jdb + duck + vol_db
        gain = min(10 ** (gdb / 20), R["maxGain"])
        out.append({"a": _r(a, 4), "t": _r(a - s["peak"] / rate, 4), "type": name, "fam": fam,
                    "gain": _r(gain, 5), "rate": _r(rate, 5)})

    for c in final:
        a, kind = c["a"], c["kind"]
        duck = R["duckDb"] if voiced(a) else 0
        if kind == "hit":
            if c.get("riser"):
                emit(a, "riser", "riser", R["duckDb"])
            emit(a, "zoomin", "zoomin", duck)
            emit(a, "hit", "hit", 0)
        elif kind == "hook_in":
            emit(a, "hit", "hook_in", 0)
        else:
            emit(a, c["fam"], kind, 0 if c["fam"] == "hit" else duck)
    out.sort(key=lambda e: (e["t"], e["a"]))
    return out
