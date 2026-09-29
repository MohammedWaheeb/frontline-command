"""Evaluated triangle contact audit. No new contacts may be hidden by envelope claims."""
from pathlib import Path
import hashlib,importlib.util,json,sys,itertools
B=Path(__file__).resolve().parent;R=B.parents[3];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();proof=json.loads((B/'source-proof-v4.json').read_text());assert proof['failures']==0
sys.path.insert(0,str(R/'assets/pipeline/blender'));import fclib
from mathutils import Vector
from mathutils.bvhtree import BVHTree
p=B/'candidate-vehicle_roster.py';assert sha(p)==proof['source_sha256'];s=importlib.util.spec_from_file_location('sa_clearance',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
sp=B.parent/'candidate-v1/specs/unit.SA.launcher.json';spec=json.loads(sp.read_text());fclib.reset();rig=m.build(spec['faction'],spec['params']);shell=rig.vb.h['empty_shell'];sealed=rig.vb.h['sealed_canister'][0]
allrows=[];fail=[];mounts=set();max_internal_volume=0.0

def bounds(o):
 points=[o.matrix_world@Vector(v) for v in o.bound_box];return ([min(p[i] for p in points) for i in range(3)],[max(p[i] for p in points) for i in range(3)])
def overlap(a,b):return all(min(a[1][i],b[1][i])-max(a[0][i],b[0][i])>=-1e-7 for i in range(3))
def tree(o,deps):
 e=o.evaluated_get(deps);mesh=e.to_mesh()
 try:return BVHTree.FromPolygons([o.matrix_world@v.co for v in mesh.vertices],[list(p.vertices) for p in mesh.polygons],all_triangles=False,epsilon=0)
 finally:e.to_mesh_clear()
for st in spec['states']:
 if st['name'] not in ('idle_charges_0','move_charges_0','damaged_charges_0','deploy_charges_0','ready_empty'):continue
 for d in range(st['directions']):
  for f in range(st['frames']):
   visible,_=m.pose(rig,st,f,d);fclib.bpy.context.view_layer.update();deps=fclib.bpy.context.evaluated_depsgraph_get();key=f"{st['name']}/d{d:02d}_f{f:02d}";oldtree=tree(sealed,deps);oldbounds=bounds(sealed);newtrees={o.name:tree(o,deps) for o in shell};newbounds={o.name:bounds(o) for o in shell};oldcontacts=[];newcontacts=[]
   # Shared-face assembly is permitted, positive-volume overlap between shell walls is not.
   inv=sealed.parent.matrix_world.inverted();local={}
   for o in shell:
    points=[inv@o.matrix_world@Vector(v) for v in o.bound_box];local[o.name]=([min(p[i] for p in points) for i in range(3)],[max(p[i] for p in points) for i in range(3)])
   for a,b in itertools.combinations(shell,2):
    ext=[max(0,min(local[a.name][1][i],local[b.name][1][i])-max(local[a.name][0][i],local[b.name][0][i])) for i in range(3)];volume=ext[0]*ext[1]*ext[2];max_internal_volume=max(max_internal_volume,volume)
    if all(v>1e-6 for v in ext):fail.append({'key':key,'internal_positive_overlap':[a.name,b.name],'extent':ext})
   for o in visible:
    if o.type!='MESH' or o in shell or o==sealed:continue
    ob=bounds(o)
    if not overlap(oldbounds,ob) and not any(overlap(x,ob) for x in newbounds.values()):continue
    ot=tree(o,deps)
    if oldtree.overlap(ot):oldcontacts.append(o.name)
    hits=[name for name,t in newtrees.items() if overlap(newbounds[name],ob) and t.overlap(ot)]
    if hits:newcontacts.append({'object':o.name,'shell_pieces':hits})
   added=set(x['object'] for x in newcontacts)-set(oldcontacts)
   if added:fail.append({'key':key,'new_contact_objects':sorted(added),'baseline_contacts':oldcontacts})
   mounts.update(oldcontacts);allrows.append({'key':key,'original_canister_contact_objects':oldcontacts,'candidate_shell_contacts':newcontacts,'new_contact_objects':sorted(added)})
assert len(allrows)==272,len(allrows)
out=B/'clearance-v2.json';assert not out.exists();out.write_text(json.dumps({'scope':'All272 affected poses/all16 headings. Evaluated triangle contact against visible unchanged body geometry; no new external contact objects allowed beyond original canister. Existing mounting intersections remain explicitly listed. Shell parts may meet on faces but must have no positive-volume local overlap. No pixel acceptance.','candidate_sha256':proof['source_sha256'],'proof_sha256':sha(B/'source-proof-v4.json'),'script_sha256':sha(Path(__file__)),'checked_poses':len(allrows),'max_internal_overlap_volume_bu3':max_internal_volume,'existing_mount_contacts':sorted(mounts),'failures':len(fail),'failure_records':fail,'rows':allrows},indent=2)+'\n')
assert not fail,fail[:8]
print('FC_SA_SHELL_CLEARANCE_DONE',len(allrows),flush=True)
