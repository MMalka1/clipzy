"""Звуковые эффекты синтезом (numpy) — запасной набор, если в sfx/ нет файлов-сэмплов.

Каждый звук описан в SOUNDS: семейство (hit, zoomin, swish…), как его сделать и где у него пик
(сек от начала — в эту точку звук «попадает» в событие). Пик None — ищем по громкости (sfx_kit).
Имена с префиксом syn3_: поменяли синтез — меняем префикс, старые файлы из кэша не подхватятся.
"""

import numpy as np

SR = 44100
PEAK = 10 ** (-1 / 20)  # −1 dBFS


# ——— инструменты ———
def _t(dur: float) -> np.ndarray:
    return np.arange(int(SR * dur)) / SR


def _noise(n: int, seed: int) -> np.ndarray:
    return np.random.default_rng(seed).standard_normal(n)


def _pink(n: int, seed: int) -> np.ndarray:
    """Розовый шум (−3 дБ на октаву): мягче белого, «воздух» вместо шипения."""
    spec = np.fft.rfft(_noise(n, seed))
    f = np.fft.rfftfreq(n, 1 / SR)
    x = np.fft.irfft(spec / np.sqrt(np.maximum(f, 20)), n)
    return x / (x.std() + 1e-12)


def _svf(x: np.ndarray, fc, q, mode: str = "bp") -> np.ndarray:
    """Фильтр переменных состояний (TPT): частота и добротность могут меняться во времени.
    bp — полоса с единичным усилением на частоте среза, lp/hp — низкие/высокие."""
    n = len(x)
    f = np.clip(np.broadcast_to(np.asarray(fc, dtype=np.float64), (n,)), 20, SR * 0.45)
    k = 1 / np.broadcast_to(np.asarray(q, dtype=np.float64), (n,))
    g = np.tan(np.pi * f / SR)
    a1 = 1 / (1 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    xs, A1, A2, A3 = x.tolist(), a1.tolist(), a2.tolist(), a3.tolist()
    bp, lp = [0.0] * n, [0.0] * n
    ic1 = ic2 = 0.0
    for i in range(n):
        v3 = xs[i] - ic2
        v1 = A1[i] * ic1 + A2[i] * v3
        v2 = ic2 + A2[i] * ic1 + A3[i] * v3
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        bp[i] = v1
        lp[i] = v2
    b, low = np.array(bp), np.array(lp)
    if mode == "lp":
        return low
    if mode == "hp":
        return x - k * b - low
    return b * k


def _band(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Статичная полоса через БПФ — мягкие скаты, без звона."""
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    gain = 1 / (1 + (lo / np.maximum(f, 1)) ** 4) / (1 + (f / hi) ** 4)
    return np.fft.irfft(spec * gain, len(x))


def _osc(freq, dur: float, harmonics=((1, 1.0),)) -> np.ndarray:
    """Осциллятор с меняющейся частотой (фаза накопленная); harmonics — (номер, громкость)."""
    f = np.broadcast_to(np.asarray(freq, dtype=np.float64), (int(SR * dur),))
    ph = 2 * np.pi * np.cumsum(f) / SR
    return sum(a * np.sin(h * ph) for h, a in harmonics)


def _fade(x: np.ndarray, a: float = 0.002, r: float = 0.01) -> np.ndarray:
    n = len(x)
    ia, ir = min(int(SR * a), n // 2), min(int(SR * r), n // 2)
    env = np.ones(n)
    if ia:
        env[:ia] = np.linspace(0, 1, ia)
    if ir:
        env[n - ir :] = np.linspace(1, 0, ir)
    return x * (env if x.ndim == 1 else env[:, None])


def _stereo(mono: np.ndarray, pan=0.0, width: float = 0.0, seed: int = 0) -> np.ndarray:
    """pan −1..1 (может меняться во времени); width — лёгкая декорреляция каналов (объём)."""
    p = np.broadcast_to(np.asarray(pan, dtype=np.float64), mono.shape)
    left, right = mono * np.cos((p + 1) * np.pi / 4), mono * np.sin((p + 1) * np.pi / 4)
    if width:
        d = int(SR * 0.0006 * (1 + seed % 3))
        right = (1 - width) * right + width * np.concatenate([np.zeros(d), right[:-d]])
    return np.stack([left, right], axis=1) * np.sqrt(2)


def _norm(x: np.ndarray, peak: float = PEAK) -> np.ndarray:
    return x / (np.abs(x).max() + 1e-9) * peak


def _env_ad(x: np.ndarray, pk: float, rise: float, fall: float) -> np.ndarray:
    """Огибающая «разгон → спад»: x — позиция 0..1, pk — где вершина."""
    up = np.clip(x / pk, 0, 1) ** rise
    down = np.clip((1 - x) / (1 - pk), 0, 1) ** fall
    return np.where(x < pk, up, down)


# ——— удар ———
HIT = {  # саб: с какой частоты падает и куда, как быстро; тело: полоса и длина; щелчок; «стук» для телефонов
    1: dict(f0=150, f1=48, tf=0.035, ta=0.32, band=(90, 700), tb=0.05, click=0.3, knock=(210, 160, 0.06, 0.35)),
    2: dict(f0=185, f1=56, tf=0.024, ta=0.2, band=(150, 1500), tb=0.03, click=0.42, knock=(260, 190, 0.045, 0.4)),
    3: dict(f0=125, f1=42, tf=0.05, ta=0.45, band=(80, 520), tb=0.07, click=0.22, knock=(180, 140, 0.07, 0.3)),
}


def hit(v: int) -> np.ndarray:
    """Кинематографичный удар: саб с падающей высотой + плотное «тело» + щелчок атаки + «стук» 150–250 Гц,
    который слышно даже в динамике телефона; всё слегка перегружено для плотности."""
    p = HIT[v]
    dur = 1.0
    t = _t(dur)
    sub = _osc(p["f1"] + (p["f0"] - p["f1"]) * np.exp(-t / p["tf"]), dur) * np.exp(-t / p["ta"])
    body = _norm(_band(_noise(len(t), 30 + v), *p["band"]) * np.exp(-t / p["tb"]), 1)
    click = _norm(_band(_noise(len(t), 40 + v), 2000, 12000) * np.exp(-t / 0.003), 1)
    k0, k1, kt, ka = p["knock"]
    knock = _osc(k1 + (k0 - k1) * np.exp(-t / 0.02), dur, ((1, 1.0), (2, 0.25))) * np.exp(-t / kt)
    x = sub + body * 0.55 + click * p["click"] + knock * ka
    x = np.tanh(2.2 * x) / np.tanh(2.2)
    room = _norm(_band(_noise(len(t), 50 + v), 180, 2500) * np.exp(-t / 0.22), 1) * 0.05
    x = (x + room) * np.minimum(1, t / 0.0005)
    return _fade(_norm(x), 0.0, 0.08)


# ——— наезд: «вжух» нарастает и защёлкивается в момент приземления ———
ZOOM = {1: (0.30, 3800, 0.5), 2: (0.24, 4600, -0.5), 3: (0.38, 3200, 0.35)}  # подъём, верх полосы, откуда летит


def zoomin(v: int) -> np.ndarray:
    rise, top, side = ZOOM[v]
    after = 0.07
    dur = rise + after
    t = _t(dur)
    x = np.clip(t / rise, 0, 1)
    fc = 300 * (top / 300) ** (x**1.3)
    air = _svf(_pink(len(t), 60 + v), fc, 1.3 + 1.8 * x)
    tone = _osc(150 * (900 / 150) ** (x**1.6), dur, ((1, 1.0), (2, 0.3)))
    env = np.where(t < rise, x**2.4, np.exp(-(t - rise) / 0.012))
    body = (_norm(air, 1) + tone * 0.1) * env
    ts = np.clip(t - rise, 0, None)
    on = (t >= rise).astype(float)
    snap = (_norm(_band(_noise(len(t), 70 + v), 2500, 11000), 1) * np.exp(-ts / 0.0015) * 0.55
            + np.sin(2 * np.pi * 105 * ts) * np.exp(-ts / 0.025) * 0.35) * on
    mono = body + snap
    pan = side * (1 - x)
    return _fade(_norm(_stereo(mono, pan, width=0.35, seed=v)), 0.003, 0.012)


# ——— «вжух» на склейке: короткий хлёст ———
SWISH = {1: (0.26, 2800, 1), 2: (0.22, 3400, -1), 3: (0.30, 2400, 1)}


def swish(v: int) -> np.ndarray:
    dur, top, d = SWISH[v]
    t = _t(dur)
    x = t / dur
    pk = 0.55
    bump = np.exp(-(((x - pk) / 0.24) ** 2))
    fc = 500 + (top - 500) * bump + 500 * np.clip(x - pk, 0, 1)
    body = _norm(_svf(_pink(len(t), 80 + v), fc, 1.1), 1)
    hiss = _norm(_svf(_pink(len(t), 90 + v), 5000, 0.8, "hp"), 1) * 0.08
    env = _env_ad(x, pk, 2.0, 2.4)
    mono = (body + hiss * env) * env
    return _fade(_norm(_stereo(mono, d * (-0.6 + 1.2 * x), width=0.3, seed=v)), 0.003, 0.02)


# ——— пролёт: уход хука, длиннее и «шире» ———
WHOOSH = {1: (0.75, 1900, 1), 2: (0.62, 2400, -1)}


def whoosh(v: int) -> np.ndarray:
    dur, top, d = WHOOSH[v]
    t = _t(dur)
    x = t / dur
    pk = 0.5
    bump = np.exp(-(((x - pk) / 0.2) ** 2))
    breath = _norm(_svf(_pink(len(t), 100 + v), 280 + (top - 280) * bump, 0.9), 1)
    rumble = _norm(_svf(_pink(len(t), 110 + v), 120 + 380 * bump, 0.7, "lp"), 1) * 0.6
    env = _env_ad(x, pk, 2.5, 1.6)
    mono = (breath + rumble) * env
    return _fade(_norm(_stereo(mono, d * (-0.8 + 1.6 * x), width=0.45, seed=v)), 0.004, 0.04)


# ——— «поп»: пузырёк / щелчок щекой ———
POP = {1: (380, 1050, 0.012, 0.028), 2: (520, 1350, 0.010, 0.022), 3: (300, 820, 0.016, 0.035), 4: (1150, 450, 0.014, 0.03)}


def pop(v: int) -> np.ndarray:
    f0, f1, tp, ta = POP[v]
    dur = 0.14
    t = _t(dur)
    body = _osc(f1 + (f0 - f1) * np.exp(-t / tp), dur, ((1, 1.0), (2, 0.15)))
    body *= (1 - np.exp(-t / 0.0015)) * np.exp(-t / ta)
    click = _norm(_band(_noise(len(t), 120 + v), 2500, 7000), 1) * np.exp(-t / 0.0008) * 0.15
    return _fade(_norm(body + click), 0.0, 0.02)


# ——— тик для пунктов списка: деревянный щелчок ———
TICK = {1: 2200, 2: 2900, 3: 1700}


def tick(v: int) -> np.ndarray:
    f = TICK[v]
    dur = 0.08
    t = _t(dur)
    x = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.012)
         + 0.5 * np.sin(2 * np.pi * 2.6 * f * t) * np.exp(-t / 0.005)
         + 0.3 * np.sin(2 * np.pi * f / 2.3 * t) * np.exp(-t / 0.02)
         + _norm(_band(_noise(len(t), 130 + v), 3000, 8000), 1) * np.exp(-t / 0.001) * 0.3)
    return _fade(_norm(x * np.minimum(1, t / 0.0004)), 0.0, 0.01)


# ——— нарастание перед главным ударом: обрывается ровно на ударе ———
def riser() -> np.ndarray:
    dur = 1.2
    t = _t(dur)
    x = t / dur
    air = _norm(_svf(_pink(len(t), 140), 220 * (6000 / 220) ** (x**1.6), 2 + 4 * x), 1) * 0.7
    f = 110 * 2 ** (2.5 * x**1.5)
    saw = ((1, 1.0), (2, 0.5), (3, 0.33), (4, 0.25), (5, 0.2), (6, 0.16))
    tone = sum(_osc(f * d, dur, saw) for d in (0.995, 1.0, 1.006)) / 3
    trem = 1 + 0.3 * np.sin(2 * np.pi * np.cumsum(3 + 16 * x**2) / SR)
    mono = (air + _norm(tone, 1) * 0.35) * trem * x**2.2
    return _fade(_norm(_stereo(mono, 0.0, width=0.5, seed=2)), 0.02, 0.005)


# ——— мемные ———
def cash() -> np.ndarray:
    """Касса «ка-чинг»: щелчок механизма, два звонка и россыпь монет."""
    dur = 1.1
    t = _t(dur)
    out = np.zeros(len(t))
    for d0 in (0.0, 0.035):
        tt = np.clip(t - d0, 0, None)
        out += _norm(_band(_noise(len(t), 150 + int(d0 * 1000)), 1500, 6000), 1) * np.exp(-tt / 0.008) * (t >= d0) * 0.5
    for d0, f0, amp in ((0.07, 2093.0, 1.0), (0.095, 2637.0, 0.75)):
        tt = np.clip(t - d0, 0, None)
        bell = sum(a * np.sin(2 * np.pi * f0 * r * tt) * np.exp(-dd * tt) for r, a, dd in ((1, 1, 3.0), (2.76, 0.4, 6), (5.4, 0.18, 10)))
        out += bell * (t >= d0) * amp * 0.5
    rng = np.random.default_rng(152)
    for _ in range(8):
        d0 = rng.uniform(0.14, 0.55)
        tt = np.clip(t - d0, 0, None)
        out += np.sin(2 * np.pi * rng.uniform(4200, 6800) * tt) * np.exp(-tt / 0.025) * (t >= d0) * rng.uniform(0.06, 0.14)
    return _fade(_norm(_stereo(out, 0.0, width=0.4, seed=5)), 0.0005, 0.15)


def fail() -> np.ndarray:
    """«Неверно»: два нисходящих гудка, тёплый тембр."""
    parts = []
    for f0, dur in ((330.0, 0.16), (247.0, 0.28)):
        t = _t(dur)
        vib = 1 + 0.012 * np.sin(2 * np.pi * 7 * t)
        tone = sum(np.sin(2 * np.pi * np.cumsum(f0 * k * vib) / SR) / k for k in (1, 3, 5, 7, 9))
        parts += [tone * np.minimum(1, t / 0.008) * np.exp(-t / (dur * 0.9)), np.zeros(int(SR * 0.035))]
    mono = _band(np.concatenate(parts), 120, 2600)
    return _fade(_norm(_stereo(mono, 0.0, width=0.15, seed=6)), 0.001, 0.025)


def sparkle() -> np.ndarray:
    """Блеск: быстрый восходящий перелив и шелест."""
    dur = 0.9
    t = _t(dur)
    notes = [1568, 1760, 2093, 2349, 2637, 3136, 3520, 4186]
    out = np.zeros(len(t))
    for i, f in enumerate(notes):
        d0 = i * 0.04
        tt = np.clip(t - d0, 0, None)
        out += np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.2) * (t >= d0) * (1 - i * 0.06)
    shimmer = _norm(_band(_noise(len(t), 161), 7000, 14000), 1) * np.exp(-np.abs(t - 0.22) / 0.18) * 0.2
    mono = _norm(out, 1) + shimmer
    return _fade(_norm(_stereo(mono, -0.3 + 0.6 * t / dur, width=0.5, seed=7)), 0.001, 0.2)


def scratch() -> np.ndarray:
    """Скретч пластинки: запись дёргают вперёд-назад."""
    dur = 0.42
    t = _t(dur)
    base_len = int(SR * 0.6)
    tb = np.arange(base_len) / SR
    record = sum(np.sin(2 * np.pi * f * tb) for f in (220, 277, 330, 440)) * 0.3 + _noise(base_len, 171) * 0.25
    pos = 0.15 + 0.09 * np.sin(2 * np.pi * 4.8 * t) * np.exp(-t / 0.5) + 0.12 * t
    idx = np.clip(pos * SR, 0, base_len - 2)
    i0 = idx.astype(int)
    frac = idx - i0
    y = record[i0] * (1 - frac) + record[i0 + 1] * frac
    speed = np.abs(np.gradient(pos) * SR)
    mono = _band(y * np.clip(speed / (speed.max() + 1e-9), 0.05, 1) ** 0.6, 250, 5000)
    return _fade(_norm(_stereo(mono, 0.0, width=0.2, seed=8)), 0.001, 0.03)


def bell() -> np.ndarray:
    """Уведомление «дин-дон» на призыве подписаться: две мягкие ноты."""
    dur = 0.9
    t = _t(dur)
    out = np.zeros(len(t))
    for d0, f0 in ((0.0, 1568.0), (0.11, 2093.0)):
        tt = np.clip(t - d0, 0, None)
        out += sum(a * np.sin(2 * np.pi * f0 * r * tt) * np.exp(-dd * tt) for r, a, dd in ((1, 1, 4.5), (2.0, 0.2, 9), (3.01, 0.08, 14))) \
            * np.minimum(1, tt / 0.002) * (t >= d0)
    return _fade(_norm(_stereo(out, 0.1, width=0.3, seed=9)), 0.0, 0.15)


# имя → семейство, синтез, пик (сек от начала; None — найти по громкости)
SOUNDS: dict[str, dict] = {
    **{f"syn3_hit_{v}": {"fam": "hit", "make": (lambda v=v: hit(v)), "peak": None} for v in HIT},
    **{f"syn3_zoom_{v}": {"fam": "zoomin", "make": (lambda v=v: zoomin(v)), "peak": ZOOM[v][0]} for v in ZOOM},
    **{f"syn3_swish_{v}": {"fam": "swish", "make": (lambda v=v: swish(v)), "peak": SWISH[v][0] * 0.55} for v in SWISH},
    **{f"syn3_whoosh_{v}": {"fam": "whoosh", "make": (lambda v=v: whoosh(v)), "peak": WHOOSH[v][0] * 0.5} for v in WHOOSH},
    **{f"syn3_pop_{v}": {"fam": "pop", "make": (lambda v=v: pop(v)), "peak": None} for v in POP},
    **{f"syn3_tick_{v}": {"fam": "tick", "make": (lambda v=v: tick(v)), "peak": None} for v in TICK},
    "syn3_riser_1": {"fam": "riser", "make": riser, "peak": 1.2},
    "syn3_cash_1": {"fam": "cash", "make": cash, "peak": 0.075},
    "syn3_fail_1": {"fam": "fail", "make": fail, "peak": 0.01},
    "syn3_sparkle_1": {"fam": "sparkle", "make": sparkle, "peak": 0.1},
    "syn3_scratch_1": {"fam": "scratch", "make": scratch, "peak": None},
    "syn3_bell_1": {"fam": "bell", "make": bell, "peak": 0.004},
}
