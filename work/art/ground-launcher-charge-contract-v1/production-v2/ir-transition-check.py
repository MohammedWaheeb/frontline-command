"""Read-only final first-shot / one-charge-ready native contact; no renders."""
from pathlib import Path
import functools, hashlib, json, sys
import numpy as np
from PIL import Image, ImageDraw

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[3]
STAGE = BASE / 'stage'
sys.path.insert(0, str(STAGE / 'assets/pipeline/tools'))
from composite import tint, shadow_layer

OUT = BASE / 'ir-first-shot-ready-v1'
OUT.mkdir()
inputs = {}
def read(path):
    data = path.read_bytes()
    inputs[str(path.relative_to(REPO))] = hashlib.sha256(data).hexdigest()
    return data
aid = 'unit.IR.launcher'
root = STAGE / 'assets/build/sprites' / aid
spec = json.loads(read(STAGE / 'assets/pipeline/specs' / (aid + '.json')))
side = json.loads(read(root / (aid + '.sprite.json')))
handoff = BASE / 'runtime-handoff' / (aid + '.json')
read(handoff)
read(Path(__file__))
read(STAGE / 'assets/pipeline/tools/composite.py')

@functools.lru_cache(maxsize=2)
def atlas(name):
    read(root / name)
    with Image.open(root / name) as image:
        return image.convert('RGBA')

rows = []
outputs = {}
for scale, divisor in [('1x', 2), ('2x', 1)]:
    index = {}
    for layer, pages in side['atlases'][scale].items():
        for page in pages:
            data = json.loads(read(root / page))
            for key, entry in data['frames'].items():
                assert (layer, key) not in index
                index[layer, key] = data['meta']['image'], entry['frame']
    width, height = [v // divisor for v in spec['canvas']]
    origin = tuple((a - b) // divisor for a, b in zip(spec['anchor'], side['anchor_2x']))
    def compose(key):
        image = Image.new('RGBA', (width, height), '#8C806B')
        for layer in ['shadow', 'beauty', 'team']:
            if (layer, key) not in index:
                continue
            name, rect = index[layer, key]
            part = atlas(name).crop((rect['x'], rect['y'], rect['x'] + rect['w'], rect['y'] + rect['h']))
            if layer == 'team': part = tint(part, '#BDA14D')
            elif layer == 'shadow': part = shadow_layer(part)
            image.alpha_composite(part, origin)
        return image
    for start in (0, 2):
        sheet = Image.new('RGB', (width * 2, (height + 26) * 2), '#8C806B')
        draw = ImageDraw.Draw(sheet)
        for row, direction in enumerate([3, 7, 11, 15][start:start + 2]):
            keys = [f'fire_charges_1/d{direction:02d}_f03', f'ready/d{direction:02d}_f00']
            pair = [compose(key) for key in keys]
            for column, (key, image) in enumerate(zip(keys, pair)):
                x, y = column * width, row * (height + 26)
                sheet.paste(image, (x, y + 26))
                draw.text((x + 4, y + 6), key, fill='#171713')
            delta = np.abs(np.asarray(pair[0], dtype=np.int16) - np.asarray(pair[1], dtype=np.int16))
            rows.append({'scale': scale, 'direction': direction, 'keys': keys,
                         'changed_pixels': int(np.any(delta, axis=2).sum()),
                         'max_channel_delta': int(delta.max()),
                         'meaning': 'Descriptive only; fire tail is not asserted pixel-identical to ready.'})
        name = f'first-shot-ready-{start // 2 + 1:02d}@{scale}.png'
        sheet.save(OUT / name)
        outputs[name] = hashlib.sha256((OUT / name).read_bytes()).hexdigest()
    atlas.cache_clear()

result = {'scope': 'Exact completed production-v2 atlas frames, paired at the same anchor and native scales; no pose synthesis, source edits or rerender. Source contact only, not live runtime.',
          'id': aid, 'handoff_sha256': inputs[str(handoff.relative_to(REPO))],
          'inputs': inputs, 'outputs': outputs, 'pairs': rows, 'native_review': 'pending'}
(OUT / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'out': str(OUT), 'pairs': len(rows), 'pages': len(outputs)}))
