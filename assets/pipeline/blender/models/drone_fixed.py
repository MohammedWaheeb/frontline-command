"""Fixed-wing pusher strike drone (twin boom, inverted-V tail, launch racks,
belly missile magazine, fixed skids).

Used for: unit.IR.strike. Design 23.1: recognisable drone sizes, clearly not a
manned jet (no canopy, pusher propeller, slender booms).
Rendered at ground level; the client raises the sprite by its altitude and
draws the ground shadow at the sim position offset along the sun vector.
Footprint radius 0.6 tiles (aircraft).
"""
import math

import fclib
from fclib import box, cyl, slab, sphere, empty, mat


def build(faction, params):
    M = fclib.faction_mats(faction or 'IR')
    hull_grey = mat('drone_grey', '#6F7470', rough=0.55, grime=0.2)
    root = empty('root', loc=(0, 0, 0.0))
    body = empty('body', parent=root)
    parts = []
    # fuselage: tapered pod
    parts.append(slab('fuselage', [(0.52, 0.0), (0.40, 0.07), (-0.30, 0.08), (-0.42, 0.05),
                                   (-0.42, -0.05), (-0.30, -0.08), (0.40, -0.07)], 0.02, 0.15,
                      material=hull_grey, top_scale=0.72, top_shift=(0.02, 0), bevel=0.02, parent=body))
    parts.append(sphere('nose_sensor', 0.05, loc=(0.46, 0, 0.04), material=M['glass'], parent=body,
                        scale=(1.2, 1, 0.8)))
    parts.append(box('dorsal_team', (0.40, 0.07, 0.02), loc=(0.02, 0, 0.155), material=M['team'],
                     bevel=0.005, parent=body))
    # heavy-class spine: twin longeron rails flanking the team stripe + aft block
    for s in (1, -1):
        parts.append(box(f'spine_rail_{s}', (0.44, 0.03, 0.03), loc=(0.0, 0.055 * s, 0.16),
                         material=M['paint2'], bevel=0.006, parent=body))
    parts.append(box('spine_aft', (0.16, 0.05, 0.035), loc=(-0.26, 0, 0.16), material=M['paint2'],
                     bevel=0.008, parent=body))
    # large-class strike wing: broad span, clearly above the small loiter quad
    parts.append(slab('wing', [(0.14, 0.0), (0.06, 0.70), (-0.04, 0.70), (-0.06, 0.0), (-0.04, -0.70),
                               (0.06, -0.70)], 0.08, 0.105, material=M['paint'], bevel=0.008, parent=body))
    for s in (1, -1):
        parts.append(box(f'wingtip_team_{s}', (0.10, 0.10, 0.028), loc=(0.01, 0.65 * s, 0.093),
                         material=M['team'], bevel=0.004, parent=body))
        # booms and enlarged inverted-V tail
        parts.append(cyl(f'boom_{s}', 0.026, 0.72, loc=(-0.30, 0.20 * s, 0.09), rot=(0, math.pi / 2, 0),
                         material=hull_grey, verts=10, parent=body))
        parts.append(box(f'tail_{s}', (0.14, 0.014, 0.16), loc=(-0.62, 0.20 * s, 0.06), rot=(0.55 * s, 0, 0),
                         material=M['paint'], bevel=0.004, parent=body, taper=(0.6, 1.0)))
        # unfolded launch rack with teeth; munitions hidden after release
        parts.append(box(f'rack_{s}', (0.34, 0.03, 0.03), loc=(0.03, 0.34 * s, 0.068), material=M['trim'],
                         bevel=0, parent=body))
        for k in range(3):
            parts.append(box(f'rack_tooth_{s}_{k}', (0.02, 0.032, 0.02), loc=(-0.07 + k * 0.10, 0.34 * s, 0.058),
                             material=M['trim'], bevel=0, parent=body))
        # unfolded rack reads longer: extra leading tooth on the exposed rail
        parts.append(box(f'rack_tooth_{s}_3', (0.02, 0.032, 0.02), loc=(-0.12, 0.34 * s, 0.058),
                         material=M['trim'], bevel=0, parent=body))
        parts.append(cyl(f'munition_{s}', 0.024, 0.24, loc=(0.03, 0.34 * s, 0.045), rot=(0, math.pi / 2, 0),
                         material=mat('munition', '#5A5E58', rough=0.5, grime=0.2), verts=10, parent=body))
        # underwing magazine box: heavy strike load vs the small loiter class
        parts.append(box(f'wing_mag_{s}', (0.30, 0.09, 0.06), loc=(0.03, 0.50 * s, 0.055),
                         material=M['paint2'], bevel=0.008, parent=body))
        parts.append(box(f'wing_mag_bay_{s}', (0.26, 0.07, 0.012), loc=(0.03, 0.50 * s, 0.022),
                         material=M['dark'], bevel=0, parent=body))
    parts.append(box('tail_bar', (0.06, 0.44, 0.025), loc=(-0.66, 0, 0.02), material=M['paint'], parent=body))
    # visible centerline missile magazine + fixed landing skids (never a jet)
    parts.append(box('magazine', (0.40, 0.13, 0.08), loc=(-0.02, 0, 0.005), material=M['paint2'], bevel=0.01,
                     parent=body))
    parts.append(box('magazine_bay', (0.34, 0.09, 0.015), loc=(-0.02, 0, -0.037), material=M['dark'], bevel=0,
                     parent=body))
    parts.append(box('magazine_team', (0.30, 0.135, 0.02), loc=(-0.02, 0, 0.048), material=M['team'], bevel=0.004,
                     parent=body))
    for s in (1, -1):
        parts.append(box(f'skid_{s}', (0.30, 0.025, 0.025), loc=(0.08, 0.10 * s, -0.028), material=M['trim'],
                         bevel=0, parent=body))
        parts.append(box(f'skid_strut_{s}', (0.025, 0.02, 0.05), loc=(0.08, 0.10 * s, 0.0), material=M['dark'],
                         bevel=0, parent=body))
    # pusher propeller: disc blur + blades
    prop = empty('prop', loc=(-0.45, 0, 0.09), parent=body)
    disc = cyl('prop_disc', 0.13, 0.004, rot=(0, math.pi / 2, 0), material=mat('prop_blur', '#A4AAA8', rough=0.6,
                                                                             grime=0, alpha=0.16), verts=24,
               bevel=0, parent=prop)
    blades = [box(f'blade_{i}', (0.006, 0.25, 0.012), rot=(i * math.pi / 2, 0, 0), material=M['dark'], bevel=0,
                  parent=prop) for i in range(2)]
    parts += [disc] + blades
    parts.append(box('antenna', (0.01, 0.01, 0.06), loc=(-0.1, 0, 0.18), material=M['dark'], bevel=0, parent=body))
    parts.append(cyl('nav_light', 0.012, 0.01, loc=(0.0, 0, 0.165), material=M['light'], verts=8, parent=body))

    hp_mun = empty('hp_release', loc=(0.03, 0, 0.03), parent=body)
    hp_mun['fc_parts'] = ['body']
    hp_top = empty('hp_healthbar', loc=(0, 0, 0.32), parent=root)
    hp_top['fc_parts'] = ['body']
    rig = fclib.Rig(root)
    rig.parts = {'body': parts}
    rig.body, rig.prop = body, prop
    rig.munitions = [o for o in parts if o.name.startswith('munition_')]
    rig.hardpoints = {'release': hp_mun, 'healthbar': hp_top}
    return rig


def pose(rig, st, frame, d):
    rig.root.rotation_euler = (0, 0, fclib.heading_to_blender_z(d, st['directions']))
    rig.body.location = (0, 0, 0.05)       # small lift so the shadow catcher never intersects
    rig.body.rotation_euler = (0, 0, 0)
    rig.prop.rotation_euler = (frame * math.pi / 3, 0, 0)
    fclib.set_grime_all(0.0)
    fclib.set_char_all(0.0)
    for m in rig.munitions:
        m.hide_render = False
    name, n = st['name'], max(1, st['frames'])
    if name == 'fire':
        # frame 0 released left, 1 released both
        rig.munitions[0].hide_render = frame >= 0
        rig.munitions[1].hide_render = frame >= 1
    if name == 'empty':
        for m in rig.munitions:
            m.hide_render = True
    if name == 'bank_left':
        rig.body.rotation_euler = (-0.35, 0, 0)
    if name == 'bank_right':
        rig.body.rotation_euler = (0.35, 0, 0)
    if name == 'damaged':
        fclib.set_grime_all(0.6)
        fclib.set_char_all(0.3)
    if name == 'crash':
        fclib.set_char_all(0.5 + 0.5 * frame / n)
        rig.body.rotation_euler = (0.5 * frame, 0.25 + 0.1 * frame, 0.3 * frame)
    visible = [o for o in rig.parts['body'] if not o.hide_render]
    return visible, visible
