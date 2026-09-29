"""Reference compositing rules shared by previews, the scene composer and tests.

This mirrors the client renderer contract documented in docs/asset-pipeline.md:
  1. shadow layer: black, alpha scaled to SHADOW_OPACITY, drawn on the ground layer
  2. beauty layer: straight-alpha RGBA, normal blend
  3. team layer: grayscale shading in RGB, coverage in alpha; drawn with
     tint = player colour (per-channel multiply), normal blend
"""
import os

import numpy as np
from PIL import Image

SHADOW_OPACITY = 0.46


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def tint(img, color):
    a = np.asarray(img.convert('RGBA')).astype(np.float32)
    c = np.array(hex_rgb(color), dtype=np.float32) / 255.0
    a[..., :3] *= c
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')


def shadow_layer(img):
    a = np.asarray(img.convert('RGBA')).astype(np.float32)
    out = np.zeros_like(a)
    out[..., 3] = a[..., 3] * SHADOW_OPACITY
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def _load(root, layer, state, fn):
    p = os.path.join(root, layer, state, fn + '.png')
    return Image.open(p).convert('RGBA') if os.path.exists(p) else None


def composite_sprite(cell, root, state, fn, team, layers=('shadow', 'beauty', 'team')):
    cell = cell.convert('RGBA')
    for layer in layers:
        img = _load(root, layer, state, fn)
        if img is None:
            continue
        if layer == 'shadow':
            img = shadow_layer(img)
        elif layer == 'team':
            img = tint(img, team)
        cell.alpha_composite(img)
    return cell
