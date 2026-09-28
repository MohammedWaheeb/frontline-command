"""Freeze prop model/spec/helper inputs; never launches Blender."""
import hashlib
import json
from pathlib import Path
repo = Path(__file__).resolve().parents[3]
root = repo / 'work/art/environment-roster'
ids = ['prop.warehouse_garrisonable', 'prop.destructible_wall_hp_light', 'prop.destructible_wall_hp_heavy',
       'prop.supply_station_neutral', 'prop.palm', 'prop.bridge_permanent']
assets = {}
for aid in ids:
    spec = json.loads((repo / 'assets/pipeline/specs' / (aid + '.json')).read_text())
    assets[aid] = [{'state': state['name'], 'direction': direction, 'frame': 0}
                   for state in spec['states'] for direction in range(state['directions'])]
plan = {'scope': 'Six representative families requested; coordinator approval required, never parallel Blender',
        'assets': assets, 'poses_requested': sum(len(v) for v in assets.values())}
plan_path = root / 'prop-pilot-plan.json'
plan_path.write_text(json.dumps(plan, indent=2) + '\n')
paths = [repo / 'assets/pipeline/blender/models/environment_roster.py',
         repo / 'assets/pipeline/blender/fclib.py', root / 'render-prop-pilot.py', root / 'check-prop-pilot.py',
         repo / 'assets/pipeline/tools/pack_sprites.py', repo / 'assets/pipeline/tools/shadow_alpha.py',
         repo / 'assets/pipeline/tools/composite.py', plan_path]
paths += [p for p in (repo / 'assets/pipeline/specs').glob('prop.*.json') if json.loads(p.read_text()).get('model') == 'environment_roster']
guard_path = root / 'prop-source-lock.json'
if not guard_path.exists():
    guard_path = root / 'prop-specifications.json'
guard = json.loads(guard_path.read_text())['preserved_legacy']
for path, expected in guard.items():
    assert hashlib.sha256((repo / path).read_bytes()).hexdigest() == expected, path
lock = {'scope': 'Source/spec/helper freeze only; unrendered source candidates',
        'sources': {str(p.relative_to(repo)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
        'preserved_legacy': guard}
(root / 'prop-source-lock.json').write_text(json.dumps(lock, indent=2) + '\n')
print({aid: len(v) for aid, v in assets.items()}, plan['poses_requested'], 'requested poses')
