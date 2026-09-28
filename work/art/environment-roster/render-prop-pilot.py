"""Sole-worker Blender pilot for approved props; never writes shipping art."""
import hashlib
import importlib
import json
import sys
import time
from pathlib import Path
repo = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(repo / 'assets/pipeline/blender'), str(repo / 'assets/pipeline/blender/models')]
import fclib
aid = sys.argv[sys.argv.index('--') + 1]
lane = repo / 'work/art/environment-roster'
lock = json.loads((lane / 'prop-source-lock.json').read_text())
for path, expected in lock['sources'].items():
    assert hashlib.sha256((repo / path).read_bytes()).hexdigest() == expected, 'Frozen input changed: ' + path
spec_path = repo / 'assets/pipeline/specs' / (aid + '.json')
spec = json.loads(spec_path.read_text())
assert spec['model'] == 'environment_roster'
plan = json.loads((lane / 'prop-pilot-plan.json').read_text())['assets'][aid]
root = lane / 'prop-pilot-v1' / aid
root.mkdir(parents=True, exist_ok=True)
assert not (root / 'source-model.py').exists(), 'Preserve prior pilot before rerender'
source = (repo / 'assets/pipeline/blender/models/environment_roster.py').read_bytes()
(root / 'source-model.py').write_bytes(source)
(root / 'source-spec.json').write_bytes(spec_path.read_bytes())
model = importlib.import_module('environment_roster')
fclib.reset()
fclib.setup_camera(*spec['canvas'], spec['anchor'])
fclib.setup_lights(3.3)
rig = model.build(None, spec['params'])
fclib.save_blend(str(root / (aid + '-pilot.blend')))
def signature(state, direction):
    objects, shadows = model.pose(rig, state, 0, direction)
    fclib.bpy.context.view_layer.update()
    return hashlib.sha256(json.dumps({'transforms': [(o.name, [round(v, 9) for row in o.matrix_world for v in row]) for o in rig.original],
        'visible': sorted(o.name for o in objects), 'shadows': sorted(o.name for o in shadows)}, sort_keys=True).encode()).hexdigest()
poses = [(s, d) for s in spec['states'] for d in range(s['directions'])]
signatures = {(s['name'], d): signature(s, d) for s, d in poses}
for state, direction in reversed(poses):
    assert signature(state, direction) == signatures[state['name'], direction], 'Order-dependent pose'
(root / 'pose-reset.json').write_text(json.dumps({'source_poses': len(poses), 'reverse_comparisons': len(poses), 'failures': 0,
    'scope': 'Actual Blender geometry/state membership, not pixel quality'}, indent=2) + '\n')
states = {s['name']: s for s in spec['states']}
records, started = [], time.time()
for pose in plan:
    state, direction = states[pose['state']], pose['direction']
    objects, shadows = model.pose(rig, state, 0, direction)
    fclib.bpy.context.view_layer.update()
    key = f"{state['name']}/d{direction:02d}_f00"
    paths = {layer: str(root / layer / (key + '.png')) for layer in state['layers']}
    for path in paths.values():
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    fclib.render_passes(rig, objects, paths, layers=state['layers'], shadow_objs=shadows)
    records.append({'key': key, 'layers': state['layers'], 'hardpoints': {
        name: fclib.project_px(obj.matrix_world.translation) for name, obj in rig.hardpoints.items()}})
(root / 'render.json').write_text(json.dumps({'id': aid, 'model_sha256': hashlib.sha256(source).hexdigest(),
    'spec_sha256': hashlib.sha256(spec_path.read_bytes()).hexdigest(), 'canvas': spec['canvas'], 'anchor': spec['anchor'],
    'poses': records, 'seconds': round(time.time() - started, 1), 'scope': 'Approved representative prop pilot; not roster completion'}, indent=2) + '\n')
print('FC_ENVIRONMENT_PROP_PILOT_DONE', aid, len(records))
