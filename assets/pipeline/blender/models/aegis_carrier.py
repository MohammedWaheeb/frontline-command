"""Heavy 8x8 wheeled interceptor carrier with deployable stabilisers and a
raising vertical-launch module.

Used for: unit.SA.mobile_abm (Aegis carrier). Design 8.3 / 23.1: deploy 3 s,
pack 2 s, clear interception launch state, heavier wheeled armour, deployed
stabilisers. Unarmed against troops and aircraft (no gun).
States: idle, move, deploy (0 -> 1), deployed (radar loop), launch, damaged, wreck.
Pack is the deploy sequence played in reverse by the client (declared in spec).
Footprint radius 0.6 tiles (light vehicle class).
"""
import math

import fclib
from fclib import box, cyl, slab, empty, mat


def build(faction, params):
    M = fclib.faction_mats(faction or 'SA')
    root = empty('root')
    hull_root = empty('hull_root', parent=root)
    objs, wheels, legs = [], [], []
    L = 1.36
    objs.append(box('chassis', (L, 0.44, 0.10), loc=(0, 0, 0.16), material=M['dark'], parent=hull_root))
    for i, x in enumerate((0.46, 0.22, -0.20, -0.44)):
        for s in (1, -1):
            w = cyl(f'wheel_{i}_{s}', 0.10, 0.08, loc=(x, 0.235 * s, 0.10), rot=(math.pi / 2, 0, 0),
                    material=M['dark'], verts=16, parent=hull_root)
            cyl(f'hub_{i}_{s}', 0.045, 0.085, material=M['paint2'], verts=10, parent=w)
            wheels.append(w)
            objs += [w, w.children[0]]
    # armoured cab, forward
    objs.append(slab('cab', [(0.68, 0.27), (0.68, -0.27), (0.36, -0.29), (0.36, 0.29)], 0.18, 0.47,
                     material=M['paint'], top_scale=0.86, top_shift=(-0.03, 0), bevel=0.02, parent=hull_root))
    objs.append(box('cab_roof_team', (0.20, 0.40, 0.025), loc=(0.50, 0, 0.475), material=M['team'],
                    bevel=0.006, parent=hull_root))
    objs.append(box('windscreen', (0.02, 0.42, 0.10), loc=(0.655, 0, 0.39), rot=(0, -0.35, 0),
                    material=M['glass'], bevel=0, parent=hull_root))
    objs.append(box('cab_collar', (0.10, 0.60, 0.10), loc=(0.33, 0, 0.30), material=M['paint2'],
                    parent=hull_root))
    for s in (1, -1):
        objs.append(cyl(f'lamp_{s}', 0.024, 0.02, loc=(0.69, 0.2 * s, 0.25), rot=(0, math.pi / 2, 0),
                        material=M['light'], verts=10, parent=hull_root))
        objs.append(box(f'side_box_{s}', (0.50, 0.06, 0.10), loc=(-0.02, 0.26 * s, 0.26), material=M['paint2'],
                        parent=hull_root))
        objs.append(box(f'mudguard_{s}', (0.36, 0.10, 0.025), loc=(0.34, 0.235 * s, 0.215),
                        material=M['paint2'], parent=hull_root))
        objs.append(box(f'mudguard_r_{s}', (0.36, 0.10, 0.025), loc=(-0.32, 0.235 * s, 0.215),
                        material=M['paint2'], parent=hull_root))
    objs.append(box('deck', (0.92, 0.50, 0.06), loc=(-0.20, 0, 0.24), material=M['paint'], parent=hull_root))
    objs.append(box('power_unit', (0.18, 0.40, 0.14), loc=(0.24, 0, 0.34), material=M['paint2'],
                    parent=hull_root))
    for k in range(4):
        objs.append(box(f'vent_{k}', (0.14, 0.02, 0.01), loc=(0.24, -0.12 + k * 0.08, 0.415),
                        material=M['dark'], bevel=0, parent=hull_root))
    # side service machinery: hydraulic pump + cable drum, readable top-down
    objs.append(box('service_pump', (0.22, 0.09, 0.13), loc=(-0.05, -0.335, 0.25), material=M['paint2'],
                    parent=hull_root))
    objs.append(box('service_pump_cap', (0.10, 0.05, 0.03), loc=(-0.05, -0.335, 0.325), material=M['dark'],
                    bevel=0, parent=hull_root))
    objs.append(cyl('service_drum', 0.055, 0.08, loc=(-0.05, 0.335, 0.27), rot=(math.pi / 2, 0, 0),
                    material=M['trim'], verts=12, parent=hull_root))
    # service crane on the +y side box: base, post, jib, hanging hook cable
    objs.append(box('crane_base', (0.08, 0.08, 0.05), loc=(-0.24, 0.26, 0.335), material=M['paint2'],
                    parent=hull_root))
    objs.append(cyl('crane_post', 0.022, 0.20, loc=(-0.24, 0.26, 0.46), material=M['metal'], verts=10,
                    parent=hull_root))
    objs.append(box('crane_jib', (0.30, 0.035, 0.035), loc=(-0.10, 0.26, 0.555), material=M['trim'],
                    bevel=0.004, parent=hull_root))
    objs.append(box('crane_cable', (0.01, 0.01, 0.16), loc=(-0.02, 0.26, 0.47), material=M['dark'],
                    bevel=0, parent=hull_root))
    objs.append(box('crane_hook', (0.03, 0.03, 0.04), loc=(-0.02, 0.26, 0.37), material=M['metal'],
                    bevel=0.004, parent=hull_root))
    for k in range(3):
        objs.append(box(f'deck_strip_{k}', (0.70, 0.03, 0.012), loc=(-0.20, -0.15 + k * 0.15, 0.275),
                        material=M['trim'], bevel=0, parent=hull_root))
    # service cable runs: deck conduit ahead of the launcher + side-box feed
    objs.append(box('service_cable_deck', (0.025, 0.44, 0.01), loc=(0.115, 0, 0.283), material=M['dark'],
                    bevel=0, parent=hull_root))
    objs.append(box('service_cable_side', (0.30, 0.02, 0.012), loc=(-0.05, -0.26, 0.316), material=M['dark'],
                    bevel=0, parent=hull_root))
    # stabiliser legs (4): fixed outrigger arms read top-down; hinged jacks
    # swing down and plant oversized pads when deployed
    for i, x in enumerate((0.30, -0.58)):
        for s in (1, -1):
            objs.append(box(f'outrigger_{i}_{s}', (0.09, 0.22, 0.05), loc=(x, 0.31 * s, 0.235),
                            material=M['paint2'], parent=hull_root))
            objs.append(box(f'outrigger_team_{i}_{s}', (0.05, 0.10, 0.056), loc=(x, 0.34 * s, 0.235),
                            material=M['team'], bevel=0.004, parent=hull_root))
            hinge = empty(f'leg_hinge_{i}_{s}', loc=(x, 0.27 * s, 0.24), parent=hull_root)
            beam = box(f'leg_beam_{i}_{s}', (0.05, 0.05, 0.25), loc=(0, 0.0, -0.115), material=M['trim'],
                       parent=hinge)
            pad = box(f'leg_pad_{i}_{s}', (0.15, 0.15, 0.025), loc=(0, 0, -0.235), material=M['metal'],
                      parent=hinge)
            legs.append((hinge, s))
            objs += [beam, pad]
    # mid jack pair: extra outriggers with collared screws join the deploy animation
    for s in (1, -1):
        objs.append(box(f'jack_arm_{s}', (0.09, 0.14, 0.05), loc=(-0.14, 0.34 * s, 0.235),
                        material=M['paint2'], parent=hull_root))
        jhinge = empty(f'jack_hinge_{s}', loc=(-0.14, 0.27 * s, 0.24), parent=hull_root)
        jbeam = box(f'jack_beam_{s}', (0.05, 0.05, 0.25), loc=(0, 0, -0.115), material=M['trim'],
                    parent=jhinge)
        jcollar = box(f'jack_collar_{s}', (0.08, 0.08, 0.06), loc=(0, 0, -0.03), material=M['metal'],
                      parent=jhinge)
        jpad = box(f'jack_pad_{s}', (0.17, 0.17, 0.025), loc=(0, 0, -0.235), material=M['metal'],
                   parent=jhinge)
        legs.append((jhinge, s))
        objs += [jbeam, jcollar, jpad]
    # launcher module on a pivot at rear, raises from horizontal to vertical
    lpiv = empty('launcher_pivot', loc=(-0.64, 0, 0.30), parent=hull_root)
    objs.append(box('launcher_box', (0.70, 0.36, 0.20), loc=(0.37, 0, 0.11), material=M['paint'], parent=lpiv))
    objs.append(box('launcher_team', (0.66, 0.37, 0.05), loc=(0.37, 0, 0.13), material=M['team'],
                    bevel=0.006, parent=lpiv))
    hatches = []
    for r in range(2):
        for c in range(3):
            h = box(f'cell_{r}_{c}', (0.02, 0.10, 0.10), loc=(0.73, -0.11 + c * 0.11, 0.06 + r * 0.11 - 0.05),
                    material=M['trim'], bevel=0.003, parent=lpiv)
            hatches.append(h)
            objs.append(h)
            # dark open mouth: reads as a launch tube from the top camera
            objs.append(box(f'cell_mouth_{r}_{c}', (0.012, 0.07, 0.07),
                            loc=(0.742, -0.11 + c * 0.11, 0.06 + r * 0.11 - 0.05),
                            material=M['dark'], bevel=0, parent=lpiv))
            # raised metal rim + amber interceptor tip: open-cell state reads top-down
            objs.append(box(f'cell_collar_{r}_{c}', (0.010, 0.104, 0.104),
                            loc=(0.745, -0.11 + c * 0.11, 0.06 + r * 0.11 - 0.05),
                            material=M['metal'], bevel=0.002, parent=lpiv))
            objs.append(box(f'cell_glint_{r}_{c}', (0.016, 0.038, 0.038),
                            loc=(0.744, -0.11 + c * 0.11, 0.06 + r * 0.11 - 0.05),
                            material=M['lens'], bevel=0, parent=lpiv))
    objs.append(box('launcher_cradle', (0.08, 0.40, 0.08), loc=(0.02, 0, 0.0), material=M['metal'], parent=lpiv))
    objs.append(box('launcher_beacon', (0.05, 0.05, 0.05), loc=(0.10, 0.15, 0.24), material=M['light'],
                    bevel=0.006, parent=lpiv))
    # rotating fire-control radar panel on the power unit
    rpiv = empty('radar_pivot', loc=(0.24, 0, 0.43), parent=hull_root)
    objs.append(cyl('radar_mast', 0.02, 0.10, loc=(0, 0, 0.05), material=M['metal'], verts=8, parent=rpiv))
    # wide fire-control panel: rotating bar reads clearly from top-down
    objs.append(box('radar_panel', (0.03, 0.30, 0.14), loc=(0, 0, 0.14), rot=(0, 0.25, 0), material=M['paint2'],
                    parent=rpiv))
    objs.append(box('radar_face', (0.005, 0.27, 0.11), loc=(0.017, 0, 0.14), rot=(0, 0.25, 0), material=M['lens'],
                    bevel=0, parent=rpiv))
    # launch plume (only visible in launch state)
    plume = cyl('launch_plume', 0.05, 0.4, loc=(0.95, 0, 0.06), rot=(0, math.pi / 2, 0),
                material=mat('plume', '#FFD9A0', emission='#FFB55A', emission_strength=18, grime=0),
                verts=12, radius_top=0.012, parent=lpiv)
    objs.append(plume)

    hp_top = empty('hp_healthbar', loc=(0, 0, 0.70), parent=root)
    hp_top['fc_parts'] = ['whole']
    hp_launch = empty('hp_launch', loc=(0.80, 0, 0.06), parent=lpiv)
    hp_launch['fc_parts'] = ['whole']
    rig = fclib.Rig(root)
    rig.parts = {'whole': objs}
    rig.hull_root, rig.lpiv, rig.rpiv, rig.plume = hull_root, lpiv, rpiv, plume
    rig.legs, rig.wheels = legs, wheels
    rig.hardpoints = {'healthbar': hp_top, 'launch': hp_launch}
    rig.wreck_missing = [o for o in objs if o.name.startswith(('radar_', 'lamp_', 'windscreen', 'cab_roof_team',
                                                               'launcher_team'))]
    rig.wreck_missing += [w for w in wheels[:2]] + [w.children[0] for w in wheels[:2]]
    rig.scorch = fclib.scorch_decal('wreck_scorch', 1.0, parent=root)
    return rig


def _deploy(rig, t):
    """t in [0,1]: legs swing out/down during 0..0.5, launcher raises 0.35..1."""
    lt = min(1.0, t / 0.5)
    for hinge, s in rig.legs:
        hinge.rotation_euler = (s * (1.2 - 1.2 * lt) * -1 + 0.0, 0, 0)
        hinge.location.z = 0.24 + 0.02 * lt
    rt = max(0.0, min(1.0, (t - 0.35) / 0.65))
    rt = rt * rt * (3 - 2 * rt)
    rig.lpiv.rotation_euler = (0, -math.radians(82) * rt, 0)
    rig.hull_root.location.z = 0.02 * lt


def pose(rig, st, frame, d):
    rig.root.rotation_euler = (0, 0, fclib.heading_to_blender_z(d, st['directions']))
    rig.hull_root.location = (0, 0, 0)
    rig.hull_root.rotation_euler = (0, 0, 0)
    rig.rpiv.rotation_euler = (0, 0, 0)
    fclib.set_grime_all(0.0)
    fclib.set_char_all(0.0)
    fclib.set_emission_scale(1.0)
    for w in rig.wheels:
        w.rotation_euler = (math.pi / 2, 0, 0)
    _deploy(rig, 0.0)
    name, n = st['name'], max(1, st['frames'])
    plume_on = False
    if name == 'move':
        for w in rig.wheels:
            w.rotation_euler.rotate_axis('Z', frame / n * math.pi / 2)
        rig.hull_root.location.z = 0.006 * math.sin(frame / n * 2 * math.pi)
    if name == 'deploy':
        _deploy(rig, (frame + 1) / n)
    if name == 'deployed':
        _deploy(rig, 1.0)
        rig.rpiv.rotation_euler = (0, 0, 2 * math.pi * frame / n)
    if name == 'launch':
        _deploy(rig, 1.0)
        plume_on = frame < n - 1
        rig.plume.scale = (1, 1, 1.0 + frame * 0.6)
    if name == 'damaged':
        fclib.set_grime_all(0.6)
        fclib.set_char_all(0.3)
    if name == 'wreck':
        fclib.set_grime_all(0.6)
        fclib.set_char_all(0.85)
        fclib.set_emission_scale(0.0)
        fclib.set_char_all(0.92)
        _deploy(rig, 0.6)
        rig.lpiv.rotation_euler = (0.35, -0.55, 0.2)          # launcher module collapsed sideways
        rig.hull_root.location.z = -0.05
        rig.hull_root.rotation_euler = (0.12, 0.06, 0.08)
        vis = [o for o in rig.parts['whole'] if o is not rig.plume and o not in set(rig.wreck_missing)]
        return vis + [rig.scorch], vis
    objs = [o for o in rig.parts['whole'] if o is not rig.plume or plume_on]
    return objs, [o for o in objs if o is not rig.plume]
