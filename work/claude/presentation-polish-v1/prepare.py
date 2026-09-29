"""Freeze the reviewed Claude delta over current live logic, without editing it."""
from pathlib import Path
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
BASE = ROOT / 'work/art-generation-consumer-v1/frozen-v3/client'
AUTHORED = HERE / 'source/client'
OUT = HERE / 'integrated-v1'
CHANGED = {
    'src/render/battlefield.ts', 'src/render/terrain.ts',
    'src/styles/game.css', 'src/ui/App.tsx',
    'tests/runtime/presentation-polish.test.ts',
}
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
inventory = lambda p: {str(f.relative_to(p)): sha(f) for f in p.rglob('*')
                       if f.is_file() and 'node_modules' not in f.parts}
before, authored = inventory(BASE), inventory(AUTHORED)
delta = {k for k in before.keys() | authored.keys() if before.get(k) != authored.get(k)}
assert delta == CHANGED, delta
assert not OUT.exists(), OUT
client = OUT / 'source/client'
client.mkdir(parents=True)
pins, outputs = {}, {}
for name in sorted(before.keys() | CHANGED | {'tests/runtime/audio-retry.test.ts'}):
    source = AUTHORED / name if name in CHANGED else ROOT / 'client' / name
    assert source.is_file(), source
    if name in CHANGED and name in before:
        assert sha(ROOT / 'client' / name) == before[name], ('live UI drift', name)
    target = client / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    pins[str(source.relative_to(ROOT))] = sha(source)
    outputs['source/client/' + name] = sha(target)
(client / 'node_modules').symlink_to(ROOT / 'client/node_modules', target_is_directory=True)
fixture_lock = json.loads((ROOT / 'work/art-generation-consumer-v1/source-lock-v3.json').read_text())
for name, digest in fixture_lock['files'].items():
    if name.startswith('source/client/'):
        continue
    source = BASE.parent / name.removeprefix('source/')
    assert sha(source) == digest, name
    target = OUT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    pins[str(source.relative_to(ROOT))] = digest
    outputs[name] = digest
receipt = {'status': 'prepared-unrun', 'scope': 'Current live logic including audio retry plus exact Claude presentation delta. No live promotion.',
           'claudeDelta': sorted(CHANGED), 'inputs': pins, 'files': outputs}
(OUT / 'source-lock.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(OUT)
