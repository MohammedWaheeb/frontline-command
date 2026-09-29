"""Actual Blender pose/reset, projected geometry and hardpoint membership audit.

Run only in the sole Blender queue before the corresponding full render. This
does not render pixels; the separate full pixel checker owns alpha/shadow bounds.
"""
from pathlib import Path
import hashlib, importlib, json, math, sys

repo = Path(__file__).resolve().parents[3]
base = repo / 'work/art/vehicle-production'
sys.path[:0] = [str(repo / 'assets/pipeline/blender'), str(repo / 'assets/pipeline/blender/models')]
import fclib
from mathutils import Vector

aid = sys.argv[sys.argv.index('--') + 1]
lock = json.loads((base / 'production-lock.json').read_text())
assert aid in lock['assets']
for rel, want in lock['sources'].items():
    assert hashlib.sha256((repo / rel).read_bytes()).hexdigest() == want, rel
spec = json.loads((repo / 'assets/pipeline/specs' / (aid + '.json')).read_text())
model = importlib.import_module('vehicle_roster')
fclib.reset(); fclib.setup_camera(*spec['canvas'], spec['anchor']); fclib.setup_lights()
rig = model.build(spec['faction'], spec['params'])
poses = [(s, d, f) for s in spec['states'] for d in range(s['directions']) for f in range(s['frames'])]
parts = {name: list(obj['fc_parts']) for name, obj in rig.hardpoints.items()}
expected = {name: [f"{s['name']}/d{d:02d}_f{f:02d}" for s, d, f in poses if s['part'] in allowed]
            for name, allowed in parts.items()}
assert 'healthbar' in expected and all(expected.values())
if rig.vb.turret_root:
    assert spec['turret_pivot_mt'] == [round(rig.vb.pivot[0] * 1000), round(-rig.vb.pivot[1] * 1000)]
    assert parts['muzzle'] == ['turret']

def materials():
    result = []
    for mat in sorted(fclib.bpy.data.materials, key=lambda v: v.name):
        if not mat.node_tree: continue
        values = []
        for node in sorted(mat.node_tree.nodes, key=lambda v: v.name):
            for socket in node.inputs:
                if not hasattr(socket, 'default_value'): continue
                value = socket.default_value
                if isinstance(value, (int, float)):
                    value = round(float(value), 9)
                elif type(value).__name__ in ('bpy_prop_array', 'Vector', 'Color'):
                    value = [round(float(v), 9) for v in value]
                else: continue
                values.append((node.name, socket.name, value))
        result.append((mat.name, values))
    return result

minimum = [math.inf] * 4
def signature(state, direction, frame, bounds):
    visible, shadows = model.pose(rig, state, frame, direction)
    fclib.bpy.context.view_layer.update()
    if bounds:
        points = [fclib.project_px(o.matrix_world @ Vector(c)) for o in visible if o.type == 'MESH' for c in o.bound_box]
        assert points
        w, h = spec['canvas']
        margins = [min(p[0] for p in points), min(p[1] for p in points),
                   w - max(p[0] for p in points), h - max(p[1] for p in points)]
        for i, value in enumerate(margins): minimum[i] = min(minimum[i], value)
        assert min(margins) >= 2, (state['name'], direction, frame, margins)
    payload = {'transforms': [(o.name, [round(v, 9) for row in o.matrix_world for v in row]) for o in rig.original],
               'visible': sorted(o.name for o in visible), 'shadow': sorted(o.name for o in shadows),
               'materials': materials(),
               'hardpoints': {name: list(fclib.project_px(obj.matrix_world.translation)) for name, obj in rig.hardpoints.items()}}
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()

forward = {(s['name'], d, f): signature(s, d, f, True) for s, d, f in poses}
for s, d, f in reversed(poses):
    assert signature(s, d, f, False) == forward[s['name'], d, f], ('order-dependent pose', s['name'], d, f)
report = {'id': aid, 'poses': len(poses), 'reverse_comparisons': len(poses), 'failures': 0,
          'scope': 'Actual Blender matrices, visible/shadow membership, materials and hardpoints; pixel shadow bounds checked separately',
          'minimum_geometry_margin_2x': minimum, 'hardpoint_parts': parts, 'hardpoint_expected_keys': expected,
          'turret_pivot_mt': spec.get('turret_pivot_mt'), 'model_sha256': lock['sources']['assets/pipeline/blender/models/vehicle_roster.py']}
(base / ('source-contract-' + aid + '.json')).write_text(json.dumps(report, indent=1) + '\n')
print('FC_VEHICLE_MODEL_AUDIT_DONE', aid, len(poses))
