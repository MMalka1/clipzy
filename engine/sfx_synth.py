"""Звуковые эффекты для рилсов — синтез кодом (numpy), без чужих сэмплов и лицензий.

Каждый звук описан в SOUNDS: как его сделать, где у него пик (сек от начала — в эту точку
звук «попадает» в событие), громкость в миксе и категория (переключатель в редакторе).
Имена с префиксом sfx2_: при изменении синтеза старые файлы из кэша не подхватятся.
"""

import numpy as np

SR = 44100


# ——— инструменты ———
def _t(dur: float) -> np.ndarray:
    return np.arange(int(SR * dur)) / SR


def _noise(n: int, seed: int) -> np.ndarray:
    return np.random.default_rng(seed).standard_normal(n)


def _sweep_lp(x: np.ndarray, cutoff: np.ndarray) -> np.ndarray:
    """Однополюсный ФНЧ с меняющейся частотой среза (для «пролётов»)."""
    a = 1 - np.exp(-2 * np.pi * np.clip(cutoff, 20, SR / 2.2) / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def _band(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Полосовой фильтр через БПФ (для статичных полос — быстро и без фазовых сюрпризов)."""
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    # мягкие скаты, чтобы не звенело
    gain = 1 / (1 + (lo / np.maximum(f, 1)) ** 4) / (1 + (f / hi) ** 4)
    return np.fft.irfft(spec * gain, len(x))


def _osc(freq: np.ndarray | float, dur: float) -> np.ndarray:
    """Синус с меняющейся частотой (фаза — накопленная)."""
    f = np.broadcast_to(np.asarray(freq, dtype=np.float64), (int(SR * dur),))
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def _fade(x: np.ndarray, a: float = 0.002, r: float = 0.01) -> np.ndarray:
    n = len(x)
    ia, ir = min(int(SR * a), n // 2), min(int(SR * r), n // 2)
    env = np.ones(n)
    if ia:
        env[:ia] = np.linspace(0, 1, ia)
    if ir:
        env[n - ir :] = np.linspace(1, 0, ir)
    return x * (env if x.ndim == 1 else env[:, None])


def _stereo(mono: np.ndarray, pan: np.ndarray | float = 0.0, width: float = 0.0, seed: int = 0) -> np.ndarray:
    """pan -1..1 (может меняться во времени); width — лёгкая декорреляция каналов."""
    p = np.broadcast_to(np.asarray(pan, dtype=np.float64), mono.shape)
    left, right = mono * np.cos((p + 1) * np.pi / 4), mono * np.sin((p + 1) * np.pi / 4)
    if width:
        d = int(SR * 0.0007 * (1 + seed % 3))
        right = (1 - width) * right + width * np.concatenate([np.zeros(d), right[:-d]])
    return np.stack([left, right], axis=1) * np.sqrt(2)


def _norm(x: np.ndarray, peak: float = 0.85) -> np.ndarray:
    return x / (np.abs(x).max() + 1e-9) * peak


# ——— звуки ———
def whoosh(variant: int) -> np.ndarray:
    """Пролёт: шум в полосе, которая раскрывается к пику и закрывается; снизу — «воздух». Пик ≈ 0.26 с."""
    dur, peak = (0.52, 0.26) if variant != 3 else (0.44, 0.26)
    t = _t(dur)
    x = t / dur
    pk = peak / dur
    # асимметричная огибающая: плавный разгон, быстрее спад
    env = np.where(x < pk, (x / pk) ** 2.2, np.exp(-((x - pk) / (1 - pk)) * 3.2) * (1 - (x - pk) / (1 - pk)) ** 0.5)
    top = {1: 6500, 2: 5200, 3: 8000}[variant]
    cutoff = 350 + top * np.exp(-((x - pk) / 0.22) ** 2)
    n = _noise(len(t), 11 + variant)
    # два прохода ФНЧ — скат круче, «воздух» вместо шипения
    body = _sweep_lp(_sweep_lp(n, cutoff), cutoff) - _sweep_lp(_sweep_lp(n, cutoff * 0.18), cutoff * 0.18)
    air = _osc(140 * np.exp(-1.2 * x) + 40, dur) * 0.25  # низкое «ффф» даёт вес
    mono = _norm(body) + air * env.max()
    mono *= env
    pan = {1: -0.7 + 1.4 * x, 2: 0.7 - 1.4 * x, 3: 0.35 * np.sin(np.pi * x)}[variant]
    return _fade(_norm(_stereo(mono, pan, width=0.3, seed=variant)), 0.004, 0.03)


def riser() -> np.ndarray:
    """Нарастание перед главной фразой: шум + аккорд, частота и громкость ползут вверх, обрыв в конце. Пик = конец."""
    dur = 1.1
    t = _t(dur)
    x = t / dur
    n = _noise(len(t), 21)
    noise = _sweep_lp(n, 300 + 9000 * x**2.2) - _sweep_lp(n, 150 + 2500 * x**2)
    f0 = 180 * 2 ** (2.6 * x**1.6)  # ~2.6 октавы вверх
    tone = sum(a * _osc(f0 * r, dur) for r, a in ((1, 0.5), (1.5, 0.3), (2.0, 0.25), (3.01, 0.12)))
    trem = 1 + 0.25 * np.sin(2 * np.pi * (4 + 14 * x**2) * t)  # «дрожь» ускоряется
    mono = (_norm(noise) * 0.7 + _norm(tone) * 0.5) * trem * x**2.6
    out = _stereo(mono, 0.0, width=0.5, seed=2)
    return _fade(_norm(out), 0.01, 0.012)


def impact() -> np.ndarray:
    """Удар: саб с падающей высотой + щелчок атаки + короткий «хлопок». Пик ≈ 0.01 с."""
    dur = 1.3
    t = _t(dur)
    sub = _osc(42 + 110 * np.exp(-t / 0.045), dur) * np.exp(-t / 0.42)
    click = _band(_noise(len(t), 31), 1500, 9000) * np.exp(-t / 0.006)
    thump = _band(_noise(len(t), 32), 60, 900) * np.exp(-t / 0.08)
    tail = _band(_noise(len(t), 33), 200, 3000) * np.exp(-t / 0.35) * 0.12  # «хвост» зала
    mono = np.tanh(1.8 * (sub * 1.0 + _norm(click) * 0.35 + _norm(thump) * 0.45)) + _norm(tail) * 0.15
    return _fade(_norm(_stereo(mono, 0.0, width=0.25, seed=3)), 0.0005, 0.05)


def ding() -> np.ndarray:
    """Колокольчик на важном слове (как раньше, чуть мягче атака). Пик ≈ 0.003 с."""
    t = _t(1.3)
    f0 = 1318.5  # E6
    partials = [(1.0, 1.0, 2.2), (2.76, 0.45, 3.5), (5.40, 0.22, 5.0), (8.93, 0.1, 7.0)]
    x = sum(a * np.sin(2 * np.pi * f0 * r * t) * np.exp(-d * t) for r, a, d in partials)
    x *= np.minimum(1, t / 0.003)
    return _fade(_norm(_stereo(x, 0.1, width=0.2, seed=4)), 0.0, 0.05)


def pop(variant: int) -> np.ndarray:
    """«Поп» для пунктов списка: пузырёк — высота быстро падает. Пик ≈ 0.005 с."""
    dur = 0.16
    t = _t(dur)
    hi, lo = (1300, 380) if variant == 1 else (950, 280)
    body = _osc(lo + (hi - lo) * np.exp(-t / 0.018), dur) * np.exp(-t / 0.035)
    click = _band(_noise(len(t), 40 + variant), 2000, 8000) * np.exp(-t / 0.002) * 0.3
    return _fade(_norm(_stereo(body + click, 0.15 * (1 if variant == 1 else -1), width=0.1)), 0.0005, 0.02)


def cash() -> np.ndarray:
    """Касса («ка-чинг») на словах про деньги: щелчок механизма, два звонка и россыпь монет. Пик ≈ 0.09 с."""
    dur = 1.4
    t = _t(dur)
    ka = _band(_noise(len(t), 51), 2500, 7000) * np.exp(-t / 0.012)
    out = _norm(ka) * 0.5
    for delay, f0, amp in ((0.065, 2637.0, 1.0), (0.085, 3520.0, 0.7)):  # E7 и A7
        tt = np.clip(t - delay, 0, None)
        on = (t >= delay).astype(float)
        bell = sum(a * np.sin(2 * np.pi * f0 * r * tt) * np.exp(-d * tt) for r, a, d in ((1, 1, 2.5), (2.4, 0.35, 5), (4.1, 0.15, 8)))
        out = out + bell * on * amp * 0.6
    rng = np.random.default_rng(52)
    for _ in range(9):  # монетки
        d0 = rng.uniform(0.12, 0.6)
        f = rng.uniform(4200, 6800)
        tt = np.clip(t - d0, 0, None)
        out = out + np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.03) * (t >= d0) * rng.uniform(0.08, 0.18)
    return _fade(_norm(_stereo(out, 0.0, width=0.4, seed=5)), 0.0005, 0.05)


def buzzer() -> np.ndarray:
    """«Неверно» на словах про ошибки: два нисходящих гудка, тёплый тембр (не будильник). Пик = начало первого гудка."""
    parts = []
    for f0, dur in ((330.0, 0.17), (247.0, 0.26)):
        t = _t(dur)
        vib = 1 + 0.012 * np.sin(2 * np.pi * 7 * t)
        tone = sum(np.sin(2 * np.pi * np.cumsum(f0 * k * vib) / SR) / k for k in (1, 3, 5, 7, 9))  # «квадрат» без звона
        env = np.minimum(1, t / 0.008) * np.exp(-t / (dur * 0.9))
        parts += [tone * env, np.zeros(int(SR * 0.035))]
    mono = _band(np.concatenate(parts), 120, 2600)
    return _fade(_norm(_stereo(mono, 0.0, width=0.15, seed=6)), 0.001, 0.02)


def sparkle() -> np.ndarray:
    """Блеск на «секрете» и «лайфхаке»: быстрый восходящий перелив + шелест. Пик ≈ 0.12 с."""
    dur = 1.0
    t = _t(dur)
    notes = [1568, 1760, 2093, 2349, 2637, 3136, 3520, 4186]  # G6-пентатоника вверх
    out = np.zeros(len(t))
    pan = np.zeros(len(t))
    for i, f in enumerate(notes):
        d0 = i * 0.045
        tt = np.clip(t - d0, 0, None)
        out += np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.22) * (t >= d0) * (1 - i * 0.06)
        pan += np.where(t >= d0, (i / 7 - 0.5) * 0.02, 0)
    shimmer = _band(_noise(len(t), 61), 7000, 14000) * np.exp(-np.abs(t - 0.25) / 0.2) * 0.12
    mono = _norm(out) + _norm(shimmer) * 0.25
    return _fade(_norm(_stereo(mono, np.clip(np.cumsum(pan) / SR * 40 - 0.3, -0.6, 0.6), width=0.5, seed=7)), 0.001, 0.08)


def scratch() -> np.ndarray:
    """Скретч пластинки на «но» / «стоп» в начале фразы: запись дёргают вперёд-назад. Пик ≈ 0.01 с."""
    dur = 0.42
    t = _t(dur)
    base_len = int(SR * 0.6)
    tb = np.arange(base_len) / SR
    # «пластинка»: немного музыки (аккорд) + шум иглы
    record = sum(np.sin(2 * np.pi * f * tb) for f in (220, 277, 330, 440)) * 0.3 + _noise(base_len, 71) * 0.25
    # позиция иглы: два быстрых рывка (вперёд-назад), скорость = производная
    pos = 0.15 + 0.09 * np.sin(2 * np.pi * 4.8 * t) * np.exp(-t / 0.5) + 0.12 * t
    idx = np.clip(pos * SR, 0, base_len - 2)
    i0 = idx.astype(int)
    frac = idx - i0
    y = record[i0] * (1 - frac) + record[i0 + 1] * frac
    speed = np.abs(np.gradient(pos) * SR)
    mono = _band(y * np.clip(speed / (speed.max() + 1e-9), 0.05, 1) ** 0.6, 250, 5000)
    return _fade(_norm(_stereo(mono, 0.0, width=0.2, seed=8)), 0.001, 0.03)


# id → синтез, пик (с от начала), громкость в миксе, категория
SOUNDS: dict[str, dict] = {
    "sfx2_whoosh_1": {"make": lambda: whoosh(1), "peak": 0.26, "gain": 0.5, "cat": "transition"},
    "sfx2_whoosh_2": {"make": lambda: whoosh(2), "peak": 0.26, "gain": 0.5, "cat": "transition"},
    "sfx2_whoosh_3": {"make": lambda: whoosh(3), "peak": 0.26, "gain": 0.5, "cat": "transition"},
    "sfx2_riser": {"make": riser, "peak": 1.1, "gain": 0.3, "cat": "accent"},
    "sfx2_impact": {"make": impact, "peak": 0.013, "gain": 0.42, "cat": "accent"},
    "sfx2_ding": {"make": ding, "peak": 0.003, "gain": 0.35, "cat": "accent"},
    "sfx2_pop_1": {"make": lambda: pop(1), "peak": 0.005, "gain": 0.45, "cat": "meaning"},
    "sfx2_pop_2": {"make": lambda: pop(2), "peak": 0.005, "gain": 0.45, "cat": "meaning"},
    "sfx2_cash": {"make": cash, "peak": 0.09, "gain": 0.32, "cat": "meaning"},
    "sfx2_buzzer": {"make": buzzer, "peak": 0.02, "gain": 0.17, "cat": "meaning"},
    "sfx2_sparkle": {"make": sparkle, "peak": 0.12, "gain": 0.3, "cat": "meaning"},
    "sfx2_scratch": {"make": scratch, "peak": 0.01, "gain": 0.38, "cat": "meaning"},
}
