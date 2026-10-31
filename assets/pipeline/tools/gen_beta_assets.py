"""Beta asset generator: map environment dressing + map preview PNGs.

Environment placements obey client/src/content/environment.ts exactly:
scrub only on cover/rubble; solid props only on blocked/cliff (+500mt
margin, level support, mandatory corridors clear); opaque masses also need
cliff or sight_blocker; bridge decks only on same-height road bracketed by
water. Dressing therefore can never block a gameplay path.

Usage: work/art/.venv/bin/python assets/pipeline/tools/gen_beta_assets.py [--check]
"""
import hashlib
import json
import math
import os
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
MAPS = ['industrial-valley', 'port-outskirts', 'relay-heights', 'dry-river',
        'border-depots', 'convoy-union', 'twin-outposts']
PREVIEW_MAPS = ['copper-junction'] + MAPS
PROPS = {
    'prop.palm': ((1400, 1400), 'solid', False),
    'prop.forest_edge_scrub': ((2000, 1400), 'scrub', False),
    'prop.fence_chainlink': ((1600, 220), 'solid', False),
    'prop.concrete_barrier': ((1400, 480), 'solid', False),
    'prop.container_stack': ((2000, 2000), 'solid', True),
    'prop.fuel_tanks': ((2000, 2000), 'solid', True),
    'prop.power_pylon': ((1000, 1000), 'solid', False),
    'prop.decor_building_nongarrison': ((2000, 2000), 'solid', True),
    'prop.wreck_decor_vehicle': ((1600, 1100), 'solid', False),
}
# Per-map dressing palettes (ordered; generator fills greedily with spacing).
PALETTES = {
    'industrial-valley': ['prop.container_stack', 'prop.fuel_tanks', 'prop.power_pylon',
                          'prop.fence_chainlink', 'prop.concrete_barrier', 'prop.wreck_decor_vehicle',
                          'prop.forest_edge_scrub'],
    'port-outskirts': ['prop.container_stack', 'prop.fuel_tanks', 'prop.power_pylon',
                       'prop.concrete_barrier', 'prop.forest_edge_scrub', 'prop.palm'],
    'relay-heights': ['prop.power_pylon', 'prop.forest_edge_scrub', 'prop.concrete_barrier',
                      'prop.wreck_decor_vehicle'],
    'dry-river': ['prop.forest_edge_scrub', 'prop.palm', 'prop.wreck_decor_vehicle',
                  'prop.power_pylon'],
    'border-depots': ['prop.container_stack', 'prop.fence_chainlink', 'prop.concrete_barrier',
                      'prop.fuel_tanks', 'prop.power_pylon', 'prop.forest_edge_scrub'],
    'convoy-union': ['prop.wreck_decor_vehicle', 'prop.concrete_barrier', 'prop.power_pylon',
                     'prop.forest_edge_scrub', 'prop.container_stack'],
    'twin-outposts': ['prop.power_pylon', 'prop.palm', 'prop.forest_edge_scrub',
                      'prop.concrete_barrier', 'prop.wreck_decor_vehicle'],
}
SKINS = {'light_prop': ['prop.destructible_wall_hp_light'],
         'heavy_prop': ['prop.destructible_wall_hp_heavy'],
         'garrison': ['prop.warehouse_garrisonable', 'prop.ruined_house_garrisonable']}


def cells(m, px, py, size, direction, margin):
    w, h = (size[1], size[0]) if direction % 2 else size
    minx = math.floor((px - w / 2 - margin) / 1000); miny = math.floor((py - h / 2 - margin) / 1000)
    maxx = math.ceil((px + w / 2 + margin) / 1000) - 1; maxy = math.ceil((py + h / 2 + margin) / 1000) - 1
    if minx < 0 or miny < 0 or maxx >= m['width'] or maxy >= m['height']:
        return None
    return [y * m['width'] + x for y in range(miny, maxy + 1) for x in range(minx, maxx + 1)]


def valid(m, asset, px, py, direction, occupied, avoid):
    size, kind, opaque = PROPS[asset]
    idx = cells(m, px, py, size, direction, 500 if kind == 'solid' else 0)
    if idx is None or any(i in occupied or i in avoid for i in idx):
        return None
    tiles = m['tiles']; height = tiles[idx[0]]['height']
    if any(tiles[i]['height'] != height or tiles[i].get('mandatory') for i in idx):
        return None
    if kind == 'scrub':
        if any(tiles[i]['terrain'] not in ('cover', 'rubble') for i in idx):
            return None
    else:
        if any(tiles[i]['terrain'] not in ('blocked', 'cliff') for i in idx):
            return None
        if opaque and any(tiles[i]['terrain'] != 'cliff' and not tiles[i].get('sight_blocker') for i in idx):
            return None
    return idx


def bridge_valid(m, tx, ty, direction):
    tiles, w = m['tiles'], m['width']
    def tile(x, y):
        return tiles[y * w + x] if 0 <= x < w and 0 <= y < m['height'] else None
    c = tile(tx, ty)
    if not c or c['terrain'] != 'road':
        return False
    lx, ly = [(0, 1), (-1, 0), (0, -1), (1, 0)][direction]
    for side in (-1, 1):
        water = False
        # Stricter than the validator's 32: only deck tiles genuinely over a
        # crossing (water within 8 tiles both ways), not whole road regions.
        for step in range(1, 9):
            n = tile(tx + lx * side * step, ty + ly * side * step)
            if not n or n['height'] != c['height']:
                break
            if n['terrain'] == 'water':
                water = True; break
            if n['terrain'] != 'road':
                break
        if not water:
            return False
    # State 'deck' (used here) needs no rail check; only edge_*/idle do.
    return True


def build_environment(mid, index_entry):
    m = json.load(open(os.path.join(REPO, 'content/maps', mid + '.json')))
    avoid = set()
    def mark(px, py, r):
        cx, cy = px // 1000, py // 1000
        for y in range(cy - r, cy + r + 1):
            for x in range(cx - r, cx + r + 1):
                if 0 <= x < m['width'] and 0 <= y < m['height']:
                    avoid.add(y * m['width'] + x)
    for s in m['spawns']:
        mark(s['position']['x'], s['position']['y'], 8)
    for f in m.get('fields', []):
        mark(f['position']['x'], f['position']['y'], 4)
    for st in m.get('stations', []):
        mark(st['position']['x'], st['position']['y'], 4)
    mark(m['shipment']['x'], m['shipment']['y'], 4)
    for o in m.get('objects', []):
        mark(o['position']['x'], o['position']['y'], 3)
    skins, gi = [], 0
    for o in m.get('objects', []):
        opts = SKINS[o['class']]
        skins.append({'object_id': o['id'], 'asset': opts[gi % len(opts)] if o['class'] == 'garrison' else opts[0],
                      'direction': (o['id'] % 4)})
        gi += 1
    placements, occupied, counts = [], set(), {}
    # Bridge decks first (port/twin water crossings).
    for ty in range(m['height']):
        for tx in range(m['width']):
            i = ty * m['width'] + tx
            if i in avoid or i in occupied:
                continue
            for d in range(4):
                if bridge_valid(m, tx, ty, d):
                    placements.append({'id': f'bridge-{tx}-{ty}', 'asset': 'prop.bridge_permanent',
                                       'position': {'x': tx * 1000 + 500, 'y': ty * 1000 + 500},
                                       'direction': d, 'state': 'deck'})
                    occupied.add(i); counts['bridge'] = counts.get('bridge', 0) + 1
                    break
    # Greedy scan every tile, round-robin palette, deterministic.
    palette = PALETTES[mid]; pi = 0
    for ty in range(1, m['height'] - 1):
        for tx in range(1, m['width'] - 1):
            px, py = tx * 1000 + 500, ty * 1000 + 500
            for k in range(len(palette)):
                asset = palette[(pi + k) % len(palette)]
                placed = False
                for d in (0, 2, 1, 3):
                    idx = valid(m, asset, px, py, d, occupied, avoid)
                    if idx:
                        slug = asset.replace('prop.', '')
                        placements.append({'id': f'{slug}-{tx}-{ty}', 'asset': asset,
                                           'position': {'x': px, 'y': py}, 'direction': d, 'state': 'idle'})
                        occupied.update(idx); counts[asset] = counts.get(asset, 0) + 1
                        pi += 1; placed = True; break
                if placed:
                    break
    env = {'schema': 'fc-map-environment/1',
           'map': {'id': m['id'], 'version': m['version'], 'sha256': index_entry['sha256']},
           'object_skins': skins, 'placements': placements}
    return env, counts


TERRAIN_COLOURS = {'open': (148, 128, 92), 'road': (96, 94, 90), 'water': (52, 96, 128),
                   'cliff': (110, 88, 72), 'blocked': (84, 76, 68), 'cover': (96, 116, 72),
                   'rubble': (124, 108, 88), 'ramp': (132, 116, 88)}


def build_preview(mid):
    from PIL import Image, ImageDraw, ImageFont
    m = json.load(open(os.path.join(REPO, 'content/maps', mid + '.json')))
    w, h = m['width'], m['height']
    base = Image.new('RGB', (w, h))
    px = base.load()
    for y in range(h):
        for x in range(w):
            t = m['tiles'][y * w + x]
            c = TERRAIN_COLOURS.get(t['terrain'], (128, 128, 128))
            f = 1 + 0.09 * t['height']
            px[x, y] = tuple(min(255, int(v * f)) for v in c)
    slug = mid.replace('-', '_')
    outdir = os.path.join(REPO, 'assets/build/maps', slug)
    os.makedirs(outdir, exist_ok=True)
    for name, (tw, th) in (('preview.png', (640, 360)), ('preview-256.png', (256, 256))):
        canvas = Image.new('RGB', (tw, th), (24, 24, 22))
        scale = min(tw / w, th / h)
        nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
        img = base.resize((nw, nh), Image.NEAREST)
        ox, oy = (tw - nw) // 2, (th - nh) // 2
        canvas.paste(img, (ox, oy))
        d = ImageDraw.Draw(canvas)
        def pt(p):
            return (ox + p['x'] / 1000 * scale, oy + p['y'] / 1000 * scale)
        for f in m.get('fields', []):
            cx, cy = pt(f['position']); r = max(2, scale * 1.2)
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(216, 176, 64), outline=(40, 32, 16))
        for st in m.get('stations', []):
            cx, cy = pt(st['position']); r = max(3, scale * 1.4)
            d.polygon([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], fill=(84, 190, 210), outline=(16, 32, 40))
        cx, cy = pt(m['shipment']); r = max(3, scale * 1.6)
        d.line([cx - r, cy, cx + r, cy], fill=(240, 230, 200), width=2)
        d.line([cx, cy - r, cx, cy + r], fill=(240, 230, 200), width=2)
        try:
            font = ImageFont.load_default(size=max(11, int(scale * 4)))
        except TypeError:
            font = ImageFont.load_default()
        for n, s in enumerate(m['spawns'], 1):
            cx, cy = pt(s['position']); r = max(7, scale * 2.6)
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(30, 30, 28), outline=(240, 235, 220), width=2)
            d.text((cx, cy), str(n), fill=(255, 255, 255), font=font, anchor='mm')
        canvas.save(os.path.join(outdir, name), optimize=True)
    return outdir


def main():
    check = '--check' in sys.argv
    index = {e['id']: e for e in json.load(open(os.path.join(REPO, 'content/index.json')))['maps']}
    for mid in MAPS:
        env, counts = build_environment(mid, index[mid])
        data = (json.dumps(env, indent=2) + '\n').encode()
        path = os.path.join(REPO, 'content/environment', mid + '.json')
        digest = hashlib.sha256(data).hexdigest()
        print(f'{mid}: placements={len(env["placements"])} skins={len(env["object_skins"])} '
              f'counts={counts} sha256={digest} bytes={len(data)}')
        if not check:
            open(path, 'wb').write(data)
    for mid in PREVIEW_MAPS:
        if not check:
            build_preview(mid)
        print(f'preview {mid}: assets/build/maps/{mid.replace("-", "_")}/preview.png (640x360) + preview-256.png (256x256)')


if __name__ == '__main__':
    main()
