"""Слежение за лицом по ходу видео и «виртуальный оператор» для кадра 9:16.

1. Лицо ищется нейросетью YuNet 5 раз в секунду по всему ролику (кадры уменьшенные, декодирует FFmpeg).
2. Если людей несколько — держимся за того же человека, а не прыгаем на соседа.
3. «Ленивая камера»: пока лицо в мёртвой зоне около центра, кадр стоит; вышло — плавно догоняем.
4. Резкий перескок лица (монтажная склейка в исходнике) — кадр перескакивает сразу, без проезда.
5. Путь сглаживается без запаздывания (видео уже целиком известно) и упрощается до опорных точек.
6. Если в кадре двое и больше (подкаст), камера режет на того, кто говорит: говорящего видно по губам.

Результат — точки [время исходника, p], где p — положение кадра 0..1 (как object-position на сайте).
"""

import os
import subprocess

import cv2
import numpy as np
from paths import HERE, HOME

# Модель лежит рядом с кодом (models/). На Windows сначала — копия в папке данных:
# OpenCV не открывает пути с кириллицей, а папка проекта может называться по-русски
_MODEL_NAME = "face_detection_yunet_2023mar.onnx"
MODEL = next((p for p in (os.path.join(HOME, _MODEL_NAME), os.path.join(HERE, "models", _MODEL_NAME)) if os.path.exists(p)),
             os.path.join(HERE, "models", _MODEL_NAME))
FPS = 5
SMALL_W = 480


BIG_W = 1280  # из этого кадра вырезаем рот: на уменьшенном он слишком мелкий
MOUTH = (24, 16)


def _mouth_patch(big: np.ndarray, f, k: float) -> np.ndarray | None:
    """Рот по двум уголкам (ориентиры YuNet), выровненный и нормированный — чтобы сравнивать кадры между собой."""
    (x1, y1), (x2, y2) = (f[10] * k, f[11] * k), (f[12] * k, f[13] * k)
    mw = float(np.hypot(x2 - x1, y2 - y1))
    if mw < 6:
        return None
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    a, b = int(cx - mw * 0.8), int(cx + mw * 0.8)
    c, d = int(cy - mw * 0.45), int(cy + mw * 0.75)  # ниже уголков — нижняя губа и подбородок
    hh, ww = big.shape[:2]
    if a < 0 or c < 0 or b > ww or d > hh or b - a < 4 or d - c < 4:
        return None
    g = cv2.cvtColor(big[c:d, a:b], cv2.COLOR_BGR2GRAY)
    g = cv2.resize(g, MOUTH, interpolation=cv2.INTER_AREA).astype(np.float32)
    return (g - g.mean()) / (g.std() + 1e-3)


def detect_faces(video_path: str, meta: dict, ffmpeg: str, on_progress=lambda p: None) -> list[list[list[float]]]:
    """Все лица в каждом сэмпле: [cx, cy, size, score, motion] (доли кадра).
    motion — насколько изменился рот с прошлого сэмпла: у говорящего губы двигаются, у слушающего — нет (-1 — не видно)."""
    if not os.path.exists(MODEL):
        return []
    sw, sh = meta["width"], meta["height"]
    bw = min(BIG_W, sw) // 2 * 2
    bh = max(2, int(round(bw * sh / sw / 2)) * 2)
    h = max(2, int(round(SMALL_W * sh / sw / 2)) * 2)
    k = bw / SMALL_W
    det = cv2.FaceDetectorYN.create(MODEL, "", (SMALL_W, h), score_threshold=0.6, nms_threshold=0.3, top_k=20)
    proc = subprocess.Popen(
        [ffmpeg, "-v", "error", "-i", video_path, "-an", "-vf", f"fps={FPS},scale={bw}:{bh}",
         "-f", "rawvideo", "-pix_fmt", "bgr24", "-"],
        stdout=subprocess.PIPE,
    )
    frame_bytes = bw * bh * 3
    total = max(1, int(meta["duration"] * FPS))
    frames: list[list[list[float]]] = []
    prev: list[tuple[float, np.ndarray]] = []  # (cx, рот) из прошлого сэмпла
    i = 0
    while True:
        buf = proc.stdout.read(frame_bytes)  # type: ignore[union-attr]
        if len(buf) < frame_bytes:
            break
        big = np.frombuffer(buf, np.uint8).reshape(bh, bw, 3)
        _, faces = det.detect(cv2.resize(big, (SMALL_W, h), interpolation=cv2.INTER_AREA))
        cur, cur_mouths = [], []
        for f in faces if faces is not None else []:
            x, y, w, fh, score = f[0], f[1], f[2], f[3], f[14]
            cx = float((x + w / 2) / SMALL_W)
            mouth = _mouth_patch(big, f, k)
            motion = -1.0
            if mouth is not None:
                near = [m for px, m in prev if abs(px - cx) < 0.05]
                if near:
                    motion = float(np.abs(mouth - near[0]).mean())
                cur_mouths.append((cx, mouth))
            cur.append([cx, float((y + fh / 2) / h), float(w / SMALL_W), float(score), motion])
        frames.append(cur)
        prev = cur_mouths
        i += 1
        if i % 25 == 0:
            on_progress(min(i / total, 1.0))
    proc.wait()
    return frames


def pick_track(frames: list[list[list[float]]]) -> list[list[float] | None]:
    """Одно лицо на сэмпл для «ленивой камеры»: [t, x, y, size] или None."""
    samples: list[list[float] | None] = []
    prev = None
    for i, faces in enumerate(frames):
        pick, best = None, -1e9
        for cx, cy, size, score, _ in faces:
            value = score * (0.5 + size * 4)  # крупнее и увереннее — лучше
            if prev is not None:  # тот же человек, что и секунду назад, важнее
                value -= abs(cx - prev[1]) * 3
            if value > best:
                best, pick = value, [i / FPS, cx, cy, size]
        samples.append(pick)
        if pick:
            prev = pick
    return samples


def detect_track(video_path: str, meta: dict, ffmpeg: str, on_progress=lambda p: None) -> list[list[float] | None]:
    """Для каждого сэмпла: [t, x, y, size] (доли кадра) или None, если лица нет."""
    return pick_track(detect_faces(video_path, meta, ffmpeg, on_progress))


def _people(frames: list[list[list[float]]]) -> list[dict]:
    """Постоянные участники: лица, которые стоят на своём месте большую часть видео."""
    pts = sorted((f[0], f[1], f[2]) for fr in frames for f in fr)
    if not pts:
        return []
    groups, cur = [], [pts[0]]
    for q in pts[1:]:
        if q[0] - cur[-1][0] > 0.06:
            groups.append(cur)
            cur = []
        cur.append(q)
    groups.append(cur)
    people = []
    for g in groups:
        if len(g) < 0.25 * len(frames):  # мелькнул — не участник
            continue
        arr = np.array(g)
        people.append({"x": float(np.median(arr[:, 0])), "y": float(np.median(arr[:, 1])),
                       "size": float(np.median(arr[:, 2]))})
    return sorted(people, key=lambda p: p["x"])


def panel_rect(person: dict, sw: int, sh: int, aspect: float) -> dict:
    """Окно исходника вокруг участника под окно «экрана пополам» с пропорцией aspect (ширина/высота).
    Лицо по центру — над головой остаётся место для хука. Доли кадра. Та же формула — panelRect() в Editor.tsx."""
    cw = min(max(person["size"] * sw * 3.4, sw * 0.28), sw, sh * aspect)
    ch = cw / aspect
    x0 = min(max(person["x"] * sw - cw / 2, 0), sw - cw)
    y0 = min(max(person["y"] * sh - ch * 0.52, 0), sh - ch)
    return {"x": round(x0 / sw, 4), "y": round(y0 / sh, 4), "w": round(cw / sw, 4), "h": round(ch / sh, 4)}


def _panel(person: dict, sw: int, sh: int) -> dict:
    """Окно под половину вертикального кадра 1080×960 (9:8)."""
    return panel_rect(person, sw, sh, 9 / 8)


def track_frac(sw: int, sh: int) -> float:
    """Ширина окна (доля кадра), под которую посчитан путь камеры: вертикальный рилс 9:16."""
    return sh * 9 / 16 / sw if sw / sh > 9 / 16 else 1.0


def retarget(p: float, frac0: float, frac1: float) -> float:
    """Положение окна p (0..1), посчитанное для окна ширины frac0, — для окна ширины frac1 с тем же центром.
    Нужно, когда формат (или «показать больше») делает окно шире, чем при анализе. Та же формула — retarget() в Editor.tsx."""
    lo0, lo1 = frac0 / 2, frac1 / 2
    if 1 - 2 * lo1 <= 1e-6:
        return 0.5
    center = lo0 + p * (1 - 2 * lo0)
    return min(max((center - lo1) / (1 - 2 * lo1), 0.0), 1.0)


def _windows(words: list[dict], duration: float) -> list[tuple[float, float]]:
    """Фразы из расшифровки (пауза > 0.5 с — новая фраза), а без речи — куски по 1.6 с."""
    if not words:
        return [(float(t), float(t) + 1.6) for t in np.arange(0, duration, 1.6)]
    out, a = [], words[0]["start"]
    for w0, w1 in zip(words, words[1:]):
        if w1["start"] - w0["end"] > 0.5:
            out.append((a, w0["end"]))
            a = w1["start"]
    out.append((a, words[-1]["end"]))
    return out


def speaker_path(frames: list, words: list[dict], meta: dict, crop_frac: float) -> dict | None:
    """«Камера за говорящим» для видео, где двое и больше людей.
    Кто говорит — по движению губ во время каждой фразы; камера режет на него склейкой, как на монтаже подкаста.
    None — участник один. points=None — все влезают в один кадр 9:16, оператор не нужен (но «экран пополам» доступен)."""
    people = _people(frames)
    if len(people) < 2:
        return None
    sw, sh = meta["width"], meta["height"]
    for p in people:
        p["panel"] = _panel(p, sw, sh)
    if crop_frac >= 0.999 or people[-1]["x"] - people[0]["x"] < crop_frac * 0.75:
        return {"points": None, "speakers": people}

    n = len(frames)
    motion = np.full((len(people), n), np.nan)
    for i, fr in enumerate(frames):
        for cx, _, _, _, m in fr:
            if m < 0:
                continue
            j = int(np.argmin([abs(cx - p["x"]) for p in people]))
            if abs(cx - people[j]["x"]) < 0.06:
                motion[j, i] = m
    # У каждого свой «фон»: мелкое лицо, шум, привычка двигать губами — сравниваем с собственной медианой
    for j in range(len(people)):
        if np.isfinite(motion[j]).any():
            med = float(np.nanmedian(motion[j]))
            if med > 0:
                motion[j] /= med

    shots: list[list] = []  # [начало, кто]
    for a, b in _windows(words, n / FPS):
        i0 = int(a * FPS)
        i1 = max(i0 + 1, int(np.ceil(b * FPS)))
        score = np.array([np.nanmean(r) if np.isfinite(r).any() else -1.0 for r in motion[:, i0:i1]])
        order = np.argsort(score)[::-1]
        if score[order[0]] <= 0 or score[order[0]] < score[order[1]] * 1.15:
            continue  # неясно, кто говорит, — не дёргаем камеру
        who = int(order[0])
        if not shots or shots[-1][1] != who:
            shots.append([max(0.0, a - 0.12), who])
    if not shots:
        return {"points": None, "speakers": people}
    shots[0][0] = 0.0
    # Короткие планы (реплика «угу») не показываем — остаёмся на предыдущем
    merged: list[list] = []
    for k, (t, who) in enumerate(shots):
        nxt = shots[k + 1][0] if k + 1 < len(shots) else n / FPS
        if merged and (nxt - t < 1.4 or merged[-1][1] == who):
            continue
        merged.append([t, who])

    lo, hi = crop_frac / 2, 1 - crop_frac / 2
    pos = [(min(max(p["x"], lo), hi) - lo) / ((hi - lo) or 1) for p in people]
    points: list[list[float]] = []
    for t, who in merged:
        if points:
            points.append([round(t - 0.001, 3), points[-1][1]])
        points.append([round(t, 3), round(pos[who], 4)])
    return {
        "points": points,
        "fy": round(float(np.median([p["y"] for p in people])), 4),
        "speakers": people,
        "shots": [[round(t, 2), w] for t, w in merged],
        "mode": "speaker",
    }


def _median(xs: np.ndarray, k: int = 5) -> np.ndarray:
    pad = k // 2
    padded = np.pad(xs, pad, mode="edge")
    return np.array([np.median(padded[i : i + k]) for i in range(len(xs))])


def _smooth(xs: np.ndarray, sigma: float) -> np.ndarray:
    """Гауссово сглаживание без сдвига во времени."""
    if len(xs) < 3:
        return xs
    r = int(sigma * 3)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    padded = np.pad(xs, r, mode="edge")
    return np.convolve(padded, k, mode="valid")


def _simplify(points: list[tuple[float, float]], tol: float) -> list[tuple[float, float]]:
    """Рамер — Дуглас — Пекер: убираем точки, без которых путь почти не меняется."""
    if len(points) < 3:
        return points
    (t0, p0), (t1, p1) = points[0], points[-1]
    worst, idx = 0.0, 0
    for k in range(1, len(points) - 1):
        t, p = points[k]
        expected = p0 + (p1 - p0) * (t - t0) / ((t1 - t0) or 1)
        if abs(p - expected) > worst:
            worst, idx = abs(p - expected), k
    if worst <= tol:
        return [points[0], points[-1]]
    return _simplify(points[: idx + 1], tol)[:-1] + _simplify(points[idx:], tol)


def camera_path(samples: list, crop_frac: float) -> dict | None:
    """Путь кадра: {"points": [[t, p]...], "fy": высота лица}. None — лиц нет."""
    found = [s for s in samples if s]
    if not found or len(found) < max(3, len(samples) * 0.08):
        return None
    fy = float(np.median([s[2] for s in found]))
    if crop_frac >= 0.999:  # вертикальное видео — ехать некуда
        return {"points": [[0.0, 0.5]], "fy": round(fy, 4)}

    # Пропуски: держим последнее известное положение (камера не дёргается, пока лицо потерялось)
    xs = np.empty(len(samples))
    last = found[0][1]
    for k, s in enumerate(samples):
        if s:
            last = s[1]
        xs[k] = last
    xs = _median(xs, 5)

    # Резкий перескок (склейка в исходнике) — новый отрезок пути
    cuts = [0] + [k for k in range(1, len(xs)) if abs(xs[k] - xs[k - 1]) > 0.2] + [len(xs)]
    dz = 0.18 * crop_frac  # мёртвая зона: лицо может гулять ±18% ширины кадра
    path = np.empty(len(xs))
    for a, b in zip(cuts, cuts[1:]):
        c = xs[a]
        seg = np.empty(b - a)
        for k in range(a, b):
            if xs[k] > c + dz:
                c = xs[k] - dz
            elif xs[k] < c - dz:
                c = xs[k] + dz
            seg[k - a] = c
        path[a:b] = _smooth(seg, sigma=FPS * 0.6)

    lo, hi = crop_frac / 2, 1 - crop_frac / 2
    p = (np.clip(path, lo, hi) - lo) / ((hi - lo) or 1)

    points: list[list[float]] = []
    for a, b in zip(cuts, cuts[1:]):
        seg = [(k / FPS, float(p[k])) for k in range(a, b)]
        simple = _simplify(seg, tol=0.004)
        if points and simple:  # склейка: мгновенный перескок
            points.append([round(simple[0][0] - 0.001, 3), points[-1][1]])
        points += [[round(t, 3), round(v, 4)] for t, v in simple]
    tol = 0.004
    while len(points) > 400:  # для выражения FFmpeg держим разумное число точек
        tol *= 2
        points = [[round(t, 3), round(v, 4)] for t, v in _simplify([tuple(x) for x in points], tol)]
    return {"points": points, "fy": round(fy, 4)}


def position_at(t: float, points: list[list[float]]) -> float:
    if t <= points[0][0]:
        return points[0][1]
    for (t0, p0), (t1, p1) in zip(points, points[1:]):
        if t < t1:
            return p0 + (p1 - p0) * (t - t0) / ((t1 - t0) or 1)
    return points[-1][1]


def position_expr(points_out: list[list[float]]) -> str:
    """Положение кадра (0..1) выражением FFmpeg от t — время уже в шкале готового рилса."""
    if not points_out:
        return "0.5"
    if len(points_out) == 1:
        return f"{points_out[0][1]:.4f}"
    parts = [f"lt(t,{points_out[0][0]:.3f})*{points_out[0][1]:.4f}"]
    for (t0, p0), (t1, p1) in zip(points_out, points_out[1:]):
        if t1 - t0 <= 1e-4:
            continue
        parts.append(f"gte(t,{t0:.3f})*lt(t,{t1:.3f})*({p0:.4f}+{p1 - p0:.4f}*(t-{t0:.3f})/{t1 - t0:.3f})")
    parts.append(f"gte(t,{points_out[-1][0]:.3f})*{points_out[-1][1]:.4f}")
    return "+".join(parts)
