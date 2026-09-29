"""Sole-Blender proof for additive IR ISR service equipment only."""
from pathlib import Path
import ast
import hashlib
import importlib.util
import json
import sys

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[2]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
digest = lambda x: hashlib.sha256(json.dumps(x, sort_keys=True).encode()).hexdigest()
scope = json.loads((BASE / 'scope.json').read_text())
lock_path = REPO / scope['source_lock']
assert sha(lock_path) == scope['source_lock_sha256']
lock = json.loads(lock_path.read_text())
STAGE = REPO / lock['stage']
for rel, value in lock['sources'].items():
    assert sha(STAGE / rel) == value, rel
sys.path.insert(0, str(STAGE / 'assets/pipeline/blender'))
import fclib
from mathutils import Vector
from mathutils.bvhtree import BVHTree

helper = REPO / 'work/art/aircraft-final-readability-v1/check-isolation.py'
tree = ast.parse(helper.read_text())
defs = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in ('mat_values', 'matrix')]
assert len(defs) == 2
env = {'fclib': fclib, 'digest': digest}
exec(compile(ast.Module(body=defs, type_ignores=[]), str(helper), 'exec'), env)
mat_values, matrix = env['mat_values'], env['matrix']


def load(label):
    path = REPO / scope[label]
    assert sha(path) == scope[label + '_sha256']
    spec = importlib.util.spec_from_file_location('isr_service_' + label, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


before, candidate = load('before'), load('candidate')
new_text = (REPO / scope['candidate']).read_text()
assert new_text.replace("                 'IR.isr': (.45, -.43),\n", '').replace(
    "    if A.payloads or kind == 'IR.isr':\n", "    if A.payloads:\n") == (REPO / scope['before']).read_text()


def cycle(vertices):
    return min(vertices[i:] + vertices[:i] for i in range(len(vertices)))


def mesh_data(obj):
    ev = obj.evaluated_get(fclib.bpy.context.evaluated_depsgraph_get())
    mesh = ev.to_mesh()
    try:
        local = [tuple(round(float(c), 9) for c in v.co) for v in mesh.vertices]
        faces = [(cycle(tuple(local[i] for i in p.vertices)), p.material_index, p.use_smooth)
                 for p in mesh.polygons]
        return {'vertices': sorted(local), 'faces': sorted(faces),
                'materials': [m.name for m in mesh.materials]}, (
                    [ev.matrix_world @ v.co for v in mesh.vertices],
                    [tuple(p.vertices) for p in mesh.polygons])
    finally:
        ev.to_mesh_clear()


def snapshot(module, spec, original_names=None, reverse=False):
    fclib.reset()
    fclib.setup_camera(*spec['canvas'], spec['anchor'])
    rig = module.build(spec['faction'], spec['params'])
    objects = sorted(rig.original, key=lambda o: o.name)
    fclib.bpy.context.view_layer.update()
    static = {}
    for obj in objects:
        rec = {'type': obj.type, 'parent': obj.parent.name if obj.parent else None,
               'rays': {k: getattr(obj, k) for k in ('visible_camera', 'visible_shadow',
                        'visible_diffuse', 'visible_glossy', 'visible_transmission') if hasattr(obj, k)}}
        if obj.type == 'MESH':
            rec['mesh'], _ = mesh_data(obj)
        static[obj.name] = digest(rec)
    original_names = set(static) if original_names is None else set(original_names)
    added = set(static) - original_names
    assert not original_names - set(static)
    old_objects = [o for o in objects if o.name in original_names]
    old_materials = {m.name for o in old_objects if o.type == 'MESH' for m in o.data.materials}
    poses, bounds, contacts = {}, {}, {}

    def take(state, direction, frame, diagnostic=False):
        visible, shadow = module.pose(rig, state, frame, direction)
        fclib.bpy.context.view_layer.update()
        slots = {o.name: [m.name for m in o.data.materials] for o in old_objects if o.type == 'MESH'}
        mats = mat_values()
        original = {'transforms': {o.name: matrix(o) for o in old_objects}, 'slots': slots,
                    'materials': {n: mats[n] for n in sorted(old_materials)},
                    'hardpoints': {n: {'matrix': matrix(o), 'projected':
                       [round(float(v), 9) for v in fclib.project_px(o.matrix_world.translation)]}
                       for n, o in sorted(rig.hardpoints.items())},
                    'visible': sorted(o.name for o in visible if o.name in original_names),
                    'shadow': sorted(o.name for o in shadow if o.name in original_names)}
        rec = {'original': digest(original),
               'added_visible': sorted(o.name for o in visible if o.name in added),
               'added_shadow': sorted(o.name for o in shadow if o.name in added),
               'full_reset': digest({'transforms': {o.name: matrix(o) for o in objects},
                                    'materials': mats, 'visible': sorted(o.name for o in visible),
                                    'shadow': sorted(o.name for o in shadow)})}
        if diagnostic and added and state['name'] == 'rearm':
            key = f'rearm/d{direction:02d}_f{frame:02d}'
            points = [fclib.project_px(o.matrix_world @ Vector(v))
                      for o in visible if o.type == 'MESH' for v in o.bound_box]
            bounds[key] = b = [min(p[0] for p in points), min(p[1] for p in points),
                               max(p[0] for p in points), max(p[1] for p in points)]
            assert b[0] >= 2 and b[1] >= 2 and b[2] < spec['canvas'][0] - 2 and b[3] < spec['canvas'][1] - 2
            if direction == 0:
                old_meshes = [o for o in visible if o.type == 'MESH' and o.name in original_names]
                new_meshes = [o for o in visible if o.type == 'MESH' and o.name in added]
                trees = {}
                for obj in old_meshes + new_meshes:
                    _, (vertices, polygons) = mesh_data(obj)
                    trees[obj.name] = BVHTree.FromPolygons(vertices, polygons, all_triangles=False)
                crossing = [(a.name, b.name) for a in new_meshes for b in old_meshes
                            if trees[a.name].overlap(trees[b.name])]
                assert not crossing, (key, 'new rig intersects existing aircraft', crossing)
                contacts[key] = {'surface_crossings': crossing, 'pairs': len(old_meshes) * len(new_meshes),
                                 'scope': 'Surface intersections, not a generic solid-containment proof.'}
        return rec

    rows = [(s, d, f) for s in spec['states'] for d in range(s['directions']) for f in range(s['frames'])]
    for state, direction, frame in rows:
        key = f"{state['name']}/d{direction:02d}_f{frame:02d}"
        poses[key] = take(state, direction, frame, diagnostic=reverse)
    if reverse:
        for state, direction, frame in reversed(rows):
            key = f"{state['name']}/d{direction:02d}_f{frame:02d}"
            assert take(state, direction, frame) == poses[key], (spec['id'], key, 'reverse reset')
    ui = take({'name': 'idle', 'part': 'whole', 'directions': 16, 'frames': 1}, 0, 0)
    return {'static': static, 'added': sorted(added), 'poses': poses, 'ui': ui,
            'bounds': bounds, 'contacts': contacts}


out = BASE / 'proof-v1.json'
assert not out.exists(), 'Preserve a previous proof attempt.'
result = {'scope': 'Evaluated source proof only. Existing geometry/transforms/materials/visibility/'
                   'hardpoints exact; new neutral service rig allowed only in IR ISR rearm. '
                   'No pixel equality or native acceptance inferred.',
          'candidate_sha256': scope['candidate_sha256'], 'before_sha256': scope['before_sha256'],
          'helper_sha256': sha(Path(__file__)), 'material_helper_sha256': sha(helper),
          'assets': [], 'failures': 0}
exact = changed = reset = 0
try:
    specs = sorted((STAGE / 'assets/pipeline/specs').glob('unit.*.json'))
    assert len(specs) == 11
    for path in specs:
        spec = json.loads(path.read_text())
        old = snapshot(before, spec)
        new = snapshot(candidate, spec, original_names=old['static'], reverse=True)
        for name, value in old['static'].items():
            assert new['static'][name] == value, (spec['id'], name, 'original evaluated geometry')
        if spec['id'] == 'unit.IR.isr':
            assert new['added'] and all(n.startswith('armed_service_') for n in new['added'])
        else:
            assert not new['added']
        assert old['ui']['original'] == new['ui']['original']
        assert not new['ui']['added_visible'] and not new['ui']['added_shadow']
        changes = []
        for key, a in old['poses'].items():
            b = new['poses'][key]
            assert a['original'] == b['original'], (spec['id'], key, 'existing appearance changed')
            if spec['id'] == 'unit.IR.isr' and key.startswith('rearm/'):
                assert b['added_visible'] and b['added_visible'] == b['added_shadow']
                changed += 1
                changes.append(key)
            else:
                assert not b['added_visible'] and not b['added_shadow'], (spec['id'], key, 'service leak')
                exact += 1
        reset += len(new['poses'])
        result['assets'].append({'id': spec['id'], 'spec_sha256': sha(path), 'poses': len(new['poses']),
                                 'changed_keys': changes, 'added_objects': new['added'],
                                 'before_pose_sha256': digest(old['poses']), 'candidate_pose_sha256': digest(new['poses']),
                                 'bounds': new['bounds'], 'contacts': new['contacts'], 'ui_exact': True})
        print('FC_ISR_SERVICE_SOURCE_ASSET', spec['id'], len(new['poses']), len(changes), flush=True)
    assert (exact, changed, reset) == (9024, 96, 9120), (exact, changed, reset)
    result.update(unchanged_poses=exact, changed_poses=changed, reverse_resets=reset)
    out.write_text(json.dumps(result, indent=2) + '\n')
    print('FC_ISR_SERVICE_SOURCE_DONE 9024 96 9120', flush=True)
except Exception as error:
    result.update(failures=1, error=repr(error))
    out.write_text(json.dumps(result, indent=2) + '\n')
    raise
