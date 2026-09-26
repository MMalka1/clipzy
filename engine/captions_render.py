"""Отрисовка субтитров в PNG теми же стилями, что на сайте (globals.css).

Размеры задаются в em относительно размера шрифта, как в CSS. Цвета:
  "A"  — акцент (подсветка слова), "AI" — текст поверх акцента, "T" — основной цвет текста.
"""

import colorsys
import math
import os
from functools import lru_cache

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from emoji_map import phrase_emoji

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = {
    "onest": os.path.join(HERE, "fonts", "Onest.ttf"),
    "unbounded": os.path.join(HERE, "fonts", "Unbounded.ttf"),
    "mono": os.path.join(HERE, "fonts", "JetBrainsMono.ttf"),
}
# Цветные эмодзи: Windows — Segoe UI Emoji, Linux (сервер, Vercel Sandbox) — Noto Color Emoji
EMOJI_FONTS = (
    os.environ.get("CLIPZY_EMOJI_FONT", ""),
    r"C:\Windows\Fonts\seguiemj.ttf",
    "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
)
BITMAP_EMOJI_PX = 109  # Noto Color Emoji — растровый шрифт: открывается только в этом размере

W, H = 1080, 1920  # вертикальный рилс — формат по умолчанию
# Форматы готового видео. Короткая сторона всегда 1080 — размер текста одинаковый в любом формате
FORMATS = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)}


def canvas_of(aspect: str | None) -> tuple[int, int]:
    return FORMATS.get(aspect or "9:16", FORMATS["9:16"])


def caption_max_w(cw: int, ch: int) -> int:
    """Ширина строки субтитров: в вертикали почти во всю ширину, в горизонтали — не шире 1350 (глазу удобно)."""
    return min(cw - 2 * 60, int(min(cw, ch) * 1.25))


def hook_wrap_w(cw: int) -> int:
    """Ширина строки хука (как w-[72%]/1300px в превью)."""
    return min(cw - 2 * 150, 1300)
PREVIEW_W = 340  # ширина превью в редакторе: размер шрифта с сайта пересчитываем в пиксели видео
REGION_H = 900  # высота полосы, в которой рисуется субтитр (в кадре 1920)


def region_h(canvas_h: int = H) -> int:
    """Высота полосы субтитров: 900 в вертикали, половина кадра в низких форматах."""
    return min(REGION_H, canvas_h // 2)

# Как в CSS: отступы/тени в em. Цветам по умолчанию соответствуют значения из globals.css.
STYLES: dict[str, dict] = {
    "beat": dict(font="onest", weight=800, upper=True, gap=0.24, text="T", on="A", on_scale=1.08,
                 shadows=[(0, 0.06, 0, "#000000"), (0, 0, 0.4, "#00000099")], accent="#FFD60A"),
    "box": dict(font="onest", weight=800, upper=True, gap=0.16, pad=(0.02, 0.14), text="T", on="AI",
                on_bg="A", radius=0.14, shadows=[(0, 0.05, 0.2, "#000000B3")], on_no_shadow=True, accent="#FFD60A"),
    "outline": dict(font="onest", weight=700, gap=0.16, text="T", on="A", stroke=(0.12, "#000000"), accent="#7EE0FF"),
    "karaoke": dict(font="onest", weight=800, gap=0.16, text="T", future="#FFFFFF59", on="A",
                    shadows=[(0, 0.05, 0.25, "#00000099")], accent="#FFFFFF"),
    "minimal": dict(font="onest", weight=600, size=0.92, lower=True, gap=0.1, text="#FFFFFFE6", on="T",
                    underline="A", shadows=[(0, 0.02, 0.2, "#000000E6")], accent="#FFD60A"),
    "neon": dict(font="unbounded", weight=800, upper=True, gap=0.16, text="neon-core", on="#FFFFFF",
                 glow="A", on_glow="AI-glow", accent="#22E5FF"),
    "comic": dict(font="unbounded", weight=800, upper=True, gap=0.2, line=1.2, text="A", on="T",
                  stroke=(0.1, "#000000"), shadows=[(0.07, 0.07, 0, "#000000")], block_rotate=-3, on_scale=1.08,
                  accent="#FFE14D"),
    "typewriter": dict(font="unbounded", weight=800, upper=True, gap=0.1, pad=(0.1, 0.3), line=1.4, text="T",
                       bg="#000000", on="AI", on_bg="A", radius=0.14, accent="#FFD60A"),
    "marker": dict(font="onest", weight=800, gap=0.0, pad=(0.0, 0.12), extra_gap=0.16, text="T", on="AI",
                   on_bg="A", radius=0.3, on_rotate=-2, shadows=[(0, 0.05, 0.25, "#000000BF")],
                   on_no_shadow=True, accent="#FFD60A"),
    "podcast": dict(font="onest", weight=600, gap=0.1, text="T", on="A", container="#000000C7",
                    container_pad=(0.3, 0.55), container_radius=0.3, accent="#FFD60A"),
    "glass": dict(font="onest", weight=700, gap=0.0, pad=(0.14, 0.42), text="#FFFFFFD9", on="AI", on_bg="A",
                  radius=0.7, container="#FFFFFF24", container_border="#FFFFFF33", container_pad=(0.22, 0.22),
                  container_radius=0.9, accent="#FFFFFF"),
    "retro": dict(font="unbounded", weight=800, upper=True, gap=0.16, text="A", on="#FFD60A",
                  shadows=[(0.05, 0.05, 0, "#7A2400"), (0.1, 0.1, 0, "#000000")], skew=-8, accent="#FF8A3D"),
    # Одно слово: только текущее слово, крупно, с толстой обводкой. Без акцента — цвет текста.
    "pop": dict(font="onest", weight=800, upper=True, size=1.8, line=1.1, line_exact=True, only_active=True,
                gap=0.0, text="T", on="A", stroke=(0.16, "#000000"),
                shadows=[(0, 0.08, 0, "#000000"), (0, 0.12, 0.4, "#0000008C")], accent=None),
    # Жирный: толстая чёрная обводка и «выдавленная» жёсткая тень, активное слово белое и крупнее
    "mrbeast": dict(font="unbounded", weight=800, upper=True, gap=0.24, line=1.22, line_exact=True, text="A",
                    on="T", on_scale=1.08, stroke=(0.22, "#000000"),
                    shadows=[(0, 0.05, 0, "#000000"), (0.02, 0.1, 0, "#000000"), (0.03, 0.15, 0, "#000000")],
                    accent="#FFD60A"),
    # Градиент: светлый текст, активное слово залито вертикальным градиентом от акцента
    "gradient": dict(font="onest", weight=800, gap=0.16, line=1.12, line_exact=True, text="T", on_grad=True,
                     on_scale=1.06, shadows=[(0, 0.04, 0.08, "#0000008C"), (0, 0.08, 0.4, "#00000073")],
                     on_shadows=[(0, 0.06, 0.2, "#0000008C")], accent="#FFD60A"),
}


# ——— цвета ———
def hex_rgba(h: str) -> tuple[int, int, int, int]:
    h = h.lstrip("#")
    if len(h) == 6:
        h += "FF"
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4, 6))  # type: ignore[return-value]


def ink_for(accent: str) -> str:
    """Чёрный или белый текст поверх акцента — по яркости цвета."""
    r, g, b, _ = hex_rgba(accent)
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return "#111111" if lum > 150 else "#FFFFFF"


def mix(c1: str, c2: str, t: float) -> str:
    a, b = hex_rgba(c1), hex_rgba(c2)
    return "#" + "".join(f"{round(a[i] + (b[i] - a[i]) * t):02X}" for i in range(4))


def mix_hsl(c1: str, c2: str, t: float) -> str:
    """Как CSS color-mix(in hsl, c1, c2 t): оттенок идёт по короткой дуге, насыщенность не теряется."""
    (r1, g1, b1, _), (r2, g2, b2, _) = hex_rgba(c1), hex_rgba(c2)
    h1, l1, s1 = colorsys.rgb_to_hls(r1 / 255, g1 / 255, b1 / 255)
    h2, l2, s2 = colorsys.rgb_to_hls(r2 / 255, g2 / 255, b2 / 255)
    if s1 == 0 or l1 in (0, 1):  # у серого оттенок «пустой» — берём второй цвет
        h1 = h2
    if s2 == 0 or l2 in (0, 1):
        h2 = h1
    dh = (h2 - h1 + 0.5) % 1 - 0.5
    rgb = colorsys.hls_to_rgb((h1 + dh * t) % 1, l1 + (l2 - l1) * t, s1 + (s2 - s1) * t)
    return "#" + "".join(f"{round(v * 255):02X}" for v in rgb)


def resolve(token: str | None, palette: dict) -> str | None:
    if token is None:
        return None
    return palette.get(token, token)


# ——— шрифты ———
@lru_cache(maxsize=64)
def font(name: str, weight: int, px: int) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(FONTS[name], px)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


@lru_cache(maxsize=8)
def emoji_font(px: int):
    for path in EMOJI_FONTS:
        if path and os.path.exists(path):
            for size in (px, BITMAP_EMOJI_PX):
                try:
                    return ImageFont.truetype(path, size)
                except OSError:
                    pass
    return None


def draw_emoji(img: Image.Image, x: float, bottom: float, text: str, px: int):
    """Эмодзи по центру x, низом на bottom. Растровый шрифт рисуем в его размере и масштабируем."""
    ef = emoji_font(px)
    if not ef:
        return
    if ef.size == px:
        ImageDraw.Draw(img).text((x, bottom), text, font=ef, anchor="md", embedded_color=True)
        return
    left, top, right, low = ImageDraw.Draw(img).textbbox((0, 0), text, font=ef, anchor="md", embedded_color=True)
    if right <= left or low <= top:
        return
    tile = Image.new("RGBA", (right - left, low - top), (0, 0, 0, 0))
    ImageDraw.Draw(tile).text((-left, -top), text, font=ef, anchor="md", embedded_color=True)
    k = px / ef.size
    tile = tile.resize((max(1, round(tile.width * k)), max(1, round(tile.height * k))), Image.LANCZOS)
    _composite(img, tile, int(x + left * k), int(bottom + top * k))


# ——— отрисовка ———
def _colored(mask: Image.Image, color: str) -> Image.Image:
    r, g, b, a = hex_rgba(color)
    layer = Image.new("RGBA", mask.size, (r, g, b, 0))
    layer.putalpha(mask.point(lambda v: v * a // 255))
    return layer


def _composite(dst: Image.Image, src: Image.Image, x: int, y: int):
    """alpha_composite с обрезкой по краям."""
    sx, sy = max(0, -x), max(0, -y)
    dx, dy = max(0, x), max(0, y)
    w = min(src.width - sx, dst.width - dx)
    h = min(src.height - sy, dst.height - dy)
    if w > 0 and h > 0:
        dst.alpha_composite(src, (dx, dy), (sx, sy, sx + w, sy + h))


def _gradient_fill(mask: Image.Image, top: float, bottom: float, stops: list[tuple[float, str]]) -> Image.Image:
    """Вертикальный linear-gradient (как в CSS: от top до bottom, за пределами — крайние цвета) по маске."""
    rgba = [(p, hex_rgba(c)) for p, c in stops]
    pixels = []
    for y in range(mask.height):
        t = min(max((y + 0.5 - top) / max(bottom - top, 1), 0), 1)
        color = rgba[-1][1]
        for (p0, c0), (p1, c1) in zip(rgba, rgba[1:]):
            if t <= p1:
                k = 0 if p1 == p0 else (t - p0) / (p1 - p0)
                color = tuple(round(c0[i] + (c1[i] - c0[i]) * k) for i in range(4))
                break
        pixels.append(color)
    col = Image.new("RGBA", (1, mask.height))
    col.putdata(pixels)
    layer = col.resize(mask.size, Image.NEAREST)
    layer.putalpha(mask)
    return layer


def _word_tile(text, st, state, px, fnt, palette) -> Image.Image:
    on = state == "on"
    ascent, descent = fnt.getmetrics()
    pad_y, pad_x = (v * px for v in st.get("pad", (0, 0)))
    adv = fnt.getlength(text)
    bw, bh = adv + 2 * pad_x, ascent + descent + 2 * pad_y
    m = int(px * 0.9)
    tile = Image.new("RGBA", (int(bw + 2 * m), int(bh + 2 * m)), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)
    ox, oy = m + pad_x, m + pad_y + ascent  # базовая линия текста

    bg = resolve(st.get("on_bg") if on else st.get("bg"), palette)
    if bg:
        r = st.get("radius", 0) * px
        draw.rounded_rectangle((m, m, m + bw, m + bh), radius=r, fill=hex_rgba(bg))

    if on and st.get("on_hl"):  # маркер по нижней половине слова (Пузырь)
        hl, above, below = st["on_hl"]
        draw.rounded_rectangle((m, oy - above * px, m + bw, oy + below * px), radius=0.1 * px,
                               fill=hex_rgba(resolve(hl, palette)))

    if on:
        color = resolve(st.get("on"), palette)
    elif state == "future" and st.get("future"):
        color = st["future"]
    else:
        color = resolve(st.get("text"), palette)

    stroke_w, stroke_c = 0, None
    if st.get("stroke"):
        stroke_w = max(1, round(st["stroke"][0] * px / 2))
        stroke_c = st["stroke"][1]

    if on and "on_shadows" in st:
        effects = list(st["on_shadows"])
    else:
        effects = [] if (on and st.get("on_no_shadow")) else list(st.get("shadows", []))
    glow = resolve(st.get("on_glow") if on else st.get("glow"), palette)
    if glow:  # неон: несколько слоёв свечения
        effects += [(0, 0, 0.03, "#FFFFFF"), (0, 0, 0.12, glow), (0, 0, 0.3, glow[:7] + "D9"), (0, 0, 0.6, glow[:7] + "80")]
    for dx, dy, blur, sc in effects:
        mask = Image.new("L", tile.size, 0)
        ImageDraw.Draw(mask).text((ox + dx * px, oy + dy * px), text, font=fnt, fill=255, anchor="ls",
                                  stroke_width=stroke_w)
        if blur:
            mask = mask.filter(ImageFilter.GaussianBlur(blur * px / 2))
        tile.alpha_composite(_colored(mask, sc))

    if on and st.get("on_grad"):  # заливка градиентом по маске (Градиент)
        mask = Image.new("L", tile.size, 0)
        ImageDraw.Draw(mask).text((ox, oy), text, font=fnt, fill=255, anchor="ls")
        # как background-clip: text — градиент по высоте строки слова (line-height), а не по глифам
        box_top = oy - ascent - (st.get("line", 1.12) * px - ascent - descent) / 2
        stops = [(0.2, palette["G0"]), (0.5, palette["G1"]), (0.85, palette["G2"])]
        tile.alpha_composite(_gradient_fill(mask, box_top, box_top + st.get("line", 1.12) * px, stops))
    else:
        draw.text((ox, oy), text, font=fnt, fill=hex_rgba(color), anchor="ls",
                  stroke_width=stroke_w, stroke_fill=hex_rgba(stroke_c) if stroke_c else None)

    if on and st.get("underline"):
        ul = resolve(st["underline"], palette)
        y = oy + st.get("underline_off", 0.18) * px
        draw.rectangle((ox, y, ox + adv, y + st.get("underline_h", 0.12) * px), fill=hex_rgba(ul))

    angle = st.get("rotate", 0) + (st.get("on_rotate", 0) if on else 0)
    scale = st.get("on_scale", 1) if on else 1
    if scale != 1:
        tile = tile.resize((int(tile.width * scale), int(tile.height * scale)), Image.LANCZOS)
    if angle:
        tile = tile.rotate(-angle, resample=Image.BICUBIC, expand=True)
    return tile


def render_caption(words: list[str], active: int, style: str, size: float, center_y: float,
                   accent: str | None = None, text_color: str | None = None, emoji: bool = False,
                   canvas: tuple[int, int] = (W, H)) -> Image.Image:
    """PNG-полоса (ширина кадра)×REGION_H с одним состоянием субтитра. center_y — центр в долях высоты кадра."""
    CW, CH = canvas
    st = STYLES.get(style, STYLES["beat"])
    txt = text_color or "#FFFFFF"
    acc = accent or st["accent"] or txt  # accent=None в стиле — «как цвет текста» (Одно слово)
    palette = {
        "A": acc,
        "AI": ink_for(acc),
        "T": txt,
        "T-dim": txt[:7] + "D6",  # color-mix(… 84%, transparent)
        "neon-core": mix(acc, "#FFFFFF", 0.82),
        "AI-glow": "#FF3DCF" if accent is None else mix(acc, "#FFFFFF", 0.35),
        # Градиент: светлый оттенок акцента → акцент → теплее (как .cap-gradient в globals.css)
        "G0": mix(acc, "#FFFFFF", 0.55),
        "G1": acc,
        "G2": mix_hsl(acc, "#FF3D6E", 0.45),
    }
    if style == "neon" and accent is None:
        palette["A"] = "#00E1FF"

    phrase = list(words)
    words = [w.rstrip(",.;:…") or w for w in words]  # в рилсах субтитры без запятых и точек
    if st.get("only_active"):  # Одно слово: рисуем только текущее
        words = [words[active]] if 0 <= active < len(words) else []
        active = 0
    shown = [w.upper() if st.get("upper") else w.lower() if st.get("lower") else w for w in words]

    # Перенос строк как text-wrap: balance: в одну строку, если влезает, иначе поровну по ширине
    max_w = caption_max_w(CW, CH)
    px = size * min(CW, CH) / PREVIEW_W * st.get("size", 1)
    if st.get("wrap_in_container"):  # у облачка ширина с паддингами ограничена полосой (border-box)
        max_w -= 25 + 2 * st["container_pad"][1] * px
    if st.get("only_active") and shown:  # слишком длинное слово ужимаем до ширины полосы
        wide = font(st["font"], st["weight"], int(px)).getlength(shown[0])
        if wide > max_w:
            px *= max_w / wide

    fnt = font(st["font"], st["weight"], int(px))
    ascent, descent = fnt.getmetrics()
    pad_y, pad_x = (v * px for v in st.get("pad", (0, 0)))
    gap = (st.get("gap", 0.16) * 2 + st.get("extra_gap", 0)) * px
    if st.get("line_exact"):  # шаг строк ровно как line-height в CSS
        line_h = st.get("line", 1.12) * px
    else:
        line_h = max(st.get("line", 1.12) * px, ascent + descent + 2 * pad_y)
    boxes = [fnt.getlength(w) + 2 * pad_x for w in shown]

    def width_of(idxs):
        return sum(boxes[i] for i in idxs) + gap * (len(idxs) - 1)

    n = len(boxes)
    if width_of(range(n)) <= max_w:
        lines = [list(range(n))]
    else:
        lines = [[]]
        for i in range(n):  # жадно — чтобы узнать нужное число строк
            if lines[-1] and width_of(lines[-1] + [i]) > max_w:
                lines.append([])
            lines[-1].append(i)
        if len(lines) == 2:  # две строки — выбираем разрез с минимальной самой длинной строкой
            k = min(range(1, n), key=lambda k: max(width_of(range(k)), width_of(range(k, n))))
            lines = [list(range(k)), list(range(k, n))]

    region = Image.new("RGBA", (CW, region_h(CH)), (0, 0, 0, 0))
    cy = region_h(CH) / 2
    block_h = line_h * len(lines)
    top = cy - block_h / 2

    positions = {}
    line_ws = []
    for li, idxs in enumerate(lines):
        lw = sum(boxes[i] for i in idxs) + gap * (len(idxs) - 1)
        line_ws.append(lw)
        x = (CW - lw) / 2
        y = top + li * line_h + line_h / 2
        for i in idxs:
            positions[i] = (x + boxes[i] / 2, y)
            x += boxes[i] + gap

    emoji_top = top
    if st.get("container"):
        py, pxx = (v * px for v in st["container_pad"])
        bw = max(line_ws)
        rect = ((CW - bw) / 2 - pxx, top - py, (CW + bw) / 2 + pxx, top + block_h + py)
        cont = Image.new("RGBA", region.size, (0, 0, 0, 0))
        cd = ImageDraw.Draw(cont)
        border = st.get("container_border")
        cd.rounded_rectangle(rect, radius=st["container_radius"] * px, fill=hex_rgba(st["container"]),
                             outline=hex_rgba(border) if border else None, width=2 if border else 0)
        if st.get("tail"):  # хвостик облачка вниз, как .cap-bubble::after (clip-path в em)
            bx, bb = CW / 2, rect[3] - 1
            cd.polygon([(bx - 0.36 * px, bb), (bx + 0.26 * px, bb), (bx - 0.25 * px, bb + 0.46 * px)],
                       fill=hex_rgba(st["container"]))
        if style == "glass":  # мягкая тень под стеклом
            shadow = Image.new("L", region.size, 0)
            ImageDraw.Draw(shadow).rounded_rectangle((rect[0], rect[1] + 0.4 * px, rect[2], rect[3] + 0.4 * px),
                                                      radius=st["container_radius"] * px, fill=110)
            region.alpha_composite(_colored(shadow.filter(ImageFilter.GaussianBlur(0.6 * px)), "#000000"))
        if st.get("container_shadow"):  # filter: drop-shadow — тень по форме облачка вместе с хвостиком
            dy, blur, sc = st["container_shadow"]
            shadow = cont.getchannel("A").filter(ImageFilter.GaussianBlur(blur * px / 2))
            layer = _colored(shadow, sc)
            _composite(region, layer, 0, round(dy * px))
        region.alpha_composite(cont)
        emoji_top = rect[1]

    if st.get("line_band"):  # Кино: полупрозрачная полоса под каждой строкой
        band_c, band_h = st["line_band"]
        bands = Image.new("RGBA", region.size, (0, 0, 0, 0))
        bd = ImageDraw.Draw(bands)
        for li, lw in enumerate(line_ws):
            y = top + li * line_h + line_h / 2
            bd.rectangle(((CW - lw) / 2, y - band_h * px / 2, (CW + lw) / 2, y + band_h * px / 2), fill=hex_rgba(band_c))
        region.alpha_composite(bands)

    # Слово с transform (scale/rotate) в CSS рисуется поверх соседей — здесь тоже кладём его последним
    order = list(range(len(shown)))
    if (st.get("on_scale") or st.get("on_rotate")) and 0 <= active < len(shown):
        order.remove(active)
        order.append(active)
    for i in order:
        w = shown[i]
        state = "on" if i == active else "past" if i < active else "future"
        tile = _word_tile(w, st, state, px, fnt, palette)
        x, y = positions[i]
        _composite(region, tile, int(x - tile.width / 2), int(y - tile.height / 2))

    if st.get("block_rotate"):  # наклон всей фразы (Комикс)
        region = region.rotate(-st["block_rotate"], resample=Image.BICUBIC, center=(CW / 2, cy))

    if st.get("skew"):
        k = math.tan(math.radians(-st["skew"]))
        region = region.transform(region.size, Image.AFFINE, (1, k, -k * cy, 0, 1, 0), resample=Image.BICUBIC)

    if emoji:
        emo = phrase_emoji(phrase)
        if emo:
            draw_emoji(region, CW / 2, emoji_top - 0.35 * px, emo, int(px * 1.15))

    return region


def region_top(center_y: float, canvas_h: int = H) -> int:
    """Где на кадре начинается полоса субтитров: центр полосы ровно на center_y, как top: N% в превью.
    Полоса может выходить за край кадра — FFmpeg обрежет пустую часть, а текст в середине полосы останется виден."""
    return int(center_y * canvas_h - region_h(canvas_h) / 2)


HOOK_TOP = 250  # обычное место хука, px от верха кадра 1080×1920 (13% высоты)


def hook_top(block_h: float, face_y: float | None, caption_y: float, canvas_h: int = H) -> float:
    """Куда поставить хук, чтобы он не закрыл лицо. face_y — центр лица в готовом кадре (0..1).
    По умолчанию — верхняя треть; если там лицо — над головой, а если места нет — под подбородком.
    Та же формула — в превью сайта (Preview.tsx). Отступы от верха — в долях высоты, остальное — в px текста."""
    top, min_top = round(canvas_h * 0.13), round(canvas_h * 0.0625)  # 250 и 120 для 1920
    if face_y is None:
        return top
    f0, f1 = (face_y - 0.12) * canvas_h, (face_y + 0.12) * canvas_h  # лицо с волосами и подбородком
    if top + block_h <= f0 or top >= f1:
        return top
    above = f0 - 36 - block_h
    if above >= min_top:
        return above
    below = f1 + 36
    if below + block_h <= caption_y * canvas_h - 170:
        return below
    return top


def render_hook(title: str, face_y: float | None = None, caption_y: float = 0.68,
                canvas: tuple[int, int] = (W, H)) -> Image.Image:
    """Хук-заголовок: белая плашка с жирным чёрным текстом. Лицо не закрывает."""
    CW, CH = canvas
    img = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    px = 66
    fnt = font("onest", 800, px)
    words = title.split()
    lines, cur = [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if fnt.getlength(test) > hook_wrap_w(CW) and cur:
            lines.append(cur)
            cur = w
        else:
            cur = test
    if cur:
        lines.append(cur)
    lh = px * 1.18
    pad_x, pad_y = 38, 26
    y = hook_top(len(lines) * (lh + 6) - 6 + pad_y, face_y, caption_y, CH)
    d = ImageDraw.Draw(img)
    # Каждая строка — своя плашка, как в TikTok
    for i, line in enumerate(lines):
        lw = fnt.getlength(line)
        x0 = (CW - lw) / 2 - pad_x
        y0 = y + i * (lh + 6)
        d.rounded_rectangle((x0, y0, x0 + lw + 2 * pad_x, y0 + lh + pad_y), radius=18, fill=(255, 255, 255, 255))
        d.text((CW / 2, y0 + pad_y / 2 + lh / 2), line, font=fnt, fill=(12, 12, 12, 255), anchor="mm")
    return img


WATERMARK_LOGO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "brand", "logo_sticker.png")


def render_watermark(canvas: tuple[int, int] = (W, H)) -> Image.Image:
    """Водяной знак — логотип-наклейка clipzy вертикально у левого и правого края."""
    CW, CH = canvas
    img = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    logo = Image.open(WATERMARK_LOGO).convert("RGBA")
    h = 58
    logo = logo.resize((round(logo.width * h / logo.height), h), Image.LANCZOS)
    # Полупрозрачная, чтобы не спорить с картинкой, но читалась на любом фоне
    alpha = logo.getchannel("A").point(lambda a: a * 0.82)
    logo.putalpha(alpha)
    pad = 12  # мягкая тень вокруг наклейки
    label = Image.new("RGBA", (logo.width + pad * 2, logo.height + pad * 2), (0, 0, 0, 0))
    shadow = Image.new("L", label.size, 0)
    shadow.paste(alpha.point(lambda a: a * 0.45), (pad, pad + 2))
    label.alpha_composite(_colored(shadow.filter(ImageFilter.GaussianBlur(5)), "#000000"))
    label.alpha_composite(logo, (pad, pad))

    left = label.rotate(90, expand=True)  # читается снизу вверх
    right = label.rotate(-90, expand=True)  # читается сверху вниз
    img.alpha_composite(left, (18 - pad, int(CH * 0.36 - left.height / 2)))
    img.alpha_composite(right, (CW - right.width - 18 + pad, int(CH * 0.64 - right.height / 2)))
    return img
