"""Private full HQ stage: proven exact terminal reuse, accepted pilot reuse, fresh remainder."""
from pathlib import Path
import hashlib,json,shutil,datetime
B=Path(__file__).resolve().parent;R=B.parents[2];O=B/'production-v1';S=O/'stage';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();dump=lambda p,j:p.write_text(json.dumps(j,indent=2)+'\n')
proof=json.loads((B/'source-proof-v1.json').read_text());lock=json.loads((B/'source-lock.json').read_text());assert proof['failures']==0 and proof['source_lock_sha256']==sha(B/'source-lock.json');assert not O.exists()
for rel,w in lock['stage_files'].items():assert sha(B/'stage'/rel)==w
images=list((B/'pilot-v1/building.SA.hq/contacts').glob('*@1x.png'))+[B/'pilot-v1/building.SA.hq/contacts/ui-before-after@1x-2x.png'];assert len(images)==6
dump(B/'parent-native-SA-approval.json',{'received_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reviewer':'parent root direct native image review','candidate_sha256':lock['candidate_sha256'],'images':{str(p.relative_to(R)):sha(p) for p in images},'scope':'Bounded command silhouette, clear apron/door, coherent construction and critical crown loss accepted. Full28 export authorized after terminal control evidence. Strict pixel/PNG failures remain preserved, no complete-game claim.'})
S.mkdir(parents=True);sources={};origins={}
def put(p,rel):
 d=S/rel;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,d);assert sha(p)==sha(d);sources[rel]=sha(d);origins[rel]={'path':str(p.relative_to(R)),'sha256':sha(p)}
for rel,w in lock['stage_files'].items():
 if rel.startswith('assets/pipeline/specs/') and Path(rel).stem not in lock['targets']:continue
 put(B/'stage'/rel,rel)
for name in ['check-one.py','derive-ui.py','packed-contact.py']:put(R/'work/art/building-roster'/name,'work/art/building-roster/'+name)
put(R/'work/art/ground-launcher-charge-contract-v1/production-v2/stage/assets/pipeline/blender/render_reuse.py','assets/pipeline/blender/render_reuse.py')
# Keep the accepted small-asset packer; no optimization-only helper amendment here.
manifest=R/'work/art/ground-launcher-charge-contract-v1/production-v2/stage/assets/manifest/asset-manifest.json';put(manifest,'assets/manifest/asset-manifest.json')
entries={e['id']:e for e in json.loads(manifest.read_text())['entries']};refs=json.loads((B/'references-v1/receipt.json').read_text());refmap={x['copy']:x['sha256'] for x in refs['files'] if 'copy'in x};inventory=[]
for aid in lock['targets']:
 specpath=S/'assets/pipeline/specs'/f'{aid}.json';spec=json.loads(specpath.read_text());assert spec['states']==entries[aid]['spec']['states'];assert sum(x['directions']*x['frames'] for x in spec['states'])==28
 old=R/'work/art/building-runtime-handoffs-v1'/aid/'stage';config=[]
 # Every renderer setting dependency and spec matches the historical source used by terminal PNGs.
 for rel in ['assets/pipeline/blender/fclib.py','assets/pipeline/blender/team_mask_png.py','assets/pipeline/blender/models/building_common.py','assets/pipeline/blender/render_asset.py',f'assets/pipeline/specs/{aid}.json']:
  assert sha(old/rel)==sha(S/rel),rel;config.append({'path':rel,'sha256':sha(S/rel)})
 assert sha(old/'assets/pipeline/blender/models/building_roster.py')==lock['baseline_sha256']
 target=next(x for x in proof['targets'] if x['id']==aid);assert target['rendered_source_terminal_exact']==['foundation/d00_f00','rubble/d00_f00']
 render=json.loads((B/'pilot-v1'/aid/'render.json').read_text());assert render['source_lock_sha256']==sha(B/'source-lock.json');assert json.loads((B/'pilot-v1'/aid/'check.json').read_text())['failures']==0
 files={};tuples={}
 for row in render['records']:
  terminal=row['key'].split('/')[0] in ('foundation','rubble');tuples[row['key']]='exact historical terminal' if terminal else 'accepted candidate pilot'
  for rel,w in row['files'].items():
   p=B/'references-v1'/aid/'raw'/rel if terminal else B/'pilot-v1'/aid/rel
   want=refmap[str(p.relative_to(B))] if terminal else w;assert sha(p)==want
   d=S/'assets/build/frames'/aid/rel;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,d);assert sha(d)==want
   files[rel]={'sha256':want,'source':str(p.relative_to(R)),'lineage':tuples[row['key']]}
 assert len(tuples)==15
 reuse=S/'work/reuse'/f'{aid}.json';reuse.parent.mkdir(parents=True,exist_ok=True)
 dump(reuse,{'id':aid,'model_sha256':lock['candidate_sha256'],'spec_sha256':sha(specpath),'files':files,'poses':15,'terminal_render_configuration':config,'source_proof_sha256':sha(B/'source-proof-v1.json'),'terminal_controls_sha256':sha(B/'terminal-controls-v1/comparison.json'),'scope':'Two byte-exact historical terminal PNG poses under exact rendered-source/config equivalence, plus13 accepted candidate pilot poses. All current hardpoints are regenerated. Rerender strict pixel/PNG failures remain failed; no tolerance applied.'})
 for folder in ['portraits','icons/build']:
  for layer in ['beauty','team']:
   rel=f'assets/build/ui/{folder}/{aid}@2x.{layer}.png';p=B/'stage'/rel;d=S/rel;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,d);assert sha(p)==sha(d)
 inventory.append({'id':aid,'poses':28,'exact_reused':15,'fresh':13,'reuse_sha256':sha(reuse)})
family=S/'work/art/building-roster';dump(family/'production-lock.json',{'assets':lock['targets'],'sources':sources,'scope':'Private full HQ source correction, no live publication.'})
dump(O/'preparation.json',{'source_proof_sha256':sha(B/'source-proof-v1.json'),'terminal_control_sha256':sha(B/'terminal-controls-v1/comparison.json'),'candidate_model_sha256':lock['candidate_sha256'],'inputs':origins,'assets':inventory,'manifest_exact_sha256':sha(manifest),'attribution':'Original Codex quota-fallback building family; exact Claude SY/SA HQ identity correction; Codex proof and pipeline operation.','limitations':'Strict terminal render pixel and PNG equality failures remain preserved. Exact copied terminal PNGs are a separate proven source/config reuse path. No runtime/final style claim.'})
print('FC_HQ_FULL_PREPARED',56,30,26)
