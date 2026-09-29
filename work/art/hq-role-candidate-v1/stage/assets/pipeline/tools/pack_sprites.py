"""Pack rendered frames into runtime atlases.

For each asset in assets/build/frames/<id>/:
  * union-trim every frame of every layer by one common rectangle (layers stay
    pixel-aligned, anchor stays constant across all frames of the asset)
  * normalise layers: team -> grayscale shading (98th percentile = white),
    shadow -> pure black with rendered alpha
  * grid-pack into pages of at most 2048 x 2048 at 2x; derive 1x with
    premultiplied-alpha Lanczos downsampling
  * write PixiJS 8 compatible spritesheet JSON per layer/scale/page and one
    Frontline sidecar <id>.sprite.json (anchor, states, fps, directions,
    progress-driven states, aliases, hardpoints, footprint, turret pivot)

Usage: work/art/.venv/bin/python assets/pipeline/tools/pack_sprites.py [asset-id ...]
"""
import hashlib
import json
import math
import os
import sys

import numpy as np
from PIL import Image
from shadow_alpha import clean_shadow_alpha
from sprite_ink_bounds import add_ink_bounds

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
FRAMES = os.path.join(REPO, 'assets', 'build', 'frames')
SPRITES = os.path.join(REPO, 'assets', 'build', 'sprites')
SPECS = os.path.join(REPO, 'assets', 'pipeline', 'specs')
PAGE = 2048
PAD = 2


def load_spec(aid):
    with open(os.path.join(SPECS, f'{aid}.json')) as f:
        return json.load(f)


def frame_keys(spec):
    for st in spec['states']:
        layers = st.get('layers', spec['passes'])
        for d in range(st['directions']):
            for fr in range(st['frames']):
                yield st['name'], d, fr, layers


def normalise(layer, img):
    a = np.asarray(img.convert('RGBA')).astype(np.float32)
    if layer == 'team':
        lum = a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722
        cov = a[..., 3] > 8
        ref = np.percentile(lum[cov], 98) if cov.any() else 255
        g = np.clip(lum * (255.0 / max(ref, 1)), 0, 255)
        a[..., 0] = a[..., 1] = a[..., 2] = g
    elif layer == 'shadow':
        a[..., 3] = clean_shadow_alpha(a[..., 3])
        a[..., 0] = a[..., 1] = a[..., 2] = 0
    return a


def downsample_premultiplied(arr, factor=2):
    # Pillow's RGBA resize already premultiplies internally. Feeding it manually
    # premultiplied bytes and then unpremultiplying again brightens soft edges.
    # Filter four float channels independently so coverage is applied once and
    # precision is retained until the final straight-alpha byte conversion.
    source = np.asarray(arr, dtype=np.float32).clip(0, 255)
    rgb = source[..., :3] * (source[..., 3:4] / 255.0)
    pm = np.concatenate([rgb, source[..., 3:4]], axis=-1)
    size = (max(1, pm.shape[1] // factor), max(1, pm.shape[0] // factor))
    filtered = np.stack([
        np.asarray(Image.fromarray(pm[..., channel]).resize(size, Image.Resampling.LANCZOS))
        for channel in range(4)
    ], axis=-1)
    # Retain the filter's alpha overshoot for division, then clamp the output.
    # Clamping first would brighten constant colors at an opaque Lanczos edge.
    alpha = filtered[..., 3:4]
    rgb = np.where(alpha > 0, filtered[..., :3] * 255.0 / np.maximum(alpha, 1e-6), 0)
    result = np.concatenate([rgb, alpha], axis=-1).clip(0, 255).round().astype(np.uint8)
    result[result[..., 3] == 0, :3] = 0
    return result


def pack_asset(aid):
    spec = load_spec(aid)
    src = os.path.join(FRAMES, aid)
    keys = list(frame_keys(spec))
    cw, ch = spec['canvas']
    # 1) union bbox over all layers/frames
    x0, y0, x1, y1 = cw, ch, 0, 0
    imgs = {}
    for st, d, fr, layers in keys:
        for layer in layers:
            p = os.path.join(src, layer, st, f'd{d:02d}_f{fr:02d}.png')
            im = Image.open(p)
            if im.size != (cw, ch):
                raise SystemExit(f'{p}: size {im.size} != canvas {(cw, ch)}')
            arr = normalise(layer, im)
            imgs[(layer, st, d, fr)] = arr
            ys, xs = np.nonzero(arr[..., 3] > 2)
            if len(xs):
                x0, y0 = min(x0, xs.min()), min(y0, ys.min())
                x1, y1 = max(x1, xs.max() + 1), max(y1, ys.max() + 1)
    # keep even alignment so the 1x derivative maps pixel-exactly
    x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
    x0 -= x0 % 2
    y0 -= y0 % 2
    x1 += x1 % 2
    y1 += y1 % 2
    fw, fh = x1 - x0, y1 - y0
    ax, ay = spec['anchor']
    anchor2 = [ax - x0, ay - y0]
    out_dir = os.path.join(SPRITES, aid)
    os.makedirs(out_dir, exist_ok=True)
    for f in os.listdir(out_dir):
        os.remove(os.path.join(out_dir, f))
    layer_names = sorted({l for k in keys for l in k[3]})
    cols = max(1, PAGE // (fw + PAD))
    rows_per_page = max(1, PAGE // (fh + PAD))
    per_page = cols * rows_per_page
    atlases = {}
    for layer in layer_names:
        lk = [(st, d, fr) for st, d, fr, layers in keys if layer in layers]
        pages = math.ceil(len(lk) / per_page)
        for pg in range(pages):
            chunk = lk[pg * per_page:(pg + 1) * per_page]
            nrows = math.ceil(len(chunk) / cols)
            pw = min(len(chunk), cols) * (fw + PAD)
            ph = nrows * (fh + PAD)
            pw += pw % 2
            ph += ph % 2
            sheet = np.zeros((ph, pw, 4), np.float32)
            frames = {}
            for i, (st, d, fr) in enumerate(chunk):
                gx, gy = (i % cols) * (fw + PAD), (i // cols) * (fh + PAD)
                sheet[gy:gy + fh, gx:gx + fw] = imgs[(layer, st, d, fr)][y0:y1, x0:x1]
                frames[f'{st}/d{d:02d}_f{fr:02d}'] = (gx, gy)
            for scale, factor in (('2x', 1), ('1x', 2)):
                arr = sheet.clip(0, 255).astype(np.uint8) if factor == 1 else downsample_premultiplied(sheet, 2)
                name = f'{aid}@{scale}.{layer}' + (f'.{pg}' if pages > 1 else '')
                Image.fromarray(arr, 'RGBA').save(os.path.join(out_dir, name + '.png'), optimize=True)
                fwS, fhS = fw // factor, fh // factor
                pix = {
                    'frames': {k: {'frame': {'x': v[0] // factor, 'y': v[1] // factor, 'w': fwS, 'h': fhS},
                                   'rotated': False, 'trimmed': False,
                                   'spriteSourceSize': {'x': 0, 'y': 0, 'w': fwS, 'h': fhS},
                                   'sourceSize': {'w': fwS, 'h': fhS},
                                   'anchor': {'x': round(anchor2[0] / fw, 5), 'y': round(anchor2[1] / fh, 5)}}
                               for k, v in frames.items()},
                    'meta': {'app': 'frontline-command asset pipeline', 'version': '1', 'image': name + '.png',
                             'format': 'RGBA8888', 'size': {'w': arr.shape[1], 'h': arr.shape[0]},
                             'scale': 1 if scale == '1x' else 2},
                }
                with open(os.path.join(out_dir, name + '.json'), 'w') as f:
                    json.dump(pix, f, separators=(',', ':'))
                atlases.setdefault(scale, {}).setdefault(layer, []).append(name + '.json')
    # Read final PNG alpha; annotate JSON only after every layer/scale exists.
    add_ink_bounds(out_dir, atlases)
    # hardpoints relative to anchor, in 2x pixels
    hp_path = os.path.join(src, 'hardpoints.json')
    hardpoints = {}
    if os.path.exists(hp_path):
        with open(hp_path) as f:
            raw = json.load(f)
        for name, per in raw.items():
            hardpoints[name] = {k: [round(v[0] - ax, 1), round(v[1] - ay, 1)] for k, v in sorted(per.items())}
    side = {
        'schema': 'fc-sprite/1',
        'id': aid,
        'role_id': spec.get('role_id'),
        'faction': spec.get('faction'),
        'source_spec': f'assets/pipeline/specs/{aid}.json',
        'frame_size_2x': [fw, fh],
        'anchor_2x': anchor2,
        'layers': layer_names,
        'atlases': atlases,
        'states': spec['states'],
        'aliases': spec.get('aliases', []),
        'overlays': spec.get('overlays', []),
        'footprint_radius_mt': spec.get('footprint_radius_mt'),
        'footprint_tiles': spec.get('footprint_tiles'),
        'footprint_mt': spec.get('footprint_mt'),
        'turret_pivot_mt': spec.get('turret_pivot_mt'),
        'squad': spec.get('squad'),
        'air': spec.get('air'),
        'hardpoints_2x_rel_anchor': hardpoints,
        'frame_count': len(keys),
    }
    h = hashlib.sha256()
    for fn in sorted(os.listdir(out_dir)):
        with open(os.path.join(out_dir, fn), 'rb') as f:
            h.update(fn.encode() + f.read())
    side['content_sha256'] = h.hexdigest()
    with open(os.path.join(out_dir, f'{aid}.sprite.json'), 'w') as f:
        json.dump(side, f, indent=1)
    print(f'{aid}: {len(keys)} poses, frame {fw}x{fh}@2x, layers {layer_names}')


def main():
    ids = sys.argv[1:] or sorted(d for d in os.listdir(FRAMES) if os.path.isdir(os.path.join(FRAMES, d)))
    for aid in ids:
        pack_asset(aid)


if __name__ == '__main__':
    main()
