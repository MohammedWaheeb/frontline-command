"""Prepare the approved ISR successor without changing any original export."""
from pathlib import Path
import copy
import hashlib
import json
import shutil

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[2]
OLD = REPO / 'work/art/aircraft-final-production-v3'
NEW = REPO / 'work/art/ir-isr-service-final-production-v1'
STRIKE = REPO / 'work/art/aircraft-strike-final-production-v1'
AID = 'unit.IR.isr'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())

scope_path = BASE / 'scope.json'
scope = read(scope_path)
proof_path = BASE / 'proof-v1.json'
proof = read(proof_path)
assert proof['failures'] == 0
assert (proof['unchanged_poses'], proof['changed_poses'], proof['reverse_resets']) == (9024, 96, 9120)
review_path = BASE / 'pilot-v1/native-review.json'
assert read(review_path)['accepted_bounded_pilot']
parent_path = REPO / 'work/art/ir-isr-service-root-review-v1/review.json'
parent = read(parent_path)
assert parent['accepted_bounded_pilot']
for relative, wanted in parent['input_sha256'].items():
    assert sha(REPO / relative) == wanted, relative
pilot_path = BASE / 'pilot-v1/result.json'
pilot = read(pilot_path)
assert pilot['failures'] == 0 and len(pilot['keys']) == 6
model = BASE / 'candidate-aircraft_roster.py'
assert sha(model) == proof['candidate_sha256'] == pilot['source_sha256'] == scope['candidate_sha256']
old_lock_path = OLD / 'production-lock.json'
assert sha(old_lock_path) == scope['source_lock_sha256']
old_lock = read(old_lock_path)
old_stage = REPO / old_lock['stage']
assert old_lock['model_sha256'] == proof['before_sha256']
for relative, wanted in old_lock['sources'].items():
    assert sha(old_stage / relative) == wanted, relative
assert pilot['helper_sha256'] == old_lock['sources']['assets/pipeline/blender/fclib.py']
spec_path = old_stage / 'assets/pipeline/specs' / (AID + '.json')
spec = read(spec_path)
assert sha(spec_path) == pilot['spec_sha256'] == scope['spec_sha256']
assert spec['canvas'] == pilot['canvas'] and spec['anchor'] == pilot['anchor']
source_row = next(r for r in proof['assets'] if r['id'] == AID)
assert len(source_row['changed_keys']) == 96 and source_row['ui_exact']

handoff_path = OLD / 'runtime-handoff' / (AID + '.json')
handoff = read(handoff_path)
assert handoff['model_sha256'] == old_lock['model_sha256']
assert handoff['spec_sha256'] == sha(spec_path) and handoff['state_pose_count'] == 512
for record in handoff['files'].values():
    p = REPO / record['source']
    assert p.stat().st_size == record['bytes'] and sha(p) == record['sha256'], p
for relative, wanted in handoff['checks'].items():
    assert sha(REPO / relative) == wanted, relative
original_review = OLD / 'contacts' / AID / 'native-review.json'
assert read(original_review)['accepted']
for prefix in ['check-', 'ui-check-']:
    assert read(OLD / (prefix + AID + '.json'))['failures'] == 0

files = {}
keys = set()
for state in spec['states']:
    if state['name'] == 'rearm':
        continue
    for direction in range(state['directions']):
        for frame in range(state['frames']):
            key = f"{state['name']}/d{direction:02d}_f{frame:02d}"
            assert key not in source_row['changed_keys']
            keys.add(key)
            for layer in state.get('layers', spec['passes']):
                p = old_stage / 'assets/build/frames' / AID / layer / (key + '.png')
                files[layer + '/' + key + '.png'] = {
                    'source': str(p.relative_to(REPO)), 'sha256': sha(p), 'bytes': p.stat().st_size,
                    'lineage': 'Current exact original completed non-service raw; unchanged evaluated appearance in full source proof.'}
assert len(keys) == 416
nonservice_keys = sorted(keys)
service = next(s for s in spec['states'] if s['name'] == 'rearm')
for key in pilot['keys']:
    assert key in source_row['changed_keys'] and key not in keys
    keys.add(key)
    for layer in service['layers']:
        relative = 'frames/' + layer + '/' + key + '.png'
        p = BASE / 'pilot-v1' / relative
        assert sha(p) == pilot['files'][relative]
        files[layer + '/' + key + '.png'] = {
            'source': str(p.relative_to(REPO)), 'sha256': sha(p), 'bytes': p.stat().st_size,
            'lineage': 'Reviewed candidate service pilot; identical source/spec/camera/lights/declared passes.'}
assert len(keys) == 422
row = {'id': AID, 'spec_sha256': sha(spec_path), 'poses': 422, 'files': files,
       'prior_native_review': str(original_review.relative_to(REPO)),
       'prior_native_review_sha256': sha(original_review)}
inputs = [scope_path, proof_path, review_path, parent_path, pilot_path, model,
          old_lock_path, handoff_path, original_review, BASE / 'pilot.py', Path(__file__)]
audit = {'scope': '416 original non-service raw tuples reused under exact evaluated preservation, plus6 same-config reviewed service pilot tuples.90 service tuples rendered fresh. Full metadata/pack/UI/check/native gates required. Original stage stays immutable.',
         'failures': 0, 'model_sha256': sha(model), 'helper_sha256': pilot['helper_sha256'],
         'rows': [row], 'proof_inputs': {str(p.relative_to(REPO)): sha(p) for p in inputs},
         'original_nonservice_keys': nonservice_keys, 'reviewed_service_keys': pilot['keys'],
         'pilot_render_config_equivalence': {
             'canvas_anchor_spec_exact': True,
             'lights': 'Same fclib.setup_lights(spec.get(sun_strength,3.3))',
             'render_passes': 'Same frozen fclib and exact declared state layers',
             'model_pose': 'Same candidate source and exact spec state/direction/frame',
             'full_export_metadata_regenerated': True,
             'fresh_ui_required': True, 'no_png_reencoding_during_reuse': True},
         'raw_identity_scope': 'Hashes snapshot existing original raw bytes now and are required again at seeding. Historical original raw hashes are not invented.'}

assert not NEW.exists(), 'Use a fresh independent stage; preserve previous attempts.'
NEW.mkdir()
stage = NEW / 'stage'
for relative in old_lock['sources']:
    target = stage / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(old_stage / relative, target)
shutil.copy2(model, stage / 'assets/pipeline/blender/models/aircraft_roster.py')
(NEW / 'raw-reuse-audit.json').write_text(json.dumps(audit, indent=2) + '\n')
for name in ['preflight.py', 'check-one.py', 'ui-and-contacts.py', 'run-staged.sh', 'make-runtime-handoff.py']:
    text = (OLD / name).read_text().replace(str(OLD.relative_to(REPO)), str(NEW.relative_to(REPO)))
    (NEW / name).write_text(text.replace('pilot-reuse-audit.json', 'raw-reuse-audit.json'))
seed = (STRIKE / 'seed-pilot.py').read_text().replace('FC_STRIKE_ACCEPTED_REUSE', 'FC_ISR_ACCEPTED_REUSE')
(NEW / 'seed-pilot.py').write_text(seed)
lock = copy.deepcopy(old_lock)
lock.update(scope='Fresh isolated ISR service readability successor; all original exports preserved. No live publication.',
            stage=str(stage.relative_to(REPO)), assets=[AID], model_sha256=sha(model),
            reuse_audit_sha256=sha(NEW / 'raw-reuse-audit.json'))
lock['sources']['assets/pipeline/blender/models/aircraft_roster.py'] = sha(model)
lock['drivers'] = {str((NEW / n).relative_to(REPO)): sha(NEW / n) for n in
                   ['preflight.py', 'check-one.py', 'run-staged.sh', 'seed-pilot.py', 'ui-and-contacts.py', 'make-runtime-handoff.py']}
lock['isr_service_amendment'] = {
    'prior_lock': str(old_lock_path.relative_to(REPO)), 'prior_lock_sha256': sha(old_lock_path),
    'original_handoff': str(handoff_path.relative_to(REPO)), 'original_handoff_sha256': sha(handoff_path),
    'proof': str(proof_path.relative_to(REPO)), 'parent_review': str(parent_path.relative_to(REPO)),
    'affected_poses': 96, 'unaffected_original_poses': 416, 'pilot_reused_poses': 6, 'fresh_poses': 90,
    'author': 'Original Codex aircraft model under quota fallback; exact Claude family review requested stronger ISR service cue. Codex bounded service-rig reuse and pipeline operation; shared fclib originally Claude authored.',
    'only_added_parts': source_row['added_objects'], 'owner_foreign_runtime_changes': False}
(NEW / 'production-lock.json').write_text(json.dumps(lock, indent=2) + '\n')
(NEW / 'README.md').write_text('# ISR service readability successor\n\nPrivate full512-pose successor:416 exact original non-service tuples,6 accepted candidate pilot tuples,90 fresh service tuples. Fresh UI, metadata/editable blend, full packing/checks and native review are required. Original source/raw/atlases/handoff stay immutable; no live publication.\n')
print('FC_ISR_SUCCESSOR_READY', sha(NEW / 'production-lock.json'), len(files))
