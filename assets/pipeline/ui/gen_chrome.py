"""Procedural console chrome for the Frontline Command command interface.

Warm gunmetal plate, recessed wells, tactile buttons (5 states), cameo frames and a
brass bezel, as 9-slice PNGs at 2x. Deterministic (fixed seeds), editable here.
Material language: machined edges, seams, occasional bolts, restrained wear — quiet
behind labels (work/claude/06-rts-reference-study.md).

Usage: work/art/.venv/bin/python assets/pipeline/ui/gen_chrome.py
Outputs: assets/build/ui/chrome/*.png and chrome.json (slice metadata), preview in work/art/previews/chrome.png
"""
import json
import os

import numpy as np
from PIL import Image, ImageFilter

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(REPO, 'assets', 'build', 'ui', 'chrome')
SS = 4  # supersampling


def hexf(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def noise(shape, seed, scale, octaves=4, periodic=True):
    """Periodic value noise via FFT-filtered white noise."""
    r = np.random.default_rng(seed)
    h, w = shape
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.fftfreq(w)[None, :] * w
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    amp = 1 / f ** 1.6
    amp[f > max(h, w) / scale] *= 0.25
    n = np.real(np.fft.ifft2(amp * np.exp(1j * r.uniform(0, 2 * np.pi, (h, w)))))
    n -= n.min()
    return n / (n.max() + 1e-9)


def brushed(shape, seed):
    r = np.random.default_rng(seed)
    h, w = shape
    streak = r.normal(0, 1, (h, 1)) * 0.6 + r.normal(0, 1, (h, w)) * 0.25
    k = np.ones(31) / 31
    streak = np.apply_along_axis(lambda row: np.convolve(np.tile(row, 3), k, 'same')[w:2 * w], 1, streak)
    streak -= streak.min()
    return streak / (streak.max() + 1e-9)


def metal_base(h, w, seed, base='#3B3630', tint='#4A4034'):
    n = noise((h, w), seed, 6)
    b = brushed((h, w), seed + 1)
    c = hexf(base)[None, None] * (0.86 + 0.18 * n[..., None]) * (0.95 + 0.08 * b[..., None])
    c = c * 0.8 + hexf(tint)[None, None] * 0.2 * (0.9 + 0.2 * n[..., None])
    return c


def bevel(img, width, hi=0.20, lo=0.55):
    """Raised bevel: light top/left, dark bottom/right (light from upper-left)."""
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    d_top, d_left, d_bot, d_right = yy, xx, h - 1 - yy, w - 1 - xx
    out = img.copy()
    for d, k in ((d_top, 1 + hi), (d_left, 1 + hi * 0.7), (d_bot, 1 - lo), (d_right, 1 - lo * 0.7)):
        m = np.clip(1 - d / width, 0, 1)[..., None]
        out = out * (1 - m) + out * k * m
    return out


def wear(img, seed, amount=0.5, edge=10):
    """Paint chipping concentrated on edges: lighter bare metal flecks."""
    h, w = img.shape[:2]
    n = noise((h, w), seed, 2)
    yy, xx = np.mgrid[0:h, 0:w]
    dist = np.minimum(np.minimum(yy, xx), np.minimum(h - 1 - yy, w - 1 - xx))
    edge_w = np.clip(1 - dist / edge, 0, 1)
    chips = ((n > 1 - 0.18 * amount) & (edge_w > 0.2)) | (n > 1 - 0.03 * amount)
    out = img.copy()
    out[chips] = out[chips] * 0.6 + hexf('#8C8373') * 0.4
    return out


def bolt(img, cx, cy, r):
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    m = np.clip((r - d) * 1.5, 0, 1)[..., None]
    shade = np.clip(1.25 - ((xx - cx + r * 0.4) ** 2 + (yy - cy + r * 0.4) ** 2) ** 0.5 / r * 0.9, 0.35, 1.3)[..., None]
    col = hexf('#6A6356') * shade
    out = img * (1 - m) + col * m
    ring = (np.abs(d - r) < 1.2 * SS / 2)[..., None]
    out = np.where(ring, out * 0.45, out)
    slot = (np.abs((xx - cx) - (yy - cy)) < 0.8 * SS) & (d < r * 0.7)
    out[slot] *= 0.5
    return out


def seam(img, y=None, x=None, width=1.0):
    out = img.copy()
    t = max(1, int(width * SS))
    if y is not None:
        out[y:y + t] *= 0.35
        out[y + t:y + 2 * t] *= 1.18
    if x is not None:
        out[:, x:x + t] *= 0.35
        out[:, x + t:x + 2 * t] *= 1.12
    return out


def finish(arr, size, alpha=None):
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGB').resize(size, Image.LANCZOS)
    if alpha is not None:
        a = Image.fromarray(np.clip(alpha * 255, 0, 255).astype(np.uint8), 'L').resize(size, Image.LANCZOS)
        img = img.convert('RGBA')
        img.putalpha(a)
    return img


def console_plate():
    S = 128  # 2x px
    h = w = S * SS
    c = metal_base(h, w, 11)
    c = wear(c, 12, 0.7, edge=14 * SS)
    c = bevel(c, 3 * SS, hi=0.35, lo=0.6)
    c = seam(c, y=18 * SS, width=1)
    c = seam(c, x=18 * SS, width=1)
    c = seam(c, y=S * SS - 20 * SS, width=1)
    c = seam(c, x=S * SS - 20 * SS, width=1)
    for (x, y) in ((9, 9), (S - 9, 9), (9, S - 9), (S - 9, S - 9)):
        c = bolt(c, x * SS, y * SS, 3.2 * SS)
    return finish(c, (S, S))


def well():
    S = 64
    h = w = S * SS
    n = noise((h, w), 21, 5)
    c = hexf('#0F0E0C')[None, None] * (0.9 + 0.2 * n[..., None])
    yy, xx = np.mgrid[0:h, 0:w]
    inner = np.clip(yy / (5 * SS), 0, 1) * np.clip(xx / (4 * SS), 0, 1)
    c = c * (0.45 + 0.55 * inner[..., None])
    rim_b = np.clip(1 - (h - 1 - yy) / (1.5 * SS), 0, 1)[..., None]
    c = c * (1 - rim_b) + hexf('#4A443A') * rim_b
    return finish(c, (S, S))


def button_states():
    S = 64
    frames = []
    for i, st in enumerate(('normal', 'hover', 'pressed', 'disabled', 'active')):
        h = w = S * SS
        base = {'normal': '#403B33', 'hover': '#4C463C', 'pressed': '#302C26', 'disabled': '#27241F', 'active': '#4A4230'}[st]
        c = metal_base(h, w, 30 + i, base=base, tint='#4A4336' if st != 'disabled' else '#2A2722')
        if st == 'pressed':
            c = bevel(c, 3 * SS, hi=-0.35, lo=-0.25)
        elif st != 'disabled':
            c = bevel(c, 4 * SS, hi=0.75, lo=0.7)
            c = wear(c, 40 + i, 0.35, edge=6 * SS)
        else:
            c = bevel(c, 2 * SS, hi=0.08, lo=0.2)
        yy, xx = np.mgrid[0:h, 0:w]
        outline = (np.minimum(np.minimum(yy, xx), np.minimum(h - 1 - yy, w - 1 - xx)) < 1 * SS)[..., None]
        c = np.where(outline, c * 0.25, c)
        if st == 'active':
            glow = (np.minimum(np.minimum(yy, xx), np.minimum(h - 1 - yy, w - 1 - xx)) < 3 * SS)[..., None] & ~outline
            c = np.where(glow, c * 0.4 + hexf('#E2A232') * 0.6, c)
        frames.append(finish(c, (S, S)))
    sheet = Image.new('RGB', (S, S * len(frames)))
    for i, f in enumerate(frames):
        sheet.paste(f, (0, i * S))
    # per-state files so CSS border-image can address each state directly
    for st, f in zip(('normal', 'hover', 'pressed', 'disabled', 'active'), frames):
        f.save(os.path.join(OUT, f'button_{st}@2x.png'), optimize=True)
    return sheet


def cameo_frame():
    S = 48
    h = w = S * SS
    c = metal_base(h, w, 50, base='#4A453C')
    c = bevel(c, 2 * SS, hi=0.45, lo=0.55)
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.minimum(np.minimum(yy, xx), np.minimum(h - 1 - yy, w - 1 - xx))
    alpha = (d < 5 * SS).astype(np.float32)
    inner = (d >= 4 * SS) & (d < 5 * SS)
    c[inner] *= 0.2
    return finish(c, (S, S), alpha)


def brass_bezel():
    S = 64
    h = w = S * SS
    n = noise((h, w), 60, 4)
    c = (hexf('#8A6E3A')[None, None] * 0.8 + hexf('#5E5540')[None, None] * 0.2) * (0.75 + 0.45 * n[..., None])
    c = bevel(c, 4 * SS, hi=0.5, lo=0.6)
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.minimum(np.minimum(yy, xx), np.minimum(h - 1 - yy, w - 1 - xx))
    alpha = (d < 7 * SS).astype(np.float32)
    lip = (d >= 6 * SS) & (d < 7 * SS)
    c[lip] *= 0.3
    for (x, y) in ((4, 4), (S - 4, 4), (4, S - 4), (S - 4, S - 4)):
        c = bolt(c, x * SS, y * SS, 2.0 * SS)
    return finish(c, (S, S), alpha)


def metal_noise():
    S = 256
    n = noise((S, S), 70, 8)
    b = brushed((S, S), 71)
    v = 0.5 + (n - 0.5) * 0.35 + (b - 0.5) * 0.12
    g = (np.clip(v, 0, 1) * 255).astype(np.uint8)
    return Image.fromarray(g, 'L')


def main():
    os.makedirs(OUT, exist_ok=True)  # created first: button_states() writes per-state files
    items = {
        'console_plate@2x.png': (console_plate(), {'slice_2x': 36}),
        'well@2x.png': (well(), {'slice_2x': 16}),
        'button@2x.png': (button_states(), {'slice_2x': 12, 'frame_2x': [64, 64],
                                            'states': ['normal', 'hover', 'pressed', 'disabled', 'active']}),
        'cameo_frame@2x.png': (cameo_frame(), {'slice_2x': 10}),
        'brass_bezel@2x.png': (brass_bezel(), {'slice_2x': 20}),
        'metal_noise.png': (metal_noise(), {'tile': 256, 'blend': 'overlay at 10-18% opacity'}),
    }
    meta = {}
    for name, (img, m) in items.items():
        img.save(os.path.join(OUT, name), optimize=True)
        # 1x derivative for sharp 1x displays
        if '@2x' in name:
            img.resize((img.width // 2, img.height // 2), Image.LANCZOS).save(
                os.path.join(OUT, name.replace('@2x', '@1x')), optimize=True)
        meta[name] = dict(size=list(img.size), **m)
    with open(os.path.join(OUT, 'chrome.json'), 'w') as f:
        json.dump({'generator': 'assets/pipeline/ui/gen_chrome.py', 'license': 'project-original', 'items': meta}, f,
                  indent=1)
    # preview
    prev = Image.new('RGB', (560, 340), (14, 13, 11))
    x = 10
    for name in ('console_plate@2x.png', 'well@2x.png', 'button@2x.png', 'cameo_frame@2x.png', 'brass_bezel@2x.png'):
        im = Image.open(os.path.join(OUT, name)).convert('RGBA')
        prev.paste(im, (x, 10), im)
        x += im.width + 12
    p = os.path.join(REPO, 'work', 'art', 'previews', 'chrome.png')
    prev.save(p)
    print('chrome written', list(meta))


if __name__ == '__main__':
    main()
