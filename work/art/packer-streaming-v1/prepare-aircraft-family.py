"""Prepare a separate future aircraft family; never amend completed handoffs."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
OLD = REPO / 'work/art/aircraft-final-production-v2'
NEW = REPO / 'work/art/aircraft-final-production-v3'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
rel = lambda p: str(p.relative_to(REPO))
dump = lambda p, value: p.write_text(json.dumps(value, indent=2) + '\n')
assert not NEW.exists(), 'Never overwrite an existing stage'
old_lock_path = OLD / 'production-lock.json'
old_lock = json.loads(old_lock_path.read_text())
old_stage = REPO / old_lock['stage']
for p, want in old_lock['sources'].items():
    assert sha(old_stage / p) == want, p
for p, want in old_lock['drivers'].items():
    assert sha(REPO / p) == want, p
done = (OLD / 'completed-assets.txt').read_text().splitlines()
assert set(done) == {'unit.US.fighter', 'unit.US.airlift', 'unit.US.gunship'}
assert (OLD / 'runtime-handoff/unit.US.gunship.json').is_file()
remaining = [a for a in old_lock['assets'] if a not in done]
assert len(remaining) == 8
proof = json.loads((HERE / 'result.json').read_text())
assert proof['failures'] == 0 and proof['file_comparisons'] == 376
candidate = HERE / 'candidate/pack_sprites.py'
assert sha(candidate) == proof['candidate_sha256']
tool = 'assets/pipeline/tools/pack_sprites.py'
assert old_lock['sources'][tool] == proof['baseline_sha256']

stage = NEW / 'stage'
stage.mkdir(parents=True)
for p in old_lock['sources']:
    target = stage / p
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(old_stage / p, target)
shutil.copy2(candidate, stage / tool)
drivers = {}
for old_path in old_lock['drivers']:
    source = REPO / old_path
    target = NEW / source.name
    # Path-only driver relocation; algorithms and gates remain unchanged.
    text = source.read_text().replace('work/art/aircraft-final-production-v2', rel(NEW))
    target.write_text(text)
    assert target.read_text().replace(rel(NEW), 'work/art/aircraft-final-production-v2') == source.read_text()
    drivers[rel(target)] = sha(target)
for name in ['pilot-reuse-audit.json', 'make-runtime-handoff.py', 'progress.py']:
    shutil.copy2(OLD / name, NEW / name)
evidence = NEW / 'evidence/streaming-amendment'
evidence.mkdir(parents=True)
for name in ['production-lock.json', 'pilot-reuse-audit.json']:
    shutil.copy2(OLD / name, evidence / ('old-' + name))
shutil.copy2(old_stage / tool, evidence / 'old-pack_sprites.py')
for name in ['result.json', 'source-lock.json', 'candidate.diff', 'parent-acceptance.json']:
    shutil.copy2(HERE / name, evidence / name)
old_handoffs = {rel(p): sha(p) for p in sorted((OLD / 'runtime-handoff').glob('*.json'))}

lock = json.loads(json.dumps(old_lock))
lock['scope'] = 'New eight-aircraft private production family; accepted streaming memory optimization only. Completed v2 artifacts and locks remain immutable.'
lock['stage'] = rel(stage)
lock['assets'] = remaining
lock['sources'][tool] = sha(candidate)
lock['drivers'] = drivers
lock['streaming_amendment'] = {
    'source_family': rel(OLD), 'source_lock_sha256': sha(old_lock_path),
    'original_pack_helper_sha256': old_lock['sources'][tool],
    'new_pack_helper_sha256': sha(candidate),
    'exact_complete_output_proof': rel(HERE / 'result.json'),
    'exact_complete_output_proof_sha256': sha(HERE / 'result.json'),
    'completed_assets_excluded': done, 'no_old_stage_or_handoff_mutation': True}
dump(NEW / 'production-lock.json', lock)
for p, want in old_lock['sources'].items():
    if p != tool:
        assert sha(stage / p) == want, p
assert sha(old_lock_path) == lock['streaming_amendment']['source_lock_sha256']
for p, want in old_handoffs.items():
    assert sha(REPO / p) == want
receipt = {'scope': lock['scope'], 'source_files': len(old_lock['sources']),
    'only_stage_source_change': tool, 'driver_changes': 'Exact old family path replaced with new family path only',
    'remaining_assets': remaining,
    'remaining_pose_count': sum(sum(s['directions'] * s['frames'] for s in json.loads((stage / 'assets/pipeline/specs' / (aid + '.json')).read_text())['states']) for aid in remaining),
    'old_handoff_files': old_handoffs, 'new_lock_sha256': sha(NEW / 'production-lock.json'),
    'all_models_specs_manifest_render_helpers_and_reuse_audit_exact': True,
    'no_frames_or_exports_copied_or_rendered': True}
dump(evidence / 'amendment.json', receipt)
(NEW / 'README.md').write_text('# Remaining aircraft, separate streaming family\n\n'
    'This prepared family contains eight approved unchanged aircraft models and specs (6,448 poses). '
    'The completed fighter, airlift and US gunship exports remain in their immutable prior families. '
    'The only staged source change is the byte-equivalent streaming packer; driver changes only relocate their family path. '
    'No old handoff lock is amended, no model or manifest field changes, and no frame has been rendered by preparation.\n\n'
    'Use the sole Blender worker after the approved launcher queue. Run one whole asset, retain normal pixel/UI/native checks, '
    'then create its diagnostic runtime handoff. This preparation is not full-roster or actual-game acceptance.\n')
subprocess.run(['python3', str(NEW / 'preflight.py'), *remaining], cwd=REPO, check=True)
print('FC_STREAMING_AIRCRAFT_FAMILY_PREPARED', len(remaining), receipt['remaining_pose_count'])
