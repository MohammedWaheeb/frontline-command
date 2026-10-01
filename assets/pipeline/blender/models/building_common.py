"""Shared building state machinery.

Every building renders the complete design-mandated state set (design 23.2 /
handoff 8): foundation, construction (progress-sliced so the visible build
matches actual progress), complete loop, damaged (<=50 %), critical (<=25 %),
low power (lights dimmed, machinery stopped), disabled (dark), rubble.
Selling is the construction sequence played in reverse; capture/sabotage are
client overlay effects over the current state (see manifest).

Buildings face one fixed direction; the anchor is the footprint centre at ground.
"""
import math

import bpy

import fclib
from fclib import box, cyl, empty, mat


class BuildingRig(fclib.Rig):
    def __init__(self, root, footprint):
        super().__init__(root)
        self.footprint = footprint          # (w, h) tiles, x = sim x
        self.pad = []                       # always visible (foundation)
        self.structure = []                 # sliced during construction
        self.detachable = []                # removed when damaged
        self.critical_hide = []             # additionally removed when critical
        self.spinners = []                  # (obj, axis) rotated during loop frames
        self.scaffold = []
        self.rubble = []
        self.height = 1.0
        self.cutter = None


def pad(rig, M, w, h, z=0.035, marking=True):
    """Concrete pad covering the footprint, with inset hazard edge and bolts."""
    p = box('pad', (w - 0.04, h - 0.04, z), loc=(0, 0, z / 2), material=M['concrete'], bevel=0.02,
            parent=rig.root)
    rig.pad.append(p)
    edge = mat('pad_edge', '#B89A4A', rough=0.8, grime=0.6)
    if marking:
        for s in (1, -1):
            rig.pad.append(box(f'pad_edge_x{s}', (w - 0.12, 0.05, 0.006), loc=(0, s * (h / 2 - 0.08), z + 0.003),
                               material=edge, bevel=0, parent=rig.root))
            rig.pad.append(box(f'pad_edge_y{s}', (0.05, h - 0.12, 0.006), loc=(s * (w / 2 - 0.08), 0, z + 0.003),
                               material=edge, bevel=0, parent=rig.root))
    return p


def make_scaffold(rig, M, w, h, height):
    pole = mat('scaffold', '#A8A290', rough=0.6, metal=0.4, grime=0.3)
    out = []
    nx, ny = max(2, int(w * 2)), max(2, int(h * 2))
    for i in range(nx + 1):
        for j in (0, ny):
            x = -w / 2 + 0.12 + i * (w - 0.24) / nx
            y = -h / 2 + 0.12 + j * (h - 0.24) / ny
            out.append(cyl(f'sc_pole_{i}_{j}', 0.012, height, loc=(x, y, height / 2), material=pole, verts=6,
                           bevel=0, parent=rig.root))
    for j in range(1, ny):
        for i in (0, nx):
            x = -w / 2 + 0.12 + i * (w - 0.24) / nx
            y = -h / 2 + 0.12 + j * (h - 0.24) / ny
            out.append(cyl(f'sc_pole_b_{i}_{j}', 0.012, height, loc=(x, y, height / 2), material=pole, verts=6,
                           bevel=0, parent=rig.root))
    rig.scaffold = out
    crane = mat('crane_yellow', '#C9A23A', rough=0.6, grime=0.4)
    rig.scaffold.append(box('crane_mast', (0.06, 0.06, height + 0.25), loc=(-w / 2 + 0.2, h / 2 - 0.2,
                                                                             (height + 0.25) / 2),
                            material=crane, bevel=0.004, parent=rig.root))
    rig.scaffold.append(box('crane_jib', (w * 0.55, 0.05, 0.05), loc=(-w / 2 + 0.2 + w * 0.25, h / 2 - 0.2,
                                                                      height + 0.25),
                            material=crane, bevel=0.004, parent=rig.root))


def make_rubble(rig, M, w, h, seed=11):
    r = fclib.rng(seed)
    mats = [M['concrete'], M['concrete_dark'], M['paint2'], M['trim']]
    for i in range(int(w * h * 7)):
        sx, sy, sz = 0.08 + r.random() * 0.22, 0.08 + r.random() * 0.22, 0.04 + r.random() * 0.12
        x = (r.random() - 0.5) * (w - 0.5)
        y = (r.random() - 0.5) * (h - 0.5)
        rig.rubble.append(box(f'rubble_{i}', (sx, sy, sz), loc=(x, y, 0.04 + sz * 0.3),
                              rot=(r.random() * 0.8, r.random() * 0.8, r.random() * 3.1),
                              material=mats[i % len(mats)], bevel=0.01, parent=rig.root))
    for i in range(6):
        rig.rubble.append(cyl(f'rubble_beam_{i}', 0.02, 0.4 + r.random() * 0.5,
                              loc=((r.random() - 0.5) * w * 0.6, (r.random() - 0.5) * h * 0.6, 0.12),
                              rot=(1.3 + r.random() * 0.3, 0, r.random() * 3.1), material=M['metal'], verts=6,
                              parent=rig.root))


def install_cutter(rig):
    """Boolean INTERSECT with a tall box whose top is moved to the build height."""
    me = bpy.data.meshes.new('cutter')
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.to_mesh(me)
    bm.free()
    c = bpy.data.objects.new('fc_cutter', me)
    bpy.context.scene.collection.objects.link(c)
    c.hide_render = True
    c.display_type = 'WIRE'
    c.scale = (20, 20, 100)
    c.location = (0, 0, 60 - 50)
    for o in rig.structure:
        m = o.modifiers.new('fc_build_cut', 'BOOLEAN')
        m.operation = 'INTERSECT'
        m.object = c
        m.solver = 'EXACT'
    rig.cutter = c


def _set_cut(rig, h):
    rig.cutter.location = (0, 0, h - 50)   # box spans [h - 100, h]


def meshes_excluding_cutter(rig):
    return [o for o in rig.meshes() if o is not rig.cutter]


def pose_building(rig, st, frame):
    """Generic state poses. Returns (visible objects, shadow objects)."""
    name, n = st['name'], max(1, st['frames'])
    fclib.set_grime_all(0.0)
    fclib.set_char_all(0.0)
    fclib.set_emission_scale(1.0)
    _set_cut(rig, 60)
    hide = set(rig.scaffold) | set(rig.rubble)
    for obj, axis, speed in rig.spinners:
        setattr(obj.rotation_euler, axis, 0.0)
    if name == 'foundation':
        hide |= set(rig.structure) | set(rig.scaffold)
        fclib.set_emission_scale(0.0)
    elif name == 'construct':
        p = (frame + 1) / (n + 1)          # frame k shows progress (k+1)/(n+1); complete state shows 1.0
        _set_cut(rig, max(0.02, p * rig.height))
        hide -= set(rig.scaffold)
        fclib.set_emission_scale(0.0)
    elif name == 'idle':
        for obj, axis, speed in rig.spinners:
            setattr(obj.rotation_euler, axis, speed * 2 * math.pi * frame / n)
    elif name == 'lowpower':
        fclib.set_emission_scale(0.22)
    elif name == 'disabled':
        fclib.set_emission_scale(0.0)
        fclib.set_grime_all(0.1)
    elif name in ('damaged', 'critical'):
        fclib.set_grime_all(0.55 if name == 'damaged' else 0.8)
        fclib.set_char_all(0.25 if name == 'damaged' else 0.5)
        hide |= set(rig.detachable)
        if name == 'critical':
            hide |= set(rig.critical_hide)
            fclib.set_emission_scale(0.3)
    elif name == 'rubble':
        hide |= set(rig.structure) | set(rig.scaffold)
        hide -= set(rig.rubble)
        fclib.set_grime_all(0.8)
        fclib.set_char_all(0.7)
        fclib.set_emission_scale(0.0)
    vis = [o for o in meshes_excluding_cutter(rig) if o not in hide and not _ancestor_hidden(o, hide)]
    return vis, vis


def _ancestor_hidden(o, hide):
    p = o.parent
    while p is not None:
        if p in hide:
            return True
        p = p.parent
    return False
