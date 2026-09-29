"""Native family context from receipt-verified atlas pixels; no model changes."""
from pathlib import Path
import hashlib, json, sys
import numpy as np
from PIL import Image, ImageDraw

B = Path(__file__).resolve().parent
R = B.parents[2]
S = B / 'stage'
sys.path.insert(0, str(S / 'assets/pipeline/tools'))
from pack_sprites import normalise, downsample_premultiplied
from composite import tint, shadow_layer

sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
roster_path = R / 'work/art/ui-team-normalization-audit-v1/normalized-roster-v2/result.json'
roster = json.loads(roster_path.read_text())
out = B / 'pilot-v1/family-ui'
assert not out.exists(), 'Preserve prior comparison outputs'
out.mkdir()
inputs = {str(roster_path.relative_to(R)): sha(roster_path)}
checks = []
images = {}

def checked_file(row):
    p = R / row['source']
    assert sha(p) == row['sha256'] and p.stat().st_size == row['bytes'], p
    inputs[str(p.relative_to(R))] = row['sha256']
    return p

def handoff(role):
    entry = next(x for x in roster['handoffs'] if x['id'] == 'unit.' + role)
    p = R / entry['path']
    inputs[str(p.relative_to(R))] = sha(p)
    return json.loads(p.read_text())

def reference(role, direction, scale):
    h = handoff(role)
    prefix = 'sprites/unit.' + role + '/'
    side = json.loads(checked_file(h['files'][prefix + 'unit.' + role + '.sprite.json']).read_text())
    div = 2 if scale == 1 else 1
    assert all(x % div == 0 for x in side['anchor_2x']), 'No rounded half-pixel anchors'
    result = {}
    for layer in ['shadow', 'beauty', 'team']:
        found = []
        for key, row in h['files'].items():
            if not key.startswith(prefix) or not key.endswith(f'@{scale}x.{layer}.json'):
                continue
            descriptor = json.loads(checked_file(row).read_text())
            frame = descriptor['frames'].get(f'idle/d{direction:02d}_f00')
            if frame:
                image_key = str(Path(key).parent / descriptor['meta']['image'])
                with Image.open(checked_file(h['files'][image_key])) as im:
                    f = frame['frame']
                    found.append(im.convert('RGBA').crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])))
        assert len(found) == 1, (role, layer, len(found))
        result[layer] = found[0]
    return result, [v // div for v in side['anchor_2x']]

def candidate(direction, scale):
    spec = json.loads((B / 'unit.US.rifle.json').read_text())
    render = json.loads((B / 'pilot-v1/render.json').read_text())
    row = next(x for x in render['records'] if x['folder'] == 'candidate' and x['key'] == f'idle/d{direction:02d}_f00')
    result = {}
    for rel, want in row['files'].items():
        p = B / 'pilot-v1' / rel
        assert sha(p) == want
        inputs[str(p.relative_to(R))] = want
        layer = Path(rel).parts[1]
        with Image.open(p) as im:
            a = normalise(layer, im)
        result[layer] = Image.fromarray(downsample_premultiplied(a) if scale == 1 else a.clip(0, 255).astype(np.uint8), 'RGBA')
    return result, [v // (2 if scale == 1 else 1) for v in spec['anchor']]

roles = ['US.rifle', 'candidate', 'US.at', 'US.recon', 'US.elite', 'IR.rifle', 'SY.rifle', 'SA.rifle']
for scale in [1, 2]:
    cw, ch, ground = 100 * scale, 100 * scale, (45 * scale, 65 * scale)
    sheet = Image.new('RGBA', (cw * 4, ch * 4), '#8C806B')
    draw = ImageDraw.Draw(sheet)
    for row, direction in enumerate([1, 5]):
        for n, role in enumerate(roles):
            layers, anchor = candidate(direction, scale) if role == 'candidate' else reference(role, direction, scale)
            x, y = (n % 4) * cw, (row * 2 + n // 4) * ch
            draw.text((x + 3, y + 3), role + f' d{direction:02d}', fill='#171713')
            for layer in ['shadow', 'beauty', 'team']:
                part = layers[layer]
                part = shadow_layer(part) if layer == 'shadow' else tint(part, '#3E8EDE') if layer == 'team' else part
                dx, dy = ground[0] - anchor[0], ground[1] - anchor[1]
                assert dx >= 0 and dy >= 0 and dx + part.width <= cw and dy + part.height <= ch
                sheet.alpha_composite(part, (x + dx, y + dy))
    p = out / f'family@{scale}x.png'
    sheet.convert('RGB').save(p)
    images[p.name] = sha(p)

# Actual authored UI is shown at 2x and through the approved downsampler at 1x.
# World palette context above uses exact existing per-scale atlas pixels.
old = handoff('US.rifle')
sheet = Image.new('RGBA', (680, 340), '#8C806B')
draw = ImageDraw.Draw(sheet)
for purpose, folder, x, stride in [('portrait', 'portraits', 0, 196), ('build', 'icons/build', 400, 132)]:
    for col, source in enumerate(['before', 'candidate']):
        layers = {}
        for layer in ['beauty', 'team']:
            key = f'ui/{folder}/US.rifle@2x.{layer}.png'
            p = checked_file(old['files'][key]) if source == 'before' else S / 'assets/build' / key
            assert p.exists(), p
            inputs[str(p.relative_to(R))] = sha(p)
            layers[layer] = Image.open(p).convert('RGBA')
        a, t = (np.asarray(layers[k])[:, :, 3] for k in ['beauty', 'team'])
        checks.append({'name': f'{purpose}/{source}/team_inside', 'ok': int(((t > 32) & (a < 8)).sum()) <= max(4, .005 * int((t > 32).sum()))})
        checks.append({'name': f'{purpose}/{source}/no_border', 'ok': not bool((np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]) > 8).any())})
        cell = Image.alpha_composite(layers['beauty'], tint(layers['team'], '#3E8EDE'))
        sheet.alpha_composite(cell, (x + col * stride, 24))
        small = Image.fromarray(downsample_premultiplied(np.asarray(cell, dtype=np.float32)), 'RGBA')
        sheet.alpha_composite(small, (x + col * stride, 232))
        draw.text((x + col * stride + 3, 5), source + ' ' + purpose, fill='#171713')
p = out / 'ui-before-after@1x-2x.png'
sheet.convert('RGB').save(p)
images[p.name] = sha(p)
result = {'scope': 'Native exact-zoom family and paired authored UI comparison. Atlas reference frames/anchors copied unchanged; candidate world frames use the frozen approved pack normalization. No resizing to equal body height. Direct visual review is required.', 'inputs': inputs, 'checks': checks, 'failures': sum(not x['ok'] for x in checks), 'images': images}
(out / 'receipt.json').write_text(json.dumps(result, indent=2) + '\n')
print('FC_RIFLE_FAMILY_UI', result['failures'])
assert result['failures'] == 0
