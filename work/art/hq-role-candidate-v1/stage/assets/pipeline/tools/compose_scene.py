"""Compose a battlefield view from real pipeline output, following the client
render contract (docs/asset-pipeline.md "Runtime compositing contract").

This is the reference implementation the PixiJS renderer must match: world
(millitile) positions -> 2:1 dimetric screen, ground materials sampled in world
space, ground shadows first, depth-sorted sprites, team tint on the team layer,
turret composited over hull with pivot offset, aircraft raised by altitude with
their shadow displaced along the shared sun vector, fog applied last.

Usage:
  work/art/.venv/bin/python assets/pipeline/tools/compose_scene.py <scene.json> <out.png> \
      --size 1600x900 [--entities out.json] [--minimap out.png]
"""
import argparse
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from composite import SHADOW_OPACITY, hex_rgb  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SPRITES = os.path.join(REPO, 'assets', 'build', 'sprites')
FRAMES = os.path.join(REPO, 'assets', 'build', 'frames')
TERRAIN = os.path.join(REPO, 'assets', 'build', 'terrain')
S2 = 2                         # composition happens at 2x art scale
TW, TH = 64 * S2, 32 * S2      # tile diamond at 2x
PX_PER_BU = TW / math.sqrt(2)
VERT_PX = PX_PER_BU * math.cos(math.radians(30))
SUN_EL, SUN_TR = 50.0, 33.4


def shadow_offset_tiles(alt):
    """Horizontal ground displacement (sim x, y) of a shadow cast from height alt."""
    k = alt / math.tan(math.radians(SUN_EL))
    bx, by = math.cos(math.radians(SUN_TR)) * k, math.sin(math.radians(SUN_TR)) * k
    return bx, -by


class Sprites:
    def __init__(self):
        self.side = {}
        self.cache = {}

    def meta(self, aid):
        if aid not in self.side:
            with open(os.path.join(SPRITES, aid, f'{aid}.sprite.json')) as f:
                self.side[aid] = json.load(f)
        return self.side[aid]

    def frame(self, aid, layer, state, d, fr):
        """Read one frame from the packed 2x atlas (proves atlases, not raw frames)."""
        key = (aid, layer, state, d, fr)
        if key in self.cache:
            return self.cache[key]
        m = self.meta(aid)
        name = f'{state}/d{d:02d}_f{fr:02d}'
        for js in m['atlases']['2x'].get(layer, []):
            with open(os.path.join(SPRITES, aid, js)) as f:
                j = json.load(f)
            if name in j['frames']:
                r = j['frames'][name]['frame']
                page = Image.open(os.path.join(SPRITES, aid, j['meta']['image'])).convert('RGBA')
                im = page.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
                self.cache[key] = im
                return im
        self.cache[key] = None
        return None

    def state(self, aid, name):
        for s in self.meta(aid)['states']:
            if s['name'] == name:
                return s
        raise KeyError(f'{aid} has no state {name}')


def tint(img, color, strength=1.0):
    a = np.asarray(img).astype(np.float32)
    c = np.array(hex_rgb(color), np.float32) / 255.0
    a[..., :3] *= c
    if strength < 1:
        a[..., 3] *= strength
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')


def as_shadow(img):
    a = np.asarray(img).astype(np.float32)
    out = np.zeros_like(a)
    out[..., 3] = a[..., 3] * SHADOW_OPACITY
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


# --------------------------------------------------------------------------- terrain
def terrain_layer(scene, W, H, to_world):
    mats = {}

    def tex(name):
        if name not in mats:
            mats[name] = np.asarray(Image.open(os.path.join(TERRAIN, f'{name}.png')).convert('RGB')).astype(np.float32)
        return mats[name]

    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    wx, wy = to_world(xs, ys)
    # low-frequency periodic noise to break shape edges
    nz = tex('packed_earth')[..., 0]
    edge_noise = (nz[(wy * 9).astype(int) % 512, (wx * 9).astype(int) % 512] / 255.0 - 0.5) * 0.9

    def sample(name):
        t = tex(name)
        u = (wx * 128).astype(np.int64) % 512
        v = (wy * 128).astype(np.int64) % 512
        return t[v, u]

    out = sample(scene['terrain']['base'])
    for shp in scene['terrain']['shapes']:
        if shp['type'] == 'blob':
            cx, cy = shp['center']
            d = np.sqrt((wx - cx) ** 2 + (wy - cy) ** 2) - shp['radius']
        elif shp['type'] == 'rect':
            x0, y0, x1, y1 = shp['rect']
            dx = np.maximum(np.maximum(x0 - wx, wx - x1), 0)
            dy = np.maximum(np.maximum(y0 - wy, wy - y1), 0)
            inside = np.minimum(np.maximum(np.maximum(x0 - wx, wx - x1), np.maximum(y0 - wy, wy - y1)), 0)
            d = np.sqrt(dx * dx + dy * dy) + inside
        elif shp['type'] == 'road':
            pts = shp['points']
            d = np.full(wx.shape, 1e9, np.float32)
            for (ax, ay), (bx, by) in zip(pts, pts[1:]):
                vx, vy = bx - ax, by - ay
                L2 = vx * vx + vy * vy
                t = np.clip(((wx - ax) * vx + (wy - ay) * vy) / L2, 0, 1)
                px, py = ax + t * vx, ay + t * vy
                d = np.minimum(d, np.sqrt((wx - px) ** 2 + (wy - py) ** 2))
            d = d - shp['width'] / 2
        else:
            continue
        soft = shp.get('soft', 0.6)
        noise = edge_noise * shp.get('rough', 1.0)
        w = np.clip(0.5 - (d + noise) / soft, 0, 1)[..., None]
        out = out * (1 - w) + sample(shp['material']) * w
    return out


# --------------------------------------------------------------------------- compose
def compose(scene, size):
    W1, H1 = size
    W, H = W1 * S2, H1 * S2
    cx, cy = scene['camera']['center']
    focus = scene['camera'].get('screen_focus', [0.5, 0.5])
    ox = W * focus[0] - (cx - cy) * TW / 2
    oy = H * focus[1] - (cx + cy) * TH / 2

    def to_screen(x, y):
        return (x - y) * TW / 2 + ox, (x + y) * TH / 2 + oy

    def to_world(sx, sy):
        a = (sx - ox) / (TW / 2)
        b = (sy - oy) / (TH / 2)
        return (a + b) / 2, (b - a) / 2

    img = Image.fromarray(terrain_layer(scene, W, H, to_world).clip(0, 255).astype(np.uint8), 'RGB').convert('RGBA')
    sp = Sprites()
    shadows = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draws, entities_out = [], []
    team_colors = scene['teams']

    for i, e in enumerate(scene['entities']):
        aid = e['asset']
        m = sp.meta(aid)
        ax, ay = m['anchor_2x']
        x, y = e['pos']
        st = sp.state(aid, e.get('state', 'idle'))
        nd = st['directions']
        d = int(round(e.get('heading_deg', 0) / 360 * nd)) % nd
        fr = e.get('frame', 0) % st['frames']
        alt = e.get('altitude', 0.0)
        color = team_colors[e['team']] if e.get('team') is not None else None
        members = [(0.0, 0.0)]
        if m.get('squad') and e.get('squad', True):
            members = [(dx / 1000, dy / 1000) for dx, dy in m['squad']['member_offsets_mt'][:e.get('members', 4)]]
        for mi, (mx, my) in enumerate(members):
            px, py = x + mx, y + my
            sx, sy = to_screen(px, py)
            f_m = (fr + mi) % st['frames']
            # shadow on the ground layer
            sh = sp.frame(aid, 'shadow', st['name'], d, f_m)
            if sh is not None:
                dx, dy = shadow_offset_tiles(alt)
                ssx, ssy = to_screen(px + dx, py + dy)
                shadows.alpha_composite(as_shadow(sh), (int(round(ssx - ax)), int(round(ssy - ay))))
            layers = []
            beauty = sp.frame(aid, 'beauty', st['name'], d, f_m)
            layers.append(beauty)
            team = sp.frame(aid, 'team', st['name'], d, f_m)
            if team is not None and color:
                layers.append(tint(team, color))
            lift = alt * VERT_PX
            depth = px + py + (e.get('depth_bias', 0)) + (100 if alt > 0 else 0)
            draws.append((depth, i * 10 + mi, layers, (int(round(sx - ax)), int(round(sy - ay - lift)))))
            # turret composited above hull, placed with the published pivot offset
            if e.get('turret_state'):
                tst = sp.state(aid, e['turret_state'])
                tnd = tst['directions']
                td = int(round(e.get('turret_deg', e.get('heading_deg', 0)) / 360 * tnd)) % tnd
                pv = m.get('turret_pivot_mt') or [0, 0]
                th = math.radians(e.get('heading_deg', 0))
                pxo = (pv[0] * math.cos(th) - pv[1] * math.sin(th)) / 1000
                pyo = (pv[0] * math.sin(th) + pv[1] * math.cos(th)) / 1000
                tsx, tsy = to_screen(px + pxo, py + pyo)
                tl = [sp.frame(aid, 'beauty', tst['name'], td, e.get('turret_frame', 0))]
                tt = sp.frame(aid, 'team', tst['name'], td, e.get('turret_frame', 0))
                if tt is not None and color:
                    tl.append(tint(tt, color))
                draws.append((depth + 0.001, i * 10 + mi, tl, (int(round(tsx - ax)), int(round(tsy - ay)))))
        # overlay metadata (in 1x output pixels)
        sx, sy = to_screen(x, y)
        hb = m['hardpoints_2x_rel_anchor'].get('healthbar', {})
        hbk = f"{st['name']}/d{d:02d}_f{fr:02d}"
        hbo = hb.get(hbk) or (next(iter(hb.values())) if hb else [0, -60])
        r = (m.get('footprint_radius_mt') or 0) / 1000
        if m.get('footprint_tiles'):
            r = max(m['footprint_tiles']) / 2 * 0.95
        entities_out.append({'id': e.get('id', f'e{i}'), 'asset': aid, 'team': e.get('team'),
                             'screen': [round(sx / S2, 1), round((sy - alt * VERT_PX) / S2, 1)],
                             'ground': [round(sx / S2, 1), round(sy / S2, 1)],
                             'healthbar': [round((sx + hbo[0]) / S2, 1), round((sy + hbo[1] - alt * VERT_PX) / S2, 1)],
                             'select_rx': round(r * PX_PER_BU / S2, 1), 'select_ry': round(r * PX_PER_BU / 2 / S2, 1),
                             'hp': e.get('hp', 1.0), 'selected': e.get('selected', False),
                             'altitude_px': round(alt * VERT_PX / S2, 1)})

    img.alpha_composite(shadows)
    for depth, order, layers, pos in sorted(draws, key=lambda t: (t[0], t[1])):
        for L in layers:
            if L is not None:
                img.alpha_composite(L, pos)

    # fog: explored-but-unseen darkening outside friendly vision, unexplored black
    fog = scene.get('fog')
    if fog:
        ys, xs = np.mgrid[0:H:2, 0:W:2].astype(np.float32)
        wx, wy = to_world(xs, ys)
        vis = np.zeros(wx.shape, np.float32)
        for (vx, vy, rad) in fog['vision']:
            dd = np.sqrt((wx - vx) ** 2 + (wy - vy) ** 2)
            vis = np.maximum(vis, np.clip((rad - dd) / 1.2, 0, 1))
        explored = np.ones(wx.shape, np.float32)
        if fog.get('explored_limit'):
            a, b, c = fog['explored_limit']      # half-plane a*x + b*y <= c is explored
            explored = np.clip((c - (a * wx + b * wy)) / 2.0, 0, 1)
        dark = (1 - vis) * 0.5 * explored + (1 - explored) * 0.92
        dark_img = Image.fromarray((dark * 255).astype(np.uint8), 'L').resize((W, H), Image.BILINEAR)
        dark_img = dark_img.filter(ImageFilter.GaussianBlur(6))
        fog_col = Image.new('RGBA', (W, H), (7, 9, 11, 255))
        fog_col.putalpha(dark_img)
        img.alpha_composite(fog_col)

    out = img.resize((W1, H1), Image.LANCZOS)
    return out, entities_out, (to_world, to_screen, W, H)


def minimap(scene, size_px=256):
    """Diamond minimap in view orientation: terrain colours, entities, camera frame."""
    mw, mh = scene['map_size']
    img = Image.new('RGBA', (size_px, size_px), (0, 0, 0, 0))
    base_col = {'sand': '#A8966F', 'packed_earth': '#8C7A5B', 'gravel': '#8E8574', 'scrub_ground': '#7D7A55',
                'rubble_ground': '#857C70', 'asphalt': '#55534F', 'concrete_slab': '#96928A', 'dry_riverbed': '#A3957C'}
    N = 128
    grid = np.zeros((N, N, 3), np.float32)
    ys, xs = np.mgrid[0:N, 0:N].astype(np.float32)
    wx, wy = (xs + 0.5) * mw / N, (ys + 0.5) * mh / N
    grid[:] = np.array(hex_rgb(base_col[scene['terrain']['base']]))
    for shp in scene['terrain']['shapes']:
        c = np.array(hex_rgb(base_col.get(shp['material'], '#888888')), np.float32)
        if shp['type'] == 'blob':
            m = np.sqrt((wx - shp['center'][0]) ** 2 + (wy - shp['center'][1]) ** 2) < shp['radius']
        elif shp['type'] == 'rect':
            x0, y0, x1, y1 = shp['rect']
            m = (wx >= x0) & (wx <= x1) & (wy >= y0) & (wy <= y1)
        else:
            m = np.zeros_like(wx, bool)
            for (ax, ay), (bx, by) in zip(shp['points'], shp['points'][1:]):
                vx, vy = bx - ax, by - ay
                t = np.clip(((wx - ax) * vx + (wy - ay) * vy) / (vx * vx + vy * vy), 0, 1)
                m |= np.sqrt((wx - ax - t * vx) ** 2 + (wy - ay - t * vy) ** 2) < shp['width'] / 2 + 0.5
        grid[m] = c
    fog = scene.get('fog', {})
    if fog.get('explored_limit'):
        a, b, c = fog['explored_limit']
        grid[(a * wx + b * wy) > c] *= 0.12
    tex = Image.fromarray(grid.clip(0, 255).astype(np.uint8), 'RGB').resize((size_px, size_px // 2 * 2), Image.BILINEAR)
    # rotate to the view: square -> diamond
    dia = tex.convert('RGBA').rotate(45, resample=Image.BICUBIC, expand=True)
    dia = dia.resize((size_px, size_px // 2), Image.BICUBIC)
    img.alpha_composite(dia, (0, size_px // 4))
    dr = ImageDraw.Draw(img)

    def mm(x, y):
        u, v = x / mw, y / mh
        return size_px / 2 + (u - v) * size_px / 2, size_px // 4 + (u + v) * size_px / 4

    for e in scene['entities']:
        col = scene['teams'][e['team']] if e.get('team') is not None else '#C9C2B0'
        x, y = mm(*e['pos'])
        big = 'building' in e['asset']
        r = 4 if big else 2
        if e.get('altitude', 0) > 0:
            dr.polygon([(x, y - r - 1), (x + r + 1, y + r), (x - r - 1, y + r)], fill=col, outline=(10, 10, 10))
        else:
            dr.rectangle([x - r, y - r, x + r, y + r], fill=col, outline=(10, 10, 10))
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scene')
    ap.add_argument('out')
    ap.add_argument('--size', default='1600x900')
    ap.add_argument('--entities')
    ap.add_argument('--minimap')
    a = ap.parse_args()
    with open(a.scene) as f:
        scene = json.load(f)
    w, h = (int(v) for v in a.size.split('x'))
    out, ents, (to_world, to_screen, W, H) = compose(scene, (w, h))
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    out.convert('RGB').save(a.out, quality=95)
    if a.entities:
        # camera frame corners in world coords for the minimap overlay
        corners = [to_world(0, 0), to_world(W, 0), to_world(W, H), to_world(0, H)]
        with open(a.entities, 'w') as f:
            json.dump({'size': [w, h], 'entities': ents,
                       'camera_world_corners': [[round(float(x), 2), round(float(y), 2)] for x, y in corners],
                       'map_size': scene.get('map_size')}, f, indent=1)
    if a.minimap:
        minimap(scene).save(a.minimap)
    print(a.out, out.size, len(ents), 'entities')


if __name__ == '__main__':
    main()
