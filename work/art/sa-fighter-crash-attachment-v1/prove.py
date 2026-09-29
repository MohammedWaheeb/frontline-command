"""Actual Blender isolation proof: only two SA crash memberships may change."""
from pathlib import Path
import ast
import hashlib
import importlib.util
import json
import sys

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[2]
scope = json.loads((BASE / 'scope.json').read_text())
stage = REPO / scope['frozen_family_stage']
sys.path.insert(0, str(stage / 'assets/pipeline/blender'))
import fclib
from mathutils import Vector

sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
digest = lambda x: hashlib.sha256(json.dumps(x, sort_keys=True).encode()).hexdigest()
lockpath = REPO / scope['frozen_family_lock']
assert sha(lockpath) == scope['frozen_family_lock_sha256']
lock = json.loads(lockpath.read_text())
for rel, wanted in lock['sources'].items():
    assert sha(stage / rel) == wanted, rel
helper = REPO / 'work/art/aircraft-final-readability-v1/check-isolation.py'
tree = ast.parse(helper.read_text())
defs = [node for node in tree.body if isinstance(node, ast.FunctionDef)
        and node.name in ['mat_values', 'matrix']]
assert len(defs) == 2
environment = {'fclib': fclib, 'digest': digest}
exec(compile(ast.Module(body=defs, type_ignores=[]), str(helper), 'exec'), environment)
mat_values, matrix = environment['mat_values'], environment['matrix']

def load(name):
    path = REPO / scope[name]
    assert sha(path) == scope[name + '_sha256']
    source = importlib.util.spec_from_file_location('sa_crash_' + name, path)
    module = importlib.util.module_from_spec(source)
    source.loader.exec_module(module)
    return module

before, candidate = load('before'), load('candidate')
# Exact textual removal of the sole three-line amendment recovers original source.
amendment = "        if A.kind == 'SA.fighter':\n            # The lost wing owns its paint plate and payload rail.\n            hidden.update(o for o in A.parts if o.name in ('wing_team_-1', 'pylon_-1'))\n"
newtext = (REPO / scope['candidate']).read_text()
assert newtext.count(amendment) == 1
assert newtext.replace(amendment, '') == (REPO / scope['before']).read_text()

def cycle(vertices):
    return min(vertices[i:] + vertices[:i] for i in range(len(vertices)))

def snapshot(module, spec, reverse=False):
    fclib.reset()
    fclib.setup_camera(*spec['canvas'], spec['anchor'])
    rig = module.build(spec['faction'], spec['params'])
    objects = sorted(rig.original, key=lambda o: o.name)
    fclib.bpy.context.view_layer.update()
    depsgraph = fclib.bpy.context.evaluated_depsgraph_get()
    static = {}
    for obj in objects:
        record = {'type': obj.type, 'parent': obj.parent.name if obj.parent else None,
                  'rays': {key: getattr(obj, key) for key in
                           ['visible_camera', 'visible_shadow', 'visible_diffuse',
                            'visible_glossy', 'visible_transmission'] if hasattr(obj, key)}}
        if obj.type == 'MESH':
            evaluated = obj.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
            try:
                verts = [tuple(round(float(v), 9) for v in vertex.co) for vertex in mesh.vertices]
                faces = [(cycle(tuple(verts[i] for i in poly.vertices)),
                          poly.material_index, poly.use_smooth) for poly in mesh.polygons]
                record.update(vertices=sorted(verts), faces=sorted(faces),
                              material_slots=[m.name for m in mesh.materials])
            finally:
                evaluated.to_mesh_clear()
        static[obj.name] = digest(record)
    rows = [(state, direction, frame) for state in spec['states']
            for direction in range(state['directions']) for frame in range(state['frames'])]
    poses, bounds = {}, {}

    def take(state, direction, frame):
        visible, shadow = module.pose(rig, state, frame, direction)
        fclib.bpy.context.view_layer.update()
        visible_names = sorted(obj.name for obj in visible)
        shadow_names = sorted(obj.name for obj in shadow)
        transforms = digest({o.name: matrix(o) for o in objects})
        materials = digest({'values': mat_values(), 'slots': {
            o.name: [m.name for m in o.data.materials] for o in objects if o.type == 'MESH'}})
        hardpoints = digest({name: {'matrix': matrix(obj), 'projected':
            [round(float(v), 9) for v in fclib.project_px(obj.matrix_world.translation)]}
            for name, obj in sorted(rig.hardpoints.items())})
        record = {'transforms': transforms, 'materials': materials,
                  'hardpoints': hardpoints, 'visible': visible_names, 'shadow': shadow_names}
        if reverse and spec['id'] == 'unit.SA.fighter' and state['name'] == 'crash':
            points = [fclib.project_px(o.matrix_world @ Vector(v))
                      for o in visible if o.type == 'MESH' for v in o.bound_box]
            bounds[f'crash/d{direction:02d}_f{frame:02d}'] = bound = [
                min(p[0] for p in points), min(p[1] for p in points),
                max(p[0] for p in points), max(p[1] for p in points)]
            assert bound[0] >= 2 and bound[1] >= 2
            assert bound[2] < spec['canvas'][0] - 2 and bound[3] < spec['canvas'][1] - 2
        return record

    for state, direction, frame in rows:
        key = f"{state['name']}/d{direction:02d}_f{frame:02d}"
        poses[key] = take(state, direction, frame)
    if reverse:
        for state, direction, frame in reversed(rows):
            key = f"{state['name']}/d{direction:02d}_f{frame:02d}"
            assert take(state, direction, frame) == poses[key], (spec['id'], key, 'reverse reset')
    ui = take({'name': 'idle', 'part': 'whole', 'directions': 16, 'frames': 1}, 0, 0)
    return {'static': static, 'poses': poses, 'ui_pose': ui, 'bounds': bounds}

output = BASE / 'proof-v1.json'
assert not output.exists(), 'Preserve prior proof'
results = []
exact = changed = reset = 0
report = {'scope': 'Visibility-only proof from actual Blender evaluated mesh geometry, all pose transforms/material values/projected hardpoints and body/shadow membership. Canonical oriented face cycles and coordinates rounded9 per established source audit; no raster tolerance or checker waiver.',
          'before_sha256': scope['before_sha256'], 'candidate_sha256': scope['candidate_sha256'],
          'proof_helper_sha256': sha(Path(__file__)), 'material_helper_sha256': sha(helper),
          'results': results, 'failures': 0}
try:
    for aid, row in sorted(scope['specs'].items()):
        path = REPO / row['path']
        assert sha(path) == row['sha256']
        spec = json.loads(path.read_text())
        a = snapshot(before, spec)
        b = snapshot(candidate, spec, reverse=True)
        assert a['static'] == b['static'], (aid, 'evaluated geometry/hierarchy/rays/slots')
        assert a['ui_pose'] == b['ui_pose'], (aid, 'whole idle UI pose')
        changes = []
        for key, old in a['poses'].items():
            new = b['poses'][key]
            for field in ['transforms', 'materials', 'hardpoints']:
                assert old[field] == new[field], (aid, key, field)
            if aid == 'unit.SA.fighter' and key.startswith('crash/'):
                expected = {'wing_team_-1', 'pylon_-1'}
                for layer in ['visible', 'shadow']:
                    assert set(old[layer]) - set(new[layer]) == expected, (key, layer)
                    assert not set(new[layer]) - set(old[layer]), (key, layer, 'added')
                    assert 'wing_-1' not in old[layer] and 'wing_-1' not in new[layer]
                changed += 1
                changes.append(key)
            else:
                assert old == new, (aid, key, 'unrelated appearance')
                exact += 1
        reset += len(b['poses'])
        results.append({'id': aid, 'poses': len(b['poses']), 'evaluated_objects': len(b['static']),
                        'geometry_digest': digest(b['static']), 'unchanged_poses': len(b['poses']) - len(changes),
                        'changed_keys': changes, 'before_pose_digest': digest(a['poses']),
                        'candidate_pose_digest': digest(b['poses']), 'ui_pose_exact': True,
                        'reverse_resets': len(b['poses']), 'changed_pose_bounds': b['bounds']})
        print('FC_SA_CRASH_SOURCE_ASSET', aid, len(b['poses']), len(changes), flush=True)
    assert (exact, changed, reset) == (9056, 64, 9120), (exact, changed, reset)
    report.update(unchanged_poses=exact, changed_poses=changed, reverse_resets=reset,
                  all_geometry_materials_transforms_hardpoints_exact=True,
                  only_named_crash_memberships_removed=True, all11_ui_poses_exact=True)
    output.write_text(json.dumps(report, indent=2) + '\n')
    print('FC_SA_CRASH_SOURCE_DONE', exact, changed, reset, flush=True)
except Exception as error:
    report.update(failures=1, error=repr(error))
    output.write_text(json.dumps(report, indent=2) + '\n')
    raise
