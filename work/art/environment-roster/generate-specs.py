"""Create the 21 missing prop specs only; preserve five legacy samples exactly."""
import hashlib
import json
import sys
from pathlib import Path
repo = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(repo / 'work/art/vehicle-roster/preview'), str(repo / 'assets/pipeline/blender/models')]
import fcpreview as fc
fc.install()
import environment_roster as model

LEGACY = {'supply_field', 'sandbags', 'rocks', 'rubble_cover', 'shrub'}
PRIMARY = {'destructible_wall_hp_light': ('light_prop', 1, 150, 0),
           'destructible_wall_hp_heavy': ('heavy_prop', 2, 600, 0),
           'warehouse_garrisonable': ('garrison', 3, 900, 2),
           'ruined_house_garrisonable': ('garrison', 3, 900, 2)}
CONSTRAINTS = {
    'supply_station_neutral': 'Draw only for an actual publicly disclosed station; ownership flag is renderer data, no collider or new income.',
    'central_shipment_site': 'Public map shipment location, flat open apron. Draw arriving cargo only after Go creates/discloses its resource field.',
    'palm': 'Decoration only; no implied cover, detection, collider or sight blocker. Avoid silhouettes over actor/route space.',
    'forest_edge_scrub': 'Use only on actual forest_edge cover terrain; art does not create cover or vehicle slowdown.',
    'fence_chainlink': 'Open decorative mesh; no implicit collider or sight blocker. Do not visually close a passable mandatory route.',
    'concrete_barrier': 'Short decorative barrier; no automatic cover or collider. Needs explicit gameplay object/terrain binding before route placement.',
    'container_stack': 'Industrial decorative candidate; solid mass must never obstruct a traversable route visually. No automatic heavy_prop assignment.',
    'fuel_tanks': 'Industrial decorative candidate, no secondary explosion/damage mechanic. Do not imply a new target without Go object binding.',
    'warehouse_garrisonable': 'Exact Go garrison 3x3, 900 HP, two squads. Entry/capacity plaque; public owner and authorized damage only.',
    'ruined_house_garrisonable': 'Alternative skin only for exact Go garrison 3x3, 900 HP, two squads. Pre-existing ruin remains intact game state until Go destruction.',
    'decor_building_nongarrison': 'Sealed non-enterable decoration: no two-squad plaque, entry hardpoint or automatic HP/collider.',
    'bridge_permanent': 'Permanent one-tile deck module. Align on actual bridge tiles; rails only at real outer crossing edges. No destruction state.',
    'wreck_decor_vehicle': 'Static unselectable scenery only: no salvage crate, collision, reward, or real defeated actor identity.',
    'power_pylon': 'Open-lattice decoration: no power network, cover or automatic sight blocking.',
    'destructible_wall_hp_light': 'Exact Go light_prop 1x1, 150 HP, movement blocker. Does not intrinsically block sight. Destroyed footprint becomes authorized rubble.',
    'destructible_wall_hp_heavy': 'Exact Go heavy_prop 2x2, 600 HP, movement blocker. Does not intrinsically block sight. Destroyed footprint becomes authorized rubble.',
    'relay_objective': 'Presentation candidate only. Existing mission targets keep their actual Go type/HP/footprint; no automatic reskin from a private tag.',
    'command_relay_objective': 'Presentation candidate only. Requires public objective binding matching actual footprint; no new target or radar information.',
    'depot_objective': 'Presentation candidate only. No automatic income/production/storage or private mission-tag inference.',
    'spawn_marker_editor': 'Editor-only public spawn direction marker; never a live match actor or visibility source.',
    'region_marker_editor': 'Editor-only region corner marker; live objective markers remain separately authorized public presentation.',
}

def make_spec(entry):
    kind = entry['id'].removeprefix('prop.')
    fc.reset()
    rig = model.build(None, {'prop': kind})
    names = list(entry['spec']['states'])
    if kind == 'bridge_permanent':
        names += ['deck', 'edge_left', 'edge_right']
    editor = kind.endswith('_editor')
    layers = ['beauty'] if editor else ['beauty', 'shadow']
    spec = {'id': entry['id'], 'model': 'environment_roster', 'faction': None, 'author': 'Codex',
        'params': {'prop': kind}, 'canvas': [608, 480], 'anchor': [304, 300], 'passes': layers,
        'footprint_mt': [round(v * 1000) for v in rig.environment.size],
        'states': [{'name': name, 'part': 'prop', 'directions': 4, 'frames': 1, 'fps': 0,
                    'loop': name != 'destroyed', 'layers': layers} for name in names],
        'provenance': {'kind': 'project-original-procedural-model', 'author': 'Codex',
            'authorization': 'User-approved Claude quota takeover; assignment 10 continuation',
            'shared_library': 'Claude Code claude-opus-5-5 authored fclib.py',
            'source_model': 'assets/pipeline/blender/models/environment_roster.py',
            'license': 'Project-original work created for Frontline Command in this repository; all rights held by the project owner.'},
        'integration_constraint': CONSTRAINTS[kind]}
    if 'intact' in names:
        spec['aliases'] = [{'name': 'idle', 'source': 'intact'}, {'name': 'rubble', 'source': 'destroyed'},
                           {'name': 'wreck', 'source': 'destroyed'}]
    if kind in PRIMARY:
        cls, width, hp, capacity = PRIMARY[kind]
        spec['footprint_tiles'] = [width, width]
        spec['gameplay_binding'] = {'object_class': cls, 'hp': hp, 'capacity': capacity,
                                    'intrinsic_sight_blocker': False}
    if editor:
        spec['editor_only'] = True
    return spec

if __name__ == '__main__':
    entries = [e for e in json.loads((repo / 'assets/manifest/asset-manifest.json').read_text())['entries'] if e['category'] == 'prop']
    wanted = [e for e in entries if e['id'].removeprefix('prop.') not in LEGACY]
    assert {e['id'].removeprefix('prop.') for e in wanted} == set(model.KINDS)
    guards = [repo / 'assets/pipeline/blender/models/props.py'] + [repo / 'assets/pipeline/specs' / ('prop.' + p + '.json') for p in sorted(LEGACY)]
    before = {str(p.relative_to(repo)): hashlib.sha256(p.read_bytes()).hexdigest() for p in guards}
    records = []
    for entry in wanted:
        spec = make_spec(entry)
        path = repo / 'assets/pipeline/specs' / (entry['id'] + '.json')
        if '--check' in sys.argv:
            assert json.loads(path.read_text()) == spec, 'Spec drift: ' + str(path)
        else:
            if path.exists() and json.loads(path.read_text()).get('model') != 'environment_roster':
                raise ValueError('Refusing to overwrite another source: ' + str(path))
            path.write_text(json.dumps(spec, indent=2) + '\n')
        records.append({'id': spec['id'], 'states': [s['name'] for s in spec['states']],
                        'source_poses': sum(s['directions'] * s['frames'] for s in spec['states'])})
    assert before == {str(p.relative_to(repo)): hashlib.sha256(p.read_bytes()).hexdigest() for p in guards}
    if '--check' not in sys.argv:
        (repo / 'work/art/environment-roster/prop-specifications.json').write_text(json.dumps({
            'scope': 'source specs only; not rendered or approved art', 'count': len(records),
            'source_poses': sum(r['source_poses'] for r in records), 'entries': records,
            'preserved_legacy': before}, indent=2) + '\n')
    print(len(records), 'new source specs;', sum(r['source_poses'] for r in records), 'poses; five legacy specs unchanged')
