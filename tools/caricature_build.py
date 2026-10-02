#!/usr/bin/env python3
"""
Marco Kart: CARICATURE ART pipeline (build-time, deterministic, re-runnable).

What this is
    A hand-written image pipeline (OpenCV + Pillow + numpy) that turns Marco's own photos into comic-style caricature art:
    cel-shaded portraits with ink outlines, big-head mascots, pop-art halftone (CMYK offset), risograph, synthwave duotone,
    graffiti stencils, die-cut stickers, WANTED posters, constructivist posters, 8-bit pixel busts, sports cards, postage stamps,
    tarot cards, fake album covers, murals and more, each with a funny, self-deprecating, British caption.
    It is image processing and drawing code, NOT a generative model, and the game never calls it "AI art". Call it "caricature art".

Usage (run from the repository root, any Python 3.9+ with `opencv-python`, `pillow`, `numpy`)
    python3 tools/caricature_build.py                    # (re)generate every piece into assets/user/
    python3 tools/caricature_build.py --only popart,sticker
    python3 tools/caricature_build.py --slugs couch,yoda # only pieces that use these photos
    python3 tools/caricature_build.py --sheet sheet.png  # also write a contact sheet for a quick look
    python3 tools/caricature_build.py --list             # show the plan and what is on disk, write nothing
    python3 tools/caricature_build.py --assets DIR --out DIR

Inputs (read from assets/user/)
    face_<slug>.jpg      square face crops (Marco only) made by tools/photos_build.py   <- the main source
    marco_face.png       transparent headset cut-out (used for the cut-out mascots)
    Drop a new `face_<slug>.jpg` (square, face centred, Marco only) and re-run: any photo without a hand-made plan entry
    automatically gets a cel-shaded portrait, a pop-art print and a die-cut sticker.

Outputs (written to assets/user/, embedded by tools/build.mjs as data URIs)
    art_<style>_<slug>.jpg|png       e.g. art_popart_couch.jpg, art_sticker_yoda.png, art_mascot_head.png
    caricature_manifest.json         the list of files THIS script wrote (so a re-run can tidy up its own stale pieces only).
    Anything else named art_*.png|jpg in that folder is YOUR art: it is never touched or deleted here. To add hand-made or
    externally made art, just drop `art_<name>.png|jpg` (optionally `art_<style>_<name>` with a style from ART_STYLES in
    src/visuals/caricature.js, e.g. art_sticker_mycat.png for a cut-out decal) into assets/user/ and rebuild: the game picks it up.

Determinism: every random choice is seeded from the piece name, so the same photos always give byte-identical art.
Size budget: each piece is 256 to 512 px; the whole set stays around 3 MB (printed at the end, `--budget-kb` fails when over).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import zlib
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets" / "user"
MANIFEST = "caricature_manifest.json"
S = 512  # working size of a square subject
cv2.setNumThreads(1)  # keeps results bit-identical between runs and machines

# ----------------------------------------------------------------------------------------------------------------------------
# palettes
# ----------------------------------------------------------------------------------------------------------------------------
INK = (22, 16, 34)
CREAM = (250, 242, 222)
RED = (230, 57, 70)
NAVY = (11, 29, 58)
CYAN = (34, 211, 238)
YELLOW = (255, 209, 102)
PINK = (255, 61, 203)
PAPER = (244, 236, 217)

PICO = [(0, 0, 0), (29, 43, 83), (126, 37, 83), (0, 135, 81), (171, 82, 54), (95, 87, 79), (194, 195, 199), (255, 241, 232),
        (255, 0, 77), (255, 163, 0), (255, 236, 39), (0, 228, 54), (41, 173, 255), (131, 118, 156), (255, 119, 168), (255, 204, 170)]

# ----------------------------------------------------------------------------------------------------------------------------
# fonts: the first candidate that exists on this machine wins, the last resort is Pillow's built-in font
# ----------------------------------------------------------------------------------------------------------------------------
FONT_DIRS = ["/usr/share/fonts/truetype/google-fonts", "/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/truetype/liberation",
             "/usr/share/fonts/truetype/freefont", "/System/Library/Fonts/Supplemental", "/System/Library/Fonts", "/Library/Fonts",
             "C:/Windows/Fonts", str(Path.home() / ".fonts")]
FONT_FILES = {
    "display": ["Poppins-BoldItalic.ttf", "Impact.ttf", "Arial Black.ttf", "arialbd.ttf", "DejaVuSans-BoldOblique.ttf", "LiberationSans-BoldItalic.ttf"],
    "block": ["Poppins-Bold.ttf", "Arial Black.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf", "FreeSansBold.ttf"],
    "narrow": ["DejaVuSansCondensed-Bold.ttf", "Impact.ttf", "Arial Narrow Bold.ttf", "LiberationSans-Bold.ttf", "FreeSansBold.ttf"],
    "serif": ["DejaVuSerif-Bold.ttf", "LiberationSerif-Bold.ttf", "Georgia Bold.ttf", "georgiab.ttf", "FreeSerifBold.ttf", "Times New Roman Bold.ttf"],
    "serif_it": ["DejaVuSerif-BoldItalic.ttf", "LiberationSerif-BoldItalic.ttf", "FreeSerifBoldItalic.ttf"],
    "mono": ["DejaVuSansMono-Bold.ttf", "LiberationMono-Bold.ttf", "FreeMonoBold.ttf", "Courier New Bold.ttf", "cour.ttf"],
    "light": ["Poppins-Medium.ttf", "DejaVuSans.ttf", "LiberationSans-Regular.ttf", "Arial.ttf"],
}
_font_cache: dict = {}


def font(role: str, size: int) -> ImageFont.FreeTypeFont:
    key = (role, int(size))
    if key in _font_cache:
        return _font_cache[key]
    f = None
    for name in FONT_FILES[role]:
        for d in FONT_DIRS:
            p = os.path.join(d, name)
            if os.path.exists(p):
                try:
                    f = ImageFont.truetype(p, int(size))
                    break
                except OSError:
                    pass
        if f:
            break
    if f is None:
        try:
            f = ImageFont.load_default(int(size))
        except TypeError:  # Pillow < 10.1 has a fixed-size default font
            f = ImageFont.load_default()
    _font_cache[key] = f
    return f


# ----------------------------------------------------------------------------------------------------------------------------
# small helpers
# ----------------------------------------------------------------------------------------------------------------------------
def seed_of(*parts) -> int:
    return zlib.crc32("|".join(str(p) for p in parts).encode()) & 0xFFFFFFFF


def rng_for(*parts) -> np.random.Generator:
    return np.random.default_rng(seed_of(*parts))


def clamp01(a):
    return np.clip(a, 0.0, 1.0)


def to_pil(rgb_u8: np.ndarray) -> Image.Image:
    return Image.fromarray(np.ascontiguousarray(rgb_u8))


def to_np(im: Image.Image) -> np.ndarray:
    return np.asarray(im)


def solid(size, colour) -> Image.Image:
    return Image.new("RGB", size, tuple(colour))


def lerp_col(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def grad_v(size, top, bottom) -> Image.Image:
    w, h = size
    t = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    a = np.array(top, np.float32)[None, None, :]
    b = np.array(bottom, np.float32)[None, None, :]
    return to_pil(np.broadcast_to(a + (b - a) * t, (h, w, 3)).astype(np.uint8))


def grad_radial(size, inner, outer, centre=(0.5, 0.5), radius=0.75) -> Image.Image:
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.hypot((xx / w - centre[0]), (yy / h - centre[1])) / radius
    t = clamp01(d)[..., None]
    a = np.array(inner, np.float32)
    b = np.array(outer, np.float32)
    return to_pil((a + (b - a) * t).astype(np.uint8))


def paste_masked(base: Image.Image, top: Image.Image, mask: np.ndarray | Image.Image, xy=(0, 0)) -> Image.Image:
    """Paste `top` over `base` with a float mask (0..1 array) or an 'L' image; returns base."""
    if isinstance(mask, np.ndarray):
        mask = Image.fromarray((clamp01(mask) * 255).astype(np.uint8), "L")
    base.paste(top, xy, mask)
    return base


def soft_mask(m: np.ndarray, blur=1.2) -> np.ndarray:
    return clamp01(cv2.GaussianBlur(m.astype(np.float32), (0, 0), blur))


def dilate(m: np.ndarray, r: int) -> np.ndarray:
    if r <= 0:
        return m
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    return cv2.dilate(m, k)


def erode(m: np.ndarray, r: int) -> np.ndarray:
    if r <= 0:
        return m
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    return cv2.erode(m, k)


def fit_font(draw: ImageDraw.ImageDraw, text: str, role: str, max_w: int, size: int, min_size=10, stroke=0) -> ImageFont.FreeTypeFont:
    while size > min_size:
        f = font(role, size)
        if draw.textlength(text, font=f) + stroke * 2 <= max_w:
            return f
        size -= 2
    return font(role, min_size)


def wrap(draw: ImageDraw.ImageDraw, text: str, f, max_w: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=f) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def text_c(draw, xy, text, f, fill, stroke=0, stroke_fill=None, anchor="mm"):
    draw.text(xy, text, font=f, fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=stroke_fill)


def text_block(draw, cx, cy, text, role, max_w, size, fill, stroke=0, stroke_fill=None, line_gap=1.05, min_size=12, max_lines=3):
    """Wrap `text` to fit max_w, shrinking until it fits max_lines; draws centred around (cx, cy). Returns (top, bottom) of the block."""
    f = font(role, size)
    while True:
        lines = wrap(draw, text, f, max_w)
        if len(lines) <= max_lines and all(draw.textlength(l, font=f) <= max_w for l in lines):
            break
        size -= 2
        if size <= min_size:
            f = font(role, min_size)
            lines = wrap(draw, text, f, max_w)
            break
        f = font(role, size)
    lh = f.size * line_gap
    y0 = cy - lh * (len(lines) - 1) / 2
    for i, l in enumerate(lines):
        text_c(draw, (cx, y0 + i * lh), l, f, fill, stroke, stroke_fill)
    return y0 - lh / 2, y0 + lh * (len(lines) - 0.5)


def text_on_circle(img: Image.Image, text, centre, radius, size, fill, role="block", start_deg=-90, spread_deg=None, inward=False):
    """Draw text along a circle. Top text (inward=False) reads clockwise round the top; bottom text (inward=True, start_deg=90)
    reads left to right along the bottom with the glyph tops pointing at the centre."""
    f = font(role, size)
    d0 = ImageDraw.Draw(img)
    widths = [d0.textlength(c, font=f) for c in text]
    spread = spread_deg if spread_deg is not None else math.degrees(sum(widths) / radius)
    glyphs = list(zip(text, widths))
    if inward:
        glyphs = glyphs[::-1]          # walk the glyphs right to left in angle so they read left to right on screen
    ang = start_deg - spread / 2 if not inward else start_deg - spread / 2
    for c, w in glyphs:
        a_mid = ang + math.degrees(w / 2 / radius)
        tile = Image.new("RGBA", (int(size * 2), int(size * 2)), (0, 0, 0, 0))
        ImageDraw.Draw(tile).text((size, size), c, font=f, fill=fill, anchor="mm")
        rot = tile.rotate(-(a_mid + 90) if not inward else -(a_mid - 90), resample=Image.BICUBIC)
        x = centre[0] + radius * math.cos(math.radians(a_mid))
        y = centre[1] + radius * math.sin(math.radians(a_mid))
        img.paste(rot, (int(x - size), int(y - size)), rot)
        ang += math.degrees(w / radius)


def starburst(draw, cx, cy, r_out, r_in, points, fill, outline=None, width=0, rot=0.0):
    pts = []
    for i in range(points * 2):
        r = r_out if i % 2 == 0 else r_in
        a = rot + math.pi * i / points
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    draw.polygon(pts, fill=fill, outline=outline, width=width)


def sunburst(size, colours, n=18, centre=(0.5, 0.5), rot=0.0) -> Image.Image:
    """Alternating coloured wedges radiating from a point (comic backgrounds)."""
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    a = np.arctan2(yy - centre[1] * h, xx - centre[0] * w) + rot
    idx = (np.floor((a + math.pi) / (2 * math.pi) * n).astype(np.int32)) % len(colours)
    pal = np.array(colours, np.uint8)
    return to_pil(pal[idx])


def paper_texture(size, seed, base=PAPER, grain=7, fibres=True) -> Image.Image:
    r = np.random.default_rng(seed)
    w, h = size
    n = r.normal(0, grain, (h, w)).astype(np.float32)
    n += cv2.GaussianBlur(r.normal(0, 14, (h, w)).astype(np.float32), (0, 0), 6)
    arr = np.array(base, np.float32)[None, None, :] + n[..., None]
    if fibres:
        f = cv2.GaussianBlur(r.normal(0, 1, (h, w)).astype(np.float32), (0, 0), 0.7)
        arr += (f * 20)[..., None] * np.array([1, 0.96, 0.85])[None, None, :] * 0.6
    return to_pil(np.clip(arr, 0, 255).astype(np.uint8))


def vignette(img: np.ndarray, strength=0.35) -> np.ndarray:
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.hypot((xx / w - 0.5) * 1.15, (yy / h - 0.5) * 1.15)
    v = 1 - strength * clamp01((d - 0.35) / 0.55) ** 1.5
    return np.clip(img.astype(np.float32) * v[..., None], 0, 255).astype(np.uint8)


def film_noise(img: np.ndarray, seed, amount=5) -> np.ndarray:
    r = np.random.default_rng(seed)
    n = r.normal(0, amount, img.shape[:2]).astype(np.float32)
    return np.clip(img.astype(np.float32) + n[..., None], 0, 255).astype(np.uint8)


def halftone_cov(chan: np.ndarray, cell: float, angle_deg: float, gain=1.0, blur=None) -> np.ndarray:
    """Dot coverage 0..1 (anti-aliased) for a tone channel `chan` (0 = no ink, 1 = full ink) on a rotated dot screen."""
    h, w = chan.shape
    c = cv2.GaussianBlur(chan.astype(np.float32), (0, 0), blur if blur is not None else cell * 0.45)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    a = math.radians(angle_deg)
    u = (xx * math.cos(a) + yy * math.sin(a)) / cell
    v = (-xx * math.sin(a) + yy * math.cos(a)) / cell
    r = np.hypot(u - np.round(u), v - np.round(v))
    rad = 0.7071 * np.sqrt(clamp01(c * gain))
    return clamp01((rad - r) * cell + 0.5)


def png_quantise(im: Image.Image, colours=96) -> Image.Image:
    """Palette PNG (alpha kept) for flat stylised art: a fraction of the size of a truecolour PNG."""
    if im.mode == "RGBA":
        return im.quantize(colors=colours, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    return im.quantize(colors=colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


# ----------------------------------------------------------------------------------------------------------------------------
# captions (British, self-deprecating, cloud and networking flavoured)
# ----------------------------------------------------------------------------------------------------------------------------
CAP = {
    "dns": "NOT THE DNS AGAIN",
    "badgers": "CLOUD INSTRUCTOR. MAY CONTAIN BADGERS",
    "terraform": "KEEP CALM AND RUN TERRAFORM",
    "laptop": "IT WORKED ON MY LAPTOP",
    "subnets": "I HAVE OPINIONS ABOUT SUBNETS",
    "tea": "LIVES IN RIO. STILL TAKES TEA",
    "freeze": "CHANGE FREEZE? WHAT CHANGE FREEZE?",
    "harmless": "MOSTLY HARMLESS. OCCASIONALLY ROOT",
    "vpc": "SORRY, WRONG VPC",
    "reboot": "HAVE YOU TRIED TURNING IT OFF AND ON?",
    "cidr": "MIND THE CIDR",
    "friday": "DEPLOYED ON A FRIDAY. AGAIN.",
    "yaml": "SIGNIFICANT WHITESPACE. INSIGNIFICANT SLEEP.",
    "certified": "AWS CERTIFIED. STILL CONFUSED BY IAM",
    "flatwhite": "FLAT WHITE, NO SUGAR, NO DOWNTIME",
    "bgp": "SORRY I'M LATE, MY BGP FLAPPED",
    "routing": "MAY CONTAIN TRACES OF ROUTING LOOPS",
    "uptime": "99.9% UPTIME. 100% TEA.",
    "localhost": "THERE'S NO PLACE LIKE 127.0.0.1",
    "biscuits": "SEND HELP. AND BISCUITS.",
    "sorry": "SORRY. WAS THAT MY PACKET?",
    "docs": "COMRADES: PLEASE READ THE DOCS",
    "ping": "PING ME MAYBE",
    "outage": "THIS IS FINE. (IT IS NOT FINE.)",
}


# ----------------------------------------------------------------------------------------------------------------------------
# the subject: a face crop with a soft mask and landmarks
# ----------------------------------------------------------------------------------------------------------------------------
# Landmarks as fractions of the square crop: (face centre x, eye line y, mouth y, face width). Hand-set for the known photos,
# anything new falls back to a Haar face detection and then to sensible defaults.
LANDMARKS = {
    "banana_run": (0.50, 0.36, 0.62, 0.50), "banana_suit": (0.50, 0.37, 0.58, 0.36), "beach_sunset": (0.50, 0.42, 0.68, 0.60),
    "couch": (0.50, 0.36, 0.66, 0.60), "desert_drive": (0.50, 0.38, 0.73, 0.60), "desk_point": (0.50, 0.42, 0.73, 0.60),
    "flag_rio": (0.50, 0.38, 0.70, 0.62), "headache": (0.52, 0.40, 0.78, 0.62), "hippie": (0.50, 0.42, 0.70, 0.55),
    "holi": (0.50, 0.38, 0.68, 0.62), "kazakh_hat": (0.50, 0.40, 0.68, 0.58), "keffiyeh_car": (0.50, 0.42, 0.68, 0.55),
    "marina_laugh": (0.52, 0.36, 0.62, 0.52), "snake_chair": (0.50, 0.44, 0.72, 0.60), "snorkel": (0.50, 0.44, 0.68, 0.60),
    "squish": (0.50, 0.38, 0.70, 0.60), "stonehenge": (0.50, 0.40, 0.68, 0.62), "sugarloaf": (0.50, 0.42, 0.72, 0.60),
    "vatican": (0.50, 0.38, 0.70, 0.60), "yoda": (0.48, 0.42, 0.73, 0.60),
}
_faces = None


def _haar(gray):
    global _faces
    if _faces is None:
        _faces = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_alt2.xml")
    f = _faces.detectMultiScale(gray, 1.1, 4, minSize=(int(gray.shape[0] * 0.25),) * 2)
    return max(f, key=lambda r: r[2] * r[3]) if len(f) else None


@dataclass
class Subject:
    slug: str
    rgb: np.ndarray            # S x S x 3 uint8
    mask: np.ndarray           # S x S float 0..1 (head, hair and a bit of neck / shoulders)
    cx: float                  # landmarks in pixels of the S x S frame
    eye_y: float
    mouth_y: float
    face_w: float
    meta: dict = field(default_factory=dict)

    def copy(self) -> "Subject":
        return Subject(self.slug, self.rgb.copy(), self.mask.copy(), self.cx, self.eye_y, self.mouth_y, self.face_w, dict(self.meta))


_subject_cache: dict = {}


def load_subject(slug: str, assets: Path, size=S) -> Subject:
    key = (slug, size)
    if key in _subject_cache:
        return _subject_cache[key].copy()
    if slug == "marco_face":      # the transparent headset cut-out: real matte, real hair, real headset
        rgba = cv2.imread(str(assets / "marco_face.png"), cv2.IMREAD_UNCHANGED)
        if rgba is None:
            raise FileNotFoundError(assets / "marco_face.png")
        rgba = cv2.resize(rgba, (size, size), interpolation=cv2.INTER_LANCZOS4)
        alpha = cv2.GaussianBlur(rgba[..., 3].astype(np.float32) / 255.0, (0, 0), 0.8)
        subj = Subject(slug, cv2.cvtColor(rgba[..., :3], cv2.COLOR_BGR2RGB), alpha, 0.50 * size, 0.43 * size, 0.68 * size, 0.46 * size,
                       meta={'sat': 1.05, 'warm': -12.0})       # the headset photo is lit red: cool the skin a little
        _subject_cache[key] = subj
        return subj.copy()
    path = assets / f"face_{slug}.jpg"
    bgr = cv2.imread(str(path))
    if bgr is None:
        raise FileNotFoundError(path)
    bgr = cv2.resize(bgr, (size, size), interpolation=cv2.INTER_LANCZOS4)
    bgr = cv2.fastNlMeansDenoisingColored(bgr, None, 3, 3, 5, 15)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    if slug in LANDMARKS:
        cx, ey, my, fw = LANDMARKS[slug]
    else:
        f = _haar(gray)
        if f is not None:
            x, y, w, h = f
            cx, ey, my, fw = (x + w / 2) / size, (y + h * 0.42) / size, (y + h * 0.82) / size, w / size * 1.05
        else:
            cx, ey, my, fw = 0.5, 0.40, 0.70, 0.60
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    rgb = normalise_exposure(rgb, cx * size, (ey + my) / 2 * size, fw * size)
    rgb, (cx, ey, my, fw), domed = extend_head_top(rgb, cx, ey, my, fw)
    bgr = rgb[..., ::-1].copy()
    mask = head_mask(bgr, cx * size, (ey + my) / 2 * size, fw * size)
    subj = Subject(slug, rgb, mask, cx * size, ey * size, my * size, fw * size, meta={'dome': True} if domed else {})
    _subject_cache[key] = subj
    return subj.copy()


def normalise_exposure(rgb, cx, cy, fw, target=150.0) -> np.ndarray:
    """Gamma so the middle of the face sits at a healthy mid-light tone (dim, yellow-banana or backlit photos make muddy cel art)."""
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    inner = np.hypot((xx - cx) / (fw * 0.30), (yy - cy) / (fw * 0.36)) < 1
    lum = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)[inner].astype(np.float32)
    if lum.size < 50:
        return rgb
    m = float(np.median(lum))
    if m < 20 or abs(m - target) < 12:
        return rgb
    gamma = float(np.clip(math.log(target / 255.0) / math.log(m / 255.0), 0.55, 1.6))
    return np.clip(255.0 * (rgb.astype(np.float32) / 255.0) ** gamma, 0, 255).astype(np.uint8)


def extend_head_top(rgb, cx, ey, my, fw):
    """Most of the crops cut the top of the head off at the frame, which makes flat-topped egg heads. Add a dome of hair above the frame
    (colour sampled from the top rows, dark brown when that is skin or sky) and shrink the picture back to a square; landmarks follow."""
    size = rgb.shape[0]
    top = (ey - 0.74 * fw) * size
    if top > 12:
        return rgb, (cx, ey, my, fw), False
    pad = int(min(0.30 * size, 12 - top + 0.06 * size))
    x0, x1 = int((cx - 0.30 * fw) * size), int((cx + 0.30 * fw) * size)
    strip = rgb[:8, max(0, x0):min(size, x1)].reshape(-1, 3)
    hair = np.median(strip, 0).astype(np.float32) if len(strip) else np.array([40, 30, 26], np.float32)
    ycc = cv2.cvtColor(hair.astype(np.uint8)[None, None], cv2.COLOR_RGB2YCrCb)[0, 0]
    if (134 < ycc[1] < 182 and 76 < ycc[2] < 130) or hair.mean() > 150:     # skin or bright background: paint dark hair instead
        hair = np.array([44, 31, 26], np.float32)
    big = cv2.copyMakeBorder(rgb, pad, 0, pad // 2, pad // 2, cv2.BORDER_REPLICATE)
    big[:pad + 6, :] = hair.astype(np.uint8)
    seam = cv2.GaussianBlur(big.astype(np.float32), (0, 0), 3.0)
    big[pad - 4:pad + 10, :] = seam[pad - 4:pad + 10, :].astype(np.uint8)
    n = size + pad
    big = big[:, : n]
    out = cv2.resize(big[:n, :n] if big.shape[1] >= n else cv2.copyMakeBorder(big, 0, 0, 0, n - big.shape[1], cv2.BORDER_REPLICATE), (size, size), interpolation=cv2.INTER_AREA)
    f = size / n
    return out, ((cx * size + pad // 2) * f / size, (ey * size + pad) * f / size, (my * size + pad) * f / size, fw * f), True


def head_mask(bgr, cx, cy, fw) -> np.ndarray:
    """Soft head-and-shoulders mask: grabCut seeded with an ellipse around the face (deterministic), then feathered."""
    h, w = bgr.shape[:2]
    m = np.full((h, w), cv2.GC_BGD, np.uint8)
    cv2.ellipse(m, (int(cx), int(cy - fw * 0.06)), (int(fw * 0.98), int(fw * 1.12)), 0, 0, 360, cv2.GC_PR_BGD, -1)
    cv2.ellipse(m, (int(cx), int(cy - fw * 0.05)), (int(fw * 0.72), int(fw * 0.88)), 0, 0, 360, cv2.GC_PR_FGD, -1)
    cv2.ellipse(m, (int(cx), int(cy)), (int(fw * 0.40), int(fw * 0.52)), 0, 0, 360, cv2.GC_FGD, -1)
    bg, fg = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.setRNGSeed(7)
    try:
        cv2.grabCut(bgr, m, None, bg, fg, 5, cv2.GC_INIT_WITH_MASK)
        out = ((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)).astype(np.uint8)
    except cv2.error:
        out = np.zeros((h, w), np.uint8)
    # keep the largest blob, fill holes, never smaller than the face ellipse, feather
    n, lab, stats, _ = cv2.connectedComponentsWithStats(out, 8)
    if n > 1:
        out = (lab == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
    cv2.ellipse(out, (int(cx), int(cy)), (int(fw * 0.46), int(fw * 0.58)), 0, 0, 360, 1, -1)
    cnts, _ = cv2.findContours(out, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    filled = np.zeros_like(out)
    cv2.drawContours(filled, cnts, -1, 1, -1)
    k = max(3, int(fw * 0.035)) | 1
    filled = cv2.morphologyEx(filled, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    filled = cv2.morphologyEx(filled, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k * 2 + 1, k * 2 + 1)))
    return soft_mask(cv2.GaussianBlur(filled.astype(np.float32), (0, 0), 3) > 0.5, 1.6)


# ----------------------------------------------------------------------------------------------------------------------------
# warps
# ----------------------------------------------------------------------------------------------------------------------------
def _remap(img, mapx, mapy):
    return cv2.remap(img, mapx, mapy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)


def _local_scale_maps(shape, cx, cy, radius, sx, sy):
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx, dy = xx - cx, yy - cy
    wgt = np.exp(-((dx / radius) ** 2 + (dy / radius) ** 2) * 1.6).astype(np.float32)
    return cx + dx / (1 + (sx - 1) * wgt), cy + dy / (1 + (sy - 1) * wgt)


def local_scale(subj: Subject, cx, cy, radius, sx=1.0, sy=1.0):
    """Gaussian-weighted stretch around (cx, cy): sx / sy > 1 enlarges (wider mouth, bigger eyes and brows)."""
    mx, my = _local_scale_maps(subj.mask.shape, cx, cy, radius, sx, sy)
    subj.rgb = _remap(subj.rgb, mx, my)
    subj.mask = _remap(subj.mask.astype(np.float32), mx, my)


def bulge(subj: Subject, cx, cy, radius, power):
    h, w = subj.mask.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx, dy = xx - cx, yy - cy
    r = np.hypot(dx, dy) / radius
    k = np.where(r < 1, np.power(np.maximum(r, 1e-4), power - 1), 1.0).astype(np.float32)
    mx, my = cx + dx * k, cy + dy * k
    subj.rgb = _remap(subj.rgb, mx, my)
    subj.mask = _remap(subj.mask.astype(np.float32), mx, my)


def caricature_warp(subj: Subject, strength=1.0, grin=True, brows=True) -> Subject:
    """Big-head caricature: a fisheye bulge over the whole face plus a wider grin, bigger eyes and heavier brows."""
    cx, ey, my, fw = subj.cx, subj.eye_y, subj.mouth_y, subj.face_w
    mid = (ey + my) / 2
    bulge(subj, cx, mid, fw * 1.12, 1 + 0.40 * strength)
    # after the bulge the features sit a little further from the centre; scale the landmark spread to match
    if brows:
        local_scale(subj, cx, ey - fw * 0.10, fw * 0.50, 1.18, 1.35 * strength)
    local_scale(subj, cx, ey, fw * 0.42, 1.12 * strength, 1.12 * strength)
    if grin:
        local_scale(subj, cx, my, fw * 0.36, 1.32 * strength, 1.22 * strength)
    return subj


# ----------------------------------------------------------------------------------------------------------------------------
# cel shading and ink
# ----------------------------------------------------------------------------------------------------------------------------
def xdog(gray_u8, sigma=1.1, k=1.7, tau=0.97, eps=-0.045, phi=30.0):
    """eXtended difference of Gaussians: clean, pen-like ink lines. Returns 1 = paper, 0 = ink."""
    g = gray_u8.astype(np.float32) / 255.0
    a = cv2.GaussianBlur(g, (0, 0), sigma)
    b = cv2.GaussianBlur(g, (0, 0), sigma * k)
    d = a - tau * b
    return np.where(d >= eps, 1.0, 1.0 + np.tanh(phi * (d - eps))).astype(np.float32)


_poster_cache: dict = {}


def cel(rgb: np.ndarray, bands=8, sat=1.45, smooth=2, warm=0.0, band_blur=1.2, chroma_blur=2.5, seed=3) -> np.ndarray:
    """Flat screen-print colour: mean-shift smoothing, then k-means in Lab (`bands` colours), saturation boost. Cached per image."""
    key = (rgb.shape, zlib.crc32(rgb.tobytes()) if rgb.size < 4_000_000 else id(rgb), bands, sat, warm)
    if key in _poster_cache:
        return _poster_cache[key].copy()
    pre = cv2.cvtColor(rgb[..., ::-1].copy(), cv2.COLOR_BGR2LAB)
    pre[..., 0] = cv2.createCLAHE(2.2, (4, 4)).apply(pre[..., 0])           # local contrast: eyes, brows and mouth read at a glance
    bgr = cv2.pyrMeanShiftFiltering(cv2.cvtColor(pre, cv2.COLOR_LAB2BGR), 30, 14, 1)
    bgr = cv2.bilateralFilter(bgr, 9, 40, 7)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    h, w = lab.shape[:2]
    data = lab.reshape(-1, 3).astype(np.float32)
    idx = np.random.default_rng(seed).choice(len(data), min(len(data), 20000), replace=False)
    cv2.setRNGSeed(seed)
    _, _, centres = cv2.kmeans(data[idx], bands, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.5), 2, cv2.KMEANS_PP_CENTERS)
    centres[:, 1] += warm
    d = ((data[:, None, :] - centres[None, :, :]) ** 2).sum(-1)
    out = cv2.cvtColor(np.clip(centres[d.argmin(1)].reshape(h, w, 3), 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
    out = cv2.medianBlur(out, 5)
    hsv = cv2.cvtColor(out, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * sat, 0, 255)
    hsv[..., 2] = np.clip(hsv[..., 2] * 1.08 + 8, 0, 255)
    res = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)
    _poster_cache[key] = res
    return res.copy()


def ink_lines(rgb: np.ndarray, sigma=1.3, eps=-0.02, thick=1) -> np.ndarray:
    """0..1 ink coverage from the smoothed photo (XDoG, then a soft threshold so the pen line is crisp)."""
    sm = cv2.bilateralFilter(rgb[..., ::-1].copy(), 9, 45, 6)
    sm = cv2.bilateralFilter(sm, 9, 45, 6)
    e = xdog(cv2.cvtColor(sm, cv2.COLOR_BGR2GRAY), sigma=sigma, eps=eps, phi=40.0)
    ink = cv2.GaussianBlur(1.0 - e, (0, 0), 0.6)
    ink = clamp01((ink - 0.25) * 2.2)
    if thick > 1:
        ink = cv2.dilate(ink, np.ones((2, 2), np.uint8), iterations=thick - 1)
    return ink


def cel_portrait(subj: Subject, bands=7, sat=1.4, ink_strength=0.95, outline=6, sigma=1.3, eps=-0.02, warm=2.0):
    """Cel-shaded subject. Returns (rgb uint8, alpha float): colour with ink lines baked in and an outlined silhouette."""
    col = cel(subj.rgb, bands=bands, sat=subj.meta.get("sat", sat), warm=subj.meta.get("warm", warm)).astype(np.float32)
    ink = ink_lines(subj.rgb, sigma=sigma, eps=eps)
    m = subj.mask
    sil = clamp01(dilate((m > 0.5).astype(np.float32), outline) - erode((m > 0.5).astype(np.float32), 1))
    sil = cv2.GaussianBlur(sil, (0, 0), 0.8)
    out = col * (1 - (ink * ink_strength)[..., None]) + np.array(INK, np.float32) * (ink * ink_strength)[..., None]
    out = out * (1 - sil[..., None]) + np.array(INK, np.float32) * sil[..., None]
    alpha = clamp01(np.maximum(m, sil))
    return np.clip(out, 0, 255).astype(np.uint8), alpha


def egg_mask(subj: Subject, grow=1.0) -> np.ndarray:
    """Head-only mask (hair, hat, face, chin; no shoulders): a guaranteed face egg, plus whatever the grabCut matte says is hair or hat
    inside a taller outer egg."""
    cx, ey, my, fw = subj.cx, subj.eye_y, subj.mouth_y, subj.face_w
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)

    def egg(top, bot, rx):
        cy, ry = (top + bot) / 2, (bot - top) / 2
        return (np.hypot((xx - cx) / rx, (yy - cy) / ry) < 1).astype(np.float32)
    inner = egg(ey - (0.70 if subj.meta.get('dome') else 0.56) * fw * grow, my + 0.34 * fw * grow, 0.66 * fw * grow)
    outer = egg(max(ey - 1.0 * fw * grow, -0.35 * fw), my + 0.34 * fw * grow, 0.80 * fw * grow)
    m = np.maximum(inner, (subj.mask > 0.5).astype(np.float32) * outer)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
    n, lab, stats, _ = cv2.connectedComponentsWithStats((m > 0.5).astype(np.uint8), 8)
    if n > 1:
        m = (lab == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))).astype(np.float32)
    return soft_mask(cv2.GaussianBlur(m, (0, 0), 4) > 0.5, 1.4)


def head_cut(subj: Subject, strength=1.0, grow=1.0) -> Subject:
    """A head-only, caricature-warped copy of the subject (bigger eyes and brows, wider grin, fisheye bulge). The egg is cut AFTER
    the warp so the hair the bulge pushes outwards is kept."""
    s2 = caricature_warp(subj.copy(), strength=strength)
    s2.mask = egg_mask(s2, grow * (1.0 + 0.06 * strength))
    return s2


def bbox_of(alpha, thr=0.5):
    ys, xs = np.where(alpha > thr)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def place_subject(rgb, alpha, scale, cx, cy, canvas_size, src_anchor=None):
    """Scale an (S x S) subject and return (rgb, alpha) on a canvas of canvas_size with the subject anchor at (cx, cy)."""
    ax, ay = src_anchor if src_anchor else (S / 2, S / 2)
    M = np.array([[scale, 0, cx - ax * scale], [0, scale, cy - ay * scale]], np.float32)
    w, h = canvas_size
    o = cv2.warpAffine(rgb, M, (w, h), flags=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    a = cv2.warpAffine(alpha.astype(np.float32), M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    return o, a


def composite(base: Image.Image, rgb, alpha, xy=(0, 0)) -> Image.Image:
    layer = to_pil(rgb)
    base.paste(layer, xy, Image.fromarray((clamp01(alpha) * 255).astype(np.uint8), "L"))
    return base


# ----------------------------------------------------------------------------------------------------------------------------
# comic furniture
# ----------------------------------------------------------------------------------------------------------------------------
def caption_box(img: Image.Image, text, box, fill=YELLOW, ink=INK, role="narrow", max_size=34, tilt=0.0, shadow=4, max_lines=2):
    """A comic narration box with an offset shadow and a bold outline; optional tilt (degrees). Text shrinks to fit the box."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    pad = 10
    tile = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    d.rectangle((pad + shadow, pad + shadow, pad + w + shadow, pad + h + shadow), fill=(*ink, 255))
    d.rectangle((pad, pad, pad + w, pad + h), fill=(*fill, 255), outline=(*ink, 255), width=3)
    size = max_size
    while True:
        f = font(role, size)
        lines = wrap(d, text, f, w - 20)
        if (len(lines) <= max_lines and len(lines) * size * 1.08 <= h - 8) or size <= 11:
            break
        size -= 1
    lh = size * 1.08
    y = pad + h / 2 - lh * (len(lines) - 1) / 2
    for i, l in enumerate(lines):
        text_c(d, (pad + w / 2, y + i * lh), l, f, ink)
    if tilt:
        tile = tile.rotate(tilt, resample=Image.BICUBIC, expand=True)
    img.paste(tile, (int(x0 - pad - (tile.width - w - pad * 2) / 2), int(y0 - pad - (tile.height - h - pad * 2) / 2)), tile)


def speech_bubble(img: Image.Image, text, centre, size, tail, fill=(255, 255, 255), ink=INK, role="narrow", max_size=30):
    """Comic speech bubble: an ellipse with a tail pointing at `tail` (x, y), outlined in ink."""
    cx, cy = centre
    w, h = size
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    tx, ty = tail
    ang = math.atan2(ty - cy, tx - cx)
    bp = [(cx + w / 2 * math.cos(ang + da) * 0.8, cy + h / 2 * math.sin(ang + da) * 0.8) for da in (0.32, -0.32)]
    for grow, col in ((5, ink), (0, fill)):
        d.ellipse((cx - w / 2 - grow, cy - h / 2 - grow, cx + w / 2 + grow, cy + h / 2 + grow), fill=(*col, 255))
        d.polygon([bp[0], (tx, ty), bp[1]] if grow == 0 else [(bp[0][0] - 3, bp[0][1] - 3), (tx, ty), (bp[1][0] + 3, bp[1][1] + 3)], fill=(*col, 255))
    d.ellipse((cx - w / 2 + 1, cy - h / 2 + 1, cx + w / 2 - 1, cy + h / 2 - 1), fill=(*fill, 255))
    text_block(d, cx, cy, text, role, w * 0.78, max_size, ink, max_lines=3, min_size=11)
    img.paste(layer, (0, 0), layer)


def ribbon(img: Image.Image, text, y, h, fill=RED, ink=INK, text_fill=(255, 255, 255), role="display", max_size=40, skew=0):
    """Full-width ribbon across the picture with bold lettering."""
    d = ImageDraw.Draw(img)
    w = img.width
    d.rectangle((-4, y - 3, w + 4, y + h + 3), fill=ink)
    d.rectangle((-4, y, w + 4, y + h), fill=fill)
    f = fit_font(d, text, role, w - 30, max_size, 12, stroke=2)
    text_c(d, (w / 2, y + h / 2 + 1), text, f, text_fill, stroke=2, stroke_fill=ink)


def drips(draw, rng, x0, x1, y, colour, count=6, max_len=60, width=(3, 6)):
    for _ in range(count):
        x = rng.uniform(x0, x1)
        ln = rng.uniform(14, max_len)
        w = rng.uniform(*width)
        draw.rectangle((x - w / 2, y, x + w / 2, y + ln), fill=colour)
        draw.ellipse((x - w * 0.85, y + ln - w * 0.7, x + w * 0.85, y + ln + w * 0.9), fill=colour)


# ----------------------------------------------------------------------------------------------------------------------------
# registry
# ----------------------------------------------------------------------------------------------------------------------------
STYLE_FNS: dict = {}
STYLE_FMT: dict = {}


def style(name, fmt="jpg"):
    def deco(fn):
        STYLE_FNS[name] = fn
        STYLE_FMT[name] = fmt
        return fn
    return deco


@dataclass
class Ctx:
    assets: Path

    def subject(self, slug, size=S) -> Subject:
        return load_subject(slug, self.assets, size)


# ----------------------------------------------------------------------------------------------------------------------------
# STYLE: toon  (cel shading + bold ink, sunburst backdrop, caption box)
# ----------------------------------------------------------------------------------------------------------------------------
BACKDROPS = [
    (YELLOW, (255, 240, 190)), ((34, 211, 238), (190, 245, 252)), ((255, 140, 170), (255, 215, 225)), ((150, 120, 255), (215, 205, 255)),
    ((120, 225, 160), (205, 245, 215)), ((255, 160, 70), (255, 220, 170)),
]


def backdrop(size, variant, rays=18):
    a, b = BACKDROPS[variant % len(BACKDROPS)]
    bg = sunburst(size, [a, b], n=rays, centre=(0.5, 0.42), rot=variant * 0.3)
    d = ImageDraw.Draw(bg)
    rng = np.random.default_rng(seed_of("bd", variant))
    for _ in range(22):   # comic dots
        x, y, r = rng.uniform(0, size[0]), rng.uniform(0, size[1]), rng.uniform(3, 9)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255))
    return bg


@style("toon")
def toon(ctx, spec):
    """Full-bleed cel-shaded portrait: ink lines, a comic panel frame, a narration box and a burst."""
    subj = ctx.subject(spec["slug"])
    col = cel(subj.rgb, sat=1.6).astype(np.float32)
    ink = ink_lines(subj.rgb)
    out = col * (1 - 0.95 * ink[..., None]) + np.array(INK, np.float32) * 0.95 * ink[..., None]
    out = vignette(np.clip(out, 0, 255).astype(np.uint8), 0.25)
    img = to_pil(out)
    d = ImageDraw.Draw(img)
    v = spec.get("variant", 0)
    a, b = BACKDROPS[v % len(BACKDROPS)]
    starburst(d, S - 70, 78, 62, 40, 13, a, outline=INK, width=4, rot=0.2)
    text_c(d, (S - 70, 78), spec.get("burst", "!?"), font("display", 34), INK, anchor="mm")
    caption_box(img, spec["caption"], (24, S - 100, S - 24, S - 26), fill=YELLOW, max_size=38, tilt=-1.2)
    d.rectangle((0, 0, S - 1, S - 1), outline=INK, width=10)
    return img


# ----------------------------------------------------------------------------------------------------------------------------
# STYLE: bighead  (big-head / small-body caricature mascot on a backdrop; the same art exports as a transparent cut-out)
# ----------------------------------------------------------------------------------------------------------------------------
def draw_headset(img: Image.Image, head_box, ear_y, colour=(28, 28, 40), accent=RED, mic=True, width=22):
    """A chunky gamer headset around the head: band over the top, ear cups at ear height, a boom mic. head_box = (x0, y0, x1, y1)."""
    x0, y0, x1, y1 = head_box
    d = ImageDraw.Draw(img)
    cx, w = (x0 + x1) / 2, x1 - x0
    # band: thick arc above the head
    d.arc((x0 - 6, y0 - w * 0.03, x1 + 6, y0 + w * 1.25), 192, 348, fill=INK, width=width + 8)
    d.arc((x0 - 6, y0 - w * 0.03, x1 + 6, y0 + w * 1.25), 194, 346, fill=colour, width=width)
    d.arc((x0 + 6, y0 + w * 0.03, x1 - 6, y0 + w * 1.18), 200, 340, fill=accent, width=6)
    for sx in (x0 - 4, x1 + 4):
        cw, ch = 50, 88
        d.rounded_rectangle((sx - cw / 2 - 5, ear_y - ch / 2 - 5, sx + cw / 2 + 5, ear_y + ch / 2 + 5), 22, fill=INK)
        d.rounded_rectangle((sx - cw / 2, ear_y - ch / 2, sx + cw / 2, ear_y + ch / 2), 18, fill=colour)
        d.rounded_rectangle((sx - cw / 2 + 9, ear_y - ch / 2 + 9, sx + cw / 2 - 9, ear_y + ch / 2 - 9), 12, fill=accent)
    if mic:
        sx = x0 - 4
        pts = [(sx - 6, ear_y + 40), (sx - 26, ear_y + 100), (cx - w * 0.26, y1 - w * 0.06)]
        d.line(pts, fill=INK, width=12, joint="curve")
        d.line(pts, fill=colour, width=6, joint="curve")
        mx, my = pts[-1]
        d.ellipse((mx - 17, my - 13, mx + 17, my + 13), fill=INK)
        d.ellipse((mx - 12, my - 9, mx + 12, my + 9), fill=accent)


def draw_body(img: Image.Image, neck, pose="thumbs", suit=RED, scale=1.0, cup=False):
    """A tiny cartoon racing-suit body under a big head. `neck` is the (x, y) where the head's chin sits."""
    d = ImageDraw.Draw(img)
    nx, ny = neck
    k = scale
    def P(dx, dy):
        return (nx + dx * k, ny + dy * k)
    # legs and boots
    for sx in (-1, 1):
        d.rounded_rectangle((*P(sx * 26 - 15, 98), *P(sx * 26 + 15, 146)), 10 * k, fill=NAVY, outline=INK, width=4)
        d.rounded_rectangle((*P(sx * 26 - 20 + sx * 6, 138), *P(sx * 26 + 22 + sx * 6, 162)), 11 * k, fill=(250, 250, 250), outline=INK, width=4)
    # arms (drawn behind the torso)
    arm_w = 30 * k
    if pose == "thumbs":
        arms = {-1: [P(-50, 34), P(-96, 56), P(-92, 6)], 1: [P(50, 34), P(96, 56), P(92, 6)]}
    elif pose == "cheer":
        arms = {-1: [P(-50, 30), P(-100, 4), P(-112, -44)], 1: [P(50, 30), P(100, 4), P(112, -44)]}
    else:  # wave + cup
        arms = {-1: [P(-50, 34), P(-92, 58), P(-66, 96)], 1: [P(50, 30), P(100, 6), P(108, -38)]}
    for sx, pts in arms.items():
        d.line(pts, fill=INK, width=int(arm_w + 9), joint="curve")
        d.line(pts, fill=suit, width=int(arm_w), joint="curve")
        hx, hy = pts[-1]
        d.ellipse((hx - 21 * k, hy - 21 * k, hx + 21 * k, hy + 21 * k), fill=(255, 255, 255), outline=INK, width=4)
        if pose == "thumbs" or (pose == "wave" and sx == 1):
            d.rounded_rectangle((hx - 6 * k, hy - 40 * k, hx + 8 * k, hy - 12 * k), 6, fill=(255, 255, 255), outline=INK, width=3)
    if cup or pose == "wave":
        hx, hy = arms[-1][-1]
        d.polygon([(hx - 22, hy - 4), (hx + 22, hy - 4), (hx + 15, hy + 44), (hx - 15, hy + 44)], fill=(250, 250, 250), outline=INK)
        d.rectangle((hx - 24, hy - 12, hx + 24, hy - 2), fill=(120, 76, 50), outline=INK, width=3)
        d.arc((hx + 12, hy + 4, hx + 40, hy + 30), -90, 90, fill=INK, width=4)
    # torso
    d.rounded_rectangle((*P(-58, -4), *P(58, 112)), 34 * k, fill=INK)
    d.rounded_rectangle((*P(-54, -2), *P(54, 108)), 32 * k, fill=suit)
    d.rectangle((*P(-54, 70), *P(54, 82)), fill=(255, 255, 255))                      # racing stripes
    d.rectangle((*P(-54, 74), *P(54, 78)), fill=NAVY)
    d.rounded_rectangle((*P(-58, -4), *P(58, 112)), 34 * k, outline=INK, width=4)
    d.polygon([P(-36, -6), P(0, 22), P(36, -6), P(24, -10), P(0, 8), P(-24, -10)], fill=(255, 255, 255), outline=INK)   # collar
    d.ellipse((*P(18, 28), *P(44, 54)), fill=YELLOW, outline=INK, width=3)                # chest badge
    text_c(d, P(31, 41), "M", font("block", int(20 * k)), INK)


def bighead_art(ctx, slug, variant=0, pose="thumbs", canvas=(S, S), head_w=0.60, headset=True, suit=RED):
    """RGBA cut-out of the big-head mascot (egg-shaped caricature head, tiny racing-suit body, optional headset) on a transparent canvas."""
    w, h = canvas
    subj = head_cut(ctx.subject(slug), strength=1.0)
    rgb, alpha = cel_portrait(subj, outline=7)
    x0, y0, x1, y1 = bbox_of(alpha)
    sc = (w * head_w) / max(1, x1 - x0)
    top = h * 0.05
    cx_dst = w / 2
    # subject anchor (S/2, S/2) maps to (cx, cy) so that the bbox centre lands on cx_dst and its top on `top`
    ax, ay = (x0 + x1) / 2, y0
    o, a = place_subject(rgb, alpha, sc, cx_dst, top, canvas, src_anchor=(ax, ay))
    layer = Image.new("RGBA", canvas, (0, 0, 0, 0))
    chin = top + (y1 - y0) * sc
    draw_body(layer, (w / 2, chin - h * 0.035), pose=pose, scale=w / 512 * 0.78, suit=suit)
    head = Image.new("RGBA", canvas, (0, 0, 0, 0))
    head.paste(to_pil(o), (0, 0), Image.fromarray((clamp01(a) * 255).astype(np.uint8), "L"))
    layer.alpha_composite(head)
    if headset:
        hx0, hx1 = top, top
        ys, xs = np.where(a > 0.5)
        bx0, bx1, by0 = int(xs.min()), int(xs.max()), int(ys.min())
        ear_y = top + (y1 - y0) * sc * 0.56
        dummy = Image.new("RGBA", canvas, (0, 0, 0, 0))
        draw_headset(dummy, (bx0 + 6, by0 + 4, bx1 - 6, by0 + (bx1 - bx0) * 0.98), ear_y, accent=[RED, CYAN, PINK][variant % 3], width=int(14 * w / 512 * 1.3))
        layer.alpha_composite(dummy)
    return layer


@style("bighead")
def bighead(ctx, spec):
    """Big-head mascot on a sunburst backdrop with a comic caption box."""
    v = spec.get("variant", 0)
    img = backdrop((S, S), v + 2, rays=22).convert("RGBA")
    m = bighead_art(ctx, spec["slug"], v, pose=["thumbs", "cheer", "wave"][v % 3], canvas=(S, S), headset=spec.get("headset", v % 2 == 0))
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse((S * 0.28, S * 0.925, S * 0.72, S * 0.985), fill=(0, 0, 0, 90))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(6)))
    img.alpha_composite(m)
    out = img.convert("RGB")
    caption_box(out, spec["caption"], (24, S - 92, S - 24, S - 22), fill=(255, 255, 255), max_size=34, tilt=-1.2)
    ImageDraw.Draw(out).rectangle((0, 0, S - 1, S - 1), outline=INK, width=10)
    return out


@style("mascot", "png")
def mascot(ctx, spec):
    """The same mascot as a transparent cut-out (for stickers, standees and UI collage)."""
    v = spec.get("variant", 0)
    return bighead_art(ctx, spec["slug"], v, pose=["thumbs", "cheer", "wave"][v % 3], canvas=(S, S), headset=spec.get("headset", True))


@style("head")
def head(ctx, spec):
    """Square face texture for the 3D bobblehead statues: the caricature head filling the frame on a hair-coloured ground (planar-mapped onto a ball)."""
    subj = head_cut(ctx.subject(spec["slug"]), strength=1.0, grow=0.96)
    rgb, alpha = cel_portrait(subj, outline=5)
    x0, y0, x1, y1 = bbox_of(alpha)
    dark = rgb[(alpha > 0.9) & (np.arange(S)[:, None] < y0 + (y1 - y0) * 0.30)]
    lum = dark.astype(np.float32).sum(-1) if len(dark) else np.zeros(1)
    hair = tuple(int(v) for v in (dark[np.argsort(lum)[: max(1, len(lum) // 4)]].mean(0) if len(dark) else INK))
    sc = S * 0.86 / max(1, y1 - y0)
    o, a = place_subject(rgb, alpha, sc, S / 2, S * 0.07, (S, S), src_anchor=((x0 + x1) / 2, y0))
    bg = grad_radial((S, S), lerp_col(hair, (255, 255, 255), 0.06), lerp_col(hair, (0, 0, 0), 0.25), centre=(0.5, 0.45), radius=0.8)
    bg.paste(to_pil(o), (0, 0), Image.fromarray((clamp01(a) * 255).astype(np.uint8), "L"))
    return bg.resize((256, 256), Image.LANCZOS)


# ----------------------------------------------------------------------------------------------------------------------------
# STYLE: popart  (Lichtenstein-style Ben-Day dots, CMYK screens with misregistration, ink lines)
# ----------------------------------------------------------------------------------------------------------------------------
CMYK_INK = {"c": (0, 170, 235), "m": (232, 30, 135), "y": (255, 232, 20), "k": (26, 20, 40)}


def shift(a: np.ndarray, dx, dy) -> np.ndarray:
    M = np.array([[1, 0, dx], [0, 1, dy]], np.float32)
    return cv2.warpAffine(a, M, (a.shape[1], a.shape[0]), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def cmyk_halftone(rgb: np.ndarray, cell=7.0, misreg=2.0, gain=1.25, paper=CREAM) -> np.ndarray:
    f = rgb.astype(np.float32) / 255.0
    k = 1 - f.max(-1)
    den = np.maximum(1 - k, 1e-3)
    c, m, y = [(1 - f[..., i] - k) / den for i in range(3)]
    cov = {
        "c": shift(halftone_cov(c, cell, 15, gain), -misreg, -misreg * 0.5),
        "m": shift(halftone_cov(m, cell, 75, gain), misreg, misreg * 0.6),
        "y": halftone_cov(y, cell, 0, gain),
        "k": shift(halftone_cov(k, cell, 45, gain * 1.1), 0, misreg * 0.5),
    }
    out = np.ones(rgb.shape, np.float32) * np.array(paper, np.float32) / 255.0
    for key in ("y", "m", "c", "k"):
        ink = np.array(CMYK_INK[key], np.float32) / 255.0
        out *= 1 - cov[key][..., None] * (1 - ink)
    return np.clip(out * 255, 0, 255).astype(np.uint8)


def skin_map(rgb: np.ndarray) -> np.ndarray:
    """0..1 'is skin' map (YCrCb range test, cleaned and feathered). Used to colour faces differently from everything else."""
    ycc = cv2.cvtColor(rgb, cv2.COLOR_RGB2YCrCb)
    cr, cb = ycc[..., 1].astype(np.int32), ycc[..., 2].astype(np.int32)
    m = ((cr > 134) & (cr < 182) & (cb > 76) & (cb < 130) & (ycc[..., 0] > 40)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
    return cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.6)


def benday(tone: np.ndarray, cell=9.0, angle=45, gain=1.3) -> np.ndarray:
    return halftone_cov(tone, cell, angle, gain, blur=cell * 0.35)


@style("popart")
def popart(ctx, spec):
    """Comic-book print: skin in flat peach with red Ben-Day shadows, black hair, flat bright background dots, misregistered ink."""
    subj = ctx.subject(spec["slug"])
    v = spec.get("variant", 0)
    sm = subj.rgb[..., ::-1].copy()
    for _ in range(3):
        sm = cv2.bilateralFilter(sm, 9, 50, 8)
    rgb = sm[..., ::-1]
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
    g = cv2.GaussianBlur(gray, (0, 0), 1.3)
    lo, hi = np.percentile(g, 3), np.percentile(g, 97)
    t = clamp01((g - lo) / max(hi - lo, 0.05))                       # 0 dark .. 1 light
    skin = skin_map(rgb)
    bg_a, bg_b = [((255, 214, 64), (255, 130, 40)), ((70, 200, 240), (20, 110, 210)), ((255, 120, 170), (220, 40, 120))][v % 3]
    peach, deep = (255, 212, 178), (232, 64, 72)
    # skin: peach base, red dots in the mid shadows, flat red in the deep shadows
    sk_t = t[skin > 0.5]
    thr = float(np.clip(np.median(sk_t) + 0.04, 0.38, 0.72)) if sk_t.size > 400 else 0.56   # adapt to dim and over-exposed faces
    shadow = clamp01((thr - t) / 0.34)
    red_cov = benday(shadow, 9.0, 45, 1.35)
    skin_col = np.array(peach, np.float32)[None, None] * (1 - red_cov[..., None]) + np.array(deep, np.float32)[None, None] * red_cov[..., None]
    # background and clothes: a flat bright colour with darker dots following the picture
    dots = benday(clamp01((0.60 - t) * 1.7), 10.0, 45, 1.3)
    bg_col = np.array(bg_a, np.float32)[None, None] * (1 - dots[..., None]) + np.array(bg_b, np.float32)[None, None] * dots[..., None]
    col = skin_col * skin[..., None] + bg_col * (1 - skin[..., None])
    hair = (1 - skin) * clamp01((0.30 - t) / 0.10)                   # dark non-skin areas turn solid black
    col = col * (1 - hair[..., None]) + np.array(INK, np.float32) * hair[..., None]
    col = shift(col, 3.0, 2.0)                                       # the colour plate is slightly off register with the black plate
    ink = ink_lines(subj.rgb, sigma=1.05, eps=-0.03, thick=1)
    out = col * (1 - 0.96 * ink[..., None]) + np.array(INK, np.float32) * 0.96 * ink[..., None]
    img = to_pil(np.clip(out, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    starburst(d, 96, S - 158, 84, 52, 14, [YELLOW, (255, 255, 255), CYAN][v % 3], outline=INK, width=5, rot=0.3)
    word = spec.get("burst", "POW!")
    text_c(d, (96, S - 158), word, fit_font(d, word, "display", 100, 32, 14), INK)
    speech_bubble(img, spec["caption"], (S - 168, 96), (300, 138), (S - 230, 230), max_size=34)
    d.rectangle((0, 0, S - 1, S - 1), outline=INK, width=10)
    return img


@style("paint", "png")
def paint(ctx, spec):
    """Road paint: a white halftone portrait on a dark, yellow-ringed disc, transparent around it (for painting onto asphalt and grass)."""
    subj = head_cut(ctx.subject(spec["slug"]), strength=0.6, grow=1.02)
    gray = cv2.cvtColor(subj.rgb, cv2.COLOR_RGB2GRAY)
    gray = cv2.createCLAHE(2.5, (6, 6)).apply(gray)
    tone = clamp01((cv2.GaussianBlur(gray, (0, 0), 1.2).astype(np.float32) / 255 - 0.10) / 0.80)
    cov = halftone_cov(tone ** 0.8, 7.0, 45, 1.3)                  # dots sit where the picture is LIGHT, so the face reads as white paint
    # head cut-out scaled into the disc, face centred
    x0, y0, x1, y1 = bbox_of(subj.mask)
    sc = 330.0 / max(y1 - y0, x1 - x0)
    M = np.array([[sc, 0, S / 2 - (x0 + x1) / 2 * sc], [0, sc, S / 2 - (y0 + y1) / 2 * sc + 4]], np.float32)
    cov = cv2.warpAffine(cov, M, (S, S), flags=cv2.INTER_AREA, borderValue=0)
    hm = cv2.warpAffine(subj.mask.astype(np.float32), M, (S, S), flags=cv2.INTER_LINEAR, borderValue=0)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    r = np.hypot(xx - S / 2, yy - S / 2)
    disc = clamp01((226 - r) + 0.5)
    white = clamp01(cov * hm * 1.05) * disc
    rgba = np.zeros((S, S, 4), np.float32)
    rgba[..., :3] = np.array((12, 12, 22), np.float32)
    rgba[..., 3] = disc * 0.78
    for ch, val in zip(range(3), (252, 252, 246)):
        rgba[..., ch] = rgba[..., ch] * (1 - white) + val * white
    rgba[..., 3] = np.maximum(rgba[..., 3], white)
    img = Image.fromarray(np.clip(rgba * np.array([1, 1, 1, 255], np.float32), 0, 255).astype(np.uint8), "RGBA")
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse((S / 2 - 250, S / 2 - 250, S / 2 + 250, S / 2 + 250), fill=(255, 205, 40, 255))
    d.ellipse((S / 2 - 228, S / 2 - 228, S / 2 + 228, S / 2 + 228), fill=(0, 0, 0, 0))
    img = Image.alpha_composite(img, layer)
    text_on_circle(img, "MARCOVERSE", (S / 2, S / 2), 204, 34, (255, 255, 255, 255), "block", start_deg=-90)
    text_on_circle(img, "CLOUD AND PROUD", (S / 2, S / 2), 204, 28, (255, 209, 102, 255), "block", start_deg=90, inward=True)
    return img


# ----------------------------------------------------------------------------------------------------------------------------
# STYLE: riso  (two-ink risograph print: fluorescent pink + blue on cream stock, grain, misregistration)
# ----------------------------------------------------------------------------------------------------------------------------
@style("riso")
def riso(ctx, spec):
    subj = ctx.subject(spec["slug"])
    v = spec.get("variant", 0)
    inks = [((255, 72, 176), (0, 120, 191)), ((255, 102, 94), (0, 131, 138)), ((255, 200, 0), (60, 80, 200))][v % 3]
    gray = cv2.cvtColor(cv2.pyrMeanShiftFiltering(subj.rgb[..., ::-1].copy(), 20, 12, 1), cv2.COLOR_BGR2GRAY)
    gray = cv2.createCLAHE(2.0, (4, 4)).apply(gray)
    g = cv2.GaussianBlur(gray, (0, 0), 1.2).astype(np.float32) / 255.0
    lo, hi = np.percentile(g, 4), np.percentile(g, 96)
    g = clamp01((g - lo) / max(hi - lo, 0.05))
    rng = rng_for("riso", spec["slug"], v)
    grain = cv2.resize(cv2.GaussianBlur(rng.random((S // 2, S // 2)).astype(np.float32), (0, 0), 0.7), (S, S), interpolation=cv2.INTER_CUBIC)
    grain = (grain - grain.mean()) / (grain.std() + 1e-6)
    a_m = cv2.medianBlur(((g < 0.66).astype(np.uint8) * 255), 7).astype(np.float32) / 255      # mid tones: the light ink
    b_m = cv2.medianBlur(((g < 0.30).astype(np.uint8) * 255), 7).astype(np.float32) / 255      # shadows: the dark ink on top
    a_cov = clamp01(cv2.GaussianBlur(a_m, (0, 0), 0.7) * (0.92 + 0.05 * grain))
    b_cov = clamp01(cv2.GaussianBlur(b_m, (0, 0), 0.7) * (0.94 + 0.05 * grain[::-1, ::-1]))
    paper = to_np(paper_texture((S, S), seed_of("riso", spec["slug"]), base=(244, 238, 222), grain=3, fibres=False)).astype(np.float32) / 255
    out = paper.copy()
    for cov, ink in ((shift(a_cov, 3.0, 2.0), inks[0]), (shift(b_cov, -3, -2), inks[1])):
        out *= 1 - cov[..., None] * (1 - np.array(ink, np.float32) / 255 * 0.98)
    img = to_pil(np.clip(out * 255, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    d.rectangle((0, S - 104, S, S), fill=(244, 238, 222))
    d.rectangle((14, S - 104, S - 15, S - 100), fill=inks[1])
    text_block(d, S / 2 + 3, S - 52 + 2, spec["caption"], "block", S - 70, 38, inks[1], max_lines=2, min_size=16)
    text_block(d, S / 2, S - 52, spec["caption"], "block", S - 70, 38, inks[0], max_lines=2, min_size=16)
    d.rectangle((10, 10, S - 11, S - 11), outline=inks[1], width=4)
    return img


# ----------------------------------------------------------------------------------------------------------------------------
# shared helpers for the remaining styles
# ----------------------------------------------------------------------------------------------------------------------------
def gradient_map(gray01: np.ndarray, stops) -> np.ndarray:
    """Map a 0..1 tone image through colour `stops` (evenly spaced) -> uint8 RGB."""
    n = len(stops) - 1
    g = clamp01(gray01) * n
    i = np.minimum(g.astype(np.int32), n - 1)
    f = (g - i)[..., None]
    pal = np.array(stops, np.float32)
    return np.clip(pal[i] * (1 - f) + pal[i + 1] * f, 0, 255).astype(np.uint8)


def tone_of(subj: Subject, blur=1.2, clahe=2.4) -> np.ndarray:
    """Contrast-stretched 0..1 luminance of the subject photo (dark = 0)."""
    g = cv2.cvtColor(cv2.bilateralFilter(subj.rgb[..., ::-1].copy(), 9, 40, 7), cv2.COLOR_BGR2GRAY)
    g = cv2.createCLAHE(clahe, (4, 4)).apply(g)
    g = cv2.GaussianBlur(g, (0, 0), blur).astype(np.float32) / 255
    lo, hi = np.percentile(g, 3), np.percentile(g, 97)
    return clamp01((g - lo) / max(hi - lo, 0.05))


def head_layer(ctx, slug, width, colourise=None, strength=0.8, outline=6, ink=True, bands=8):
    """(RGBA PIL image with the caricature head scaled so its bounding box is `width` px wide and exactly as tall as it comes, bbox h).
    `colourise(subj, rgb)` may replace the colours (duotone etc.); the ink outline is always drawn."""
    subj = head_cut(ctx.subject(slug), strength=strength)
    rgb, alpha = cel_portrait(subj, bands=bands, outline=outline)
    if colourise is not None:
        tone = tone_of(subj)
        col = colourise(subj, tone).astype(np.float32)
        inkl = ink_lines(subj.rgb) if ink else np.zeros_like(tone)
        col = col * (1 - 0.92 * inkl[..., None]) + np.array(INK, np.float32) * 0.92 * inkl[..., None]
        sil = clamp01(dilate((subj.mask > 0.5).astype(np.float32), outline) - erode((subj.mask > 0.5).astype(np.float32), 1))
        sil = cv2.GaussianBlur(sil, (0, 0), 0.8)
        col = col * (1 - sil[..., None]) + np.array(INK, np.float32) * sil[..., None]
        rgb = np.clip(col, 0, 255).astype(np.uint8)
    x0, y0, x1, y1 = bbox_of(alpha)
    sc = width / max(1, x1 - x0)
    bw, bh = int(round((x1 - x0 + 1) * sc)), int(round((y1 - y0 + 1) * sc))
    crop_rgb = cv2.resize(rgb[y0:y1 + 1, x0:x1 + 1], (bw, bh), interpolation=cv2.INTER_AREA if sc < 1 else cv2.INTER_CUBIC)
    crop_a = cv2.resize(alpha[y0:y1 + 1, x0:x1 + 1].astype(np.float32), (bw, bh), interpolation=cv2.INTER_LINEAR)
    im = Image.fromarray(np.dstack([crop_rgb, (clamp01(crop_a) * 255).astype(np.uint8)]), "RGBA")
    return im, bh


def paste_rgba(base: Image.Image, top: Image.Image, xy):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    layer.paste(top, (int(xy[0]), int(xy[1])))
    base.alpha_composite(layer)


def glow_of(alpha: np.ndarray, colour, radius=14, strength=1.0) -> Image.Image:
    g = cv2.GaussianBlur(clamp01(dilate(alpha.astype(np.float32), 3)), (0, 0), radius) * strength
    a = (clamp01(g) * 255).astype(np.uint8)
    lay = Image.new("RGBA", alpha.shape[::-1], (*colour, 0))
    lay.putalpha(Image.fromarray(a, "L"))
    return lay


def stripes(size, angle_deg, gap, width, colour, bg=None) -> Image.Image:
    w, h = size
    im = Image.new("RGBA", (w, h), (*bg, 255) if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    L = int(math.hypot(w, h))
    c, s = math.cos(math.radians(angle_deg)), math.sin(math.radians(angle_deg))
    for k in range(-L // gap, L // gap + 1):
        ox, oy = w / 2 + (-s) * k * gap, h / 2 + c * k * gap
        d.line([(ox - c * L, oy - s * L), (ox + c * L, oy + s * L)], fill=(*colour, 255), width=width)
    return im


def round_corners(im: Image.Image, r: int) -> Image.Image:
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, im.width - 1, im.height - 1), r, fill=255)
    out = im.convert("RGBA")
    out.putalpha(ImageChops.multiply(out.getchannel("A"), m))
    return out


# ----------------------------------------------------------------------------------------------------------------------------
# STYLE: synth  (synthwave duotone: gradient-mapped head, striped sun, grid floor, scanlines, neon caption)   640 x 360
# ----------------------------------------------------------------------------------------------------------------------------
@style("synth")
def synth(ctx, spec):
    W, H = 640, 360
    v = spec.get("variant", 0)
    pal = [((18, 4, 46), (110, 12, 150), (255, 58, 170), (255, 214, 130)), ((6, 10, 38), (12, 80, 170), (34, 211, 238), (236, 250, 255)),
           ((30, 4, 30), (150, 10, 70), (255, 120, 60), (255, 236, 160))][v % 3]
    sky_top, sky_mid, neon, hot = pal
    hz = int(H * 0.60)
    img = grad_v((W, hz), sky_top, lerp_col(sky_mid, neon, 0.55)).convert("RGBA")
    base = Image.new("RGBA", (W, H), (*sky_top, 255))
    base.paste(img, (0, 0))
    d = ImageDraw.Draw(base)
    rng = rng_for("synth", spec["slug"], v)
    for _ in range(46):                                                # stars
        x, y = rng.uniform(0, W), rng.uniform(0, hz * 0.7)
        d.ellipse((x - 1, y - 1, x + 1, y + 1), fill=(255, 255, 255, int(rng.uniform(90, 230))))
    sun_c, sun_r = (W * 0.74, hz - 4), 104
    sun = grad_v((sun_r * 2, sun_r * 2), hot, neon).convert("RGBA")
    m = Image.new("L", sun.size, 0)
    md = ImageDraw.Draw(m)
    md.ellipse((0, 0, sun_r * 2 - 1, sun_r * 2 - 1), fill=255)
    for k in range(9):                                                 # stripes cut out of the lower half of the sun
        y0 = sun_r + 8 + k * 14 + k * k * 0.8
        md.rectangle((0, y0, sun_r * 2, y0 + 2 + k * 1.3), fill=0)
    base.paste(sun, (int(sun_c[0] - sun_r), int(sun_c[1] - sun_r)), m)
    d.rectangle((0, hz, W, H), fill=(*lerp_col(sky_top, (0, 0, 0), 0.25), 255))        # floor
    fl = grad_v((W, H - hz), lerp_col(sky_mid, neon, 0.25), sky_top).convert("RGBA")
    base.paste(fl, (0, hz))
    d = ImageDraw.Draw(base)
    for k in range(-16, 17):                                           # perspective grid
        d.line([(W / 2 + k * 6, hz), (W / 2 + k * 92, H)], fill=(*neon, 210), width=2)
    y, step = hz + 3, 3.0
    while y < H:
        d.line([(0, y), (W, y)], fill=(*neon, 200), width=2)
        step *= 1.32
        y += step
    d.line([(0, hz), (W, hz)], fill=(*hot, 255), width=3)
    # the head, gradient-mapped, with a neon halo
    def duo(subj, tone):
        return gradient_map(tone ** 0.9, [sky_top, sky_mid, neon, hot])
    head_im, bh = head_layer(ctx, spec["slug"], 272, colourise=duo, strength=0.7)
    hx, hy = int(W * 0.29 - head_im.width / 2), int(H * 0.93 - bh)
    a = np.zeros((H, W), np.float32)
    ha = np.asarray(head_im.getchannel("A")).astype(np.float32) / 255
    y0c, x0c = max(0, hy), max(0, hx)
    a[y0c:y0c + ha.shape[0], x0c:x0c + ha.shape[1]] = ha[: H - y0c, : W - x0c] if (y0c == hy and x0c == hx) else 0
    base.alpha_composite(glow_of(a, neon, 16, 1.2))
    paste_rgba(base, head_im, (hx, hy))
    # scanlines, caption
    sl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sl)
    for yy in range(0, H, 4):
        sd.rectangle((0, yy, W, yy), fill=(0, 0, 0, 46))
    base.alpha_composite(sl)
    d = ImageDraw.Draw(base)
    cap = spec["caption"]
    f = fit_font(d, cap, "display", W * 0.40, 52, 18, stroke=3)
    lines = wrap(d, cap, f, int(W * 0.40))[:3]
    for i, ln in enumerate(lines):
        y = H * 0.40 + i * (f.size * 1.05) - (len(lines) - 1) * f.size * 0.5
        text_c(d, (W * 0.74 + 2, y + 3), ln, f, (*neon, 255), stroke=3, stroke_fill=(*sky_top, 255))
        text_c(d, (W * 0.74, y), ln, f, (255, 255, 255, 255), stroke=2, stroke_fill=(*sky_top, 255))
    d.rectangle((6, 6, W - 7, H - 7), outline=(*neon, 255), width=3)
    return base.convert("RGB")


# ----------------------------------------------------------------------------------------------------------------------------
# STYLE: stencil  (graffiti: black + colour stencil with overspray, a tag and drips on brick or concrete)   640 x 320
# ----------------------------------------------------------------------------------------------------------------------------
def wall_texture(size, seed, kind="brick") -> Image.Image:
    w, h = size
    r = np.random.default_rng(seed)
    if kind == "brick":
        base = np.zeros((h, w, 3), np.float32)
        bh, bw = 26, 66
        for row in range(h // bh + 2):
            off = (row % 2) * bw / 2
            for col in range(-1, w // bw + 2):
                x0, y0 = int(col * bw - off), row * bh
                tint = np.array([150, 70, 52], np.float32) + r.normal(0, 14, 3) * np.array([1, 0.7, 0.6])
                base[max(0, y0):max(0, y0 + bh - 3), max(0, x0):max(0, x0 + bw - 3)] = tint
        mortar = base.sum(-1) == 0
        base[mortar] = (196, 188, 172)
    else:
        base = np.ones((h, w, 3), np.float32) * np.array([168, 166, 160], np.float32)
        blot = cv2.GaussianBlur(r.normal(0, 1, (h, w)).astype(np.float32), (0, 0), 28)
        base += (blot * 26)[..., None]
        for _ in range(9):   # panel seams
            x = int(r.uniform(0, w))
            base[:, x:x + 2] *= 0.82
    base += r.normal(0, 6, (h, w, 1)) + cv2.GaussianBlur(r.normal(0, 1, (h, w)).astype(np.float32), (0, 0), 3)[..., None] * 14
    return to_pil(np.clip(base, 0, 255).astype(np.uint8))


@style("stencil")
def stencil(ctx, spec):
    W, H = 640, 320
    v = spec.get("variant", 0)
    colour = [RED, (34, 190, 230), (255, 190, 40), (255, 61, 160)][v % 4]
    wall = wall_texture((W, H), seed_of("stencil", spec["slug"]), "brick" if v % 2 == 0 else "concrete").convert("RGBA")
    rng = rng_for("stencil", spec["slug"], v)
    subj = head_cut(ctx.subject(spec["slug"]), strength=0.6, grow=1.0)
    tone = tone_of(subj, blur=1.5, clahe=3.0)
    x0, y0, x1, y1 = bbox_of(subj.mask)
    hh = 262
    sc = hh / max(1, y1 - y0)
    M = np.array([[sc, 0, 64 - x0 * sc + 14], [0, sc, 44 - y0 * sc]], np.float32)
    def warp(a):
        return cv2.warpAffine(a.astype(np.float32), M, (W, H), flags=cv2.INTER_AREA, borderValue=0)
    tt, mm = warp(tone), warp(subj.mask)
    black = cv2.medianBlur(((tt < 0.30) * 255).astype(np.uint8), 5).astype(np.float32) / 255 * (mm > 0.5)
    mid = cv2.medianBlur((((tt >= 0.30) & (tt < 0.58)) * 255).astype(np.uint8), 5).astype(np.float32) / 255 * (mm > 0.5)
    sil = clamp01(dilate((mm > 0.5).astype(np.float32), 3) - erode((mm > 0.5).astype(np.float32), 2))
    black = np.maximum(black, sil)
    def spray(layer, col, dark=1.0):
        nonlocal wall
        lay = cv2.GaussianBlur(layer, (0, 0), 0.9)
        halo = cv2.GaussianBlur(layer, (0, 0), 7) * 0.22
        speck = (rng.random((H, W)) < 0.0035 * (cv2.GaussianBlur(layer, (0, 0), 14) > 0.05)).astype(np.float32)
        a = clamp01(np.maximum(lay * 0.96, halo) + cv2.GaussianBlur(speck, (0, 0), 0.6) * 1.4) * dark
        ov = Image.new("RGBA", (W, H), (*col, 0))
        ov.putalpha(Image.fromarray((a * 255).astype(np.uint8), "L"))
        wall = Image.alpha_composite(wall, ov)
    spray(mid, colour)
    spray(black, (16, 14, 20))
    d = ImageDraw.Draw(wall)
    # crown / halo accessory for variety
    cx = 64 + 14 + (x0 + x1) / 2 * sc - x0 * sc
    top_y = 56
    if v % 3 == 1:
        pts = [(cx - 54, top_y + 8), (cx - 54, top_y - 34), (cx - 27, top_y - 6), (cx, top_y - 44), (cx + 27, top_y - 6), (cx + 54, top_y - 34), (cx + 54, top_y + 8)]
        d.polygon(pts, fill=(255, 205, 40, 255), outline=(16, 14, 20, 255))
        d.line(pts + [pts[0]], fill=(16, 14, 20, 255), width=4)
    # the tag: stencil lettering with a drop shadow, right-hand side
    cap = spec["caption"]
    f = fit_font(d, cap, "narrow", 300, 84, 26, stroke=0)
    lines = wrap(d, cap, f, 300)[:3]
    while len(lines) > 2 and f.size > 28:
        f = font("narrow", f.size - 4)
        lines = wrap(d, cap, f, 300)[:3]
    tx, ty = 478, 160 - (len(lines) - 1) * f.size * 0.55
    tl = Image.new("L", (W, H), 0)
    td = ImageDraw.Draw(tl)
    for i, ln in enumerate(lines):
        text_c(td, (tx, ty + i * f.size * 1.1), ln, f, 255)
    tag = np.asarray(tl).astype(np.float32) / 255
    tag = cv2.dilate(tag, np.ones((2, 2), np.uint8))
    spray(shift(tag, 3, 3), (16, 14, 20))
    spray(tag, (250, 244, 232))
    # drips under the black areas and the tag
    dl = ImageDraw.Draw(wall)
    ys, xs = np.where(black > 0.9)
    if len(xs):
        for _ in range(7):
            k = rng.integers(0, len(xs))
            x, y = xs[k], ys[k]
            if y > H * 0.55:
                ln, wd = rng.uniform(14, 52), rng.uniform(2.5, 4.5)
                ln = max(4.0, min(ln, H - 3 - y - wd))
                dl.rectangle((x - wd / 2, y, x + wd / 2, min(H - 2, y + ln)), fill=(16, 14, 20, 235))
                dl.ellipse((x - wd * 0.8, y + ln - wd * 0.6, x + wd * 0.8, min(H - 1, y + ln + wd)), fill=(16, 14, 20, 235))
    arr = np.asarray(wall.convert("RGB")).astype(np.float32)
    arr = vignette(arr.astype(np.uint8), 0.3)
    return to_pil(arr)


# ----------------------------------------------------------------------------------------------------------------------------
# STYLE: wanted  (aged-parchment reward poster, sepia print of the face, a ludicrous crime)   512 x 640
# ----------------------------------------------------------------------------------------------------------------------------
@style("wanted")
def wanted(ctx, spec):
    W, H = 512, 640
    subj = ctx.subject(spec["slug"])
    rng = rng_for("wanted", spec["slug"])
    paper = paper_texture((W, H), seed_of("wanted", spec["slug"]), base=(228, 204, 160), grain=4)
    arr = np.asarray(paper).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    edge = np.minimum.reduce([xx, W - 1 - xx, yy, H - 1 - yy]) / 70.0
    burn = 1 - 0.55 * (1 - clamp01(edge)) ** 2 * (0.6 + 0.4 * cv2.GaussianBlur(rng.random((H, W)).astype(np.float32), (0, 0), 9) * 2)
    arr *= burn[..., None] * np.array([1, 0.96, 0.88])
    img = to_pil(np.clip(arr, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    BR = (58, 36, 22)
    fw = font("serif", 140)
    text_c(d, (W / 2, 92), "WANTED", fit_font(d, "WANTED", "serif", W - 70, 150, 40), BR)
    d.line((40, 158, W - 40, 158), fill=BR, width=4)
    text_c(d, (W / 2, 184), spec.get("sub", "DEAD OR AWAKE"), font("serif", 26), BR)
    # sepia photo
    px0, py0, pw, ph = 86, 200, 340, 268
    tone = tone_of(subj, blur=0.8, clahe=2.0)
    big = cv2.resize(tone, (S, S))
    x0, y0 = int(subj.cx - pw / 2 * 0.95), int(subj.eye_y - ph * 0.42 * 0.95)
    crop = big[max(0, y0):max(0, y0) + int(ph * 0.95), max(0, x0):max(0, x0) + int(pw * 0.95)]
    crop = cv2.resize(crop, (pw, ph), interpolation=cv2.INTER_AREA)
    sep = gradient_map(crop ** 1.05, [(30, 18, 10), (98, 62, 34), (190, 146, 92), (238, 214, 168)])
    sep = vignette(sep, 0.45)
    img.paste(to_pil(sep), (px0, py0))
    d.rectangle((px0 - 6, py0 - 6, px0 + pw + 6, py0 + ph + 6), outline=BR, width=6)
    d.rectangle((px0 - 14, py0 - 14, px0 + pw + 14, py0 + ph + 14), outline=BR, width=2)
    # the crime
    d.line((40, 494, W - 40, 494), fill=BR, width=3)
    text_c(d, (W / 2, 512), "FOR", font("serif", 22), BR)
    text_block(d, W / 2, 558, spec["caption"], "serif", W - 80, 34, (150, 28, 24), max_lines=2, min_size=16)
    text_c(d, (W / 2, 614), spec.get("reward", "REWARD: ONE CUPPA. NO BISCUITS."), fit_font(d, spec.get("reward", "REWARD: ONE CUPPA. NO BISCUITS."), "serif", W - 70, 20, 11), BR)
    # nail holes and a coffee ring for good measure
    for (nx, ny) in ((22, 22), (W - 22, 22)):
        d.ellipse((nx - 7, ny - 7, nx + 7, ny + 7), fill=(60, 40, 30))
    ring = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(ring).ellipse((W - 150, H - 120, W - 40, H - 10), outline=(120, 76, 40, 60), width=6)
    img = Image.alpha_composite(img.convert("RGBA"), ring.filter(ImageFilter.GaussianBlur(1.2))).convert("RGB")
    return img


# ----------------------------------------------------------------------------------------------------------------------------
# STYLE: constructivist  (red / black / cream propaganda-style poster, diagonal bars, tilted photo)   512 x 640
# ----------------------------------------------------------------------------------------------------------------------------
@style("constructivist")
def constructivist(ctx, spec):
    W, H = 512, 640
    subj = ctx.subject(spec["slug"])
    cream, red, blk = (238, 227, 200), (214, 40, 40), (22, 18, 22)
    img = Image.new("RGBA", (W, H), (*cream, 255))
    d = ImageDraw.Draw(img)
    d.ellipse((W * 0.30, H * 0.05, W * 1.05, H * 0.05 + W * 0.75), fill=(*red, 255))
    tone = tone_of(subj, blur=1.0, clahe=2.6)
    duo = np.where((tone < 0.34)[..., None], np.array(blk, np.uint8), np.where((tone < 0.64)[..., None], np.array(red, np.uint8), np.array(cream, np.uint8))).astype(np.uint8)
    duo = cv2.medianBlur(duo, 5)
    ph = to_pil(cv2.resize(duo, (330, 330), interpolation=cv2.INTER_AREA)).convert("RGBA")
    pm = Image.new("L", ph.size, 0)
    ImageDraw.Draw(pm).polygon([(0, 14), (ph.width - 18, 0), (ph.width, ph.height - 20), (22, ph.height)], fill=255)
    ph.putalpha(pm)
    ph = ph.rotate(6, resample=Image.BICUBIC, expand=True)
    img.alpha_composite(ph, (34, 96))
    # black diagonal bar with the slogan (two lines, always inside the picture), the burst sits on the red disc
    bar = Image.new("RGBA", (W + 120, 132), (*blk, 255))
    bd = ImageDraw.Draw(bar)
    cap = spec["caption"]
    f = fit_font(bd, cap, "narrow", W - 70, 44, 16)
    lines = wrap(bd, cap, f, W - 70)[:2] if bd.textlength(cap, font=f) > W - 70 else [cap]
    for i, ln in enumerate(lines):
        text_c(bd, ((W + 120) / 2, 66 + (i - (len(lines) - 1) / 2) * f.size * 1.12), ln, f, cream)
    bar = bar.rotate(-9, resample=Image.BICUBIC, expand=True)
    img.alpha_composite(bar, (-60, 420))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W, 34), fill=(*blk, 255))
    text_c(d, (W / 2, 18), "MARCOVERSE   *   RIO   *   WORKERS OF THE CLOUD", font("narrow", 17), cream)
    text_c(d, (W * 0.76, 168), spec.get("burst", "READ!"), font("display", 76), cream, stroke=5, stroke_fill=blk)
    d.line((30, 620, W - 30, 620), fill=blk, width=4)
    return img.convert("RGB")


# ----------------------------------------------------------------------------------------------------------------------------
# STYLE: pixel  (8-bit bust: 96 x 96 grid, 16-colour palette, ordered dither, pixel caption, nearest-neighbour upscale to 384)
# ----------------------------------------------------------------------------------------------------------------------------
BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) / 16.0 - 0.5


def quantise_pico(rgb: np.ndarray, spread=38.0) -> np.ndarray:
    h, w = rgb.shape[:2]
    thr = np.tile(BAYER4, (h // 4 + 1, w // 4 + 1))[:h, :w]
    f = rgb.astype(np.float32) + (thr * spread)[..., None]
    pal = np.array(PICO, np.float32)
    d = ((f[:, :, None, :] - pal[None, None, :, :]) ** 2).sum(-1)
    return pal[d.argmin(-1)].astype(np.uint8)


@style("pixel", "png")
def pixel(ctx, spec):
    G = 96
    v = spec.get("variant", 0)
    bg = [(41, 173, 255), (126, 37, 83), (0, 135, 81), (255, 119, 168)][v % 4]
    subj = head_cut(ctx.subject(spec["slug"]), strength=0.9)
    col, alpha = cel_portrait(subj, bands=6, sat=1.6, outline=5)
    x0, y0, x1, y1 = bbox_of(alpha)
    bw = 58
    bh = min(66, int(bw * (y1 - y0) / max(1, x1 - x0)))
    c = cv2.resize(col[y0:y1 + 1, x0:x1 + 1], (bw, bh), interpolation=cv2.INTER_AREA)
    m = cv2.resize(alpha[y0:y1 + 1, x0:x1 + 1].astype(np.float32), (bw, bh), interpolation=cv2.INTER_AREA) > 0.45
    small = Image.new("RGB", (G, G), bg)
    sd = ImageDraw.Draw(small)
    for yy in range(0, G, 2):                      # checkerboard backdrop
        for xx in range((yy // 2) % 2 * 2, G, 4):
            sd.rectangle((xx, yy, xx + 1, yy + 1), fill=lerp_col(bg, (255, 255, 255), 0.18))
    q = quantise_pico(c, spread=22.0)
    head = np.zeros((G, G, 3), np.uint8)
    hm = np.zeros((G, G), bool)
    ox, oy = (G - bw) // 2, 6
    head[oy:oy + bh, ox:ox + bw] = q
    hm[oy:oy + bh, ox:ox + bw] = m
    out = np.asarray(small).copy()
    # a pixel racing-suit torso under the chin, drawn first so the head overlaps it
    ty = min(G - 26, oy + bh - 4)
    out[ty:G - 16, G // 2 - 20:G // 2 + 20] = PICO[0]
    out[ty + 1:G - 16, G // 2 - 19:G // 2 + 19] = PICO[8]
    out[ty + 8:ty + 11, G // 2 - 19:G // 2 + 19] = PICO[7]
    edge = cv2.dilate(hm.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    out[edge] = PICO[0]
    out[hm] = head[hm]
    img = Image.fromarray(out)
    d = ImageDraw.Draw(img)
    d.rectangle((0, G - 16, G, G), fill=PICO[0])
    d.fontmode = "1"
    cap = spec.get("short", "P1 READY").upper()
    ff = font("mono", 11)
    while d.textlength(cap, font=ff) > G - 8 and ff.size > 6:
        ff = font("mono", ff.size - 1)
    d.text((G / 2, G - 8), cap, font=ff, fill=PICO[10], anchor="mm")
    d.rectangle((0, 0, G - 1, G - 1), outline=PICO[0], width=2)
    return img.resize((384, 384), Image.NEAREST).convert("RGB")


# ----------------------------------------------------------------------------------------------------------------------------
# STYLE: card  (holographic sports / trading card with stat bars)   384 x 544
# ----------------------------------------------------------------------------------------------------------------------------
@style("card")
def card(ctx, spec):
    W, H = 384, 544
    v = spec.get("variant", 0)
    hue_shift = v * 0.23
    # rainbow foil border
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    hsv = np.zeros((H, W, 3), np.uint8)
    hsv[..., 0] = (((xx + yy) / (W + H) * 180 * 1.6 + hue_shift * 180) % 180).astype(np.uint8)
    hsv[..., 1], hsv[..., 2] = 150, 255
    foil = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)
    img = to_pil(foil).convert("RGBA")
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((14, 14, W - 15, H - 15), 18, fill=(18, 16, 34, 255), outline=(255, 255, 255, 255), width=3)
    # name plate
    d.rounded_rectangle((26, 26, W - 27, 74), 10, fill=(255, 209, 102, 255), outline=INK, width=3)
    text_c(d, (W / 2 - 44, 50), spec.get("plate", "MARCO"), font("display", 34), INK)
    text_c(d, (W - 66, 50), spec.get("pos", "CTO"), font("block", 20), RED)
    d.ellipse((W - 52, 34, W - 34, 52), fill=RED)
    # portrait window
    ph = (26, 84, W - 27, 316)
    win = backdrop((ph[2] - ph[0], ph[3] - ph[1]), v + 1, rays=20).convert("RGBA")
    head_im, bh = head_layer(ctx, spec["slug"], 196, strength=1.0)
    paste_rgba(win, head_im, ((win.width - head_im.width) / 2, win.height - bh + 26))
    sh = Image.new("RGBA", win.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rectangle((0, win.height - 34, win.width, win.height), fill=(0, 0, 0, 0))
    img.alpha_composite(win, (ph[0], ph[1]))
    d = ImageDraw.Draw(img)
    d.rectangle(ph, outline=(255, 255, 255, 255), width=3)
    d.rectangle((ph[0] - 3, ph[1] - 3, ph[2] + 3, ph[3] + 3), outline=INK, width=2)
    # the small print
    text_c(d, (W / 2, 334), spec.get("tag", "CLOUD INSTRUCTOR  LVL 99"), font("narrow", 19), (255, 209, 102, 255))
    stats = spec.get("stats", [("SUBNETTING", 97), ("TEA", 100), ("PATIENCE", 12)])
    for i, (nm, val) in enumerate(stats):
        y = 362 + i * 34
        d.text((34, y), nm, font=font("narrow", 17), fill=(255, 255, 255, 255), anchor="lm")
        d.rounded_rectangle((170, y - 8, W - 40, y + 8), 8, fill=(60, 56, 90, 255))
        d.rounded_rectangle((170, y - 8, 170 + (W - 210) * val / 100, y + 8), 8, fill=[(34, 211, 238, 255), (255, 209, 102, 255), (255, 61, 160, 255)][i % 3])
        d.text((W - 34, y), str(val), font=font("block", 16), fill=(255, 255, 255, 255), anchor="rm")
    text_block(d, W / 2, 484, spec["caption"], "serif_it", W - 70, 22, (236, 230, 255, 255), max_lines=2, min_size=13)
    text_c(d, (W / 2, 522), "No. 042/100   MARCOVERSE TRADING CARDS", font("light", 11), (160, 154, 200, 255))
    return img.convert("RGB")


# ----------------------------------------------------------------------------------------------------------------------------
# STYLE: stamp  (perforated postage stamp, single-ink engraving look)   320 x 384, transparent perforations
# ----------------------------------------------------------------------------------------------------------------------------
@style("stamp", "png")
def stamp(ctx, spec):
    W, H = 320, 384
    v = spec.get("variant", 0)
    ink = [(28, 52, 120), (150, 28, 40), (22, 100, 70)][v % 3]
    paper = (246, 238, 214)
    subj = head_cut(ctx.subject(spec["slug"]), strength=0.6)
    img = Image.new("RGBA", (W, H), (*paper, 255))
    d = ImageDraw.Draw(img)
    fx0, fy0, fx1, fy1 = 26, 26, W - 27, 300
    tone = tone_of(subj, blur=0.9, clahe=2.2)
    x0, y0, x1, y1 = bbox_of(subj.mask)
    sc = (fy1 - fy0 - 34) / max(1, y1 - y0)
    M = np.array([[sc, 0, (fx0 + fx1) / 2 - (x0 + x1) / 2 * sc], [0, sc, fy0 + 26 - y0 * sc]], np.float32)
    t = cv2.warpAffine(tone, M, (W, H), flags=cv2.INTER_AREA, borderValue=1.0)
    m = cv2.warpAffine(subj.mask.astype(np.float32), M, (W, H), flags=cv2.INTER_LINEAR, borderValue=0)
    # engraving: four flat tones of one ink, cross-hatched in the shadows
    hatch = stripes((W, H), 35, 5, 1, (0, 0, 0))
    ha = np.asarray(hatch.getchannel("A")).astype(np.float32) / 255
    cov = clamp01((0.62 - t) / 0.3) * 0.75 + clamp01((0.35 - t) / 0.2) * 0.25
    cov = np.where(t < 0.45, np.maximum(cov, ha * 0.9), cov * 0.55)
    tintc = np.array(ink, np.float32)
    panel = np.ones((H, W, 3), np.float32) * np.array(lerp_col(paper, ink, 0.12), np.float32)
    fg = panel * (1 - cov[..., None] * (1 - tintc / 255 * 1.0)) 
    panel = panel * (1 - m[..., None]) + fg * m[..., None]
    bgc = np.array(lerp_col(paper, ink, 0.22), np.float32)
    layer = np.ones((H, W, 3), np.float32) * bgc
    layer = layer * (1 - m[..., None]) + np.clip(fg, 0, 255) * m[..., None]
    inner = Image.fromarray(layer.astype(np.uint8)).crop((fx0, fy0, fx1, fy1))
    img.paste(inner, (fx0, fy0))
    d.rectangle((fx0, fy0, fx1, fy1), outline=ink, width=3)
    d.rectangle((fx0 - 5, fy0 - 5, fx1 + 5, fy1 + 5), outline=ink, width=1)
    text_c(d, (W / 2, 326), spec.get("top", "MARCOVERSE POST"), font("serif", 22), ink)
    text_c(d, (W / 2, 356), spec.get("value", "1st CUPPA"), font("serif", 26), ink)
    # postmark
    pm = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pm)
    pd.ellipse((W - 146, 18, W - 26, 138), outline=(*ink, 210), width=4)
    text_on_circle(pm, "RIO DE JANEIRO", (W - 86, 78), 46, 13, (*ink, 210), "block", start_deg=-90)
    for k in range(5):
        pd.arc((W - 300, 70 + k * 12, W - 130, 130 + k * 12), 190, 350, fill=(*ink, 190), width=3)
    img.alpha_composite(pm)
    # perforations: half-circles punched out of the edge
    a = Image.new("L", (W, H), 255)
    ad = ImageDraw.Draw(a)
    step, r = 20, 6
    for x in range(step // 2, W, step):
        ad.ellipse((x - r, -r, x + r, r), fill=0)
        ad.ellipse((x - r, H - 1 - r, x + r, H - 1 + r), fill=0)
    for y in range(step // 2, H, step):
        ad.ellipse((-r, y - r, r, y + r), fill=0)
        ad.ellipse((W - 1 - r, y - r, W - 1 + r, y + r), fill=0)
    img.putalpha(a)
    return img


# ----------------------------------------------------------------------------------------------------------------------------
# STYLE: tarot  (gold on midnight, arch window, roman numeral)   352 x 576
# ----------------------------------------------------------------------------------------------------------------------------
@style("tarot")
def tarot(ctx, spec):
    W, H = 352, 576
    v = spec.get("variant", 0)
    GOLD = (222, 184, 70)
    bg_a, bg_b = [((14, 22, 70), (52, 18, 96)), ((10, 50, 62), (20, 20, 70))][v % 2]
    img = grad_v((W, H), bg_a, bg_b).convert("RGBA")
    d = ImageDraw.Draw(img)
    rng = rng_for("tarot", spec["slug"])
    for _ in range(60):
        x, y = rng.uniform(20, W - 20), rng.uniform(20, H - 20)
        rr = rng.uniform(0.8, 2.2)
        d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=(255, 240, 200, int(rng.uniform(80, 220))))
    d.rectangle((10, 10, W - 11, H - 11), outline=GOLD, width=4)
    d.rectangle((20, 20, W - 21, H - 21), outline=GOLD, width=1)
    for cx, cy in ((10, 10), (W - 11, 10), (10, H - 11), (W - 11, H - 11)):
        d.rectangle((cx - 9, cy - 9, cx + 9, cy + 9), fill=bg_a, outline=GOLD, width=3)
        d.ellipse((cx - 3, cy - 3, cx + 3, cy + 3), fill=GOLD)
    text_c(d, (W / 2, 48), spec.get("numeral", "XVII"), font("serif", 34), GOLD)
    # arch window
    ax0, ay0, ax1, ay1 = 52, 78, W - 53, 410
    win = sunburst((ax1 - ax0, ay1 - ay0), [lerp_col(bg_b, GOLD, 0.5), lerp_col(bg_b, GOLD, 0.22)], n=26, centre=(0.5, 0.62)).convert("RGBA")
    head_im, bh = head_layer(ctx, spec["slug"], 236, strength=0.9)
    paste_rgba(win, head_im, ((win.width - head_im.width) / 2, win.height - bh - 4))
    wm = Image.new("L", win.size, 0)
    wd = ImageDraw.Draw(wm)
    wd.rectangle((0, win.width // 2, win.width, win.height), fill=255)
    wd.ellipse((0, 0, win.width - 1, win.width), fill=255)
    win.putalpha(wm)
    img.alpha_composite(win, (ax0, ay0))
    d = ImageDraw.Draw(img)
    d.arc((ax0 - 2, ay0 - 2, ax1 + 2, ay0 + (ax1 - ax0) + 2), 180, 360, fill=GOLD, width=4)
    d.line((ax0 - 2, ay0 + (ax1 - ax0) / 2, ax0 - 2, ay1), fill=GOLD, width=4)
    d.line((ax1 + 2, ay0 + (ax1 - ax0) / 2, ax1 + 2, ay1), fill=GOLD, width=4)
    d.line((ax0 - 2, ay1 + 2, ax1 + 2, ay1 + 2), fill=GOLD, width=4)
    starburst(d, ax0 + 6, ay0 + 70, 18, 8, 8, GOLD)
    starburst(d, ax1 - 6, ay0 + 70, 18, 8, 8, GOLD)
    d.ellipse((W / 2 - 16, ay0 - 26, W / 2 + 16, ay0 + 6), fill=GOLD)
    d.ellipse((W / 2 - 6, ay0 - 26, W / 2 + 22, ay0 + 6), fill=bg_a)   # crescent moon
    text_c(d, (W / 2, 444), spec.get("title", "THE INSTRUCTOR"), fit_font(d, spec.get("title", "THE INSTRUCTOR"), "serif", W - 60, 34, 16), GOLD)
    d.line((60, 470, W - 60, 470), fill=GOLD, width=2)
    text_block(d, W / 2, 514, spec["caption"], "serif_it", W - 70, 22, (236, 226, 190), max_lines=2, min_size=13)
    return img.convert("RGB")


# ----------------------------------------------------------------------------------------------------------------------------
# STYLE: album  (fake album sleeve: duotone head, loud type, parental-advisory box)   448 x 448
# ----------------------------------------------------------------------------------------------------------------------------
@style("album")
def album(ctx, spec):
    W = H = 448
    v = spec.get("variant", 0)
    bgc, fg2 = [((255, 209, 40), (214, 40, 40)), ((34, 211, 238), (255, 61, 160)), ((240, 240, 232), (30, 60, 200))][v % 3]
    img = Image.new("RGBA", (W, H), (*bgc, 255))
    d = ImageDraw.Draw(img)
    # vinyl peeking out behind the head
    vc = (W / 2, H * 0.475)
    d.ellipse((vc[0] - 148, vc[1] - 148, vc[0] + 148, vc[1] + 148), fill=(20, 18, 26, 255))
    for r in (130, 108, 86):
        d.ellipse((vc[0] - r, vc[1] - r, vc[0] + r, vc[1] + r), outline=(60, 58, 70, 255), width=2)
    d.ellipse((vc[0] - 38, vc[1] - 38, vc[0] + 38, vc[1] + 38), fill=fg2)
    def duo(subj, tone):
        return gradient_map(tone, [(20, 18, 28), fg2, bgc, (255, 255, 255)])
    head_im, bh = head_layer(ctx, spec["slug"], 232, colourise=duo, strength=0.9)
    paste_rgba(img, head_im, ((W - head_im.width) / 2, vc[1] - bh * 0.5))
    d = ImageDraw.Draw(img)
    text_c(d, (W / 2, 38), spec.get("band", "MARCO & THE PACKET LOSS"), fit_font(d, spec.get("band", "MARCO & THE PACKET LOSS"), "narrow", W - 40, 36, 16), (20, 18, 28, 255))
    cap = spec["caption"]
    d.rectangle((0, H - 92, W, H), fill=bgc)
    text_block(d, W / 2, H - 58, cap, "display", W - 50, 34, (20, 18, 28, 255), stroke=0, max_lines=2, min_size=14)
    d.rectangle((14, H - 28, 138, H - 6), fill=(255, 255, 255, 255), outline=(20, 18, 28, 255), width=2)
    text_c(d, (76, H - 22), "PARENTAL", font("narrow", 9), INK)
    text_c(d, (76, H - 12), "EXPLICIT SUBNETTING", font("narrow", 8), INK)
    d.rectangle((0, 0, W - 1, H - 1), outline=(20, 18, 28, 255), width=6)
    return img.convert("RGB")


# ----------------------------------------------------------------------------------------------------------------------------
# STYLE: sticker  (die-cut transparent stickers; v0 cut-out head, v1 round badge, v2 head + speech bubble)   320 x 320
# ----------------------------------------------------------------------------------------------------------------------------
@style("sticker", "png")
def sticker(ctx, spec):
    W = H = 320
    v = spec.get("variant", 0) % 3
    base = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    if v == 1:
        a, b = BACKDROPS[spec.get("bg", 0) % len(BACKDROPS)]
        disc = sunburst((W, H), [a, b], n=16, centre=(0.5, 0.42)).convert("RGBA")
        m = Image.new("L", (W, H), 0)
        ImageDraw.Draw(m).ellipse((18, 18, W - 19, H - 19), fill=255)
        disc.putalpha(m)
        ring = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        rd = ImageDraw.Draw(ring)
        rd.ellipse((4, 4, W - 5, H - 5), fill=(255, 255, 255, 255))
        rd.ellipse((14, 14, W - 15, H - 15), fill=(*INK, 255))
        ring.alpha_composite(disc, (0, 0))
        head_im, bh = head_layer(ctx, spec["slug"], 190, strength=1.0, outline=5)
        hm = Image.new("L", (W, H), 0)
        ImageDraw.Draw(hm).ellipse((18, 18, W - 19, H - 19), fill=255)
        hl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        paste_rgba(hl, head_im, ((W - head_im.width) / 2, H - bh - 34))
        hl.putalpha(ImageChops.multiply(hl.getchannel("A"), hm))
        ring.alpha_composite(hl)
        d = ImageDraw.Draw(ring)
        d.arc((14, 14, W - 15, H - 15), 0, 360, fill=(*INK, 255), width=5)
        cap = spec["caption"]
        d.rounded_rectangle((34, H - 82, W - 35, H - 30), 10, fill=(255, 209, 102, 255), outline=INK, width=4)
        text_block(d, W / 2, H - 56, cap, "narrow", W - 90, 24, INK, max_lines=2, min_size=11)
        return ring
    head_im, bh = head_layer(ctx, spec["slug"], 210 if v == 0 else 190, strength=1.0, outline=5)
    hx, hy = (W - head_im.width) / 2 + (0 if v == 0 else -26), 14 if v == 0 else 66
    paste_rgba(base, head_im, (hx, hy))
    a = np.asarray(base.getchannel("A")).astype(np.float32) / 255
    if v == 2:
        d0 = ImageDraw.Draw(base)
        bub = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        speech_bubble(bub, spec["caption"], (W * 0.62, 62), (W * 0.74, 100), (W * 0.46, 120), max_size=24)
        base.alpha_composite(bub)
        a = np.asarray(base.getchannel("A")).astype(np.float32) / 255
    die = clamp01(dilate((a > 0.3).astype(np.float32), 9))
    die = cv2.GaussianBlur(die, (0, 0), 1.0)
    white = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    white.putalpha(Image.fromarray((clamp01(die * 1.2) * 255).astype(np.uint8), "L"))
    out = Image.alpha_composite(white, base)
    if v == 0:
        d = ImageDraw.Draw(out)
        bub = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        caption_box(bub, spec["caption"], (20, H - 76, W - 20, H - 24), fill=YELLOW, max_size=26, tilt=-3, shadow=3)
        shadow = clamp01(dilate((np.asarray(bub.getchannel("A")) > 20).astype(np.float32), 6))
        w2 = Image.new("RGBA", (W, H), (255, 255, 255, 255))
        w2.putalpha(Image.fromarray((shadow * 255).astype(np.uint8), "L"))
        out = Image.alpha_composite(out, Image.alpha_composite(w2, bub))
    return out


# ----------------------------------------------------------------------------------------------------------------------------
# STYLE: tile  (seamless azulejo-style pattern with one tiny halftone head per pair of tiles)   256 x 256
# ----------------------------------------------------------------------------------------------------------------------------
@style("tile")
def tile(ctx, spec):
    T = 256
    blue, blue2, white = (20, 62, 150), (90, 140, 220), (248, 246, 238)
    img = Image.new("RGB", (T, T), white)
    d = ImageDraw.Draw(img)
    h = T // 2
    for gx in range(2):
        for gy in range(2):
            ox, oy = gx * h, gy * h
            d.rectangle((ox + 3, oy + 3, ox + h - 4, oy + h - 4), outline=blue2, width=2)
            cx, cy = ox + h / 2, oy + h / 2
            if (gx + gy) % 2 == 0:       # quatrefoil
                for k in range(4):
                    a = k * math.pi / 2 + math.pi / 4
                    d.ellipse((cx + math.cos(a) * 18 - 20, cy + math.sin(a) * 18 - 20, cx + math.cos(a) * 18 + 20, cy + math.sin(a) * 18 + 20), outline=blue, width=4)
                d.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), fill=blue)
                for ax, ay in ((ox + 6, oy + 6), (ox + h - 7, oy + 6), (ox + 6, oy + h - 7), (ox + h - 7, oy + h - 7)):
                    d.ellipse((ax - 4, ay - 4, ax + 4, ay + 4), fill=blue2)
            else:                        # tiny head roundel
                pass
    head_im, bh = head_layer(ctx, spec["slug"], 92, colourise=lambda s, t: gradient_map(t, [(10, 30, 92), blue, blue2, white]), strength=0.8, outline=3)
    for (gx, gy) in ((1, 0), (0, 1)):
        ox, oy = gx * h, gy * h
        d.ellipse((ox + 10, oy + 10, ox + h - 11, oy + h - 11), fill=(232, 238, 252), outline=blue, width=4)
        paste_rgba_rgb(img, head_im, (ox + (h - head_im.width) / 2, oy + h - 14 - min(bh, h - 26)), clip=(ox + 12, oy + 12, ox + h - 12, oy + h - 12))
    return img


def paste_rgba_rgb(base: Image.Image, top: Image.Image, xy, clip=None):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    layer.paste(top, (int(xy[0]), int(xy[1])))
    if clip:
        m = Image.new("L", base.size, 0)
        ImageDraw.Draw(m).ellipse(clip, fill=255)
        layer.putalpha(ImageChops.multiply(layer.getchannel("A"), m))
    tmp = base.convert("RGBA")
    tmp.alpha_composite(layer)
    base.paste(tmp.convert("RGB"))


# ----------------------------------------------------------------------------------------------------------------------------
# STYLE: mural  (wide comic-strip mural: five panels, five heads, one banner)   768 x 320
# ----------------------------------------------------------------------------------------------------------------------------
@style("mural")
def mural(ctx, spec):
    W, H = 768, 320
    slugs = spec["slugs"]
    v = spec.get("variant", 0)
    img = Image.new("RGBA", (W, H), (*NAVY, 255))
    d = ImageDraw.Draw(img)
    n = len(slugs)
    pw = W / n
    for i, slug in enumerate(slugs):
        x0, x1 = int(i * pw), int((i + 1) * pw)
        panel = backdrop((x1 - x0 + 40, H), v + i + 1, rays=14).convert("RGBA")
        head_im, bh = head_layer(ctx, slug, int(pw * 0.86), strength=1.0, outline=5)
        paste_rgba(panel, head_im, ((panel.width - head_im.width) / 2, H * 0.72 - bh * 0.86))
        pm = Image.new("L", panel.size, 0)
        slant = 16 if i % 2 == 0 else -16
        ImageDraw.Draw(pm).polygon([(20 + (slant if slant > 0 else 0), 0), (panel.width - 20 - (-slant if slant < 0 else 0), 0), (panel.width - 20 - (slant if slant > 0 else 0), H), (20 + (-slant if slant < 0 else 0), H)], fill=255)
        panel.putalpha(pm)
        img.alpha_composite(panel, (x0 - 20, 0))
    d = ImageDraw.Draw(img)
    for i in range(1, n):
        d.line((i * pw - 16 + (16 if i % 2 else -16) * 0, 0, i * pw + 16, H), fill=(*INK, 255), width=6)
    ribbon(img, spec["caption"], H - 66, 52, fill=RED, max_size=40)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W - 1, H - 1), outline=(*INK, 255), width=8)
    return img.convert("RGB")


# ----------------------------------------------------------------------------------------------------------------------------
# THE PLAN: which style for which photo, with which caption. Anything in assets/user/face_<slug>.jpg that is not mentioned here
# automatically gets a toon portrait, a pop-art print and a sticker (see auto_plan), so dropping in a new face "just works".
# ----------------------------------------------------------------------------------------------------------------------------
def P(style_, slug, cap=None, **kw):
    d = dict(style=style_, slug=slug, **kw)
    if cap:
        d["caption"] = CAP[cap]
    return d


PLAN = [
    # flat, full-bleed posters (billboards, UI collage)
    P("toon", "couch", "laptop", burst="!?", variant=0), P("toon", "yoda", "tea", burst="TEA!", variant=1),
    P("toon", "sugarloaf", "vpc", burst="OOPS", variant=2), P("toon", "banana_suit", "outage", burst="HELP", variant=3),
    P("toon", "holi", "friday", burst="WHEE", variant=4),
    P("popart", "desk_point", "vpc", burst="POW!", variant=0), P("popart", "flag_rio", "uptime", burst="WOW!", variant=1),
    P("popart", "hippie", "terraform", burst="ZAP!", variant=2), P("popart", "marina_laugh", "ping", burst="PING", variant=0), P("popart", "keffiyeh_car", "routing", burst="BGP!", variant=1),
    P("riso", "stonehenge", "subnets", variant=0), P("riso", "desert_drive", "localhost", variant=1),
    P("synth", "snake_chair", "uptime", variant=0), P("synth", "desert_drive", "bgp", variant=1), P("synth", "kazakh_hat", "cidr", variant=2),
    P("wanted", "banana_run", None, caption="EXPLAINING SUBNETS TWICE", sub="DEAD OR AWAKE"),
    P("wanted", "squish", None, caption="CRIMES AGAINST CHANGE FREEZES", sub="LAST SEEN: A FRIDAY", reward="REWARD: ONE CUPPA. NO BISCUITS."),
    P("wanted", "headache", None, caption="BREAKING PRODUCTION (WITH LOVE)", sub="ARMED WITH A LAPTOP", reward="REWARD: A QUIET ROOM."),
    P("constructivist", "desk_point", "docs", burst="READ!"), P("constructivist", "stonehenge", "certified", burst="PASS!"),
    P("stencil", "stonehenge", "dns", variant=0), P("stencil", "sugarloaf", "reboot", variant=1),
    P("stencil", "vatican", "harmless", variant=2), P("stencil", "flag_rio", "tea", variant=3),
    P("pixel", "couch", "laptop", short="P1 READY", variant=0), P("pixel", "beach_sunset", "tea", short="HI-SCORE", variant=1),
    P("card", "desk_point", "certified", plate="MARCO", pos="CTO", tag="CLOUD INSTRUCTOR  LVL 99", stats=[("SUBNETTING", 97), ("TEA", 100), ("PATIENCE", 12)], variant=0),
    P("card", "snake_chair", "friday", plate="MARCO", pos="DPS", tag="GAMING CHAIR EDITION", stats=[("LATENCY", 12), ("FLAT WHITE", 99), ("SLEEP", 4)], variant=1),
    P("stamp", "sugarloaf", None, caption="", top="MARCOVERSE POST", value="1st CUPPA", variant=0),
    P("stamp", "stonehenge", None, caption="", top="BLIGHTY POST", value="2nd BISCUIT", variant=1),
    P("tarot", "hippie", "harmless", title="THE INSTRUCTOR", numeral="XVII", variant=0),
    P("tarot", "yoda", "subnets", title="THE SUBNETTER", numeral="VIII", variant=1),
    P("album", "couch", "biscuits", band="MARCO & THE PACKET LOSS", variant=0), P("album", "holi", "uptime", band="THE SUBNET BOYS", variant=1),
    P("bighead", "desk_point", "vpc", variant=0), P("bighead", "flag_rio", "tea", variant=1), P("bighead", "hippie", "friday", variant=2),
    P("mural", None, "uptime", name="rio", slugs=["flag_rio", "beach_sunset", "sugarloaf", "snorkel", "marina_laugh"], variant=0),
    P("mural", None, "tea", name="blighty", slugs=["stonehenge", "vatican", "kazakh_hat", "keffiyeh_car", "hippie"], variant=2),
    P("tile", "couch", None, variant=0),
    # transparent cut-outs: stickers, road paint, mascots
    P("sticker", "couch", "laptop", variant=0), P("sticker", "yoda", "tea", variant=1, bg=1), P("sticker", "hippie", "reboot", variant=2),
    P("sticker", "stonehenge", "sorry", variant=0), P("sticker", "sugarloaf", "flatwhite", variant=1, bg=3),
    P("sticker", "holi", "ping", variant=2), P("sticker", "snorkel", "harmless", variant=0), P("sticker", "desk_point", "certified", variant=1, bg=5), P("sticker", "kazakh_hat", "cidr", variant=0),
    P("paint", "flag_rio"), P("paint", "desk_point"),
    P("mascot", "marco_face", None, variant=0, headset=False), P("mascot", "desk_point", None, variant=1, headset=True),
    # 3D bobblehead faces (256 px, planar-mapped onto a ball)
    P("head", "marco_face"), P("head", "flag_rio"), P("head", "desk_point"), P("head", "hippie"), P("head", "stonehenge"),
]
def piece_name(spec) -> str:
    return f"art_{spec['style']}_{spec.get('name') or spec['slug']}"


PLAN += [
    # new photos (passport, graduation, certificate): only a few pieces each
    P("sticker", "passport", None, caption="OFFICIAL ID. ALLEGEDLY.", variant=1, bg=2), P("popart", "passport", None, caption="NOT A VALID TRAVEL DOCUMENT", burst="SNAP!", variant=2),
    P("toon", "graduation", None, caption="ALREADY FORGOTTEN EVERYTHING", burst="HA!", variant=5),
    P("sticker", "certificate", None, caption="CERTIFIED. FRAMED BY NOBODY.", variant=0, bg=4),
]
PLAN = [p for p in PLAN if p]

# "Less slop": pieces that looked muddy, ugly, repetitive or low quality were dropped from the shipped set (about the best 30 are kept).
# They stay in the PLAN above so the idea is documented, but they are not rendered; set KEEP_ALL=1 in the environment to bring them back.
REJECT = {
    "art_album_couch", "art_album_holi", "art_bighead_hippie", "art_head_hippie", "art_mascot_marco_face", "art_paint_desk_point",
    "art_pixel_beach_sunset", "art_pixel_couch", "art_popart_desk_point", "art_popart_flag_rio", "art_popart_hippie", "art_popart_marina_laugh",
    "art_riso_desert_drive", "art_constructivist_stonehenge", "art_stamp_sugarloaf", "art_stencil_sugarloaf", "art_sticker_hippie", "art_sticker_holi",
    "art_sticker_kazakh_hat", "art_sticker_snorkel", "art_synth_kazakh_hat", "art_tarot_hippie", "art_toon_banana_suit", "art_toon_couch",
    "art_toon_holi", "art_toon_sugarloaf", "art_wanted_headache", "art_sticker_stonehenge",
    "art_sticker_passport", "art_popart_passport", "art_toon_graduation", "art_sticker_certificate",
    # the four pieces planned for the new photos are NOT rendered yet (python was unavailable in the session that added them):
    # delete these four lines, run this script, then add the four names to SHIPPED_ART in src/visuals/caricature.js
}
ALL_PLAN = list(PLAN)
if not os.environ.get("KEEP_ALL"):
    PLAN = [p for p in PLAN if piece_name(p) not in REJECT]

#: per-style encoding: (format, jpeg quality start / png colours, max kilobytes per piece)
ENCODE = {
    "toon": ("jpg", 74, 52), "popart": ("jpg", 72, 62), "riso": ("jpg", 74, 46), "synth": ("jpg", 72, 38), "wanted": ("jpg", 70, 62),
    "constructivist": ("jpg", 74, 44), "stencil": ("jpg", 70, 58), "card": ("jpg", 72, 52), "tarot": ("jpg", 72, 44), "album": ("jpg", 74, 44),
    "bighead": ("jpg", 74, 44), "mural": ("jpg", 72, 64), "tile": ("jpg", 76, 26), "head": ("jpg", 80, 14),
    "pixel": ("png", 16, 12), "sticker": ("png", 72, 44), "stamp": ("png", 56, 40), "paint": ("png", 40, 30), "mascot": ("png", 72, 44),
}
ART_STYLES_PY = sorted(ENCODE)


def auto_plan(assets: Path, planned: list) -> list:
    """Extra pieces for face_<slug>.jpg photos that the hand-made plan does not know about: a toon portrait, a pop-art print and a sticker."""
    known = {p["slug"] for p in planned if p.get("slug")}
    extra = []
    for f in sorted(assets.glob("face_*.jpg")):
        slug = f.stem[5:]
        if slug in known:
            continue
        keys = list(CAP)
        c = keys[zlib.crc32(slug.encode()) % len(keys)]
        extra += [P("toon", slug, c, burst="!?", variant=seed_of(slug) % 6), P("popart", slug, keys[(zlib.crc32(slug.encode()) // 7) % len(keys)], burst="POW!", variant=seed_of(slug) % 3),
                  P("sticker", slug, c, variant=seed_of(slug) % 3)]
    return extra


def encode_piece(im: Image.Image, style_: str, path: Path) -> int:
    """Write `im` with the style's encoding, stepping JPEG quality down until it fits the size cap. Returns bytes written."""
    fmt, q, cap_kb = ENCODE[style_]
    if fmt == "jpg":
        im = im.convert("RGB")
        while True:
            im.save(path, "JPEG", quality=q, optimize=True, progressive=True, subsampling=2)
            if path.stat().st_size <= cap_kb * 1024 or q <= 48:
                break
            q -= 4
    else:
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGBA")
        colours = q
        while True:
            pq = png_quantise(im, colours)
            pq.save(path, "PNG", optimize=True)
            if path.stat().st_size <= cap_kb * 1024 or colours <= 12:
                break
            colours = max(12, int(colours * 0.75))
    return path.stat().st_size


def _render(job):
    spec, assets, out = job
    ctx = Ctx(Path(assets))
    t0 = __import__("time").time()
    im = STYLE_FNS[spec["style"]](ctx, spec)
    fmt = ENCODE[spec["style"]][0]
    path = Path(out) / f"{piece_name(spec)}.{fmt}"
    n = encode_piece(im, spec["style"], path)
    return piece_name(spec), path.name, im.size, n, round(__import__("time").time() - t0, 1)


def contact_sheet(out: Path, names: list, dest: Path, cell=230, cols=8):
    """One picture of every piece (checkerboard under transparency) with its file size, for a quick look."""
    files = []
    for n in names:
        for ext in ("jpg", "png"):
            if (out / f"{n}.{ext}").exists():
                files.append(out / f"{n}.{ext}")
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 18)), (38, 38, 46))
    d = ImageDraw.Draw(sheet)
    chk = Image.new("RGB", (cell, cell), (104, 104, 112))
    cd = ImageDraw.Draw(chk)
    for y in range(0, cell, 16):
        for x in range((y // 16) % 2 * 16, cell, 32):
            cd.rectangle((x, y, x + 15, y + 15), fill=(132, 132, 140))
    for i, f in enumerate(files):
        im = Image.open(f).convert("RGBA")
        sc = min((cell - 6) / im.width, (cell - 6) / im.height)
        im = im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc))), Image.LANCZOS)
        x, y = (i % cols) * cell, (i // cols) * (cell + 18)
        tile_ = chk.copy().convert("RGBA")
        tile_.alpha_composite(im, ((cell - im.width) // 2, (cell - im.height) // 2))
        sheet.paste(tile_.convert("RGB"), (x, y + 18))
        d.text((x + 3, y + 3), f"{f.stem[4:]}  {f.stat().st_size // 1024}k", fill=(255, 255, 255), font=font("light", 11))
    sheet.save(dest)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Marco Kart caricature art pipeline (image processing, not a generative model).")
    ap.add_argument("--only", help="comma-separated styles to build, e.g. popart,sticker")
    ap.add_argument("--slugs", help="comma-separated photo slugs to build")
    ap.add_argument("--assets", default=str(ASSETS))
    ap.add_argument("--out", default=None)
    ap.add_argument("--sheet", help="also write a contact sheet PNG of every piece on disk")
    ap.add_argument("--list", action="store_true", help="print the plan and what is on disk, write nothing")
    ap.add_argument("--budget-kb", type=int, default=2700, help="fail when the set is bigger than this (default 2700)")
    ap.add_argument("--jobs", type=int, default=min(2, os.cpu_count() or 1))
    ap.add_argument("--no-auto", action="store_true", help="skip the automatic pieces for photos the plan does not know")
    a = ap.parse_args(argv)
    assets = Path(a.assets)
    out = Path(a.out) if a.out else assets
    out.mkdir(parents=True, exist_ok=True)
    plan = PLAN + ([] if a.no_auto else auto_plan(assets, ALL_PLAN))
    only = set(a.only.split(",")) if a.only else None
    slugs = set(a.slugs.split(",")) if a.slugs else None
    todo = []
    for spec in plan:
        if only and spec["style"] not in only:
            continue
        if slugs and not (spec.get("slug") in slugs or (set(spec.get("slugs", [])) & slugs)):
            continue
        needed = [spec["slug"]] if spec.get("slug") else []
        needed += spec.get("slugs", [])
        miss = [s for s in needed if not ((assets / f"face_{s}.jpg").exists() or (s == "marco_face" and (assets / "marco_face.png").exists()))]
        if miss:
            print(f"skip {piece_name(spec)}: missing face_{miss[0]}.jpg")
            continue
        todo.append(spec)
    manifest_path = out / MANIFEST
    prev = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    if a.list:
        for s in todo:
            fmt = ENCODE[s["style"]][0]
            ex = (out / f"{piece_name(s)}.{fmt}").exists()
            print(f"{'*' if ex else ' '} {piece_name(s)}.{fmt}")
        print(f"{len(todo)} pieces planned; {sum(1 for s in todo if (out / (piece_name(s) + '.' + ENCODE[s['style']][0])).exists())} on disk")
        return 0
    jobs = [(s, str(assets), str(out)) for s in todo]
    done = {}
    t0 = __import__("time").time()
    if a.jobs > 1 and len(jobs) > 1:
        import multiprocessing as mp
        with mp.get_context("fork").Pool(a.jobs) as pool:
            for r in pool.imap_unordered(_render, jobs):
                done[r[0]] = r
                print(f"  {r[1]:38s} {r[2][0]}x{r[2][1]:<4d} {r[3] // 1024:4d} KB  {r[4]}s")
    else:
        for j in jobs:
            r = _render(j)
            done[r[0]] = r
            print(f"  {r[1]:38s} {r[2][0]}x{r[2][1]:<4d} {r[3] // 1024:4d} KB  {r[4]}s")
    # manifest + tidy: remove only pieces THIS script wrote earlier that are no longer in the plan
    files = dict(prev.get("files", {})) if (only or slugs) else {}
    for name, r in done.items():
        files[name] = {"file": r[1], "w": r[2][0], "h": r[2][1], "bytes": r[3]}
    if not (only or slugs):
        planned = {piece_name(s) for s in plan}
        for name, rec in list(prev.get("files", {}).items()):
            if name not in planned and (out / rec["file"]).exists():
                (out / rec["file"]).unlink()
                print(f"  removed stale {rec['file']}")
    manifest_path.write_text(json.dumps({"note": "files written by tools/caricature_build.py (other art_* files are yours and never touched)", "files": files}, indent=1, sort_keys=True))
    total = sum(r["bytes"] for r in files.values())
    print(f"\n{len(files)} pieces, {total / 1024:.0f} KB total ({total / 1e6:.2f} MB), {__import__('time').time() - t0:.0f}s")
    if a.sheet:
        contact_sheet(out, sorted(files), Path(a.sheet))
        print(f"contact sheet: {a.sheet}")
    if total > a.budget_kb * 1024:
        print(f"OVER BUDGET: {total // 1024} KB > {a.budget_kb} KB", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
