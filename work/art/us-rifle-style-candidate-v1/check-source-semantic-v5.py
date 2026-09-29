"""Sole-Blender rifle spec-routing proof and 200-pose evaluated measurements."""
from pathlib import Path
import hashlib,importlib.util,json,sys,math
B=Path(__file__).resolve().parent;R=B.parents[2];S=B/'stage';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();lock=json.loads((B/'pilot-source-lock.json').read_text());digest=lambda v:hashlib.sha256(json.dumps(v,sort_keys=True).encode()).hexdigest()
for rel,w in lock['stage_files'].items():assert sha(S/rel)==w,rel
sys.path[:0]=[str(S/'assets/pipeline/blender'),str(S/'assets/pipeline/blender/models')];import fclib
from mathutils import Vector
rr=lambda values:[round(float(v),9) for v in values]
def load(name,p):
 t=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(t);t.loader.exec_module(m);return m
old=load('rifle_original',S/'assets/pipeline/blender/models/infantry.py');family=load('rifle_family',S/'assets/pipeline/blender/models/infantry_roster.py');control=load('rifle_family_control',R/'assets/pipeline/blender/models/infantry_roster.py');assert sha(S/'assets/pipeline/blender/models/infantry_roster.py')==sha(R/'assets/pipeline/blender/models/infantry_roster.py')
def materials():
 result=[]
 for m in sorted(fclib.bpy.data.materials,key=lambda x:x.name):
  if not m.node_tree:continue
  for n in sorted(m.node_tree.nodes,key=lambda x:x.name):
   for s in n.inputs:
    if not hasattr(s,'default_value'):continue
    v=s.default_value
    if isinstance(v,(int,float)):v=round(float(v),9)
    elif type(v).__name__ in ('bpy_prop_array','Vector','Color'):v=rr(v)
    else:continue
    result.append((m.name,n.name,s.name,v))
 return result

def cycle(v):
 return min(tuple(v[i:]+v[:i]) for i in range(len(v)))

def run(module,spec,evaluated=False):
 fclib.reset();fclib.setup_camera(*spec['canvas'],spec['anchor']);rig=module.build(spec['faction'],spec['params']);objects=sorted(rig.original if hasattr(rig,"original") else [rig.root,*rig.root.children_recursive],key=lambda x:x.name)
 geometry=digest([(o.name,o.type,o.parent.name if o.parent else None,[rr(v.co) for v in o.data.vertices] if o.type=='MESH' else None,sorted((cycle(list(p.vertices)),int(p.material_index),bool(p.use_smooth)) for p in o.data.polygons) if o.type=='MESH' else None,[m.name for m in o.data.materials] if o.type=='MESH' else None) for o in objects]);poses=[(s,d,f) for s in spec['states'] for d in range(s['directions']) for f in range(s['frames'])];signatures={};measurements=[];max_grip_error=0.0
 def pose(st,d,f):
  visible,shadow=module.pose(rig,st,f,d);fclib.bpy.context.view_layer.update()
  value={'transforms':[(o.name,rr(v for row in o.matrix_world for v in row)) for o in objects],'visible':sorted(o.name for o in visible),'shadow':sorted(o.name for o in shadow),'materials':materials(),'hardpoints':{k:{'position':rr(o.matrix_world.translation),'parts':list(o.get('fc_parts',[]))} for k,o in rig.hardpoints.items()}}
  return value,visible
 for st,d,f in poses:
  key=f"{st['name']}/d{d:02d}_f{f:02d}";value,visible=pose(st,d,f);signatures[key]=digest(value)
  if not evaluated:continue
  assert {'muzzle','healthbar'}<=set(rig.hardpoints),(key,'required hardpoints')
  hp={k:{'world_bu':rr(o.matrix_world.translation),'px_relative_anchor':[round(v-a,6) for v,a in zip(fclib.project_px(o.matrix_world.translation),spec['anchor'])]} for k,o in rig.hardpoints.items()};world=[];boots=[];deps=fclib.bpy.context.evaluated_depsgraph_get()
  for o in visible:
   if o.type!='MESH':continue
   e=o.evaluated_get(deps);mesh=e.to_mesh()
   try:
    points=[o.matrix_world@v.co for v in mesh.vertices];world.extend(points)
    if o.name.startswith('boot'):boots.extend(points)
   finally:e.to_mesh_clear()
  assert world and boots,(key,'nonempty evaluated body/feet')
  pixel=[fclib.project_px(p) for p in world];bb=[min(p[0] for p in pixel),min(p[1] for p in pixel),max(p[0] for p in pixel),max(p[1] for p in pixel)];assert all(math.isfinite(v) for v in bb) and bb[0]>=2 and bb[1]>=2 and bb[2]<spec['canvas'][0]-2 and bb[3]<spec['canvas'][1]-2,(key,'bounds',bb)
  grips=getattr(getattr(rig,'soldier',None),'grip_checks',[]);max_grip_error=max(max_grip_error,max((g['error'] for g in grips),default=0));assert all(g['error']<1e-5 for g in grips),(key,'grip error',grips)
  measurements.append({'key':key,'bounds_px':bb,'height_bu':[min(p.z for p in world),max(p.z for p in world)],'foot_min_z_bu':min(p.z for p in boots),'foot_lowest_projected_px_relative_anchor':max(fclib.project_px(p)[1]-spec['anchor'][1] for p in boots),'hardpoints':hp})
 for st,d,f in reversed(poses):assert digest(pose(st,d,f)[0])==signatures[f"{st['name']}/d{d:02d}_f{f:02d}"],(spec['id'],st['name'],d,f,'reverse reset')
 return {'geometry':geometry,'poses':signatures,'origin_relative_anchor':[round(v-a,6) for v,a in zip(fclib.project_px(Vector((0,0,0))),spec['anchor'])],'measurements':measurements,'max_grip_error_bu':max_grip_error}

original=json.loads((B/'reference-spec.json').read_text());candidate=json.loads((B/'unit.US.rifle.json').read_text());a,b=run(old,original,True),run(family,candidate,True);assert len(a['poses'])==len(b['poses'])==200;assert all(abs(x-y)<1e-4 for x,y in zip(a['origin_relative_anchor'],b['origin_relative_anchor'])),('ground origin',a['origin_relative_anchor'],b['origin_relative_anchor'])
comparisons=[]
for x,y in zip(a['measurements'],b['measurements']):
 assert x['key']==y['key'];assert x['hardpoints']['healthbar']['world_bu']==y['hardpoints']['healthbar']['world_bu'],(x['key'],'healthbar world point');assert all(abs(u-v)<1e-4 for u,v in zip(x['hardpoints']['healthbar']['px_relative_anchor'],y['hardpoints']['healthbar']['px_relative_anchor'])),(x['key'],'healthbar projection')
 comparisons.append({'key':x['key'],'old':x,'candidate':y})
print("FC_RIFLE_OLD_NEW_EVALUATED_DONE",200,flush=True)

rows=[]
for p in sorted((S/'assets/pipeline/specs').glob('unit.*.json')):
 if p.name=='unit.US.rifle.json':continue
 spec=json.loads(p.read_text());assert sha(p)==sha(R/p.relative_to(S));a,b=run(control,spec),run(family,spec);assert a==b,(spec['id'],'unchanged role geometry/pose/material/hardpoint');rows.append({'id':spec['id'],'poses':len(a['poses']),'signature_sha256':digest(a)});print('FC_RIFLE_OTHER_ROLE_EXACT',spec['id'],len(a['poses']),flush=True)
assert len(rows)==24
out=B/'source-proof-v5.json';assert not out.exists();out.write_text(json.dumps({'geometry_policy':'Exact vertex arrays and oriented polygon cycles/material indices/smoothing. Polygon rows sorted and cyclic starting index canonicalized; winding/vertices/materials/numerical values unchanged. Original raw-row and cycle-index failures preserved. Six unchanged-source controls passed exactly; no numerical tolerance.','scope':'Independent spec-route,24 unchanged role geometry/pose/material/hardpoint and200 old/new evaluated pose bounds, reverse reset and origin/healthbar checks. Muzzle remains named and finite but moves with the approved different anatomy/weapon. Body-height/team readability is measured for native review, not forced by rescaling.','candidate_spec_sha256':sha(B/'unit.US.rifle.json'),'source_lock_sha256':sha(B/'pilot-source-lock.json'),'script_sha256':sha(Path(__file__)),'unrelated_roles':rows,'new_poses':200,'new_reverse_checks':200,'old_reference_poses':200,'ground_origin_relative_anchor':{'old':a['origin_relative_anchor'],'new':b['origin_relative_anchor']},'old_signature_sha256':digest(a['poses']),'new_signature_sha256':digest(b['poses']),'max_grip_error_bu':b['max_grip_error_bu'],'additional_hardpoint':'work','comparisons':comparisons,'failures':0},indent=2)+'\n');print('FC_RIFLE_SOURCE_PROOF_DONE',24,200,flush=True)
