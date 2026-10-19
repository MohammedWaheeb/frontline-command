"""Native contact sheets. Backgrounds are procedural stand-ins for the project's
dirt, concrete and dark (night/fog) terrain values sampled from current captures;
they are review surfaces, not terrain art."""
from __future__ import annotations

import random

from PIL import Image, ImageDraw

BG = {
    "dirt": ((196, 160, 112), (176, 140, 96), (212, 178, 128)),
    "concrete": ((132, 128, 116), (112, 108, 98), (150, 146, 132)),
    "dark": ((30, 30, 26), (22, 22, 19), (40, 40, 34)),
}
LABEL = (244, 221, 176)
LABEL_DIM = (170, 150, 110)
SHEET = (33, 31, 26)


def background(kind: str, w: int, h: int, seed: int = 3) -> Image.Image:
    base, dark, light = BG[kind]
    im = Image.new("RGB", (w, h), base)
    d = ImageDraw.Draw(im)
    rng = random.Random(f"{kind}:{w}:{h}:{seed}")
    if kind == "concrete":
        for y in range(0, h, 16):
            d.line([(0, y), (w, y)], fill=dark)
        for x in range(0, w, 32):
            d.line([(x, 0), (x, h)], fill=dark)
    for _ in range(w * h // 60):
        x, y = rng.randrange(w), rng.randrange(h)
        d.point((x, y), fill=dark if rng.random() < 0.6 else light)
    return im


def text(d: ImageDraw.ImageDraw, xy, s, fill=LABEL):
    d.text(xy, s, fill=fill)  # Pillow's built-in bitmap font: no external font asset


def world_frame(img: Image.Image, resolution: int) -> Image.Image:
    """Present an atlas frame at 1× world scale, as the renderer does at zoom 1."""
    if resolution == 1:
        return img
    return img.resize((max(1, img.width // resolution), max(1, img.height // resolution)), Image.Resampling.BOX)


def strip(frames, bg_kind: str, cell: tuple[int, int], origin_cell: tuple[int, int], resolution: int,
          mark_origin=True, max_frames=None) -> Image.Image:
    """frames: list of (RGBA image | None, ox, oy) in atlas px."""
    fs = frames[: max_frames] if max_frames else frames
    cw, ch = cell
    out = Image.new("RGB", (cw * len(fs), ch), (0, 0, 0))
    for i, (img, ox, oy) in enumerate(fs):
        tile = background(bg_kind, cw, ch)
        if mark_origin:
            dd = ImageDraw.Draw(tile)
            cx, cy = origin_cell
            dd.line([(cx - 3, cy), (cx + 3, cy)], fill=(70, 60, 44) if bg_kind != "dark" else (90, 84, 70))
            dd.line([(cx, cy - 2), (cx, cy + 2)], fill=(70, 60, 44) if bg_kind != "dark" else (90, 84, 70))
        if img is not None:
            wimg = world_frame(img, resolution)
            px = int(round(origin_cell[0] - ox / resolution))
            py = int(round(origin_cell[1] - oy / resolution))
            tile.paste(wimg, (px, py), wimg)
        d = ImageDraw.Draw(tile)
        d.rectangle([0, 0, cw - 1, ch - 1], outline=(58, 54, 44))
        text(d, (2, ch - 11), str(i), LABEL_DIM if img is not None else (120, 60, 50))
        out.paste(tile, (i * cw, 0))
    return out


def magnify(im: Image.Image, k: int) -> Image.Image:
    return im.resize((im.width * k, im.height * k), Image.Resampling.NEAREST)
