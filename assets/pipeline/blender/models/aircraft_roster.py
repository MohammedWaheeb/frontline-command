"""Eleven original aircraft variants, authored by Codex during Claude quota.

Uses Claude Code claude-opus-5-5's fclib material/projection contract. The accepted
IR.strike source remains drone_fixed.py. No imported meshes, logos or insignia.

US: compact paired-tail air-control jet, broad precision bomber, narrow tandem
gunship and unmistakable tandem-rotor troop transport. SA: pale, weighty delta
fighter / swept strike jet and armoured wide-cabin escort helicopter. Iran:
small canopy-free interceptor, twin ducted-fan loiter platform and long-wing
survey craft. Syria: repaired, unarmed quadrotor; never a disguised civilian.

All flight poses are authored near ground level; the renderer applies cosmetic
altitude from the Go-authorized actor state. Gear, rotor run-up, service hatches,
payload disappearance, banking and terminal damage are presentation only.
Each pose restores every transform. All geometry uses +X forward / ground (0,0).
"""
import math
import fclib
from fclib import box, cyl, slab, prism, sphere, empty, mat

TAU = math.tau


class Airframe:
    def __init__(self, faction, kind):
        self.faction, self.kind = faction, kind
        self.m = fclib.faction_mats(faction)
        self.m.update(alloy=mat('ar_alloy', '#A6A89C', rough=.46, metal=.55, grime=.18),
                      soot=mat('ar_soot', '#303431', rough=.86, grime=.3),
                      payload=mat('ar_payload', '#CCC7B2', rough=.52, grime=.2),
                      tip=mat('ar_payload_tip', '#6B6250', rough=.55, grime=.2),
                      primer=mat('ar_primer', '#74705B', rough=.85, grime=.45),
                      flash=mat('ar_flash', '#FFD7A0', emission='#FFC05C', emission_strength=12, grime=0),
                      rotorblur=mat('ar_rotor_blur', '#9A9D91', rough=.75, grime=0, alpha=.09),
                      exhaust=mat('ar_exhaust', '#9D612B', emission='#FFBD64', emission_strength=3, grime=0))
        self.root = empty('root')
        self.body = empty('airframe', parent=self.root)
        self.parts, self.gear, self.rotors, self.panels = [], [], [], []
        self.payloads, self.losses, self.doors = [], [], []
        self.effects, self.hardpoints = {}, {}
        self.rotor_kind = False

    def add(self, obj, fx=None, loss=False):
        (self.effects.setdefault(fx, []) if fx else self.parts).append(obj)
        if loss:
            self.losses.append(obj)
        return obj

    def b(self, name, size, loc=(0, 0, 0), material='paint', parent=None, fx=None, loss=False, **kw):
        return self.add(box(name, size, loc=loc, material=self.m[material], parent=parent or self.body, **kw), fx, loss)

    def c(self, name, r, depth, loc=(0, 0, 0), material='paint', parent=None, fx=None, loss=False, **kw):
        return self.add(cyl(name, r, depth, loc=loc, material=self.m[material], parent=parent or self.body, **kw), fx, loss)

    def s(self, name, r, loc=(0, 0, 0), material='paint', parent=None, fx=None, loss=False, **kw):
        return self.add(sphere(name, r, loc=loc, material=self.m[material], parent=parent or self.body, **kw), fx, loss)

    def sl(self, name, poly, z0, z1, material='paint', parent=None, loss=False, **kw):
        return self.add(slab(name, poly, z0, z1, material=self.m[material], parent=parent or self.body, **kw), loss=loss)

    def pr(self, name, profile, depth, material='paint', parent=None, **kw):
        return self.add(prism(name, profile, depth, material=self.m[material], parent=parent or self.body, **kw))

    def e(self, name, loc=(0, 0, 0), parent=None):
        return empty(name, loc=loc, parent=parent or self.body)

    def hp(self, name, loc, parent=None):
        obj = self.e('hp_' + name, loc, parent)
        obj['fc_parts'] = ['body']
        self.hardpoints[name] = obj

    def panel(self, name, loc, size, side=1):
        hinge = self.e(name + '_hinge', loc)
        self.b(name, size, (0, side * size[1] / 2, 0), 'paint2', hinge, bevel=.007)
        self.b(name + '_latch', (.04, .03, .014), (.06, side * size[1] * .8, .012), 'alloy', hinge, bevel=.003)
        self.panels.append((hinge, side))

    def undercarriage(self, name, loc, size=.06):
        # Pivot lies on airframe belly. The whole strut retracts inside the body.
        hinge = self.e(name + '_hinge', loc)
        self.c(name + '_strut', .012, .13, (0, 0, -.065), 'alloy', hinge, verts=8, bevel=.004)
        self.c(name + '_tyre', size, .04, (0, 0, -.15), 'dark', hinge, rot=(math.pi / 2, 0, 0), verts=14, bevel=.008)
        self.c(name + '_hub', size * .48, .046, (0, 0, -.15), 'alloy', hinge, rot=(math.pi / 2, 0, 0), verts=10)
        self.gear.append(hinge)

    def missile(self, name, loc, length=.34, wide=False):
        mount = self.e(name + '_root', loc)
        before = len(self.parts)
        radius = .033 if wide else .021
        self.c(name + '_body', radius, length, (0, 0, 0), 'payload', mount,
               rot=(0, math.pi / 2, 0), verts=12, bevel=.003)
        self.c(name + '_tip', radius, .08, (length / 2 + .035, 0, 0), 'tip', mount,
               rot=(0, math.pi / 2, 0), radius_top=.003, verts=12, bevel=.001)
        for k in range(2):
            self.b(name + '_fin' + str(k), (.09, .105 if k == 0 else .012, .012 if k == 0 else .105),
                   (-length / 2 + .05, 0, 0), 'paint2', mount, bevel=.003)
        self.payloads.append((mount, self.parts[before:]))
        self.c(name + '_plume', radius * 1.6, .21, (-length / 2 - .10, 0, 0), 'flash', mount,
               fx=name + '_plume', rot=(0, -math.pi / 2, 0), radius_top=.004, verts=10, bevel=0)
        return mount

    def rotor(self, name, loc, radius, blades=4, parent=None, axis='z', duct=False):
        mast = self.e(name + '_mast', loc, parent)
        if axis == 'x':
            mast.rotation_euler = (0, math.pi / 2, 0)
        elif axis == 'y':
            mast.rotation_euler = (math.pi / 2, 0, 0)
        if duct:
            # Segmented, visibly hollow protective rim. No opaque cylinder lid.
            for k in range(16):
                a = TAU * k / 16
                self.b(name + f'_rim{k}', (radius * .40, .035, .10),
                       (-radius * math.sin(a), radius * math.cos(a), 0), 'paint2', mast,
                       rot=(0, 0, a), bevel=.008)
        spin = self.e(name + '_spin', parent=mast)
        self.c(name + '_hub', .035, .05, (0, 0, .02), 'metal', spin, verts=12)
        blade_objs = []
        for k in range(blades):
            a = TAU * k / blades
            blade_objs.append(self.b(name + f'_blade{k}', (radius * .82, .045, .013),
                                    (radius * .52 * math.cos(a), radius * .52 * math.sin(a), .015),
                                    'dark', spin, rot=(0, 0, a), taper=(.88, .6), bevel=.003,
                                    loss=k == 0))
            self.b(name + f'_blade_tip{k}', (.055, .043, .014),
                   (radius * .88 * math.cos(a), radius * .88 * math.sin(a), .015),
                   'team', spin, rot=(0, 0, a), bevel=.002, loss=k == 0)
        blur = self.c(name + '_blur', radius * .96, .002, (0, 0, .016), 'rotorblur', mast,
                      fx='rotor_blur', verts=32, bevel=0)
        self.rotors.append((spin, blade_objs, blur))
        return mast


def jet(A, style):
    """Four purpose-built wing plans, canopy profiles, intakes and tail groups."""
    fighter = A.kind.endswith('.fighter')
    us = style == 'US'
    length = 1.86 if us and fighter else 2.04 if us else 1.91 if fighter else 2.12
    nose, tail = length * .56, -length * .44
    width = .18 if fighter else .23
    A.sl('fuselage', [(nose, 0), (nose - .26, width * .46), (.18, width),
                      (tail + .10, width * .78), (tail, .09), (tail, -.09),
                      (tail + .10, -width * .78), (.18, -width), (nose - .26, -width * .46)],
         .21, .43, top_scale=.72, top_shift=(.04, 0), bevel=.022)
    A.pr('keel', [(tail, .24), (nose - .16, .23), (.65, .15), (-.55, .13)], .17, 'paint2', bevel=.012)
    A.sl('radome', [(nose + .045, 0), (nose - .22, .065), (nose - .22, -.065)], .25, .33, 'trim', bevel=.012)
    canopy_len = .38 if fighter else .51
    A.pr('canopy_sill', [(.19, .40), (.19, .43), (.38, .56), (.19 + canopy_len, .49), (.24 + canopy_len, .40)],
         .145 if fighter else .18, 'trim', bevel=.007)
    A.pr('canopy', [(.22, .43), (.37, .535), (.17 + canopy_len, .475), (.20 + canopy_len, .43)],
         .13 if fighter else .16, 'glass', bevel=.007)
    if not fighter:
        A.b('canopy_frame', (.025, .17, .055), (.44, 0, .493), 'alloy', rot=(0, -.15, 0), bevel=.004)
    if us and fighter:
        # Narrow cranked arrow wing and wide-set canted fins.
        wing = [( .38, 0), (.05, .45), (-.36, .91), (-.64, .88), (-.40, .43), (-.48, 0)]
    elif us:
        # Broad clipped strike wing, substantially wider and less swept than
        # the compact air-control arrow. Readable even without paint or load.
        wing = [(.16, 0), (.10, .61), (-.06, 1.20), (-.40, 1.16), (-.38, .45), (-.55, 0)]
    elif fighter:
        # Compact double-delta outline; high canards distinguish from US arrow.
        wing = [(.47, 0), (.17, .30), (-.47, .89), (-.70, .85), (-.68, .12), (-.65, 0)]
    else:
        wing = [(.12, 0), (-.11, .48), (-.48, 1.06), (-.78, .98), (-.43, .22), (-.54, 0)]
    for side in (1, -1):
        A.sl('wing_' + str(side), [(x, y * side) for x, y in wing], .28, .32, bevel=.009,
             loss=side == -1)
        A.b('wing_team_' + str(side), (.18, .07, .015), (-.36 if fighter else -.46, side * .65, .328),
            'team', rot=(0, 0, .45 * side), bevel=.003)
        # Engine trunks and lip/inlet faces create dark cut-outs rather than decals.
        A.b('engine_' + str(side), (.89, .14, .16), (-.34, side * .17, .29), 'paint2', bevel=.035)
        A.b('intake_lip_' + str(side), (.13, .16, .145), (.13, side * .18, .28), 'trim', taper=(.78, .8), bevel=.012)
        A.b('intake_' + str(side), (.017, .108, .091), (.203, side * .18, .283), 'soot', bevel=.007)
        A.c('nozzle_' + str(side), .072, .10, (tail + .04, side * .17, .28), 'metal',
            rot=(0, math.pi / 2, 0), verts=12, bevel=.008)
        A.c('nozzle_dark_' + str(side), .054, .011, (tail - .016, side * .17, .28), 'soot',
            rot=(0, math.pi / 2, 0), verts=12, bevel=0)
        A.c('exhaust_' + str(side), .041, .07, (tail - .044, side * .17, .28), 'exhaust',
            fx='exhaust', rot=(0, math.pi / 2, 0), verts=12, bevel=0)
        if us or not fighter:
            A.pr('fin_' + str(side), [(-.78, .35), (-.44, .36), (-.59, .72), (-.72, .69)], .026,
                 parent=A.body, loc=(0, side * .18, 0), rot=(side * -.20 if us else side * -.08, 0, 0),
                 bevel=.005)
        if not us and fighter:
            A.sl('canard_' + str(side), [(.53, side * .11), (.38, side * .40), (.24, side * .35), (.32, side * .11)],
                 .42, .445, 'paint2', bevel=.005)
        if us:
            A.sl('tailplane_' + str(side), [(-.59, .08 * side), (-.69, .45 * side), (-.94, .43 * side), (-.82, .10 * side)],
                 .31, .34, 'paint2', bevel=.006)
        A.b('pylon_' + str(side), (.16, .035, .09), (-.05, side * .40, .235), 'trim', bevel=.005)
        A.missile('payload_' + str(side), (-.035, side * .40, .18), length=.35 if fighter else .43, wide=not fighter)
        A.undercarriage('main_gear_' + str(side), (-.24, side * .19, .23), .06)
        A.panel('service_' + str(side), (-.32, side * .16, .43), (.30, .10, .018), side)
    if not us and fighter:
        A.pr('single_keel_fin', [(-.78, .35), (-.44, .35), (-.62, .76), (-.79, .70)], .035, bevel=.006)
        A.b('fin_team', (.11, .04, .09), (-.67, 0, .62), 'team', rot=(0, -.2, 0), bevel=.004)
    A.undercarriage('nose_gear', (.55, 0, .23), .05)
    A.b('spine_team', (.24, .07, .018), (-.20, 0, .438), 'team', bevel=.003)
    A.hp('release', (-.02, 0, .16))
    A.hp('muzzle', (.88, .07, .24))
    A.hp('healthbar', (0, 0, .86))


def helicopter(A, heavy=False):
    A.rotor_kind = True
    width = .24 if heavy else .16
    A.pr('fuselage', [(-.48, .17), (.43, .16), (.77, .29), (.70, .43), (.27, .66), (-.28, .62), (-.55, .38)],
         width * 2, bevel=.026)
    for side in (1, -1):
        A.pr('canopy_' + str(side), [(.16, .47), (.31, .62), (.66, .42), (.55, .32)], .014, 'glass',
             loc=(0, side * (width + .008), 0), bevel=.006)
        A.b('canopy_frame_' + str(side), (.025, .015, .23), (.32, side * (width + .018), .47), 'alloy',
            rot=(0, .50, 0), bevel=.003)
        A.b('cheek_armour_' + str(side), (.42, .07, .15), (.10, side * width, .26), 'paint2',
            taper=(.80, .85), bevel=.016)
        A.sl('stub_wing_' + str(side), [(.13, side * width), (-.02, side * .56), (-.26, side * .52), (-.28, side * width)],
             .33, .37, bevel=.01)
        A.b('wing_team_' + str(side), (.15, .065, .016), (-.09, side * .46, .38), 'team', bevel=.003)
        A.c('engine_' + str(side), .095, .46, (-.21, side * .15, .64), 'paint2',
            rot=(0, math.pi / 2, 0), verts=12, bevel=.012)
        A.c('exhaust_' + str(side), .062, .055, (-.46, side * .15, .64), 'soot',
            rot=(0, math.pi / 2, 0), verts=12)
        A.panel('engine_access_' + str(side), (-.21, side * .18, .70), (.27, .13, .02), side)
        # Finite payload groups are removed by empty/fire; mounting rails remain.
        A.b('weapon_rail_' + str(side), (.25, .09, .035), (-.10, side * .42, .29), 'trim', bevel=.008)
        A.missile('payload_' + str(side), (-.08, side * .42, .225), .29)
        A.undercarriage('main_gear_' + str(side), (-.20, side * .26, .22), .065)
    A.c('tail_boom', .07, 1.0, (-.86, 0, .40), 'paint2', rot=(0, math.pi / 2, 0), radius_top=.13, verts=12)
    A.pr('tail_fin', [(-1.30, .37), (-1.43, .73), (-1.28, .81), (-1.15, .41)], .027, bevel=.007)
    A.sl('tailplane', [(-1.05, -.31), (-1.16, -.31), (-1.23, .31), (-1.10, .31)], .40, .425, 'paint2', bevel=.005)
    A.rotor('main_rotor', (-.15, 0, .79), .99 if heavy else .92, 5 if heavy else 4)
    A.rotor('tail_rotor', (-1.30, -.08, .58), .17 if heavy else .14, 5 if heavy else 4, axis='y', duct=heavy)
    A.undercarriage('nose_gear', (.46, 0, .23), .055)
    gun = A.e('chin_gun', (.50, 0, .18))
    A.s('chin_turret', .10, (0, 0, 0), 'paint2', gun, scale=(1.15, .9, .7))
    A.c('chin_barrel', .017, .29, (.20, 0, -.015), 'metal', gun, rot=(0, math.pi / 2, 0), verts=10)
    A.c('chin_flash', .045, .11, (.40, 0, -.015), 'flash', gun, fx='flash',
        rot=(0, math.pi / 2, 0), radius_top=.008, verts=10, bevel=0)
    A.hp('muzzle', (.40, 0, -.015), gun)
    A.hp('release', (-.08, 0, .225))
    A.hp('healthbar', (-.15, 0, .99))


def airlift(A):
    """Long troop cabin, tandem rotor stations, clear rear cargo ramp and doors."""
    A.rotor_kind = True
    A.pr('cabin', [(-.85, .19), (.63, .17), (.96, .30), (.78, .59), (.42, .70), (-.76, .70), (-.97, .45)],
         .54, bevel=.035)
    A.pr('cockpit', [(.48, .57), (.76, .55), (.91, .33), (.73, .35)], .44, 'glass', bevel=.008)
    A.b('cockpit_center_frame', (.24, .023, .15), (.78, 0, .46), 'paint2', rot=(0, -.55, 0), bevel=.008)
    for side in (1, -1):
        A.b('sponson_' + str(side), (1.15, .15, .17), (-.05, side * .31, .23), 'paint2', taper=(.93, .82), bevel=.035)
        A.b('side_team_' + str(side), (.87, .018, .08), (-.14, side * .283, .56), 'team', bevel=.004)
        for k in range(4):
            A.b(f'window_{side}_{k}', (.095, .016, .095), (.32 - k * .24, side * .279, .45), 'glass', bevel=.013)
        A.undercarriage('front_gear_' + str(side), (.40, side * .30, .22), .067)
        A.undercarriage('rear_gear_' + str(side), (-.60, side * .30, .22), .067)
        A.panel('service_' + str(side), (-.48, side * .19, .72), (.30, .14, .025), side)
        door = A.e('side_door_' + str(side), (.37, side * .285, .30))
        A.b('door_panel_' + str(side), (.22, .021, .24), (0, 0, .12), 'paint2', door, bevel=.008)
        A.b('door_mark_' + str(side), (.14, .024, .035), (0, 0, .12), 'team', door, bevel=.004)
        A.doors.append((door, 'slide', side))
    for name, x, z in (('front', .54, .84), ('rear', -.65, .95)):
        A.b(name + '_pylon', (.27, .22, .20), (x, 0, z - .12), 'paint2', taper=(.85, .9), bevel=.025)
        A.rotor(name + '_rotor', (x, 0, z), .84, blades=3)
    # Dark doorway is part of the body; lowered ramp is an articulated plate.
    A.b('rear_opening', (.025, .38, .31), (-.86, 0, .42), 'soot', bevel=.014)
    ramp = A.e('rear_ramp_hinge', (-.86, 0, .245))
    A.b('rear_ramp', (.032, .43, .34), (0, 0, .17), 'paint2', ramp, bevel=.009)
    for k in range(5):
        A.b('ramp_tread_' + str(k), (.037, .37, .012), (-.004, 0, .05 + k * .056), 'alloy', ramp, bevel=.002)
    A.doors.append((ramp, 'ramp', 1))
    A.hp('board', (.37, -.35, .20))
    A.hp('unload', (-1.10, 0, .07))
    A.hp('healthbar', (0, 0, 1.10))


def interceptor_drone(A):
    """No canopy: compact jet-powered chevron, chin sensor and two AAM rails."""
    A.sl('body', [( .78, 0), (.31, .16), (-.51, .13), (-.68, .055), (-.68, -.055),
                  (-.51, -.13), (.31, -.16)], .16, .32, top_scale=.68, bevel=.018)
    A.sl('wing', [(.24, 0), (-.06, .49), (-.40, .71), (-.65, .60), (-.42, 0),
                  (-.65, -.60), (-.40, -.71), (-.06, -.49)], .22, .25, bevel=.006)
    A.s('sensor', .052, (.56, 0, .15), 'glass', scale=(1.3, 1, .85))
    A.b('link_spine', (.30, .075, .06), (-.03, 0, .33), 'paint2', taper=(.7, .7), bevel=.012)
    A.b('link_team', (.18, .08, .02), (-.035, 0, .361), 'team', bevel=.004)
    A.b('chin_intake', (.10, .15, .095), (-.10, 0, .13), 'trim', taper=(.8, .9), bevel=.012)
    A.b('intake_dark', (.012, .12, .065), (-.044, 0, .13), 'soot', bevel=.005)
    A.c('jet_nozzle', .065, .085, (-.66, 0, .23), 'metal', rot=(0, math.pi / 2, 0), verts=12)
    A.c('jet_inner', .046, .015, (-.708, 0, .23), 'soot', rot=(0, math.pi / 2, 0), verts=12)
    A.c('exhaust', .035, .08, (-.75, 0, .23), 'exhaust', fx='exhaust', rot=(0, math.pi / 2, 0), verts=12)
    for side in (1, -1):
        A.pr('tail_' + str(side), [(-.64, .26), (-.39, .25), (-.53, .48), (-.65, .48)], .021,
             loc=(0, side * .10, 0), rot=(side * -.50, 0, 0), bevel=.005)
        A.b('wing_team_' + str(side), (.16, .065, .014), (-.36, side * .48, .262), 'team', rot=(0, 0, side * .4), bevel=.003)
        A.b('rail_' + str(side), (.24, .025, .04), (-.14, side * .28, .19), 'trim', bevel=.004)
        A.missile('payload_' + str(side), (-.08, side * .28, .145), .27)
        A.undercarriage('main_gear_' + str(side), (-.26, side * .11, .22), .043)
        A.panel('access_' + str(side), (-.04, side * .095, .305), (.20, .065, .015), side)
    A.undercarriage('nose_gear', (.34, 0, .22), .035)
    A.hp('release', (-.08, 0, .145))
    A.hp('healthbar', (0, 0, .61))


def loiter_drone(A):
    """Two ducted coaxial fans, squat sensor pod, visible finite missile rails."""
    A.rotor_kind = True
    A.sl('central_pod', [(.48, 0), (.26, .18), (-.35, .19), (-.48, .08), (-.48, -.08), (-.35, -.19), (.26, -.18)],
         .21, .41, top_scale=.75, bevel=.025)
    A.b('spine', (.40, .12, .07), (-.05, 0, .43), 'paint2', taper=(.8, .8), bevel=.018)
    A.b('spine_team', (.30, .06, .02), (-.05, 0, .474), 'team', bevel=.004)
    A.s('chin_sensor', .085, (.32, 0, .19), 'trim', scale=(1.2, 1, 1))
    A.b('sensor_glass', (.018, .105, .052), (.42, 0, .19), 'lens', bevel=.004)
    for side in (1, -1):
        A.b('fan_arm_' + str(side), (.19, .46, .07), (-.04, side * .32, .32), 'paint2', bevel=.012)
        A.rotor('fan_' + str(side), (-.04, side * .57, .38), .31, blades=4, duct=True)
        A.b('fan_team_' + str(side), (.20, .04, .026), (-.04, side * .89, .40), 'team', bevel=.004)
        A.b('rail_' + str(side), (.42, .05, .04), (-.02, side * .18, .19), 'trim', bevel=.005)
        A.missile('payload_' + str(side), (.015, side * .18, .15), .32)
        A.undercarriage('gear_' + str(side), (-.20, side * .17, .21), .045)
        A.panel('service_' + str(side), (-.16, side * .08, .40), (.22, .10, .016), side)
    A.undercarriage('front_gear', (.24, 0, .21), .04)
    A.hp('release', (.02, 0, .15))
    A.hp('healthbar', (0, 0, .64))


def survey(A):
    """High-aspect observation glider, conspicuous dorsal link and belly camera."""
    A.sl('fuselage', [(.68, 0), (.48, .09), (-.59, .06), (-.74, 0), (-.59, -.06), (.48, -.09)],
         .17, .30, top_scale=.60, bevel=.015)
    A.sl('long_wing', [(.12, 0), (.04, 1.10), (-.06, 1.14), (-.19, 1.10), (-.17, 0),
                       (-.19, -1.10), (-.06, -1.14), (.04, -1.10)], .25, .273, bevel=.005)
    A.s('datalink_dome', .085, (.16, 0, .31), 'paint2', scale=(1.5, .85, .65))
    A.s('camera_turret', .065, (.35, 0, .14), 'trim', scale=(1.1, 1, 1))
    A.b('camera_lens', (.01, .060, .043), (.415, 0, .14), 'lens', bevel=.002)
    for side in (1, -1):
        A.b('wing_team_' + str(side), (.18, .15, .012), (-.045, side * .89, .281), 'team', bevel=.002)
        A.sl('v_tail_' + str(side), [(-.51, 0), (-.65, .30 * side), (-.82, .26 * side), (-.71, 0)],
             .19, .21, 'paint2', rot=(side * .45, 0, 0), bevel=.004)
        A.undercarriage('gear_' + str(side), (-.20, side * .075, .21), .03)
        A.panel('link_access_' + str(side), (.03, side * .05, .295), (.14, .055, .012), side)
    A.rotor('pusher', (-.64, 0, .245), .16, blades=2, axis='x')
    A.undercarriage('nose_gear', (.38, 0, .21), .028)
    A.hp('sensor', (.415, 0, .14))
    A.hp('healthbar', (0, 0, .50))


def scout_quad(A):
    """Small unarmed X-frame, repaired plates, visible camera and four motors."""
    A.rotor_kind = True
    A.b('body', (.39, .27, .13), (0, 0, .24), 'paint2', taper=(.80, .8), bevel=.026)
    A.b('battery', (.20, .12, .09), (-.07, 0, .335), 'primer', bevel=.012)
    A.b('battery_strap', (.035, .14, .10), (-.07, 0, .335), 'trim', bevel=.005)
    A.b('team_plate', (.16, .11, .018), (.085, 0, .32), 'team', bevel=.004)
    A.s('camera', .055, (.18, 0, .16), 'trim', scale=(1.2, 1, .85))
    A.b('camera_lens', (.012, .055, .035), (.245, 0, .16), 'glass', bevel=.003)
    for x in (1, -1):
        for side in (1, -1):
            name = f'motor_{x}_{side}'
            A.b(name + '_arm', (.45, .048, .035), (x * .19, side * .17, .245),
                'primer' if x == -1 and side == 1 else 'metal', rot=(0, 0, side * x * .72), bevel=.008)
            A.c(name + '_pod', .052, .07, (x * .34, side * .30, .265), 'paint2', verts=12)
            A.rotor(name, (x * .34, side * .30, .305), .225, blades=2)
            A.b(name + '_foot', (.035, .035, .15), (x * .23, side * .19, .11), 'trim', bevel=.004)
    A.panel('service', (-.04, -.07, .395), (.18, .13, .014), -1)
    A.hp('sensor', (.245, 0, .16))
    A.hp('healthbar', (0, 0, .51))


KINDS = {'US.fighter': lambda a: jet(a, 'US'), 'US.strike': lambda a: jet(a, 'US'),
         'US.gunship': helicopter, 'US.airlift': airlift,
         'IR.fighter': interceptor_drone, 'IR.gunship': loiter_drone, 'IR.isr': survey,
         'SY.scout_drone': scout_quad,
         'SA.fighter': lambda a: jet(a, 'SA'), 'SA.strike': lambda a: jet(a, 'SA'),
         'SA.gunship': lambda a: helicopter(a, heavy=True)}


def build(faction, params):
    kind = params['kind']
    if kind not in KINDS or not kind.startswith(faction + '.'):
        raise ValueError('Unknown aircraft/faction: ' + kind)
    A = Airframe(faction, kind)
    KINDS[kind](A)
    rig = fclib.Rig(A.root)
    rig.airframe = A
    rig.parts = {'body': list(A.parts)}
    rig.hardpoints = dict(A.hardpoints)
    objects, stack = [], [A.root]
    while stack:
        obj = stack.pop()
        objects.append(obj)
        stack.extend(obj.children)
    rig.original = {o: (tuple(o.location), tuple(o.rotation_euler), tuple(o.scale)) for o in objects}
    return rig


def pose(rig, state, frame, direction):
    A = rig.airframe
    for obj, (loc, rot, scale) in rig.original.items():
        obj.location, obj.rotation_euler, obj.scale = loc, rot, scale
    name, count = state['name'], max(1, state['frames'])
    phase, progress = frame / count, (frame + 1) / count
    A.root.rotation_euler = (0, 0, fclib.heading_to_blender_z(direction, state['directions']))
    fclib.set_grime_all(0)
    fclib.set_char_all(0)
    fclib.set_emission_scale(1)
    hidden, effects = set(), set()
    parked = name in ('parked', 'rearm')
    ground_fraction = 1.0 if parked else 0.0
    if name in ('takeoff', 'launch'):
        ground_fraction = 1 - progress
    elif name in ('landing', 'recover'):
        ground_fraction = progress
    elif name == 'hover_low_board':
        ground_fraction = 1.0
    for gear in A.gear:
        gear.rotation_euler = (0, (1 - ground_fraction) * 1.4, 0)
    if not parked:
        A.body.location = (0, 0, .018 * math.sin(phase * TAU) if A.rotor_kind else .012 + .006 * math.cos(phase * TAU))
        effects.add('rotor_blur')
        effects.add('exhaust')
        fclib.set_emission_scale(.85 + .15 * math.cos(phase * TAU))
    for index, (spin, blades, blur) in enumerate(A.rotors):
        # One blade spacing per loop avoids the identical four-blade pose at
        # every 90-degree sample (a stroboscopic frozen rotor).
        spin.rotation_euler = (0, 0, (.17 if parked else phase * TAU / len(blades) + index * .31))
    if name in ('move', 'fly') and A.rotor_kind:
        A.body.rotation_euler = (0, .065, 0)
    if name in ('bank_left', 'bank_right', 'orbit'):
        sign = -1 if name in ('bank_left', 'orbit') else 1
        A.body.rotation_euler = (sign * (.25 if A.rotor_kind else .32), .015, 0)
    if name in ('takeoff', 'launch'):
        A.body.rotation_euler = (0, -.085 * math.sin(progress * math.pi), 0)
    if name in ('landing', 'recover'):
        A.body.rotation_euler = (0, -.045 * math.sin(progress * math.pi), 0)
    if name == 'hover_low_board':
        for door, motion, side in A.doors:
            if motion == 'ramp':
                door.rotation_euler = (0, -1.38, 0)
            else:
                x, y, z = rig.original[door][0]
                door.location = (x - .24, y + side * .025, z)
    if name == 'rearm':
        for hinge, side in A.panels:
            hinge.rotation_euler = (side * 1.10, 0, 0)
        for _, pieces in A.payloads:
            if frame < count // 2:
                hidden.update(pieces)
    if name == 'empty':
        for _, pieces in A.payloads:
            hidden.update(pieces)
    if name == 'fire':
        if A.rotor_kind:
            effects.add('flash')
        for index, (mount, pieces) in enumerate(A.payloads):
            if index <= frame:
                hidden.update(pieces)
        # Projectile sprites/trails are separate Go event effects; do not bake
        # a second long-lived projectile into a moving aircraft plate.
    if name == 'damaged':
        fclib.set_grime_all(.60)
        fclib.set_char_all(.30)
        # Preserve wing plan in live damage; critical failure is reserved crash.
    if name == 'crash':
        fclib.set_grime_all(.80)
        fclib.set_char_all(.55 + .40 * progress)
        fclib.set_emission_scale(0)
        A.body.location = (0, 0, -.12 * progress)
        A.body.rotation_euler = (.28 * progress, .12 * progress, .16 * progress)
        effects.clear()
        hidden.update(A.losses)
        for _, pieces in A.payloads:
            hidden.update(pieces)
        for gear in A.gear:
            gear.rotation_euler = (.35, 1.0, .25)
    solid = [o for o in A.parts if o not in hidden]
    fx = [o for key in sorted(effects) for o in A.effects.get(key, [])]
    return solid + fx, solid
