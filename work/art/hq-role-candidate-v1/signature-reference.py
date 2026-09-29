"""Queued source proof, to run in the sole Blender worker after source freeze.

No production source or output writes. Compare every unrelated building's
geometry, hierarchy, materials, complete pose transforms and draw membership;
check the four corrected batteries' state reset in both traversal orders.
"""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys

REPO = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(REPO / 'assets/pipeline/blender'), str(REPO / 'assets/pipeline/blender/models')]
import fclib

scope = json.loads((HERE / 'scope.json').read_text())
for rel, expected in scope['shared_dependency_sha256'].items():
    assert hashlib.sha256((REPO / rel).read_bytes()).hexdigest() == expected, rel
digest = lambda value: hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def load(name, filename, expected):
    path = HERE / filename
    assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, path
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


before = load('interceptor_before', 'before-building_roster.py', scope['before_sha256'])
after = load('interceptor_after', 'candidate-building_roster.py', scope['candidate_sha256'])


def materials():
    result = []
    for material in sorted(fclib.bpy.data.materials, key=lambda value: value.name):
        if not material.node_tree:
            continue
        values = []
        for node in sorted(material.node_tree.nodes, key=lambda value: value.name):
            for socket in node.inputs:
                if not hasattr(socket, 'default_value'):
                    continue
                value = socket.default_value
                if isinstance(value, (int, float)):
                    value = round(float(value), 9)
                elif type(value).__name__ in ('bpy_prop_array', 'Vector', 'Color'):
                    value = [round(float(item), 9) for item in value]
                else:
                    continue
                values.append((node.name, socket.name, value))
        result.append((material.name, values))
    return result


def signatures(module, spec, reverse=False):
    fclib.reset()
    rig = module.build(spec['faction'], spec['params'])
    geometry = []
    for obj in sorted(rig.original, key=lambda value: value.name):
        item = {'name': obj.name, 'type': obj.type, 'parent': obj.parent.name if obj.parent else None,
                'ray_visibility': {name: getattr(obj, name) for name in
                    ('visible_camera', 'visible_shadow', 'visible_diffuse', 'visible_glossy', 'visible_transmission')
                    if hasattr(obj, name)}}
        if obj.type == 'MESH':
            item.update(vertices=[[round(value, 9) for value in vertex.co] for vertex in obj.data.vertices],
                        polygons=[list(polygon.vertices) for polygon in obj.data.polygons],
                        materials=[material.name for material in obj.data.materials])
        geometry.append(item)
    result = {'geometry': digest(geometry), 'poses': {}}

    def pose(state, direction, frame):
        visible, shadow = module.pose(rig, state, frame, direction)
        fclib.bpy.context.view_layer.update()
        return digest({'transforms': [(obj.name, [round(value, 9) for row in obj.matrix_world for value in row])
                                      for obj in sorted(rig.original, key=lambda value: value.name)],
                       'visible': sorted(obj.name for obj in visible),
                       'shadow': sorted(obj.name for obj in shadow), 'materials': materials()})

    poses = [(state, direction, frame) for state in spec['states']
             for direction in range(state['directions']) for frame in range(state['frames'])]
    for state, direction, frame in poses:
        key = f"{state['name']}/d{direction:02d}_f{frame:02d}"
        result['poses'][key] = pose(state, direction, frame)
    if reverse:
        for state, direction, frame in reversed(poses):
            key = f"{state['name']}/d{direction:02d}_f{frame:02d}"
            assert pose(state, direction, frame) == result['poses'][key], (spec['id'], key, 'reset')
    return result


rows = []
changed = {}
for path in sorted((REPO / 'assets/pipeline/specs').glob('building.*.json')):
    spec = json.loads(path.read_text())
    if spec['model'] != 'building_roster':
        continue
    assert hashlib.sha256(path.read_bytes()).hexdigest() == scope['spec_sha256'][spec['id']], path
    if spec['id'].endswith('.interceptor_battery'):
        candidate_path = HERE / 'candidate-specs' / path.name
        assert hashlib.sha256(candidate_path.read_bytes()).hexdigest() == scope['candidate_spec_sha256'][spec['id']]
        candidate_spec = json.loads(candidate_path.read_text())
        changed[spec['id']] = signatures(after, candidate_spec, reverse=True)
        continue
    previous, current = signatures(before, spec), signatures(after, spec)
    assert previous == current, spec['id']
    rows.append({'id': spec['id'], 'pose_comparisons': len(current['poses']), 'geometry_and_materials_equal': True})
    print('FC_INTERCEPTOR_UNCHANGED', spec['id'], len(current['poses']), flush=True)
assert len(rows) == 55 and len(changed) == 4 and all(len(value['poses']) == 33 for value in changed.values())
assert sum(row['pose_comparisons'] for row in rows) == 2502
report = {'assets_unchanged': len(rows), 'unrelated_pose_comparisons': sum(row['pose_comparisons'] for row in rows),
          'candidate_reverse_pose_comparisons': sum(len(value['poses']) for value in changed.values()), 'candidate_signatures': changed,
          'before_sha256': scope['before_sha256'], 'candidate_sha256': scope['candidate_sha256'],
          'scope': 'Source geometry, hierarchy, material values, transforms, visible/shadow membership; no pixel acceptance',
          'failures': 0, 'results': rows}
(HERE / 'isolation.json').write_text(json.dumps(report, indent=2) + '\n')
print('FC_INTERCEPTOR_ISOLATION_DONE', len(rows), report['unrelated_pose_comparisons'], 132, flush=True)
