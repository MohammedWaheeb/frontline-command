"""Bounded rear-door regression and recorded geometry parity; actual Blender pilot follows."""
import hashlib,importlib.util,json,sys,types,unittest
from pathlib import Path
import numpy as np
repo=Path(__file__).resolve().parents[3]
sys.path[:0]=[str(repo/'work/art/vehicle-roster'),str(repo/'work/art/vehicle-roster/preview'),str(repo/'assets/pipeline/blender/models')]
import fcpreview as fc
fc.install()
import vehicle_roster as vehicle
module_spec=importlib.util.spec_from_file_location('source_check',repo/'work/art/vehicle-roster/check-source.py')
check=importlib.util.module_from_spec(module_spec);module_spec.loader.exec_module(check)
base=repo/'work/art/vehicle-roster/apc-door-correction'
def spec(kind):return json.loads((repo/'assets/pipeline/specs'/('unit.'+kind+'.json')).read_text())
def build(module,kind):
 fc.reset();return module.build(kind[:2],{'kind':kind})
def geometry(rig):
 return [(o.name,o.parent.name if o.parent else None,None if o.verts is None else o.verts.tolist(),o.faces,(o.material.name,o.material.color,o.material.team,o.material.alpha) if o.material else None,o.visible_shadow,o.props) for o in rig.original]
def segment_hits(objects, start, end):
    """Möller–Trumbore intersections on recorded primitive triangles."""
    origin, finish = np.array(start), np.array(end)
    direction = finish - origin
    hits = []
    for obj in objects:
        points = obj.world_verts()
        for face in obj.faces:
            for k in range(1, len(face) - 1):
                a, b, c = points[[face[0], face[k], face[k + 1]]]
                edge1, edge2 = b - a, c - a
                h = np.cross(direction, edge2)
                determinant = np.dot(edge1, h)
                if abs(determinant) < 1e-9:
                    continue
                offset = origin - a
                u = np.dot(offset, h) / determinant
                q = np.cross(offset, edge1)
                v = np.dot(direction, q) / determinant
                t = np.dot(edge2, q) / determinant
                if 0 <= u <= 1 and 0 <= v and u + v <= 1 and 0 <= t <= 1:
                    hits.append((float(t), obj.name))
    return sorted(hits)

class Doors(unittest.TestCase):
 def test_open_rear_aperture_and_closed_reset(self):
  rig=build(vehicle,'SY.apc');states={s['name']:s for s in spec('SY.apc')['states']}
  for name,frame,closed in [('idle',0,True),('doors_open',3,False),('idle',0,True)]:
   visible,_=vehicle.pose(rig,states[name],frame,0)
   for y in (-.10,.10):
    hits=segment_hits(visible,(-1.,y,.40),(-.10,y,.40))
    if closed:self.assertTrue(any(n.startswith('rear_door_') for _,n in hits),(name,y,hits))
    else:self.assertFalse(hits,(name,y,hits))
 def test_leaves_swing_outward_and_gun_pivot_stays_fixed(self):
  rig=build(vehicle,'SY.apc');states={s['name']:s for s in spec('SY.apc')['states']}
  for frame in range(4):
   vehicle.pose(rig,states['doors_open'],frame,0)
   for leaf in [o for o in rig.original if o.name in ('rear_door_1','rear_door_-1')]:
    self.assertLess(float(leaf.world_verts()[:,0].mean()),-.63)
   self.assertEqual(tuple(rig.vb.pivot),(.02,0.,.58))
 def test_sy_turret_geometry_and_visible_poses_unchanged(self):
  original=types.ModuleType('original_vehicle_turret');exec(compile((base/'before-vehicle_roster.py').read_text(),'<frozen-original>','exec'),original.__dict__)
  definition=spec('SY.apc');poses=[(st,d,f) for st in definition['states'] if st.get('part')=='turret' for d in range(st['directions']) for f in range(st['frames'])]
  def turret_geometry(rig):return [r for r in geometry(rig) if r[0] in {o.name for o in rig.vb.objs['turret']}]
  def visible_signature(visible,shadow):return [(o.name,o.world_verts().round(9).tolist()) for o in visible],sorted(o.name for o in shadow),dict(fc.STATE)
  old=build(original,'SY.apc');old_geometry=turret_geometry(old);signatures=[]
  for st,d,f in poses:
   visible,shadow=original.pose(old,st,f,d);signatures.append(visible_signature(visible,shadow))
  new=build(vehicle,'SY.apc');self.assertEqual(turret_geometry(new),old_geometry)
  for i,(st,d,f) in enumerate(poses):
   visible,shadow=vehicle.pose(new,st,f,d);self.assertEqual(visible_signature(visible,shadow),signatures[i],(st['name'],d,f))
  (base/'sy-turret-parity.json').write_text(json.dumps({'geometry_equal':True,'turret_poses_equal':len(poses),'scope':'Recorded primitive mesh geometry/world vertices/layer membership/materials; preserved independent turret pixels can be combined with corrected hull.'},indent=2)+'\n')
 def test_other_26_geometry_and_all_poses_unchanged(self):
  original=types.ModuleType('original_vehicle')
  source=(base/'before-vehicle_roster.py').read_text();exec(compile(source,'<frozen-original-vehicle>','exec'),original.__dict__)
  reports=[]
  for kind in sorted(set(vehicle.KINDS)-{'SY.apc'}):
   definition=spec(kind);poses=[(s,d,f) for s in definition['states'] for d in range(s['directions']) for f in range(s['frames'])]
   old=build(original,kind);old_geometry=json.dumps(geometry(old),sort_keys=True);signatures=[]
   for state,direction,frame in poses:
    visible,shadows=original.pose(old,state,frame,direction);signatures.append(check.signature(old,visible,shadows))
   new=build(vehicle,kind);self.assertEqual(json.dumps(geometry(new),sort_keys=True),old_geometry,kind)
   for index,(state,direction,frame) in enumerate(poses):
    visible,shadows=vehicle.pose(new,state,frame,direction);self.assertEqual(check.signature(new,visible,shadows),signatures[index],(kind,state['name'],direction,frame))
   reports.append({'id':kind,'poses_unchanged':len(poses),'geometry_sha256':hashlib.sha256(old_geometry.encode()).hexdigest()})
  (base/'other-vehicle-parity.json').write_text(json.dumps({'scope':'Recorded primitive geometry, transforms, layer membership and materials; not rendered-pixel equivalence','other_vehicles':len(reports),'unchanged_poses':sum(r['poses_unchanged'] for r in reports),'entries':reports},indent=2)+'\n')
if __name__=='__main__':unittest.main(verbosity=2)
