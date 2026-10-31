"""Regression checks for beta-generated assets (env dressing, icons, previews, fx).

Run: work/art/.venv/bin/python -m unittest assets.pipeline.tools.test_beta_assets
(or: work/art/.venv/bin/python assets/pipeline/tools/test_beta_assets.py)
"""
import hashlib
import json
import math
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
MAPS = ['industrial-valley', 'port-outskirts', 'relay-heights', 'dry-river',
        'border-depots', 'convoy-union', 'twin-outposts']
PROPS = {
    'prop.palm': ((1400, 1400), 'solid', False, ['idle']),
    'prop.forest_edge_scrub': ((2000, 1400), 'scrub', False, ['idle']),
    'prop.fence_chainlink': ((1600, 220), 'solid', False, ['idle']),
    'prop.concrete_barrier': ((1400, 480), 'solid', False, ['idle']),
    'prop.container_stack': ((2000, 2000), 'solid', True, ['idle']),
    'prop.fuel_tanks': ((2000, 2000), 'solid', True, ['idle']),
    'prop.power_pylon': ((1000, 1000), 'solid', False, ['idle']),
    'prop.decor_building_nongarrison': ((2000, 2000), 'solid', True, ['intact']),
    'prop.bridge_permanent': ((1000, 1000), 'bridge', False, ['deck', 'edge_left', 'edge_right', 'idle']),
    'prop.wreck_decor_vehicle': ((1600, 1100), 'solid', False, ['idle']),
    'prop.relay_objective': ((1500, 1500), 'solid', True, ['idle']),
    'prop.command_relay_objective': ((2300, 2300), 'solid', True, ['idle']),
    'prop.depot_objective': ((3000, 3000), 'solid', True, ['idle']),
}
SKINS = {'light_prop': ['prop.destructible_wall_hp_light'], 'heavy_prop': ['prop.destructible_wall_hp_heavy'],
         'garrison': ['prop.warehouse_garrisonable', 'prop.ruined_house_garrisonable']}


def cells(m, p, size, direction, margin):
    w, h = (size[1], size[0]) if direction % 2 else size
    x0 = math.floor((p['x'] - w / 2 - margin) / 1000); y0 = math.floor((p['y'] - h / 2 - margin) / 1000)
    x1 = math.ceil((p['x'] + w / 2 + margin) / 1000) - 1; y1 = math.ceil((p['y'] + h / 2 + margin) / 1000) - 1
    assert 0 <= x0 and 0 <= y0 and x1 < m['width'] and y1 < m['height']
    return [y * m['width'] + x for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]


class TestEnvironment(unittest.TestCase):
    def test_all_seven_maps_valid(self):
        index = {e['id']: e for e in json.load(open(f'{REPO}/content/index.json'))['maps']}
        for mid in MAPS:
            env = json.load(open(f'{REPO}/content/environment/{mid}.json'))
            m = json.load(open(f'{REPO}/content/maps/{mid}.json'))
            self.assertEqual(env['schema'], 'fc-map-environment/1')
            self.assertEqual(env['map'], {'id': m['id'], 'version': m['version'], 'sha256': index[mid]['sha256']})
            objects = {o['id']: o for o in m.get('objects', [])}
            seen = set()
            for s in env['object_skins']:
                self.assertIn(s['object_id'], objects)
                self.assertNotIn(s['object_id'], seen); seen.add(s['object_id'])
                self.assertIn(s['asset'], SKINS[objects[s['object_id']]['class']])
            occupied, ids = set(), set()
            for p in env['placements']:
                self.assertNotIn(p['id'], ids); ids.add(p['id'])
                size, kind, opaque, states = PROPS[p['asset']]
                self.assertIn(p['state'], states)
                idx = cells(m, p['position'], size, p['direction'], 500 if kind == 'solid' else 0)
                height = m['tiles'][idx[0]]['height']
                self.assertTrue(all(m['tiles'][i]['height'] == height for i in idx))
                self.assertFalse(occupied & set(idx)); occupied.update(idx)
                if kind == 'bridge':
                    self.assertEqual(p['position']['x'] % 1000, 500)
                    tile = m['tiles'][p['position']['y'] // 1000 * m['width'] + p['position']['x'] // 1000]
                    self.assertEqual(tile['terrain'], 'road')
                    continue
                self.assertTrue(all(not m['tiles'][i].get('mandatory') for i in idx))
                if kind == 'scrub':
                    self.assertTrue(all(m['tiles'][i]['terrain'] in ('cover', 'rubble') for i in idx))
                else:
                    self.assertTrue(all(m['tiles'][i]['terrain'] in ('blocked', 'cliff') for i in idx))
                    if opaque:
                        self.assertTrue(all(m['tiles'][i]['terrain'] == 'cliff' or m['tiles'][i].get('sight_blocker') for i in idx))


class TestIcons(unittest.TestCase):
    def test_symbols_exist_and_mapping_resolves(self):
        svg = open(f'{REPO}/assets/ui/icons/fc-icons.svg').read()
        ts = open(f'{REPO}/client/src/content/icons.ts').read()
        symbols = set(re.findall(r"'((?:i-research|i-ability|i-operation)-[a-z-]+)'", ts))
        self.assertEqual(len([s for s in symbols if s.startswith('i-research-')]), 10)
        self.assertEqual(len([s for s in symbols if s.startswith('i-ability-')]), 17)
        self.assertEqual(len([s for s in symbols if s.startswith('i-operation-')]), 4)
        for s in symbols:
            self.assertIn(f'id="{s}"', svg, s)


class TestPreviewsAndFx(unittest.TestCase):
    def test_previews(self):
        from PIL import Image
        for mid in ['copper-junction'] + MAPS:
            slug = mid.replace('-', '_')
            self.assertEqual(Image.open(f'{REPO}/assets/build/maps/{slug}/preview.png').size, (640, 360))
            self.assertEqual(Image.open(f'{REPO}/assets/build/maps/{slug}/preview-256.png').size, (256, 256))

    def test_shahed_effect(self):
        idx = json.load(open(f'{REPO}/assets/build/fx/index.json'))
        d = idx['effects']['fx.weapon_muzzle.IR_SHAHED']
        data = open(f'{REPO}/assets/build/{d["url"]}', 'rb').read()
        self.assertEqual(len(data), d['bytes'])
        self.assertEqual(hashlib.sha256(data).hexdigest(), d['sha256'])
        meta = json.loads(data)
        self.assertEqual(meta['id'], 'fx.weapon_muzzle.IR_SHAHED')
        for page in meta['pages']:
            raw = open(f'{REPO}/assets/build/fx/weapon_muzzle/IR_SHAHED/{page["file"]}', 'rb').read()
            self.assertEqual(hashlib.sha256(raw).hexdigest(), page['sha256'])


if __name__ == '__main__':
    unittest.main()
