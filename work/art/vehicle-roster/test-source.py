"""Focused semantic source contracts. Uses geometry recorder, never launches Blender."""
import importlib
import json
import math
import sys
import unittest
from pathlib import Path

repo = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(repo / 'work/art/vehicle-roster/preview'), str(repo / 'assets/pipeline/blender/models')]
import fcpreview as fc
fc.install()
import vehicle_roster as ground
import aircraft_roster as air

def spec(kind):
    return json.loads((repo / 'assets/pipeline/specs' / ('unit.' + kind + '.json')).read_text())

def state(kind, name):
    return next(s for s in spec(kind)['states'] if s['name'] == name)

def build(module, kind):
    fc.reset()
    return module.build(kind[:2], {'kind': kind})

class SourceContracts(unittest.TestCase):
    def test_exact_owned_roster_and_gameplay_radii(self):
        catalog = json.loads((repo / 'pkg/content/rules.json').read_text())['units']
        infantry = {'rifle', 'at', 'recon', 'elite', 'engineer', 'medic', 'portable_aa'}
        legacy = {'US.tank', 'SY.car', 'IR.strike', 'SA.mobile_abm'}
        owned = [u for u in catalog if u['role'] not in infantry | {'rig', 'hauler'} and u['id'] not in legacy]
        self.assertEqual({u['id'] for u in owned}, set(ground.KINDS) | set(air.KINDS))
        self.assertEqual((len(ground.KINDS), len(air.KINDS)), (27, 11))
        for unit in owned:
            self.assertEqual(spec(unit['id'])['footprint_radius_mt'], unit['radius'])

    def test_faction_mismatch_cannot_silently_repaint_another_faction(self):
        for module, kind in ((ground, 'SA.tank'), (air, 'IR.fighter')):
            with self.assertRaises(ValueError):
                module.build('US', {'kind': kind})

    def test_independent_turret_shadow_and_sim_y_registration(self):
        for kind in ground.KINDS:
            rig = build(ground, kind)
            if not rig.vb.turret_root:
                continue
            pivot = spec(kind)['turret_pivot_mt']
            for direction in range(16):
                visible, shadows = ground.pose(rig, state(kind, 'idle'), 0, direction)
                self.assertFalse(set(rig.parts['turret']) & set(visible + shadows))
                a = direction * math.tau / 16
                expected = (pivot[0] * math.cos(a) - pivot[1] * math.sin(a),
                            pivot[0] * math.sin(a) + pivot[1] * math.cos(a))
                actual = rig.vb.turret_root.matrix_world[:3, 3]
                self.assertAlmostEqual(actual[0] * 1000, expected[0], places=7)
                self.assertAlmostEqual(-actual[1] * 1000, expected[1], places=7)
            visible, shadows = ground.pose(rig, state(kind, 'aim'), 0, 9)
            self.assertTrue(shadows)
            self.assertEqual(set(shadows), set(rig.parts['turret']))
            self.assertEqual(tuple(rig.vb.turret_root.location[:2]), (0, 0))

    def test_transport_doors_and_hulldown_do_not_duplicate_turrets(self):
        for kind in ('US.apc', 'IR.apc', 'SY.apc', 'SA.apc', 'SA.tank'):
            rig = build(ground, kind)
            name = 'hulldown' if kind.endswith('.tank') else 'doors_open'
            st = state(kind, name)
            first, _ = ground.pose(rig, st, 0, 3)
            poses = [tuple(o.rotation_euler) for o in rig.original]
            last, shadows = ground.pose(rig, st, st['frames'] - 1, 3)
            self.assertNotEqual(poses, [tuple(o.rotation_euler) for o in rig.original])
            self.assertFalse(set(rig.parts['turret']) & set(first + last + shadows))

    def test_launcher_deployed_and_visible_charge_levels(self):
        for faction in ('US', 'IR', 'SY', 'SA'):
            kind = faction + '.launcher'
            rig = build(ground, kind)
            self.assertEqual(len(rig.vb.h['missiles']), 2 if faction == 'IR' else 1)
            empty, _ = ground.pose(rig, state(kind, 'ready_empty'), 0, 0)
            for pieces in rig.vb.h['missiles']:
                self.assertFalse(set(empty) & set(pieces))
            one, _ = ground.pose(rig, state(kind, 'ready'), 0, 0)
            self.assertTrue(set(one) & set(rig.vb.h['missiles'][0]))
            expected = tuple(rig.vb.h['erector'].rotation_euler)
            ground.pose(rig, state(kind, 'fire'), 0, 0)
            self.assertEqual(tuple(rig.vb.h['erector'].rotation_euler), expected)
            if faction == 'IR':
                self.assertFalse(set(one) & set(rig.vb.h['missiles'][1]))
                two, _ = ground.pose(rig, state(kind, 'ready_two_charges'), 0, 0)
                self.assertTrue(set(two) & set(rig.vb.h['missiles'][1]))

    def test_unarmed_aircraft_have_no_weapon_or_payload(self):
        for kind in ('US.airlift', 'IR.isr', 'SY.scout_drone'):
            rig = build(air, kind)
            self.assertFalse(rig.airframe.payloads)
            self.assertNotIn('fire', {s['name'] for s in spec(kind)['states']})
            self.assertNotIn('muzzle', rig.hardpoints)

    def test_empty_payload_service_and_parked_gear(self):
        for kind in air.KINDS:
            rig = build(air, kind)
            A = rig.airframe
            parked, _ = air.pose(rig, state(kind, 'parked'), 0, 0)
            self.assertFalse(any(o.name.endswith('_blur') for o in parked))
            self.assertTrue(all(tuple(gear.rotation_euler) == (0, 0, 0) for gear in A.gear))
            service, _ = air.pose(rig, state(kind, 'rearm'), 0, 0)
            self.assertTrue(A.panels)
            self.assertTrue(all(abs(hinge.rotation_euler[0]) > 1 for hinge, side in A.panels))
            if A.payloads:
                empty, _ = air.pose(rig, state(kind, 'empty'), 0, 0)
                for _, pieces in A.payloads:
                    self.assertTrue(set(parked) & set(pieces))
                    self.assertFalse(set(empty) & set(pieces))
            air.pose(rig, state(kind, 'parked'), 0, 0)
            self.assertTrue(all(tuple(hinge.rotation_euler) == (0, 0, 0) for hinge, side in A.panels))

    def test_airlift_door_access_and_rotor_station_separation(self):
        rig = build(air, 'US.airlift')
        A = rig.airframe
        self.assertEqual(len(A.rotors), 2)
        self.assertEqual(len(A.doors), 3)
        air.pose(rig, state('US.airlift', 'hover_low_board'), 0, 0)
        for door, motion, side in A.doors:
            if motion == 'ramp':
                self.assertLess(door.rotation_euler[1], -1)
            else:
                self.assertLess(door.location[0], rig.original[door][0][0])
        # Coaxial projections may overlap, physical rotor planes have clearance.
        z = [spin.parent.location[2] for spin, _, _ in A.rotors]
        self.assertGreater(abs(z[0] - z[1]), .10)

    def test_rotor_samples_do_not_alias_to_identical_blade_spacing(self):
        for kind in air.KINDS:
            rig = build(air, kind)
            if not rig.airframe.rotors:
                continue
            st = spec(kind)['states'][0]
            air.pose(rig, st, 0, 0)
            first = [spin.rotation_euler[2] for spin, _, _ in rig.airframe.rotors]
            air.pose(rig, st, 1, 0)
            for initial, (spin, blades, _) in zip(first, rig.airframe.rotors):
                blade_period = math.tau / len(blades)
                self.assertGreater((spin.rotation_euler[2] - initial) % blade_period, .001)

if __name__ == '__main__':
    unittest.main(verbosity=2)
