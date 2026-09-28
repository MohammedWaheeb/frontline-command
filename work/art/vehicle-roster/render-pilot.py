"""Coordinator-only bounded Blender pilot; writes isolated evidence, never shipping art.

This file is authored but must only run inside the single approved Blender worker.
All state/direction source poses are checked; only the explicit bounded plan renders.
"""
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
spec_path = repo / 'assets/pipeline/specs' / f'{aid}.json'
spec = json.loads(spec_path.read_text())
assert spec['model'] in ('vehicle_roster', 'aircraft_roster')
lane = spec['model'].replace('_', '-')
lock = json.loads((repo / 'work/art' / lane / 'source-lock.json').read_text())
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
for path, expected in lock['sources'].items():
    assert digest(repo / path) == expected, 'Source changed after pilot request: ' + path
model_path = repo / 'assets/pipeline/blender/models' / (spec['model'] + '.py')
root = repo / 'work/art' / lane / 'pilot-v1' / aid
root.mkdir(parents=True, exist_ok=True)
if (root / 'source-model.py').exists():
    raise RuntimeError('Refusing to overwrite prior pilot: ' + str(root))
(root / 'source-model.py').write_bytes(model_path.read_bytes())
(root / 'source-spec.json').write_bytes(spec_path.read_bytes())
model = importlib.import_module(spec['model'])
fclib.reset()
fclib.setup_camera(*spec['canvas'], spec['anchor'])
fclib.setup_lights(spec.get('sun_strength', 3.3))
rig = model.build(spec['faction'], spec['params'])
fclib.save_blend(str(root / (aid + '-pilot.blend')))

def signature(state, direction, frame):
    objects, shadows = model.pose(rig, state, frame, direction)
    fclib.bpy.context.view_layer.update()
    payload = {'transforms': [(o.name, [round(v, 9) for row in o.matrix_world for v in row]) for o in rig.original],
               'visible': sorted(o.name for o in objects), 'shadow': sorted(o.name for o in shadows)}
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()

poses = [(s, d, f) for s in spec['states'] for d in range(s['directions']) for f in range(s['frames'])]
signatures = {(s['name'], d, f): signature(s, d, f) for s, d, f in poses}
for state, direction, frame in reversed(poses):
    assert signature(state, direction, frame) == signatures[state['name'], direction, frame], 'Order-dependent pose'
(root / 'pose-reset.json').write_text(json.dumps({'poses': len(poses), 'comparisons': len(poses), 'failures': 0,
    'scope': 'Actual Blender world transforms and membership; not full rendered coverage'}, indent=2) + '\n')

plan = json.loads((repo / 'work/art' / lane / 'pilot-plan.json').read_text())['assets'][aid]
states = {s['name']: s for s in spec['states']}
records, started = [], time.time()
for item in plan:
    state, direction, frame = states[item['state']], item['direction'], item['frame']
    objects, shadows = model.pose(rig, state, frame, direction)
    fclib.bpy.context.view_layer.update()
    key = f"{state['name']}/d{direction:02d}_f{frame:02d}"
    layers = state.get('layers', spec['passes'])
    paths = {layer: str(root / layer / (key + '.png')) for layer in layers}
    for path in paths.values():
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    hardpoints = {name: fclib.project_px(hp.matrix_world.translation) for name, hp in rig.hardpoints.items()
                  if state.get('part', 'body') in hp['fc_parts']}
    fclib.render_passes(rig, objects, paths, layers=layers, shadow_objs=shadows)
    records.append({'key': key, 'layers': layers, 'hardpoints': hardpoints})
report = {'id': aid, 'model_sha256': digest(model_path), 'spec_sha256': digest(spec_path),
          'canvas': spec['canvas'], 'anchor': spec['anchor'], 'poses': records,
          'seconds': round(time.time() - started, 1), 'scope': 'Selected pilot only; not a shipping sprite set'}
(root / 'render.json').write_text(json.dumps(report, indent=2) + '\n')
print('FC_VEHICLE_AIR_PILOT_DONE', aid, len(records), report['seconds'], 'seconds')
