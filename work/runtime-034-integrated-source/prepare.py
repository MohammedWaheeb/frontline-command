#!/usr/bin/env python3
"""Prepare only this new isolated integration; refuse existing source output."""
import datetime
import difflib
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CANDIDATE = ROOT / 'work/navigation-lookup-candidate'
COMMANDER = ROOT / 'work/runtime-034-observer-reboard'
BASE = ROOT / 'work/runtime-034-candidate'
SOURCE = HERE / 'source'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def read(path):
    return json.loads(path.read_text())

def verify(root, expected):
    assert sha(root / 'source-lock.json') == expected
    files = read(root / 'source-lock.json')['files']
    actual = {str(p.relative_to(root / 'source')): sha(p)
              for p in sorted((root / 'source').rglob('*')) if p.is_file()}
    assert actual == files, str(root)
    return files

candidate = verify(CANDIDATE, 'c7e0d79d1770491cc867037b7c0c69b31ce16738885022130dc3fea59c37d122')
commander = verify(COMMANDER, '757b31785a0c0b869cca06ad01299ef199fd124989e722dce559c2919dddab8d')
base = read(BASE / 'source-lock.json')['files']
inventory = read(ROOT / 'work/go-promotion-audit/selective-files.json')
for entry in inventory['changed_or_added']:
    live = ROOT / entry['path']
    assert (sha(live) if live.is_file() else None) == entry['live_sha256'], str(live)
    assert sha(CANDIDATE / 'source' / entry['path']) == entry['candidate_sha256']
assert not SOURCE.exists(), 'refuse to overwrite prior source'
SOURCE.mkdir()
inputs = HERE / 'inputs'
inputs.mkdir(exist_ok=True)
for directory, name in [(CANDIDATE, 'c7e0'), (COMMANDER, 'commander'), (BASE, 'combined')]:
    shutil.copyfile(directory / 'source-lock.json', inputs / (name + '-source-lock.json'))
shutil.copyfile(ROOT / 'work/go-promotion-audit/selective-files.json', inputs / 'selective-files.json')
decisions = []
for rel in sorted(candidate):
    if rel.startswith('pkg/native-scenes/'):
        decisions.append(dict(path=rel, decision='exclude historical experimental save/view artifact'))
        continue
    live = ROOT / rel
    if live.is_file():
        target = SOURCE / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(live, target)
        decisions.append(dict(path=rel, decision='copy current live', live_sha256=sha(live)))
for entry in inventory['changed_or_added']:
    if entry['category'] == 'excluded_old_fixture':
        continue
    target = SOURCE / entry['path']
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(CANDIDATE / 'source' / entry['path'], target)
    decisions.append(dict(path=entry['path'], decision='selective c7e0 integration', sha256=sha(target)))
# Before adding the successful commander, every included source byte must be c7e0.
expected_c7 = {rel: digest for rel, digest in candidate.items() if not rel.startswith('pkg/native-scenes/')}
assert {str(p.relative_to(SOURCE)): sha(p) for p in SOURCE.rglob('*') if p.is_file()} == expected_c7
delta = read(COMMANDER / 'production-unchanged-audit.json')
for rel in delta['changed']:
    assert rel.endswith('_test.go') and sha(ROOT / rel) == candidate[rel] == base[rel]
    preserved = inputs / 'live-authored-tests' / Path(rel).name
    preserved.parent.mkdir(exist_ok=True)
    shutil.copyfile(ROOT / rel, preserved)
    decisions.append(dict(path=rel, decision='commander delta applies to exact unchanged ancestor; live bytes preserved',
                          ancestor_sha256=base[rel], integrated_sha256=commander[rel]))
for rel in delta['added']:
    assert rel.endswith('_test.go') and not (ROOT / rel).exists() and rel not in candidate
    decisions.append(dict(path=rel, decision='add passing commander test', integrated_sha256=commander[rel]))
for rel in delta['changed'] + delta['added']:
    shutil.copyfile(COMMANDER / 'source' / rel, SOURCE / rel)
files = {str(p.relative_to(SOURCE)): sha(p) for p in sorted(SOURCE.rglob('*')) if p.is_file()}
for rel, digest in expected_c7.items():
    if rel not in delta['changed']:
        assert files[rel] == digest, rel
assert set(files) == set(expected_c7) | set(delta['added'])
assert len(files) == 355
lock = dict(simulation='0.3.4', c7e0_source_lock_sha256=sha(CANDIDATE / 'source-lock.json'),
            commander_source_lock_sha256=sha(COMMANDER / 'source-lock.json'),
            scope='Exact c7e0 production/content/protocol with the audited passing commander; historical pkg/native-scenes omitted',
            files=files)
(HERE / 'source-lock.json').write_text(json.dumps(lock, indent=2) + '\n')
receipt = dict(prepared_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
               head=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
               integrated_files=len(files), source_lock_sha256=sha(HERE / 'source-lock.json'),
               c7e0_included_files=len(expected_c7), excluded_historical_files=12,
               commander_changed=delta['changed'], commander_added=delta['added'],
               production_protocol_content_exact_c7e0=True,
               live_and_prior_sources_unchanged=True, decisions=decisions)
(HERE / 'integration-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
patch = []
for rel in delta['changed'] + delta['added']:
    old = (CANDIDATE / 'source' / rel).read_text().splitlines(True) if rel in candidate else []
    new = (SOURCE / rel).read_text().splitlines(True)
    patch.extend(difflib.unified_diff(old, new, fromfile='a/' + rel, tofile='b/' + rel))
(HERE / 'commander-only.diff').write_text(''.join(patch))
for entry in inventory['changed_or_added']:
    live = ROOT / entry['path']
    assert (sha(live) if live.is_file() else None) == entry['live_sha256']
print(json.dumps({key: value for key, value in receipt.items() if key != 'decisions'}, indent=2))
