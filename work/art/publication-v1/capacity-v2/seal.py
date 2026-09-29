"""Seal only private sources, descriptor metadata and tiny disposable fixtures."""
from pathlib import Path
import hashlib, json, tarfile, os, datetime, subprocess

HERE=Path(__file__).resolve().parent
PARENT=HERE.parent
def sha(b): return hashlib.sha256(b).hexdigest()
def pin(p,base=HERE):
    b=p.read_bytes()
    return {'path':p.relative_to(base).as_posix(),'bytes':len(b),'sha256':sha(b)}
def write(name,data): (HERE/name).write_text(json.dumps(data,indent=2)+'\n')

parents=json.loads((HERE/'parent-lock.json').read_text())
for d in parents['files']:
    assert sha((PARENT/d['path']).read_bytes())==d['sha256'], d['path']
changed=[]
for p in sorted((HERE/'candidate').rglob('*')):
    if p.is_file():
        rel=p.relative_to(HERE/'candidate')
        old=PARENT/rel
        assert old.is_file(), rel
        if old.read_bytes()!=p.read_bytes(): changed.append(str(rel))
assert changed==['io.mjs','publication.mjs','publication.test.mjs'], changed

fixture_roots=sorted((PARENT/'fixtures').glob('capacity06-*'))
assert fixture_roots
rows=[]
archive=HERE/'fixtures-capacity06.tar.gz'
assert not archive.exists()
with tarfile.open(archive,'w:gz',dereference=False) as t:
    for root in fixture_roots:
        for base,dirs,files in os.walk(root,followlinks=False):
            for name in sorted(dirs+files):
                p=Path(base)/name
                if p.is_dir() and not p.is_symlink(): continue
                rel=p.relative_to(PARENT/'fixtures').as_posix()
                if p.is_symlink(): row={'path':rel,'symlink':os.readlink(p)}
                else: row=pin(p,PARENT/'fixtures')
                rows.append(row);t.add(p,arcname=rel,recursive=False)
rows.sort(key=lambda x:x['path'])
with tarfile.open(archive) as t:
    members=t.getmembers();assert len(members)==len(rows)
    actual={m.name:m for m in members}
    for d in rows:
        m=actual[d['path']]
        if 'symlink' in d: assert m.issym() and m.linkname==d['symlink']
        else:
            b=t.extractfile(m).read();assert len(b)==d['bytes'] and sha(b)==d['sha256']
write('fixture-index.json',rows)
sources=[]
for p in sorted(HERE.rglob('*')):
    if not p.is_file() or any(part.startswith('test-data') for part in p.relative_to(HERE).parts): continue
    if p.name in ['source-lock.json','receipt.json']: continue
    sources.append(pin(p))
write('source-lock.json',{'files':sources})
projection=json.loads((HERE/'projection-v2.json').read_text())
write('receipt.json',{
    'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope':'Private metadata capacity successor only; no actual asset body hashing/copy/build/publication/browser.',
    'parentCommit':'de21c9d','parentInputsExact':True,'candidateChangedFiles':changed,
    'projection':projection,'fixedJSONCaps':{'asset':8388608,'inventory':67108864,'publication':134217728},
    'tests':{'capacity':{'passed':4,'log':'capacity-checks-02.log'},'transaction':{'passed':22,'log':'publication-checks-01.log'}},
    'limits':['No final complete metadata size proof','Exact-cap tests cover admission/integrity, not full-cap parsing','No hostile-writer atomicity or power-loss guarantee','Original v1 and projection01 preserved'],
    'archive':pin(archive),'fixtureFiles':len(rows),'sourceLock':pin(HERE/'source-lock.json'),
    'node':subprocess.check_output(['node','--version'],text=True).strip()
})
print(json.dumps({'receipt':pin(HERE/'receipt.json'),'sourceLock':pin(HERE/'source-lock.json'),'fixtures':len(rows),'archive':pin(archive)},indent=2))
