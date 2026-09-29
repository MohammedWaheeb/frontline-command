"""Create a new approved launcher stage with the byte-equivalent streaming packer.

Run only after the frozen US gunship pack closes. The original prepared stage
and all completed exports remain unchanged; this is not a live tool promotion.
"""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[2]
OLD = BASE / 'production-v1'
NEW = BASE / 'production-v2'
PROOF = REPO / 'work/art/packer-streaming-v1'
TOOL = 'assets/pipeline/tools/pack_sprites.py'
LOCK = 'stage/work/art/vehicle-production/production-lock.json'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
rel = lambda p: str(p.relative_to(REPO))

def dump(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')

def inventory(root):
    return {str(p.relative_to(root)): sha(p) for p in sorted(root.rglob('*'))
            if p.is_file() and '__pycache__' not in p.parts}

assert not NEW.exists(), 'Refuse to overwrite any prior stage'
gunship = REPO / 'work/art/aircraft-final-production-v2'
assert (gunship / 'pack-unit.US.gunship.log').exists()
assert (gunship / 'check-unit.US.gunship.json').exists(), 'Wait for frozen pack/check boundary'
assert json.loads((gunship / 'check-unit.US.gunship.json').read_text())['failures'] == 0
processes = subprocess.check_output(['ps', '-axo', 'command'], text=True)
assert not any('pack_sprites.py unit.US.gunship' in line for line in processes.splitlines()), 'Frozen pack is active'

proof = json.loads((PROOF / 'result.json').read_text())
assert proof['failures'] == 0 and proof['file_comparisons'] == 376
candidate = PROOF / 'candidate/pack_sprites.py'
assert sha(candidate) == proof['candidate_sha256']
assert sha(OLD / 'stage' / TOOL) == proof['baseline_sha256']
for helper in ['shadow_alpha.py', 'sprite_ink_bounds.py']:
    assert sha(OLD / 'stage/assets/pipeline/tools' / helper) == sha(PROOF / 'candidate' / helper)
old_inventory = inventory(OLD)
shutil.copytree(OLD, NEW, ignore=shutil.ignore_patterns('__pycache__'))
evidence = NEW / 'evidence/streaming-amendment'
evidence.mkdir(parents=True)
dump(evidence / 'original-stage-files.json', old_inventory)
for name in ['preparation.json', 'driver-lock.json', 'README.md', 'run.sh']:
    shutil.copy2(OLD / name, evidence / name)
shutil.copy2(OLD / LOCK, evidence / 'original-production-lock.json')
shutil.copy2(OLD / 'stage' / TOOL, evidence / 'original-pack_sprites.py')
for name in ['result.json', 'source-lock.json', 'candidate.diff']:
    shutil.copy2(PROOF / name, evidence / name)
shutil.copy2(candidate, NEW / 'stage' / TOOL)

lock = json.loads((NEW / LOCK).read_text())
lock['sources'][TOOL] = sha(candidate)
lock['scope'] = 'Parent-approved private US/IR/SY charge-state exports; SA excluded. New streaming packer stage, no live promotion.'
dump(NEW / LOCK, lock)
prep = json.loads((NEW / 'preparation.json').read_text())
prep['stage'] = rel(NEW / 'stage')
prep['scope'] = lock['scope']
prep['source_provenance'][TOOL] = {'path': rel(candidate), 'sha256': sha(candidate)}
prep['production_lock_sha256'] = sha(NEW / LOCK)
prep['amends_prepared_stage'] = {'path': rel(OLD), 'preparation_sha256': sha(OLD / 'preparation.json')}
prep['streaming_proof'] = {'path': rel(PROOF / 'result.json'), 'sha256': sha(PROOF / 'result.json'), 'file_comparisons': 376}
dump(NEW / 'preparation.json', prep)
script = (NEW / 'run.sh').read_text()
assert script.count('fc_base=' + rel(OLD)) == 1
(NEW / 'run.sh').write_text(script.replace('fc_base=' + rel(OLD), 'fc_base=' + rel(NEW)))
(NEW / 'README.md').write_text('# Three-launcher charge exports, streaming stage v2\n\n'
    'This sibling stage retains the approved model, specs, manifest, raw reuse and native pilot receipts from production-v1. '
    'Only the packing helper changes to the accepted memory optimization. All 376 reference output files were byte exact. '
    'The original stage is immutable; there is no live tool or asset publication.\n\n'
    'Run one asset with `zsh ' + rel(NEW / 'run.sh') + ' unit.IR.launcher`, then perform native review before handoff. '
    'US and SY follow; SA remains visually rejected and is excluded.\n\n'
    'Complete source inventory, old helper/locks, exact changes and proof hashes are under `evidence/streaming-amendment/`. '
    'Memory samples are shared-host measurements, not a guaranteed peak or visual acceptance.\n')
driver_paths = ['preparation.json', 'parent-native-approval.json', 'preflight.py', 'run.sh', 'make-handoff.py']
dump(NEW / 'driver-lock.json', {'scope': lock['scope'], 'files': {rel(NEW / p): sha(NEW / p) for p in driver_paths}})

assert inventory(OLD) == old_inventory, 'Original stage changed'
allowed = {TOOL, 'work/art/vehicle-production/production-lock.json'}
old_stage = inventory(OLD / 'stage')
new_stage = inventory(NEW / 'stage')
assert set(old_stage) == set(new_stage)
changed = [p for p in old_stage if old_stage[p] != new_stage[p]]
assert set(changed) == allowed, changed
old_lock = json.loads((OLD / LOCK).read_text())
for p, value in old_lock['sources'].items():
    if p != TOOL:
        assert lock['sources'][p] == value and sha(NEW / 'stage' / p) == value, p
assert prep['assets'] == json.loads((OLD / 'preparation.json').read_text())['assets']
receipt = {'scope': lock['scope'], 'old_stage': rel(OLD), 'new_stage': rel(NEW),
           'old_stage_unchanged': True, 'stage_files_compared': len(old_stage),
           'stage_changed_files': {p: {'before': old_stage[p], 'after': new_stage[p]} for p in changed},
           'model_specs_manifest_reuse_and_all_other_stage_bytes_exact': True,
           'proof_sha256': sha(PROOF / 'result.json'), 'candidate_sha256': sha(candidate),
           'preparation_sha256': sha(NEW / 'preparation.json'), 'driver_lock_sha256': sha(NEW / 'driver-lock.json')}
dump(evidence / 'amendment.json', receipt)
subprocess.run(['python3', str(NEW / 'preflight.py'), *lock['assets']], cwd=REPO, check=True)
print('FC_LAUNCHER_STREAMING_STAGE_READY', len(old_stage), changed)
