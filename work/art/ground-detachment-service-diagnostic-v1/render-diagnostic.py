"""Actual original-source membership/contact diagnostic; sole Blender only."""
from pathlib import Path
import hashlib,importlib.util,json,sys
BASE=Path(__file__).resolve().parent;REPO=BASE.parents[2]
FAMILY=REPO/'work/art/vehicle-final-production-v1';lockpath=FAMILY/'production-lock.json';lock=json.loads(lockpath.read_text());STAGE=REPO/lock['stage']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for rel,want in lock['sources'].items():assert sha(STAGE/rel)==want,rel
sys.path[:0]=[str(STAGE/'assets/pipeline/blender'),str(STAGE/'assets/pipeline/blender/models')]
import fclib,vehicle_roster as model
from mathutils import Vector
from mathutils.bvhtree import BVHTree
OUT=BASE/'original-v1';assert not OUT.exists();OUT.mkdir()
report={'scope':'Original-source diagnostic only; declared layers/cameras/anchors. No source edit or full/rendered-game acceptance.','source_lock_sha256':sha(lockpath),'source_sha256':sha(STAGE/'assets/pipeline/blender/models/vehicle_roster.py'),'helper_sha256':sha(STAGE/'assets/pipeline/blender/fclib.py'),'script_sha256':sha(Path(__file__)),'assets':[],'failures':0}
def tree(obj):
 deps=fclib.bpy.context.evaluated_depsgraph_get();ev=obj.evaluated_get(deps);mesh=ev.to_mesh()
 try:return BVHTree.FromPolygons([obj.matrix_world@v.co for v in mesh.vertices],[tuple(p.vertices) for p in mesh.polygons],all_triangles=False)
 finally:ev.to_mesh_clear()
try:
 for aid in ['unit.IR.aa','unit.IR.tank','unit.IR.repair']:
  path=STAGE/'assets/pipeline/specs'/(aid+'.json');spec=json.loads(path.read_text());fclib.reset();fclib.setup_camera(*spec['canvas'],spec['anchor']);fclib.setup_lights(spec.get('sun_strength',3.3));rig=model.build(spec['faction'],spec['params']);B=rig.vb
  plan=[(name,f) for name,f in ([('idle',0),('work_repair',0),('work_repair',2),('work_repair',4)] if aid=='unit.IR.repair' else [('idle',0),('damaged',0),('wreck',0)])]
  row={'id':aid,'spec_sha256':sha(path),'canvas':spec['canvas'],'anchor':spec['anchor'],'tuples':[]}
  for name,f in plan:
   st=next(s for s in spec['states'] if s['name']==name)
   for d in [3,7,11,15]:
    visible,shadow=model.pose(rig,st,f,d);fclib.bpy.context.view_layer.update();names={o.name for o in visible};shadow_names={o.name for o in shadow};key=f'{name}/d{d:02d}_f{f:02d}'
    rec={'key':key,'part':st['part'],'layers':st['layers']}
    if aid!='unit.IR.repair':
     rec['flaps']={str(sy):{'body_visible':f'flap_{sy}' in names,'paint_visible':f'flap_team_{sy}' in names,'body_shadow':f'flap_{sy}' in shadow_names,'paint_shadow':f'flap_team_{sy}' in shadow_names} for sy in [-1,1]}
    else:
     core=next(o for o in B.objs['hull'] if o.name=='workshop');core_tree=tree(core);root_inv=B.root.matrix_world.inverted();panels={}
     for hinge,sy in B.h['panels']:
      panel=next(o for o in B.objs['hull'] if o.parent==hinge and o.type=='MESH');point=root_inv@panel.matrix_world.translation
      panels[str(sy)]={'panel_center_local':list(point),'closed_side_plane_abs_y':.305,'signed_outward_displacement':float(sy*point.y-.305),'core_surface_crossings':len(core_tree.overlap(tree(panel)))}
     rec['panels']=panels;rec['tool_center_rays']=[]
     for obj in B.objs['hull']:
      if not obj.name.startswith('tool_'):continue
      target=obj.matrix_world.translation;sy=1 if (root_inv@target).y>0 else -1;direction=B.root.matrix_world.to_3x3()@Vector((0,-sy,0));origin=target-direction
      hit,normal,index,distance=core_tree.ray_cast(origin,direction,1.0)
      rec['tool_center_rays'].append({'tool':obj.name,'core_hit_before_center':hit is not None and distance<1-1e-6,'core_to_center_distance':float(1-distance) if hit is not None else None})
    paths={layer:str(OUT/'frames'/aid/layer/(key+'.png')) for layer in st['layers']}
    for p in paths.values():Path(p).parent.mkdir(parents=True,exist_ok=True)
    fclib.render_passes(rig,visible,paths,layers=st['layers'],shadow_objs=shadow);row['tuples'].append(rec)
  report['assets'].append(row);print('FC_GROUND_ORIGINAL_DIAGNOSTIC_ASSET',aid,len(row['tuples']),flush=True)
 report['files']={str(p.relative_to(OUT)):sha(p) for p in sorted((OUT/'frames').rglob('*.png'))};(OUT/'result.json').write_text(json.dumps(report,indent=2)+'\n');print('FC_GROUND_ORIGINAL_DIAGNOSTIC_DONE',sum(len(a['tuples']) for a in report['assets']),flush=True)
except Exception as error:
 report.update(failures=1,error=repr(error));(OUT/'result.json').write_text(json.dumps(report,indent=2)+'\n');raise
