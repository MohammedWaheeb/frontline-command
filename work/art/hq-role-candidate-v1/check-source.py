"""Queued sole-Blender exact unrelated proof and evaluated HQ geometry audit."""
from pathlib import Path
import hashlib,importlib.util,json,sys,math,ast
B=Path(__file__).resolve().parent;R=B.parents[2];S=B/'stage';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();lock=json.loads((B/'source-lock.json').read_text());digest=lambda x:hashlib.sha256(json.dumps(x,sort_keys=True).encode()).hexdigest()
for rel,w in lock['stage_files'].items():assert sha(S/rel)==w,rel
sys.path[:0]=[str(S/'assets/pipeline/blender'),str(S/'assets/pipeline/blender/models')];import fclib
from mathutils import Vector
helper=B/'signature-reference.py';assert sha(helper)==lock['signature_reference_sha256'];defs=[n for n in ast.parse(helper.read_text()).body if isinstance(n,ast.FunctionDef) and n.name=='materials'];assert len(defs)==1;exec(compile(ast.Module(body=defs,type_ignores=[]),str(helper),'exec'),globals())
def load(name,p,w):
 assert sha(p)==w;t=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(t);t.loader.exec_module(m);return m
old=load('hq_before',B/'baseline-building_roster.py',lock['baseline_sha256']);new=load('hq_after',B/'candidate-building_roster.py',lock['candidate_sha256'])
rr=lambda values:[round(float(v),9) for v in values]
def setup(module,spec):
 fclib.reset();fclib.setup_camera(*spec['canvas'],spec['anchor']);return module.build(spec['faction'],spec['params'])
def geo(rig):
 result={}
 for o in sorted(rig.original,key=lambda x:x.name):
  mods=[(m.name,m.type,getattr(m,'operation',None),getattr(m,'solver',None),m.object.name if getattr(m,'object',None) else None) for m in o.modifiers]
  result[o.name]={'type':o.type,'parent':o.parent.name if o.parent else None,'vertices':[rr(v.co) for v in o.data.vertices] if o.type=='MESH' else None,'faces':sorted((list(p.vertices),int(p.material_index),bool(p.use_smooth)) for p in o.data.polygons) if o.type=='MESH' else None,'materials':[m.name for m in o.data.materials] if o.type=='MESH' else None,'modifiers':mods}
 return result

def snapshot(module,rig,st,d,f):
 visible,shadow=module.pose(rig,st,f,d);fclib.bpy.context.view_layer.update()
 value={'transforms':[(o.name,rr(v for row in o.matrix_world for v in row)) for o in sorted(rig.original,key=lambda x:x.name)],'visible':sorted(o.name for o in visible),'shadow':sorted(o.name for o in shadow),'materials':materials(),'hardpoints':{name:{'position':rr(o.matrix_world.translation),'parts':list(o.get('fc_parts',[]))} for name,o in rig.hardpoints.items()}}
 return value,visible,shadow

def whole(module,spec,reverse=False):
 rig=setup(module,spec);geometry=geo(rig);poses=[(s,d,f) for s in spec['states'] for d in range(s['directions']) for f in range(s['frames'])];results={}
 for s,d,f in poses:results[f"{s['name']}/d{d:02d}_f{f:02d}"]=digest(snapshot(module,rig,s,d,f)[0])
 if reverse:
  for s,d,f in reversed(poses):assert digest(snapshot(module,rig,s,d,f)[0])==results[f"{s['name']}/d{d:02d}_f{f:02d}"],(spec['id'],'reverse',s['name'],f)
 return {'geometry':digest(geometry),'height':rig.height,'footprint':rig.footprint,'poses':results}

rows=[];target_rows=[]
for aid,w in sorted(lock['specs'].items()):
 p=S/'assets/pipeline/specs'/f'{aid}.json';assert sha(p)==w;spec=json.loads(p.read_text())
 if aid not in lock['targets']:
  a,b=whole(old,spec),whole(new,spec);assert a==b,(aid,'unrelated geometry/material/pose/hardpoint');rows.append({'id':aid,'poses':len(a['poses']),'signature_sha256':digest(a),'exact':True});print('FC_HQ_UNRELATED_EXACT',aid,len(a['poses']),flush=True);continue
 oldrig=setup(old,spec);oldgeometry=geo(oldrig);oldterminal={};oldpoints={}
 for st in spec['states']:
  for f in range(st['frames']):
   value,visible,shadow=snapshot(old,oldrig,st,0,f);key=f"{st['name']}/d00_f{f:02d}";oldpoints[key]=value['hardpoints']
   if st['name'] in ('foundation','rubble'):
    names=set(value['visible'])|set(value['shadow']);oldterminal[key]={'geometry':{k:v for k,v in oldgeometry.items() if k in names},'transforms':[x for x in value['transforms'] if x[0] in names],'visible':value['visible'],'shadow':value['shadow'],'materials':value['materials']}
 rig=setup(new,spec);newgeometry=geo(rig);newnames=set(newgeometry)-set(oldgeometry);assert rig.footprint==(4,4) and rig.height<=2.67
 reference=whole(new,spec,True);rig=setup(new,spec);points=[];terminal=[];state_bounds=[];cutter_checks=0;new_structure_bounds={}
 for st in spec['states']:
  for f in range(st['frames']):
   value,visible,shadow=snapshot(new,rig,st,0,f);key=f"{st['name']}/d00_f{f:02d}";assert digest(value)==reference['poses'][key]
   # Height-adjusted health/smoke markers are intentional; the rally anchor stays exact.
   assert set(value['hardpoints'])==set(oldpoints[key]);changes={name:{'old':oldpoints[key][name],'new':v} for name,v in value['hardpoints'].items() if v!=oldpoints[key][name]}
   assert all(name in ('healthbar','smoke_1','smoke_2') for name in changes),(aid,key,'unexpected hardpoint movement',changes)
   points.append({'key':key,'changes':changes})
   if st['name'] in ('foundation','rubble'):
    names=set(value['visible'])|set(value['shadow']);now={'geometry':{k:v for k,v in newgeometry.items() if k in names},'transforms':[x for x in value['transforms'] if x[0] in names],'visible':value['visible'],'shadow':value['shadow'],'materials':value['materials']};assert now==oldterminal[key],(aid,key,'foundation/rubble rendered-source parity');terminal.append(key)
   deps=fclib.bpy.context.evaluated_depsgraph_get();projected=[]
   for o in visible:
    if o.type!='MESH':continue
    e=o.evaluated_get(deps);mesh=e.to_mesh()
    try:
     vertices=[o.matrix_world@v.co for v in mesh.vertices];assert all(math.isfinite(v) for p in vertices for v in p),(aid,key,o.name,'finite')
     projected.extend(fclib.project_px(p) for p in vertices)
     if st['name']=='construct' and o in rig.structure:
      cut=max(.02,(f+1)/(st['frames']+1)*rig.height);assert all(p.z<=cut+1e-5 for p in vertices),(aid,key,o.name,'cutter leak',max(p.z for p in vertices),cut);cutter_checks+=1
     if st['name']=='idle' and o in rig.structure and vertices:
      lo=[min(p[i] for p in vertices) for i in range(3)];hi=[max(p[i] for p in vertices) for i in range(3)];assert lo[0]>=-2.000001 and lo[1]>=-2.000001 and hi[0]<=2.000001 and hi[1]<=2.000001,(aid,o.name,'outside footprint',lo,hi);assert hi[2]<=2.670001,(aid,o.name,'height',hi[2])
      if o.name in newnames:
       assert not (hi[0]>-.35 and lo[0]<.55 and lo[1]<-1),(aid,o.name,'door apron intrusion',lo,hi);new_structure_bounds[f'{f}:{o.name}']=[lo,hi]
    finally:e.to_mesh_clear()
   assert projected,(aid,key,'empty')
   bounds=[min(p[0] for p in projected),min(p[1] for p in projected),max(p[0] for p in projected),max(p[1] for p in projected)];assert bounds[0]>=2 and bounds[1]>=2 and bounds[2]<spec['canvas'][0]-2 and bounds[3]<spec['canvas'][1]-2,(aid,key,'canvas',bounds);state_bounds.append({'key':key,'bounds_px':bounds})
 target_rows.append({'id':aid,'poses':len(reference['poses']),'reverse_checks':len(reference['poses']),'height':rig.height,'rendered_source_terminal_exact':terminal,'hardpoint_changes':points,'evaluated_bounds':state_bounds,'construction_cutter_checks':cutter_checks,'new_structure_idle_bounds':new_structure_bounds,'source_signature_sha256':digest(reference)})
 print('FC_HQ_TARGET_SOURCE_DONE',aid,len(reference['poses']),flush=True)
assert len(rows)==57 and len(target_rows)==2
out=B/'source-proof-v1.json';assert not out.exists();out.write_text(json.dumps({'scope':'Source and evaluated geometry proof only; no pixel/visual acceptance. Unchanged terminal source is not claimed PNG identity until rendered controls.','source_lock_sha256':sha(B/'source-lock.json'),'candidate_sha256':lock['candidate_sha256'],'script_sha256':sha(Path(__file__)),'unrelated_variants':57,'unrelated_poses':sum(x['poses'] for x in rows),'target_poses':sum(x['poses'] for x in target_rows),'failures':0,'unrelated':rows,'targets':target_rows},indent=2)+'\n');print('FC_HQ_SOURCE_PROOF_DONE',57,sum(x['poses'] for x in rows),56,flush=True)
