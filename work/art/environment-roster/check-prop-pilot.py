"""Actual prop pilot PNG integrity and native contacts, no shipping mutations."""
import hashlib
import json
import math
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
repo = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(repo / 'assets/pipeline/tools'))
from pack_sprites import normalise, downsample_premultiplied
from composite import shadow_layer
root = repo / 'work/art/environment-roster/prop-pilot-v1' / sys.argv[1]
report = json.loads((root / 'render.json').read_text())
spec = json.loads((root / 'source-spec.json').read_text())
assert report['model_sha256'] == hashlib.sha256((repo / 'assets/pipeline/blender/models/environment_roster.py').read_bytes()).hexdigest()
failures, images, hashes = [], [], {}
for pose in report['poses']:
    key = pose['key']
    composite = Image.new('RGBA', tuple(spec['canvas']), '#81755E')
    layers = {}
    for layer in pose['layers']:
        image = Image.open(root / layer / (key + '.png')).convert('RGBA')
        if list(image.size) != spec['canvas']:
            failures.append(key + '/' + layer + ': dimensions')
        pixels = normalise(layer, image).clip(0, 255).astype(np.uint8)
        a = pixels[:, :, 3]
        border = np.concatenate((a[0], a[-1], a[:, 0], a[:, -1]))
        if bool((border > (24 if layer == 'shadow' else 8)).any()):
            failures.append(key + '/' + layer + ': clipped')
        if layer == 'beauty' and int((a > 8).sum()) < 16:
            failures.append(key + ': empty')
        layers[layer] = pixels
    for layer in ('shadow', 'beauty'):
        if layer not in layers:
            continue
        image = Image.fromarray(layers[layer], 'RGBA')
        composite.alpha_composite(shadow_layer(image) if layer == 'shadow' else image)
    images.append((key, composite))
    hashes[key] = hashlib.sha256(layers['beauty'].tobytes()).hexdigest()
if len(spec['states']) > 1:
    for direction in range(4):
        samples = [hashes[f"{state['name']}/d{direction:02d}_f00"] for state in spec['states']]
        if len(set(samples)) != len(samples):
            failures.append(f'd{direction:02d}: distinct declared state plate rendered identically')
for scale in (1, 2):
    w, h = (v // scale for v in spec['canvas'])
    sheet = Image.new('RGB', (w * 2, (h + 22) * math.ceil(len(images) / 2)), '#81755E')
    draw = ImageDraw.Draw(sheet)
    for i, (key, image) in enumerate(images):
        if scale == 2:
            image = Image.fromarray(downsample_premultiplied(np.asarray(image).astype(np.float32), 2), 'RGBA')
        x, y = i % 2 * w, i // 2 * (h + 22)
        sheet.paste(image, (x, y + 22))
        draw.text((x + 6, y + 5), key, fill='white')
    sheet.save(root / ('contact@2x.png' if scale == 1 else 'contact@1x.png'))
result = {'id': report['id'], 'poses': len(images), 'failures': failures,
          'scope': 'Rendered family pilot; requires actual native visual and map-placement review'}
(root / 'check.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
assert not failures, failures
