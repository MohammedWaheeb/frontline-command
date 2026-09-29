"""Read-only exact graph/raw lineage audit; do not fabricate new export gates."""
from pathlib import Path
import hashlib
import json
import re

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda name: json.loads((REPO / name).read_text())
catalog_path = 'work/art/roster-runtime-overlay-v1/catalog-v54-v1/result.json'
catalog = read(catalog_path)
base = REPO / 'work/art/effects-opus-v2/integration-v25/product/art'
index = json.loads((base / 'index.json').read_text())
ink_path = 'work/art/sprite-ink-bounds/promotion-v1/published.json'
ink = {r['id']: r for r in read(ink_path)['assets'] if r['label'] == 'shipping'}
raw_path = 'work/art/sprite-ink-bounds/promotion-v1/raw-before.json'
raw_receipt = read(raw_path)
props_lock = read('work/art/environment-roster/prop-source-lock.json')['sources']
logistics_lock = read('work/art/logistics/source-lock.json')['sha256']
building_reviews = {x['id']: x for x in read('work/art/building-roster/production-visual-review.json')['assets']}
prop_reviews = read('work/art/environment-roster/production-visual-review.json')
sources = {
    'building_original': ('work/art/repair-arm-pilot/before-building_roster.py', '2a02082931443050f811e892bf64e1628f416239cae45cf90a9d43b469fcd39e'),
    'building_repair': ('work/art/repair-arm-pilot/candidate-building_roster.py', 'a905465687806e58bc1dabbfa5f770111b0b040288dc3c3417e2f5aa98a34c56'),
    'building_battery': ('work/art/interceptor-structural-charge-pilot/candidate-building_roster.py', '1d31749c5fef5db0f8c1b1ad1ae6340593352082a0304a8a76d32b53d9a73867'),
}
for path, want in sources.values():
    assert sha(REPO / path) == want, path
records = []
failures = []
for aid in catalog['reference_graph_inventory']['base_only_ids']:
    spec_path = REPO / 'assets/pipeline/specs' / (aid + '.json')
    spec = json.loads(spec_path.read_text())
    side_path = base / index['sprites'][aid]
    side = json.loads(side_path.read_text())
    keys = {index['sprites'][aid]}
    for layers in side['atlases'].values():
        for names in layers.values():
            for name in names:
                rel = f'sprites/{aid}/{name}'
                page = json.loads((base / rel).read_text())
                keys.update([rel, f"sprites/{aid}/{page['meta']['image']}"])
    png_json = {}
    for key in sorted(keys):
        current = REPO / 'assets/build' / key
        original = base / key
        digest = sha(original)
        live_same = current.exists() and sha(current) == digest
        ink_same = ink.get(aid, {}).get('after_sha256', {}).get(Path(key).name) == digest
        png_json[key] = {'sha256': digest, 'bytes': original.stat().st_size,
                         'current_live_exact': live_same, 'ink_publication_exact': ink_same}
        if not live_same or not ink_same:
            failures.append({'id': aid, 'file': key, 'live_exact': live_same, 'ink_exact': ink_same})
    ui_keys = []
    if not aid.startswith('prop.'):
        role = side['role_id']
        candidates = [role, aid]
        for field, folder in [('portraits', 'portraits'), ('buildIcons', 'icons/build')]:
            matched = [k for k in candidates if k in index[field]]
            assert len(set(matched)) == 1, (aid, field, matched)
            key = matched[0]
            for scale in ['1x', '2x']:
                for layer in ['beauty', 'team']:
                    rel = f'ui/{folder}/{key}@{scale}.{layer}.png'
                    p = base / rel
                    assert p.exists(), rel
                    current = REPO / 'assets/build' / rel
                    same = current.exists() and sha(current) == sha(p)
                    ui_keys.append({'path': rel, 'sha256': sha(p), 'bytes': p.stat().st_size,
                                    'current_live_exact': same})
                    if not same:
                        failures.append({'id': aid, 'ui_changed': rel})
    raw_records = {p: want for p, want in raw_receipt.items()
                   if p.startswith(f'assets/build/frames/{aid}/')}
    raw_bad = [p for p, want in raw_records.items() if not (REPO / p).exists() or sha(REPO / p) != want]
    if raw_bad:
        failures.append({'id': aid, 'raw_identity_mismatches': raw_bad})
    pose_count = sum(s['directions'] * s['frames'] for s in spec['states'])
    state_exact = side['states'] == spec['states'] and side['frame_count'] == pose_count
    if not state_exact:
        failures.append({'id': aid, 'spec_sidecar_state_mismatch': True})
    notes = []
    if aid.startswith('building.'):
        kind = 'building_battery' if aid.endswith('.interceptor_battery') else 'building_repair' if aid.endswith('.repair_depot') else 'building_original'
        model_path, model_hash = sources[kind]
        check = f'work/art/building-roster/check-{aid}.json'
        ui_check = f'work/art/building-roster/ui-check-{aid}.md'
        visual = building_reviews.get(aid)
        notes.append('Historical building source version is preserved separately; current f69e source is not relabeled as the renderer of these old pixels.')
    elif aid.startswith('unit.'):
        model_path = f"assets/pipeline/blender/models/{spec['model']}.py"
        model_hash = logistics_lock[model_path]
        assert sha(REPO / model_path) == model_hash
        assert sha(spec_path) == logistics_lock[str(spec_path.relative_to(REPO))]
        check = f'work/art/alpha-resize-audit/check-{aid}.json'
        ui_check = f'work/art/logistics/ui-check-{aid}.md'
        visual = {'original': 'work/art/logistics/contract-report.json',
                  'derivative': 'work/art/alpha-resize-audit/historical-repack-result.json'}
        notes.append('Original logistics lock pins model/spec but not all render-era helper files. Do not assert the newer transparent-team helper rendered these frames.')
    else:
        model_path = f"assets/pipeline/blender/models/{spec['model']}.py"
        model_hash = sha(REPO / model_path)
        if spec['model'] == 'environment_roster':
            assert model_hash == props_lock[model_path]
            assert sha(spec_path) == props_lock[str(spec_path.relative_to(REPO))]
            check = f'work/art/environment-roster/production-check-{aid}.json'
            visual = prop_reviews.get(aid)
        else:
            check = f'work/art/alpha-resize-audit/check-{aid}.json'
            visual = {'derivative': 'work/art/alpha-resize-audit/historical-repack-result.json'}
            notes.append('Five original prop model identities need their older source snapshot traced before a new fully source-pinned handoff; current hash alone is not historical proof.')
        ui_check = None
        notes.append('Props have no indexed portrait/build UI requirement. Current catalog overlay-v3 always requires eight UI files, so its handoff schema must not be satisfied with invented prop images.')
    check_data = read(check)
    assert check_data['failures'] == 0, check
    if ui_check:
        body = (REPO / ui_check).read_text()
        assert '0 failures' in body or '| FAIL |' not in body
    records.append({'id': aid, 'poses': pose_count, 'sprite_files': png_json,
                    'ui_files': ui_keys, 'spec': str(spec_path.relative_to(REPO)),
                    'spec_sha256': sha(spec_path), 'spec_sidecar_states_exact': state_exact,
                    'preserved_model': model_path, 'model_sha256': model_hash,
                    'raw_files_sha_verified_against_ink_baseline': len(raw_records),
                    'raw_mismatches': raw_bad,
                    'historical_check': {'path': check, 'sha256': sha(REPO / check),
                                         'checks': check_data['checks'], 'failures': 0},
                    'historical_ui_check': {'path': ui_check, 'sha256': sha(REPO / ui_check)} if ui_check else None,
                    'historical_visual_record': visual, 'source_lineage_limits': notes})
result = {'scope': 'Read-only current-byte and historical receipt audit of 48 base-only assets. No new rendering, per-asset native visual acceptance, checker execution, helper attribution, handoff or publication.',
          'inputs': {p: sha(REPO / p) for p in [catalog_path, ink_path, raw_path]},
          'assets': records, 'failures': failures,
          'totals': {'assets': len(records), 'poses': sum(r['poses'] for r in records),
                     'sprite_files': sum(len(r['sprite_files']) for r in records),
                     'ui_files': sum(len(r['ui_files']) for r in records),
                     'raw_files_verified': sum(r['raw_files_sha_verified_against_ink_baseline'] for r in records)},
          'script_sha256': sha(Path(__file__))}
target = HERE / 'result.json'
assert not target.exists()
target.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'totals': result['totals'], 'failure_count': len(failures)}))
