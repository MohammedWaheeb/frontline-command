"""Original frozen APC aperture/hinge evidence; sole Blender, no source edits."""
from pathlib import Path
import hashlib
import json
import sys

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[2]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
scope = json.loads((BASE / 'source-audit.json').read_text())
for relative, wanted in scope['inputs'].items():
    assert sha(REPO / relative) == wanted, relative
lock_path = REPO / scope['production_lock']
lock = json.loads(lock_path.read_text())
STAGE = REPO / lock['stage']
for relative, wanted in lock['sources'].items():
    assert sha(STAGE / relative) == wanted, relative
sys.path[:0] = [str(STAGE / 'assets/pipeline/blender'), str(STAGE / 'assets/pipeline/blender/models')]
import fclib
import vehicle_roster as model
from mathutils import Vector
from mathutils.bvhtree import BVHTree

OUT = BASE / 'original-v1'
assert not OUT.exists(), 'Preserve every previous attempt.'
OUT.mkdir()
report = {'scope': 'Original-source APC hull-layer diagnostic. Actual evaluated ramp/door motion and hull-only line-of-sight evidence; no geometry correction, assembled-turret review or runtime acceptance.',
          'source_audit_sha256': sha(BASE / 'source-audit.json'),
          'script_sha256': sha(Path(__file__)), 'assets': [], 'failures': 0}


def tree(obj):
    evaluated = obj.evaluated_get(fclib.bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    try:
        return BVHTree.FromPolygons([evaluated.matrix_world @ v.co for v in mesh.vertices],
                                   [tuple(p.vertices) for p in mesh.polygons], all_triangles=False)
    finally:
        evaluated.to_mesh_clear()


try:
    for aid in ['unit.US.apc', 'unit.IR.apc', 'unit.SA.apc']:
        path = STAGE / 'assets/pipeline/specs' / (aid + '.json')
        spec = json.loads(path.read_text())
        fclib.reset()
        fclib.setup_camera(*spec['canvas'], spec['anchor'])
        fclib.setup_lights(spec.get('sun_strength', 3.3))
        rig = model.build(spec['faction'], spec['params'])
        B = rig.vb
        idle = next(s for s in spec['states'] if s['name'] == 'idle')
        opened = next(s for s in spec['states'] if s['name'] == 'doors_open')
        model.pose(rig, idle, 0, 0)
        fclib.bpy.context.view_layer.update()
        by_name = {o.name: o for o in B.objs['hull']}
        core = by_name['hull']
        door_names = ['door_-1', 'door_1'] if aid == 'unit.IR.apc' else ['ramp']
        closed_inverse = B.root.matrix_world.inverted()
        closed = {name: closed_inverse @ by_name[name].matrix_world.translation for name in door_names}
        row = {'id': aid, 'spec_sha256': sha(path), 'canvas': spec['canvas'], 'anchor': spec['anchor'], 'tuples': []}
        for state, frame in [(idle, 0), (opened, 0), (opened, opened['frames'] - 1)]:
            for direction in [3, 7, 11, 15]:
                visible, shadow = model.pose(rig, state, frame, direction)
                fclib.bpy.context.view_layer.update()
                root_inverse = B.root.matrix_world.inverted()
                core_tree = tree(core)
                key = f"{state['name']}/d{direction:02d}_f{frame:02d}"
                rec = {'key': key, 'part': state['part'], 'layers': state['layers'], 'doors': {}}
                for name in door_names:
                    obj = by_name[name]
                    local = root_inverse @ obj.matrix_world.translation
                    side = int(name.rsplit('_', 1)[1]) if name.startswith('door_') else 0
                    outward = Vector((0, side, 0)) if side else Vector((-1, 0, 0))
                    panel = by_name['door_hole_' + str(side)] if side else by_name['ramp_interior']
                    target = panel.matrix_world.translation
                    outward_world = B.root.matrix_world.to_3x3() @ outward
                    origin = target + outward_world * 0.8
                    hit, normal, index, distance = core_tree.ray_cast(origin, -outward_world, 0.8)
                    rec['doors'][name] = {
                        'visible': obj in visible, 'shadow_visible': obj in shadow,
                        'center_local': list(local), 'closed_center_local': list(closed[name]),
                        'signed_outward_displacement_bu': float((local - closed[name]).dot(outward)),
                        'hull_surface_crossing_count': len(core_tree.overlap(tree(obj))),
                        'interior_plate': panel.name, 'interior_plate_visible_membership': panel in visible,
                        'hull_blocks_outside_ray_to_interior_center': hit is not None and distance < 0.8 - 1e-6,
                        'hull_hit_distance_bu': float(distance) if hit is not None else None,
                        'ray_scope': 'Hull-only direct exterior ray toward dark plate center; not a general containment or full-scene visibility proof.'}
                paths = {layer: str(OUT / 'frames' / aid / layer / (key + '.png')) for layer in state['layers']}
                for p in paths.values():
                    Path(p).parent.mkdir(parents=True, exist_ok=True)
                fclib.render_passes(rig, visible, paths, layers=state['layers'], shadow_objs=shadow)
                row['tuples'].append(rec)
        report['assets'].append(row)
        print('FC_APC_ORIGINAL_APERTURE_ASSET', aid, len(row['tuples']), flush=True)
    report['files'] = {str(p.relative_to(OUT)): sha(p) for p in sorted((OUT / 'frames').rglob('*.png'))}
    (OUT / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
    print('FC_APC_ORIGINAL_APERTURE_DONE 36', flush=True)
except Exception as error:
    report.update(failures=1, error=repr(error))
    (OUT / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
    raise
