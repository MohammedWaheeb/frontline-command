"""Light technical: repaired pickup with a pintle autocannon in the bed.

Used for: unit.SY.car (Light technical). Parts 'hull' (truck) and 'turret'
(gun mount + gunner) rotating about the unit origin, which sits under the pintle
so both parts share one anchor. Visual identity (design 23.1): varied but
readable repaired equipment, mismatched panels, clearly a combat vehicle
(armour plates, gun shield) and never disguised as a civilian vehicle.
Footprint radius 0.6 tiles (light vehicle).
"""
import math

import fclib
from fclib import box, cyl, slab, sphere, empty, mat

# Turret pivot relative to the vehicle centre (sim position), in tiles. Published
# to the client as turret_pivot_mt so turret frames can be placed for any heading.
PIVOT_X = -0.30


def build(faction, params):
    M = fclib.faction_mats(faction or 'SY')
    primer = mat('primer_grey', '#6B6C66', rough=0.8, grime=0.45)
    rust = mat('rust_panel', '#7A4B2E', rough=0.85, grime=0.5)
    plate = mat('armor_plate', '#57544A', rough=0.7, metal=0.3, grime=0.45)
    root = empty('root')
    hull_root = empty('hull_root', parent=root)
    turret_root = empty('turret_root', loc=(PIVOT_X, 0, 0.36), parent=root)
    hull, turret, wheels = [], [], []

    # chassis & wheels (hull_root local coords: truck centred, x forward)
    hull.append(box('chassis', (1.14, 0.40, 0.08), loc=(0, 0, 0.13), material=M['dark'], parent=hull_root))
    for x in (0.36, -0.36):
        for s in (1, -1):
            w = cyl(f'wheel_{x}_{s}', 0.105, 0.085, loc=(x, 0.215 * s, 0.105), rot=(math.pi / 2, 0, 0),
                    material=M['dark'], verts=16, parent=hull_root)
            cyl(f'rim_{x}_{s}', 0.05, 0.09, loc=(0, 0, 0), material=M['metal'], verts=10, parent=w)
            wheels.append(w)
            hull += [w, w.children[0]]
    # cab and hood with mismatched repaired panels
    hull.append(box('hood', (0.34, 0.50, 0.14), loc=(0.40, 0, 0.24), material=primer, taper=(0.92, 0.96),
                    bevel=0.02, parent=hull_root))
    hull.append(box('grille', (0.03, 0.40, 0.10), loc=(0.575, 0, 0.23), material=M['trim'], parent=hull_root))
    hull.append(box('bullbar', (0.04, 0.48, 0.03), loc=(0.60, 0, 0.18), material=M['metal'], parent=hull_root))
    for s in (1, -1):
        hull.append(cyl(f'lamp_{s}', 0.03, 0.02, loc=(0.58, 0.17 * s, 0.26), rot=(0, math.pi / 2, 0),
                        material=M['light'], verts=10, parent=hull_root))
    cab = slab('cab', [(0.23, 0.25), (0.23, -0.25), (-0.12, -0.25), (-0.12, 0.25)], 0.17, 0.46,
               material=M['paint'], top_scale=0.86, top_shift=(-0.03, 0), bevel=0.02, parent=hull_root)
    hull.append(cab)
    hull.append(box('cab_roof_team', (0.24, 0.40, 0.025), loc=(0.03, 0, 0.465), material=M['team'],
                    bevel=0.006, parent=hull_root))
    hull.append(box('windscreen', (0.02, 0.40, 0.13), loc=(0.20, 0, 0.37), rot=(0, -0.45, 0),
                    material=M['glass'], bevel=0, parent=hull_root))
    hull.append(box('door_L', (0.28, 0.015, 0.16), loc=(0.06, 0.255, 0.27), material=rust, bevel=0.004,
                    parent=hull_root))
    hull.append(box('door_R', (0.28, 0.015, 0.16), loc=(0.06, -0.255, 0.27), material=M['paint2'], bevel=0.004,
                    parent=hull_root))
    hull.append(box('window_plate_L', (0.18, 0.015, 0.08), loc=(0.06, 0.25, 0.39), material=plate, bevel=0.004,
                    parent=hull_root))
    hull.append(box('window_plate_R', (0.18, 0.015, 0.08), loc=(0.06, -0.25, 0.39), material=plate,
                    bevel=0.004, parent=hull_root))
    # bed with welded armour side plates (team colour band along the plates)
    hull.append(box('bed_floor', (0.52, 0.48, 0.04), loc=(-0.38, 0, 0.21), material=M['paint2'],
                    parent=hull_root))
    for s in (1, -1):
        hull.append(box(f'bed_side_{s}', (0.52, 0.03, 0.12), loc=(-0.38, 0.245 * s, 0.28), material=plate,
                        parent=hull_root))
        hull.append(box(f'bed_team_{s}', (0.50, 0.035, 0.045), loc=(-0.38, 0.25 * s, 0.30),
                        material=M['team'], bevel=0.004, parent=hull_root))
        hull.append(box(f'fender_{s}', (0.30, 0.10, 0.03), loc=(0.36, 0.22 * s, 0.215), material=primer,
                        parent=hull_root))
        hull.append(box(f'rfender_{s}', (0.28, 0.10, 0.03), loc=(-0.36, 0.22 * s, 0.215), material=rust,
                        parent=hull_root))
    hull.append(box('tailgate', (0.03, 0.46, 0.13), loc=(-0.65, 0, 0.27), material=rust, parent=hull_root))
    hull.append(box('spare_wheel', (0.08, 0.20, 0.20), loc=(-0.55, 0.12, 0.33), rot=(0, 0.2, 0),
                    material=M['dark'], bevel=0.04, parent=hull_root))
    hull.append(box('ammo_crate', (0.14, 0.10, 0.08), loc=(-0.54, -0.14, 0.27), material=M['canvas'],
                    parent=hull_root))
    # SY field kit: jerry can, canvas bedroll, welded strips on the armour sides.
    hull.append(box('jerry_can', (0.08, 0.12, 0.14), loc=(-0.28, -0.15, 0.30), material=rust,
                    bevel=0.01, parent=hull_root))
    hull.append(cyl('bed_tarp_roll', 0.045, 0.40, loc=(-0.18, 0, 0.275), rot=(math.pi / 2, 0, 0),
                    material=M['canvas'], verts=10, parent=hull_root))
    for s in (1, -1):
        for i, wx in enumerate((-0.50, -0.38, -0.26)):
            hull.append(box(f'weld_strip_{s}_{i}', (0.035, 0.014, 0.06), loc=(wx, 0.266 * s, 0.245),
                            material=primer, bevel=0.003, parent=hull_root))
    hull.append(box('roll_bar', (0.03, 0.46, 0.03), loc=(-0.14, 0, 0.52), material=M['metal'], parent=hull_root))
    for s in (1, -1):
        hull.append(box(f'roll_post_{s}', (0.03, 0.03, 0.30), loc=(-0.14, 0.215 * s, 0.37), material=M['metal'],
                        parent=hull_root))

    # gun mount (turret): pedestal, shield, autocannon, gunner
    turret.append(cyl('pedestal', 0.045, 0.16, loc=(0, 0, -0.06), material=M['metal'], verts=10,
                      parent=turret_root))
    gun = empty('gun_root', loc=(0.0, 0, 0.06), parent=turret_root)
    turret.append(box('receiver', (0.22, 0.08, 0.08), loc=(0.02, 0, 0), material=M['metal'], parent=gun))
    turret.append(cyl('ac_barrel', 0.016, 0.42, loc=(0.33, 0, 0.01), rot=(0, math.pi / 2, 0),
                      material=M['metal'], verts=10, parent=gun))
    turret.append(cyl('ac_brake', 0.026, 0.06, loc=(0.54, 0, 0.01), rot=(0, math.pi / 2, 0),
                      material=M['dark'], verts=10, parent=gun))
    turret.append(box('ammo_can', (0.08, 0.07, 0.07), loc=(-0.02, 0.08, -0.02), material=M['paint2'],
                      parent=gun))
    turret.append(box('gun_shield', (0.02, 0.30, 0.16), loc=(0.14, 0, 0.03), rot=(0, -0.12, 0),
                      material=M['team'], bevel=0.006, parent=gun))
    turret.append(box('shield_trim', (0.025, 0.31, 0.025), loc=(0.145, 0, 0.115), rot=(0, -0.12, 0),
                      material=M['trim'], bevel=0.004, parent=gun))
    # gunner (seated/standing behind the gun)
    g = empty('gunner', loc=(-0.14, 0, -0.08), parent=turret_root)
    turret.append(box('gunner_legs', (0.06, 0.09, 0.14), loc=(0, 0, 0.0), material=M['canvas'], parent=g))
    turret.append(box('gunner_torso', (0.08, 0.11, 0.13), loc=(0.01, 0, 0.13), rot=(0, 0.15, 0),
                      material=M['paint2'], parent=g))
    turret.append(sphere('gunner_head', 0.037, loc=(0.02, 0, 0.24), material=mat('skin_cloth', '#6E5A48', grime=0.2),
                         parent=g))
    turret.append(sphere('gunner_scarf', 0.04, loc=(0.015, 0, 0.225), material=M['canvas'], parent=g,
                         scale=(1, 1, 0.55)))
    for s in (1, -1):
        turret.append(box(f'gunner_arm_{s}', (0.13, 0.03, 0.03), loc=(0.07, 0.05 * s, 0.15), rot=(0, 0.3, 0),
                          material=M['paint2'], parent=g))

    hp_muzzle = empty('hp_muzzle', loc=(0.58, 0, 0.01), parent=gun)
    hp_muzzle['fc_parts'] = ['turret']
    hp_top = empty('hp_healthbar', loc=(0, 0, 0.72), parent=root)
    hp_top['fc_parts'] = ['hull']
    rig = fclib.Rig(root)
    rig.parts = {'hull': hull, 'turret': turret}
    rig.hull_root, rig.turret_root, rig.gun_root = hull_root, turret_root, gun
    rig.wheels = wheels
    rig.hardpoints = {'muzzle': hp_muzzle, 'healthbar': hp_top}
    # wreck: crew gone, shield/lamps/one wheel blown off, scorched contact
    rig.wreck_missing = [o for o in turret if o.name.startswith(('gunner', 'gun_shield', 'shield_trim', 'ammo_can'))]
    rig.wreck_missing += [o for o in hull if o.name.startswith(('lamp_', 'windscreen', 'spare_wheel', 'ammo_crate',
                                                                  'jerry_can', 'bed_tarp_roll'))]
    rig.wreck_missing += [w for w in wheels[:1]] + [w.children[0] for w in wheels[:1]]
    rig.scorch = fclib.scorch_decal('wreck_scorch', 0.8, parent=root)
    return rig


def pose(rig, st, frame, d):
    rig.root.rotation_euler = (0, 0, fclib.heading_to_blender_z(d, st['directions']))
    part = st.get('part', 'hull')
    rig.hull_root.location = (0, 0, 0)
    rig.hull_root.rotation_euler = (0, 0, 0)
    rig.turret_root.location = (0 if part == 'turret' else PIVOT_X, 0, 0.36)
    rig.turret_root.rotation_euler = (0, 0, 0)
    rig.gun_root.location = (0, 0, 0.06)
    fclib.set_grime_all(0.0)
    fclib.set_char_all(0.0)
    fclib.set_emission_scale(1.0)
    n = max(1, st['frames'])
    name = st['name']
    for w in rig.wheels:
        w.rotation_euler = (math.pi / 2, 0, 0)
    if name == 'move':
        ph = frame / n
        for w in rig.wheels:
            w.rotation_euler.rotate_axis('Z', ph * math.pi / 2)
        rig.hull_root.location = (0, 0, 0.008 * math.sin(ph * 2 * math.pi))
        rig.hull_root.rotation_euler = (0.012 * math.sin(ph * 2 * math.pi + 1), 0.006 * math.cos(ph * 4 * math.pi), 0)
    if name == 'fire':
        rig.gun_root.location = (-[0.035, 0.02, 0.008][min(frame, 2)], 0, 0.06)
    if name == 'damaged':
        fclib.set_grime_all(0.6)
        fclib.set_char_all(0.3)
    everything = rig.parts['hull'] + rig.parts['turret']
    if name == 'wreck':
        fclib.set_grime_all(0.7)
        fclib.set_char_all(0.92)
        fclib.set_emission_scale(0.0)
        rig.hull_root.location = (0, 0, -0.05)
        rig.hull_root.rotation_euler = (0.16, -0.05, 0.12)     # nose down on the missing front wheel
        rig.turret_root.location = (PIVOT_X - 0.1, 0.30, 0.30)
        rig.turret_root.rotation_euler = (0.9, 0.3, 1.2)       # gun mount torn off its pedestal
        vis = [o for o in everything if o not in set(rig.wreck_missing)]
        return vis + [rig.scorch], vis
    if part == 'turret':
        return rig.parts['turret'], []
    if part == 'hull':
        return rig.parts['hull'], everything
    return everything, everything
