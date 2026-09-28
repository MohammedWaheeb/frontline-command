"""Blender-free source/registration audit, using Claude's recording fclib stub.

This checks declared transforms, membership, hierarchy, hardpoints and geometric
bounds. It cannot certify Cycles pixels, material masks, bevels, alpha or art.
"""
import hashlib
import importlib
import itertools
import json
import math
import sys
from pathlib import Path
import numpy as np

REPO = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(REPO / 'work/art/vehicle-roster/preview'), str(REPO / 'assets/pipeline/blender/models')]
import fcpreview as fc
fc.install()

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def signature(rig, visible, shadow):
    payload = {'transforms': [(o.name, tuple(o.location), tuple(o.rotation_euler), tuple(o.scale))
                              for o in rig.original],
               'visible': sorted(o.name for o in visible), 'shadow': sorted(o.name for o in shadow),
               'materials': dict(fc.STATE)}
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()

def bounds(objects, corners, basis, shadow=False):
    cache = {}
    def world(o):
        if o not in cache:
            local = o.local_matrix()
            cache[o] = world(o.parent) @ local if o.parent else local
        return cache[o]
    low, high = np.full(2, np.inf), np.full(2, -np.inf)
    travel = fc.sun_travel()
    for o in objects:
        if o.type != 'MESH' or shadow and not o.visible_shadow:
            continue
        m = world(o)
        points = corners[o] @ m[:3, :3].T + m[:3, 3]
        if shadow:
            t = np.maximum(points[:, 2], 0) / -travel[2]
            points = points + travel * t[:, None]
            points[:, 2] = 0
        projected = fc.project(points, [1, 1], [0, 0], basis)
        low, high = np.minimum(low, projected.min(axis=0)), np.maximum(high, projected.max(axis=0))
    return low, high

def audit(path):
    spec = json.loads(path.read_text())
    fc.reset()
    model = importlib.import_module(spec['model'])
    rig = model.build(spec['faction'], spec['params'])
    objects = list(rig.original)
    assert len({o.name for o in objects}) == len(objects), (spec['id'], 'duplicate source object names')
    corners = {o: np.array(list(itertools.product(*zip(o.verts.min(axis=0), o.verts.max(axis=0)))))
               for o in objects if o.type == 'MESH'}
    poses = [(s, d, f) for s in spec['states'] for d in range(s['directions']) for f in range(s['frames'])]
    states = {s['name']: s for s in spec['states']}
    for alias in spec.get('aliases', []):
        assert alias['name'] not in states and alias['source'] in states, (spec['id'], alias)
        states[alias['name']] = states[alias['source']]
    baseline, state_signatures = {}, {}
    geometric_low, geometric_high = np.full(2, np.inf), np.full(2, -np.inf)
    basis = fc.camera_basis()
    for state, direction, frame in poses:
        visible, shadow = model.pose(rig, state, frame, direction)
        assert visible, (spec['id'], state['name'], 'empty pose')
        assert all(o in corners for o in visible + shadow), 'Unregistered visible mesh'
        assert all(math.isfinite(v) for o in objects for a in (o.location, o.rotation_euler, o.scale) for v in a)
        key = f"{state['name']}/d{direction:02d}_f{frame:02d}"
        baseline[key] = signature(rig, visible, shadow)
        state_signatures.setdefault(state['name'], set()).add(baseline[key])
        # Model AABBs deliberately overestimate rotated shapes; 12px extra
        # margin remains for bevel, glow and shadow penumbra in real Cycles.
        for obs, is_shadow in ((visible, False), (shadow, True)):
            if not obs:
                continue
            low, high = bounds(obs, corners, basis, is_shadow)
            geometric_low, geometric_high = np.minimum(geometric_low, low), np.maximum(geometric_high, high)
        for name, hp in rig.hardpoints.items():
            assert hp in objects and hp.get('fc_parts'), (spec['id'], name, 'hardpoint contract')
        if state.get('part') == 'turret':
            assert all(o in rig.parts['turret'] for o in shadow)
            assert shadow and 'shadow' in state['layers'], 'Turret lacks independent ground shadow'
        if state.get('part') == 'hull':
            assert not set(visible).intersection(rig.parts['turret']), 'Turret duplicated in hull plate'
            assert not set(shadow).intersection(rig.parts['turret']), 'Static turret shadow in hull'
    for state, direction, frame in reversed(poses):
        visible, shadow = model.pose(rig, state, frame, direction)
        key = f"{state['name']}/d{direction:02d}_f{frame:02d}"
        assert signature(rig, visible, shadow) == baseline[key], (spec['id'], key, 'order dependent pose')
    anchor, canvas = np.array(spec['anchor']), np.array(spec['canvas'])
    margins = np.concatenate((geometric_low + anchor, canvas - geometric_high - anchor))
    report = {'id': spec['id'], 'source_sha256': sha(REPO / 'assets/pipeline/blender/models' / f'{spec["model"]}.py'),
              'spec_sha256': sha(path), 'objects': len(objects), 'source_poses': len(poses),
              'reverse_order_comparisons': len(poses), 'failures': 0,
              'projected_conservative_bounds_relative_anchor': [geometric_low.round(3).tolist(), geometric_high.round(3).tolist()],
              'canvas': spec['canvas'], 'anchor': spec['anchor'], 'minimum_margin_2x_px': round(float(margins.min()), 3),
              'scope': 'Blender-free primitive geometry; no pixel, mask, lighting, UI-art or shipping claim'}
    assert margins.min() >= 12, (spec['id'], 'canvas too small for conservative source bounds', report)
    if spec['model'] == 'vehicle_roster' and rig.vb.turret_root:
        assert spec['turret_pivot_mt'] == [round(rig.vb.pivot[0] * 1000), round(-rig.vb.pivot[1] * 1000)]
    return report

if __name__ == '__main__':
    lane = sys.argv[1] if len(sys.argv) > 1 else 'vehicle'
    module = lane + '_roster'
    paths = sorted(p for p in (REPO / 'assets/pipeline/specs').glob('unit.*.json')
                   if json.loads(p.read_text()).get('model') == module)
    ids = set(sys.argv[2:])
    reports = []
    for path in paths:
        if ids and path.stem not in ids:
            continue
        report = audit(path)
        reports.append(report)
        print(report['id'], report['source_poses'], 'poses; margin', report['minimum_margin_2x_px'], flush=True)
    out = REPO / 'work/art' / (lane + '-roster')
    out.mkdir(parents=True, exist_ok=True)
    report = {'scope': 'Source geometry only; actual Blender render and native-size approval pending',
              'entries': reports, 'count': len(reports), 'source_poses': sum(r['source_poses'] for r in reports),
              'comparisons': sum(r['reverse_order_comparisons'] for r in reports), 'failures': 0}
    (out / ('source-check-selected.json' if ids else 'source-check.json')).write_text(json.dumps(report, indent=2) + '\n')
    print('SOURCE_CHECK_DONE', report['count'], report['source_poses'], flush=True)
