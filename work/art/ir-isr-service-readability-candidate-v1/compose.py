"""Two-heading ISR parked/service comparisons from locked full handoffs and pilot."""
from pathlib import Path
import hashlib
import json
import sys
import numpy as np
from PIL import Image, ImageDraw

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[2]
STAGE = REPO / 'work/art/aircraft-final-production-v3/stage'
sys.path.insert(0, str(STAGE / 'assets/pipeline/tools'))
from pack_sprites import normalise, downsample_premultiplied
from composite import tint, shadow_layer
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
scope = json.loads((BASE / 'scope.json').read_text())
PILOT = BASE / 'pilot-v1'
pilot = json.loads((PILOT / 'result.json').read_text())
assert pilot['failures'] == 0 and pilot['source_sha256'] == scope['candidate_sha256']
OUT = PILOT / 'contacts'
assert not OUT.exists()
OUT.mkdir()
inputs = {}


def pin(path, want=None):
    value = sha(path)
    assert want is None or value == want, path
    key = str(path.relative_to(REPO))
    assert key not in inputs or inputs[key] == value, path
    inputs[key] = value
    return path


def handoff(path, want):
    record = json.loads(pin(path, want).read_text())
    prefix = 'sprites/' + record['id'] + '/'

    def file(key):
        row = record['files'][prefix + key]
        p = REPO / row['source']
        assert p.stat().st_size == row['bytes']
        return pin(p, row['sha256'])

    side = json.loads(file(record['id'] + '.sprite.json').read_text())
    indexes = {}
    for scale, layers in side['atlases'].items():
        for layer, names in layers.items():
            for name in names:
                page = json.loads(file(name).read_text())
                for key, value in page['frames'].items():
                    assert (scale, layer, key) not in indexes
                    indexes[scale, layer, key] = (page['meta']['image'], value['frame'])

    def frame(scale, key):
        layers = {}
        for layer in ['shadow', 'beauty', 'team']:
            name, rect = indexes[scale, layer, key]
            with Image.open(file(name)) as image:
                layers[layer] = image.convert('RGBA').crop((rect['x'], rect['y'],
                    rect['x'] + rect['w'], rect['y'] + rect['h']))
        return layers, side['anchor_2x']
    return frame


old = handoff(REPO / scope['original_handoff'], scope['original_handoff_sha256'])
legacy = handoff(REPO / 'work/art/legacy-ir-strike-production-v1/runtime-handoff.json',
                 '0e6031581748103446d51911c5e1dbc77b9b9ac3893b4a67c26c99fdac7adb34')
pin(PILOT / 'result.json')
pin(BASE / 'scope.json')
pin(Path(__file__))
for name in ['pack_sprites.py', 'composite.py', 'shadow_alpha.py']:
    pin(STAGE / 'assets/pipeline/tools' / name)


def candidate(scale, key):
    layers = {}
    for layer in ['shadow', 'beauty', 'team']:
        rel = 'frames/' + layer + '/' + key + '.png'
        path = pin(PILOT / rel, pilot['files'][rel])
        with Image.open(path) as image:
            pixels = normalise(layer, image.convert('RGBA'))
        layers[layer] = Image.fromarray(downsample_premultiplied(pixels) if scale == '1x'
                                       else pixels.clip(0, 255).astype(np.uint8), 'RGBA')
    return layers, pilot['anchor']


images = {}
for direction in [3, 7]:
    for scale, factor in [('1x', 1), ('2x', 2)]:
        columns = [(old, f'parked/d{direction:02d}_f00', 'ISR original parked'),
                   (old, f'rearm/d{direction:02d}_f03', 'ISR original service'),
                   (candidate, f'rearm/d{direction:02d}_f00', 'ISR candidate service f0'),
                   (candidate, f'rearm/d{direction:02d}_f03', 'ISR candidate service f3'),
                   (candidate, f'rearm/d{direction:02d}_f05', 'ISR candidate service f5'),
                   (legacy, f'rearm/d{direction:02d}_f03', 'IR strike service reference')]
        width, height = 240 * factor, 216 * factor
        sheet = Image.new('RGBA', (3 * width, 2 * height), '#8C806B')
        draw = ImageDraw.Draw(sheet)
        for index, (getter, key, label) in enumerate(columns):
            x, y = index % 3 * width, index // 3 * height
            layers, anchor2 = getter(scale, key)
            position = (round(x + 120 * factor - anchor2[0] * factor / 2),
                        round(y + 154 * factor - anchor2[1] * factor / 2))
            draw.text((x + 4, y + 4), label, fill='#171713')
            draw.text((x + 4, y + 18), key + ' native ' + scale, fill='#171713')
            for layer, image in layers.items():
                assert position[0] >= x and position[1] >= y + 30
                assert position[0] + image.width <= x + width and position[1] + image.height <= y + height
                image = shadow_layer(image) if layer == 'shadow' else tint(image, '#BDA14D') if layer == 'team' else image
                sheet.alpha_composite(image, position)
        path = OUT / f'd{direction:02d}@{scale}.png'
        sheet.convert('RGB').save(path)
        images[path.name] = sha(path)
for relative, value in inputs.items():
    assert sha(REPO / relative) == value, relative
(OUT / 'result.json').write_text(json.dumps({
    'scope': 'Source-native two-heading ISR service comparison. Original ISR/legacy strike '
             'are exact complete-handoff atlas crops; candidate uses the same normalizer '
             'and native downsample. Ground anchors/world scale preserved. No game/runtime '
             'or source pixel equivalence claim; original handoffs remain untouched.',
    'inputs': inputs, 'images': images,
}, indent=2) + '\n')
print('FC_ISR_SERVICE_COMPARISON_DONE 4', flush=True)
