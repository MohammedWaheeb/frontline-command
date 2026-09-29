"""Freeze two reviewed private candidates; no compiler, workload or host execution."""
from pathlib import Path
import argparse, datetime, difflib, hashlib, json, shutil, sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
ORIGINAL = ROOT / 'work/maximum-load-034-course'
REUSE = ROOT / 'work/server-checkpoint-reuse-v1'
RASTER = ROOT / 'work/navigation-grid-raster-v1'
BASE = ROOT / 'work/runtime-034-integrated-source'
sys.path.insert(0, str(ORIGINAL))
from runner_guard import digest, verify_source

REUSE_LOCK = '36a7a73678c71dc57709ab4a655e545382e24ae808900b784832f747292c6444'
BASE_LOCK = '3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750'
NAVIGATION = '6a51329f420cebbff652e493409f0aa1337a03c47e12910d664008fe824732b9'
GUARD = '55bc657f42ab0cc53fed601dbb2c75a0c86d9e412d4a524e1d39e5d4a7e3a3db'
RUNNER = '4e9265c9cb5358e27cdf2d2ad8306c6097577f01fd0ba6deddba19540c148a1c'
p = argparse.ArgumentParser()
p.add_argument('--raster-lock', required=True)
p.add_argument('--raster-sha', required=True)
p.add_argument('--test-sha', required=True)
args = p.parse_args()
assert '/' not in args.raster_lock and args.raster_lock.endswith('.json')
assert not (HERE/'source').exists() and not (HERE/'source-lock.json').exists()
assert digest(ORIGINAL/'runner_guard.py') == GUARD
assert digest(ORIGINAL/'run-server.py') == RUNNER
verify_source(REUSE/'source', REUSE/'source-lock.json', REUSE_LOCK)
raster_lock = RASTER/args.raster_lock
assert digest(raster_lock) == args.raster_sha
raster = json.loads(raster_lock.read_text())
imports = {'pkg/sim/navigation.go':NAVIGATION, 'pkg/sim/navigation_raster_test.go':args.test_sha}
for name, sha in imports.items():
    assert raster['files'][name] == sha and digest(RASTER/'source'/name) == sha, name
assert digest(REUSE/'production-files.json') == 'd1ad72a86ba478dbffa533970737f4b4ab9b35a3ec5324769ba842f335ccef49'
clean_reuse = json.loads((REUSE/'production-files.json').read_text())['files']
for name, sha in clean_reuse.items(): assert digest(REUSE/'production-files'/name) == sha, name
assert digest(BASE/'source-lock.json') == BASE_LOCK
baseline = json.loads((BASE/'source-lock.json').read_text())['files']
for name, sha in baseline.items(): assert digest(BASE/'source'/name) == sha, name

source = HERE/'source'
shutil.copytree(REUSE/'source', source)
for name in imports: shutil.copy2(RASTER/'source'/name, source/name)
old = json.loads((REUSE/'source-lock.json').read_text())['files']
files = {str(path.relative_to(source)):digest(path) for path in sorted(source.rglob('*')) if path.is_file() and path.name != '.gitignore'}
for name, sha in imports.items(): assert files[name] == sha, name
changed = {name for name in old if old[name] != files.get(name)}
added, removed = set(files)-set(old), set(old)-set(files)
assert changed == {'pkg/sim/navigation.go'} and added == {'pkg/sim/navigation_raster_test.go'} and not removed
assert not any(name.startswith('cmd/coldprofile/') for name in files)
assert files['internal/server/server_maximum_timing_test.go'] == 'f014953ce8253f4684751bde42aeb2055b05c55d8f4dd1ad1870cb797b94be8a'
lock = {'base_lock_sha256':REUSE_LOCK, 'production_base_lock_sha256':BASE_LOCK, 'raster_source_lock_sha256':args.raster_sha, 'scope':'Reviewed save-reuse instrumented source plus only exact approved raster source/test. Same600ticks and strict gates. No coldprofile command.', 'files':files}
(HERE/'source-lock.json').write_text(json.dumps(lock,indent=2)+'\n')
new_lock = digest(HERE/'source-lock.json')
shutil.copy2(ORIGINAL/'runner_guard.py', HERE/'runner_guard.py')
runner = (ORIGINAL/'run-server.py').read_text()
assert runner.count("EXPECTED_LOCK = '4671ae3aae65169d1824a84c200cdeadfe709a6ae821f773538e2e426e20836e'") == 1
runner = runner.replace("EXPECTED_LOCK = '4671ae3aae65169d1824a84c200cdeadfe709a6ae821f773538e2e426e20836e'", "EXPECTED_LOCK = '"+new_lock+"'")
(HERE/'run-server.py').write_text(runner)

production = dict(clean_reuse, **imports)
inventory = []; delta = []
for name, sha in sorted(production.items()):
    origin = RASTER/'source'/name if name in imports else REUSE/'production-files'/name
    target = HERE/'production-files'/name; target.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(origin,target)
    assert digest(target) == sha
    prior = BASE/'source'/name
    inventory.append({'path':name,'baseline_sha256':baseline.get(name),'candidate_sha256':sha,'bytes':target.stat().st_size,'kind':'test' if name.endswith('_test.go') else 'production'})
    delta.extend(difflib.unified_diff(prior.read_text().splitlines(True) if prior.exists() else [], target.read_text().splitlines(True), fromfile='a/'+name if prior.exists() else '/dev/null', tofile='b/'+name))
(HERE/'production.diff').write_text(''.join(delta))
(HERE/'production-inventory.json').write_text(json.dumps({'base_source_lock_sha256':BASE_LOCK,'scope':'Clean proposed integration copies; no actor timing annotations or coldprofile command. Live unchanged.', 'files':inventory},indent=2)+'\n')
report = {'status':'prepared_not_executed','utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'preparer_sha256':digest(Path(__file__)),'source_guard':verify_source(source,HERE/'source-lock.json',new_lock),'raster_lock_file':args.raster_lock,'raster_lock_sha256':args.raster_sha,'imported_files':imports,'unchanged_from_reuse':len(old)-len(changed),'changed_from_reuse':sorted(changed),'added_from_reuse':sorted(added),'removed_from_reuse':sorted(removed),'original_timing_test_sha256':files['internal/server/server_maximum_timing_test.go'],'runner_sha256':digest(HERE/'run-server.py'),'guard_sha256':digest(HERE/'runner_guard.py'),'production_diff_sha256':digest(HERE/'production.diff'),'production_inventory_sha256':digest(HERE/'production-inventory.json'),'compiled':False,'executed':False}
(HERE/'preflight.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
