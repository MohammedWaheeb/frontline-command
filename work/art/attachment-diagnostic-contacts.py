"""Compose prepared ground/building original diagnostics at exact native scale."""
from pathlib import Path
import hashlib
import json
import math
import sys

import numpy as np
from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[2]
FAMILIES = {
    'ground-detachment-service-diagnostic-v1': 'vehicle-final-production-v1',
    'building-attachment-native-diagnostic-v1': 'building-final-production-v1',
}
name = sys.argv[1]
assert name in FAMILIES
BASE = REPO / 'work/art' / name / 'original-v1'
STAGE = REPO / 'work/art' / FAMILIES[name] / 'stage'
sys.path.insert(0, str(STAGE / 'assets/pipeline/tools'))
from pack_sprites import normalise, downsample_premultiplied
from composite import tint, shadow_layer

sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
receipt = BASE / 'result.json'
report = json.loads(receipt.read_text())
assert report['failures'] == 0
OUT = BASE / 'contacts'
assert not OUT.exists(), 'Preserve previous diagnostic contacts.'
OUT.mkdir()
inputs = {str(receipt.relative_to(REPO)): sha(receipt)}
for tool in ['pack_sprites.py', 'composite.py', 'shadow_alpha.py']:
    path = STAGE / 'assets/pipeline/tools' / tool
    inputs[str(path.relative_to(REPO))] = sha(path)
images = {}
for asset in report['assets']:
    tuples = [t for t in asset['tuples'] if t.get('rendered', True)]
    if not tuples:
        continue
    columns = 3 if name.startswith('building') else 4
    for scale, divisor in [('1x', 2), ('2x', 1)]:
        width, height = [v // divisor for v in asset['canvas']]
        sheet = Image.new('RGBA', (columns * width, (height + 30) * math.ceil(len(tuples) / columns)), '#8C806B')
        draw = ImageDraw.Draw(sheet)
        for n, pose in enumerate(tuples):
            cell = Image.new('RGBA', (width, height), '#8C806B')
            for layer in ['shadow', 'beauty', 'team']:
                if layer not in pose['layers']:
                    continue
                relative = 'frames/' + asset['id'] + '/' + layer + '/' + pose['key'] + '.png'
                path = BASE / relative
                assert sha(path) == report['files'][relative]
                inputs[str(path.relative_to(REPO))] = report['files'][relative]
                with Image.open(path) as image:
                    pixels = normalise(layer, image.convert('RGBA'))
                image = Image.fromarray(downsample_premultiplied(pixels) if divisor == 2 else pixels.clip(0, 255).astype(np.uint8), 'RGBA')
                if layer == 'shadow':
                    image = shadow_layer(image)
                elif layer == 'team':
                    image = tint(image, '#BDA14D')
                cell.alpha_composite(image)
            x, y = n % columns * width, n // columns * (height + 30)
            sheet.paste(cell, (x, y + 30))
            draw.text((x + 4, y + 5), pose['key'] + ' ' + pose.get('part', 'building'), fill='#171713')
        path = OUT / (asset['id'] + '@' + scale + '.png')
        sheet.convert('RGB').save(path)
        images[path.name] = sha(path)
for relative, digest in inputs.items():
    assert sha(REPO / relative) == digest, relative
(OUT / 'result.json').write_text(json.dumps({
    'scope': 'Original source diagnostic contacts. Exact native canvas/anchor; '
             'declared body/team/shadow layers only. Ground idle/damaged hull '
             'views are labeled; no invented turret assembly. Fixed gold review '
             'tint, not an actual Go/player-state scene. No acceptance implied.',
    'script_sha256': sha(Path(__file__)), 'inputs': inputs, 'images': images,
}, indent=2) + '\n')
print('FC_ATTACHMENT_DIAGNOSTIC_CONTACTS', name, len(images))
