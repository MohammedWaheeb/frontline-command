"""Run the original and metadata candidate packers against identical real raw art."""
from pathlib import Path
import copy,hashlib,importlib.util,json,sys
HERE=Path(__file__).resolve().parent;REPO=HERE.parents[2];OUT=HERE/'proof-full-pack-v1';assert not OUT.exists();OUT.mkdir()
sys.path[:0]=[str(HERE/'candidate'),str(REPO/'assets/pipeline/tools')]
lock=json.loads((HERE/'candidate-lock.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(HERE/'before-pack_sprites.py')==lock['base_packer_sha256'];assert sha(HERE/'candidate/pack_sprites.py')==lock['candidate_packer_sha256'];assert sha(HERE/'candidate/sprite_ink_bounds.py')==lock['helper_sha256']
aid='prop.spawn_marker_editor';raw=REPO/'assets/build/frames'/aid;inputs={str(p.relative_to(REPO)):sha(p) for p in raw.rglob('*') if p.is_file()};spec=REPO/'assets/pipeline/specs'/(aid+'.json');inputs[str(spec.relative_to(REPO))]=sha(spec)
for name,file in [('before','before-pack_sprites.py'),('candidate','candidate/pack_sprites.py')]:
 loader=importlib.util.spec_from_file_location('pack_'+name,HERE/file);m=importlib.util.module_from_spec(loader);loader.loader.exec_module(m);m.FRAMES=str(REPO/'assets/build/frames');m.SPECS=str(REPO/'assets/pipeline/specs');m.SPRITES=str(OUT/name);m.pack_asset(aid)
a=OUT/'before'/aid;b=OUT/'candidate'/aid;assert {p.name for p in a.iterdir()}=={p.name for p in b.iterdir()};pngs=0;descs=0
for p in a.iterdir():
 q=b/p.name
 if p.suffix=='.png':assert sha(p)==sha(q),p.name;pngs+=1;continue
 old=json.loads(p.read_text());new=json.loads(q.read_text())
 if '.sprite.' in p.name:
  assert old.pop('content_sha256')!=new.pop('content_sha256');assert old==new,p.name
 else:
  assert new['meta'].pop('ink_bounds_policy')['alpha_min']==1
  for f in new['frames'].values():f.pop('ink_bounds')
  assert old==new,p.name;descs+=1
for rel,want in inputs.items():assert sha(REPO/rel)==want,rel
(HERE/'full-pack-proof.json').write_text(json.dumps({'asset':aid,'status':'passed','raw_spec_files_unchanged':len(inputs),'png_files_byte_exact':pngs,'atlas_json_existing_fields_exact':descs,'sidecar_difference':'content_sha256 only, intentionally updated for new metadata bytes','inputs_sha256':inputs,'candidate_lock_sha256':sha(HERE/'candidate-lock.json')},indent=2)+'\n');print('FC_FULL_PACK_METADATA_PROOF',aid,pngs,descs,flush=True)
