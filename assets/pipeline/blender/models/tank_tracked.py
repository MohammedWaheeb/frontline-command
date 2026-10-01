"""Tracked main battle tank, hull + independently rotating turret.

Used for: unit.US.tank (Sentinel). Params allow later faction variants.
Parts: 'hull' (hull, tracks, skirts) and 'turret' (turret, gun). Turret ring is
centred on the unit origin so both parts share one anchor for any heading.
Scale: 1 BU = 1 tile (about 4 m). Footprint radius 0.8 tiles (heavy vehicle).
"""
import math

import bpy

import fclib
from fclib import box, cyl, slab, empty, mat


def _track_material(name):
    """Dark track with link stripes whose phase is animated per move frame."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.name = 'fc_track_phase'
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'X'
    wave.inputs['Scale'].default_value = 16.0
    wave.inputs['Distortion'].default_value = 0.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.020, 0.020, 0.020, 1)
    ramp.color_ramp.elements[1].color = (0.085, 0.080, 0.072, 1)
    ramp.color_ramp.elements[1].position = 0.55
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], wave.inputs['Vector'])
    nt.links.new(wave.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.8
    b.inputs['Metallic'].default_value = 0.3
    m['fc_team'] = 0
    return m


def build(faction, params):
    M = fclib.faction_mats(faction or 'US')
    root = empty('root')
    hull_root = empty('hull_root', parent=root)
    turret_root = empty('turret_root', loc=(0, 0, 0.40), parent=root)
    hull, turret, wheels = [], [], []
    track_mat = _track_material('track_links')

    # ---- running gear ------------------------------------------------------
    L = params.get('length', 1.66)
    for s in (1, -1):
        y = 0.36 * s
        side = 'L' if s > 0 else 'R'
        hull.append(box(f'track_{side}', (L - 0.16, 0.22, 0.20), loc=(-0.05, y, 0.12),
                        material=track_mat, bevel=0.03, parent=hull_root))
        for end, x in (('f', L / 2 - 0.13), ('r', -L / 2 + 0.03)):
            hull.append(cyl(f'track_{side}_{end}', 0.10, 0.22, loc=(x, y, 0.12),
                            rot=(math.pi / 2, 0, 0), material=track_mat, parent=hull_root))
        for i in range(6):
            x = -L / 2 + 0.2 + i * (L - 0.44) / 5
            w = cyl(f'wheel_{side}_{i}', 0.085, 0.05, loc=(x, y + 0.095 * s, 0.10),
                    rot=(math.pi / 2, 0, 0), material=M['metal'], verts=14, parent=hull_root)
            hub = cyl(f'hub_{side}_{i}', 0.03, 0.02, loc=(0, 0, 0.03 * s), material=M['dark'],
                      verts=8, parent=w)
            wheels.append(w)
            hull += [w, hub]

    # ---- hull ---------------------------------------------------------------
    # side profile (x, z) of the upper hull with sloped glacis and rear deck
    hull.append(box('lower_hull', (L - 0.26, 0.54, 0.16), loc=(-0.04, 0, 0.17),
                    material=M['paint2'], parent=hull_root))
    upper = slab('upper_hull', [(0.86, 0.26), (0.74, 0.47), (-0.78, 0.47), (-0.86, 0.41),
                                (-0.86, -0.41), (-0.78, -0.47), (0.74, -0.47), (0.86, -0.26)],
                 0.24, 0.40, material=M['paint'], top_scale=0.9, top_shift=(-0.06, 0),
                 bevel=0.018, parent=hull_root)
    hull.append(box('glacis_plate', (0.10, 0.70, 0.12), loc=(0.80, 0, 0.32), rot=(0, -0.9, 0),
                    material=M['paint2'], bevel=0.01, parent=hull_root))
    hull.append(upper)
    for s in (1, -1):
        side = 'L' if s > 0 else 'R'
        # team-colour side skirts: readable from every heading
        hull.append(box(f'skirt_{side}', (1.34, 0.04, 0.15), loc=(0.02, 0.495 * s, 0.215),
                        rot=(0.12 * s, 0, 0), material=M['team'], bevel=0.01, parent=hull_root))
        hull.append(box(f'skirt_trim_{side}', (1.38, 0.05, 0.03), loc=(0.02, 0.485 * s, 0.30),
                        material=M['trim'], bevel=0.006, parent=hull_root))
        for k in range(4):
            hull.append(box(f'skirt_seam_{side}_{k}', (0.012, 0.045, 0.13),
                            loc=(-0.48 + k * 0.33, 0.51 * s, 0.215), rot=(0.12 * s, 0, 0),
                            material=M['trim'], bevel=0, parent=hull_root))
        hull.append(box(f'fender_{side}', (0.20, 0.24, 0.02), loc=(0.72, 0.37 * s, 0.30),
                        material=M['paint2'], parent=hull_root))
        hull.append(cyl(f'headlamp_{side}', 0.022, 0.03, loc=(0.78, 0.30 * s, 0.35),
                        rot=(0, math.pi / 2, 0), material=M['light'], verts=10, parent=hull_root))
    hull.append(box('engine_deck', (0.46, 0.66, 0.035), loc=(-0.56, 0, 0.43), material=M['trim'],
                    parent=hull_root))
    for i in range(5):
        hull.append(box(f'grille_{i}', (0.38, 0.03, 0.012), loc=(-0.56, -0.24 + i * 0.12, 0.452),
                        material=M['dark'], bevel=0, parent=hull_root))
    hull.append(box('driver_hatch', (0.12, 0.14, 0.03), loc=(0.48, 0.16, 0.425),
                    material=M['trim'], parent=hull_root))
    # angular glacis cheek plates: top-down detail clear of the turret ring
    for s in (1, -1):
        side = 'L' if s > 0 else 'R'
        hull.append(box(f'cheek_plate_{side}', (0.16, 0.20, 0.03),
                        loc=(0.62, 0.20 * s, 0.42), rot=(0, -0.5, 0.15 * s),
                        material=M['trim'], parent=hull_root))
    for s in (1, -1):
        side = 'L' if s > 0 else 'R'
        hull.append(box(f'stowage_{side}', (0.34, 0.10, 0.07), loc=(-0.30, 0.40 * s, 0.43),
                        material=M['paint2'], parent=hull_root))
        hull.append(box(f'jerrycan_{side}', (0.08, 0.06, 0.08), loc=(-0.78, 0.36 * s, 0.45),
                        material=M['trim'], parent=hull_root))
        hull.append(box(f'mud_flap_{side}', (0.03, 0.22, 0.10), loc=(-0.84, 0.37 * s, 0.27),
                        material=M['dark'], bevel=0.004, parent=hull_root))
    for i in range(3):
        hull.append(box(f'periscope_{i}', (0.05, 0.06, 0.03), loc=(0.56, 0.08 + (i - 1) * 0.07, 0.425),
                        material=M['glass'], bevel=0.004, parent=hull_root))
    hull.append(box('tow_bar', (0.05, 0.5, 0.04), loc=(-0.86, 0, 0.26), material=M['metal'],
                    parent=hull_root))

    # ---- turret -------------------------------------------------------------
    poly = [(0.44, 0.0), (0.34, 0.27), (-0.18, 0.33), (-0.50, 0.28), (-0.50, -0.28),
            (-0.18, -0.33), (0.34, -0.27)]
    turret.append(slab('turret_body', poly, 0.0, 0.19, material=M['paint'], top_scale=0.9,
                       top_shift=(-0.03, 0), bevel=0.02, parent=turret_root))
    turret.append(slab('turret_band', [(x * 1.02, y * 1.02) for x, y in poly], 0.055, 0.105,
                       material=M['team'], bevel=0.008, parent=turret_root))
    # roof recognition stripe + angular turret cheeks: ownership and shape read top-down
    turret.append(box('turret_roof_stripe', (0.30, 0.10, 0.018), loc=(-0.02, 0, 0.20),
                      material=M['team'], bevel=0.004, parent=turret_root))
    for s in (1, -1):
        turret.append(box(f'turret_cheek_{"L" if s > 0 else "R"}', (0.18, 0.05, 0.11),
                          loc=(0.30, 0.30 * s, 0.10), rot=(0, 0, -0.25 * s),
                          material=M['paint2'], bevel=0.012, parent=turret_root))
    turret.append(box('bustle', (0.22, 0.52, 0.12), loc=(-0.58, 0, 0.08), material=M['paint2'],
                      parent=turret_root))
    for i in range(3):
        turret.append(box(f'bustle_rack_{i}', (0.02, 0.56, 0.02), loc=(-0.70, 0, 0.05 + i * 0.05),
                          material=M['metal'], bevel=0, parent=turret_root))
    gun_root = empty('gun_root', loc=(0.40, 0, 0.10), parent=turret_root)
    turret.append(box('mantlet', (0.14, 0.22, 0.13), loc=(0.02, 0, 0), material=M['paint2'],
                      parent=gun_root))
    barrel = cyl('barrel', 0.034, 0.86, loc=(0.47, 0, 0.0), rot=(0, math.pi / 2, 0),
                 material=M['metal'], verts=14, parent=gun_root)
    sleeve = cyl('thermal_sleeve', 0.045, 0.30, loc=(0.20, 0, 0.0), rot=(0, math.pi / 2, 0),
                 material=M['paint2'], verts=14, parent=gun_root)
    muzzle = cyl('muzzle', 0.046, 0.08, loc=(0.88, 0, 0.0), rot=(0, math.pi / 2, 0),
                 material=M['metal'], verts=14, parent=gun_root)
    turret += [barrel, sleeve, muzzle]
    turret.append(cyl('cupola', 0.075, 0.07, loc=(-0.16, 0.14, 0.225), material=M['paint2'],
                      verts=16, parent=turret_root))
    turret.append(box('sight', (0.10, 0.08, 0.08), loc=(0.14, -0.18, 0.23), material=M['paint2'],
                      parent=turret_root))
    turret.append(box('sight_lens', (0.012, 0.06, 0.04), loc=(0.195, -0.18, 0.23), material=M['lens'],
                      bevel=0, parent=turret_root))
    turret.append(cyl('rws_gun', 0.012, 0.22, loc=(-0.06, 0.14, 0.30), rot=(0, math.pi / 2, 0),
                      material=M['metal'], verts=8, parent=turret_root))
    turret.append(cyl('antenna', 0.006, 0.34, loc=(-0.42, -0.2, 0.34), material=M['dark'], verts=6,
                      bevel=0, parent=turret_root))
    for s in (1, -1):
        for i in range(3):
            turret.append(cyl(f'smoke_{s}_{i}', 0.022, 0.09, loc=(0.26, 0.26 * s + 0.03 * i * s, 0.16),
                              rot=(0, math.pi / 2 - 0.4, 0.5 * s), material=M['dark'], verts=8,
                              parent=turret_root))

    hp_muzzle = empty('hp_muzzle', loc=(0.95, 0, 0), parent=gun_root)
    hp_muzzle['fc_parts'] = ['turret']
    hp_top = empty('hp_healthbar', loc=(0, 0, 0.62), parent=root)
    hp_top['fc_parts'] = ['hull']

    rig = fclib.Rig(root)
    rig.parts = {'hull': hull, 'turret': turret}
    rig.hull_root, rig.turret_root, rig.gun_root = hull_root, turret_root, gun_root
    rig.wheels = wheels
    rig.track_mat = track_mat
    rig.hardpoints = {'muzzle': hp_muzzle, 'healthbar': hp_top}
    rig.skirt = [o for o in hull if o.name.startswith('skirt_R')]
    # parts blown off / burnt away in the wreck state
    rig.wreck_missing = [o for o in hull if o.name.startswith(('skirt_', 'fender_', 'stowage_', 'jerrycan_', 'headlamp_'))]
    rig.wreck_missing += [o for o in turret if o.name.startswith(('antenna', 'rws_gun', 'smoke_', 'sight'))]
    rig.scorch = fclib.scorch_decal('wreck_scorch', 1.05, parent=root)
    return rig


def _reset(rig):
    rig.root.rotation_euler = (0, 0, 0)
    rig.hull_root.location = (0, 0, 0)
    rig.hull_root.rotation_euler = (0, 0, 0)
    rig.turret_root.location = (0, 0, 0.40)
    rig.turret_root.rotation_euler = (0, 0, 0)
    rig.gun_root.location = (0.40, 0, 0.10)
    rig.gun_root.rotation_euler = (0, 0, 0)
    rig.track_mat.node_tree.nodes['fc_track_phase'].inputs['Location'].default_value = (0, 0, 0)
    fclib.set_grime_all(0.0)
    fclib.set_char_all(0.0)
    fclib.set_emission_scale(1.0)


def pose(rig, st, frame, d):
    _reset(rig)
    rig.root.rotation_euler = (0, 0, fclib.heading_to_blender_z(d, st['directions']))
    name = st['name']
    n = max(1, st['frames'])
    everything = rig.parts['hull'] + rig.parts['turret']
    if name == 'move':
        phase = frame / n
        rig.track_mat.node_tree.nodes['fc_track_phase'].inputs['Location'].default_value = (phase / 16.0, 0, 0)
        for w in rig.wheels:
            w.rotation_euler = (math.pi / 2, 0, 0)
            w.rotation_euler.rotate_axis('Z', phase * (2 * math.pi / 16.0) / 0.085 * 1.0)
        rig.hull_root.location = (0, 0, 0.006 * math.sin(phase * 2 * math.pi))
    if name == 'fire':
        recoil = [0.10, 0.06, 0.02][min(frame, 2)]
        rig.gun_root.location = (0.40 - recoil, 0, 0.10)
        rig.turret_root.location = (-recoil * 0.12, 0, 0.40)
    missing = set()
    if name == 'damaged':
        fclib.set_grime_all(0.6)
        fclib.set_char_all(0.3)
        missing = set(rig.skirt)
    if name == 'wreck':
        # unmistakably dead: sunk and tilted hull, turret blown off onto the ground,
        # drooping barrel, missing skirts/stowage, charred paint, scorched ground contact
        fclib.set_grime_all(0.7)
        fclib.set_char_all(0.92)
        fclib.set_emission_scale(0.0)
        rig.hull_root.location = (0, 0, -0.045)
        rig.hull_root.rotation_euler = (0.07, -0.05, 0.10)
        rig.turret_root.location = (-0.62, 0.50, 0.13)
        rig.turret_root.rotation_euler = (0.55, 0.30, 1.95)
        rig.gun_root.rotation_euler = (0, 0.45, 0.25)
        missing = set(rig.wreck_missing)
        vis = [o for o in everything if o not in missing]
        return vis + [rig.scorch], vis
    part = st.get('part', 'hull')
    if part == 'turret':
        return [o for o in rig.parts['turret'] if o not in missing], []
    hull = [o for o in rig.parts['hull'] if o not in missing]
    if part == 'hull':
        return hull, hull + rig.parts['turret']
    return hull + rig.parts['turret'], hull + rig.parts['turret']
