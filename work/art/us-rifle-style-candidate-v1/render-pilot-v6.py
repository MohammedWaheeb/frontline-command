"""50 selected poses in a private output; exact old raw references copied only."""
from pathlib import Path
import hashlib,importlib.util,json,sys,time,shutil
B=Path(__file__).resolve().parent;R=B.parents[2];S=B/'stage';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();lock=json.loads((B/'pilot-source-lock.json').read_text());proof=json.loads((B/'source-proof-v6.json').read_text());assert proof['failures']==0 and proof['source_lock_sha256']==sha(B/'pilot-source-lock.json')
for rel,w in lock['stage_files'].items():assert sha(S/rel)==w,rel
sys.path[:0]=[str(S/'assets/pipeline/blender'),str(S/'assets/pipeline/blender/models')];import fclib,infantry_roster
spec=json.loads((B/'unit.US.rifle.json').read_text());states={s['name']:s for s in spec['states']};plan=json.loads((B/'pilot-plan.json').read_text())['poses'];assert len(plan)==50
oldB=R/'work/art/legacy-us-rifle-ui-v1';handoff=oldB/'runtime-handoff.json';h=json.loads(handoff.read_text());identity=oldB/'original-identity.json';assert h['receipts'][str(identity.relative_to(R))]==sha(identity);raw=json.loads(identity.read_text());oldstage=R/h['stage']
out=B/'pilot-v1';assert not out.exists();out.mkdir();records=[]
for row in plan:
 st=states[row['state']];key=f"{st['name']}/d{row['direction']:02d}_f{row['frame']:02d}";files={}
 for layer in st.get('layers',spec['passes']):
  rel=f'assets/build/frames/unit.US.rifle/{layer}/{key}.png';p=oldstage/rel;assert sha(p)==raw[rel];dest=out/'before'/layer/(key+'.png');dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest);files[str(dest.relative_to(out))]=sha(dest)
 records.append({'folder':'before','key':key,'copied_unchanged_reference':True,'files':files})
fclib.reset();fclib.setup_camera(*spec['canvas'],spec['anchor']);fclib.setup_lights(spec.get('sun_strength',3.3));rig=infantry_roster.build(spec['faction'],spec['params']);fclib.save_blend(str(out/'unit.US.rifle-pilot.blend'));started=time.time()
for row in plan:
 st=states[row['state']];d,f=row['direction'],row['frame'];visible,shadow=infantry_roster.pose(rig,st,f,d);fclib.bpy.context.view_layer.update();key=f"{st['name']}/d{d:02d}_f{f:02d}";layers=st.get('layers',spec['passes']);paths={layer:out/'candidate'/layer/(key+'.png') for layer in layers}
 for p in paths.values():p.parent.mkdir(parents=True,exist_ok=True)
 fclib.render_passes(rig,visible,{k:str(v) for k,v in paths.items()},layers=layers,shadow_objs=shadow)
 records.append({'folder':'candidate','key':key,'files':{str(p.relative_to(out)):sha(p) for p in paths.values()},'hardpoints':{k:fclib.project_px(o.matrix_world.translation) for k,o in rig.hardpoints.items()}})
(out/'render.json').write_text(json.dumps({'scope':'50 native candidate tuples;50 old raw references copied exactly. Different canvas/anchor must be aligned by ground origin, never resized for comparison. Standard isolated UI follows separately.','candidate_spec_sha256':sha(B/'unit.US.rifle.json'),'source_proof_sha256':sha(B/'source-proof-v6.json'),'reference_handoff_sha256':sha(handoff),'records':records,'seconds':round(time.time()-started,1)},indent=2)+'\n');print('FC_RIFLE_STYLE_PILOT_DONE',50,50,flush=True)
