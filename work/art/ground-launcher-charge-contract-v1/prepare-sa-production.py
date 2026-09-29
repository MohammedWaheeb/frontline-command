"""Prepare one immutable SA stage from accepted source/pilot, no render or publication."""
from pathlib import Path
import copy, hashlib, json, shutil

B = Path(__file__).resolve().parent
R = B.parents[2]
C = B / 'sa-empty-candidate-v2'
OLD = B / 'production-v2'
O = B / 'production-sa-v1'
S = O / 'stage'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
dump = lambda p, j: p.write_text(json.dumps(j, indent=2) + '\n')
proof = json.loads((C / 'source-proof-v4.json').read_text())
clear = json.loads((C / 'clearance-v2.json').read_text())
review = json.loads((C / 'pilot-v1/native-review.json').read_text())
parent = json.loads((C / 'parent-native-approval.json').read_text())
assert proof['failures'] == clear['failures'] == 0
assert review['accepted_bounded_readability_pilot']
assert sha(C / 'candidate-vehicle_roster.py') == proof['source_sha256'] == parent['source_sha256']
for rel, want in parent['images'].items():
    assert sha(R / rel) == want
assert not O.exists(), 'Preserve prior production stages'
S.mkdir(parents=True)
sources, provenance = {}, {}

def put(source, rel):
    p = S / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, p)
    assert sha(source) == sha(p)
    sources[rel] = sha(p)
    provenance[rel] = {'path': str(source.relative_to(R)), 'sha256': sha(source)}

old_lock = json.loads((OLD / 'stage/work/art/vehicle-production/production-lock.json').read_text())
for rel, want in old_lock['sources'].items():
    p = OLD / 'stage' / rel
    assert sha(p) == want
    if rel.startswith('assets/pipeline/specs/') or rel in ['assets/pipeline/blender/models/vehicle_roster.py', 'assets/manifest/asset-manifest.json']:
        continue
    put(p, rel)
put(C / 'candidate-vehicle_roster.py', 'assets/pipeline/blender/models/vehicle_roster.py')
aid = 'unit.SA.launcher'
specpath = B / 'candidate-v1/specs' / (aid + '.json')
spec = json.loads(specpath.read_text())
put(specpath, 'assets/pipeline/specs/' + specpath.name)
states = {s['name']: s for s in spec['states']}
assert sum(s['directions'] * s['frames'] for s in states.values()) == 688

# Only this private manifest's explicit state/count fields are changed.
old_manifest_path = OLD / 'stage/assets/manifest/asset-manifest.json'
manifest_before = json.loads(old_manifest_path.read_text())
manifest = copy.deepcopy(manifest_before)
entry = next(x for x in manifest['entries'] if x['id'] == aid)
entry['spec']['states'], entry['spec']['total_poses'] = spec['states'], 688
for before, after in zip(manifest_before['entries'], manifest['entries']):
    restored = copy.deepcopy(after)
    if before['id'] == aid:
        for key in ['states', 'total_poses']:
            if key in before['spec']:
                restored['spec'][key] = before['spec'][key]
            else:
                restored['spec'].pop(key, None)
    assert before == restored
m = S / 'assets/manifest/asset-manifest.json'
m.parent.mkdir(parents=True)
dump(m, manifest)
sources[str(m.relative_to(S))] = sha(m)

render = json.loads((C / 'pilot-v1/render.json').read_text())
raw, reused, tuple_sources = S / 'assets/build/frames' / aid, {}, {}
for row in render['records']:
    # The four old ready_empty poses are deliberately changed by this candidate.
    if row['folder'] == 'before' and row['key'].startswith('ready_empty/'):
        continue
    assert row['key'] not in tuple_sources
    tuple_sources[row['key']] = row['folder']
    for rel, want in row['files'].items():
        source = C / 'pilot-v1' / rel
        assert sha(source) == want
        key = '/'.join(Path(rel).parts[1:])
        target = raw / key
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        assert sha(target) == want
        reused[key] = {'sha256': want, 'source': str(source.relative_to(R)), 'lineage': 'Exact accepted candidate pilot' if row['folder'] == 'candidate' else 'Exact generic source pose under full semantic proof; ready_empty excluded'}
assert len(tuple_sources) == 64
for key in tuple_sources:
    assert sum(k.endswith('/' + key + '.png') for k in reused) == len(states[key.split('/')[0]].get('layers', spec['passes']))
rp = S / 'work/reuse' / (aid + '.json')
rp.parent.mkdir(parents=True)
receipts = [C / name for name in ['source-proof-v4.json', 'clearance-v2.json', 'parent-native-approval.json', 'pilot-v1/render.json', 'pilot-v1/check.json', 'pilot-v1/native-review.json']]
dump(rp, {'id': aid, 'model_sha256': proof['source_sha256'], 'spec_sha256': sha(specpath), 'files': reused, 'poses': 64, 'source_proof_sha256': sha(C / 'source-proof-v4.json'), 'input_receipts': {str(p.relative_to(R)): sha(p) for p in receipts}, 'scope': '32 accepted candidate poses +32 exact generic reference poses. Frozen camera/anchor/spec/layers/fclib/light settings match; only copied PNGs are reused. Original ready_empty refs excluded.'})

family = S / 'work/art/vehicle-production'
lock = {'assets': [aid], 'sources': sources, 'scope': 'Private parent-approved full SA spent-shell export only, no live publication.', 'source_proof_sha256': sha(C / 'source-proof-v4.json'), 'candidate_model_sha256': proof['source_sha256']}
dump(family / 'production-lock.json', lock)
dump(O / 'parent-native-approval.json', {'accepted_assets': [aid], 'excluded_assets': [], 'inspected_native_images': parent['images'], 'source_receipt': str((C / 'parent-native-approval.json').relative_to(R)), 'source_receipt_sha256': sha(C / 'parent-native-approval.json'), 'scope': parent['approved']})
dump(O / 'preparation.json', {'stage': str(S.relative_to(R)), 'model_sha256': proof['source_sha256'], 'source_provenance': provenance, 'production_lock_sha256': sha(family / 'production-lock.json'), 'assets': [{'id': aid, 'poses': 688, 'reused_poses': 64, 'fresh_poses': 624, 'reuse_sha256': sha(rp)}], 'manifest_original_sha256': sha(old_manifest_path), 'manifest_stage_sha256': sha(m), 'manifest_changed_fields': {aid: ['spec.states', 'spec.total_poses']}, 'author_attribution': 'Original Claude vehicle, Codex quota-fallback charge variants, exact Claude SA U-shell correction, Codex proof/export operation; no global authorship replacement.', 'scope': lock['scope']})
for name in ['preflight.py', 'run.sh', 'make-handoff.py']:
    text = (OLD / name).read_text().replace('production-v2', 'production-sa-v1')
    if name == 'make-handoff.py':
        text = text.replace('Private completed US/IR/SY charge exports only, no live promotion. SA excluded.', 'Private completed SA spent-shell export only, no live promotion.')
        text = text.replace('Original Claude chassis/model with bounded Codex charge-state correction and pipeline operation.', 'Original Claude chassis/model, bounded Codex charge variants, exact Claude spent-shell correction and Codex pipeline operation.')
        text = text.replace('Generic IR raw poses and accepted partial pilot preserved exactly.', 'Prior generic SA and failed cap-only pilot preserved exactly.')
    (O / name).write_text(text)
dump(O / 'driver-lock.json', {'files': {name: sha(O / name) for name in ['preflight.py', 'run.sh', 'make-handoff.py']}, 'scope': 'Same accepted frozen export/check pipeline with explicit new SA-only stage paths and truthful handoff wording.'})
print('FC_SA_FULL_STAGE_PREPARED', 688, 64, 624)
