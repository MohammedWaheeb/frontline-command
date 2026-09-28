"""Prepare an exact candidate copy plus one test; never build or run implicitly."""
from pathlib import Path
import hashlib
import json
import shutil

here = Path(__file__).resolve().parent
root = here.parents[1]
base = root / 'work/navigation-lookup-candidate'
lock = json.loads((base / 'source-lock.json').read_text())
source = here / 'go-source'
assert not source.exists(), 'Preserve previous preparation; inspect it instead of overwriting.'
for name, expected in lock['files'].items():
    data = (base / 'source' / name).read_bytes()
    assert hashlib.sha256(data).hexdigest() == expected, name
for name in lock['files']:
    target = source / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(base / 'source' / name, target)
test = here / 'combined_browser_export_test.go'
shutil.copyfile(test, source / 'pkg/sim/combined_browser_export_test.go')
(source / '.gitignore').write_text('*\n!.gitignore\n')
(here / 'preparation.json').write_text(json.dumps({
    'base_lock_sha256': hashlib.sha256((base / 'source-lock.json').read_bytes()).hexdigest(),
    'verified_files': len(lock['files']),
    'test_sha256': hashlib.sha256(test.read_bytes()).hexdigest(),
    'scope': 'Exact candidate source plus one new exporter. No production edit, build or run.'
}, indent=2) + '\n')
print(source)
