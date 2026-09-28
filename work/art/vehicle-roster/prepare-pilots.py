"""Lock authored sources and exact bounded pilot plans. Does not launch Blender."""
import hashlib
import json
from pathlib import Path

repo = Path(__file__).resolve().parents[3]
families = {'vehicle-roster': ['unit.SA.tank', 'unit.IR.launcher', 'unit.SY.apc'],
            'aircraft-roster': ['unit.US.fighter', 'unit.US.airlift', 'unit.IR.gunship']}
legacy = ['unit.US.tank', 'unit.SY.car', 'unit.IR.strike', 'unit.SA.mobile_abm']
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
for lane, ids in families.items():
    root = repo / 'work/art' / lane
    paths = [repo / 'assets/pipeline/blender/models' / (lane.replace('-', '_') + '.py'),
             repo / 'assets/pipeline/blender/fclib.py',
             repo / 'assets/pipeline/blender/render_ui_shots.py',
             repo / 'work/art/vehicle-roster/render-pilot.py',
             repo / 'work/art/vehicle-roster/render-pilot-ui.py',
             repo / 'work/art/vehicle-roster/check-pilot.py',
             repo / 'assets/pipeline/tools/pack_sprites.py',
             repo / 'assets/pipeline/tools/shadow_alpha.py',
             repo / 'assets/pipeline/tools/composite.py']
    paths += [p for p in sorted((repo / 'assets/pipeline/specs').glob('unit.*.json'))
              if json.loads(p.read_text()).get('model') == lane.replace('-', '_')]
    lock = {'scope': 'Source freeze for requested pilot; does not assert rendered acceptance',
            'sources': {str(p.relative_to(repo)): digest(p) for p in paths}, 'preserved_legacy': {}}
    for aid in legacy:
        spec_path = repo / 'assets/pipeline/specs' / (aid + '.json')
        spec = json.loads(spec_path.read_text())
        model_path = repo / 'assets/pipeline/blender/models' / (spec['model'] + '.py')
        for path in (spec_path, model_path):
            lock['preserved_legacy'][str(path.relative_to(repo))] = digest(path)
    plans = {}
    for aid in ids:
        spec = json.loads((repo / 'assets/pipeline/specs' / (aid + '.json')).read_text())
        plan = set()
        for state in spec['states']:
            n = state['frames']
            # Entire temporal sequence at a non-cardinal heading. Front/back
            # obliques at endpoints exercise shadow, door and equipment limits.
            plan.update((state['name'], 3, frame) for frame in range(n))
            for direction in (7, 11):
                for frame in {0, n - 1}:
                    plan.add((state['name'], direction, frame))
        plans[aid] = [{'state': state, 'direction': direction, 'frame': frame}
                      for state, direction, frame in sorted(plan)]
    plan = {'scope': 'Coordinator-approved families only; no bulk render authorization',
            'assets': plans, 'rendered_poses_requested': sum(len(p) for p in plans.values())}
    (root / 'pilot-plan.json').write_text(json.dumps(plan, indent=2) + '\n')
    paths_plan = root / 'pilot-plan.json'
    lock['sources'][str(paths_plan.relative_to(repo))] = digest(paths_plan)
    (root / 'source-lock.json').write_text(json.dumps(lock, indent=2) + '\n')
    print(lane, {aid: len(p) for aid, p in plans.items()}, plan['rendered_poses_requested'])
