"""Asset integrity, dimension, transparency and state-coverage checks.

Checks (per rendered spec):
  coverage     every declared state x direction x frame x layer file exists
  dimensions   every frame equals the spec canvas
  transparency beauty corners fully transparent; frame not empty
  clipping     no opaque beauty/shadow pixel on the canvas border (art not cut off)
  team_subset  team-mask coverage lies inside beauty coverage
  shadow       shadow layer non-empty where declared
  directions   distinct images for different headings of one state
  animation    distinct images for different frames of animated states
  anchor       anchor inside canvas and beauty bbox horizontally near the anchor
Packed output: sidecar present, atlas frame counts match, sizes <= 4096,
1x atlas is half of 2x. Terrain: 512 px, seamless flag. Manifest: every
`sample` entry has its output; `final` only for items with licence files.
Fonts: licence text beside each family.

Usage: work/art/.venv/bin/python assets/pipeline/tools/check_assets.py
Writes work/art/check-report.json and work/art/check-report.md; exit 1 on failures.
"""
import glob
import hashlib
import json
import os
import sys

import numpy as np
from PIL import Image
from shadow_alpha import clean_shadow_alpha

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SPECS = os.path.join(REPO, 'assets', 'pipeline', 'specs')
FRAMES = os.path.join(REPO, 'assets', 'build', 'frames')
SPRITES = os.path.join(REPO, 'assets', 'build', 'sprites')

results = []


def rec(asset, check, ok, detail=''):
    results.append({'asset': asset, 'check': check, 'ok': bool(ok), 'detail': detail})


def alpha(p):
    return np.asarray(Image.open(p).convert('RGBA'))[..., 3]


def digest(p):
    with open(p, 'rb') as f:
        return hashlib.sha1(np.asarray(Image.open(f).convert('RGBA')).tobytes()).hexdigest()


def check_spec(spec_path):
    spec = json.load(open(spec_path))
    aid = spec['id']
    root = os.path.join(FRAMES, aid)
    if not os.path.isdir(root):
        rec(aid, 'rendered', False, 'no frames directory')
        return
    cw, ch = spec['canvas']
    ax, ay = spec['anchor']
    rec(aid, 'anchor_in_canvas', 0 <= ax < cw and 0 <= ay < ch, f'anchor {ax},{ay} canvas {cw}x{ch}')
    missing, wrong, empty, clipped, corner, team_out, shadow_empty = [], [], [], [], [], [], []
    same_dir, same_anim, off_anchor = [], [], []
    total = 0
    for st in spec['states']:
        layers = st.get('layers', spec['passes'])
        dir_hashes = {}
        for d in range(st['directions']):
            fr_hashes = []
            for fr in range(st['frames']):
                key = f"{st['name']}/d{d:02d}_f{fr:02d}"
                paths = {l: os.path.join(root, l, st['name'], f'd{d:02d}_f{fr:02d}.png') for l in layers}
                for l, p in paths.items():
                    total += 1
                    if not os.path.exists(p):
                        missing.append(f'{l}:{key}')
                        continue
                    im = Image.open(p)
                    if im.size != (cw, ch):
                        wrong.append(f'{l}:{key}:{im.size}')
                if 'beauty' not in paths or not os.path.exists(paths['beauty']):
                    continue
                a = alpha(paths['beauty'])
                if (a > 8).sum() < 30:
                    empty.append(key)
                if max(a[0, 0], a[0, -1], a[-1, 0], a[-1, -1]) > 0:
                    corner.append(key)
                border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
                if (border > 8).any():
                    clipped.append(f'beauty:{key}')
                ys, xs = np.nonzero(a > 8)
                if len(xs) and not (xs.min() - 4 <= ax <= xs.max() + 4):
                    off_anchor.append(key)
                if 'team' in paths and os.path.exists(paths['team']):
                    t = alpha(paths['team'])
                    outside = ((t > 32) & (a < 8)).sum()
                    if outside > max(4, 0.005 * (t > 32).sum()):
                        team_out.append(f'{key}:{outside}px')
                if 'shadow' in paths and os.path.exists(paths['shadow']):
                    # Check the same exported shadow channel used by the packer.
                    # Raw Cycles background noise is preserved separately.
                    s = clean_shadow_alpha(alpha(paths['shadow']))
                    if (s > 8).sum() < 10:
                        shadow_empty.append(key)
                    sb = np.concatenate([s[0], s[-1], s[:, 0], s[:, -1]])
                    if (sb > 24).any():
                        clipped.append(f'shadow:{key}')
                h = digest(paths['beauty'])
                fr_hashes.append(h)
                if fr == 0:
                    dir_hashes[d] = h
            if st['frames'] > 1 and st.get('fps', 0) > 0 and len(set(fr_hashes)) < 2:
                same_anim.append(f"{st['name']}/d{d:02d}")
        if st['directions'] > 1 and len(set(dir_hashes.values())) < len(dir_hashes):
            same_dir.append(f"{st['name']}: {len(set(dir_hashes.values()))}/{len(dir_hashes)} distinct")
    rec(aid, 'coverage', not missing, f'{total - len(missing)}/{total} layer frames present' +
        (f'; missing e.g. {missing[:3]}' if missing else ''))
    rec(aid, 'dimensions', not wrong, f'all {cw}x{ch}' if not wrong else f'{wrong[:3]}')
    rec(aid, 'transparency', not corner and not empty, f'corner-opaque {len(corner)}, empty {len(empty)}')
    rec(aid, 'clipping', not clipped, f'{len(clipped)} frames touch the border' + (f' e.g. {clipped[:3]}' if clipped else ''))
    rec(aid, 'team_subset', not team_out, f'{len(team_out)} frames with team pixels outside beauty' +
        (f' e.g. {team_out[:2]}' if team_out else ''))
    rec(aid, 'shadow', not shadow_empty, f'{len(shadow_empty)} empty shadow frames')
    rec(aid, 'directions', not same_dir, '; '.join(same_dir) or 'all headings distinct')
    rec(aid, 'animation', not same_anim, f'{len(same_anim)} static animated states' +
        (f' e.g. {same_anim[:3]}' if same_anim else ''))
    rec(aid, 'anchor_near_art', not off_anchor, f'{len(off_anchor)} frames with anchor outside art x-range')
    check_packed(aid, spec, total)


def check_packed(aid, spec, total_layer_frames):
    side = os.path.join(SPRITES, aid, f'{aid}.sprite.json')
    if not os.path.exists(side):
        rec(aid, 'packed', False, 'sprite sidecar missing (run pack_sprites.py)')
        return
    s = json.load(open(side))
    counts = 0
    bad = []
    for scale, layers in s['atlases'].items():
        for layer, files in layers.items():
            for fn in files:
                j = json.load(open(os.path.join(SPRITES, aid, fn)))
                counts += len(j['frames']) if scale == '2x' else 0
                img = Image.open(os.path.join(SPRITES, aid, j['meta']['image']))
                if img.size != (j['meta']['size']['w'], j['meta']['size']['h']) or max(img.size) > 4096:
                    bad.append(f'{fn}: {img.size}')
                if scale == '1x':
                    twin = os.path.join(SPRITES, aid, j['meta']['image'].replace('@1x', '@2x'))
                    t = Image.open(twin)
                    if abs(t.width // 2 - img.width) > 1 or abs(t.height // 2 - img.height) > 1:
                        bad.append(f'{fn}: 1x {img.size} vs 2x {t.size}')
    rec(aid, 'packed', counts == total_layer_frames and not bad,
        f'{counts}/{total_layer_frames} frames in 2x atlases' + (f'; {bad[:2]}' if bad else ''))


def check_terrain():
    tj = os.path.join(REPO, 'assets', 'build', 'terrain', 'terrain.json')
    if not os.path.exists(tj):
        rec('terrain', 'generated', False, 'terrain.json missing')
        return
    t = json.load(open(tj))
    for name, m in t['materials'].items():
        p = os.path.join(REPO, 'assets', 'build', 'terrain', m['file'])
        im = Image.open(p)
        rec(f'terrain.{name}', 'terrain', im.size == (512, 512) and m['seamless'] and im.mode == 'RGB',
            f"{im.size} {im.mode}, seam {m['seam_delta']} vs interior p99 {m['interior_delta_p99']}")


def check_manifest():
    mp = os.path.join(REPO, 'assets', 'manifest', 'asset-manifest.json')
    m = json.load(open(mp))
    ents = m['entries']
    for e in ents:
        if e['status'] == 'sample':
            out = e['output'].split(' ')[0]
            ok = os.path.exists(os.path.join(REPO, out.replace('(+', '').strip()))
            rec(e['id'], 'manifest_output', ok, out)
        if e['status'] == 'final':
            ok = e['category'] == 'font' and glob.glob(os.path.join(REPO, e['output'], 'OFL.txt'))
            rec(e['id'], 'manifest_final_licence', ok, e['output'])
        for k in ('source', 'license', 'editable_origin', 'output'):
            if not e.get(k):
                rec(e['id'], 'manifest_fields', False, f'missing {k}')
    units = [e for e in ents if e['category'] == 'unit_sprite']
    rec('manifest', 'unit_count', len(units) == 75, f'{len(units)} unit sprite entries')
    b = [e for e in ents if e['category'] == 'building_sprite']
    rec('manifest', 'building_variants', len(b) == 14 * 4 + 5, f'{len(b)} building sprite entries (14 shared x 4 + 5 unique)')
    no_states = [e['id'] for e in units + b if not e['spec']['states']]
    rec('manifest', 'state_lists', not no_states, f'{len(no_states)} sprite entries without states')


def main():
    for sp in sorted(glob.glob(os.path.join(SPECS, '*.json'))):
        check_spec(sp)
    check_terrain()
    check_manifest()
    fails = [r for r in results if not r['ok']]
    os.makedirs(os.path.join(REPO, 'work', 'art'), exist_ok=True)
    with open(os.path.join(REPO, 'work', 'art', 'check-report.json'), 'w') as f:
        json.dump({'checks': len(results), 'failures': len(fails), 'results': results}, f, indent=1)
    lines = ['# Asset check report', '', f'Checks: {len(results)}; failures: {len(fails)}.', '',
             '| Asset | Check | Result | Detail |', '|---|---|---|---|']
    for r in results:
        if r['check'] in ('manifest_output', 'manifest_final_licence') and r['ok']:
            continue
        lines.append(f"| `{r['asset']}` | {r['check']} | {'PASS' if r['ok'] else 'FAIL'} | {r['detail']} |")
    with open(os.path.join(REPO, 'work', 'art', 'check-report.md'), 'w') as f:
        f.write('\n'.join(lines) + '\n')
    for r in fails:
        print('FAIL', r['asset'], r['check'], r['detail'])
    print(f'{len(results)} checks, {len(fails)} failures')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
