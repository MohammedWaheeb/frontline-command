"""Prepare the32 unchanged remaining buildings, no render or live writes."""
from pathlib import Path
import json,hashlib,shutil
B=Path(__file__).resolve().parent;R=B.parents[2];S=B/'stage';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();dump=lambda p,j:p.write_text(json.dumps(j,indent=2)+'\n');oldp=R/'work/art/building-roster/production-lock.json';old=json.loads(oldp.read_text());completedp=R/'work/art/building-roster/completed-assets.txt';completed=set(completedp.read_text().splitlines());assert len(completed)==27;assets=[a for a in old['assets'] if a not in completed];assert len(assets)==32 and not S.exists();S.mkdir();sources={};origins={}
def put(p,rel):
 d=S/rel;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,d);assert sha(p)==sha(d);sources[rel]=sha(d);origins[rel]={'path':str(p.relative_to(R)),'sha256':sha(p)}
for rel,w in old['sources'].items():
 assert sha(R/rel)==w,rel
 if rel.startswith('assets/pipeline/specs/') and Path(rel).stem not in assets:continue
 if rel=='assets/pipeline/tools/pack_sprites.py':continue
 put(R/rel,rel)
pack=R/'work/art/ground-launcher-charge-contract-v1/production-v2/stage/assets/pipeline/tools/pack_sprites.py';assert sha(pack)=='8c3f07bb1fc85600a17ecfaaab82840ce6d6a9ab287799c0533a33347860abb0';put(pack,'assets/pipeline/tools/pack_sprites.py')
for name in ['check-one.py','derive-ui.py','packed-contact.py']:put(R/'work/art/building-roster'/name,'work/art/building-roster/'+name)
for name in ['fclib.py','team_mask_png.py','render_asset.py','render_ui_shots.py']:
 rel='assets/pipeline/blender/'+name
 if rel not in sources:put(R/rel,rel)
manifest=R/'work/art/ground-launcher-charge-contract-v1/production-v2/stage/assets/manifest/asset-manifest.json';put(manifest,'assets/manifest/asset-manifest.json');entries={e['id']:e for e in json.loads(manifest.read_text())['entries']};inventory=[]
for aid in assets:
 p=S/'assets/pipeline/specs'/f'{aid}.json';spec=json.loads(p.read_text());assert spec['states']==entries[aid]['spec']['states'];inventory.append({'id':aid,'poses':sum(x['directions']*x['frames'] for x in spec['states']),'spec_sha256':sha(p),'status':'Previously approved unchanged source; not rendered in this stage.'})
lock={'assets':assets,'sources':sources,'scope':'Private unchanged32 remaining buildings from acceptedf69e family, excluding27 complete IDs and correctedHQ private stages. No model/spec edits. Accepted streaming helper only alters memory behavior.','original_lock_sha256':sha(oldp),'exact_streaming_proof_sha256':sha(R/'work/art/packer-streaming-v1/result.json')};dump(S/'work/art/building-roster/production-lock.json',lock);dump(B/'production-lock.json',{'stage':str(S.relative_to(R)),**lock});dump(B/'preparation.json',{'stage':str(S.relative_to(R)),'original_lock_sha256':sha(oldp),'completed_inventory_sha256':sha(completedp),'excluded_completed':sorted(completed),'inputs':origins,'assets':inventory,'poses':sum(x['poses'] for x in inventory),'scope':'Preparation only, exact approved unchanged building source/specs. No pilot/raw reuse claimed;1,614 fresh poses plus authored UI planned, each requires full checks/native review. No live publication.'});print('FC_REMAINING_BUILDINGS_PREPARED',len(assets),sum(x['poses'] for x in inventory))
