from pathlib import Path
import hashlib,json,tarfile
ROOT=Path(__file__).resolve().parents[2]
sha=lambda b:hashlib.sha256(b).hexdigest()
def seal(base,files):
 files=sorted(set(files)); archive=base/'evidence.tar.gz';audit=base/'archive-audit.json'
 assert not archive.exists() and not audit.exists()
 rows=[{'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in files]
 with tarfile.open(archive,'w:gz') as t:
  for p in files:t.add(p,arcname=str(p.relative_to(ROOT)),recursive=False)
 with tarfile.open(archive,'r:gz') as t:
  assert t.getnames()==[r['path'] for r in rows]
  for r in rows:
   b=t.extractfile(r['path']).read();assert len(b)==r['bytes'] and sha(b)==r['sha256'],r['path']
 audit.write_text(json.dumps({'status':'readback-exact','archiveSHA256':sha(archive.read_bytes()),'files':rows},indent=2)+'\n')
 print(base.name,len(rows),archive.stat().st_size)
def tree(p):
 return [f for f in p.rglob('*') if f.is_file() and not f.is_symlink() and 'node_modules' not in f.parts]
p=ROOT/'work/ordinary-package-presentation-v1'
fs=[f for f in p.iterdir() if f.is_file() and f.name not in ['seal-evidence.py','README.md','evidence.tar.gz','archive-audit.json']]
fs+=tree(p/'chrome-01')
fs+=[f for f in tree(p/'build-02/fresh-runtime-parity-01') if f.suffix!='.wasm' and f.name!='runtime-native']
seal(p,fs)
p=ROOT/'work/terrain-spur-native-v2'
seal(p,[f for f in tree(p) if f.name not in ['README.md','review.json','evidence.tar.gz','archive-audit.json'] and f.suffix not in ['.js']])
p=ROOT/'work/terrain-spur-app-v2'
fs=[p/'build.mjs',p/'build-01.log']+[f for f in (p/'build-01').iterdir() if f.is_file()]
fs+=[f for f in tree(p/'build-01/source') if 'public' not in f.relative_to(p/'build-01/source').parts]
seal(p,fs)
