"""Prepare only a private full rifle stage after the native pilot is accepted."""
from pathlib import Path
import hashlib,json,shutil,copy
B=Path(__file__).resolve().parent;R=B.parents[2];O=B/'production-v1';S=O/'stage';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();dump=lambda p,j:p.write_text(json.dumps(j,indent=2)+'\n')
proof=json.loads((B/'source-proof-v6.json').read_text());assert proof['failures']==0;approval=json.loads((B/'parent-native-approval.json').read_text());assert approval['approved_full200'];assert proof['candidate_spec_sha256']==sha(B/'unit.US.rifle.json')==approval['spec_sha256']
for rel,w in approval['images'].items():assert sha(R/rel)==w
assert not O.exists();S.mkdir(parents=True);lock=json.loads((B/'pilot-source-lock.json').read_text());sources={};provenance={};aid='unit.US.rifle'
def put(p,rel):
 d=S/rel;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,d);assert sha(p)==sha(d);sources[rel]=sha(d);provenance[rel]={'path':str(p.relative_to(R)),'sha256':sha(p)}
for rel,w in lock['stage_files'].items():
 assert sha(B/'stage'/rel)==w
 if rel.startswith('assets/pipeline/specs/') and not rel.endswith('/'+aid+'.json'):continue
 if rel.endswith('/models/infantry.py'):continue
 put(B/'stage'/rel,rel)
for name in ['check-one.py','derive-ui.py','native-ui-contact.py']:put(R/'work/art/infantry-roster'/name,'work/art/infantry-roster/'+name)
put(B/'packed-contact.py','work/art/infantry-roster/packed-contact.py')
put(R/'work/art/ground-launcher-charge-contract-v1/production-v2/stage/assets/pipeline/blender/render_reuse.py','assets/pipeline/blender/render_reuse.py')
mp=R/'work/art/ground-launcher-charge-contract-v1/production-v2/stage/assets/manifest/asset-manifest.json';before=json.loads(mp.read_text());manifest=copy.deepcopy(before);specpath=S/'assets/pipeline/specs'/f'{aid}.json';spec=json.loads(specpath.read_text());entry=next(x for x in manifest['entries'] if x['id']==aid);assert entry['spec']['states']==spec['states'];changes={'canvas_2x':spec['canvas'],'anchor_2x':spec['anchor'],'total_poses':200};entry['spec'].update(changes)
for a,b in zip(before['entries'],manifest['entries']):
 c=copy.deepcopy(b)
 if a['id']==aid:
  for k in changes:
   if k in a['spec']:c['spec'][k]=a['spec'][k]
   else:c['spec'].pop(k,None)
 assert a==c
m=S/'assets/manifest/asset-manifest.json';m.parent.mkdir(parents=True);dump(m,manifest);sources[str(m.relative_to(S))]=sha(m)
render=json.loads((B/'pilot-v1/render.json').read_text());assert render['source_proof_sha256']==sha(B/'source-proof-v6.json');files={};count=0
for row in render['records']:
 if row['folder']!='candidate':continue
 count+=1
 for rel,w in row['files'].items():
  p=B/'pilot-v1'/rel;assert sha(p)==w;key='/'.join(Path(rel).parts[1:]);d=S/'assets/build/frames'/aid/key;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,d);assert sha(d)==w;files[key]={'sha256':w,'source':str(p.relative_to(R)),'lineage':'Exact accepted native candidate pilot'}
assert count==50;reuse=S/'work/reuse'/f'{aid}.json';reuse.parent.mkdir(parents=True);model=S/'assets/pipeline/blender/models/infantry_roster.py';dump(reuse,{'id':aid,'model_sha256':sha(model),'spec_sha256':sha(specpath),'files':files,'poses':50,'source_proof_sha256':sha(B/'source-proof-v6.json'),'scope':'Exact50 pilot tuple reuse under identical model/spec/pipeline camera/anchor/lights;150 fresh required poses. No old-model raw reuse.'})
ui={}
for folder in ['portraits','icons/build']:
 for layer in ['beauty','team']:
  rel=f'assets/build/ui/{folder}/US.rifle@2x.{layer}.png';p=B/'stage'/rel;d=S/rel;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,d);assert sha(p)==sha(d);ui[rel]=sha(d)
f=S/'work/art/infantry-roster';dump(f/'source-lock.json',{'sha256':sources,'assets':[aid],'scope':'Private source/spec pipeline snapshot after accepted rifle native pilot.'});dump(O/'production-lock.json',{'stage':str(S.relative_to(R)),'sources':sources,'scope':'Private full US rifle replacement only, no live publication.'});dump(O/'preparation.json',{'stage':str(S.relative_to(R)),'inputs':provenance,'source_proof_sha256':sha(B/'source-proof-v6.json'),'parent_approval_sha256':sha(B/'parent-native-approval.json'),'assets':[{'id':aid,'poses':200,'reused':50,'fresh':150}],'reuse_sha256':sha(reuse),'ui_exact_copies':ui,'manifest_before_sha256':sha(mp),'manifest_after_sha256':sha(m),'private_manifest_fields':{aid:changes},'scope':'Claude spec-only style alignment to unchanged Codex quota-authored infantry family; original Claude US rifle retained. No model edit or live source publication.'});print('FC_RIFLE_FULL_PREPARED',200,50,150)
