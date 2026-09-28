"""Deterministic 2D effect rasterizer for the Frontline Command FX candidate.

Every shape is authored here as vector geometry (polygons, ellipses, strokes),
rasterized at SS× supersampling and box-reduced to the effect's atlas
resolution. No external images, fonts, noise textures or random wall-clock state
are used: every effect seeds `random.Random` from its exact effect ID.

Coordinates passed to primitives are in *output atlas pixels* of the current
canvas (world pixels × resolution). Iso ground ellipses use the project's fixed
2:1 dimetric projection (one tile = 64×32 world px at 1×).
"""
from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass, field

import numpy as np
from PIL import Image, ImageDraw

SS = 4  # supersampling factor per output pixel

# ---------------------------------------------------------------- palette
# Warm military-industrial palette. Heat ramps are warm, not neon; red is kept
# for genuine danger/rejection; team colour is never baked into shared FX.
INK = (23, 25, 16)
INK_WARM = (38, 28, 20)
WHITE_HOT = (255, 250, 228)
YELLOW = (255, 219, 112)
AMBER = (247, 164, 52)
ORANGE = (224, 100, 32)
RED = (166, 50, 24)
EMBER = (112, 34, 18)
SMOKE_0 = (34, 31, 27)       # deepest smoke shadow
SMOKE_1 = (58, 53, 45)
SMOKE_2 = (92, 85, 71)
SMOKE_3 = (138, 128, 106)
SMOKE_4 = (176, 165, 138)    # sunlit smoke top
DUST_0 = (104, 82, 56)
DUST_1 = (146, 118, 80)
DUST_2 = (186, 156, 110)
DUST_3 = (222, 196, 150)
CONCRETE_0 = (92, 90, 82)
CONCRETE_1 = (140, 136, 122)
CONCRETE_2 = (190, 184, 164)
STEEL_0 = (70, 72, 66)
STEEL_1 = (128, 130, 118)
STEEL_2 = (196, 196, 180)
BRASS = (231, 189, 114)
BRASS_DK = (150, 112, 52)
PALE = (244, 221, 176)
OLIVE = (197, 213, 155)
OLIVE_DK = (96, 110, 60)
OLIVE_MID = (140, 158, 92)
DANGER = (214, 64, 40)
DANGER_DK = (120, 30, 20)
CAUTION = (240, 176, 48)
FOG_0 = (10, 11, 9)
FOG_1 = (24, 25, 20)

HEAT_RAMP = [RED, ORANGE, AMBER, YELLOW, WHITE_HOT]
SOFT_HEAT_RAMP = [EMBER, RED, ORANGE, AMBER, AMBER]  # reduced-flashing ramp: no white core

ISO = 32 * math.sqrt(2)  # screen half-width (1× px) of a 1-tile-radius ground circle


def seeded(effect_id: str, salt: str = "") -> random.Random:
    return random.Random(int.from_bytes(hashlib.sha256((effect_id + "|" + salt).encode()).digest()[:8], "big"))


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return tuple(int(round(lerp(a, b, t))) for a, b in zip(c1, c2))


def ease_out(t):
    t = min(max(t, 0.0), 1.0)
    return 1 - (1 - t) ** 3


def ease_in(t):
    t = min(max(t, 0.0), 1.0)
    return t * t


def ease_io(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def window(t, a, b):
    """0 before a, ramps to 1 at b."""
    if b <= a:
        return 1.0 if t >= b else 0.0
    return min(max((t - a) / (b - a), 0.0), 1.0)


# ---------------------------------------------------------------- canvas
class Canvas:
    """Premultiplied float RGBA canvas at SS× resolution."""

    def __init__(self, w: int, h: int, ox: float, oy: float, res: int = 1, ss: int = SS):
        # w/h/origin are WORLD px; the buffer is w*res*ss. All drawing coordinates
        # and widths are world px relative to the origin.
        self.res, self.ss = res, ss
        self.w, self.h = int(w * res), int(h * res)
        self.ox, self.oy = ox, oy
        self.k = res * ss
        self.buf = np.zeros((self.h * ss, self.w * ss, 4), np.float32)

    # -- mask construction (origin-relative output px) -----------------
    def _pts(self, pts):
        k = self.k
        return [((x + self.ox) * k, (y + self.oy) * k) for x, y in pts]

    def blank(self):
        return Image.new("L", (self.w * self.ss, self.h * self.ss), 0)

    def poly(self, pts, img=None):
        img = img or self.blank()
        if len(pts) >= 3:
            ImageDraw.Draw(img).polygon(self._pts(pts), fill=255)
        return img

    def ellipse(self, cx, cy, rx, ry, img=None):
        img = img or self.blank()
        if rx > 0 and ry > 0:
            s = self.k
            x0, y0 = (cx - rx + self.ox) * s, (cy - ry + self.oy) * s
            x1, y1 = (cx + rx + self.ox) * s, (cy + ry + self.oy) * s
            ImageDraw.Draw(img).ellipse([x0, y0, x1, y1], fill=255)
        return img

    def line(self, pts, width, img=None):
        img = img or self.blank()
        if len(pts) >= 2 and width > 0:
            d = ImageDraw.Draw(img)
            p = self._pts(pts)
            wpx = max(1, int(round(width * self.k)))
            d.line(p, fill=255, width=wpx, joint="curve")
            r = wpx / 2
            for x, y in (p[0], p[-1]):
                d.ellipse([x - r, y - r, x + r, y + r], fill=255)
        return img

    @staticmethod
    def arr(img):
        return np.asarray(img, np.float32) / 255.0

    # -- painting ------------------------------------------------------
    def paint(self, mask, color, alpha=1.0):
        if alpha <= 0:
            return
        m = mask if isinstance(mask, np.ndarray) else self.arr(mask)
        a = np.clip(m * alpha, 0, 1)[..., None]
        c = np.array([color[0] / 255, color[1] / 255, color[2] / 255, 1.0], np.float32)
        self.buf = self.buf * (1 - a) + c * a

    def erase(self, mask, amount=1.0):
        m = mask if isinstance(mask, np.ndarray) else self.arr(mask)
        self.buf *= (1 - np.clip(m * amount, 0, 1))[..., None]

    def fade(self, alpha):
        self.buf *= alpha

    def image(self) -> Image.Image:
        s = self.ss
        b = self.buf.reshape(self.h, s, self.w, s, 4).mean(axis=(1, 3))
        a = b[..., 3:4]
        rgb = np.where(a > 1e-6, b[..., :3] / np.maximum(a, 1e-6), 0)
        out = np.concatenate([rgb, a], axis=2)
        out = np.clip(np.round(out * 255), 0, 255).astype(np.uint8)
        # Snap near-invisible alpha to zero so crops stay tight.
        out[out[..., 3] < 3] = 0
        return Image.fromarray(out, "RGBA")


def union(*masks):
    arrs = [m if isinstance(m, np.ndarray) else Canvas.arr(m) for m in masks if m is not None]
    return np.maximum.reduce(arrs) if len(arrs) > 1 else arrs[0]


def inter(a, b):
    return np.minimum(a, b)


def minus(a, b):
    return np.clip(a - b, 0, 1)


# ---------------------------------------------------------------- shapes
def blob_pts(cx, cy, r, rng, n=11, jitter=0.12, squash=1.0, rot=0.0):
    """Hand-cut angular lobe: a jittered polygon, not a perfect disc."""
    pts = []
    for i in range(n):
        a = rot + i / n * math.tau
        rr = r * (1 + rng.uniform(-jitter, jitter))
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr * squash))
    return pts


def star_pts(cx, cy, r_out, r_in, n, rot=0.0, squash=1.0, jitter=0.0, rng=None, up=0.0):
    """Angular flame/flash star. `up` stretches tips pointing upward."""
    pts = []
    for i in range(n * 2):
        a = rot + i / (n * 2) * math.tau
        r = r_out if i % 2 == 0 else r_in
        if rng and jitter:
            r *= 1 + rng.uniform(-jitter, jitter)
        dy = math.sin(a)
        if i % 2 == 0 and up and dy < 0:
            r *= 1 + up * (-dy)
        pts.append((cx + math.cos(a) * r, cy + dy * r * squash))
    return pts


@dataclass
class Lobe:
    x: float
    y: float
    r: float
    seed: int = 0


def cel_cluster(cv: Canvas, lobes, shades, alpha=1.0, outline=1.0, light=(-0.55, -0.8),
                squash=0.92, rng=None, ink=INK, jitter=0.1):
    """Cel-shaded cluster (smoke/dust). shades = (shadow, mid, light[, highlight])."""
    if not lobes:
        return
    rng = rng or random.Random(7)
    geo = [(lb, blob_pts(lb.x, lb.y, lb.r, random.Random(lb.seed), n=12, jitter=jitter, squash=squash)) for lb in lobes]
    if outline > 0:
        ink_m = cv.blank()
        for lb, _ in geo:
            cv.poly(blob_pts(lb.x, lb.y, lb.r + outline, random.Random(lb.seed), n=12, jitter=jitter, squash=squash), ink_m)
        cv.paint(ink_m, ink, alpha * 0.85)
    base = cv.blank()
    for _, pts in geo:
        cv.poly(pts, base)
    base_a = Canvas.arr(base)
    cv.paint(base_a, shades[0], alpha)
    lx, ly = light
    for k, (off, scale) in enumerate(((0.22, 0.80), (0.42, 0.52), (0.58, 0.28))[: len(shades) - 1]):
        m = cv.blank()
        for lb, _ in geo:
            if lb.r * scale < 0.6:
                continue
            cv.poly(blob_pts(lb.x + lx * lb.r * off, lb.y + ly * lb.r * off, lb.r * scale,
                             random.Random(lb.seed + 17 * (k + 1)), n=10, jitter=jitter, squash=squash), m)
        cv.paint(inter(Canvas.arr(m), base_a), shades[k + 1], alpha)


def flame(cv: Canvas, cx, cy, r, rng, n=7, ramp=HEAT_RAMP, alpha=1.0, up=0.6, squash=0.85,
          rot=None, inner=0.55, levels=(1.0, 0.8, 0.6, 0.4, 0.22), rim=True):
    """Angular layered fire tongues; outer layer darkest, core hottest."""
    rot = rng.uniform(0, math.tau) if rot is None else rot
    if rim:
        cv.paint(cv.poly(star_pts(cx, cy, r * 1.08 + 0.6, r * inner * 1.08 + 0.6, n, rot, squash, 0.18, random.Random(rng.random()), up)), EMBER, alpha * 0.9)
    for i, lvl in enumerate(levels[: len(ramp)]):
        rr = r * lvl
        if rr < 0.5:
            continue
        pts = star_pts(cx, cy - (1 - lvl) * r * 0.18, rr, rr * inner, n, rot + i * 0.21, squash, 0.18,
                       random.Random(rng.random()), up)
        cv.paint(cv.poly(pts), ramp[i], alpha)


def shard(cv: Canvas, x, y, size, angle, color, alpha=1.0, ink=INK, sides=4, rng=None, outline=0.7):
    rng = rng or random.Random(int(x * 13 + y * 7 + size * 101))
    pts = []
    for i in range(sides):
        a = angle + i / sides * math.tau + rng.uniform(-0.35, 0.35)
        rr = size * rng.uniform(0.55, 1.0) * (1.0 if i % 2 == 0 else 0.6)
        pts.append((x + math.cos(a) * rr, y + math.sin(a) * rr))
    if outline:
        grow = [(x + (px - x) * (1 + outline / max(size, 0.5)), y + (py - y) * (1 + outline / max(size, 0.5))) for px, py in pts]
        cv.paint(cv.poly(grow), ink, alpha * 0.9)
    cv.paint(cv.poly(pts), color, alpha)


def streak(cv: Canvas, x0, y0, x1, y1, width, color, alpha=1.0, taper=True):
    """Tapered spark/tracer streak (thick head at x1,y1)."""
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L, dx / L
    w = width / 2
    if taper:
        pts = [(x0, y0), (x1 + nx * w, y1 + ny * w), (x1 + dx / L * w, y1 + dy / L * w), (x1 - nx * w, y1 - ny * w)]
    else:
        pts = [(x0 + nx * w, y0 + ny * w), (x1 + nx * w, y1 + ny * w), (x1 - nx * w, y1 - ny * w), (x0 - nx * w, y0 - ny * w)]
    cv.paint(cv.poly(pts), color, alpha)


def ground_ring(cv: Canvas, cx, cy, rx, thick, color, alpha=1.0, ratio=0.5):
    outer = Canvas.arr(cv.ellipse(cx, cy, rx, rx * ratio))
    inner = Canvas.arr(cv.ellipse(cx, cy, max(rx - thick, 0.01), max(rx - thick, 0.01) * ratio))
    cv.paint(minus(outer, inner), color, alpha)


def iso_poly(cx, cy, pts_tiles, scale=1.0):
    """Sim-space (tile) points → screen px around (cx, cy)."""
    return [(cx + (x - y) * 32 * scale, cy + (x + y) * 16 * scale) for x, y in pts_tiles]


def iso_dir(angle_rad):
    """Sim heading (from +x toward +y) → normalized screen direction."""
    x, y = math.cos(angle_rad), math.sin(angle_rad)
    sx, sy = (x - y) * 32, (x + y) * 16
    L = math.hypot(sx, sy)
    return sx / L, sy / L


# ---------------------------------------------------------------- effect model
@dataclass
class Frame:
    image: Image.Image | None  # None = transparent terminal frame
    ox: float = 0.0
    oy: float = 0.0


@dataclass
class Clip:
    fps: int
    loop: bool
    frames: list


@dataclass
class Effect:
    id: str
    resolution: int
    clips: dict
    variants: dict
    intent: dict = field(default_factory=dict)  # variant -> design intent text
    wiring: str = ""
    notes: str = ""


def render_frames(size, origin, n, draw, resolution=1, ss=SS, empty_tail=True):
    """Render n frames of draw(cv, t, i) on a (w,h) world-px box with origin (world px).

    Output images are at `resolution`× so a 2× effect keeps the same world size."""
    w, h = size
    ox, oy = origin
    frames = []
    for i in range(n):
        t = i / max(n - 1, 1)
        cv = Canvas(w, h, ox, oy, resolution, ss)
        draw(cv, t, i)
        frames.append(Frame(cv.image(), ox * resolution, oy * resolution))
    if empty_tail:
        frames.append(Frame(None))
    return frames


def still(size, origin, draw, resolution=1, ss=SS):
    return render_frames(size, origin, 1, lambda cv, t, i: draw(cv), resolution, ss, empty_tail=False)
