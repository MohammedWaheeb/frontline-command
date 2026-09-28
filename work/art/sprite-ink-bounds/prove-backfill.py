"""Prove metadata-only historical migration equals the accepted full pack result.

This touches only a new isolated copy under this evidence directory.
"""
from pathlib import Path
import copy,hashlib,json,shutil,sys
HERE=Path(__file__).resolve().parent;OUT=HERE/'proof-backfill-v1';assert not OUT.exists(),'Preserve migration evidence'
sys.path.insert(0,str(HERE/'candidate'));from sprite_ink_bounds import add_ink_bounds
lock=json.loads((HERE/'candidate-lock.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(HERE/'candidate/sprite_ink_bounds.py')==lock['helper_sha256']
aid='prop.spawn_marker_editor';before=HERE/'proof-full-pack-v1/before'/aid;expected=HERE/'proof-full-pack-v1/candidate'/aid;shutil.copytree(before,OUT)
sidepath=OUT/(aid+'.sprite.json');side=json.loads(sidepath.read_text());oldside=copy.deepcopy(side)
def content(directory):
 h=hashlib.sha256()
 for p in sorted(directory.iterdir(),key=lambda p:p.name):
  if p.name==aid+'.sprite.json':continue
  assert p.is_file(),p
  h.update(p.name.encode()+p.read_bytes())
 return h.hexdigest()
assert content(OUT)==side['content_sha256'],'Original content hash must be truthful before migration'
count=add_ink_bounds(OUT,side['atlases']);side['content_sha256']=content(OUT);sidepath.write_text(json.dumps(side,indent=1))
assert set(p.name for p in OUT.iterdir())==set(p.name for p in expected.iterdir())
for p in OUT.iterdir():assert sha(p)==sha(expected/p.name),('Backfill differs from full candidate pack',p.name)
oldside.pop('content_sha256');assert {k:v for k,v in side.items() if k!='content_sha256'}==oldside
pngs=list(OUT.glob('*.png'))
for p in pngs:assert sha(p)==sha(before/p.name)
report={'scope':'Four-pose real marker copied from preserved original-pack evidence, metadata-only backfill; no live outputs changed.','asset':aid,'frame_descriptors_annotated':count,'pngs_byte_exact':len(pngs),'every_output_byte_matches_full_candidate_pack':True,'sidecar_change':'content_sha256 only','candidate_lock_sha256':sha(HERE/'candidate-lock.json')}
(HERE/'backfill-proof.json').write_text(json.dumps(report,indent=2)+'\n');print('FC_INK_BACKFILL_PROOF',json.dumps(report),flush=True)
