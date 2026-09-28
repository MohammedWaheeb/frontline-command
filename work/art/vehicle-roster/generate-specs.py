"""Write only this lane's missing ground/air specifications, never a manifest.

Required states come from the canonical manifest generator without running it.
The four accepted legacy models and all infantry/logistics specs are immutable.
Run with --check to compare source specifications without writing them.
"""
import copy
import importlib
import importlib.util
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(REPO / 'work/art/vehicle-roster/preview'),
                str(REPO / 'assets/pipeline/blender/models')]
import fcpreview
fcpreview.install()
loader = importlib.util.spec_from_file_location('inventory', REPO / 'assets/pipeline/manifest/gen_manifest.py')
inventory = importlib.util.module_from_spec(loader)
loader.loader.exec_module(inventory)

LEGACY = {'US.tank', 'SY.car', 'IR.strike', 'SA.mobile_abm'}
LANES = {'vehicle': 'vehicle-roster', 'aircraft': 'aircraft-roster'}

def make_spec(unit):
    cls, states = inventory.unit_states(unit)
    role, rid = unit['role'], unit['role_id']
    if cls == 'infantry' or role in ('rig', 'hauler') or rid in LEGACY:
        return None
    aircraft = cls.startswith('aircraft')
    module_name = 'aircraft_roster' if aircraft else 'vehicle_roster'
    model = importlib.import_module(module_name)
    fcpreview.reset()
    rig = model.build(unit['faction'], {'kind': rid})
    states = copy.deepcopy(states)
    # Hull-only plates prevent the separately rendered turret appearing twice.
    # New turrets carry their own registered shadow at the actual turret heading.
    for state in states:
        if state['part'] == 'turret':
            state['layers'] = ['beauty', 'team', 'shadow']
        if not aircraft and rig.vb.turret_root is not None and state['name'] in ('doors_open', 'hulldown', 'hulldown_idle'):
            state['part'] = 'hull'
    aliases = []
    if not aircraft and role == 'launcher':
        states.append(inventory.S('ready_empty', 16, 1))
        aliases.append({'name': 'pack', 'source': 'deploy', 'reverse': True,
                        'progress_driven': True, 'sim_seconds': 3})
    if rid == 'SA.repair':
        aliases.append({'name': 'pack', 'source': 'deploy', 'reverse': True,
                        'progress_driven': True, 'sim_seconds': 2})
    if rid == 'SA.tank':
        aliases += [{'name': 'deploy', 'source': 'hulldown', 'progress_driven': True},
                    {'name': 'pack', 'source': 'hulldown', 'reverse': True,
                     'progress_driven': True, 'sim_seconds': 2}]
    if aircraft:
        # Service opens actual access panels. These are additional to the base
        # manifest, not an alias which would misleadingly keep weapons loaded.
        states.append(inventory.S('rearm', 16, 6, 8, channel=True))
        if cls == 'aircraft_rotor' and unit['weapon'] != 'Unarmed':
            states.append(inventory.S('empty', 16, 4, 24))
        if rid == 'US.airlift':
            aliases += [{'name': 'doors_open', 'source': 'hover_low_board'},
                        {'name': 'work_unload', 'source': 'hover_low_board'},
                        {'name': 'work_load', 'source': 'hover_low_board'}]
    # Canvas includes conservative projection margins for wrecks, barrels,
    # launch plume and shadow. Full geometry-bound audit can enlarge by role.
    canvas, anchor = ([448, 352], [224, 232]) if aircraft else ([448, 384], [224, 224])
    if role == 'launcher':
        canvas, anchor = [448, 384], [224, 264]
    if role == 'tank':
        canvas, anchor = [448, 384], [224, 216]
    provenance = {
        'kind': 'project-original-procedural-model',
        'author': 'Codex' if aircraft else 'Claude Code claude-opus-5-5; Codex audit and specifications',
        'authorization': 'User-approved Claude quota takeover; assignment 09 continuation',
        'shared_library': 'Claude Code claude-opus-5-5 authored fclib.py',
        'source_model': f'assets/pipeline/blender/models/{module_name}.py',
        'license': 'Project-original work created for Frontline Command in this repository; all rights held by the project owner.',
    }
    spec = {'id': f'unit.{rid}', 'role_id': rid, 'model': module_name,
            'faction': unit['faction'], 'author': provenance['author'], 'provenance': provenance,
            'params': {'kind': rid}, 'canvas': canvas, 'anchor': anchor,
            'passes': ['beauty', 'team', 'shadow'],
            'footprint_radius_mt': 800 if role == 'tank' else 600, 'states': states}
    if not aircraft and rig.vb.turret_root is not None:
        # Sim Y has the opposite sign to Blender Y.
        spec['turret_pivot_mt'] = [round(rig.vb.pivot[0] * 1000), round(-rig.vb.pivot[1] * 1000)]
    if aircraft:
        spec['air'] = {'cruise_altitude_mt': 1400, 'shadow_from_ground_anchor': True,
                       'rendered_at_ground': True}
    if aliases:
        spec['aliases'] = aliases
    return spec

if __name__ == '__main__':
    lane = next((x for x in sys.argv[1:] if x in LANES), 'vehicle')
    entries = []
    for unit in inventory.parse_units(inventory.read_design()):
        cls = inventory.unit_class(unit)
        if not cls.startswith(lane):
            continue
        spec = make_spec(unit)
        if spec is None:
            continue
        path = REPO / 'assets/pipeline/specs' / f'{spec["id"]}.json'
        if '--check' in sys.argv:
            assert json.loads(path.read_text()) == spec, f'Spec drift: {path}'
        else:
            if path.exists() and json.loads(path.read_text()).get('model') != spec['model']:
                raise RuntimeError(f'Refusing to replace another source: {path}')
            path.write_text(json.dumps(spec, indent=2) + '\n')
        entries.append({'id': spec['id'], 'poses': sum(s['directions'] * s['frames'] for s in spec['states'])})
    report = {'scope': 'source specifications only; no rendered or accepted art claim',
              'count': len(entries), 'poses': sum(e['poses'] for e in entries), 'entries': entries}
    out = REPO / 'work/art' / LANES[lane]
    out.mkdir(parents=True, exist_ok=True)
    if '--check' not in sys.argv:
        (out / 'specifications.json').write_text(json.dumps(report, indent=2) + '\n')
    print(lane, report['count'], 'specs;', report['poses'], 'required source poses')
