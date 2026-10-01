"""IR Shahed-class attack drone: small cheap delta-wing loitering munition.

Smaller, cheaper sibling of the strike class (drone_fixed): single delta wing,
pusher propeller, fixed skids, small warhead nose. No canopy, no booms, no
launch racks, no magazines -- the warhead is integral to the airframe.
Rendered at ground level; the client raises the sprite by its altitude and
draws the ground shadow at the sim position offset along the sun vector.
Footprint radius 0.6 tiles (aircraft). Span ~0.95 tiles (~0.9-tile munition).
"""
import math

import fclib
from fclib import box, cyl, slab, empty, mat


def build(faction, params):
    M = fclib.faction_mats(faction or 'IR')
    root = empty('root', loc=(0, 0, 0.0))
    body = empty('body', parent=root)
    parts = []
    # short fuselage pod
    parts.append(slab('fuselage', [(0.34, 0.0), (0.22, 0.06), (-0.34, 0.07), (-0.40, 0.04),
                                  (-0.40, -0.04), (-0.34, -0.07), (0.22, -0.06)], 0.02, 0.14,
                     material=M['paint'], top_scale=0.72, top_shift=(0.02, 0), bevel=0.02,
                     parent=body))
    # small warhead nose: tapered tip ahead of the pod (the munition itself)
    warhead = cyl('warhead', 0.05, 0.12, loc=(0.38, 0, 0.07), rot=(0, math.pi / 2, 0),
                  material=M['paint2'], verts=10, radius_top=0.015, parent=body)
    parts.append(warhead)
    parts.append(box('dorsal_team', (0.26, 0.06, 0.02), loc=(0.0, 0, 0.145), material=M['team'],
                     bevel=0.005, parent=body))
    # single delta wing: clearly below the strike class span
    parts.append(slab('wing', [(0.38, 0.0), (-0.26, 0.475), (-0.34, 0.475), (-0.34, -0.475),
                               (-0.26, -0.475)], 0.06, 0.115, material=M['paint'], bevel=0.008,
                      parent=body))
    for s in (1, -1):
        parts.append(box(f'wingtip_team_{s}', (0.08, 0.08, 0.028), loc=(-0.28, 0.42 * s, 0.10),
                         material=M['team'], bevel=0.004, parent=body))
        # small endplate tail fins on the delta trailing edge (fixed, no booms)
        parts.append(box(f'fin_{s}', (0.10, 0.014, 0.12), loc=(-0.32, 0.40 * s, 0.15),
                         material=M['paint2'], bevel=0.004, parent=body, taper=(0.6, 1.0)))
        # fixed landing skids (never a jet)
        parts.append(box(f'skid_{s}', (0.22, 0.025, 0.025), loc=(0.02, 0.09 * s, -0.028),
                         material=M['trim'], bevel=0, parent=body))
        parts.append(box(f'skid_strut_{s}', (0.025, 0.02, 0.05), loc=(0.02, 0.09 * s, 0.0),
                         material=M['dark'], bevel=0, parent=body))
    # pusher propeller: disc blur + blades
    prop = empty('prop', loc=(-0.43, 0, 0.08), parent=body)
    disc = cyl('prop_disc', 0.11, 0.004, rot=(0, math.pi / 2, 0), material=mat('prop_blur', '#A4AAA8', rough=0.6,
                                                                              grime=0, alpha=0.16), verts=24,
               bevel=0, parent=prop)
    blades = [box(f'blade_{i}', (0.006, 0.21, 0.012), rot=(i * math.pi / 2, 0, 0), material=M['dark'], bevel=0,
                  parent=prop) for i in range(2)]
    parts += [disc] + blades
    parts.append(box('antenna', (0.01, 0.01, 0.05), loc=(-0.12, 0, 0.16), material=M['dark'], bevel=0,
                     parent=body))

    hp_mun = empty('hp_release', loc=(0.38, 0, 0.05), parent=body)
    hp_mun['fc_parts'] = ['body']
    hp_top = empty('hp_healthbar', loc=(0, 0, 0.30), parent=root)
    hp_top['fc_parts'] = ['body']
    rig = fclib.Rig(root)
    rig.parts = {'body': parts}
    rig.body, rig.prop = body, prop
    rig.munitions = [warhead]
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
        # frame 0+ warhead released (single integral munition)
        rig.munitions[0].hide_render = frame >= 0
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
