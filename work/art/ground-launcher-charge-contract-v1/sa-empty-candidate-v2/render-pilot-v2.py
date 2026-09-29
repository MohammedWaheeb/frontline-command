"""Sole-worker SA shell pilot, only after source/clearance proof. Never shipping."""
from pathlib import Path
import hashlib,importlib.util,json,sys,time,shutil
B=Path(__file__).resolve().parent;R=B.parents[3];BASE=B.parent/'candidate-v1';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
proof=json.loads((B/'source-proof-v4.json').read_text());assert proof['failures']==0
# A separate contact/clearance receipt is mandatory; containment alone is not a clearance waiver.
clear=json.loads((B/'clearance-v2.json').read_text());assert clear['failures']==0 and clear['candidate_sha256']==proof['source_sha256']
sys.path.insert(0,str(R/'assets/pipeline/blender'));import fclib
lock=json.loads((BASE/'source-lock.json').read_text());assert sha(Path(fclib.__file__))==lock['fclib_sha256']
def load(name,p,w):
 assert sha(p)==w;s=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
old=load('sa_pilot_old',BASE/'candidate-vehicle_roster.py',proof['baseline_sha256']);new=load('sa_pilot_new',B/'candidate-vehicle_roster.py',proof['source_sha256'])
sp=BASE/'specs/unit.SA.launcher.json';assert sha(sp)==lock['candidate_specs'][str(sp.relative_to(R))];spec=json.loads(sp.read_text());states={x['name']:x for x in spec['states']}
plan=next(x['poses'] for x in json.loads((B.parent/'pilot-plan.json').read_text()) if x['id']=='unit.SA.launcher');assert len(plan)==28
plan += [{'state':'ready_empty','direction':d,'frame':0} for d in [3,7,11,15]]
out=B/'pilot-v1';assert not out.exists();out.mkdir();records=[];started=time.time()
prior=BASE/'pilot-v1/unit.SA.launcher';receipt=json.loads((prior/'render.json').read_text())
for row in receipt['records']:
 if row['folder']!='before':continue
 files={}
 for rel,want in row['files'].items():
  source=prior/rel;assert sha(source)==want;dest=out/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,dest);files[rel]=want
 records.append({**row,'files':files,'copied_unchanged_baseline':True})
assert len(records)==28
for folder,module,items in [('before',old,[{'state':n,'direction':d,'frame':f} for n,f in [('fire',3),('ready_empty',0)] for d in [3,7,11,15]]),('candidate',new,plan)]:
 fclib.reset();fclib.setup_camera(*spec['canvas'],spec['anchor']);fclib.setup_lights(spec.get('sun_strength',3.3));rig=module.build(spec['faction'],spec['params'])
 if folder=='candidate':fclib.save_blend(str(out/'unit.SA.launcher-pilot.blend'))
 for row in items:
  st=states[row['state']];d,f=row['direction'],row['frame'];visible,shadow=module.pose(rig,st,f,d);fclib.bpy.context.view_layer.update();key=f"{st['name']}/d{d:02d}_f{f:02d}";layers=st.get('layers',spec['passes']);paths={layer:out/folder/layer/(key+'.png') for layer in layers}
  for p in paths.values():p.parent.mkdir(parents=True,exist_ok=True)
  fclib.render_passes(rig,visible,{k:str(v) for k,v in paths.items()},layers=layers,shadow_objs=shadow)
  records.append({'folder':folder,'key':key,'copied_unchanged_baseline':False,'files':{str(p.relative_to(out)):sha(p) for p in paths.values()},'hardpoints':{k:fclib.project_px(o.matrix_world.translation) for k,o in rig.hardpoints.items()}})
result={'id':'unit.SA.launcher','scope':'32 candidate tuples,8 new historical-source fire/ready references and28 exact earlier generic refs. No full export.','candidate_sha256':proof['source_sha256'],'spec_sha256':sha(sp),'proof_sha256':sha(B/'source-proof-v4.json'),'clearance_sha256':sha(B/'clearance-v2.json'),'source_lock_sha256':sha(BASE/'source-lock.json'),'records':records,'new_candidate_poses':32,'new_reference_poses':8,'exact_reused_reference_poses':28,'seconds':round(time.time()-started,1)}
(out/'render.json').write_text(json.dumps(result,indent=2)+'\n');print('FC_SA_SHELL_PILOT_DONE',len(records),flush=True)
