"""US.airlift open-cabin regression plus parity for the ten untouched aircraft.

Uses the geometry recorder, never Blender; actual Cycles review remains required.
"""
import hashlib
import importlib.util
import json
import subprocess
import sys
import types
import unittest
from pathlib import Path
import numpy as np

repo = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(repo / 'work/art/vehicle-roster'), str(repo / 'work/art/vehicle-roster/preview'), str(repo / 'assets/pipeline/blender/models')]
import fcpreview as fc
fc.install()
import aircraft_roster as air
check_spec = importlib.util.spec_from_file_location('source_check', repo / 'work/art/vehicle-roster/check-source.py')
check = importlib.util.module_from_spec(check_spec)
check_spec.loader.exec_module(check)

def spec(kind):
    return json.loads((repo / 'assets/pipeline/specs' / ('unit.' + kind + '.json')).read_text())

def build(module, kind):
    fc.reset()
    return module.build(kind[:2], {'kind': kind})

def segment_hits(objects, start, end):
    """Möller–Trumbore intersections on recorded primitive triangles."""
    origin, finish = np.array(start), np.array(end)
    direction = finish - origin
    hits = []
    for obj in objects:
        points = obj.world_verts()
        for face in obj.faces:
            for k in range(1, len(face) - 1):
                a, b, c = points[[face[0], face[k], face[k + 1]]]
                edge1, edge2 = b - a, c - a
                h = np.cross(direction, edge2)
                determinant = np.dot(edge1, h)
                if abs(determinant) < 1e-9:
                    continue
                offset = origin - a
                u = np.dot(offset, h) / determinant
                q = np.cross(offset, edge1)
                v = np.dot(direction, q) / determinant
                t = np.dot(edge2, q) / determinant
                if 0 <= u <= 1 and 0 <= v and u + v <= 1 and 0 <= t <= 1:
                    hits.append((float(t), obj.name))
    return sorted(hits)

class Apertures(unittest.TestCase):
    def test_open_boarding_apertures_have_no_solid_cabin_behind_them(self):
        rig = build(air, 'US.airlift')
        states = {s['name']: s for s in spec('US.airlift')['states']}
        rays = [('rear_ramp', (-1.30, 0, .45), (-.40, 0, .45)),
                ('door_panel_1', (.37, .50, .44), (.37, 0, .44)),
                ('door_panel_-1', (.37, -.50, .44), (.37, 0, .44))]
        for state, closed in [('hover', True), ('hover_low_board', False), ('hover', True)]:
            visible, _ = air.pose(rig, states[state], 0, 0)
            for name, start, end in rays:
                hits = segment_hits(visible, start, end)
                if closed:
                    self.assertTrue(any(mesh == name for _, mesh in hits), (state, name, hits))
                else:
                    self.assertFalse(hits, (state, name, hits))

    def test_ramp_descends_toward_ground_and_reset_closes_it(self):
        rig = build(air, 'US.airlift')
        states = {s['name']: s for s in spec('US.airlift')['states']}
        ramp = next(o for o in rig.original if o.name == 'rear_ramp')
        for frame in range(states['hover_low_board']['frames']):
            air.pose(rig, states['hover_low_board'], frame, 0)
            vertices = ramp.world_verts()
            tip = vertices[np.argmin(vertices[:, 0])]
            self.assertLess(tip[0], -1.18)
            self.assertGreater(vertices[:, 2].min(), 0)
            self.assertLess(tip[2], .08)
        air.pose(rig, states['hover'], 0, 0)
        self.assertGreater(ramp.world_verts()[:, 2].max(), .60)
        self.assertGreater(ramp.world_verts()[:, 0].min(), -.95)

    def test_other_ten_aircraft_geometry_and_every_pose_are_unchanged(self):
        original = types.ModuleType('aircraft_original')
        source = subprocess.check_output(['git', 'show', '00011c3:assets/pipeline/blender/models/aircraft_roster.py'], cwd=repo)
        exec(compile(source, '<aircraft-original-00011c3>', 'exec'), original.__dict__)
        def geometry(rig):
            return [(o.name, o.parent.name if o.parent else None,
                     None if o.verts is None else o.verts.tolist(), o.faces,
                     (o.material.name, o.material.color, o.material.team, o.material.alpha) if o.material else None,
                     o.visible_shadow, o.props) for o in rig.original]
        reports = []
        for kind in sorted(set(air.KINDS) - {'US.airlift'}):
            asset = spec(kind)
            poses = [(s, d, f) for s in asset['states'] for d in range(s['directions']) for f in range(s['frames'])]
            old = build(original, kind)
            old_geometry = json.dumps(geometry(old), sort_keys=True)
            old_poses = []
            for state, direction, frame in poses:
                visible, shadows = original.pose(old, state, frame, direction)
                old_poses.append(check.signature(old, visible, shadows))
            new = build(air, kind)
            self.assertEqual(json.dumps(geometry(new), sort_keys=True), old_geometry, kind)
            for index, (state, direction, frame) in enumerate(poses):
                visible, shadows = air.pose(new, state, frame, direction)
                self.assertEqual(check.signature(new, visible, shadows), old_poses[index], (kind, state, direction, frame))
            reports.append({'id': kind, 'poses_unchanged': len(poses), 'geometry_sha256': hashlib.sha256(old_geometry.encode()).hexdigest()})
        (repo / 'work/art/aircraft-roster/airlift-aperture-parity.json').write_text(json.dumps({
            'baseline': '00011c3', 'scope': 'Recorded primitive geometry, all pose transforms, layer membership and material controls; not rendered-pixel equivalence',
            'entries': reports, 'other_aircraft': len(reports), 'unchanged_poses': sum(v['poses_unchanged'] for v in reports)}, indent=2) + '\n')

if __name__ == '__main__':
    unittest.main(verbosity=2)
