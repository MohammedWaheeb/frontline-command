"""Seal remaining21 approved ground assets without rendering or live mutation."""
from pathlib import Path
import json,hashlib,shutil
B=Path(__file__).resolve().parent;R=B.parents[2];S=B/'stage';assert not S.exists();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();dump=lambda p,j:p.write_text(json.dumps(j,indent=2)+'\n');oldp=R/'work/art/vehicle-production/production-lock.json';old=json.loads(oldp.read_text());excluded=['unit.SY.apc','unit.SA.tank','unit.IR.launcher','unit.US.launcher','unit.SY.launcher','unit.SA.launcher'];assets=[a for a in old['assets'] if a not in excluded];assert len(assets)==21
sources={};provenance={};S.mkdir()
def put(p,rel):
 d=S/rel;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,d);assert sha(p)==sha(d);sources[rel]=sha(d);provenance[rel]={'path':str(p.relative_to(R)),'sha256':sha(p)}
for rel,w in old['sources'].items():
 assert sha(R/rel)==w,rel
 if rel.startswith('assets/pipeline/specs/') and Path(rel).stem not in assets:continue
 if rel=='assets/pipeline/tools/pack_sprites.py':continue
 put(R/rel,rel)
pack=R/'work/art/ground-launcher-charge-contract-v1/production-v2/stage/assets/pipeline/tools/pack_sprites.py';assert sha(pack)=='8c3f07bb1fc85600a17ecfaaab82840ce6d6a9ab287799c0533a33347860abb0';put(pack,'assets/pipeline/tools/pack_sprites.py')
for name in ['model-audit.py','check-one.py','ui-and-contacts.py']:
 rel='work/art/vehicle-production/'+name;assert sha(R/rel)==old['drivers'][rel];put(R/rel,rel)
manifest=R/'work/art/ground-launcher-charge-contract-v1/production-v2/stage/assets/manifest/asset-manifest.json';put(manifest,'assets/manifest/asset-manifest.json');entries={e['id']:e for e in json.loads(manifest.read_text())['entries']};inventory=[]
for aid in assets:
 p=S/'assets/pipeline/specs'/f'{aid}.json';spec=json.loads(p.read_text());assert spec['states']==entries[aid]['spec']['states'];inventory.append({'id':aid,'poses':sum(x['directions']*x['frames'] for x in spec['states']),'spec_sha256':sha(p),'status':'Approved unchanged source; not rendered in this stage.'})
proof=R/'work/art/packer-streaming-v1/result.json';assert sha(proof)=='c8a42eca2438cd58fba2519478a7c345671e539b0bae15ef9a7ce673e391a45f'
lock={'assets':assets,'sources':sources,'scope':'Private unchanged approved21 remaining ground models, source5259 unchanged, no launchers or completed assets; streaming packer only differs from original helper. Standard source/world/UI/native gates mandatory.','original_lock_sha256':sha(oldp),'streaming_proof_sha256':sha(proof)};dump(S/'work/art/vehicle-production/production-lock.json',lock);dump(B/'production-lock.json',{'stage':str(S.relative_to(R)),**lock});dump(B/'preparation.json',{'stage':str(S.relative_to(R)),'original_lock':str(oldp.relative_to(R)),'original_lock_sha256':sha(oldp),'inputs':provenance,'assets':inventory,'poses':sum(x['poses'] for x in inventory),'excluded':excluded,'scope':'Preparation only. Runs after queued8aircraft; exact original models/specs and approved pipeline. No Blender launched, accepted/frozen exports unchanged.'});print('FC_REMAINING_GROUND_PREPARED',len(assets),sum(x['poses'] for x in inventory))
