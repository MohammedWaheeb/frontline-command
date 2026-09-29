"""Measure final loaded/empty body pixels without changing source or exports."""
from pathlib import Path
import functools
import hashlib
import json
import sys
import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
aid = sys.argv[1]
stage = REPO / json.loads((HERE / 'production-lock.json').read_text())['stage']
root = stage / 'assets/build/sprites' / aid
side = json.loads((root / (aid + '.sprite.json')).read_text())
spec = json.loads((stage / 'assets/pipeline/specs' / (aid + '.json')).read_text())
sys.path.insert(0, str(stage / 'assets/pipeline/tools'))
from composite import tint

out = HERE / 'payload-visibility' / aid
assert not out.exists()
out.mkdir(parents=True)
pairs = [('fly', 'empty'), ('parked', 'parked_empty'), ('rearm', 'rearm_empty'),
         ('launch', 'launch_empty'), ('recover', 'recover_empty'),
         ('damaged', 'damaged_empty'), ('fire', 'fire_empty')]
states = {s['name']: s for s in spec['states']}
records = []
for scale, divisor in [('1x', 2), ('2x', 1)]:
    entries = {}
    for layer in ['beauty', 'team']:
        for name in side['atlases'][scale][layer]:
            a = json.loads((root / name).read_text())
            for key, frame in a['frames'].items():
                entries[layer, key] = (a['meta']['image'], frame['frame'])
    @functools.lru_cache(maxsize=3)
    def page(name):
        with Image.open(root / name) as im:
            return im.convert('RGBA')
    def body(state, direction):
        im = Image.new('RGBA', tuple(v // divisor for v in side['frame_size_2x']), '#8c806b')
        key = f'{state}/d{direction:02d}_f00'
        for layer in ['beauty', 'team']:
            name, r = entries[layer, key]
            frame = page(name).crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
            im.alpha_composite(tint(frame, '#BDA14D') if layer == 'team' else frame)
        return im
    for loaded, empty in pairs:
        if loaded not in states or empty not in states:
            continue
        for d in range(states[loaded]['directions']):
            a, b = body(loaded, d), body(empty, d)
            delta = np.abs(np.asarray(a).astype(np.int16)[:, :, :3] - np.asarray(b).astype(np.int16)[:, :, :3])
            m = delta.max(axis=2)
            records.append({'scale': scale, 'loaded': loaded, 'empty': empty, 'direction': d,
                            'changed_pixels': int((m > 0).sum()), 'pixels_delta_at_least_8': int((m >= 8).sum()),
                            'maximum_channel_delta': int(m.max())})
    width, height = (v // divisor for v in side['frame_size_2x'])
    contact = Image.new('RGBA', (width * 4, (height + 20) * 2), '#8c806b')
    draw = ImageDraw.Draw(contact)
    for x, d in enumerate([3, 7, 11, 15]):
        for row, state in enumerate(['fly', 'empty']):
            contact.alpha_composite(body(state, d), (x * width, row * (height + 20) + 20))
            draw.text((x * width + 2, row * (height + 20) + 3), f'{state} d{d:02d}', fill='#171713')
    contact.convert('RGB').save(out / f'loaded-empty-diagonals@{scale}.png')
    page.cache_clear()
result = {'id': aid, 'scope': 'Exact final packed body/team comparison at frame0, all headings; shadow excluded. Pixel differences do not establish native human readability.',
          'sidecar_sha256': hashlib.sha256((root / (aid + '.sprite.json')).read_bytes()).hexdigest(),
          'rows': records, 'native_review_required': True}
(out / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'id': aid, 'comparisons': len(records),
                  'native_1x_zero_difference': sum(r['scale'] == '1x' and r['changed_pixels'] == 0 for r in records),
                  'native_1x_changed_range': [min(r['changed_pixels'] for r in records if r['scale'] == '1x'), max(r['changed_pixels'] for r in records if r['scale'] == '1x')]}))
