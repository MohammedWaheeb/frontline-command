"""Run the unchanged shared portrait/cameo renderer in this asset's pilot root."""
import ast
import hashlib
import json
import sys
from pathlib import Path
repo = Path(__file__).resolve().parents[3]
aid = sys.argv[sys.argv.index('--') + 1]
spec_path = repo / 'assets/pipeline/specs' / f'{aid}.json'
spec = json.loads(spec_path.read_text())
assert spec['model'] in ('vehicle_roster', 'aircraft_roster')
root = repo / 'work/art' / spec['model'].replace('_', '-') / 'pilot-v1' / aid
render = json.loads((root / 'render.json').read_text())
model = repo / 'assets/pipeline/blender/models' / (spec['model'] + '.py')
assert render['model_sha256'] == hashlib.sha256(model.read_bytes()).hexdigest()
assert render['spec_sha256'] == hashlib.sha256(spec_path.read_bytes()).hexdigest()
shared = repo / 'assets/pipeline/blender/render_ui_shots.py'
source = shared.read_bytes()
module = ast.parse(source, filename=str(shared))
entry = module.body.pop()
assert isinstance(entry, ast.Expr) and isinstance(entry.value, ast.Call)
assert isinstance(entry.value.func, ast.Name) and entry.value.func.id == 'main'
namespace = {'__file__': str(shared), '__name__': 'fc_vehicle_air_pilot_ui'}
exec(compile(module, str(shared), 'exec'), namespace)
namespace['REPO'] = str(root)
sys.argv = [str(shared), '--', str(spec_path)]
namespace['main']()
(root / 'ui-evidence.json').write_text(json.dumps({'shared_renderer_sha256': hashlib.sha256(source).hexdigest(),
    'scope': 'Standard portrait and cameo camera/materials; isolated pilot output only'}, indent=2) + '\n')
