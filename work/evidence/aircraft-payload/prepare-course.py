"""Copy and verify the exact Go candidate; add only a presentation-course test."""
from pathlib import Path
import hashlib
import json
import shutil

root = Path(__file__).resolve().parents[3]
base = root / 'work/navigation-lookup-candidate'
here = Path(__file__).resolve().parent
lock = json.loads((base / 'source-lock.json').read_text())
source = here / 'go-source'
source.mkdir(exist_ok=True)
for name, expected in lock['files'].items():
    original = base / 'source' / name
    data = original.read_bytes()
    assert hashlib.sha256(data).hexdigest() == expected, name
    target = source / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
test = here / 'aircraft_payload_course_test.go'
shutil.copyfile(test, source / 'pkg/sim/aircraft_payload_course_test.go')
(source / '.gitignore').write_text('*\n!.gitignore\n')
(here / 'go-source-receipt.json').write_text(json.dumps({
    'base_lock': hashlib.sha256((base / 'source-lock.json').read_bytes()).hexdigest(),
    'verified_files': len(lock['files']),
    'test_sha256': hashlib.sha256(test.read_bytes()).hexdigest(),
    'scope': 'Exact candidate Go source plus one synthetic mechanics presentation test. No production edits.'
}, indent=2) + '\n')
print(source)
