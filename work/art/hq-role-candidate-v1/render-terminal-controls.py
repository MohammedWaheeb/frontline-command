"""Same-process old/old and candidate/candidate terminal-state controls only."""
from pathlib import Path
import hashlib, importlib.util, json, sys, time
B = Path(__file__).resolve().parent
S = B / 'stage'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
lock = json.loads((B / 'source-lock.json').read_text())
proof = json.loads((B / 'source-proof-v1.json').read_text())
assert proof['failures'] == 0
for rel, want in lock['stage_files'].items():
    assert sha(S / rel) == want
sys.path[:0] = [str(S / 'assets/pipeline/blender'), str(S / 'assets/pipeline/blender/models')]
import fclib
def load(name, path, want):
    assert sha(path) == want
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
old = load('hq_terminal_old', B / 'baseline-building_roster.py', lock['baseline_sha256'])
new = load('hq_terminal_new', B / 'candidate-building_roster.py', lock['candidate_sha256'])
out = B / 'terminal-controls-v1'
assert not out.exists()
out.mkdir()
records = []
start = time.time()
for aid in lock['targets']:
    spec = json.loads((S / 'assets/pipeline/specs' / (aid + '.json')).read_text())
    for label, module in [('old-a', old), ('old-b', old), ('candidate-a', new), ('candidate-b', new)]:
        fclib.reset()
        fclib.setup_camera(*spec['canvas'], spec['anchor'])
        fclib.setup_lights(spec.get('sun_strength', 3.3))
        rig = module.build(spec['faction'], spec['params'])
        for state in [s for s in spec['states'] if s['name'] in ('foundation', 'rubble')]:
            visible, shadow = module.pose(rig, state, 0, 0)
            fclib.bpy.context.view_layer.update()
            layers = state.get('layers', spec['passes'])
            paths = {layer: out / aid / label / layer / state['name'] / 'd00_f00.png' for layer in layers}
            for p in paths.values():
                p.parent.mkdir(parents=True, exist_ok=True)
            fclib.render_passes(rig, visible, {k: str(p) for k, p in paths.items()}, layers=layers, shadow_objs=shadow)
            records.append({'id': aid, 'label': label, 'state': state['name'], 'files': {str(p.relative_to(out)): sha(p) for p in paths.values()}})
(out / 'render.json').write_text(json.dumps({'scope': 'Two unchanged old and two unchanged candidate renders per HQ/terminal state in one process. Strict failed historical comparison remains intact; this establishes measurements only, no generic tolerance.', 'source_lock_sha256': sha(B / 'source-lock.json'), 'script_sha256': sha(Path(__file__)), 'records': records, 'seconds': round(time.time() - start, 1)}, indent=2) + '\n')
print('FC_HQ_TERMINAL_CONTROLS_DONE', len(records), flush=True)
