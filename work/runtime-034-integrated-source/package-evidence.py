#!/usr/bin/env python3
"""Package compact exact receipts, excluding executables and large save/replays."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import tarfile

HERE = Path(__file__).resolve().parent

def sha(data):
    return hashlib.sha256(data).hexdigest()

def archive(name, files):
    target = HERE/(name+'.tar.gz')
    assert not target.exists(), 'Preserve existing archive: '+str(target)
    entries = {}
    with target.open('wb') as stream, gzip.GzipFile(filename='',mode='wb',fileobj=stream,mtime=0) as zipped, tarfile.open(fileobj=zipped,mode='w|') as tar:
        for path in sorted(files):
            data = path.read_bytes()
            rel = str(path.relative_to(HERE))
            info = tarfile.TarInfo(rel)
            info.size = len(data);info.mode = 0o644;info.mtime = 0
            tar.addfile(info,io.BytesIO(data))
            entries[rel] = dict(bytes=len(data),sha256=sha(data))
    with tarfile.open(target,'r:gz') as tar:
        verified = {item.name:dict(bytes=item.size,sha256=sha(tar.extractfile(item).read())) for item in tar.getmembers()}
    assert verified == entries
    receipt = dict(archive=target.name,bytes=target.stat().st_size,sha256=sha(target.read_bytes()),files=entries,
                   reopened_all_exact=True,excludes='Native/WASM executables, large saved-state/replay files, prior-live runtime backups and private account data.')
    (HERE/(name+'-archive.json')).write_text(json.dumps(receipt,indent=2)+'\n')
    print(name,len(entries),target.stat().st_size,receipt['sha256'])

skirmish = HERE/'skirmish-runs/20260929T075631Z'
archive('skirmish-ledgers',[p for p in skirmish.rglob('*') if p.is_file() and not p.name.endswith(('.save.json','.fcr'))])
files = []
for stamp in ('20260929T081201Z','20260929T081559Z','20260929T081745Z'):
    base = HERE/'runtime-builds'/stamp
    for p in base.rglob('*'):
        if not p.is_file():continue
        rel = p.relative_to(base)
        if rel.parts[0] == 'runtime' or p.name.endswith('.save.json'):continue
        # Native/WASM fixtures are exact duplicates; native views plus the full
        # receipt's73 per-file hashes retain the compact comparison evidence.
        if rel.parts[0] == 'fixtures' and (rel.parts[1] != 'native' or stamp != '20260929T081745Z'):continue
        files.append(p)
archive('runtime-evidence',files)
