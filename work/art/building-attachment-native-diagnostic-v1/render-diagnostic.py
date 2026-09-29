"""Read-only evaluated attachment inventory and 15 native source views.

Run only at a sole-Blender boundary. Instrumentation records objects returned by
the original constructors; it does not change parenting, transforms or geometry.
"""
from pathlib import Path
import datetime
import hashlib
import json
import sys

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[2]
FAMILY = REPO / 'work/art/building-final-production-v1'
AUDIT = REPO / 'work/art/building-attachment-source-audit-v1/result.json'
EXPECTED_AUDIT = 'a90a0122f58458a2390c989c0c47ef6f40b5b3973e4cbcd6632afea4e849eab6'
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
assert sha(AUDIT) == EXPECTED_AUDIT
audit = json.loads(AUDIT.read_text())
lock_path = FAMILY / 'production-lock.json'
assert sha(lock_path) == audit['lockSHA256']
lock = json.loads(lock_path.read_text())
STAGE = REPO / lock['stage']
for relative, digest in lock['sources'].items():
    assert sha(STAGE / relative) == digest, relative
sys.path[:0] = [str(STAGE / 'assets/pipeline/blender'),
               str(STAGE / 'assets/pipeline/blender/models')]
import fclib
import building_roster as model
from mathutils import Vector
from mathutils.bvhtree import BVHTree

OUT = BASE / 'original-v1'
assert not OUT.exists(), 'Preserve an existing diagnostic attempt.'
OUT.mkdir()
RENDER_IDS = {'building.SY.barracks', 'building.SY.factory',
              'building.SY.radar', 'building.IR.tech',
              'building.SA.repair_depot'}
report = {
    'time': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope': 'Original frozen source, 18-ID evaluated inventory and 15 native '
             'idle/damaged/critical views. Membership and downward rays are '
             'diagnostics, not a structural or native acceptance verdict.',
    'source_audit_sha256': sha(AUDIT), 'source_lock_sha256': sha(lock_path),
    'script_sha256': sha(Path(__file__)), 'sources': lock['sources'],
    'assets': [], 'failures': 0,
}
original_block = model.Architect.block
original_vents = model.Architect.vents


def remember(architect, owner, children, kind):
    groups = getattr(architect.r, 'diagnostic_attachment_groups', [])
    groups.append((owner, children, kind))
    architect.r.diagnostic_attachment_groups = groups


def tracked_block(self, name, *args, **kwargs):
    before = len(self.r.structure)
    result = original_block(self, name, *args, **kwargs)
    if self.faction == 'SY':
        new = self.r.structure[before:]
        owners = [o for o in new if o.name.split('.')[0] == name + '_roof']
        details = [o for o in new if o.name.split('.')[0] in
                   (name + '_patch', name + '_roof_rib')]
        assert len(owners) == 1 and details, name
        remember(self, owners[0], details, 'block_roof_detail')
    return result


def tracked_vents(self, *args, **kwargs):
    before = len(self.r.structure)
    result = original_vents(self, *args, **kwargs)
    owner, children = None, []
    for obj in self.r.structure[before:]:
        stem = obj.name.split('.')[0]
        if stem == 'vent_box':
            if owner is not None:
                assert len(children) == 3
                remember(self, owner, children, 'vent_slots')
            owner, children = obj, []
        elif stem == 'vent_slot':
            assert owner is not None
            children.append(obj)
        else:
            raise AssertionError(('Unexpected vent constructor object', obj.name))
    assert owner is not None and len(children) == 3
    remember(self, owner, children, 'vent_slots')
    return result


def evaluated_geometry(obj):
    ev = obj.evaluated_get(fclib.bpy.context.evaluated_depsgraph_get())
    mesh = ev.to_mesh()
    try:
        return ([ev.matrix_world @ v.co for v in mesh.vertices],
                [tuple(p.vertices) for p in mesh.polygons])
    finally:
        ev.to_mesh_clear()


def combined_tree(objects):
    vertices, polygons = [], []
    for obj in objects:
        if obj.type != 'MESH':
            continue
        vs, ps = evaluated_geometry(obj)
        offset = len(vertices)
        vertices.extend(vs)
        polygons.extend(tuple(i + offset for i in p) for p in ps)
    return BVHTree.FromPolygons(vertices, polygons, all_triangles=False) if polygons else None


def record_state(rig, visible, shadow):
    body, cast = set(visible), set(shadow)
    groups = rig.diagnostic_attachment_groups
    all_details = {child for _, children, _ in groups for child in children}
    # Exclude all suspect details so one floating rib cannot support another.
    support = combined_tree(o for o in visible if o not in all_details)
    rows = []
    for owner, children, kind in groups:
        details = []
        for child in children:
            vertices, polygons = evaluated_geometry(child)
            rec = {'name': child.name, 'parent': child.parent.name if child.parent else None,
                   'visible': child in body, 'shadow': child in cast,
                   'evaluated_vertices': len(vertices)}
            if child in body and vertices:
                lo = [min(v[i] for v in vertices) for i in range(3)]
                hi = [max(v[i] for v in vertices) for i in range(3)]
                rec['world_bounds'] = [lo, hi]
                origin = Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]))
                hit = support.ray_cast(origin, Vector((0, 0, -1)), 10) if support else None
                rec['center_downward_gap_bu'] = float(hit[3]) if hit and hit[0] is not None else None
                own_tree = BVHTree.FromPolygons(vertices, polygons, all_triangles=False)
                rec['visible_support_surface_crossings'] = len(own_tree.overlap(support)) if support else 0
            details.append(rec)
        rows.append({'kind': kind, 'owner': owner.name, 'owner_visible': owner in body,
                     'owner_shadow': owner in cast, 'details': details})
    return rows


try:
    model.Architect.block = tracked_block
    model.Architect.vents = tracked_vents
    for entry in audit['rows']:
        aid = entry['asset']
        spec_path = STAGE / 'assets/pipeline/specs' / (aid + '.json')
        assert sha(spec_path) == entry['specSHA256'], aid
        spec = json.loads(spec_path.read_text())
        fclib.reset()
        fclib.setup_camera(*spec['canvas'], spec['anchor'])
        fclib.setup_lights(spec.get('sun_strength', 3.3))
        rig = model.build(spec['faction'], spec['params'])
        assert getattr(rig, 'diagnostic_attachment_groups', []), aid
        row = {'id': aid, 'spec_sha256': sha(spec_path), 'canvas': spec['canvas'],
               'anchor': spec['anchor'], 'tuples': []}
        for state_name in ['idle', 'damaged', 'critical']:
            state = next(s for s in spec['states'] if s['name'] == state_name)
            assert state['directions'] == 1
            visible, shadow = model.pose(rig, state, 0, 0)
            fclib.bpy.context.view_layer.update()
            key = state_name + '/d00_f00'
            rec = {'key': key, 'layers': state['layers'],
                   'groups': record_state(rig, visible, shadow), 'rendered': aid in RENDER_IDS}
            if rec['rendered']:
                paths = {layer: str(OUT / 'frames' / aid / layer / (key + '.png'))
                         for layer in state['layers']}
                for path in paths.values():
                    Path(path).parent.mkdir(parents=True, exist_ok=True)
                fclib.render_passes(rig, visible, paths, layers=state['layers'], shadow_objs=shadow)
            row['tuples'].append(rec)
        report['assets'].append(row)
        print('FC_BUILDING_ATTACHMENT_DIAGNOSTIC_ASSET', aid, flush=True)
    for relative, digest in lock['sources'].items():
        assert sha(STAGE / relative) == digest, relative
    report['files'] = {str(p.relative_to(OUT)): sha(p) for p in sorted((OUT / 'frames').rglob('*.png'))}
    report['evaluated_poses'] = sum(len(a['tuples']) for a in report['assets'])
    report['rendered_poses'] = sum(t['rendered'] for a in report['assets'] for t in a['tuples'])
    assert (len(report['assets']), report['evaluated_poses'], report['rendered_poses']) == (18, 54, 15)
    (OUT / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
    print('FC_BUILDING_ATTACHMENT_DIAGNOSTIC_DONE 18 54 15', flush=True)
except Exception as error:
    report.update(failures=1, error=repr(error))
    (OUT / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
    raise
finally:
    model.Architect.block = original_block
    model.Architect.vents = original_vents
