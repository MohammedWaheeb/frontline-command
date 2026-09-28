"""Twenty-one original environment prop sources, Codex quota takeover.

Uses Claude Code claude-opus-5-5's fclib. Five accepted props.py samples remain
untouched. Props never grant a collider, cover, sight, income or an explosion:
only actual Go map/terrain state may enable those behaviors. Large solid props
are movement-blocking candidates, not inherently sight-blocking screens.
Garrison candidates have two entry-port plaques; sealed decoration has none.

All geometry is project-original, in tile units, +X forward, ground anchor 0.
No imported models or real-world logos. Exact state membership is reset per pose.
"""
import math
import fclib
from fclib import box, cyl, slab, prism, sphere, empty, mat


class Environment:
    def __init__(self, kind):
        self.kind = kind
        self.root = empty('root')
        self.m = {
            'sand': mat('env_sand', '#927D5B', rough=.95, grime=.35),
            'concrete': mat('env_concrete', '#99907C', rough=.93, grime=.45),
            'concrete_dark': mat('env_concrete_dark', '#666558', rough=.9, grime=.5),
            'metal': mat('env_metal', '#50544D', rough=.6, metal=.40, grime=.35),
            'trim': mat('env_trim', '#30382F', rough=.75, grime=.35),
            'olive': mat('env_olive', '#6E7254', rough=.8, grime=.45),
            'pale': mat('env_pale', '#B5A27B', rough=.8, grime=.35),
            'rust': mat('env_rust', '#876044', rough=.9, grime=.5),
            'wood': mat('env_wood', '#806A46', rough=.94, grime=.45),
            'amber': mat('env_amber', '#C6AA5F', rough=.72, grime=.20),
            'dark': mat('env_dark', '#252B26', rough=.88, grime=.3),
            'leaf': mat('env_leaf', '#69754A', rough=.9, grime=.25),
            'leaf_dry': mat('env_leaf_dry', '#9A925B', rough=.9, grime=.25),
            'lens': mat('env_lens', '#344239', rough=.35, metal=.2, grime=.1),
            'light': mat('env_light', '#C4AB6A', emission='#E4BF72', emission_strength=1.8, grime=0),
        }
        self.always, self.intact, self.damage_only, self.rubble = [], [], [], []
        self.detach, self.hardpoints = [], {}
        self.group = self.intact
        self.size = (1, 1)

    def add(self, obj, detach=False):
        self.group.append(obj)
        if detach:
            self.detach.append(obj)
        return obj

    def b(self, name, size, loc=(0, 0, 0), material='concrete', parent=None, detach=False, **kw):
        return self.add(box(name, size, loc=loc, material=self.m[material], parent=parent or self.root, **kw), detach)

    def c(self, name, radius, depth, loc=(0, 0, 0), material='metal', parent=None, detach=False, **kw):
        return self.add(cyl(name, radius, depth, loc=loc, material=self.m[material], parent=parent or self.root, **kw), detach)

    def s(self, name, radius, loc=(0, 0, 0), material='leaf', parent=None, detach=False, **kw):
        return self.add(sphere(name, radius, loc=loc, material=self.m[material], parent=parent or self.root, **kw), detach)

    def sl(self, name, poly, z0, z1, material='concrete', parent=None, detach=False, **kw):
        return self.add(slab(name, poly, z0, z1, material=self.m[material], parent=parent or self.root, **kw), detach)

    def pr(self, name, profile, depth, material='concrete', parent=None, detach=False, **kw):
        return self.add(prism(name, profile, depth, material=self.m[material], parent=parent or self.root, **kw), detach)

    def e(self, name, loc=(0, 0, 0), parent=None):
        return empty(name, loc=loc, parent=parent or self.root)

    def rod(self, name, a, b, radius=.016, material='metal', detach=False):
        dx, dy, dz = (b[i] - a[i] for i in range(3))
        length = math.sqrt(dx * dx + dy * dy + dz * dz)
        return self.c(name, radius, length, tuple((a[i] + b[i]) / 2 for i in range(3)), material,
                      rot=(0, math.atan2(math.hypot(dx, dy), dz), math.atan2(dy, dx)),
                      verts=7, bevel=.003, detach=detach)

    def hp(self, name, loc):
        obj = self.e('hp_' + name, loc)
        obj['fc_parts'] = ['prop']
        self.hardpoints[name] = obj

    def base(self, width, height, material='sand'):
        self.size = (width, height)
        old = self.group
        self.group = self.always
        self.b('ground_apron', (width, height, .025), (0, 0, .013), material, bevel=.055)
        self.group = old

    def crate(self, name, x, y, z=0, size=.32, material='olive'):
        self.b(name, (size, size, size * .65), (x, y, z + size * .325), material, bevel=.017)
        for side in (-1, 1):
            self.b(name + '_band' + str(side), (.027, size + .014, size * .65 + .012),
                   (x + side * size * .30, y, z + size * .325), 'trim', bevel=.003)
        self.b(name + '_lid', (size * .88, size * .88, .018), (x, y, z + size * .66), 'pale', bevel=.006)

    def window(self, name, x, y, z, width=.30, height=.22):
        self.b(name + '_frame', (width + .065, .045, height + .065), (x, y, z), 'trim', bevel=.008)
        self.b(name + '_recess', (width, .052, height), (x, y, z), 'dark', bevel=.005)
        self.b(name + '_sill', (width + .12, .14, .05), (x, y, z - height / 2 - .035), 'pale', bevel=.008)

    def rubble_state(self, seed, count=18):
        old = self.group
        self.group = self.rubble
        random = fclib.rng(seed)
        w, h = self.size
        for i in range(count):
            x, y = (random.random() - .5) * w * .82, (random.random() - .5) * h * .82
            size = .12 + random.random() * .19
            self.b('rubble_' + str(i), (size, size * .73, .08 + random.random() * .08),
                   (x, y, .07), 'concrete_dark' if i % 3 else 'rust',
                   rot=(random.random() * .25, random.random() * .3, random.random() * math.tau), bevel=.014)
        self.group = old


def station(E):
    """Small neutral supply kiosk and handoff yard; no invented mine or refinery."""
    E.base(1.6, 1.6, 'concrete_dark')
    E.b('kiosk', (.62, .58, .52), (-.33, .25, .29), 'olive', taper=(.97, .97), bevel=.02)
    E.b('kiosk_roof', (.75, .69, .065), (-.33, .25, .59), 'pale', bevel=.018)
    E.window('office', -.33, -.055, .38, .28, .16)
    for x in (.13, .64):
        E.c('canopy_post_' + str(x), .025, .51, (x, .36, .28), 'metal', verts=8)
    E.b('canopy', (.73, .72, .065), (.34, .35, .59), 'pale', rot=(.04, 0, 0), bevel=.018)
    E.crate('transfer_crate', .40, .33, .035, .28)
    E.b('loading_scale', (.54, .54, .035), (.30, -.38, .045), 'metal', bevel=.006)
    E.b('station_plaque', (.32, .035, .14), (-.33, -.082, .60), 'amber', bevel=.006)
    E.c('flag_socket', .04, .08, (-.65, -.55, .075), 'metal', verts=10)
    E.c('flag_mast', .018, .84, (-.65, -.55, .48), 'metal', verts=8)
    E.hp('owner_flag', (-.65, -.55, .95))
    E.hp('label', (0, 0, 1.0))


def shipment(E):
    """Open receiving apron: scenery remains empty until Go adds a real field."""
    E.base(3, 3, 'concrete_dark')
    for side in (-1, 1):
        E.b('edge_' + str(side), (2.6, .04, .006), (0, side * 1.27, .030), 'amber', bevel=0)
        for k in range(4):
            E.b(f'stop_line_{side}_{k}', (.04, .30, .006), (side * 1.23, -.92 + k * .61, .030), 'pale', bevel=0)
    E.sl('receiving_arrow', [(-.42, -.12), (.10, -.12), (.10, -.28), (.48, 0), (.10, .28), (.10, .12), (-.42, .12)],
         .028, .033, 'amber', bevel=0)
    for x in (-1.32, 1.32):
        E.c('beacon_post_' + str(x), .028, .25, (x, 1.30, .15), 'metal', verts=10)
        E.c('beacon_' + str(x), .045, .065, (x, 1.30, .31), 'light', verts=10, bevel=.008)
    E.hp('shipment_marker', (0, 0, .055))


def palm(E):
    E.size = (1.4, 1.4)
    for i in range(7):
        E.c('trunk_' + str(i), .055 - i * .003, .18, (.018 * i, 0, .095 + .17 * i),
            'wood', rot=(0, .08, 0), verts=7, radius_top=.05 - i * .003, bevel=.006)
        E.c('trunk_band_' + str(i), .058 - i * .003, .023, (.018 * i, 0, .10 + .17 * i), 'rust', verts=7, bevel=.002)
    crown = E.e('crown', (.12, 0, 1.25))
    for k in range(9):
        a = math.tau * k / 9
        E.sl('frond_' + str(k), [(0, 0), (.30, .09), (.73, .02), (.87, 0), (.48, -.065), (.18, -.05)],
             -.009, .009, 'leaf_dry' if k % 4 == 0 else 'leaf', crown, rot=(0, .24, a), bevel=.004)
        for j in range(2):
            E.sl(f'frond_leaf_{k}_{j}', [(.23 + j * .16, .01), (.40 + j * .16, .19), (.42 + j * .16, .11), (.30 + j * .16, -.015)],
                 .003, .010, 'leaf', crown, rot=(0, .24, a), bevel=.003)
    E.s('crown_heart', .12, (.12, 0, 1.22), 'leaf_dry', scale=(.8, .8, .65), segs=8)


def forest_edge(E):
    """Broad readable low cover patch; only place on actual forest-edge terrain."""
    E.size = (2, 1.4)
    for k, (x, y, scale) in enumerate(((-.67, .14, .34), (-.18, .32, .39), (.45, .12, .32), (.72, -.24, .24), (-.43, -.30, .20))):
        E.rod('stem_' + str(k), (x, y, .01), (x + .07, y, .28), .024, 'wood')
        E.s('foliage_' + str(k), scale, (x, y, scale * .57), 'leaf' if k % 2 else 'leaf_dry',
            scale=(1.15, .8, .58), segs=8)
        E.s('foliage_tip_' + str(k), scale * .6, (x + .08, y + .07, scale * .87), 'leaf',
            scale=(1.0, .9, .6), segs=7)


def fence(E):
    E.size = (1.6, .22)
    for x in (-.75, .75):
        E.c('post_' + str(x), .022, .62, (x, 0, .31), 'metal', verts=8)
        E.b('post_foot_' + str(x), (.13, .13, .08), (x, 0, .04), 'concrete', bevel=.012)
    for z in (.10, .55):
        E.rod('rail_' + str(z), (-.75, 0, z), (.75, 0, z), .012)
    # Open diamond mesh, not an opaque panel implying a sight blocker.
    for k in range(12):
        x = -.73 + k * .125
        E.rod('mesh_up_' + str(k), (x, 0, .12), (min(.73, x + .40), 0, .51), .0035, 'metal')
        E.rod('mesh_down_' + str(k), (x, 0, .51), (min(.73, x + .40), 0, .12), .0035, 'metal')


def barrier(E):
    E.size = (1.4, .48)
    E.pr('jersey', [(-.69, .035), (.69, .035), (.67, .13), (.51, .18), (.48, .39), (-.48, .39), (-.51, .18), (-.67, .13)],
         .40, bevel=.020)
    for x in (-.38, .38):
        E.b('reflector_' + str(x), (.13, .017, .065), (x, -.207, .29), 'amber', bevel=.004)
    E.b('top_cap', (.98, .29, .02), (0, 0, .40), 'pale', bevel=.008)


def container(E, name, loc, size, colour='olive', worn=False):
    x, y, z = loc
    w, h, height = size
    E.b(name, (w, h, height), (x, y, z + height / 2), colour, bevel=.025, detach=worn)
    for side in (-1, 1):
        for k in range(8):
            xx = x - w * .43 + k * w * .86 / 7
            E.b(f'{name}_rib_{side}_{k}', (.025, .024, height * .82), (xx, y + side * h / 2, z + height / 2), 'trim',
                bevel=.003, detach=worn)
        E.b(name + '_rail_' + str(side), (w + .035, .035, .035), (x, y + side * h / 2, z + height - .016), 'pale', bevel=.004, detach=worn)
    E.b(name + '_door', (.027, h * .86, height * .84), (x + w / 2 + .007, y, z + height / 2), 'metal', bevel=.006, detach=worn)
    for side in (-1, 1):
        E.b(name + '_lock_' + str(side), (.035, .018, height * .70), (x + w / 2 + .025, y + side * h * .21, z + height / 2),
            'pale', bevel=.003, detach=worn)


def containers(E):
    E.base(2, 2, 'sand')
    container(E, 'bottom_a', (0, -.46, .04), (1.75, .78, .55))
    container(E, 'bottom_b', (0, .45, .04), (1.65, .78, .55), 'rust')
    # A low offset second level leaves a broken silhouette and visible bindings.
    container(E, 'top', (-.17, -.12, .60), (1.24, .65, .44), 'pale', worn=True)


def fuel_tanks(E):
    E.base(2, 2, 'concrete_dark')
    for i, y in enumerate((-.46, .46)):
        for x in (-.50, .50):
            E.pr(f'saddle_{i}_{x}', [(-.14, .04), (.14, .04), (.10, .32), (-.10, .32)], .13,
                 loc=(x, y, 0), rot=(0, 0, math.pi / 2), bevel=.012)
        E.c('tank_' + str(i), .32, 1.42, (0, y, .50), 'pale' if i else 'olive',
            rot=(0, math.pi / 2, 0), verts=20, bevel=.025)
        for x in (-.48, .48):
            E.c(f'band_{i}_{x}', .33, .045, (x, y, .50), 'metal', rot=(0, math.pi / 2, 0), verts=20, bevel=.003)
        E.c('valve_' + str(i), .032, .10, (.74, y, .50), 'metal', rot=(0, math.pi / 2, 0), verts=8)
        E.c('hatch_' + str(i), .085, .06, (0, y, .83), 'metal', verts=12)
    E.b('hazard_plaque', (.32, .04, .16), (.50, -.82, .23), 'amber', bevel=.005)


def building(E, ruined=False, sealed=False):
    width = 2.0 if sealed else 3.0
    E.base(width, width, 'concrete_dark')
    half = width / 2 - .12
    height = .76 if sealed else 1.05
    # Real door gap, separately assembled wall piers; garrison windows recessed.
    E.b('back_wall', (width - .20, .15, height), (0, half, height / 2 + .05), 'concrete', bevel=.018)
    for side in (-1, 1):
        E.b('side_wall_' + str(side), (.15, width - .24, height), (side * half, 0, height / 2 + .05),
            'concrete', bevel=.018)
        E.b('front_pier_' + str(side), (half - .29, .16, height), (side * (half + .35) / 2, -half, height / 2 + .05),
            'pale', bevel=.018)
    E.b('door_lintel', (.78, .17, .25), (0, -half, height - .075), 'pale', bevel=.014, detach=not sealed)
    E.b('floor', (width - .45, width - .45, .025), (0, 0, .047), 'sand', bevel=.012)
    if sealed:
        E.b('sealed_shutter', (.61, .05, .59), (0, -half - .009, .345), 'metal', bevel=.012)
        for k in range(6):
            E.b('shutter_rib_' + str(k), (.58, .025, .017), (0, -half - .041, .13 + k * .083), 'trim', bevel=.002)
        E.rod('sealed_cross_a', (-.27, -half - .052, .12), (.27, -half - .052, .60), .022, 'rust')
        E.rod('sealed_cross_b', (.27, -half - .053, .12), (-.27, -half - .053, .60), .022, 'rust')
    else:
        E.b('entry_threshold', (.72, .29, .08), (0, -half - .05, .055), 'pale', bevel=.015)
        # Exactly two simple port plaques; no faction or civilian insignia.
        for side in (-1, 1):
            E.b('capacity_plaque_' + str(side), (.13, .03, .13), (side * .10, -half - .091, height - .06), 'amber', bevel=.013)
            E.window('front_window_' + str(side), side * .91, -half - .022, .57, .31, .23)
        E.hp('entry', (0, -half - .24, .04))
        E.hp('capacity', (0, -half, height + .16))
    for side in (-1, 1):
        # Roof panels can fail independently; the ruined house starts open.
        if not ruined or side == 1:
            E.b('roof_' + str(side), (width * .5 + .06, width + .05, .07),
                (side * width * .25, 0, height + .09), 'rust' if ruined else 'olive',
                rot=(0, side * .09, 0), bevel=.018, detach=True)
        for x in (-half, half):
            E.b(f'buttress_{side}_{x}', (.21, .24, height * .75), (x, side * (half - .18), height * .375 + .05),
                'concrete_dark', bevel=.014)
    if ruined:
        for k in range(4):
            E.b('broken_roof_beam_' + str(k), (.06, width - .24, .07), (-.92 + k * .62, 0, height + .07),
                'wood', rot=(.04 * k, 0, .04), bevel=.006, detach=True)
        E.b('broken_wall_chunk', (.45, .20, .28), (-.75, -.28, .17), 'concrete', rot=(.22, .15, .55), bevel=.012)
    else:
        E.b('roof_vent', (.28, .35, .16), (.47, .28, height + .20), 'metal', bevel=.017, detach=True)
    E.hp('label', (0, 0, height + .42))
    E.group = E.damage_only
    E.b('exposed_roof_beam', (width - .45, .05, .06), (0, .23, height), 'wood', rot=(0, .08, .08), bevel=.005)
    E.b('fallen_cladding', (.49, .11, .41), (half - .15, -.30, .24), 'rust', rot=(0, .30, .18), bevel=.012)
    E.group = E.intact
    E.rubble_state(43 if ruined else 31, 28 if not sealed else 18)


def bridge(E):
    """Permanent 1-tile deck module; renderer must align/repeat only on bridge tiles."""
    E.base(1, 1, 'concrete_dark')
    for k in range(7):
        E.b('deck_' + str(k), (.12, 1, .045), (-.43 + k * .145, 0, .055), 'metal' if k % 3 == 0 else 'concrete', bevel=.006)
    for side in (-1, 1):
        E.b('edge_beam_' + str(side), (1, .07, .14), (0, side * .465, .09), 'metal', bevel=.01)
        for x in (-.43, .43):
            E.c(f'rail_post_{side}_{x}', .02, .29, (x, side * .465, .28), 'metal', verts=8)
        E.rod('handrail_' + str(side), (-.49, side * .465, .425), (.49, side * .465, .425), .02)
    E.b('center_dash', (.42, .035, .005), (0, 0, .082), 'amber', bevel=0)


def wreck(E):
    E.size = (1.6, 1.1)
    E.pr('burned_hull', [(-.69, .07), (.68, .06), (.57, .23), (.12, .32), (-.62, .25)], .59,
         'concrete_dark', loc=(0, 0, .015), rot=(.10, -.07, .12), bevel=.02)
    for side in (-1, 1):
        for x in (-.46, .35):
            E.c(f'burned_wheel_{side}_{x}', .14, .075, (x, side * .35, .14), 'dark', rot=(math.pi / 2, 0, .10), verts=12)
    E.b('displaced_turret', (.37, .35, .16), (-.13, .41, .12), 'trim', rot=(.40, .25, .8), bevel=.025)
    E.c('bent_barrel', .025, .51, (.03, .60, .12), 'metal', rot=(0, math.pi / 2, .6), verts=8)
    E.b('missing_roof_hole', (.34, .23, .025), (-.12, -.02, .29), 'dark', rot=(.1, -.07, .12), bevel=.01)


def pylon(E):
    E.size = (1, 1)
    for side in (-1, 1):
        E.b('foot_' + str(side), (.24, .25, .10), (side * .34, 0, .05), 'concrete', bevel=.02)
        E.rod('leg_' + str(side), (side * .34, 0, .1), (side * .10, 0, 1.75), .022)
    for k in range(6):
        z = .24 + k * .25
        w = .32 - k * .037
        E.rod('brace_up_' + str(k), (-w, 0, z), (w - .035, 0, z + .25), .012)
        E.rod('brace_dn_' + str(k), (w, 0, z), (-w + .035, 0, z + .25), .012)
    for k, z in enumerate((1.35, 1.64)):
        E.b('crossarm_' + str(k), (1.1, .07, .06), (0, 0, z), 'metal', bevel=.008)
        for side in (-1, 1):
            for j in range(3):
                E.c(f'insulator_{k}_{side}_{j}', .044, .025, (side * .44, 0, z + .055 + j * .028), 'pale', verts=10)


def breakable_wall(E, heavy=False):
    E.base(2 if heavy else 1, 2 if heavy else 1, 'sand')
    if heavy:
        # Broad solid mass, visibly stronger than a sparse light panel. The
        # upper silhouette stays low; no automatic line-of-sight rule implied.
        for i, y in enumerate((-.57, .57)):
            E.b('precast_' + str(i), (1.70, .24, .64), (0, y, .36), 'concrete', bevel=.026, detach=i == 0)
            for x in (-.70, 0, .70):
                E.b(f'buttress_{i}_{x}', (.16, .39, .42), (x, y, .25), 'concrete_dark', bevel=.017)
        E.b('binding_crossbar', (.15, 1.38, .22), (0, 0, .18), 'concrete', bevel=.016)
        E.rubble_state(73, 20)
    else:
        for side in (-1, 1):
            E.b('post_' + str(side), (.10, .13, .48), (side * .36, 0, .28), 'wood', bevel=.012)
        for k in range(4):
            E.b('panel_' + str(k), (.77, .07, .075), (0, 0, .15 + k * .105), 'wood' if k % 2 else 'rust',
                bevel=.009, detach=k > 1)
        E.b('light_marker', (.20, .025, .075), (0, -.05, .45), 'amber', bevel=.004, detach=True)
        E.rubble_state(17, 9)
    E.hp('label', (0, 0, .83 if heavy else .64))


def relay(E, command=False):
    E.base(2.3 if command else 1.5, 2.3 if command else 1.5, 'concrete_dark')
    E.b('equipment_cabinet', (.60, .55, .65), (-.29, .10, .36), 'olive', bevel=.027)
    E.b('cabinet_face', (.53, .025, .50), (-.29, -.185, .36), 'trim', bevel=.008)
    for k in range(5):
        E.b('vent_' + str(k), (.42, .032, .017), (-.29, -.205, .25 + k * .067), 'metal', bevel=.003)
    E.c('mast', .035, 1.10, (.31, .21, .63), 'metal', verts=10)
    for side in (-1, 1):
        E.rod('mast_brace_' + str(side), (.31, .21, .95), (.31 + side * .31, .21, .06), .014)
    dish = E.e('dish_head', (.31, .21, 1.10))
    dish.rotation_euler = (0, -.60, -.40)
    # Layered shallow cones form a dish without a borrowed mesh or texture.
    E.c('dish_bowl', .30 if command else .23, .07, (0, 0, 0), 'pale', dish, radius_top=.10, verts=20, bevel=.005)
    E.c('dish_face', .29 if command else .22, .012, (0, 0, -.04), 'metal', dish, verts=20, bevel=.003)
    E.c('feed', .018, .23, (0, 0, -.14), 'pale', dish, verts=8)
    E.b('status_plaque', (.28, .031, .14), (-.29, -.205, .69), 'amber', bevel=.007)
    if command:
        container(E, 'command_module', (.34, -.63, .05), (1.56, .72, .66), 'pale')
        for side in (-1, 1):
            E.c('antenna_' + str(side), .013, .67, (.10 + side * .53, -.63, 1.03), 'metal', verts=6)
        E.b('command_header', (.42, .03, .15), (.20, -1.006, .67), 'amber', bevel=.006)
    E.hp('objective', (0, 0, 1.45))


def depot(E):
    E.base(3, 3, 'concrete_dark')
    container(E, 'depot_store', (0, .50, .045), (2.38, .93, .83), 'olive')
    for x in (-1.05, 1.05):
        E.c('awning_post_' + str(x), .026, .81, (x, -.86, .45), 'metal', verts=8)
    E.b('loading_awning', (2.58, 1.07, .07), (0, -.42, .93), 'pale', rot=(.05, 0, 0), bevel=.015)
    E.crate('depot_crate_a', -.65, -.62, .035, .39)
    E.crate('depot_crate_b', -.18, -.61, .035, .33, 'rust')
    E.b('loading_bay', (.70, .63, .014), (.72, -.62, .04), 'metal', bevel=.015)
    E.hp('objective', (0, 0, 1.28))


def editor_marker(E, region=False):
    E.size = (1.0, 1.0)
    if region:
        for x in (-1, 1):
            for y in (-1, 1):
                E.b(f'corner_x_{x}_{y}', (.25, .042, .007), (x * .345, y * .46, .006), 'amber', bevel=0)
                E.b(f'corner_y_{x}_{y}', (.042, .25, .007), (x * .46, y * .345, .006), 'amber', bevel=0)
    else:
        E.sl('spawn_arrow', [(.43, 0), (-.02, .28), (-.02, .11), (-.36, .11), (-.36, -.11), (-.02, -.11), (-.02, -.28)],
             .004, .010, 'amber', bevel=0)
        for k in range(8):
            a = k * math.tau / 8
            E.b('ring_' + str(k), (.19, .032, .006), (.45 * math.cos(a), .45 * math.sin(a), .006), 'pale',
                rot=(0, 0, a + math.pi / 2), bevel=0)


KINDS = {'supply_station_neutral': station, 'central_shipment_site': shipment,
         'palm': palm, 'forest_edge_scrub': forest_edge, 'fence_chainlink': fence,
         'concrete_barrier': barrier, 'container_stack': containers, 'fuel_tanks': fuel_tanks,
         'warehouse_garrisonable': building, 'ruined_house_garrisonable': lambda e: building(e, ruined=True),
         'decor_building_nongarrison': lambda e: building(e, sealed=True), 'bridge_permanent': bridge,
         'wreck_decor_vehicle': wreck, 'power_pylon': pylon,
         'destructible_wall_hp_light': breakable_wall,
         'destructible_wall_hp_heavy': lambda e: breakable_wall(e, heavy=True),
         'relay_objective': relay, 'command_relay_objective': lambda e: relay(e, command=True),
         'depot_objective': depot, 'spawn_marker_editor': editor_marker,
         'region_marker_editor': lambda e: editor_marker(e, region=True)}


def build(faction, params):
    if faction is not None:
        raise ValueError('Environment props have no faction/team palette')
    E = Environment(params['prop'])
    KINDS[E.kind](E)
    rig = fclib.Rig(E.root)
    rig.environment = E
    rig.parts = {'prop': E.always + E.intact + E.damage_only + E.rubble}
    rig.hardpoints = E.hardpoints
    objects, pending = [], [E.root]
    while pending:
        obj = pending.pop()
        objects.append(obj)
        pending.extend(obj.children)
    rig.original = {o: (tuple(o.location), tuple(o.rotation_euler), tuple(o.scale)) for o in objects}
    return rig


def pose(rig, state, frame, direction):
    E = rig.environment
    for obj, (loc, rotation, scale) in rig.original.items():
        obj.location, obj.rotation_euler, obj.scale = loc, rotation, scale
    E.root.rotation_euler = (0, 0, fclib.heading_to_blender_z(direction, state['directions']))
    fclib.set_char_all(0)
    fclib.set_grime_all(0)
    fclib.set_emission_scale(1)
    name = state['name']
    visible = E.always + E.intact
    if E.kind == 'bridge_permanent' and name != 'idle':
        # Shared crossings can be wider than one tile. Interior modules must
        # not acquire decorative rails across their legally traversable deck.
        def keep_bridge(obj):
            rail = obj.name.startswith(('edge_beam_', 'rail_post_', 'handrail_'))
            if not rail:
                return True
            if name == 'deck':
                return False
            suffix = '-1' if name == 'edge_left' else '1'
            return obj.name.startswith(('edge_beam_' + suffix, 'rail_post_' + suffix + '_', 'handrail_' + suffix))
        visible = [o for o in visible if keep_bridge(o)]
    if name == 'damaged':
        fclib.set_char_all(.26)
        fclib.set_grime_all(.55)
        visible = E.always + [o for o in E.intact if o not in E.detach] + E.damage_only
    elif name == 'destroyed':
        fclib.set_char_all(.72)
        fclib.set_grime_all(.80)
        fclib.set_emission_scale(0)
        visible = E.always + E.rubble
    return visible, [] if E.kind.endswith('_editor') else visible
