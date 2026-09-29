"""Metadata-only tight body/team coverage of final packed PNG pixels."""
import json
from pathlib import Path
import numpy as np
from PIL import Image

POLICY = {'schema': 'fc-ink-bounds/1', 'coordinates': 'frame_local_px',
          'alpha_min': 1}

def _bounds(alpha):
    ys, xs = np.nonzero(alpha)
    if not len(xs):
        return None
    return {'x': int(xs.min()), 'y': int(ys.min()),
            'w': int(xs.max() - xs.min() + 1), 'h': int(ys.max() - ys.min() + 1)}

def _union(a, b):
    if a is None:
        return b
    if b is None:
        return a
    x, y = min(a['x'], b['x']), min(a['y'], b['y'])
    return {'x': x, 'y': y,
            'w': max(a['x'] + a['w'], b['x'] + b['w']) - x,
            'h': max(a['y'] + a['h'], b['y'] + b['h']) - y}

def add_ink_bounds(directory, atlases):
    """Annotate atlas JSON only; preserve all PNGs and existing descriptor fields.

    Beauty/team share the body union including antialiased fringe. Other
    layers, including shadows, use only their own final PNG alpha coverage.
    """
    directory = Path(directory).resolve()
    def local(name):
        p = (directory / name).resolve()
        if p.parent != directory:
            raise ValueError('Atlas files must be inside their asset directory')
        return p
    def load(name):
        return json.loads(local(name).read_text())
    count = 0
    for scale, layers in atlases.items():
        bounds, dimensions, own = {}, {}, {}
        for layer, names in layers.items():
            for name in names:
                desc = load(name)
                with Image.open(local(desc['meta']['image'])) as im:
                    alpha = np.asarray(im.convert('RGBA'))[..., 3]
                for key, item in desc['frames'].items():
                    rect = item['frame']
                    x, y, w, h = (rect[k] for k in ('x', 'y', 'w', 'h'))
                    if (any(type(v) is not int for v in (x, y, w, h)) or
                            x < 0 or y < 0 or w < 1 or h < 1 or
                            x + w > alpha.shape[1] or y + h > alpha.shape[0]):
                        raise ValueError('Invalid packed frame rectangle: ' + key)
                    ink = _bounds(alpha[y:y+h, x:x+w])
                    own[layer, key] = ink
                    if layer in ('beauty', 'team'):
                        if key in dimensions and dimensions[key] != (w, h):
                            raise ValueError('Body/team frame sizes differ: ' + key)
                        dimensions[key] = (w, h)
                        bounds[key] = _union(bounds.get(key), ink)
        for layer, names in layers.items():
            for name in names:
                desc = load(name)
                for key, item in desc['frames'].items():
                    rect = item['frame']
                    item['ink_bounds'] = bounds.get(key) if layer in ('beauty', 'team') else own.get((layer, key))
                    count += 1
                desc['meta']['ink_bounds_policy'] = {**POLICY, 'sources': ['beauty', 'team'] if layer in ('beauty', 'team') else [layer]}
                local(name).write_text(json.dumps(desc, separators=(',', ':')))
    return count
