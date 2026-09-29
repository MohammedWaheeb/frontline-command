"""Six candidate ISR service views, gated by complete evaluated isolation."""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[2]
STAGE = REPO / 'work/art/aircraft-final-production-v3/stage'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
scope = json.loads((BASE / 'scope.json').read_text())
proof_path = BASE / 'proof-v1.json'
proof = json.loads(proof_path.read_text())
assert proof['failures'] == 0
assert (proof['unchanged_poses'], proof['changed_poses'], proof['reverse_resets']) == (9024, 96, 9120)
source = REPO / scope['candidate']
assert sha(source) == scope['candidate_sha256'] == proof['candidate_sha256']
lock_path = REPO / scope['source_lock']
assert sha(lock_path) == scope['source_lock_sha256']
lock = json.loads(lock_path.read_text())
for relative, wanted in lock['sources'].items():
    assert sha(STAGE / relative) == wanted, relative
sys.path.insert(0, str(STAGE / 'assets/pipeline/blender'))
import fclib
module = importlib.util.spec_from_file_location('isr_service_candidate', source)
model = importlib.util.module_from_spec(module)
module.loader.exec_module(model)
spec_path = REPO / scope['spec']
assert sha(spec_path) == scope['spec_sha256']
spec = json.loads(spec_path.read_text())
OUT = BASE / 'pilot-v1'
assert not OUT.exists()
OUT.mkdir()
report = {'scope': 'Six source-native IR ISR service candidate views; no full export or runtime approval.',
          'source_sha256': sha(source), 'spec_sha256': sha(spec_path),
          'proof_sha256': sha(proof_path), 'helper_sha256': sha(STAGE / 'assets/pipeline/blender/fclib.py'),
          'script_sha256': sha(Path(__file__)), 'canvas': spec['canvas'], 'anchor': spec['anchor'],
          'keys': [], 'failures': 0}
try:
    fclib.reset()
    fclib.setup_camera(*spec['canvas'], spec['anchor'])
    fclib.setup_lights(spec.get('sun_strength', 3.3))
    rig = model.build(spec['faction'], spec['params'])
    state = next(s for s in spec['states'] if s['name'] == 'rearm')
    for direction in [3, 7]:
        for frame in [0, 3, 5]:
            key = f'rearm/d{direction:02d}_f{frame:02d}'
            visible, shadow = model.pose(rig, state, frame, direction)
            fclib.bpy.context.view_layer.update()
            assert set(rig.airframe.armed_service_parts) <= set(visible) & set(shadow)
            paths = {layer: str(OUT / 'frames' / layer / (key + '.png')) for layer in state['layers']}
            for path in paths.values():
                Path(path).parent.mkdir(parents=True, exist_ok=True)
            fclib.render_passes(rig, visible, paths, layers=state['layers'], shadow_objs=shadow)
            report['keys'].append(key)
    report['files'] = {str(p.relative_to(OUT)): sha(p) for p in sorted((OUT / 'frames').rglob('*.png'))}
    (OUT / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
    print('FC_ISR_SERVICE_PILOT_DONE 6', flush=True)
except Exception as error:
    report.update(failures=1, error=repr(error))
    (OUT / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
    raise
