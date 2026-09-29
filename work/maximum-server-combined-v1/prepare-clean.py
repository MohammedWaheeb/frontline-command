"""Prepare the clean production/test twin; leave the instrumented source frozen."""
from pathlib import Path
import datetime, json, shutil, sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
from runner_guard import IGNORE_BYTES, digest, verify_source

TIMING = '7ac31472467322e374eee42781735b2ada2ab2f062445d38097ed43681e2abd3'
BASE = '3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750'
verify_source(HERE/'source',HERE/'source-lock.json',TIMING)
assert digest(HERE/'production-inventory.json') == '5e245676eaf690224ee9ddc941abbff0889c7a3219819ea549dc5cb373f5fe77'
base = ROOT/'work/runtime-034-integrated-source'
assert digest(base/'source-lock.json') == BASE
files = json.loads((base/'source-lock.json').read_text())['files']
out = HERE/'clean-source'; out.mkdir()
for name, sha in files.items():
    old, new = base/'source'/name, out/name
    assert digest(old) == sha, name
    new.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(old,new)
(out/'.gitignore').write_bytes(IGNORE_BYTES)
for row in json.loads((HERE/'production-inventory.json').read_text())['files']:
    name = row['path']; old, new = HERE/'production-files'/name, out/name
    assert digest(old) == row['candidate_sha256'], name
    new.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(old,new)
clean = {str(p.relative_to(out)):digest(p) for p in sorted(out.rglob('*')) if p.is_file() and p.name!='.gitignore'}
timing = json.loads((HERE/'source-lock.json').read_text())['files']
assert set(timing)-set(clean) == {'internal/server/server_maximum_timing_test.go'}
assert not (set(clean)-set(timing))
different = [name for name in clean if clean[name] != timing[name]]
assert different == ['internal/server/match.go']
lock = {'base_lock_sha256':BASE,'timing_source_lock_sha256':TIMING,'scope':'Exact reviewed seven-path combined production/test delta on3d49; all timing instrumentation/test excluded. No gameplay/source change from clean proposed integration.', 'files':clean}
(HERE/'clean-source-lock.json').write_text(json.dumps(lock,indent=2)+'\n')
sha = digest(HERE/'clean-source-lock.json')
report = {'status':'prepared_not_executed','utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'preparer_sha256':digest(Path(__file__)),'source_guard':verify_source(out,HERE/'clean-source-lock.json',sha),'timing_source_guard':verify_source(HERE/'source',HERE/'source-lock.json',TIMING),'unchanged_common_files':len(clean)-len(different),'only_different_common_file':different,'only_omitted_timing_file':'internal/server/server_maximum_timing_test.go'}
(HERE/'clean-preflight.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
