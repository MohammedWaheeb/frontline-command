"""Original faction engineering rigs and supply haulers.

Authored by Codex during the user-authorized Claude quota takeover. Extends the
Claude-authored fclib projection/material contract; no borrowed model meshes.
Every faction has separate work machinery and cargo/body construction, while
wheels, frame rails and fasteners share small procedural construction helpers.
The sim position is always the ground anchor; +X is vehicle forward.
"""
import math

from mathutils import Vector

import fclib
from fclib import box, cyl, empty, mat, prism, slab


class Builder:
    def __init__(self, faction, role):
        self.faction, self.role = faction, role
        self.m = fclib.faction_mats(faction)
        self.m['brass'] = mat('logistics_brass', '#AB8C49', metal=0.45, rough=0.5, grime=0.2)
        self.m['steel'] = mat('logistics_bright_steel', '#93948A', metal=0.7, rough=0.38, grime=0.2)
        self.m['primer'] = mat('logistics_oxide_primer', '#775347', rough=0.85, grime=0.4)
        self.m['pallet'] = mat('logistics_pallet', '#877451', rough=0.9, grime=0.45)
        self.m['rope'] = mat('logistics_rope', '#A59066', rough=1.0, grime=0.4)
        self.root = empty('root')
        self.body = empty('chassis_root', parent=self.root)
        self.meshes, self.cargo, self.wheels, self.tracks = [], [], [], []
        self.fragile, self.outriggers = [], []
        self.arm, self.elbow, self.tool, self.mast = None, None, None, None
        self.bed, self.gate, self.hook = None, None, None
        self.special = {}

    def b(self, name, size, loc, material='paint', parent=None, cargo=False, **kw):
        ob = box(name, size, loc=loc, material=self.m[material], parent=parent or self.body, **kw)
        (self.cargo if cargo else self.meshes).append(ob)
        return ob

    def c(self, name, radius, depth, loc, material='metal', parent=None, cargo=False, **kw):
        ob = cyl(name, radius, depth, loc=loc, material=self.m[material], parent=parent or self.body, **kw)
        (self.cargo if cargo else self.meshes).append(ob)
        return ob

    def beam(self, name, a, b, width, material='metal', parent=None):
        av, bv = Vector(a), Vector(b)
        delta = bv - av
        ob = self.b(name, (width, width, delta.length), tuple((av + bv) / 2), material,
                    parent, bevel=min(0.005, width / 5))
        ob.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
        return ob

    def wheel(self, name, x, side, radius, half_width):
        ob = self.c(name, radius, 0.13, (x, side * half_width, radius), 'dark',
                    rot=(math.pi / 2, 0, 0), verts=18, bevel=0.015)
        self.wheels.append(ob)
        outward = -side * 0.073
        self.c(name + '_rim', radius * 0.58, 0.024, (0, 0, outward), 'paint2', ob, verts=12)
        self.c(name + '_hub', radius * 0.23, 0.035, (0, 0, outward * 1.15), 'brass', ob, verts=8)
        for n in range(3):
            self.b(name + '_spoke_' + str(n), (radius * 0.92, 0.022, 0.028),
                   (0, 0, outward * 1.06), 'steel', ob, rot=(0, 0, n * math.pi / 3), bevel=0.002)
        return ob

    def chassis(self, length, half_width, axles, tracked=False):
        self.length, self.half_width = length, half_width
        self.b('boxed_frame', (length, half_width * 1.62, 0.10), (0, 0, 0.19), 'dark')
        for side in (-1, 1):
            self.b('frame_rail_' + str(side), (length, 0.045, 0.085),
                   (0, side * half_width * 0.61, 0.17), 'metal')
            if tracked:
                self.b('continuous_track_' + str(side), (length * 0.92, 0.18, 0.18),
                       (-0.025, side * half_width, 0.12), 'dark', bevel=0.055)
                for j in range(12):
                    x = -length * 0.44 + j * length * 0.08
                    link = self.b('track_shoe_%s_%s' % (side, j), (length * 0.045, 0.187, 0.019),
                                  (x, side * half_width, 0.219), 'metal', bevel=0.003)
                    self.tracks.append(link)
                for j in range(5):
                    self.wheel('roadwheel_%s_%s' % (side, j), -0.45 + j * 0.225, side, 0.087, half_width + 0.03)
                self.b('track_guard_' + str(side), (length * 0.87, 0.21, 0.045),
                       (0, side * half_width, 0.26), 'team', bevel=0.012)
            else:
                for j, x in enumerate(axles):
                    self.wheel('wheel_%s_%s' % (side, j), x, side, 0.14 if self.role == 'hauler' else 0.12, half_width)
                    self.b('mudguard_%s_%s' % (side, j), (0.33, 0.17, 0.035),
                           (x, side * half_width, 0.295), 'paint2', bevel=0.02)
        for x in (-length / 2, length / 2):
            self.b('bumper_' + str(x), (0.065, half_width * 2 + 0.1, 0.07),
                   (x, 0, 0.21), 'metal', bevel=0.008)
            for side in (-1, 1):
                self.c('tow_eye_%s_%s' % (x, side), 0.024, 0.025,
                       (x * 1.03, side * half_width * 0.6, 0.18), 'brass', rot=(math.pi / 2, 0, 0), verts=10)

    def cab(self, x, width, length=0.39, tall=0.42, hood=False):
        z = 0.28
        cab = slab('armored_service_cab', [(x + length / 2, width / 2), (x + length / 2, -width / 2),
                                         (x - length / 2, -width / 2), (x - length / 2, width / 2)],
                   z, z + tall, top_scale=0.84, top_shift=(-0.028, 0), material=self.m['paint'],
                   bevel=0.02, parent=self.body)
        self.meshes.append(cab)
        roof = self.b('team_roof_plate', (length * 0.7, width * 0.82, 0.03),
                      (x - 0.03, 0, z + tall + 0.012), 'team', bevel=0.008)
        front = x + length / 2 - 0.016
        self.fragile.append(self.b('windscreen', (0.018, width * 0.71, tall * 0.33),
                                  (front, 0, z + tall * 0.72), 'glass', rot=(0, -0.18, 0), bevel=0.003))
        self.b('windscreen_center', (0.023, 0.021, tall * 0.36),
               (front + 0.002, 0, z + tall * 0.72), 'trim', rot=(0, -0.18, 0), bevel=0.002)
        for side in (-1, 1):
            self.fragile.append(self.b('side_glass_' + str(side), (length * 0.48, 0.015, tall * 0.27),
                                      (x - 0.01, side * width * 0.47, z + tall * 0.71), 'glass', bevel=0.003))
            self.b('service_door_' + str(side), (length * 0.74, 0.025, tall * 0.4),
                   (x - 0.015, side * width * 0.51, z + tall * 0.24),
                   'primer' if self.faction == 'SY' and side == 1 else 'paint2', bevel=0.008)
            self.b('door_team_mark_' + str(side), (length * 0.33, 0.031, 0.047),
                   (x - 0.055, side * width * 0.525, z + tall * 0.3), 'team', bevel=0.002)
            self.b('door_handle_' + str(side), (0.047, 0.02, 0.014),
                   (x - length * 0.28, side * width * 0.535, z + tall * 0.44), 'steel', bevel=0.002)
            self.b('cab_step_' + str(side), (length * 0.72, 0.11, 0.034),
                   (x, side * (width / 2 + 0.035), z - 0.043), 'metal', bevel=0.003)
            self.fragile.append(self.c('headlamp_' + str(side), 0.03, 0.025,
                                      (x + length / 2 + 0.03, side * width * 0.34, z + 0.045),
                                      'light', rot=(0, math.pi / 2, 0), verts=10))
        if hood:
            self.b('long_repaired_hood', (0.27, width * 0.89, 0.18),
                   (front + 0.14, 0, z + 0.04), 'primer', taper=(0.86, 0.9), bevel=0.025)
            self.b('hood_team_chevron', (0.16, 0.095, 0.018),
                   (front + 0.14, 0, z + 0.135), 'team', bevel=0.003)
        else:
            self.b('cab_front_armor', (0.045, width * 0.85, 0.09),
                   (front + 0.027, 0, z + 0.17), 'paint2', bevel=0.007)
            for n in range(4):
                self.b('radiator_louvre_' + str(n), (0.014, width * 0.42, 0.012),
                       (front + 0.052, 0, z + 0.045 + n * 0.025), 'dark', bevel=0)
        self.fragile.append(self.c('roof_beacon', 0.026, 0.043,
                                  (x - 0.10, -width * 0.20, z + tall + 0.043), 'light', verts=10))
        self.fragile.append(self.c('service_radio', 0.008, 0.24,
                                  (x - length * 0.42, width * 0.37, z + tall + 0.115), 'metal', verts=8))
        self.special['roof'] = roof

    def stabilizers(self, xs=(-0.4, 0.25)):
        for x in xs:
            for side in (-1, 1):
                pivot = empty('stabilizer_root_%s_%s' % (x, side), loc=(x, side * 0.22, 0.21), parent=self.body)
                self.b('stabilizer_beam_%s_%s' % (x, side), (0.09, 0.25, 0.075),
                       (0, side * 0.1, 0), 'paint2', pivot, bevel=0.007)
                self.c('jack_%s_%s' % (x, side), 0.022, 0.17,
                       (0, side * 0.2, -0.015), 'steel', pivot, verts=10)
                self.b('jack_foot_%s_%s' % (x, side), (0.13, 0.12, 0.025),
                       (0, side * 0.2, -0.09), 'metal', pivot, bevel=0.003)
                self.outriggers.append((pivot, side))

    def hydraulic_arm(self, origin, upper=0.58, lower=0.44, tool='bucket'):
        self.c('work_turntable', 0.15, 0.075, origin, 'trim', verts=18)
        self.arm = empty('upper_boom_pivot', loc=(origin[0], origin[1], origin[2] + 0.035), parent=self.body)
        self.b('upper_box_boom', (upper, 0.12, 0.14), (upper / 2, 0, 0), 'paint', self.arm, bevel=0.014)
        self.b('boom_team_panel', (upper * 0.52, 0.126, 0.057), (upper * 0.44, 0, 0.027), 'team', self.arm, bevel=0.004)
        self.c('boom_ram', 0.032, upper * 0.63, (upper * 0.45, -0.105, -0.045), 'metal', self.arm,
               rot=(0, math.pi / 2, 0), verts=12)
        self.c('boom_piston', 0.018, upper * 0.55, (upper * 0.66, -0.105, -0.045), 'steel', self.arm,
               rot=(0, math.pi / 2, 0), verts=12)
        self.c('elbow_pin', 0.075, 0.18, (upper, 0, 0), 'brass', self.arm, rot=(math.pi / 2, 0, 0), verts=12)
        self.elbow = empty('lower_boom_pivot', loc=(upper, 0, 0), parent=self.arm)
        self.b('lower_box_boom', (lower, 0.085, 0.10), (lower / 2, 0, 0), 'paint2', self.elbow, bevel=0.01)
        self.b('lower_steel_slide', (lower * 0.6, 0.045, 0.045), (lower * 0.72, 0, 0), 'steel', self.elbow, bevel=0.004)
        self.tool = empty('tool_pivot', loc=(lower, 0, 0), parent=self.elbow)
        if tool == 'bucket':
            bucket = prism('engineering_bucket', [(-0.08, 0.07), (0.12, 0.05), (0.17, -0.07),
                                                  (0.09, -0.14), (-0.09, -0.07)], 0.24,
                           material=self.m['metal'], bevel=0.008, parent=self.tool)
            self.meshes.append(bucket)
            for s in (-1, 0, 1):
                self.b('bucket_tooth_' + str(s), (0.09, 0.033, 0.027), (0.17, s * 0.085, -0.095), 'steel', self.tool, bevel=0.002)
        else:
            self.c('hook_cable', 0.007, 0.30, (0, 0, -0.15), 'dark', self.tool, verts=8)
            self.b('hook_block', (0.065, 0.08, 0.075), (0, 0, -0.30), 'brass', self.tool, bevel=0.012)
            self.beam('lifting_hook', (0, 0, -0.33), (0.035, 0, -0.385), 0.022, 'steel', self.tool)
        return self.arm

    def toolbox(self, x, y, width=0.18):
        self.b('toolbox_%s_%s' % (x, y), (0.28, width, 0.13), (x, y, 0.34), 'paint2', bevel=0.008)
        self.b('toolbox_lid_%s_%s' % (x, y), (0.29, width + 0.014, 0.025), (x, y, 0.417), 'trim', bevel=0.004)
        self.b('toolbox_latch_%s_%s' % (x, y), (0.025, 0.025, 0.045), (x + 0.06, y + width / 2, 0.365), 'brass', bevel=0.002)


def engineering(h):
    f = h.faction
    if f == 'US':
        h.chassis(1.16, 0.30, (), tracked=True)
        h.cab(-0.20, 0.40, length=0.38, tall=0.36)
        h.b('forward_engine_cowl', (0.44, 0.40, 0.16), (0.26, 0, 0.37), 'paint', taper=(0.92, 0.95))
        for n in range(5):
            h.b('engine_slot_' + str(n), (0.24, 0.018, 0.012), (0.24, -0.13 + n * 0.063, 0.456), 'dark', bevel=0)
        blade = empty('dozer_blade_root', loc=(0.64, 0, 0.17), parent=h.body)
        h.b('wide_engineering_blade', (0.11, 0.83, 0.25), (0, 0, 0), 'paint2', blade,
            rot=(0, -0.20, 0), taper=(1, 1.1), bevel=0.024)
        h.b('blade_cutting_edge', (0.13, 0.85, 0.035), (0.027, 0, -0.12), 'steel', blade, bevel=0.004)
        for side in (-1, 1):
            h.beam('blade_push_arm_' + str(side), (-0.25, side * 0.29, 0.2), (0.62, side * 0.29, 0.15), 0.045, 'metal')
        h.special['blade'] = blade
        h.hydraulic_arm((-0.34, 0.30, 0.39), 0.55, 0.39)
        h.toolbox(-0.48, -0.18, 0.18)
    elif f == 'IR':
        h.chassis(1.24, 0.30, (-0.42, -0.10, 0.40))
        h.cab(0.37, 0.49, length=0.31, tall=0.34)
        h.b('machinery_deck', (0.75, 0.54, 0.14), (-0.22, 0, 0.31), 'paint2')
        h.stabilizers((-0.46,))
        h.b('mast_hydraulic_pedestal', (0.23, 0.37, 0.32), (-0.39, 0, 0.53), 'paint2', bevel=0.015)
        h.mast = empty('folding_drill_mast', loc=(-0.39, 0, 0.74), parent=h.body)
        h.c('mast_slide_pivot', 0.09, 0.34, (0, 0, 0), 'brass', h.mast,
            rot=(math.pi / 2, 0, 0), verts=14)
        h.special['mast_slides'] = []
        for side in (-1, 1):
            rail = h.b('telescoping_mast_slide_' + str(side), (0.20, 0.055, 0.07),
                       (-0.45, side * 0.10, 0.68), 'steel', bevel=0.005)
            h.special['mast_slides'].append(rail)
        for side in (-1, 1):
            h.b('mast_rail_' + str(side), (0.052, 0.05, 0.90), (0, side * 0.13, 0.42), 'paint', h.mast, bevel=0.007)
        for n in range(5):
            h.b('mast_crossbrace_' + str(n), (0.042, 0.28, 0.036), (0, 0, n * 0.195), 'metal', h.mast, bevel=0.003)
        h.b('mast_crown_team', (0.10, 0.31, 0.12), (0, 0, 0.87), 'team', h.mast, bevel=0.01)
        h.tool = empty('drill_feed', loc=(0.10, 0, 0.39), parent=h.mast)
        h.b('drill_motor', (0.18, 0.20, 0.18), (0, 0, 0.12), 'paint2', h.tool, bevel=0.016)
        h.c('drill_shaft', 0.034, 0.58, (0, 0, -0.20), 'steel', h.tool, verts=12)
        for n in range(6):
            h.c('auger_flight_' + str(n), 0.095, 0.025, (0, 0, -0.04 - n * 0.075), 'metal', h.tool,
                rot=(0.22, 0, n * math.pi / 2), verts=12, bevel=0.003)
        h.c('auger_tip', 0.005, 0.15, (0, 0, -0.55), 'brass', h.tool, radius_top=0.062, verts=10)
        h.toolbox(-0.40, -0.24)
        h.c('hose_reel', 0.11, 0.10, (-0.12, 0.27, 0.41), 'dark', rot=(math.pi / 2, 0, 0), verts=16)
    elif f == 'SY':
        h.chassis(1.16, 0.29, (-0.39, 0.38))
        h.cab(0.16, 0.45, length=0.31, tall=0.33, hood=True)
        h.b('patched_flatdeck', (0.65, 0.51, 0.065), (-0.27, 0, 0.29), 'primer')
        h.mast = empty('field_A_frame', loc=(-0.42, 0, 0.30), parent=h.body)
        for side in (-1, 1):
            h.beam('A_frame_leg_' + str(side), (0, side * 0.22, 0), (0, side * 0.06, 0.72), 0.045, 'metal', h.mast)
            h.b('A_frame_team_' + str(side), (0.052, 0.06, 0.17), (0, side * 0.12, 0.46), 'team', h.mast, bevel=0.004)
        h.b('A_frame_crossbar', (0.052, 0.41, 0.045), (0, 0, 0.19), 'paint2', h.mast)
        h.c('winch_drum', 0.078, 0.19, (0, 0, 0.18), 'dark', h.mast, rot=(math.pi / 2, 0, 0), verts=16)
        h.c('winch_top_pulley', 0.051, 0.07, (0, 0, 0.72), 'brass', h.mast, rot=(math.pi / 2, 0, 0), verts=12)
        h.hook = empty('field_lift_hook', loc=(-0.07, 0, 0.40), parent=h.mast)
        h.c('field_lift_cable', 0.008, 0.30, (0, 0, 0.13), 'metal', h.hook, verts=8)
        h.b('field_hook_block', (0.07, 0.08, 0.08), (0, 0, -0.035), 'brass', h.hook, bevel=0.012)
        h.b('lifted_girder', (0.26, 0.40, 0.075), (0, 0, -0.14), 'paint2', h.hook, bevel=0.003)
        h.toolbox(-0.29, -0.17)
        h.b('folded_welding_screen', (0.06, 0.18, 0.28), (-0.51, 0.22, 0.43), 'canvas', bevel=0.006)
        h.stabilizers((-0.45,))
    else:
        h.chassis(1.34, 0.32, (-0.47, -0.19, 0.18, 0.48))
        h.cab(0.43, 0.54, length=0.37, tall=0.29)
        h.b('service_platform', (0.94, 0.62, 0.13), (-0.16, 0, 0.33), 'paint2')
        h.stabilizers((-0.46, 0.22))
        h.hydraulic_arm((-0.25, 0, 0.44), 0.69, 0.49, tool='hook')
        h.b('crane_counterweight', (0.25, 0.39, 0.20), (-0.24, 0, 0.04), 'paint2', h.arm, bevel=0.02)
        for side in (-1, 1):
            h.toolbox(-0.27, side * 0.26, 0.13)
        h.b('service_generator', (0.24, 0.41, 0.22), (-0.51, 0, 0.46), 'trim', bevel=0.025)
        for n in range(5):
            h.b('generator_fin_' + str(n), (0.25, 0.026, 0.08), (-0.51, -0.14 + n * 0.07, 0.5), 'metal', bevel=0.003)


def cargo_pallet(h, root, x, y, z, scale=1.0, variant=0, latches=False):
    h.b('supply_pallet_%s_%s' % (x, y), (0.31 * scale, 0.29 * scale, 0.045), (x, y, z), 'pallet', root, cargo=True, bevel=0.004)
    h.b('supply_case_%s_%s' % (x, y), (0.28 * scale, 0.27 * scale, 0.22 * scale),
        (x, y, z + 0.125 * scale), 'canvas' if variant else 'paint2', root, cargo=True, bevel=0.013)
    if latches:  # US modular crates: brass corner castings on every case.
        for sx in (-1, 1):
            for sy in (-1, 1):
                h.b('case_latch_%s_%s_%s_%s' % (x, y, sx, sy), (0.03, 0.03, 0.05),
                    (x + sx * 0.125 * scale, y + sy * 0.12 * scale, z + 0.20 * scale),
                    'brass', root, cargo=True, bevel=0.002)
    for side in (-1, 1):
        h.b('case_strap_%s_%s_%s' % (x, y, side), (0.021, 0.279 * scale, 0.235 * scale),
            (x + side * 0.08 * scale, y, z + 0.12 * scale), 'trim', root, cargo=True, bevel=0.002)
    h.b('case_brass_seal_%s_%s' % (x, y), (0.065, 0.09, 0.01),
        (x, y, z + 0.24 * scale), 'brass', root, cargo=True, bevel=0.001)


def hauling(h):
    f = h.faction
    lengths = {'US': 1.72, 'IR': 1.76, 'SY': 1.53, 'SA': 1.94}
    length = lengths[f]
    axles = {'US': (-0.57, 0.53), 'IR': (-0.60, -0.19, 0.56),
             'SY': (-0.48, 0.43), 'SA': (-0.70, -0.36, 0.33, 0.70)}[f]
    h.chassis(length, 0.34 if f != 'SY' else 0.31, axles)
    front = length / 2 - (0.25 if f != 'SY' else 0.40)
    h.cab(front, 0.57 if f != 'SY' else 0.49, length=0.39 if f != 'SY' else 0.31,
          tall=0.41 if f in ('US', 'SA') else 0.35, hood=f == 'SY')
    h.bed = empty('cargo_bed_pivot', loc=(-0.22, 0, 0.32), parent=h.body)
    rear = -length / 2 + 0.035
    bed_length = length - (0.64 if f != 'SY' else 0.56)
    h.b('cargo_floor', (bed_length, 0.62 if f != 'SY' else 0.54, 0.065), (-0.05, 0, 0), 'paint2', h.bed)
    if f == 'US':
        for side in (-1, 1):
            h.b('pallet_flatbed_rail_' + str(side), (bed_length, 0.04, 0.17), (-0.05, side * 0.29, 0.11), 'paint', h.bed)
            h.b('pallet_team_band_' + str(side), (bed_length * 0.83, 0.048, 0.055), (-0.03, side * 0.30, 0.145), 'team', h.bed, bevel=0.003)
            for n in range(3):
                h.b('flatbed_tiedown_%s_%s' % (side, n), (0.026, 0.057, 0.20),
                    (-0.39 + n * 0.31, side * 0.30, 0.11), 'steel', h.bed, bevel=0.003)
        for x in (-0.32, 0.05):
            for y in (-0.14, 0.14):
                cargo_pallet(h, h.bed, x, y, 0.06, 0.90, latches=True)
        # US sensor mast on the cab roof: EO head with an amber lens.
        h.c('sensor_mast_base', 0.035, 0.05, (front - 0.11, 0.18, 0.715), 'trim', verts=10)
        h.c('sensor_mast_tube', 0.014, 0.18, (front - 0.11, 0.18, 0.82), 'metal', verts=8)
        h.b('sensor_mast_head', (0.08, 0.12, 0.06), (front - 0.10, 0.18, 0.93), 'paint2', bevel=0.006)
        h.b('sensor_mast_lens', (0.012, 0.08, 0.035), (front - 0.055, 0.18, 0.93), 'lens', bevel=0)
        h.gate = empty('hydraulic_tailgate', loc=(rear + 0.22, 0, 0.035), parent=h.bed)
        h.b('tail_lift_plate', (0.045, 0.57, 0.30), (0, 0, 0.12), 'paint2', h.gate, bevel=0.008)
        h.b('tail_lift_warning', (0.052, 0.51, 0.047), (-0.005, 0, 0.20), 'brass', h.gate, bevel=0.003)
    elif f == 'IR':
        # Two separated roll-off pods give this carrier a distinct stepped top.
        for x in (-0.35, 0.14):
            h.b('pod_cradle_' + str(x), (0.42, 0.63, 0.045), (x, 0, 0.064), 'metal', h.bed)
            h.b('modular_bin_' + str(x), (0.40, 0.56, 0.26), (x, 0, 0.19), 'paint', h.bed,
                cargo=True, taper=(0.96, 0.88), bevel=0.017)
            h.b('bin_lid_' + str(x), (0.42, 0.58, 0.042), (x, 0, 0.34), 'canvas', h.bed, cargo=True, bevel=0.008)
            for side in (-1, 1):
                h.b('bin_team_latch_%s_%s' % (x, side), (0.16, 0.018, 0.10),
                    (x, side * 0.287, 0.20), 'team', h.bed, cargo=True, bevel=0.002)
        # Covered missile-crate load shrouding the rear pod: tapered canvas
        # cover + tie-down straps. Cargo so empty carriers run open.
        h.b('missile_crate_shroud', (0.44, 0.48, 0.13), (-0.35, 0, 0.425), 'canvas', h.bed,
            cargo=True, taper=(0.82, 0.90), bevel=0.03)
        for sx in (-0.49, -0.35, -0.21):
            h.b('missile_crate_strap_' + str(sx), (0.025, 0.50, 0.145), (sx, 0, 0.425), 'trim', h.bed,
                cargo=True, bevel=0.002)
        h.mast = empty('pod_loading_yoke', loc=(rear + 0.20, 0, 0.08), parent=h.bed)
        for side in (-1, 1):
            h.b('pod_yoke_' + str(side), (0.075, 0.05, 0.45), (0, side * 0.24, 0.19), 'paint2', h.mast)
        h.b('pod_yoke_bridge', (0.075, 0.53, 0.055), (0, 0, 0.40), 'team', h.mast)
    elif f == 'SY':
        for side in (-1, 1):
            h.b('repaired_cargo_side_' + str(side), (bed_length, 0.038, 0.20), (-0.06, side * 0.258, 0.13),
                'primer' if side == 1 else 'paint2', h.bed, bevel=0.01)
            h.b('cargo_military_band_' + str(side), (bed_length * 0.7, 0.044, 0.057), (-0.08, side * 0.263, 0.17), 'team', h.bed, bevel=0.003)
        for x in (-0.28, 0.07):
            for y in (-0.13, 0.13):
                cargo_pallet(h, h.bed, x, y, 0.07, 0.86, variant=1)
        h.b('load_tarp', (0.50, 0.42, 0.035), (-0.14, 0, 0.30), 'canvas', h.bed, cargo=True,
            taper=(0.94, 0.84), bevel=0.025)
        # Welded patch panels on the repaired sides (fixed) + rope lashings
        # over the tarp (cargo, so they vanish with the unloaded bed).
        for side in (-1, 1):
            for i, px in enumerate((-0.30, 0.06)):
                h.b('weld_patch_%s_%s' % (side, i), (0.14, 0.012, 0.11), (px, side * 0.283, 0.125),
                    'primer' if (i + side) % 2 else 'paint2', h.bed, bevel=0.004)
        for i, lx in enumerate((-0.32, -0.14, 0.04)):
            h.b('tarp_lashing_%s' % i, (0.022, 0.46, 0.05), (lx, 0, 0.30), 'rope', h.bed,
                cargo=True, bevel=0.006)
        h.b('tarp_ridge_rope', (0.52, 0.022, 0.05), (-0.14, 0, 0.30), 'rope', h.bed,
            cargo=True, bevel=0.006)
        h.gate = empty('patched_tailgate', loc=(rear + 0.22, 0, 0.06), parent=h.bed)
        h.b('rear_panel', (0.033, 0.52, 0.21), (0, 0, 0.07), 'primer', h.gate)
        h.c('rear_winch', 0.075, 0.20, (rear, 0, 0.29), 'metal', rot=(math.pi / 2, 0, 0), verts=16)
        h.toolbox(-0.08, -0.29, 0.09)
    else:
        # Heavy sloping bin and a tall load define the Saudi logistics silhouette.
        for side in (-1, 1):
            h.b('heavy_bin_side_' + str(side), (bed_length, 0.055, 0.31), (-0.02, side * 0.30, 0.17),
                'paint', h.bed, rot=(0.11 * side, 0, 0), bevel=0.015)
            h.b('bin_team_belt_' + str(side), (bed_length * 0.94, 0.06, 0.07), (-0.02, side * 0.32, 0.26), 'team', h.bed, bevel=0.004)
            for n in range(4):
                h.b('bin_reinforcement_%s_%s' % (side, n), (0.05, 0.065, 0.31),
                    (-0.52 + n * 0.32, side * 0.315, 0.17), 'paint2', h.bed, bevel=0.007)
        h.b('front_bin_bulkhead', (0.05, 0.63, 0.35), (bed_length / 2 - 0.04, 0, 0.18), 'paint2', h.bed)
        # Heavy service rigging: side cabinets between the axles + hose reel
        # on the bulkhead. Fixed equipment, always visible.
        for side in (-1, 1):
            h.b('service_cabinet_%s' % side, (0.34, 0.12, 0.17), (0.20, side * 0.26, -0.10),
                'paint2', h.bed, bevel=0.008)
            h.b('cabinet_latch_%s' % side, (0.03, 0.02, 0.05), (0.20, side * 0.325, -0.08),
                'brass', h.bed, bevel=0.002)
        h.b('service_reel_bracket', (0.12, 0.06, 0.08), (0.58, 0, 0.35), 'metal', h.bed)
        h.c('service_hose_reel', 0.10, 0.10, (0.55, 0, 0.42), 'dark', h.bed,
            rot=(math.pi / 2, 0, 0), verts=16)
        h.c('service_hose_hub', 0.035, 0.12, (0.55, 0, 0.42), 'brass', h.bed,
            rot=(math.pi / 2, 0, 0), verts=10)
        for x in (-0.42, -0.06, 0.30):
            for y in (-0.14, 0.14):
                cargo_pallet(h, h.bed, x, y, 0.075, 0.91)
        h.b('top_service_crate', (0.45, 0.39, 0.18), (-0.09, 0, 0.36), 'canvas', h.bed, cargo=True,
            taper=(0.90, 0.94), bevel=0.016)
        h.gate = empty('heavy_tailgate', loc=(rear + 0.22, 0, 0.16), parent=h.bed)
        h.b('heavy_rear_panel', (0.05, 0.64, 0.31), (0, 0, 0), 'paint2', h.gate, bevel=0.012)
        for side in (-1, 1):
            h.beam('tipper_cylinder_' + str(side), (-0.35, side * 0.20, 0.21), (0.20, side * 0.20, 0.33), 0.045, 'steel')
    for side in (-1, 1):
        h.c('fuel_tank_' + str(side), 0.085, 0.27, (0.19, side * 0.275, 0.225), 'metal', rot=(0, math.pi / 2, 0), verts=14)
        h.fragile.append(h.b('rear_brake_lamp_' + str(side), (0.024, 0.045, 0.030),
                              (rear - 0.01, side * 0.23, 0.27), 'light', bevel=0.003))


def build(faction, params):
    faction = faction or 'US'
    role = params.get('role', 'rig')
    if faction not in ('US', 'IR', 'SY', 'SA') or role not in ('rig', 'hauler'):
        raise ValueError('logistics requires one of four factions and rig/hauler role')
    h = Builder(faction, role)
    if role == 'rig':
        engineering(h)
    else:
        hauling(h)
    rig = fclib.Rig(h.root)
    rig.logistics = h
    rig.parts = {'body': h.meshes, 'cargo': h.cargo}
    rig.scorch = fclib.scorch_decal('logistics_wreck_scorch', 0.90 if role == 'hauler' else 0.74,
                                   parent=h.root, seed=12)
    top = empty('hp_healthbar', loc=(0, 0, 1.15 if role == 'rig' else 0.95), parent=h.root)
    top['fc_parts'] = ['body', 'whole']
    rig.hardpoints = {'healthbar': top}
    if role == 'rig':
        work_depth = {'US': -0.12, 'IR': -0.625, 'SY': -0.14, 'SA': -0.385}[faction]
        work = empty('hp_work', loc=(0, 0, work_depth), parent=h.tool or h.hook or h.mast or h.body)
        work['fc_parts'] = ['body', 'whole']
        rig.hardpoints['work'] = work
    rig.original = {o: (o.location.copy(), o.rotation_euler.copy(), o.scale.copy())
                    for o in fclib.bpy.context.scene.objects if o is h.root or o.parent is not None}
    return rig


def pose(rig, st, frame, d):
    h = rig.logistics
    for ob, (loc, rot, scale) in rig.original.items():
        ob.location, ob.rotation_euler, ob.scale = loc.copy(), rot.copy(), scale.copy()
    h.root.rotation_euler.z = fclib.heading_to_blender_z(d, st['directions'])
    name = st['name']
    n = max(1, st.get('frames', 1))
    phase = frame / n
    wave = math.sin(phase * math.tau)
    moving = name in ('move', 'move_loaded')
    working = name in ('work_build', 'work_load', 'work_unload')
    damaged = name in ('damaged', 'damaged_loaded')
    wreck = name == 'wreck'
    fclib.set_grime_all(0.62 if wreck else 0.40 if damaged else 0.0)
    fclib.set_char_all(0.91 if wreck else 0.27 if damaged else 0.0)
    fclib.set_emission_scale(0.0 if wreck else 1.0)
    if moving:
        h.body.location.z = 0.010 * wave
        h.body.rotation_euler.x = 0.009 * math.cos(phase * math.tau)
        h.body.rotation_euler.y = 0.006 * wave
        for wheel in h.wheels:
            wheel.rotation_euler.rotate_axis('Z', phase * math.pi)
        for link in h.tracks:
            link.location.x += phase * 0.075
    if h.role == 'rig':
        progress = frame / max(1, n - 1) if name == 'deploy_build' else 1.0 if name == 'work_build' else 0.0
        for outrigger, side in h.outriggers:
            outrigger.location.y += side * 0.17 * progress
            outrigger.location.z -= 0.08 * progress
        if h.faction == 'US':
            h.arm.rotation_euler = (0, -0.16 - 0.68 * progress, -0.16 - 0.38 * progress)
            h.elbow.rotation_euler.y = 1.93 - 0.67 * progress
            h.tool.rotation_euler.y = -0.75 + (0.16 * wave if working else 0)
            h.special['blade'].location.z -= 0.055 * progress
            if working:
                h.arm.rotation_euler.y += 0.10 * wave
                h.elbow.rotation_euler.y -= 0.20 * wave
        elif h.faction == 'IR':
            h.mast.rotation_euler.y = (1 - progress) * math.pi / 2
            h.mast.location.x -= 0.50 * progress
            for rail in h.special['mast_slides']:
                rail.scale.x = 1 + 2.5 * progress
                rail.location.x -= 0.25 * progress
            rig.hardpoints['healthbar'].location.z = 1.03 + 0.72 * progress
            h.tool.location.z -= 0.45 * max(0.0, (progress - 0.5) * 2)
            if working:
                h.tool.location.z -= 0.025 * wave
                h.tool.rotation_euler.z = phase * math.tau
        elif h.faction == 'SY':
            h.mast.rotation_euler.y = -0.24 - 0.32 * progress
            if working:
                h.hook.location.z += 0.08 * wave
                h.hook.rotation_euler.y = 0.06 * wave
        else:
            h.arm.rotation_euler = (0, -1.00 + 0.35 * progress, 2.9 - 2.35 * progress)
            h.elbow.rotation_euler.y = 2.0 - 1.75 * progress
            h.tool.rotation_euler.y = -h.arm.rotation_euler.y - h.elbow.rotation_euler.y
            if working:
                h.arm.rotation_euler.z += 0.08 * wave
                h.elbow.rotation_euler.y += 0.06 * wave
                h.tool.location.x += 0.035 * wave
    loaded = name in ('idle_loaded', 'move_loaded', 'damaged_loaded', 'work_unload')
    # Generic UI portraits request the whole idle model: show a representative
    # cargo load in that static illustration, never in the empty gameplay state.
    loaded = loaded or h.role == 'hauler' and name == 'idle' and st.get('part') == 'whole'
    cargo = h.cargo if loaded or name == 'work_load' and frame >= n // 2 else []
    if h.role == 'hauler' and working:
        sign = 1 if name == 'work_load' else -1
        if h.gate:
            h.gate.rotation_euler.y = -0.75 + 0.24 * wave
        if h.faction == 'SA':
            h.bed.rotation_euler.y = -0.16 - 0.075 * wave
        elif h.faction == 'IR':
            h.mast.rotation_euler.y = -0.65 + 0.24 * wave
        else:
            h.bed.location.z += 0.006 * wave
        for ob in cargo:
            ob.location.z += (0.10 + 0.035 * wave) * (1 - phase) if name == 'work_load' else 0.02 * wave
            ob.location.x += sign * 0.035 * wave
    visible = h.meshes + cargo
    if damaged:
        h.body.rotation_euler.x = 0.025
        h.special['roof'].rotation_euler.y += 0.10
        visible = [o for o in visible if o not in set(h.fragile[:1])]
    if wreck:
        h.body.location.z = -0.065
        h.body.rotation_euler = (0.10, -0.08, 0.07)
        missing = set(h.fragile)
        if h.wheels:
            missing.add(h.wheels[0])
            missing.update(h.wheels[0].children_recursive)
        if h.arm:
            h.arm.location.z = 0.26
            h.arm.rotation_euler = (0.05, 0.08, 1.55)
            h.elbow.rotation_euler.y = -0.04
            h.tool.rotation_euler = (math.pi / 2, 0, 0) if h.faction == 'SA' else (0, 0.15, 0)
        if h.mast:
            h.mast.rotation_euler = (0.45, 1.50, -0.15)
        if h.hook:
            h.hook.location.z -= 0.16
        if h.bed:
            h.bed.rotation_euler = (0.14, 0.12, -0.08)
        if h.gate:
            h.gate.rotation_euler.y = -1.55
        visible = [o for o in h.meshes if o not in missing]
        # One broken case remains, never a full healthy cargo silhouette.
        for ob in h.cargo[:3]:
            ob.rotation_euler.y += 0.30
            ob.location.z -= 0.04
            visible.append(ob)
        return visible + [rig.scorch], visible
    return visible, visible
