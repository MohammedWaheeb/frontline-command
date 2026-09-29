"""Sole-Blender source proof, queued after US/SY exports; no pixel rendering."""
from pathlib import Path
import hashlib,importlib.util,json,sys,math
B=Path(__file__).resolve().parent;R=B.parents[3];BASE=B.parent/'candidate-v1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
digest=lambda x:hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':')).encode()).hexdigest()
audit=json.loads((B/'read-only-source-audit.json').read_text());lock=json.loads((BASE/'source-lock.json').read_text());sys.path.insert(0,str(R/'assets/pipeline/blender'))
import fclib
from mathutils import Vector
assert sha(Path(fclib.__file__))==lock['fclib_sha256']
def load(name,path,want):
 assert sha(path)==want
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
before=load('sa_shell_before',BASE/'candidate-vehicle_roster.py',audit['baseline_sha256']);after=load('sa_shell_after',B/'candidate-vehicle_roster.py',audit['candidate_sha256'])
rounds=lambda row:[round(float(x),9) for x in row]
def mats():
 result={}
 for m in sorted(fclib.bpy.data.materials,key=lambda x:x.name):
  vals=[]
  if not m.node_tree:continue
  for n in sorted(m.node_tree.nodes,key=lambda x:x.name):
   for s in n.inputs:
    if not hasattr(s,'default_value'):continue
    v=s.default_value
    if isinstance(v,(float,int)):v=round(float(v),9)
    elif type(v).__name__ in ('bpy_prop_array','Vector','Color'):v=rounds(v)
    else:continue
    vals.append((n.name,s.name,v))
  result[m.name]=vals
 return result

def geo(objects):
 return {o.name:digest({'type':o.type,'parent':o.parent.name if o.parent else None,'vertices':[rounds(v.co) for v in o.data.vertices] if o.type=='MESH' else None,'faces':sorted((list(p.vertices),int(p.material_index),bool(p.use_smooth)) for p in o.data.polygons) if o.type=='MESH' else None,'materials':[m.name for m in o.data.materials] if o.type=='MESH' else None}) for o in objects}
def build(m,s):
 fclib.reset();fclib.setup_camera(*s['canvas'],s['anchor']);rig=m.build(s['faction'],s['params']);return rig,sorted(rig.original,key=lambda x:x.name)
def snap(m,rig,objects,st,d,f):
 vis,shadow=m.pose(rig,st,f,d);fclib.bpy.context.view_layer.update()
 return {'transforms':{o.name:rounds(v for row in o.matrix_world for v in row) for o in objects},'visible':sorted(o.name for o in vis),'shadow':sorted(o.name for o in shadow),'materials':mats(),'hardpoints':{n:rounds(o.matrix_world.translation) for n,o in rig.hardpoints.items()}},vis,shadow
rows=[];total=reverse=changed_count=0;containment=0
for rel,want in sorted(lock['specs'].items()):
 p=R/rel;assert sha(p)==want;s=json.loads(p.read_text());cp=BASE/'specs'/p.name
 if cp.exists():assert sha(cp)==lock['candidate_specs'][str(cp.relative_to(R))];s=json.loads(cp.read_text())
 aid=s['id'];poses=[(st,d,f) for st in s['states'] for d in range(st['directions']) for f in range(st['frames'])]
 rig,objects=build(before,s);oldgeo=geo(objects);oldmats=mats();old={}
 for st,d,f in poses:
  key=f"{st['name']}/d{d:02d}_f{f:02d}";value,_,_=snap(before,rig,objects,st,d,f);old[key]=value if aid=='unit.SA.launcher' else digest(value)
 rig,objects=build(after,s);newgeo=geo(objects);newmats=mats();shell=set(o.name for o in rig.vb.h.get('empty_shell',[]));sealed=set(o.name for o in rig.vb.h.get('sealed_canister',[]))
 if aid=='unit.SA.launcher':
  assert len(shell)==4 and len(sealed)==1
  assert set(newgeo)-set(oldgeo)==shell and {k:v for k,v in newgeo.items() if k not in shell}==oldgeo
  assert set(newmats)-set(oldmats)=={'vr_spent_liner'} and {k:v for k,v in newmats.items() if k in oldmats}==oldmats
 else:assert newgeo==oldgeo and newmats==oldmats,(aid,'geometry/materials')
 signatures={}
 for st,d,f in poses:
  key=f"{st['name']}/d{d:02d}_f{f:02d}";value,visible,shadow=snap(after,rig,objects,st,d,f);signatures[key]=digest(value)
  if aid!='unit.SA.launcher':assert digest(value)==old[key],(aid,key,'unrelated');total+=1;continue
  changed=st['name'] in ('idle_charges_0','move_charges_0','damaged_charges_0','deploy_charges_0','ready_empty')
  clean={**value,'transforms':{k:v for k,v in value['transforms'].items() if k not in shell},'materials':{k:v for k,v in value['materials'].items() if k!='vr_spent_liner'}}
  previous=old[key]
  assert clean['transforms']==previous['transforms'] and clean['materials']==previous['materials'] and clean['hardpoints']==previous['hardpoints'],(key,'nonpayload transform/material/hardpoint')
  for layer in ['visible','shadow']:
   expected=(set(previous[layer])-sealed)|shell if changed else set(previous[layer]);assert set(value[layer])==expected,(key,layer)
  if changed:
   changed_count+=1
   box=fclib.bpy.data.objects[next(iter(sealed))];inv=box.matrix_world.inverted();bounds=list(map(Vector,box.bound_box));lo=[min(v[i] for v in bounds) for i in range(3)];hi=[max(v[i] for v in bounds) for i in range(3)]
   deps=fclib.bpy.context.evaluated_depsgraph_get()
   for o in rig.vb.h['empty_shell']:
    evaluated=o.evaluated_get(deps);mesh=evaluated.to_mesh()
    try:
     for v in mesh.vertices:
      point=inv@o.matrix_world@v.co;assert all(lo[i]-1e-6<=point[i]<=hi[i]+1e-6 for i in range(3)),(key,o.name,'outside original canister envelope',list(point),lo,hi);containment+=1
    finally:evaluated.to_mesh_clear()
  else:total+=1
  points=[fclib.project_px(o.matrix_world@Vector(v)) for o in visible if o.type=='MESH' for v in o.bound_box]
  bb=[min(x[0] for x in points),min(x[1] for x in points),max(x[0] for x in points),max(x[1] for x in points)]
  assert all(math.isfinite(x) for x in bb) and bb[0]>=2 and bb[1]>=2 and bb[2]<s['canvas'][0]-2 and bb[3]<s['canvas'][1]-2,(key,'bounds',bb)
 for st,d,f in reversed(poses):
  key=f"{st['name']}/d{d:02d}_f{f:02d}";value,_,_=snap(after,rig,objects,st,d,f);assert digest(value)==signatures[key],(aid,key,'reset');reverse+=1
 rows.append({'id':aid,'poses':len(poses),'geometry_sha256':digest(newgeo),'pose_sha256':digest(signatures),'unrelated_exact':aid!='unit.SA.launcher'})
 print('FC_SA_SHELL_SOURCE_ASSET',aid,len(poses),flush=True)
assert len(rows)==27 and changed_count==272 and reverse==9424 and total==9152,(len(rows),changed_count,reverse,total)
out=B/'source-proof-v4.json';assert not out.exists();out.write_text(json.dumps({'polygon_order_control_sha256':sha(B/'old-source-face-order-control-v1.json'),'scope':'Exact vertex/oriented-face/material/source/pose equality after sorting polygon rows only, as proven by unchanged-source control; original raw-order FAIL remains preserved. Exact source/pose equality and evaluated shell containment in original canister envelope. Containment tolerance1e-6 BU is floating point coordinate conversion, not a render comparison tolerance. Existing canister cradle mounting overlap retained; explicit new shell contact proof and native pixels remain separate.','source_sha256':sha(B/'candidate-vehicle_roster.py'),'baseline_sha256':sha(BASE/'candidate-vehicle_roster.py'),'script_sha256':sha(Path(__file__)),'failures':0,'unchanged_pose_comparisons':total,'changed_sa_empty_poses':changed_count,'reverse_checks':reverse,'evaluated_shell_vertex_containment_checks':containment,'rows':rows},indent=2)+'\n')
print('FC_SA_SHELL_SOURCE_PROOF_DONE',total,changed_count,reverse,flush=True)
