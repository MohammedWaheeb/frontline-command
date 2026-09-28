"""Semantic source contracts; no gameplay or renderer mutations."""
import hashlib
import json
import sys
import unittest
from pathlib import Path
repo = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(repo / 'work/art/vehicle-roster/preview'), str(repo / 'assets/pipeline/blender/models')]
import fcpreview as fc
fc.install()
import environment_roster as model
def spec(kind):
    return json.loads((repo / 'assets/pipeline/specs' / ('prop.' + kind + '.json')).read_text())
def build(kind):
    fc.reset()
    return model.build(None, {'prop': kind})
def state(kind, name):
    return next(s for s in spec(kind)['states'] if s['name'] == name)

class Props(unittest.TestCase):
    def test_exact_missing_manifest_roster(self):
        entries = json.loads((repo / 'assets/manifest/asset-manifest.json').read_text())['entries']
        legacy = {'supply_field', 'sandbags', 'rocks', 'rubble_cover', 'shrub'}
        required = {e['id'].removeprefix('prop.') for e in entries if e['category'] == 'prop'}
        self.assertEqual(set(model.KINDS), required - legacy)
        self.assertEqual(len(model.KINDS), 21)
        for e in entries:
            kind = e['id'].removeprefix('prop.')
            if e['category'] == 'prop' and kind in model.KINDS:
                expected = e['spec']['states'] + (['deck', 'edge_left', 'edge_right'] if kind == 'bridge_permanent' else [])
                self.assertEqual([s['name'] for s in spec(kind)['states']], expected)

    def test_five_legacy_samples_and_source_are_unchanged(self):
        saved = json.loads((repo / 'work/art/environment-roster/prop-source-lock.json').read_text())['preserved_legacy']
        self.assertEqual(len(saved), 6)
        for path, expected in saved.items():
            self.assertEqual(hashlib.sha256((repo / path).read_bytes()).hexdigest(), expected)

    def test_only_explicit_three_gameplay_classes_receive_bindings(self):
        wanted = {'destructible_wall_hp_light': ('light_prop', 1, 150, 0),
                  'destructible_wall_hp_heavy': ('heavy_prop', 2, 600, 0),
                  'warehouse_garrisonable': ('garrison', 3, 900, 2),
                  'ruined_house_garrisonable': ('garrison', 3, 900, 2)}
        for kind in model.KINDS:
            data = spec(kind)
            if kind not in wanted:
                self.assertNotIn('gameplay_binding', data)
                continue
            binding = data['gameplay_binding']
            cls, width, hp, capacity = wanted[kind]
            self.assertEqual(binding, {'object_class': cls, 'hp': hp, 'capacity': capacity, 'intrinsic_sight_blocker': False})
            self.assertEqual(data['footprint_tiles'], [width, width])

    def test_garrisons_have_entry_capacity_and_unenterable_structure_does_not(self):
        for kind in ('warehouse_garrisonable', 'ruined_house_garrisonable', 'decor_building_nongarrison'):
            rig = build(kind)
            if kind == 'decor_building_nongarrison':
                self.assertNotIn('entry', rig.hardpoints)
                self.assertNotIn('capacity', rig.hardpoints)
                self.assertFalse(any(o.name.startswith('capacity_plaque') for o in rig.original))
            else:
                self.assertIn('entry', rig.hardpoints)
                self.assertIn('capacity', rig.hardpoints)
                self.assertEqual(sum(o.name.startswith('capacity_plaque') for o in rig.original), 2)

    def test_destruction_removes_every_upright_intact_mesh(self):
        for kind in model.KINDS:
            states = {s['name'] for s in spec(kind)['states']}
            if 'destroyed' not in states:
                continue
            rig = build(kind)
            intact, _ = model.pose(rig, state(kind, 'intact'), 0, 0)
            damaged, _ = model.pose(rig, state(kind, 'damaged'), 0, 0)
            destroyed, _ = model.pose(rig, state(kind, 'destroyed'), 0, 0)
            self.assertTrue(rig.environment.rubble)
            self.assertNotEqual(set(intact), set(damaged))
            self.assertFalse(set(destroyed) & set(rig.environment.intact))
            self.assertEqual(set(destroyed), set(rig.environment.always + rig.environment.rubble))
            for obj in destroyed:
                self.assertLess(obj.world_verts()[:, 2].max(), .23)
            restored, _ = model.pose(rig, state(kind, 'intact'), 0, 0)
            self.assertEqual(restored, intact)
            self.assertEqual(fc.STATE['char'], 0)

    def test_permanent_bridge_has_no_damage_state_and_editor_marks_cast_no_shadow(self):
        self.assertEqual([s['name'] for s in spec('bridge_permanent')['states']], ['idle', 'deck', 'edge_left', 'edge_right'])
        rig = build('bridge_permanent')
        for name, edges in (('idle', 2), ('deck', 0), ('edge_left', 1), ('edge_right', 1)):
            visible, _ = model.pose(rig, state('bridge_permanent', name), 0, 0)
            self.assertEqual(sum(o.name.startswith('handrail_') for o in visible), edges)
        for kind in ('spawn_marker_editor', 'region_marker_editor'):
            data = spec(kind)
            self.assertTrue(data['editor_only'])
            self.assertEqual(data['passes'], ['beauty'])
            rig = build(kind)
            visible, shadow = model.pose(rig, state(kind, 'idle'), 0, 0)
            self.assertTrue(visible)
            self.assertEqual(shadow, [])

    def test_no_prop_has_team_material_or_faction(self):
        for kind in model.KINDS:
            rig = build(kind)
            self.assertTrue(all(not o.material or not o.material.team for o in rig.original if o.type == 'MESH'))
            self.assertIsNone(spec(kind)['faction'])
            with self.assertRaises(ValueError):
                model.build('US', {'prop': kind})

if __name__ == '__main__':
    unittest.main(verbosity=2)
