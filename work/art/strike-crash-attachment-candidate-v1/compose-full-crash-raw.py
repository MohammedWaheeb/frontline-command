"""Review all completed crash raw tuples while unrelated states render.

No Blender or source edits. This is supplementary raw-native evidence, not a
complete packed-export or runtime acceptance claim.
"""
from pathlib import Path
import hashlib
import json
import sys

import numpy as np
from PIL import Image, ImageDraw

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[2]
FAMILY = REPO / 'work/art/aircraft-strike-final-production-v1'
lock_path = FAMILY / 'production-lock.json'
lock = json.loads(lock_path.read_text())
STAGE = REPO / lock['stage']
aid = sys.argv[1]
assert aid in lock['assets']
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
for relative, wanted in lock['sources'].items():
    assert sha(STAGE / relative) == wanted, relative
sys.path.insert(0, str(STAGE / 'assets/pipeline/tools'))
from pack_sprites import normalise, downsample_premultiplied
from composite import shadow_layer

spec_path = STAGE / 'assets/pipeline/specs' / (aid + '.json')
spec = json.loads(spec_path.read_text())
state = next(s for s in spec['states'] if s['name'] == 'crash')
assert state['directions'] == 16 and state['frames'] == 4 and state['layers'] == ['beauty', 'shadow']
raw = STAGE / 'assets/build/frames' / aid
inputs = {str(p.relative_to(REPO)): sha(p) for p in [lock_path, spec_path, Path(__file__)]}
for name in ['pack_sprites.py', 'composite.py', 'shadow_alpha.py']:
    p = STAGE / 'assets/pipeline/tools' / name
    inputs[str(p.relative_to(REPO))] = sha(p)
for d in range(16):
    for f in range(4):
        for layer in state['layers']:
            p = raw / layer / f'crash/d{d:02d}_f{f:02d}.png'
            inputs[str(p.relative_to(REPO))] = sha(p)
out = BASE / ('full-crash-raw-' + aid + '-v1')
assert not out.exists(), 'Preserve old contacts.'
out.mkdir()
width, height = [n // 2 for n in spec['canvas']]
images = {}
for start in range(0, 16, 4):
    sheet = Image.new('RGBA', (4 * width, 4 * (height + 26)), '#8C806B')
    draw = ImageDraw.Draw(sheet)
    for direction in range(start, start + 4):
        for frame in range(4):
            key = f'crash/d{direction:02d}_f{frame:02d}'
            cell = Image.new('RGBA', (width, height), '#8C806B')
            for layer in ['shadow', 'beauty']:
                path = raw / layer / (key + '.png')
                with Image.open(path) as image:
                    array = normalise(layer, image.convert('RGBA'))
                image = Image.fromarray(downsample_premultiplied(array), 'RGBA')
                cell.alpha_composite(shadow_layer(image) if layer == 'shadow' else image)
            x, y = frame * width, (direction - start) * (height + 26)
            sheet.paste(cell, (x, y + 26))
            draw.text((x + 4, y + 5), key, fill='#171713')
    p = out / f'crash-all-{start // 4 + 1:02d}@1x.png'
    sheet.convert('RGB').save(p)
    images[p.name] = sha(p)
assert all(sha(REPO / relative) == wanted for relative, wanted in inputs.items())
(out / 'result.json').write_text(json.dumps({
    'id': aid, 'scope': 'All64 completed corrected crash raw tuples, normalized and downsampled by the exact production helpers at native1x. Original canvas/ground anchor preserved. Other states may still render; no whole-export/packed/runtime acceptance inferred.',
    'poses': 64, 'declared_layers': state['layers'], 'canvas_2x': spec['canvas'],
    'anchor_2x': spec['anchor'], 'inputs': inputs, 'images': images,
}, indent=2) + '\n')
print('FC_STRIKE_ALL_CRASH_RAW_CONTACTS', aid, 64, len(images))
