"""Native review-only aircraft strips from exact completed handoffs.

Adapted from the accepted complete-family-matrix.py contact method: unchanged
atlas crops, shared tint/shadow compositor, exact packed ground anchors. Never
reads active raw outputs or writes into source, production or prior reviews.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import sys
from PIL import Image, ImageDraw

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[2]
HELPER = REPO / 'work/art/aircraft-final-production-v3/stage/assets/pipeline/tools/composite.py'
REFERENCE = REPO / 'work/art/us-rifle-style-candidate-v1/complete-family-matrix.py'
sys.path.insert(0, str(HELPER.parent))
from composite import tint, shadow_layer

sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
relative = lambda p: str(p.relative_to(REPO))
parser = argparse.ArgumentParser()
parser.add_argument('catalog')
parser.add_argument('output')
args = parser.parse_args()
catalog = REPO / args.catalog
out = BASE / args.output
assert out.parent == BASE and not out.exists(), 'Use a fresh sibling review directory'
inputs = {relative(p): sha(p) for p in [catalog, HELPER, REFERENCE, Path(__file__)]}
order = ['unit.US.fighter', 'unit.US.strike', 'unit.US.gunship', 'unit.US.airlift',
         'unit.IR.fighter', 'unit.IR.strike', 'unit.IR.gunship', 'unit.IR.isr',
         'unit.SA.fighter', 'unit.SA.strike', 'unit.SA.gunship', 'unit.SY.scout_drone']
rows = {r['id']: r for r in json.loads(catalog.read_text())['assets']}
selected = []

def pin(path, wanted=None):
    digest = sha(path)
    if wanted is not None:
        assert digest == wanted, path
    key = relative(path)
    if key in inputs:
        assert inputs[key] == digest, ('Source changed', key)
    inputs[key] = digest
    return path

def export(handoff, key):
    record = handoff['files'][key]
    path = REPO / record['source']
    assert path.stat().st_size == record['bytes'], path
    return pin(path, record['sha256'])

for aid in order:
    if aid not in rows:
        continue
    row = rows[aid]
    hp = pin(REPO / row['handoff'], row['handoff_sha256'])
    h = json.loads(hp.read_text())
    assert h['id'] == aid
    sp = REPO / h.get('spec', h['stage'] + '/assets/pipeline/specs/' + aid + '.json')
    spec = json.loads(pin(sp, h['spec_sha256']).read_text())
    assert spec['model'] in ['aircraft_roster', 'drone_fixed'], aid
    prefix = 'sprites/' + aid + '/'
    side = json.loads(export(h, prefix + aid + '.sprite.json').read_text())
    states = {s['name']: s for s in spec['states']}
    primary = 'hover' if 'hover' in states else 'fly'
    unarmed = 'empty' not in states
    tuples = [(primary, 3, 0, 'flight (unarmed)' if unarmed else 'flight (loaded)'),
              ('parked' if unarmed else 'empty', 3, 0,
               'parked (unarmed)' if unarmed else 'flight (empty)'),
              ('rearm', 3, 3, 'service (unarmed)' if unarmed else 'service (generic loaded)')]
    for state, direction, frame, _ in tuples:
        assert state in states and direction < states[state]['directions']
        assert frame < states[state]['frames']
    selected.append({'id': aid, 'handoff': h, 'handoff_path': relative(hp),
                     'handoff_sha256': sha(hp), 'side': side, 'prefix': prefix,
                     'tuples': tuples, 'unarmed': unarmed})

assert selected
out.mkdir()
images = {}
frame_records = []
for scale, factor in [('1x', 1), ('2x', 2)]:
    cw, ch = 240 * factor, 216 * factor
    for start in range(0, len(selected), 3):
        group = selected[start:start + 3]
        sheet = Image.new('RGBA', (3 * cw, len(group) * ch), '#8C806B')
        draw = ImageDraw.Draw(sheet)
        for row_index, asset in enumerate(group):
            h, side, prefix = asset['handoff'], asset['side'], asset['prefix']
            indexes = {}
            for layer, descriptors in side['atlases'][scale].items():
                for name in descriptors:
                    page = json.loads(export(h, prefix + name).read_text())
                    for key, value in page['frames'].items():
                        assert (layer, key) not in indexes
                        indexes[layer, key] = (page['meta']['image'], value['frame'])
            for column, (state, direction, frame, label) in enumerate(asset['tuples']):
                x, y = column * cw, row_index * ch
                key = f'{state}/d{direction:02d}_f{frame:02d}'
                draw.text((x + 6, y + 4), asset['id'] + ' | ' + key, fill='#171713')
                draw.text((x + 6, y + 18), label + ' | native ' + scale, fill='#171713')
                anchor = [a * factor / 2 for a in side['anchor_2x']]
                position = (round(x + 120 * factor - anchor[0]),
                            round(y + 154 * factor - anchor[1]))
                for layer in ['shadow', 'beauty', 'team']:
                    name, rect = indexes[layer, key]
                    path = export(h, prefix + name)
                    with Image.open(path) as image:
                        part = image.convert('RGBA').crop((rect['x'], rect['y'],
                            rect['x'] + rect['w'], rect['y'] + rect['h']))
                    assert position[0] >= x and position[1] >= y + 30
                    assert position[0] + part.width <= x + cw
                    assert position[1] + part.height <= y + ch
                    part = shadow_layer(part) if layer == 'shadow' else tint(part, '#BDA14D') if layer == 'team' else part
                    sheet.alpha_composite(part, position)
                frame_records.append({'id': asset['id'], 'scale': scale, 'key': key,
                    'packed_anchor_2x': side['anchor_2x'],
                    'cell_ground_anchor': [120 * factor, 154 * factor],
                    'integer_origin': list(position), 'resampled': False})
        name = f'family-{start // 3 + 1:02d}@{scale}.png'
        sheet.convert('RGB').save(out / name)
        images[name] = sha(out / name)

# All sampled source files remain exact after image generation.
assert all(sha(REPO / p) == digest for p, digest in inputs.items())
receipt = {'scope': 'Read-only native family comparison from exact completed handoffs. No active/raw input, pixel resampling, model edit, promotion or superseding acceptance. Shared warm team tint exposes geometry; cosmetic ground-level source composition does not depict flight altitude or actual runtime service.',
    'catalog': relative(catalog), 'completed_coverage': len(selected), 'planned_aircraft': 12,
    'pending_full_handoffs': [aid for aid in order if aid not in rows],
    'heading': 3, 'unarmed_second_column': 'parked, explicitly labeled; no invented empty payload state',
    'assets': [{'id': a['id'], 'handoff': a['handoff_path'], 'sha256': a['handoff_sha256'],
                'tuples': a['tuples']} for a in selected],
    'frames': frame_records, 'input_sha256': inputs, 'output_sha256': images,
    'limitations': ['Only heading3 and selected frames; not an all-heading animation review.',
                    'Generic armed service intentionally stays loaded; owned empty lifecycle is tested separately.',
                    'Earlier per-asset handoffs and visual limitations remain authoritative.']}
(out / 'result.json').write_text(json.dumps(receipt, indent=2) + '\n')
print('FC_NATIVE_AIRCRAFT_FAMILY_REVIEW', len(selected), len(images), relative(out))
