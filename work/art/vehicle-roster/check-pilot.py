"""Coordinator follow-up: actual pilot pixels, native contacts, 1x/2x UI integrity.

Never packs or changes a shipping sprite. Requires rendered pilot artifacts.
"""
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
from composite import tint, shadow_layer

aid = sys.argv[1]
spec_path = repo / 'assets/pipeline/specs' / (aid + '.json')
spec = json.loads(spec_path.read_text())
assert spec['model'] in ('vehicle_roster', 'aircraft_roster')
root = repo / 'work/art' / spec['model'].replace('_', '-') / 'pilot-v1' / aid
report = json.loads((root / 'render.json').read_text())
assert report['spec_sha256'] == hashlib.sha256(spec_path.read_bytes()).hexdigest()
assert report['model_sha256'] == hashlib.sha256((repo / 'assets/pipeline/blender/models' / (spec['model'] + '.py')).read_bytes()).hexdigest()
failures, composites, pixels = [], [], {}

def check_layers(key, beauty, team=None):
    a = beauty[:, :, 3]
    border = np.concatenate((a[0], a[-1], a[:, 0], a[:, -1]))
    if int((a > 8).sum()) < 10:
        failures.append(key + ': empty')
    if bool((border > 8).any()):
        failures.append(key + ': clipped')
    if team is not None:
        t = team[:, :, 3]
        if int(((t > 32) & (a < 8)).sum()) > max(4, .005 * int((t > 32).sum())):
            failures.append(key + ': team outside body')

def composite(layers, colour='#BDA14D'):
    canvas = Image.new('RGBA', tuple(v // 2 for v in spec['canvas']), '#8C806B')
    for name in ('shadow', 'beauty', 'team'):
        if name not in layers:
            continue
        image = Image.fromarray(downsample_premultiplied(layers[name].astype(np.float32)), 'RGBA')
        if name == 'shadow':
            image = shadow_layer(image)
        if name == 'team':
            image = tint(image, colour)
        canvas.alpha_composite(image)
    return canvas

for record in report['poses']:
    key, layers = record['key'], {}
    for name in record['layers']:
        image = Image.open(root / name / (key + '.png')).convert('RGBA')
        if list(image.size) != spec['canvas']:
            failures.append(key + '/' + name + ': dimensions')
        layers[name] = normalise(name, image).clip(0, 255).astype(np.uint8)
        if name == 'shadow':
            a = layers[name][:, :, 3]
            border = np.concatenate((a[0], a[-1], a[:, 0], a[:, -1]))
            if bool((border > 24).any()):
                failures.append(key + ': shadow clipped')
    check_layers(key, layers['beauty'], layers.get('team'))
    pixels[key] = layers
    composites.append((key, composite(layers)))

w, h = [v // 2 for v in spec['canvas']]
columns = 4
contact = Image.new('RGB', (w * columns, (h + 22) * math.ceil(len(composites) / columns)), '#8C806B')
draw = ImageDraw.Draw(contact)
for i, (key, image) in enumerate(composites):
    x, y = i % columns * w, i // columns * (h + 22)
    contact.paste(image, (x, y + 22))
    draw.text((x + 4, y + 4), key, fill='#181713')
contact.save(root / 'contact@1x.png')
palette = Image.new('RGB', (w * 4, h * 2), '#8C806B')
first = next(iter(pixels.values()))
for i, colour in enumerate(('#C75448', '#497FB5', '#DDBB52', '#648B55', '#A174B8', '#C98543', '#6EA99F', '#DDDCBF')):
    palette.paste(composite(first, colour), (i % 4 * w, i // 4 * h))
palette.save(root / 'palette@1x.png')

ui_checks = 0
if '--ui' in sys.argv:
    role = spec['role_id']
    gallery = Image.new('RGBA', (528, 238), '#8C806B')
    draw = ImageDraw.Draw(gallery)
    for part, expected, x in [('portraits', (192, 192), 0), ('icons/build', (128, 96), 208)]:
        source = root / 'assets/build/ui' / part / role
        for name in ('beauty', 'team'):
            image = Image.open(str(source) + '@2x.' + name + '.png').convert('RGBA')
            downsample = downsample_premultiplied(np.asarray(image).astype(np.float32), 2)
            Image.fromarray(downsample, 'RGBA').save(str(source) + '@1x.' + name + '.png')
        for scale, factor in (('2x', 1), ('1x', 2)):
            beauty = Image.open(str(source) + '@' + scale + '.beauty.png').convert('RGBA')
            team = Image.open(str(source) + '@' + scale + '.team.png').convert('RGBA')
            ui_checks += 5
            if beauty.size != tuple(v // factor for v in expected) or team.size != beauty.size:
                failures.append(part + '/' + scale + ': dimensions')
            check_layers(part + '/' + scale, np.asarray(beauty), np.asarray(team))
            if not (np.asarray(team)[:, :, 3] > 8).any():
                failures.append(part + '/' + scale + ': no team mask')
            px, py = (x, 24) if factor == 1 else (360 + x // 2, 24)
            gallery.alpha_composite(beauty, (px, py))
            gallery.alpha_composite(tint(team, '#BDA14D'), (px, py))
        draw.text((x + 3, 5), part, fill='#181713')
    gallery.convert('RGB').save(root / 'ui-contact@1x-2x.png')
result = {'id': aid, 'poses': len(composites), 'ui_checks': ui_checks, 'failures': failures,
          'scope': 'Selected rendered pilot; native visual review still required, not full production coverage'}
(root / 'check.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
assert not failures, failures
