"""United States faction building variants: headquarters (4x4) and power station (2x2).

US architectural language (original): forward air-operations infrastructure —
battered concrete, glazed control tower, lattice comms masts, rotating air-search
radar, HESCO barrier lines, helipad markings, olive-grey paint, team-colour
parapet bands and the original fictional 'Aerial Arrow' insignia. No real insignia.
"""
import math

import fclib
from fclib import box, cyl, slab, empty, mat
import building_common as bc


def _roundel(name, loc, radius, M, parent):
    """Original US 'Aerial Arrow' insignia (assets/ui/emblems/fc-emblems.svg#em-US):
    team ring, pale upward arrowhead and wing bars. Fictional; no real insignia."""
    pale = mat('insignia_pale', '#E2DCCB', rough=0.6, grime=0.2)
    x, y, z = loc
    out = [cyl(f'{name}_ring', radius, 0.012, loc=loc, material=M['team'], verts=32, bevel=0, parent=parent)]
    out.append(cyl(f'{name}_field', radius * 0.8, 0.014, loc=(x, y, z + 0.001), material=M['trim'], verts=32, bevel=0,
                   parent=parent))
    r = radius * 0.8
    # arrow points toward the viewer's upper-left in screen (Blender -X, +Y), reads at any heading
    out.append(slab(f'{name}_arrow', [(r * 0.65, 0), (-r * 0.05, r * 0.5), (-r * 0.2, r * 0.32), (r * 0.2, 0),
                                      (-r * 0.2, -r * 0.32), (-r * 0.05, -r * 0.5)],
                    z + 0.008, z + 0.018, loc=(x, y, 0), rot=(0, 0, math.radians(135)), material=pale, bevel=0,
                    parent=parent))
    return out


def build_hq(M, rig):
    """Forward air-command post: battered concrete command block, glazed control
    tower with rotating air-search radar, lattice comms mast, helipad, vehicle bay
    with ramp and HESCO barrier line. Tower and mast sit at the rear so the
    camera-facing sides (+X, -Y) stay readable."""
    root = rig.root
    bc.pad(rig, M, 4, 4)
    S = rig.structure
    hesco = mat('hesco', '#9C8A64', rough=1.0, grime=0.6)
    mesh_wire = mat('hesco_wire', '#6E6A60', rough=0.6, metal=0.5, grime=0.3)
    glass = mat('tower_glass', '#27343A', rough=0.08, metal=0.2, emission='#F2D39A', emission_strength=0.9, grime=0)
    win = mat('window_lit', '#2A3238', rough=0.2, emission='#FFD9A0', emission_strength=2.2, grime=0)
    paint_y = mat('pad_paint_yellow', '#C9A441', rough=0.8, grime=0.5)
    # command block with battered (sloped) walls
    block = [(0.95, -1.15), (0.95, 1.25), (-1.65, 1.25), (-1.65, -1.15)]
    S.append(slab('hq_block', block, 0.035, 0.60, material=M['wall'], top_scale=0.9, bevel=0.03, parent=root))
    S.append(slab('hq_roof', [(0.82, -1.02), (0.82, 1.12), (-1.52, 1.12), (-1.52, -1.02)], 0.60, 0.64,
                  material=M['paint2'], bevel=0.01, parent=root))
    # parapet with a team band on the two camera-facing edges
    S.append(box('parapet_x', (0.08, 2.18, 0.10), loc=(0.80, 0.05, 0.68), material=M['team'], bevel=0.01, parent=root))
    S.append(box('parapet_y', (2.40, 0.08, 0.10), loc=(-0.35, -1.00, 0.68), material=M['team'], bevel=0.01, parent=root))
    S.append(box('parapet_back_x', (0.08, 2.18, 0.08), loc=(-1.50, 0.05, 0.67), material=M['trim'], parent=root))
    S.append(box('parapet_back_y', (2.40, 0.08, 0.08), loc=(-0.35, 1.10, 0.67), material=M['trim'], parent=root))
    for i in range(6):
        S.append(box(f'win_x_{i}', (0.02, 0.20, 0.08), loc=(0.93, -0.85 + i * 0.36, 0.42), rot=(0, 0.18, 0),
                     material=win, bevel=0, parent=root))
    for i in range(6):
        S.append(box(f'win_y_{i}', (0.26, 0.02, 0.08), loc=(-1.40 + i * 0.42, -1.13, 0.42), rot=(-0.18, 0, 0),
                     material=win, bevel=0, parent=root))
    # main entrance with canopy on the -Y face
    S.append(box('entrance', (0.36, 0.06, 0.26), loc=(0.15, -1.16, 0.17), material=M['trim'], parent=root))
    S.append(box('canopy', (0.56, 0.26, 0.03), loc=(0.15, -1.25, 0.33), material=M['paint'], parent=root))
    S.append(box('entry_step', (0.62, 0.30, 0.05), loc=(0.15, -1.32, 0.06), material=M['concrete_dark'], parent=root))
    # canopy posts and team bollards frame the HQ entrance
    for s in (-1, 1):
        S.append(box(f'entry_post_{s}', (0.05, 0.05, 0.28), loc=(0.15 + s * 0.25, -1.34, 0.20), material=M['trim'],
                     parent=root))
        S.append(box(f'entry_bollard_{s}', (0.09, 0.09, 0.20), loc=(0.15 + s * 0.44, -1.42, 0.135), material=M['team'],
                     parent=root))
    # control tower (rear-left): octagonal shaft, glazed cab, cap and radar
    tx, ty = -0.95, 0.55
    S.append(cyl('tower_shaft', 0.30, 1.05, loc=(tx, ty, 0.64 + 0.525), material=M['wall'], verts=8, bevel=0.02,
                 parent=root, smooth=False))
    S.append(cyl('tower_band', 0.315, 0.08, loc=(tx, ty, 1.20), material=M['team'], verts=8, bevel=0.005, parent=root,
                 smooth=False))
    S.append(cyl('tower_deck', 0.50, 0.06, loc=(tx, ty, 1.72), material=M['trim'], verts=8, bevel=0.01, parent=root,
                 smooth=False))
    S.append(cyl('tower_cab', 0.44, 0.28, loc=(tx, ty, 1.89), material=glass, verts=8, bevel=0.005, parent=root,
                 radius_top=0.50, smooth=False))
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 8
        S.append(box(f'cab_mullion_{k}', (0.03, 0.03, 0.29), loc=(tx + 0.47 * math.cos(a), ty + 0.47 * math.sin(a), 1.89),
                     material=M['trim'], bevel=0, parent=root))
    S.append(cyl('tower_cap', 0.54, 0.07, loc=(tx, ty, 2.065), material=M['paint'], verts=8, bevel=0.01, parent=root,
                 radius_top=0.40, smooth=False))
    radar = empty('radar_spin', loc=(tx, ty, 2.12), parent=root)
    S.append(cyl('radar_post', 0.04, 0.16, loc=(0, 0, 0.08), material=M['metal'], verts=8, parent=radar))
    S.append(box('radar_array', (0.08, 0.78, 0.20), loc=(0.06, 0, 0.22), rot=(0, -0.35, 0), material=M['paint2'],
                 parent=radar))
    S.append(box('radar_face', (0.01, 0.70, 0.15), loc=(0.105, 0, 0.235), rot=(0, -0.35, 0), material=M['lens'],
                 bevel=0, parent=radar))
    rig.spinners.append((radar, 'z', 1))
    S.append(cyl('beacon', 0.03, 0.05, loc=(tx, ty, 2.43), material=mat('beacon_red', '#401010', emission='#FF4A3A',
                                                                         emission_strength=8, grime=0),
                 verts=8, parent=root))
    # lattice comms mast (rear-right)
    mx, my, mh = 0.25, 1.0, 1.75
    for k, (dx, dy) in enumerate(((1, 1), (1, -1), (-1, -1), (-1, 1))):
        S.append(cyl(f'mast_leg_{k}', 0.014, mh, loc=(mx + dx * 0.07, my + dy * 0.07, 0.64 + mh / 2), material=M['metal'],
                     verts=5, bevel=0, parent=root, radius_top=0.010))
    for j in range(6):
        z = 0.75 + j * 0.27
        for k, (sx, sy, rz) in enumerate(((0, 0.07, 0), (0, -0.07, 0), (0.07, 0, 90), (-0.07, 0, 90))):
            S.append(box(f'mast_brace_{j}_{k}', (0.15, 0.012, 0.012), loc=(mx + sx, my + sy, z),
                         rot=(0, 0.6 if j % 2 else -0.6, math.radians(rz)), material=M['metal'], bevel=0, parent=root))
    S.append(cyl('mast_whip', 0.008, 0.6, loc=(mx, my, 0.64 + mh + 0.3), material=M['dark'], verts=5, bevel=0, parent=root))
    for k in range(2):
        S.append(box(f'mast_panel_{k}', (0.03, 0.14, 0.24), loc=(mx + 0.10, my - 0.06 + k * 0.12, 0.64 + mh - 0.25),
                     material=M['paint2'], parent=root))
    # roof insignia and clutter
    S += _roundel('roundel_roof', (-0.10, -0.25, 0.645), 0.42, M, root)
    for i in range(2):
        o = box(f'ac_{i}', (0.22, 0.18, 0.12), loc=(0.45, 0.55 + i * 0.28, 0.70), material=M['concrete_dark'], parent=root)
        S.append(o)
        rig.detachable.append(o)
    dish = cyl('dish', 0.17, 0.04, loc=(0.45, -0.70, 0.78), rot=(0.7, 0.3, 0), material=mat('dish_white', '#C8C8C0',
                                                                                             grime=0.3),
               verts=18, radius_top=0.05, parent=root)
    S += [dish, cyl('dish_post', 0.02, 0.12, loc=(0.45, -0.70, 0.70), material=M['metal'], verts=6, parent=root)]
    rig.detachable.append(dish)
    # roof command deck with map table; tower and mast keep the skyline
    S.append(box('deck', (0.60, 0.50, 0.05), loc=(-0.05, 0.65, 0.665), material=M['paint2'], parent=root))
    S.append(box('deck_team', (0.60, 0.05, 0.06), loc=(-0.05, 0.42, 0.67), material=M['team'], bevel=0.004, parent=root))
    for k, (dx, dy) in enumerate(((-0.27, -0.22), (0.27, -0.22), (-0.27, 0.22), (0.27, 0.22))):
        S.append(box(f'deck_post_{k}', (0.03, 0.03, 0.26), loc=(-0.05 + dx, 0.65 + dy, 0.82), material=M['trim'],
                     bevel=0, parent=root))
    S.append(box('deck_rail_back', (0.57, 0.03, 0.03), loc=(-0.05, 0.87, 0.95), material=M['trim'], bevel=0, parent=root))
    for s in (-1, 1):
        S.append(box(f'deck_rail_{s}', (0.03, 0.47, 0.03), loc=(-0.05 + s * 0.27, 0.65, 0.95), material=M['trim'],
                     bevel=0, parent=root))
    t = box('deck_table', (0.30, 0.22, 0.14), loc=(-0.12, 0.62, 0.76), material=M['paint'], parent=root)
    S.append(t)
    scr = box('deck_screen', (0.26, 0.02, 0.16), loc=(-0.12, 0.72, 0.90), material=M['lens'], bevel=0, parent=root)
    S.append(scr)
    rig.detachable += [t, scr]
    # vehicle bay with ramp on the +X side (rig production)
    S.append(box('bay', (0.80, 0.95, 0.44), loc=(1.40, 0.95, 0.035 + 0.22), material=M['wall'], bevel=0.02, parent=root))
    S.append(box('bay_roof', (0.84, 0.99, 0.04), loc=(1.40, 0.95, 0.475), material=M['team'], bevel=0.008, parent=root))
    S.append(box('bay_aperture', (0.003, 0.67, 0.315), loc=(1.807, 0.95, 0.20), material=M['dark'], bevel=0, parent=root))
    S.append(box('bay_door', (0.02, 0.68, 0.32), loc=(1.805, 0.95, 0.20), material=M['trim'], bevel=0.005, parent=root))
    for k in range(5):
        S.append(box(f'bay_rib_{k}', (0.025, 0.68, 0.012), loc=(1.815, 0.95, 0.07 + k * 0.065), material=M['metal'],
                     bevel=0, parent=root))
    S.append(box('bay_ramp', (0.22, 0.70, 0.05), loc=(1.92, 0.95, 0.04), rot=(0, 0.25, 0), material=M['concrete_dark'],
                 bevel=0.01, parent=root))
    # helipad on the front-left of the pad
    hx, hy = -1.25, -1.55
    S.append(cyl('helipad', 0.34, 0.012, loc=(hx, hy, 0.042), material=M['concrete_dark'], verts=24, bevel=0, parent=root))
    S.append(cyl('helipad_ring', 0.33, 0.004, loc=(hx, hy, 0.050), material=paint_y, verts=24, bevel=0, parent=root))
    S.append(cyl('helipad_inner', 0.29, 0.005, loc=(hx, hy, 0.051), material=M['concrete_dark'], verts=24, bevel=0,
                 parent=root))
    for k, (dx, dy, sx, sy) in enumerate(((0, -0.08, 0.20, 0.035), (0, 0.08, 0.20, 0.035), (0, 0, 0.035, 0.16))):
        S.append(box(f'heli_h_{k}', (sx, sy, 0.006), loc=(hx + dx, hy + dy, 0.056),
                     material=paint_y, bevel=0, parent=root))
    # HESCO barrier line along the two exposed edges, with gaps for the entrance and bay
    k = 0
    for i in range(10):
        y = -1.80 + i * 0.2
        if -0.2 < y < 1.4:
            continue
        S.append(box(f'hesco_x_{k}', (0.19, 0.19, 0.20), loc=(1.86, y, 0.135), material=hesco, bevel=0.012, parent=root))
        S.append(box(f'hesco_xw_{k}', (0.195, 0.195, 0.012), loc=(1.86, y, 0.24), material=mesh_wire, bevel=0,
                     parent=root))
        k += 1
    for i in range(17):
        x = -1.80 + i * 0.2
        if -0.2 < x < 0.5 or x < -0.8:
            continue
        S.append(box(f'hesco_y_{k}', (0.19, 0.19, 0.20), loc=(x, -1.86, 0.135), material=hesco, bevel=0.012, parent=root))
        S.append(box(f'hesco_yw_{k}', (0.195, 0.195, 0.012), loc=(x, -1.86, 0.24), material=mesh_wire, bevel=0,
                     parent=root))
        k += 1
    # floodlights and flag
    for i, (x, y) in enumerate(((1.8, -1.8), (-1.85, 1.8))):
        S.append(cyl(f'flood_pole_{i}', 0.015, 0.75, loc=(x, y, 0.41), material=M['metal'], verts=6, parent=root))
        S.append(box(f'flood_lamp_{i}', (0.08, 0.12, 0.06), loc=(x, y, 0.80), material=M['light'], parent=root))
    S.append(cyl('flag_pole', 0.012, 0.95, loc=(1.55, -1.45, 0.51), material=M['metal'], verts=6, parent=root))
    pen = box('flag', (0.02, 0.34, 0.20), loc=(1.55, -1.28, 0.86), material=M['team'], bevel=0, parent=root)
    S.append(pen)
    rig.detachable.append(pen)
    rig.critical_hide += [o for o in S if o.name.startswith(('tower_cab', 'tower_cap', 'cab_mullion', 'radar', 'beacon',
                                                             'mast_', 'tower_deck'))]
    rig.height = 2.5
    return {'healthbar': (0, 0, 2.6), 'rally': (2.3, 0.95, 0), 'smoke_1': (-0.95, 0.55, 1.9),
            'smoke_2': (1.4, 0.95, 0.5)}


def build_power(M, rig):
    root = rig.root
    bc.pad(rig, M, 2, 2)
    S = rig.structure
    S.append(box('gen_hall', (1.2, 0.9, 0.45), loc=(-0.2, 0.25, 0.035 + 0.225), material=M['wall'], bevel=0.025,
                 parent=root))
    S.append(box('gen_roof', (1.24, 0.94, 0.04), loc=(-0.2, 0.25, 0.49), material=M['paint2'], bevel=0.008,
                 parent=root))
    S.append(box('gen_roof_team', (0.16, 0.96, 0.05), loc=(0.33, 0.25, 0.50), material=M['team'], bevel=0.006,
                 parent=root))
    S.append(box('gen_side_team', (1.22, 0.02, 0.08), loc=(-0.2, -0.205, 0.40), material=M['team'], bevel=0.004,
                 parent=root))
    # two exhaust stacks
    for i, y in enumerate((0.45, 0.05)):
        S.append(cyl(f'stack_{i}', 0.08, 0.55, loc=(-0.6, y, 0.78), material=M['metal'], verts=14, parent=root))
        S.append(cyl(f'stack_cap_{i}', 0.095, 0.05, loc=(-0.6, y, 1.07), material=M['trim'], verts=14, parent=root))
    # turbine intake grille (lit) facing +x
    grille = mat('grille_lit', '#223038', rough=0.3, emission='#7FD1F5', emission_strength=2.5, grime=0)
    S.append(box('intake', (0.02, 0.6, 0.22), loc=(0.405, 0.25, 0.25), material=grille, bevel=0, parent=root))
    # transformers + insulators in front
    for i in range(2):
        t = box(f'transformer_{i}', (0.26, 0.22, 0.24), loc=(0.55, -0.55 + i * 0.35, 0.155), material=M['paint2'],
                parent=root)
        S.append(t)
        for k in range(3):
            S.append(cyl(f'insulator_{i}_{k}', 0.018, 0.12, loc=(0.48 + k * 0.07, -0.55 + i * 0.35, 0.33),
                         material=mat('ceramic', '#C9C3B4', grime=0.2), verts=6, parent=root))
    fan = empty('fan_spin', loc=(-0.2, 0.25, 0.53), parent=root)
    S.append(cyl('fan_housing', 0.18, 0.04, loc=(0, 0, 0), material=M['trim'], verts=20, parent=fan))
    for k in range(3):
        S.append(box(f'fan_blade_{k}', (0.3, 0.04, 0.01), loc=(0, 0, 0.03), rot=(0.3, 0, k * math.pi / 3),
                     material=M['metal'], bevel=0, parent=fan))
    rig.spinners.append((fan, 'z', 1))
    status = mat('status_green', '#103018', emission='#5FC08A', emission_strength=6, grime=0)
    for i in range(3):
        S.append(box(f'status_{i}', (0.02, 0.04, 0.04), loc=(0.405, -0.05 + i * 0.07, 0.40), material=status, bevel=0,
                     parent=root))
    rig.detachable += [o for o in S if o.name.startswith('stack_cap')]
    rig.critical_hide += [o for o in S if o.name.startswith(('stack_', 'fan'))]
    rig.height = 1.15
    return {'healthbar': (0, 0, 1.3), 'smoke_1': (-0.6, 0.45, 1.1)}


BUILDERS = {'hq': (build_hq, (4, 4)), 'power': (build_power, (2, 2))}


def build(faction, params):
    M = fclib.faction_mats(faction or 'US')
    fn, fp = BUILDERS[params['building']]
    root = empty('root')
    rig = bc.BuildingRig(root, fp)
    pts = fn(M, rig)
    # The production door and its ribs share a deterministic vertical track.
    # Keep base coordinates so arbitrary render state order cannot accumulate it.
    rig.production_doors = [(o, o.location.copy()) for o in rig.structure
                            if o.name == 'bay_door' or o.name.startswith('bay_rib_')]
    bc.make_scaffold(rig, M, fp[0] - 0.3, fp[1] - 0.3, rig.height * 0.75)
    bc.make_rubble(rig, M, fp[0], fp[1])
    bc.install_cutter(rig)
    rig.hardpoints = {}
    for k, loc in pts.items():
        e = empty(f'hp_{k}', loc=loc, parent=root)
        e['fc_parts'] = ['building']
        rig.hardpoints[k] = e
    return rig


def pose(rig, st, frame, d):
    for obj, base in rig.production_doors:
        obj.location = base.copy()
        if st['name'] == 'produce':
            obj.location.z += 0.30 * frame / max(1, st['frames'] - 1)
    return bc.pose_building(rig, {**st, 'name': 'idle'} if st['name'] == 'produce' else st, frame)
