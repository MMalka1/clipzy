"""Сборка готового рилса 1080×1920 через FFmpeg."""

import glob
import json
import os
import shutil
import subprocess
from functools import lru_cache

import audio_fx
import edit_plan
import face_track
from captions_render import H, W, canvas_of, region_h, region_top, render_caption, render_hook, render_watermark


# ——— FFmpeg ———
@lru_cache(maxsize=4)
def tool(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    winget = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WinGet")
    candidates = [os.path.join(winget, "Links", name + ".exe")]
    candidates += sorted(glob.glob(os.path.join(winget, "Packages", "Gyan.FFmpeg*", "*", "bin", name + ".exe")))
    for c in candidates:
        if os.path.exists(c):
            return c
    raise RuntimeError(f"{name} не найден — установите FFmpeg")


def probe(path: str) -> dict:
    out = subprocess.run(
        [tool("ffprobe"), "-v", "error", "-show_entries",
         "stream=codec_type,width,height,r_frame_rate:stream_side_data=rotation:format=duration",
         "-of", "json", path],
        capture_output=True, text=True, check=True,
    ).stdout
    info = json.loads(out)
    video = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    if not video:
        raise RuntimeError("В файле нет видеодорожки")
    w, h = int(video["width"]), int(video["height"])
    rotation = next((abs(int(sd.get("rotation", 0))) for sd in video.get("side_data_list", [])), 0)
    if rotation in (90, 270):  # вертикальное видео с телефона
        w, h = h, w
    return {
        "duration": float(info["format"].get("duration", 0)),
        "width": w,
        "height": h,
        "has_audio": any(s["codec_type"] == "audio" for s in info["streams"]),
    }


def extract_audio(src: str, wav: str, clean: bool = False):
    """Моно 16 кГц. clean=True — версия для распознавания: без гула, с мягким шумодавом и выровненной громкостью."""
    # highpass — гул и стук по столу; afftdn — ровный шум (кулер, улица); dynaudnorm — тихий микрофон и дальний гость
    af = ["-af", "highpass=f=70,afftdn=nf=-25:tn=1,dynaudnorm=f=250:g=15:p=0.9:m=12"] if clean else []
    subprocess.run(
        [tool("ffmpeg"), "-y", "-v", "error", "-i", src, "-vn", *af, "-ac", "1", "-ar", "16000", "-f", "wav", wav],
        check=True,
    )


_nvenc: bool | None = None


def has_nvenc() -> bool:
    global _nvenc
    if os.environ.get("CLIPZY_DEVICE") == "cpu":
        return False  # FFmpeg из Ubuntu знает h264_nvenc, но видеокарты нет — каждая попытка стоит времени
    if _nvenc is None:
        out = subprocess.run([tool("ffmpeg"), "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
        _nvenc = "h264_nvenc" in out
    return _nvenc


# ——— время ———
def keep_intervals(words: list[dict], start: float, end: float, remove_pauses: bool, remove_fillers: bool = False,
                   min_gap: float = 0.45, pad: float = 0.12) -> list[tuple[float, float]]:
    """Какие куски исходника оставить: выкидываем тишину длиннее min_gap и слова-паразиты."""
    # Пометки считаем по всему ролику: «ну» в начале клипа — паразит, только если он и в ролике после паузы
    all_flags = audio_fx.mark_fillers(words) if remove_fillers else [False] * len(words)
    pairs = [(w, f) for w, f in zip(words, all_flags) if w["end"] > start and w["start"] < end]
    ws = [w for w, _ in pairs]
    flags = [f for _, f in pairs]
    keep = [w for w, f in pairs if not f]
    if not keep or (not remove_pauses and not any(flags)):
        return [(start, end)]
    fillers = [w for w, f in zip(ws, flags) if f]

    lead = remove_pauses or flags[0]
    a = max(start, keep[0]["start"] - (pad if remove_pauses else 0.04)) if lead else start
    intervals = []
    for cur, nxt in zip(keep, keep[1:]):
        if any(cur["end"] <= f["start"] < nxt["start"] for f in fillers):
            cut = (cur["end"] + 0.04, nxt["start"] - 0.04)  # паразит — режем вплотную
        elif remove_pauses and nxt["start"] - cur["end"] > min_gap:
            cut = (cur["end"] + pad, nxt["start"] - pad)
        else:
            continue
        if cut[1] - cut[0] > 0.05:
            intervals.append((a, cut[0]))
            a = cut[1]
    trail = remove_pauses or flags[-1]
    intervals.append((a, min(end, keep[-1]["end"] + (pad + 0.15 if remove_pauses else 0.08)) if trail else end))
    return [(round(x, 3), round(y, 3)) for x, y in intervals if y - x > 0.05]


def inside(t: float, intervals) -> bool:
    return any(a <= t <= b for a, b in intervals)


def map_time(t: float, intervals) -> float:
    acc = 0.0
    for a, b in intervals:
        if t < a:
            return acc
        if t <= b:
            return acc + (t - a)
        acc += b - a
    return acc


# ——— субтитры ———
def build_caption_track(phrases, intervals, opts, workdir) -> tuple[str, list[tuple[float, float]]]:
    """PNG на каждое состояние субтитра + ffconcat-файл с длительностями. Возвращает путь и окна фраз."""
    states = []  # (t0, t1, words, active)
    phrase_windows = []
    total = sum(b - a for a, b in intervals)
    for ph in phrases:
        words = ph["words"]
        if not words:
            continue
        mapped = [(map_time(w["start"], intervals), map_time(w["end"], intervals)) for w in words]
        p0, p1 = mapped[0][0], mapped[-1][1]
        if p1 <= 0 or p0 >= total or p1 - p0 < 0.05:
            continue
        phrase_windows.append((p0, p1))
        texts = [w["text"] for w in words]
        for i, (s, _) in enumerate(mapped):
            nxt = mapped[i + 1][0] if i + 1 < len(mapped) else p1
            states.append([s, max(nxt, s + 0.04), texts, i])

    states.sort(key=lambda s: s[0])
    # Короткие дыры между фразами не показываем пустыми — иначе субтитр мигает
    for cur, nxt in zip(states, states[1:]):
        if 0 < nxt[0] - cur[1] < 0.35:
            cur[1] = nxt[0]

    cache: dict = {}

    def png_for(key) -> str:
        if key not in cache:
            path = os.path.join(workdir, f"cap_{len(cache):04d}.png")
            if key == "blank":
                from PIL import Image
                cw, ch = opts.get("canvas", (W, H))
                Image.new("RGBA", (cw, region_h(ch)), (0, 0, 0, 0)).save(path)
            else:
                words, active = key
                render_caption(list(words), active, opts["style"], opts["size"], opts["center_y"],
                               opts.get("accent"), opts.get("text_color"), opts.get("emoji", False),
                               canvas=opts.get("canvas", (W, H))).save(path)
            cache[key] = path
        return cache[key]

    lines = ["ffconcat version 1.0"]
    t = 0.0
    last = png_for("blank")
    for s0, s1, words, active in states:
        s0, s1 = max(s0, t), min(s1, total)
        if s1 <= s0:
            continue
        if s0 - t > 0.001:
            lines += [f"file '{png_for('blank').replace(os.sep, '/')}'", f"duration {s0 - t:.3f}"]
        last = png_for((tuple(words), active))
        lines += [f"file '{last.replace(os.sep, '/')}'", f"duration {s1 - s0:.3f}"]
        t = s1
    if total - t > 0.001:
        last = png_for("blank")
        lines += [f"file '{last.replace(os.sep, '/')}'", f"duration {total - t:.3f}"]
    lines.append(f"file '{last.replace(os.sep, '/')}'")  # особенность concat: последний кадр дублируется

    path = os.path.join(workdir, "captions.ffconcat")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return path, phrase_windows


# ——— рендер ———
def frame_window(sw: int, sh: int, ow: int, oh: int, req: dict) -> dict:
    """Окно исходника и размер картинки в кадре ow×oh — общая математика клипа, обложки и превью (Editor.tsx).
    frameScale: 1 — заполнить кадр, 0 — исходник целиком (остаток — размытый фон).
    По горизонтали окно ставится по лицу (faceX) или ползунку cropX, по вертикали — по лицу (faceY), если есть запас."""
    r = ow / oh
    fill_w, fill_h = (sh * r, sh) if sw / sh > r else (sw, sw / r)
    k = min(max(float(req.get("frameScale", 1.0)), 0.0), 1.0)
    cw = int(fill_w + (sw - fill_w) * (1 - k)) // 2 * 2
    ch = int(fill_h + (sh - fill_h) * (1 - k)) // 2 * 2
    if cw / ch >= r:
        fg_w, fg_h = ow, min(oh, int(ow * ch / cw) // 2 * 2)
    else:
        fg_w, fg_h = min(ow, int(oh * cw / ch) // 2 * 2), oh
    if req.get("faceX") is not None:
        cx = float(req["faceX"]) * sw - cw / 2
    else:
        cx = (sw - cw) * float(req.get("cropX", 50)) / 100
    cx = int(min(max(cx, 0), sw - cw))
    if req.get("faceY") is not None and sh - ch > 2:  # вертикальное видео в горизонтальном кадре — держим лицо
        cy = int(min(max(float(req["faceY"]) * sh - ch * 0.42, 0), sh - ch))
    else:
        cy = int((sh - ch) / 2)
    return {"cw": cw, "ch": ch, "cx": cx, "cy": cy, "fg_w": fg_w, "fg_h": fg_h, "k": k}


def split_panels(speakers: list[dict], sw: int, sh: int, ow: int, oh: int):
    """«Экран пополам»: в горизонтальном кадре участники рядом, в вертикальном и квадратном — друг над другом.
    Возвращает (рядом ли, размер окна в кадре, окна исходника)."""
    side = ow > oh
    pw_o, ph_o = (ow // 2, oh) if side else (ow, oh // 2)
    return side, (pw_o, ph_o), [face_track.panel_rect(p, sw, sh, pw_o / ph_o) for p in speakers[:2]]


def clip_sfx(plan_sfx: list[dict], req: dict, start: float, end: float, intervals, total: float) -> list[dict]:
    """Звуки клипа в шкале готового рилса: t — начало сэмпла, gain — с учётом громкости эффектов.
    Категории: переходы (sfxWhoosh), акценты (sfxDing), смысловые (sfxSmart).
    Ровно то же считает превью — clipSfx() в Editor.tsx."""
    cats = {c for c, on in (("transition", req.get("sfxWhoosh")), ("accent", req.get("sfxDing")),
                            ("meaning", req.get("sfxSmart", True))) if on}
    vol = min(max(float(req.get("sfxVolume", 70)), 0.0), 100.0) / 70
    out: list[dict] = []
    for e in plan_sfx:
        cat = e.get("cat") or ("transition" if e["type"] == "whoosh" else "accent")  # план первой версии
        if cat not in cats or not (start <= e["t"] <= end and inside(e["t"], intervals)):
            continue
        a = map_time(e["t"], intervals)
        if a < 0.4 or a > total - 0.25:  # не в первый миг (там хук) и не на самом обрыве
            continue
        out.append({"a": a, "t": a - e.get("peak", 0.0), "type": e["type"], "cat": cat, "gain": e.get("gain", 0.5) * vol})
    if req.get("hook"):
        for h in edit_plan.hook_events(total):
            if h["cat"] not in cats:
                continue
            if h["cat"] == "transition" and any(x["cat"] == "transition" and abs(x["a"] - h["t"]) < 1.2 for x in out):
                continue
            out.append({"a": h["t"], "t": h["t"] - h["peak"], "type": h["type"], "cat": h["cat"], "gain": h["gain"] * vol})
    return sorted(out, key=lambda x: x["t"])


def render_clip(src: str, meta: dict, words: list[dict], req: dict, workdir: str, out_path: str, on_progress,
                plan: dict | None = None, music_path: str | None = None, track: dict | None = None,
                speakers: list[dict] | None = None):
    os.makedirs(workdir, exist_ok=True)
    start, end = float(req["start"]), float(req["end"])

    # Грубый seek до начала клипа: декодировать час видео ради последней минуты незачем
    offset = max(0.0, start - 1.0)
    intervals = keep_intervals(words, start, end, req.get("removePauses", False), req.get("removeFillers", False))
    local = [(a - offset, b - offset) for a, b in intervals]
    total = sum(b - a for a, b in intervals)

    phrases = []
    drop_fillers = req.get("removeFillers", False)
    for ph in req.get("phrases", []):
        ws = [w for w in ph["words"] if w["end"] > start and w["start"] < end and not (drop_fillers and w.get("filler"))]
        if ws:
            phrases.append({"words": ws})
    OW, OH = canvas_of(req.get("aspect"))  # формат готового видео
    opts = {
        "canvas": (OW, OH),
        "style": req.get("style", "beat"),
        "size": float(req.get("size", 24)),
        "center_y": float(req.get("captionY", 68)) / 100,
        "accent": req.get("accent"),
        "text_color": req.get("textColor"),
        "emoji": req.get("emoji", False),
    }
    concat_path, windows = build_caption_track(phrases, intervals, opts, workdir)

    # Кадр: окно исходника между «заполнить кадр» (k=1) и «целиком» (k=0); остаток — размытый фон
    sw, sh = meta["width"], meta["height"]
    fw = frame_window(sw, sh, OW, OH, req)
    cw, ch, cx, cy, fg_w, fg_h, k = fw["cw"], fw["ch"], fw["cx"], fw["cy"], fw["fg_w"], fw["fg_h"], fw["k"]
    blur_bg = fg_w < OW - 1 or fg_h < OH - 1
    # Точка, в которую наезжает зум: лицо внутри кадра (0..1)
    face_y = float(req["faceY"]) if req.get("faceY") is not None else 0.38
    focus_x = min(max((float(req["faceX"]) * sw - cx) / cw, 0.15), 0.85) if req.get("faceX") is not None else 0.5
    # Слежение за лицом: кадр ведёт спикера по ходу клипа
    follow = req.get("faceX") is not None and track and len(track.get("points", [])) > 1 and sw - cw > 2
    crop_x = str(cx)
    if follow:
        pts = []
        for a, b in intervals:
            inner = [p for p in track["points"] if a < p[0] < b]
            for t, p in [(a, face_track.position_at(a, track["points"]))] + inner + [(b, face_track.position_at(b, track["points"]))]:
                # путь считался для окна 9:16 — для другого формата сохраняем центр кадра на лице
                pts.append([round(map_time(t, intervals), 3), face_track.retarget(p, face_track.track_frac(sw, sh), cw / sw)])
        crop_x = f"'{sw - cw}*({face_track.position_expr(pts)})'"
        focus_x = 0.5  # лицо и так около центра кадра
    focus_y = min(max((face_y * sh - cy) / ch, 0.2), 0.7)
    if k < 0.999:  # в режиме «целиком» лицо может быть где угодно в кадре — наезжаем точно на него
        focus_y = min(max((face_y * sh - cy) / ch, 0.05), 0.95)
    plan = plan or {"shots": [], "accents": [], "sfx": []}
    # «Экран пополам»: двое участников — друг над другом (вертикаль, квадрат) или рядом (горизонталь)
    split = req.get("layout") == "split" and speakers is not None and len(speakers) >= 2
    side, (pw_o, ph_o), panels = split_panels(speakers, sw, sh, OW, OH) if split else (False, (0, 0), [])

    def to_out(items):
        """Переводим планы/акценты в шкалу готового рилса."""
        out = []
        for it in items:
            if it["end"] <= start or it["start"] >= end:
                continue
            a, b = map_time(it["start"], intervals), map_time(it["end"], intervals)
            if b - a > 0.05:
                out.append({**it, "start": a, "end": b})
        return out

    inputs = ["-ss", f"{offset:.3f}", "-t", f"{end - offset + 0.5:.3f}", "-i", src,
              "-f", "concat", "-safe", "0", "-i", concat_path]
    idx = 2
    hook_idx = wm_idx = None
    if req.get("hook"):
        hook_png = os.path.join(workdir, "hook.png")
        # Где лицо в готовом кадре — чтобы хук его не закрыл
        face_out = None
        if split:
            # лицо на 52% высоты окна: рядом — 0.52 кадра, друг над другом — у верхнего 0.26
            face_out = 0.52 if side else 0.26
        elif req.get("faceY") is not None:
            face_out = ((OH - fg_h) / 2 + (float(req["faceY"]) * sh - cy) / ch * fg_h) / OH
        render_hook(req["hook"], face_out, opts["center_y"], canvas=(OW, OH)).save(hook_png)
        inputs += ["-i", hook_png]
        hook_idx, idx = idx, idx + 1
    if req.get("watermark", True):
        wm_png = os.path.join(workdir, "watermark.png")
        render_watermark((OW, OH)).save(wm_png)
        inputs += ["-i", wm_png]
        wm_idx, idx = idx, idx + 1

    audio = meta.get("has_audio", True)

    # Звуковые эффекты — одной дорожкой в шкале готового рилса
    sfx_idx = music_idx = None
    events = clip_sfx(plan["sfx"], req, start, end, intervals, total)
    if events:
        sfx_wav = os.path.join(workdir, "sfx.wav")
        audio_fx.build_sfx_track(events, total, sfx_wav)
        inputs += ["-i", sfx_wav]
        sfx_idx, idx = idx, idx + 1
    if music_path:
        # Речь в шкале готового рилса — по ней музыка приглушается
        speech = [
            (map_time(w["start"], intervals), map_time(w["end"], intervals))
            for ph in phrases for w in ph["words"] if inside(w["start"], intervals)
        ]
        vol = max(0.0, min(float(req.get("musicVolume", 35)), 100.0)) / 100 * 0.5
        music_wav = os.path.join(workdir, "music.wav")
        audio_fx.build_music_track(music_path, tool("ffmpeg"), total, speech if audio else [], vol, music_wav)
        inputs += ["-i", music_wav]
        music_idx, idx = idx, idx + 1

    f = []
    for k, (a, b) in enumerate(local):
        f.append(f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS[v{k}]")
        if audio:
            f.append(f"[0:a]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS[a{k}]")
    n = len(local)
    pairs = "".join(f"[v{k}][a{k}]" if audio else f"[v{k}]" for k in range(n))
    f.append(f"{pairs}concat=n={n}:v=1:a={1 if audio else 0}[vc]" + ("[ac]" if audio else ""))
    if split:
        f.append("[vc]fps=30,setsar=1,split[s0][s1]")
        for k, p in enumerate(panels):
            pw, ph = int(p["w"] * sw) // 2 * 2, int(p["h"] * sh) // 2 * 2
            px, py = int(p["x"] * sw), int(p["y"] * sh)
            f.append(f"[s{k}]crop={pw}:{ph}:{px}:{py},scale={pw_o}:{ph_o}:flags=lanczos,setsar=1[p{k}]")
        if side:
            f.append(f"[p0][p1]hstack=2,drawbox=x={OW // 2 - 3}:y=0:w=6:h={OH}:color=black@0.85:t=fill[vb]")
        else:
            f.append(f"[p0][p1]vstack=2,drawbox=x=0:y={OH // 2 - 3}:w={OW}:h=6:color=black@0.85:t=fill[vb]")
    else:
        f.append(f"[vc]fps=30,setsar=1" + ("[vsrc];[vsrc]split[vfg0][vbg0]" if blur_bg else "[vfg0]"))
        f.append(f"[vfg0]crop={cw}:{ch}:{crop_x}:{cy},scale={fg_w}:{fg_h}:flags=lanczos[vfg]")
    fg = "vfg"

    if split:
        pass
    elif req.get("zoom") and (plan["shots"] or plan["accents"]):
        # Монтажный ритм: планы (джамп-кат), медленный наезд и плавные наезды на акцентах — к лицу
        z = edit_plan.zoom_expr(to_out(plan["shots"]), to_out(plan["accents"]))
        f.append(
            f"[{fg}]scale=w='trunc({fg_w}*({z})/2)*2':h='trunc(ow*{fg_h}/{fg_w}/2)*2':eval=frame:flags=bicubic,"
            f"crop={fg_w}:{fg_h}:'(iw-{fg_w})*{focus_x:.3f}':'(ih-{fg_h})*{focus_y:.3f}'[vfgz]"
        )
        fg = "vfgz"

    if split:
        pass
    elif blur_bg:
        # Размытая копия видео на фоне: уменьшаем, размываем, увеличиваем — быстро и мягко
        f.append(
            f"[vbg0]scale={OW // 4}:{OH // 4}:force_original_aspect_ratio=increase,crop={OW // 4}:{OH // 4},"
            f"boxblur=12:2,eq=brightness=-0.12:saturation=1.15,scale={OW}:{OH}[vbg]"
        )
        f.append(f"[vbg][{fg}]overlay=({OW}-w)/2:({OH}-h)/2[vb]")
    else:
        f.append(f"[{fg}]null[vb]")
    last = "vb"

    f.append(f"[{last}][1:v]overlay=0:{region_top(opts['center_y'], OH)}:eof_action=pass[vcap]")
    last = "vcap"
    if hook_idx is not None:
        f.append(f"[{last}][{hook_idx}:v]overlay=0:0:enable='lt(t,3.2)'[vh]")
        last = "vh"
    if wm_idx is not None:
        f.append(f"[{last}][{wm_idx}:v]overlay=0:0[vw]")
        last = "vw"
    if req.get("progressBar"):
        f.append(f"[{last}]drawbox=x=0:y=ih-14:w='iw*t/{total:.3f}':h=14:color=0xFFD60A@0.95:t=fill[vp]")
        last = "vp"
    f.append(f"[{last}]format=yuv420p[vout]")

    # Звук: голос + музыка (приглушается, когда говорят) + эффекты
    fmt = "aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo"
    mix = []
    if audio:
        f.append(f"[ac]{fmt}[voice0]")
        mix.append("voice0")
    if music_idx is not None:
        f.append(f"[{music_idx}:a]{fmt}[music]")
        mix.append("music")
    if sfx_idx is not None:
        f.append(f"[{sfx_idx}:a]{fmt}[sfx]")
        mix.append("sfx")
    has_out_audio = bool(mix)
    if len(mix) > 1:
        f.append("".join(f"[{m}]" for m in mix) + f"amix=inputs={len(mix)}:normalize=0:duration=first,alimiter=limit=0.95:latency=1[aout]")
    elif mix:
        f.append(f"[{mix[0]}]anull[aout]")

    def encode(nvenc: bool):
        vcodec = (["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "21", "-b:v", "0"] if nvenc
                  else ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"])
        cmd = [tool("ffmpeg"), "-y", "-v", "error", *inputs, "-filter_complex", ";".join(f),
               "-map", "[vout]", *(["-map", "[aout]", "-c:a", "aac", "-b:a", "192k"] if has_out_audio else []),
               *vcodec, "-r", "30", "-t", f"{total:.3f}", "-movflags", "+faststart",
               "-progress", "pipe:1", "-nostats", out_path]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                encoding="utf-8", errors="replace")
        for line in proc.stdout:  # type: ignore[union-attr]
            if line.startswith("out_time_us=") or line.startswith("out_time_ms="):
                try:
                    on_progress(min(int(line.split("=")[1]) / 1e6 / total, 1.0))
                except ValueError:
                    pass
        err = proc.stderr.read()  # type: ignore[union-attr]
        return proc.wait(), err

    code, err = encode(has_nvenc())
    if code != 0 and has_nvenc():
        print(f"[render] NVENC не сработал, кодирую на CPU: {err[-400:]}", flush=True)
        code, err = encode(False)
    if code != 0:
        raise RuntimeError(err.strip()[-800:] or "FFmpeg завершился с ошибкой")
    on_progress(1.0)
    return {"duration": round(total, 2), "intervals": intervals}


# ——— обложка ———
def grab_frame(src: str, t: float):
    """Кадр исходника в момент t (поворот с телефона FFmpeg учитывает сам)."""
    import io

    from PIL import Image

    png = subprocess.run(
        [tool("ffmpeg"), "-v", "error", "-ss", f"{max(t, 0):.3f}", "-i", src, "-frames:v", "1",
         "-f", "image2pipe", "-vcodec", "png", "-"],
        capture_output=True, check=True,
    ).stdout
    return Image.open(io.BytesIO(png)).convert("RGB")


def render_cover(src: str, meta: dict, req: dict, out_path: str, track: dict | None = None,
                 speakers: list[dict] | None = None):
    """Обложка в формате клипа (9:16, 16:9, 1:1): кадр в момент t с тем же кадрированием, что и в клипе,
    и крупный заголовок."""
    from PIL import Image, ImageDraw, ImageFilter

    from captions_render import font, hex_rgba

    OW, OH = canvas_of(req.get("aspect"))
    frame = grab_frame(src, float(req["t"]))
    sw, sh = frame.size
    split = req.get("layout") == "split" and speakers is not None and len(speakers) >= 2
    side = False
    if split:
        side, (pw_o, ph_o), panels = split_panels(speakers, sw, sh, OW, OH)  # type: ignore[arg-type]
        img = Image.new("RGB", (OW, OH))
        for k, p in enumerate(panels):
            box = (int(p["x"] * sw), int(p["y"] * sh), int((p["x"] + p["w"]) * sw), int((p["y"] + p["h"]) * sh))
            img.paste(frame.crop(box).resize((pw_o, ph_o), Image.LANCZOS), (k * pw_o, 0) if side else (0, k * ph_o))
        d = ImageDraw.Draw(img)
        if side:
            d.rectangle((OW // 2 - 3, 0, OW // 2 + 3, OH), fill=(0, 0, 0))
        else:
            d.rectangle((0, OH // 2 - 3, OW, OH // 2 + 3), fill=(0, 0, 0))
    else:
        # Та же математика, что в render_clip
        fw = frame_window(sw, sh, OW, OH, req)
        cw, ch, cx, cy, fg_w, fg_h = fw["cw"], fw["ch"], fw["cx"], fw["cy"], fw["fg_w"], fw["fg_h"]
        if req.get("faceX") is not None and track and len(track.get("points") or []) > 1 and sw - cw > 2:
            p = face_track.retarget(face_track.position_at(float(req["t"]), track["points"]), face_track.track_frac(sw, sh), cw / sw)
            cx = int((sw - cw) * p)
        fg = frame.crop((cx, cy, cx + cw, cy + ch)).resize((fg_w, fg_h), Image.LANCZOS)
        if fg_w < OW - 1 or fg_h < OH - 1:  # края — размытая копия кадра, как в клипе
            scale = max(OW / sw, OH / sh)
            bg = frame.resize((int(sw * scale) + 1, int(sh * scale) + 1))
            bx, by = (bg.width - OW) // 2, (bg.height - OH) // 2
            img = bg.crop((bx, by, bx + OW, by + OH)).filter(ImageFilter.GaussianBlur(40)).point(lambda v: int(v * 0.85))
        else:
            img = Image.new("RGB", (OW, OH))
        img.paste(fg, ((OW - fg_w) // 2, (OH - fg_h) // 2))

    img = img.convert("RGBA")
    title = " ".join((req.get("title") or "").split()).upper()
    on_seam = split and not side  # друг над другом — заголовок на стыке окон
    if title and not on_seam:
        # Затемнение снизу — заголовок читается на любом кадре
        shade = Image.new("L", (1, OH))
        for y in range(OH):
            shade.putpixel((0, y), int(max(0.0, (y / OH - 0.42) / 0.58) ** 1.4 * 190))
        img.alpha_composite(Image.merge("RGBA", (*[Image.new("L", (OW, OH), 0)] * 3, shade.resize((OW, OH)))))
    if title:
        # Кегль подбираем: в вертикали до 4 строк шириной 940, в горизонтали и квадрате — до 3 строк
        wrap = min(OW - 140, 1500)
        max_lines = 4 if OH > OW else 3
        for px in range(128, 60, -6):
            fnt = font("unbounded", 800, px)
            lines, cur = [], ""
            for w in title.split():
                test = (cur + " " + w).strip()
                if fnt.getlength(test) > wrap and cur:
                    lines.append(cur)
                    cur = w
                else:
                    cur = test
            lines.append(cur)
            if len(lines) <= max_lines and max(fnt.getlength(x) for x in lines) <= wrap + 60:
                break
        lh = int(px * 1.12)
        top = int(OH * (0.5 if on_seam else 0.72) - len(lines) * lh / 2)
        top = min(top, OH - len(lines) * lh - int(OH * 0.06))  # не упираться в нижний край
        accent = hex_rgba(req.get("accent") or "#F9DC0C")[:3]
        d = ImageDraw.Draw(img)
        stroke = max(6, px // 11)
        for i, line in enumerate(lines):
            y = top + i * lh
            # Последняя строка — фирменным цветом, как на обложках блогеров
            color = accent if i == len(lines) - 1 and len(lines) > 1 else (255, 255, 255)
            d.text((OW / 2 + 6, y + 8), line, font=fnt, fill=(0, 0, 0, 170), anchor="ma")
            d.text((OW / 2, y), line, font=fnt, fill=color, anchor="ma", stroke_width=stroke, stroke_fill=(0, 0, 0))
    if req.get("watermark", True):
        img.alpha_composite(render_watermark((OW, OH)))
    img.convert("RGB").save(out_path, "JPEG", quality=92)
    return out_path
