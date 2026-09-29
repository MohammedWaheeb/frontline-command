"""15 selected source poses per HQ in isolated tree; original exports unchanged."""
from pathlib import Path
import hashlib,importlib.util,json,sys,time
B=Path(__file__).resolve().parent;S=B/'stage';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();lock=json.loads((B/'source-lock.json').read_text());proof=json.loads((B/'source-proof-v1.json').read_text());assert proof['failures']==0 and proof['source_lock_sha256']==sha(B/'source-lock.json');aid=sys.argv[sys.argv.index('--')+1];assert aid in lock['targets']
for rel,w in lock['stage_files'].items():assert sha(S/rel)==w,rel
sys.path[:0]=[str(S/'assets/pipeline/blender'),str(S/'assets/pipeline/blender/models')];import fclib,building_roster
spec=json.loads((S/'assets/pipeline/specs'/f'{aid}.json').read_text());states={s['name']:s for s in spec['states']};plan=json.loads((B/'pilot-plan.json').read_text())[aid];assert len(plan)==15;out=B/'pilot-v1'/aid;assert not out.exists();out.mkdir(parents=True)
fclib.reset();fclib.setup_camera(*spec['canvas'],spec['anchor']);fclib.setup_lights(spec.get('sun_strength',3.3));rig=building_roster.build(spec['faction'],spec['params']);fclib.save_blend(str(out/f'{aid}-pilot.blend'));records=[];started=time.time()
for row in plan:
 st=states[row['state']];f=row['frame'];visible,shadow=building_roster.pose(rig,st,f,0);fclib.bpy.context.view_layer.update();key=f"{st['name']}/d00_f{f:02d}";layers=st.get('layers',spec['passes']);paths={layer:out/layer/(key+'.png') for layer in layers}
 for p in paths.values():p.parent.mkdir(parents=True,exist_ok=True)
 fclib.render_passes(rig,visible,{k:str(v) for k,v in paths.items()},layers=layers,shadow_objs=shadow)
 records.append({'key':key,'files':{str(p.relative_to(out)):sha(p) for p in paths.values()},'hardpoints':{k:fclib.project_px(o.matrix_world.translation) for k,o in rig.hardpoints.items()}})
(out/'render.json').write_text(json.dumps({'id':aid,'scope':'15 selected native source poses, not full28 or final style acceptance; fresh standard UI follows.','source_lock_sha256':sha(B/'source-lock.json'),'source_proof_sha256':sha(B/'source-proof-v1.json'),'records':records,'seconds':round(time.time()-started,1)},indent=2)+'\n');print('FC_HQ_ROLE_PILOT_DONE',aid,len(records),flush=True)
