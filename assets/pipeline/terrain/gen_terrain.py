"""Deterministic, seamless stylized terrain materials — version 3 (world art).

v3 (28 Sep, battlefield material pass): calmer sand, packed earth without a
full-coverage crack net, new passable `gravel_wash` scree apron, and opaque
world-anchored cliff faces built from vertical fracture columns.

Authored by Claude Code (claude-opus-5-5) for assignment 05 (world art). Every
output is original procedural art: no photographs, scans or third-party textures.

Ground materials (512 x 512, 4 x 4 tiles, 128 texels per tile, world space
u = sim x, v = sim y) keep their v1 registry IDs and dimensions. Version 2
changes the art direction to broad, readable, painted colour masses:

* No uniform salt-and-pepper speckle. Detail (stones, tufts, cracks) is
  *clustered* by a mid-frequency mask and sized to read at 1x (>= 4 texels).
* A 512 texture repeats every 4 tiles, so it carries almost no low-frequency
  variation (that is what produced visible 4-tile mottling). Large-scale
  breakup is a separate 1024 x 1024, 32-tile `ground_macro` multiply map.
* Each material family has its own hue so gameplay terrain reads by colour
  as well as by pattern: open ground ochre, packed earth red-brown, cover scrub
  olive, rock grey-brown, rubble grey + brick, roads warm charcoal, water teal.
* Soft value banding (posterised light) gives a hand-painted, non-photoreal look.

Additional planned manifest materials (see docs/world-art.md for renderer use):
water (shallow/deep), coast sand, industrial pavement, dry farmland, ramp,
cliff faces (tier 1/2), road edge decals (asphalt/dirt), transition masks and
height-tier edge strips. Non-square/alpha outputs are declared in terrain.json
with `kind` and `size` so the loader can distinguish them.

Usage:  work/art/.venv/bin/python assets/pipeline/terrain/gen_terrain.py [--preview]
Outputs: assets/build/terrain/<id>.png (+ <id>.height.png for surface materials),
         assets/build/terrain/terrain.json
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(REPO, 'assets', 'build', 'terrain')
SIZE = 512            # texels, = 4 tiles * 128
TILES = 4
SUN_ELEVATION = 50.0
SUN_TRAVEL_DEG = 33.4  # Blender XY; Blender y = -sim y
VERSION = 3


# ----------------------------------------------------------------- noise tools
def spectral(seed, beta, size=SIZE, lo=1, hi=None, aniso=(1.0, 1.0), shape=None):
    """Periodic fractal noise in [0,1] via a 1/f^beta spectrum on a torus."""
    h, w = shape or (size, size)
    r = np.random.default_rng(seed)
    fy = np.fft.fftfreq(h)[:, None] * h * aniso[1]
    fx = np.fft.fftfreq(w)[None, :] * w * aniso[0]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    amp = 1.0 / f ** beta
    amp[f < lo] = 0
    if hi:
        amp[f > hi] = 0
    ph = r.uniform(0, 2 * np.pi, (h, w))
    n = np.real(np.fft.ifft2(amp * np.exp(1j * ph)))
    n -= n.min()
    return n / (n.max() + 1e-9)


def blur(a, k):
    """Periodic box blur (k odd) using wrapped cumulative sums; repeated for smoothness."""
    out = a.astype(np.float32)
    for _ in range(2):
        for axis in (0, 1):
            pad = np.concatenate([out.take(range(-k // 2, 0), axis=axis), out, out.take(range(0, k // 2 + 1), axis=axis)], axis=axis)
            c = np.cumsum(pad, axis=axis, dtype=np.float64)
            n = out.shape[axis]
            hi = c.take(range(k, k + n), axis=axis)
            lo = c.take(range(0, n), axis=axis)
            out = ((hi - lo) / k).astype(np.float32)
    return out


def wrapped_dist(xx, yy, cx, cy, w, h):
    dx = (xx - cx + w / 2) % w - w / 2
    dy = (yy - cy + h / 2) % h - h / 2
    return dx, dy


def clustered_points(seed, count, mask, size=SIZE, min_gap=0.0):
    """Sample points preferring high values of mask (rejection sampling), wrapped."""
    r = np.random.default_rng(seed)
    pts = []
    tries = 0
    while len(pts) < count and tries < count * 60:
        tries += 1
        x, y = r.uniform(0, size, 2)
        if r.random() > mask[int(y) % mask.shape[0], int(x) % mask.shape[1]] ** 1.5:
            continue
        if min_gap and any(((x - px + size / 2) % size - size / 2) ** 2 + ((y - py + size / 2) % size - size / 2) ** 2 < min_gap ** 2 for px, py in pts[-60:]):
            continue
        pts.append((x, y))
    return pts, r


def stamp_stones(seed, count, rmin, rmax, mask, size=SIZE, angular=0.0, flat=0.6):
    """Height field of stones placed by mask. angular>0 gives faceted shapes."""
    pts, r = clustered_points(seed, count, mask, size)
    hgt = np.zeros((size, size), np.float32)
    ids = np.zeros((size, size), np.int32)
    for i, (cx, cy) in enumerate(pts):
        rad = r.uniform(rmin, rmax)
        x0, x1 = int(cx - rad - 2), int(cx + rad + 3)
        y0, y1 = int(cy - rad - 2), int(cy + rad + 3)
        yy, xx = np.mgrid[y0:y1, x0:x1]
        dx, dy = xx - cx, yy - cy
        rot = r.uniform(0, math.pi)
        ex, ey = dx * math.cos(rot) + dy * math.sin(rot), -dx * math.sin(rot) + dy * math.cos(rot)
        ey = ey * r.uniform(1.1, 1.7)
        if angular:
            k = r.integers(4, 7)
            ang = np.arctan2(ey, ex)
            poly = np.cos(math.pi / k) / np.cos((ang % (2 * math.pi / k)) - math.pi / k)
            d = np.sqrt(ex * ex + ey * ey) / (rad * (1 - angular + angular * poly))
        else:
            d = np.sqrt(ex * ex + ey * ey) / rad
        bump = np.clip(1 - d, 0, 1) ** flat * r.uniform(0.6, 1.0)
        ys, xs = yy % size, xx % size
        cur = hgt[ys, xs]
        take = bump > cur
        hgt[ys[take], xs[take]] = bump[take]
        ids[ys[take], xs[take]] = i + 1
    return hgt, ids


def voronoi_edges(seed, cells, size=SIZE, jitter=0.9, warp=0.0):
    """Periodic Voronoi: returns (edge distance field, cell id). warp (texels)
    bends cell borders with periodic noise so edges read as natural fractures."""
    r = np.random.default_rng(seed)
    n = int(round(math.sqrt(cells)))
    step = size / n
    pts = [((i + 0.5 + (r.random() - 0.5) * jitter) * step, (j + 0.5 + (r.random() - 0.5) * jitter) * step)
           for j in range(n) for i in range(n)]
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    if warp:
        xx = xx + (spectral(seed + 71, 1.6, size=size, lo=2, hi=16) - 0.5) * 2 * warp
        yy = yy + (spectral(seed + 72, 1.6, size=size, lo=2, hi=16) - 0.5) * 2 * warp
    d1 = np.full((size, size), 1e9, np.float32)
    d2 = np.full((size, size), 1e9, np.float32)
    cid = np.zeros((size, size), np.int32)
    for k, (px, py) in enumerate(pts):
        dx, dy = wrapped_dist(xx, yy, px, py, size, size)
        d = np.sqrt(dx * dx + dy * dy)
        closer = d < d1
        d2 = np.where(closer, d1, np.minimum(d2, d))
        cid = np.where(closer, k, cid)
        d1 = np.where(closer, d, d1)
    return (d2 - d1) * 0.5, cid


def shade(height, strength):
    """Lambert shading of a periodic height field with the shared sun vector."""
    gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / 2
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / 2
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(height)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx, ny, nz = nx / ln, ny / ln, nz / ln
    el = math.radians(SUN_ELEVATION)
    tr = math.radians(SUN_TRAVEL_DEG)
    lx_b, ly_b = -math.cos(tr) * math.cos(el), -math.sin(tr) * math.cos(el)
    lx, ly, lz = lx_b, -ly_b, math.sin(el)
    lam = np.clip(nx * lx + ny * ly + nz * lz, 0, 1)
    return lam / lz


def painted(light, bands=5, softness=0.35):
    """Soft posterisation of a light term: stylised painted value steps."""
    q = np.round(light * bands) / bands
    return q * (1 - softness) + light * softness


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def mix(a, b, t):
    """a, b: colours (3,) or images; t: field in 0..1."""
    t = np.clip(t, 0, 1)[..., None]
    return a * (1 - t) + b * t


def over(col, color, alpha):
    return col * (1 - alpha[..., None]) + hexc(color)[None, None] * alpha[..., None]


def solid(color, shape=(SIZE, SIZE)):
    return np.broadcast_to(hexc(color), shape + (3,)).astype(np.float32).copy()


# --------------------------------------------------------------- materials
MATERIALS = {}


def material(kind='surface', size=(SIZE, SIZE), **meta):
    def wrap(fn):
        MATERIALS[fn.__name__] = dict(fn=fn, kind=kind, size=size, **meta)
        return fn
    return wrap


def ground_soft(seed, a, b, amount=0.5):
    """Low-contrast mid-frequency ground tone (periods of 1/2 to 1 tile only)."""
    t = spectral(seed, 1.6, lo=4, hi=24)
    return mix(hexc(a), hexc(b), 0.5 + (t - 0.5) * amount * 2), t


@material(role='open ground (primary): warm ochre dry ground, calm under units')
def sand(seed=1101):
    """v3: broad soft strokes only; pebbles are rare, low-contrast clusters so
    the 4-tile period does not read as a repeated dot pattern."""
    col, t = ground_soft(seed, '#AF9569', '#B79E71', 0.35)
    stroke = spectral(seed + 1, 1.5, lo=3, hi=14, aniso=(1.0, 0.45))           # painterly broad strokes
    col = mix(col, hexc('#C0A87B'), np.clip((stroke - 0.55) * 1.6, 0, 0.35))
    col = mix(col, hexc('#A3895F'), np.clip((0.42 - stroke) * 1.6, 0, 0.25))
    ripple_mask = np.clip((blur(spectral(seed + 4, 2.0, lo=2, hi=8), 21) - 0.6) * 3, 0, 1)
    ripple = 0.5 + 0.5 * np.sin(np.arange(SIZE)[None, :] * 2 * np.pi * 24 / SIZE + spectral(seed + 5, 2.0, lo=1, hi=6) * 9)
    col = mix(col, hexc('#C4AD80'), ripple * ripple_mask * 0.18)
    grit_mask = np.clip((blur(spectral(seed + 2, 2.0, lo=2, hi=8), 15) - 0.66) * 4, 0, 1)
    stones, _ = stamp_stones(seed + 3, 36, 3.0, 6.0, grit_mask, flat=0.7)
    col = over(col, '#9A845F', np.clip(stones * 0.9, 0, 0.35))
    h = t * 0.2 + stroke * 0.25 + ripple * ripple_mask * 0.1 + stones * 0.7
    return col, h, 2.4


@material(role='open ground variant: red-brown compacted dirt, sparse crack clusters')
def packed_earth(seed=1202):
    """v3: no full-coverage crack net. Cracks exist only inside ~12% masked
    patches; the rest is compact dirt with broad value strokes and scuffs."""
    col, t = ground_soft(seed, '#8D7152', '#967A58', 0.4)
    stroke = blur(spectral(seed + 5, 1.8, lo=2, hi=8), 9)
    col = mix(col, hexc('#A08463'), np.clip((stroke - 0.55) * 1.8, 0, 0.35))
    col = mix(col, hexc('#7E6446'), np.clip((0.42 - stroke) * 1.8, 0, 0.3))
    patch = np.clip((blur(spectral(seed + 2, 2.0, lo=2, hi=8), 21) - 0.64) * 5, 0, 1)
    edge, _ = voronoi_edges(seed + 1, 30, warp=10)
    crack = np.clip(1 - edge / 1.2, 0, 1) * patch
    col = over(col, '#624A34', crack * 0.45)
    mask = np.clip((blur(spectral(seed + 3, 2.0, lo=2, hi=8), 15) - 0.6) * 3, 0, 1)
    stones, _ = stamp_stones(seed + 4, 40, 3, 6.5, mask, angular=0.4)
    col = over(col, '#7D6C56', np.clip(stones * 1.2, 0, 0.7))
    return col, t * 0.25 + stroke * 0.25 - crack * 0.3 + stones * 0.8, 3.0


@material(role='open ground variant: pebbly scree apron at the foot of rock (passable)')
def gravel_wash(seed=1252):
    """Small, flat, rounded pebbles over dirt. Deliberately smaller and lower than
    rubble (no brick or masonry) so it never reads as infantry cover."""
    col, t = ground_soft(seed, '#8E8269', '#998C72', 0.4)
    mask = np.clip(blur(spectral(seed + 1, 1.8, lo=2, hi=10), 9) * 1.6 - 0.35, 0, 1)
    stones, ids = stamp_stones(seed + 2, 230, 3.5, 7.0, mask, angular=0.3, flat=0.6)
    tone = ((ids.astype(np.int64) * 2654435761) % 1000) / 1000.0
    stone_col = mix(hexc('#8C8574'), hexc('#AAA290'), tone)
    a = np.clip(stones * 2.2, 0, 1) * 0.85
    col = col * (1 - a[..., None]) + stone_col * a[..., None]
    return col, t * 0.2 + stones * 1.0, 3.2


@material(role='infantry cover: olive scrub and grass clumps')
def scrub_ground(seed=1303):
    col, t = ground_soft(seed, '#857150', '#8E7A56', 0.45)
    clump_mask = blur(spectral(seed + 1, 1.8, lo=3, hi=14), 7)
    clump_mask = np.clip((clump_mask - 0.4) * 2.2, 0, 1)
    col = mix(col, hexc('#6F6A42'), clump_mask * 0.55)                        # olive ground under clumps
    tufts, ids = stamp_stones(seed + 2, 150, 6, 12, clump_mask, flat=1.2)
    shade_t = ((ids.astype(np.int64) * 2654435761) % 1000) / 1000.0
    tuft_col = mix(hexc('#5E6A38'), hexc('#7C7F45'), shade_t)
    a = np.clip(tufts * 2.2, 0, 1)
    col = col * (1 - a[..., None]) + tuft_col * a[..., None]
    bush, _ = stamp_stones(seed + 3, 34, 10, 18, clump_mask, flat=0.8)          # low bushes
    ab = np.clip(bush * 2.0, 0, 1)
    col = over(col, '#4E5A30', ab * 0.9)
    col = over(col, '#6E7A40', np.clip(bush - 0.55, 0, 1) * 1.2)
    return col, t * 0.2 + tufts * 0.6 + bush * 1.1, 3.4


@material(role='impassable rock tops (cliff/blocked): large irregular faceted rock, not paving')
def gravel(seed=1404):
    """Natural rock: few large cells, each a tilted plane (faceted light), with
    only faint fissures where neighbouring facets differ strongly."""
    col, t = ground_soft(seed, '#7B715E', '#877D68', 0.5)
    edge, cid = voronoi_edges(seed + 1, 10, jitter=1.0, warp=28)
    edge2, cid2 = voronoi_edges(seed + 5, 42, jitter=1.0, warp=14)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32) / SIZE
    ang = ((cid.astype(np.int64) * 40503) % 360) * math.pi / 180
    ang2 = ((cid2.astype(np.int64) * 7919) % 360) * math.pi / 180
    # periodic tilted planes: sin keeps them wrap-safe
    plane = np.sin(2 * math.pi * (xx * np.cos(ang) + yy * np.sin(ang))) * 0.5
    plane2 = np.sin(2 * math.pi * 2 * (xx * np.cos(ang2) + yy * np.sin(ang2))) * 0.25
    tone = ((cid.astype(np.int64) * 2654435761) % 100) / 100.0
    col = mix(col, hexc('#958B76'), tone * 0.45)
    h = plane + plane2 + spectral(seed + 2, 1.4, lo=6, hi=40) * 0.2
    fissure = np.clip(1 - edge / 1.3, 0, 1) * 0.35 + np.clip(1 - edge2 / 0.9, 0, 1) * (spectral(seed + 3, 1.5, lo=3, hi=12) > 0.55) * 0.25
    col = over(col, '#4A4236', fissure)
    lichen = np.clip((blur(spectral(seed + 4, 2.0, lo=3, hi=12), 9) - 0.62) * 3, 0, 1)
    col = over(col, '#6C6A4C', lichen * 0.3)
    return col, h - fissure * 0.3, 5.0


@material(role='infantry cover: broken masonry and brick rubble')
def rubble_ground(seed=1505):
    col, t = ground_soft(seed, '#827764', '#8B806C', 0.45)
    mask = blur(spectral(seed + 1, 1.8, lo=3, hi=14), 7)
    mask = np.clip((mask - 0.3) * 2.0, 0, 1)
    col = mix(col, hexc('#6E665A'), mask * 0.35)
    blocks, ids = stamp_stones(seed + 2, 190, 5, 13, mask, angular=0.85, flat=0.35)
    kind = ((ids.astype(np.int64) * 2246822519) % 1000) / 1000.0
    concrete = mix(hexc('#958E82'), hexc('#ABA498'), kind)
    brick = mix(hexc('#8A5A40'), hexc('#9E6A4A'), kind)
    tone = np.where((kind > 0.68)[..., None], brick, concrete)
    a = np.clip(blocks * 3.0, 0, 1)
    col = col * (1 - a[..., None]) + tone * a[..., None]
    rebar = (np.abs(spectral(seed + 3, 1.2, lo=8, hi=32) - 0.5) < 0.006) & (mask > 0.5)
    col[rebar] = hexc('#4A3A2E')
    return col, t * 0.2 + blocks * 1.2, 4.2


@material(role='paved road: warm charcoal asphalt with repairs')
def asphalt(seed=1606):
    col, t = ground_soft(seed, '#4B4944', '#53504A', 0.4)
    agg = spectral(seed + 1, 0.6, lo=48)
    col *= (0.97 + 0.06 * agg)[..., None]
    # rectangular patch repairs, aligned to the tile grid (readable, not noise)
    r = np.random.default_rng(seed + 2)
    for _ in range(6):
        x0, y0 = r.integers(0, SIZE, 2)
        w, hgt = r.integers(40, 120), r.integers(28, 90)
        yy = (np.arange(y0, y0 + hgt) % SIZE)[:, None]
        xx = (np.arange(x0, x0 + w) % SIZE)[None, :]
        col[yy, xx] = col[yy, xx] * 0.9 + hexc('#3E3D3A') * 0.1
    edge, _ = voronoi_edges(seed + 3, 9)
    crack = (np.clip(1 - edge / 1.2, 0, 1) * (spectral(seed + 4, 1.4, lo=3, hi=16) > 0.6))
    col = over(col, '#2E2C29', crack * 0.6)
    dust = np.clip((spectral(seed + 5, 1.6, lo=3, hi=12) - 0.6) * 2.5, 0, 1)
    col = over(col, '#8A7B60', dust * 0.18)
    return col, t * 0.15 - crack * 0.3, 1.5


@material(role='base/industrial slabs: light warm concrete, 2-tile joints')
def concrete_slab(seed=1707):
    col, t = ground_soft(seed, '#8E8A80', '#98938A', 0.4)
    idx = np.arange(SIZE)
    joints = ((idx + 1) % 256 < 3)       # centred on the wrap so slabs tile
    slab_id = (idx[:, None] // 256) * 2 + (idx[None, :] // 256)
    slab_tone = (slab_id * 7 % 5) / 5.0
    col = mix(col, hexc('#A29D93'), slab_tone * 0.3)
    col[joints, :] = col[joints, :] * 0.72
    col[:, joints] = col[:, joints] * 0.72
    h = t * 0.2
    h[joints, :] -= 0.35
    h[:, joints] -= 0.35
    stain = np.clip((blur(spectral(seed + 1, 2.0, lo=2, hi=10), 11) - 0.58) * 3, 0, 1)
    col = over(col, '#6F6A60', stain * 0.35)
    edge, _ = voronoi_edges(seed + 2, 6)
    crack = np.clip(1 - edge / 1.1, 0, 1) * (spectral(seed + 3, 1.4, lo=3, hi=12) > 0.66)
    col = over(col, '#5F5A52', crack * 0.5)
    return col, h - crack * 0.2, 2.0


@material(role='dry riverbed floor: pale clay with varied curled mud plates')
def dry_riverbed(seed=1808):
    col, t = ground_soft(seed, '#A89678', '#B3A283', 0.4)
    edge, cid = voronoi_edges(seed + 1, 16, jitter=1.0, warp=10)            # major plates ~1 tile
    edge2, _ = voronoi_edges(seed + 3, 64, jitter=1.0, warp=6)                      # minor cracks, partial
    width = 1.2 + spectral(seed + 2, 1.5, lo=3, hi=12) * 2.2                # gap width varies
    gap = np.clip(1 - edge / width, 0, 1)
    minor = np.clip(1 - edge2 / 0.9, 0, 1) * (spectral(seed + 4, 1.6, lo=3, hi=10) > 0.6)
    plate_tone = ((cid.astype(np.int64) * 48271) % 89) / 89.0
    col = mix(col, hexc('#BAA98A'), plate_tone * 0.3)
    col = mix(col, hexc('#C4B597'), np.clip(1 - edge / 6.0, 0, 1) * 0.25 * (1 - gap))   # curled lit lips
    col = over(col, '#76644C', gap * 0.5)
    col = over(col, '#8C7A5E', minor * 0.35)
    h = np.clip(edge / 8.0, 0, 1) * 0.4 - gap * 0.35 + t * 0.1
    return col, h, 3.0


@material(role='shallow water: clear turquoise over a sandy bed', alpha_hint='opaque')
def shallow_water(seed=1909):
    bed, _ = ground_soft(seed, '#8C8A68', '#99946F', 0.5)
    depth = spectral(seed + 1, 1.8, lo=2, hi=10)
    water = mix(hexc('#4F8E8C'), hexc('#3D7C80'), depth)
    col = bed * 0.28 + water * 0.72
    ripple = spectral(seed + 2, 1.1, lo=8, hi=40, aniso=(1.0, 0.45))
    crest = np.clip((ripple - 0.7) * 5, 0, 1)
    col = over(col, '#9CC6BC', crest * 0.35)
    return col, ripple * 0.15, 1.0


@material(role='deep water: dark clear blue-teal, readable impassable body')
def deep_water(seed=2010):
    depth = spectral(seed, 1.8, lo=2, hi=8)
    col = mix(hexc('#1F4A56'), hexc('#2A5E69'), depth)
    swell = spectral(seed + 1, 1.2, lo=6, hi=28, aniso=(1.0, 0.5))
    col = mix(col, hexc('#33707A'), np.clip((swell - 0.55) * 2, 0, 0.5))
    crest = np.clip((spectral(seed + 2, 1.0, lo=12, hi=48, aniso=(1.0, 0.4)) - 0.78) * 6, 0, 1)
    col = over(col, '#8FC0C0', crest * 0.4)
    return col, swell * 0.1, 0.8


@material(role='coast / beach sand: pale, fine, shell flecks sparse')
def coast_sand(seed=2111):
    col, t = ground_soft(seed, '#C9B48A', '#D3BF95', 0.4)
    wet = np.clip((spectral(seed + 1, 1.8, lo=2, hi=8) - 0.6) * 2.5, 0, 1)
    col = mix(col, hexc('#A89572'), wet * 0.45)
    mask = np.clip((spectral(seed + 2, 2.0, lo=3, hi=10) - 0.6) * 3, 0, 1)
    shells, _ = stamp_stones(seed + 3, 50, 1.8, 3.2, mask)
    col = over(col, '#E8DCC0', np.clip(shells * 1.6, 0, 0.8))
    return col, t * 0.2 + shells * 0.4 - wet * 0.1, 2.0


@material(role='industrial yards: worn panels, oil stains, faded paint')
def industrial_pavement(seed=2212):
    col, h, _ = MATERIALS['concrete_slab']['fn'](seed)
    col = mix(col, hexc('#7C786F'), 0.35)
    oil = np.clip((blur(spectral(seed + 1, 2.4, lo=2, hi=8), 31) - 0.62) * 3, 0, 1)
    col = over(col, '#4A4640', oil * 0.28)
    idx = np.arange(SIZE)
    paint = ((idx % 256 > 120) & (idx % 256 < 132))[None, :] & ((idx % 64) < 40)[:, None]
    fade = spectral(seed + 2, 1.0, lo=6, hi=40) > 0.45
    col[paint & fade] = col[paint & fade] * 0.45 + hexc('#B8943E') * 0.55
    return col, h, 2.0


@material(role='dry farmland: furrows (1/8 tile) and stubble, period aligned')
def farmland_dry(seed=2313):
    col, t = ground_soft(seed, '#96774F', '#A08158', 0.45)
    idx = np.arange(SIZE)
    furrow = 0.5 + 0.5 * np.cos(idx[None, :] * 2 * np.pi / 16)
    furrow = np.broadcast_to(furrow, (SIZE, SIZE))
    wob = spectral(seed + 1, 1.5, lo=4, hi=16) * 0.15
    col = mix(col, hexc('#7A5E3E'), (1 - furrow) * 0.55 + wob)
    stub = np.clip((spectral(seed + 2, 0.6, lo=60) - 0.72) * 5, 0, 1) * furrow
    col = over(col, '#C4A76C', stub * 0.6)
    return col, furrow * 0.5 + t * 0.1, 2.5


@material(role='ramp surface: compacted dirt with rut lines running along v (down-slope)')
def ramp(seed=2414):
    col, t = ground_soft(seed, '#937A55', '#9D845E', 0.4)
    idx = np.arange(SIZE)
    rut = np.exp(-((idx[None, :] % 128 - 38) ** 2) / 30.0) + np.exp(-((idx[None, :] % 128 - 90) ** 2) / 30.0)
    rut = np.broadcast_to(rut, (SIZE, SIZE)) * (0.7 + 0.3 * spectral(seed + 1, 1.5, lo=4, hi=16))
    col = over(col, '#6E5A40', np.clip(rut, 0, 1) * 0.45)
    steps = ((idx + 1) % 64 < 3)[:, None] & (spectral(seed + 2, 1.2, lo=4, hi=20) > 0.5)
    col[steps] = col[steps] * 0.85
    return col, t * 0.2 - rut * 0.25, 2.5


# ---- vertical faces and decals (alpha outputs) ---------------------------------
def rock_face(seed, w, h, block):
    """v3 opaque rock face. Rows are WORLD-anchored: row 0 = height level 4,
    last row = level 0 (terrain.ts maps v = (4 - height) / 4), so strata line up
    across neighbouring faces. Irregular, vertically elongated rock blocks from a
    warped Voronoi, each lit as its own facet; lip light and foot occlusion are
    baked on the ground tiles, where the actual edge is known."""
    cells = max(9, int((w / block) ** 2))
    edge, cid = voronoi_edges(seed, cells, size=w, jitter=1.0, warp=block * 0.35)
    rows = (np.arange(h) * (w / 2.2 / h)).astype(int) % w      # vertical elongation ~2.2x
    edge, cid = edge[rows], cid[rows]
    ids = cid.astype(np.int64)
    tone = ((ids * 2654435761) % 1000) / 1000.0
    tilt = ((ids * 40503) % 1000) / 1000.0
    base = mix(hexc('#74644E'), hexc('#9A876A'), tone)
    facet = 0.82 + 0.3 * tilt
    inner = np.clip(edge / (block * 0.25), 0, 1)
    light = facet * (0.86 + 0.14 * inner)
    col = base * light[..., None]
    crevice = np.clip(1 - edge / 2.2, 0, 1)
    col = over(col, '#3A3027', crevice * 0.75)
    grain = spectral(seed + 2, 1.3, lo=8, hi=60, shape=(h, w))
    col *= (0.93 + 0.14 * grain)[..., None]
    strata = spectral(seed + 1, 1.6, lo=1, hi=10, aniso=(0.15, 1.0), shape=(h, w))
    col *= (0.93 + 0.12 * strata)[..., None]
    return col, np.ones((h, w), np.float32)


@material(kind='face', size=(512, 128), role='cliff face, opaque; rows world-anchored (row 0 = level 4, v=(4-h)/4); 4 tiles per repeat along the edge')
def cliff_face_tier1(seed=2515):
    return rock_face(seed, 512, 128, 64)


@material(kind='face', size=(512, 256), role='cliff face for drops over one level: wider fracture columns, same world-anchored rows')
def cliff_face_tier2(seed=2616):
    return rock_face(seed, 512, 256, 96)


def edge_strip(seed, core, shoulder, verge, ruts=False):
    """Road edge decal 512x128, tiles along x. Row 0 = road interior side,
    row 127 = open ground side. Alpha fades to 0 into the ground."""
    w, h = 512, 128
    yy = (np.arange(h)[:, None] / (h - 1)).repeat(w, 1)
    ragged = spectral(seed, 1.4, lo=3, hi=40, shape=(h, w))
    line = 0.42 + (ragged - 0.5) * 0.25
    col = np.where((yy < line)[..., None], hexc(core)[None, None], hexc(shoulder)[None, None]).astype(np.float32)
    grit = np.clip((spectral(seed + 1, 1.8, lo=4, hi=20, shape=(h, w)) - 0.5) * 3, 0, 1)
    col = mix(col, hexc(verge), np.clip((yy - line) * 2.5, 0, 1) * (0.5 + 0.5 * grit))
    col = over(col, '#2E2A26', np.clip(1 - np.abs(yy - line) * 60, 0, 1) * 0.45)
    if ruts:
        rut = np.exp(-((yy - 0.22) * 40) ** 2)
        col = over(col, '#5E4C36', rut * 0.5)
    alpha = np.clip(1 - (yy - line - 0.05) * 2.4, 0, 1) * np.clip(0.55 + ragged, 0, 1)
    alpha = np.where(yy < line, 1.0, alpha)
    return col, alpha.astype(np.float32)


@material(kind='decal', size=(512, 128), role='asphalt road edge: crumbled lip, gravel shoulder, dust fade')
def road_asphalt_decal(seed=2717):
    return edge_strip(seed, '#4B4944', '#7E7564', '#9E8A66')


@material(kind='decal', size=(512, 128), role='dirt track edge: wheel rut and berm fade')
def road_dirt_decal(seed=2818):
    return edge_strip(seed, '#8A7152', '#7A6448', '#A58D66', ruts=True)


@material(kind='mask_atlas', size=(512, 512), role='16 corner-case organic blend masks (4x4 atlas of 128px); case bits NW=1 NE=2 SE=4 SW=8')
def transition_masks(seed=2919):
    """Marching-squares corner masks with an organic noisy edge. Each 128 cell
    is one tile; white = the upper material. Use alpha channel."""
    cell = 128
    out = np.zeros((512, 512), np.float32)
    n = spectral(seed, 1.6, lo=2, hi=24, size=cell) - 0.5
    yy, xx = np.mgrid[0:cell, 0:cell].astype(np.float32) / (cell - 1)
    corners = {1: (0, 0), 2: (1, 0), 4: (1, 1), 8: (0, 1)}
    for case in range(16):
        f = np.zeros((cell, cell), np.float32)
        for bit, (cx, cy) in corners.items():
            wgt = (1 - np.abs(xx - cx)) * (1 - np.abs(yy - cy))
            if case & bit:
                f += wgt
        m = np.clip((f + n * 0.35 - 0.5) * 7 + 0.5, 0, 1)
        r0, c0 = (case // 4) * cell, (case % 4) * cell
        out[r0:r0 + cell, c0:c0 + cell] = m
    col = np.stack([out * 255] * 3, -1)
    return col, out


@material(kind='edge_atlas', size=(512, 256), role='height tier edge strips: row 0-63 lit lip, 64-127 drop shadow, 128-255 contact occlusion')
def height_tier_edges(seed=3020):
    w = 512
    ragged = spectral(seed, 1.4, lo=3, hi=40, shape=(1, w))[0]
    col = np.zeros((256, w, 3), np.float32)
    alpha = np.zeros((256, w), np.float32)
    y = np.arange(64)[:, None] / 63.0
    lip = np.clip(1 - (y - ragged[None] * 0.3) * 3, 0, 1)
    col[0:64] = hexc('#E6D2A6'); alpha[0:64] = lip * 0.55
    sh = np.clip(1 - y * 1.4 + (ragged[None] - 0.5) * 0.2, 0, 1)
    col[64:128] = hexc('#1C1610'); alpha[64:128] = sh * 0.6
    y2 = np.arange(128)[:, None] / 127.0
    col[128:256] = hexc('#231C14'); alpha[128:256] = np.clip(1 - y2, 0, 1) ** 2 * 0.45 * (0.8 + 0.4 * ragged[None])
    return col, alpha


@material(kind='macro', size=(1024, 1024), role='ground_macro: 32x32-tile multiply map (128 = neutral) for broad colour masses')
def ground_macro(seed=3121):
    s = 1024
    big = spectral(seed, 2.4, lo=1, hi=6, size=s)
    mid = spectral(seed + 1, 2.0, lo=4, hi=14, size=s)
    warm = spectral(seed + 2, 2.4, lo=1, hi=5, size=s)
    v = 1.0 + (big - 0.5) * 0.16 + (mid - 0.5) * 0.06
    v = np.round(v * 40) / 40 * 0.6 + v * 0.4       # soft painted bands
    r = v * (1 + (warm - 0.5) * 0.06)
    b = v * (1 - (warm - 0.5) * 0.08)
    col = np.stack([r, v, b], -1) * 128
    return col, None


# ------------------------------------------------------------------ metrics
def luminance(img):
    a = img.astype(np.float32)
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def metrics(img):
    """speckle = mean |L - blur5(L)| (high-frequency energy); patchiness =
    std of 64-texel blurred L (in-texture low-frequency variation that repeats
    every 4 tiles); mean luminance and chroma."""
    L = luminance(img)
    speckle = float(np.abs(L - blur(L, 5)).mean())
    patch = float(blur(L, 63).std())
    a = img.astype(np.float32)
    chroma = float((a.max(-1) - a.min(-1)).mean())
    return {'speckle': round(speckle, 2), 'patchiness': round(patch, 2), 'mean_luma': round(float(L.mean()), 1), 'chroma': round(chroma, 1)}


def build():
    os.makedirs(OUT, exist_ok=True)
    index = {'version': VERSION, 'texels_per_tile': 128, 'tiles_per_texture': TILES, 'space': 'world (u = sim x, v = sim y)',
             'sun': {'elevation_deg': SUN_ELEVATION, 'travel_deg_blender_xy': SUN_TRAVEL_DEG},
             'generator': 'assets/pipeline/terrain/gen_terrain.py (v2, Claude claude-opus-5-5)',
             'license': 'Original procedural art for Frontline Command; no third-party inputs',
             'materials': {}}
    for name, spec in MATERIALS.items():
        res = spec['fn']()
        kind = spec['kind']
        entry = {'file': f'{name}.png', 'kind': kind, 'size': list(spec['size'][::-1]) if kind != 'surface' else [SIZE, SIZE], 'role': spec.get('role', '')}
        if kind == 'surface':
            col, h, strength = res
            light = painted(0.74 + 0.26 * shade(h * 6.0, strength))
            img = np.clip(col * light[..., None], 0, 255).astype(np.uint8)
            Image.fromarray(img, 'RGB').save(os.path.join(OUT, f'{name}.png'), optimize=True)
            hn = (np.clip((h - h.min()) / (np.ptp(h) + 1e-9), 0, 1) * 255).astype(np.uint8)
            Image.fromarray(hn, 'L').save(os.path.join(OUT, f'{name}.height.png'), optimize=True)
            entry['height'] = f'{name}.height.png'
            a = img.astype(int)
            seam = float((np.abs(a[0] - a[-1]).mean() + np.abs(a[:, 0] - a[:, -1]).mean()) / 2)
            rows = np.abs(np.diff(a, axis=0)).mean(axis=(1, 2))
            inner, p99 = float(rows.mean()), float(np.percentile(rows, 99))
            entry.update(seam_delta=round(seam, 2), interior_delta_mean=round(inner, 2), interior_delta_p99=round(p99, 2),
                         seamless=seam <= max(p99, inner * 1.5), metrics=metrics(img))
            print(f"{name:20s} seam {seam:5.2f} inner {inner:5.2f} {'OK' if entry['seamless'] else 'SEAM'} {entry['metrics']}")
        elif kind == 'macro':
            col, _ = res
            img = np.clip(col, 0, 255).astype(np.uint8)
            Image.fromarray(img, 'RGB').save(os.path.join(OUT, f'{name}.png'), optimize=True)
            entry['tiles'] = 32
            print(f'{name:20s} macro {img.shape}')
        else:
            col, alpha = res
            rgba = np.dstack([np.clip(col, 0, 255), np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
            Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, f'{name}.png'), optimize=True)
            print(f'{name:20s} {kind} {rgba.shape}')
        index['materials'][name] = entry
    with open(os.path.join(OUT, 'terrain.json'), 'w') as f:
        json.dump(index, f, indent=2)


if __name__ == '__main__':
    build()
