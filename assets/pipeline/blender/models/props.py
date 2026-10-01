"""Neutral environment props rendered through the same camera contract.

Assets (params.prop):
  supply_field  - resource field (design 3.1): palletised supply stacks around a
                  marked loading bay. States full / high / low / depleted show
                  remaining value bands so players can read field value at a glance.
  sandbags      - infantry cover wall segment (cover terrain marker, design 6.4 / 17.1)
  rocks         - impassable rock cluster
  rubble_cover  - rubble cover pile (infantry cover, vehicles 80 % speed)
  shrub         - decorative desert scrub (no gameplay effect; visually distinct from cover)
Props have no team colour; the team pass is skipped.
"""
import math

import fclib
from fclib import box, cyl, sphere, empty, mat, rng


def _crate_stack(name, loc, r, M, parent, levels):
    objs = []
    crate = mat('crate_olive', '#6F6A4A', rough=0.85, grime=0.5)
    crate2 = mat('crate_sand', '#9C8A62', rough=0.85, grime=0.5)
    drum = mat('drum_blue', '#3C5566', rough=0.6, metal=0.3, grime=0.5)
    pallet = mat('pallet_wood', '#7A6446', rough=0.9, grime=0.4)
    x, y = loc
    objs.append(box(f'{name}_pallet', (0.42, 0.42, 0.05), loc=(x, y, 0.025), material=pallet, parent=parent))
    z = 0.05
    for lv in range(levels):
        for i in range(2):
            for j in range(2):
                if r.random() < 0.12 and lv == levels - 1:
                    continue
                m = [crate, crate2][(i + j + lv) % 2]
                objs.append(box(f'{name}_c{lv}{i}{j}', (0.19, 0.19, 0.15),
                                loc=(x - 0.1 + i * 0.2, y - 0.1 + j * 0.2, z + 0.075),
                                rot=(0, 0, (r.random() - 0.5) * 0.12), material=m, bevel=0.01, parent=parent))
        z += 0.15
    if levels and r.random() < 0.5:
        for k in range(3):
            objs.append(cyl(f'{name}_drum{k}', 0.055, 0.16, loc=(x + 0.3, y - 0.12 + k * 0.12, 0.08),
                            material=drum, verts=12, parent=parent))
    return objs


def build_supply_field(rig):
    root = rig.root
    ground = mat('field_ground', '#7E7158', rough=1.0, grime=0.6)
    bay = mat('bay_paint', '#C2A24C', rough=0.8, grime=0.6)
    conc = mat('concrete', '#8E8A80', rough=0.9, grime=0.5)
    rig.base = [box('field_apron', (3.0, 3.0, 0.02), loc=(0, 0, 0.01), material=ground, bevel=0.3, parent=root)]
    rig.base.append(box('bay_pad', (0.9, 0.9, 0.03), loc=(0.9, -0.9, 0.02), material=conc, bevel=0.02, parent=root))
    for s in (1, -1):
        rig.base.append(box(f'bay_line_{s}', (0.9, 0.05, 0.006), loc=(0.9, -0.9 + s * 0.42, 0.036), material=bay,
                            bevel=0, parent=root))
    rig.base.append(box('bay_arrow', (0.3, 0.08, 0.006), loc=(0.9, -0.9, 0.036), material=bay, bevel=0, parent=root))
    rig.base.append(cyl('bay_lamp_post', 0.02, 0.5, loc=(1.42, -0.42, 0.25), material=mat('gunmetal', '#3C4044'),
                        verts=6, parent=root))
    rig.base.append(cyl('bay_lamp', 0.035, 0.03, loc=(1.42, -0.42, 0.5), material=mat(
        'lamp_amber', '#403424', emission='#FFC46B', emission_strength=6.0, grime=0), verts=8, parent=root))
    r = rng(5)
    spots = [(-0.8, 0.8), (-0.2, 0.9), (0.5, 0.75), (-0.9, 0.15), (-0.3, 0.25), (0.35, 0.1), (-0.85, -0.5),
             (-0.2, -0.45)]
    rig.stacks = []
    for i, (x, y) in enumerate(spots):
        rig.stacks.append(_crate_stack(f'stack{i}', (x, y), r, None, root, 2 + (i % 2)))
    # Depleted read: stripped pallets + tipped drum + flat tarp, shown only
    # when no stacks remain (see pose). Footprint unchanged.
    rig.bare = []
    pallet = mat('pallet_wood', '#7A6446', rough=0.9, grime=0.4)
    tarp = mat('tarp_flat', '#5A5A48', rough=0.95, grime=0.6)
    drum = mat('drum_blue', '#3C5566', rough=0.6, metal=0.3, grime=0.5)
    for i in range(3):
        x, y = spots[i]
        rig.bare.append(box(f'bare_pallet_{i}', (0.42, 0.42, 0.05), loc=(x, y, 0.025), material=pallet, parent=root))
    rig.bare.append(box('bare_tarp', (0.5, 0.5, 0.03), loc=(spots[3][0], spots[3][1], 0.035),
                        rot=(0, 0, 0.3), material=tarp, bevel=0.005, parent=root))
    rig.bare.append(cyl('bare_drum', 0.055, 0.16, loc=(spots[0][0] + 0.35, spots[0][1] - 0.1, 0.055),
                        rot=(math.pi / 2, 0, 0.3), material=drum, verts=12, parent=root))
    return {'loading_bay': (0.9, -0.9, 0), 'label': (0, 0, 0.8)}


def build_sandbags(rig):
    root = rig.root
    bag = mat('sandbag', '#A08F68', rough=1.0, grime=0.5)
    r = rng(3)
    rig.base = []
    for row in range(3):
        n = 7 - row
        for i in range(n):
            x = -0.6 + (i + row * 0.5) * 0.2
            rig.base.append(box(f'bag_{row}_{i}', (0.19, 0.11, 0.07), loc=(x, (r.random() - 0.5) * 0.02, 0.035 + row * 0.065),
                                rot=(0, 0, (r.random() - 0.5) * 0.2), material=bag, bevel=0.03, parent=root))
    # Cover cue: end stakes + pale tabs on the top row mark the cover line.
    wood = mat('stake_wood', '#6B5638', rough=0.9, grime=0.4)
    tab = mat('cover_tab', '#CFC39E', rough=0.8, grime=0.4)
    for x in (-0.76, 0.76):
        rig.base.append(box(f'stake_{x}', (0.05, 0.05, 0.34), loc=(x, 0, 0.17), material=wood, bevel=0.008, parent=root))
    for i in (-1, 0, 1):
        rig.base.append(box(f'cover_tab_{i}', (0.12, 0.115, 0.012), loc=(i * 0.2, 0, 0.206),
                            material=tab, bevel=0, parent=root))
    return {}


def build_rocks(rig):
    root = rig.root
    rock = mat('rock', '#8A7A62', rough=0.95, grime=0.6)
    rock2 = mat('rock_dark', '#6B5E4C', rough=0.95, grime=0.6)
    r = rng(9)
    rig.base = []
    for i in range(7):
        s = 0.18 + r.random() * 0.28
        rig.base.append(sphere(f'rock_{i}', s, loc=((r.random() - 0.5) * 1.1, (r.random() - 0.5) * 1.1, s * 0.3),
                               material=[rock, rock2][i % 2], parent=root,
                               scale=(1.0 + r.random() * 0.4, 0.8 + r.random() * 0.3, 0.55 + r.random() * 0.3), segs=7))
    return {}


def build_rubble_cover(rig):
    root = rig.root
    M = {'concrete': mat('concrete', '#8E8A80', rough=0.9, grime=0.5),
         'concrete_dark': mat('concrete_dark', '#6A675F', rough=0.9, grime=0.5),
         'paint2': mat('brick', '#8C6448', rough=0.9, grime=0.5),
         'trim': mat('rebar', '#4A3B30', rough=0.6, metal=0.5, grime=0.3),
         'metal': mat('gunmetal', '#3C4044')}
    r = rng(21)
    rig.base = []
    for i in range(22):
        sx, sy, sz = 0.08 + r.random() * 0.2, 0.08 + r.random() * 0.2, 0.05 + r.random() * 0.12
        rig.base.append(box(f'chunk_{i}', (sx, sy, sz), loc=((r.random() - 0.5) * 1.3, (r.random() - 0.5) * 1.3, sz * 0.4),
                            rot=(r.random() * 0.8, r.random() * 0.8, r.random() * 3), material=list(M.values())[i % 4],
                            bevel=0.01, parent=root))
    rig.base.append(box('wall_stub', (0.9, 0.12, 0.35), loc=(-0.1, 0.35, 0.175), rot=(0, 0, 0.2),
                        material=M['paint2'], bevel=0.02, parent=root))
    return {}


def build_shrub(rig):
    root = rig.root
    leaf = mat('scrub', '#6E7248', rough=0.9, grime=0.4)
    leaf2 = mat('scrub_dry', '#8C8254', rough=0.9, grime=0.4)
    r = rng(4)
    rig.base = []
    for i in range(9):
        s = 0.07 + r.random() * 0.08
        rig.base.append(sphere(f'leaf_{i}', s, loc=((r.random() - 0.5) * 0.3, (r.random() - 0.5) * 0.3, s * 0.9),
                               material=[leaf, leaf2][i % 2], parent=root, scale=(1, 1, 0.8), segs=8))
    # Dry twig stems keep scrub visually distinct from solid cover walls.
    stem = mat('twig', '#6B5638', rough=0.95, grime=0.4)
    for i in range(3):
        rig.base.append(cyl(f'stem_{i}', 0.012, 0.22, loc=((r.random() - 0.5) * 0.2, (r.random() - 0.5) * 0.2, 0.11),
                            material=stem, verts=6, parent=root))
    return {}


BUILDERS = {'supply_field': build_supply_field, 'sandbags': build_sandbags, 'rocks': build_rocks,
            'rubble_cover': build_rubble_cover, 'shrub': build_shrub}


def build(faction, params):
    root = empty('root')
    rig = fclib.Rig(root)
    rig.kind = params['prop']
    pts = BUILDERS[rig.kind](rig)
    rig.hardpoints = {}
    for k, loc in pts.items():
        e = empty(f'hp_{k}', loc=loc, parent=root)
        e['fc_parts'] = ['prop']
        rig.hardpoints[k] = e
    return rig


# supply field value bands: number of visible stacks per state
FIELD_STACKS = {'full': 8, 'high': 6, 'low': 3, 'depleted': 0}


def pose(rig, st, frame, d):
    vis = list(rig.base)
    if rig.kind == 'supply_field':
        keep = FIELD_STACKS[st['name']]
        for i, objs in enumerate(rig.stacks):
            if i < keep:
                vis += objs
        if keep == 0:
            vis += rig.bare
    return vis, vis
