"""Freeze unchanged current consumer and exact private53 UI inputs. No browser."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import argparse, json, shutil, sys
from PIL import Image
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SOURCE = ROOT / 'work/art/ui-team-normalization-audit-v1/normalized-current53-v1/result.json'
EXPECTED = '2131210ccd1bfbe8a54dbb950629c19e964bead726f96249ea1bde7112fc36e6'
p = argparse.ArgumentParser(); p.add_argument('name'); args = p.parse_args()
assert args.name.startswith('prepared-') and '/' not in args.name
OUT = HERE / args.name; OUT.mkdir()
def digest(path):
    h = sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''): h.update(chunk)
    return h.hexdigest()
def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + '\n')
report = {'status': 'preparing', 'started': datetime.now(timezone.utc).isoformat(), 'browserRun': False}
inputs, routes, numerical = {}, {}, []
try:
    assert digest(SOURCE) == EXPECTED
    audit = json.loads(SOURCE.read_text()); inputs[str(SOURCE.relative_to(ROOT))] = EXPECTED
    assert len(audit['files']) == 212 and not audit['failures']
    assert sum(bool(x['reused_exact_prior_derivative']) for x in audit['files']) == 132
    handoffs = {}
    for row in audit['handoffs']:
        path = ROOT / row['path']; assert digest(path) == row['sha256']; inputs[row['path']] = row['sha256']
        handoffs[row['id']] = json.loads(path.read_text())
    for name, expected in audit['protected_original_sha256'].items():
        assert digest(ROOT / name) == expected, name
    report['protectedOriginalsExactBefore'] = len(audit['protected_original_sha256'])
    roles = []
    for id, handoff in handoffs.items():
        entries = [x for x in audit['files'] if x['id'] == id]
        assert len(entries) == 4
        key = entries[0]['destination'].split('/')[-1].split('@')[0]
        roles.append({'id': id, 'key': key, 'group': 'reused' if all(x['reused_exact_prior_derivative'] for x in entries) else 'new-or-replacement'})
        for entry in entries:
            dest = entry['destination']; original = ROOT / entry['original_source']; candidate = ROOT / entry['candidate']
            assert digest(original) == entry['original_sha256'] and digest(candidate) == entry['candidate_sha256']
            raw = np.array(Image.open(original).convert('RGBA')); norm = np.array(Image.open(candidate).convert('RGBA'))
            assert raw.shape == norm.shape
            alpha = int(np.count_nonzero(raw[:, :, 3] != norm[:, :, 3]))
            transparent_rgb = int(np.count_nonzero(np.any(raw != norm, axis=2) & (raw[:, :, 3] == 0)))
            coverage = int(np.count_nonzero((raw[:, :, 3] > 0) != (norm[:, :, 3] > 0)))
            gray = int(np.count_nonzero((norm[:, :, 0] != norm[:, :, 1]) | (norm[:, :, 1] != norm[:, :, 2])))
            assert alpha == coverage == gray == 0, dest
            numerical.append({'id': id, 'destination': dest, 'reused': entry['reused_exact_prior_derivative'], 'alphaChanges': alpha, 'coverageChanges': coverage, 'transparentRGBChanges': transparent_rgb, 'nonGrayPixels': gray, 'width': raw.shape[1], 'height': raw.shape[0]})
            beauty = handoff['files'][dest.replace('.team.', '.beauty.')]
            assert digest(ROOT / beauty['source']) == beauty['sha256']
            for mode in ['raw', 'normalized']:
                for layer in ['beauty', 'team']:
                    source = beauty['source'] if layer == 'beauty' else entry['original_source'] if mode == 'raw' else entry['candidate']
                    expected = beauty['sha256'] if layer == 'beauty' else entry['original_sha256'] if mode == 'raw' else entry['candidate_sha256']
                    inputs[source] = expected
                    canonical = '/art/' + dest.replace('.team.', '.' + layer + '.')
                    routes['/generation/' + mode + canonical] = {'source': source, 'sha256': expected, 'bytes': (ROOT / source).stat().st_size, 'canonical': canonical}
    assert len(roles) == 53 and sum(r['group'] == 'new-or-replacement' for r in roles) == 20
    tokens = ROOT / 'client/src/design/tokens.json'; inputs[str(tokens.relative_to(ROOT))] = digest(tokens)
    palettes = json.loads(tokens.read_text())['color']['team']
    def luminance(value):
        rgb = [int(value[i:i+2], 16) / 255 for i in (1, 3, 5)]
        rgb = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb]
        return sum(a*b for a, b in zip([.2126, .7152, .0722], rgb))
    colors = [{'palette': palette, 'bound': bound, 'hex': fun(palettes[palette], key=luminance)} for palette in ['standard', 'cvd_safe'] for bound, fun in [('darkest', min), ('lightest', max)]]
    # Source snapshot has no node_modules, generated art or edited product input.
    shutil.copytree(ROOT / 'client/src', OUT / 'source/client/src')
    source_pins = {str(x.relative_to(OUT)): digest(x) for x in sorted((OUT / 'source').rglob('*')) if x.is_file()}
    for mode in ['raw', 'normalized']:
        id = 'ui53-' + mode; version = 'audit-' + EXPECTED[:16]
        index = {'format_version': 1, 'version': version, 'packs': [{'id': id, 'version': version, 'manifest_url': '/assets/packs/base.json'}], 'maps': [], 'missions': []}
        art = {'format': 1, 'sprites': {}, 'terrain': [], 'portraits': [x['key'] for x in roles], 'buildIcons': [x['key'] for x in roles], 'chrome': [], 'icons': False, 'emblems': False}
        folder = OUT / 'metadata' / mode
        for name, value in [('content/index.json', index), ('art/index.json', art)]:
            target = folder / name; write(target, value)
            routes['/generation/' + mode + '/' + name] = {'prepared': str(target.relative_to(OUT)), 'sha256': digest(target), 'bytes': target.stat().st_size, 'canonical': '/' + name}
        files = [{'path': value['canonical'], 'sha256': value['sha256'], 'bytes': value['bytes']} for name, value in sorted(routes.items()) if name.startswith('/generation/' + mode + '/')]
        manifest = folder / 'assets/packs/base.json'; write(manifest, {'id': id, 'version': version, 'files': files})
        routes['/generation/' + mode + '/assets/packs/base.json'] = {'prepared': str(manifest.relative_to(OUT)), 'sha256': digest(manifest), 'bytes': manifest.stat().st_size, 'canonical': '/assets/packs/base.json'}
    write(OUT / 'config.json', {'roles': sorted(roles, key=lambda x: (x['group'] == 'reused', x['id'])), 'colors': colors, 'maskCount': 212, 'runtimeMaskCount': 106, 'numerical': numerical})
    write(OUT / 'routes.json', routes)
    shutil.copy2(HERE / 'fixture.ts', OUT / 'fixture.ts')
    source_pins['fixture.ts'] = digest(OUT / 'fixture.ts')
    report.update(status='prepared', finished=datetime.now(timezone.utc).isoformat(), inputReceiptSHA256=EXPECTED, sourcePins=source_pins, inputs=inputs, routesSHA256=digest(OUT/'routes.json'), configSHA256=digest(OUT/'config.json'), numericalMasks=len(numerical), newMasks=80, reusedMasks=132, python=sys.executable, helperSHA256=digest(Path(__file__)), scope='Exact unchanged current53 UI mask derivatives and original beauty; current production consumer frozen. All212 source-mask numerical invariants; browser/compositing unrun.')
except BaseException as error:
    report.update(status='failed', failure=repr(error)); raise
finally:
    write(OUT / 'preparation.json', report)
print(json.dumps({'out': str(OUT), 'status': report['status'], 'sourceFiles': len(report.get('sourcePins', {})), 'inputs': len(inputs), 'numericalMasks': len(numerical)}))
