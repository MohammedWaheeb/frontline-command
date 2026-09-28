"""Original ground combat vehicle roster (27 faction variants).

Authored by Claude Code (exact model claude-opus-5-5), assignment 01 resume
(vehicle and aircraft lane). Extends the Claude-authored fclib projection,
material and layer contract. All geometry is original procedural modelling;
no borrowed meshes and no real insignia.

Codex quota-takeover audit: independent turret shadows, deployed launch posing,
barrel-axis recoil, deterministic effect order, single-charge SA canister.

Coverage (params['kind'] = '<FACTION>.<role>'):
  US  car apc artillery aa repair launcher              (US.tank: tank_tracked.py)
  IR  car apc tank artillery aa repair launcher          (IR.strike drone: drone_fixed.py)
  SY  apc tank artillery aa repair buggy launcher        (SY.car: technical.py)
  SA  car apc tank artillery aa repair launcher          (SA.mobile_abm: aegis_carrier.py)

Faction massing languages (design 23.1):
  US  angular modular plates, sensor masts, compact recon kit, olive-grey
  IR  rounded cast forms, ERA brick rows, slat grilles, visible missile magazines
  SY  repaired/welded mismatched panels, sandbags, cages; always military, never civilian
  SA  heavy pale 8x8 / tracked armour, buttressed boxy hulls, stabilisers, service machinery

Contract (identical to the accepted samples):
  * +X is vehicle forward, the sim position is the ground anchor at (0, 0, 0).
  * Turreted classes render parts 'hull' (16 headings) and 'turret' (32 headings).
    Turret frames are rendered with the pivot at the anchor; the hull-frame pivot
    offset is published as the spec's turret_pivot_mt.
  * Every pose first restores the build-time transform snapshot, so a pose never
    depends on the previous one (checked forward and reverse by the pilot).
  * Progress-driven states map frame k of N to progress (k + 1) / N.
  * Wrecks: charred, sunk/tilted, parts missing, turret or equipment displaced,
    scorched ground contact; no team layer.
"""
import math

import fclib
from fclib import box, cyl, slab, prism, sphere, empty, mat

TAU = math.tau


# =========================================================================== kit
class VB:
    """Vehicle builder: owns object lists and articulation handles for posing."""

    def __init__(self, faction, kind):
        self.faction, self.kind = faction, kind
        m = fclib.faction_mats(faction)
        m['primer'] = mat('vr_primer', '#6B6C66', rough=0.8, grime=0.45)
        m['rust'] = mat('vr_rust', '#7A4B2E', rough=0.85, grime=0.5)
        m['steel'] = mat('vr_bright_steel', '#8E8F86', rough=0.4, metal=0.7, grime=0.2)
        m['brass'] = mat('vr_brass', '#A48846', rough=0.5, metal=0.5, grime=0.2)
        m['sand'] = mat('vr_sandbag', '#A08F68', rough=1.0, grime=0.5)
        m['slat'] = mat('vr_slat', '#3A3B36', rough=0.6, metal=0.5, grime=0.3)
        m['era'] = mat('vr_era', '#5E5C44', rough=0.7, grime=0.35)
        m['missile'] = mat('vr_missile', '#CFCBBE', rough=0.45, grime=0.15)
        m['warhead'] = mat('vr_warhead', '#7E3B2C', rough=0.5, grime=0.2)
        m['tube'] = mat('vr_tube', '#4B4E46', rough=0.6, metal=0.3, grime=0.3)
        m['earth'] = mat('vr_earth_berm', '#8C7A58', rough=1.0, grime=0.6)
        m['plume'] = mat('vr_plume', '#FFD9A0', emission='#FFB15A', emission_strength=16, grime=0)
        m['smoke'] = mat('vr_smoke', '#B9B2A4', rough=1.0, grime=0.0, alpha=0.55)
        m['spark'] = mat('vr_spark', '#FFE7B0', emission='#FFD27A', emission_strength=20, grime=0)
        m['flash'] = mat('vr_flash', '#FFE8B8', emission='#FFC45C', emission_strength=24, grime=0)
        self.m = m
        self.root = empty('root')
        self.hull = empty('hull_root', parent=self.root)
        self.turret_root = None
        self.gun = None
        self.group = 'hull'
        self.objs = {'hull': [], 'turret': []}
        self.spinners, self.shoes = [], []           # (spin_empty, radius), (shoe, base_x)
        self.detach, self.missing = [], []           # damaged-state losses, wreck losses
        self.effects = {}                            # name -> objects shown only in some states
        self.h = {}                                  # articulation handles
        self.hp = {}                                 # hardpoint empties
        self.pivot = (0.0, 0.0, 0.0)
        self.recoil = 0.08
        self.aim_elev = 0.0
        self.track_len = 1.4

    # -- geometry helpers: every mesh goes to the active group unless fx=True
    def _add(self, ob, fx=None, detach=False, missing=False):
        if fx:
            self.effects.setdefault(fx, []).append(ob)
        else:
            self.objs[self.group].append(ob)
        if detach:
            self.detach.append(ob)
        if missing:
            self.missing.append(ob)
        return ob

    def par(self, parent):
        if parent is not None:
            return parent
        return self.turret_root if self.group == 'turret' else self.hull

    def b(self, name, size, loc, m='paint', parent=None, fx=None, detach=False, missing=False, **kw):
        return self._add(box(name, size, loc=loc, material=self.m[m], parent=self.par(parent), **kw), fx, detach, missing)

    def c(self, name, r, depth, loc, m='metal', parent=None, fx=None, detach=False, missing=False, **kw):
        return self._add(cyl(name, r, depth, loc=loc, material=self.m[m], parent=self.par(parent), **kw), fx, detach,
                         missing)

    def s(self, name, r, loc, m='paint', parent=None, fx=None, scale=(1, 1, 1), segs=12, detach=False, missing=False):
        return self._add(sphere(name, r, loc=loc, material=self.m[m], parent=self.par(parent), scale=scale, segs=segs),
                         fx, detach, missing)

    def sl(self, name, poly, z0, z1, m='paint', parent=None, fx=None, detach=False, missing=False, **kw):
        return self._add(slab(name, poly, z0, z1, material=self.m[m], parent=self.par(parent), **kw), fx, detach,
                         missing)

    def pr(self, name, profile, depth, m='paint', parent=None, loc=(0, 0, 0), rot=(0, 0, 0), fx=None, **kw):
        return self._add(prism(name, profile, depth, loc=loc, rot=rot, material=self.m[m], parent=self.par(parent),
                               **kw), fx)

    def e(self, name, loc=(0, 0, 0), parent=None):
        return empty(name, loc=loc, parent=self.par(parent))

    def rod(self, name, a, b, r, m='metal', parent=None, fx=None, missing=False):
        """Cylinder between two local points (a, b) in the parent frame."""
        ax, ay, az = a
        bx, by, bz = b
        dx, dy, dz = bx - ax, by - ay, bz - az
        L = math.sqrt(dx * dx + dy * dy + dz * dz)
        yaw = math.atan2(dy, dx)
        pitch = math.atan2(math.sqrt(dx * dx + dy * dy), dz)
        return self.c(name, r, L, ((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), m, parent, fx=fx, missing=missing,
                      rot=(0, pitch, yaw), verts=6, bevel=0)

    # -- running gear
    def wheel(self, name, x, y, r, w=0.09, hubm='paint2', missing=False):
        side = 1 if y > 0 else -1
        hub = self.e(name + '_hub', (x, y, r))
        hub.rotation_euler = (math.pi / 2, 0, 0)
        spin = self.e(name + '_spin', parent=hub)
        self.c(name, r, w, (0, 0, 0), 'dark', spin, verts=18, bevel=0.02, missing=missing)
        self.c(name + '_rim', r * 0.56, w + 0.012, (0, 0, -side * 0.004), hubm, spin, verts=10, missing=missing)
        for k in range(3):
            self.b(name + f'_lug{k}', (r * 0.95, 0.02, 0.02), (0, 0, -side * (w / 2 + 0.006)), 'steel', spin,
                   rot=(0, 0, k * math.pi / 3), bevel=0, missing=missing)
        self.spinners.append((spin, r))
        return hub

    def axle_set(self, xs, half_w, r, w=0.09, hubm='paint2', missing_first=False):
        for i, x in enumerate(xs):
            for sy in (1, -1):
                self.wheel(f'wheel_{i}_{"L" if sy > 0 else "R"}', x, sy * half_w, r, w, hubm,
                           missing=missing_first and i == 0 and sy < 0)

    def tracks(self, length, half_w, r=0.085, n_wheels=6, band_h=0.20, width=0.2, skirt=None):
        self.track_len = length
        for sy in (1, -1):
            side = 'L' if sy > 0 else 'R'
            y = sy * half_w
            self.b(f'track_band_{side}', (length - 0.1, width, band_h), (0, y, band_h / 2 + 0.01), 'dark', bevel=0.05)
            for k in range(14):
                x0 = -length / 2 + 0.06 + k * (length - 0.12) / 13
                shoe = self.b(f'shoe_{side}_{k}', (0.05, width + 0.012, 0.018), (x0, y, band_h + 0.012), 'metal', bevel=0)
                self.shoes.append((shoe, x0))
            for k in range(n_wheels):
                x = -length / 2 + 0.16 + k * (length - 0.32) / (n_wheels - 1)
                self.wheel(f'road_{side}_{k}', x, y + sy * 0.02, r, 0.05)
            for x in (length / 2 - 0.08, -length / 2 + 0.08):
                self.wheel(f'sprocket_{side}_{x:+.2f}', x, y + sy * 0.02, r * 1.12, 0.05, 'metal')
            if skirt:
                self.b(f'skirt_{side}', (length * 0.86, 0.035, 0.13), (0.02, sy * (half_w + width / 2 + 0.02), 0.22),
                       skirt, rot=(0.1 * sy, 0, 0), bevel=0.01, detach=True, missing=True)

    # -- turret & gun
    def begin_turret(self, pivot, height):
        """Start turret group; pivot=(x, y) in hull coords, height=z of turret ring."""
        self.pivot = (pivot[0], pivot[1], height)
        self.turret_root = empty('turret_root', loc=self.pivot, parent=self.root)
        self.group = 'turret'

    def end_turret(self):
        self.group = 'hull'

    def gun_mount(self, loc, barrel_len, r=0.03, brake=True, sleeve=True, m='metal'):
        self.gun = self.e('gun_root', loc)
        self.b('mantlet', (0.13, 0.18, 0.12), (0.02, 0, 0), 'paint2', self.gun)
        if sleeve:
            self.c('sleeve', r * 1.35, barrel_len * 0.35, (barrel_len * 0.25, 0, 0), 'paint2', self.gun,
                   rot=(0, math.pi / 2, 0), verts=12)
        self.c('barrel', r, barrel_len, (barrel_len / 2 + 0.05, 0, 0), m, self.gun, rot=(0, math.pi / 2, 0), verts=12)
        if brake:
            self.b('muzzle_brake', (0.07, r * 3.2, r * 2.4), (barrel_len + 0.05, 0, 0), 'metal', self.gun)
        self.muzzle(barrel_len + 0.10)
        return self.gun

    def muzzle(self, x, parent=None, y=0.0, z=0.0):
        hp = empty('hp_muzzle', loc=(x, y, z), parent=parent or self.gun)
        hp['fc_parts'] = ['turret'] if self.turret_root is not None and self.group == 'turret' else ['body', 'whole']
        self.hp['muzzle'] = hp
        fl = self.c('muzzle_flash', 0.05, 0.14, (x + 0.06, y, z), 'flash', parent or self.gun, fx='flash',
                    rot=(0, math.pi / 2, 0), verts=8, radius_top=0.012, bevel=0)
        return hp

    def hardpoint(self, name, loc, parts, parent=None):
        hp = empty('hp_' + name, loc=loc, parent=parent or self.root)
        hp['fc_parts'] = parts
        self.hp[name] = hp
        return hp

    # -- recurring details
    def antenna(self, name, loc, h=0.34):
        self.c(name, 0.006, h, (loc[0], loc[1], loc[2] + h / 2), 'dark', verts=5, bevel=0, missing=True)

    def headlights(self, x, half_w, z):
        for sy in (1, -1):
            self.c(f'lamp_{sy}', 0.022, 0.02, (x, sy * half_w, z), 'light', rot=(0, math.pi / 2, 0), verts=10,
                   missing=True)

    def smoke_dischargers(self, x, half_w, z, n=3):
        for sy in (1, -1):
            for k in range(n):
                self.c(f'smoke_{sy}_{k}', 0.02, 0.08, (x, sy * (half_w - 0.03 * k), z + 0.02 * k), 'dark',
                       rot=(0, math.pi / 2 - 0.5, 0.45 * sy), verts=8, missing=True)

    def era_row(self, name, x0, x1, y, z, n, m='era', tilt=0.0):
        for k in range(n):
            x = x0 + (x1 - x0) * (k + 0.5) / n
            self.b(f'{name}_{k}', ((x1 - x0) / n * 0.86, 0.05, 0.07), (x, y, z), m, rot=(tilt, 0, 0), bevel=0.004,
                   missing=True)

    def slat_cage(self, name, x0, x1, y, z0, z1, n=8):
        for k in range(n + 1):
            x = x0 + (x1 - x0) * k / n
            self.b(f'{name}_v{k}', (0.012, 0.012, z1 - z0), (x, y, (z0 + z1) / 2), 'slat', bevel=0, missing=True)
        for z in (z0, z1):
            self.b(f'{name}_h{z:.2f}', (x1 - x0, 0.014, 0.014), ((x0 + x1) / 2, y, z), 'slat', bevel=0, missing=True)

    def sandbags(self, name, x, y, z, nx=3, ny=2, rot=0.0):
        r = fclib.rng(len(name))
        for i in range(nx):
            for j in range(ny):
                self.b(f'{name}_{i}_{j}', (0.10, 0.07, 0.05),
                       (x + (i - nx / 2 + 0.5) * 0.095, y + (j - ny / 2 + 0.5) * 0.068, z),
                       'sand', rot=(0, 0, rot + (r.random() - 0.5) * 0.25), bevel=0.02, missing=True)

    def cab(self, name, x0, x1, half_w, z0, z1, m='paint', glass=True, slope=0.12):
        self.sl(name, [(x1, half_w), (x1, -half_w), (x0, -half_w), (x0, half_w)], z0, z1, m, top_scale=0.9,
                top_shift=(-slope, 0), bevel=0.02)
        if glass:
            self.b(name + '_glass', (0.02, half_w * 1.6, (z1 - z0) * 0.42), (x1 - slope * 0.55, 0, z0 + (z1 - z0) * 0.68),
                   'glass', rot=(0, -0.45, 0), bevel=0, missing=True)
            for sy in (1, -1):
                self.b(f'{name}_sidewin_{sy}', ((x1 - x0) * 0.45, 0.012, (z1 - z0) * 0.32),
                       ((x0 + x1) / 2 + 0.02, sy * (half_w - 0.005), z0 + (z1 - z0) * 0.68), 'glass', bevel=0,
                       missing=True)

    def jack(self, name, x, y, z_top, drop):
        """Stabiliser: housing + foot that lowers by `drop` with deploy progress."""
        self.b(name + '_house', (0.06, 0.06, 0.12), (x, y, z_top), 'trim')
        foot = self.e(name + '_foot_root', (x, y, z_top - 0.06))
        self.b(name + '_leg', (0.035, 0.035, 0.14), (0, 0, -0.02), 'metal', foot)
        self.b(name + '_pad', (0.10, 0.10, 0.02), (0, 0, -0.09), 'metal', foot)
        self.h.setdefault('jacks', []).append((foot, drop))
        return foot


# =========================================================================== vehicles
# Dimensions in tiles (1 tile ~ 4 m). Light vehicles ~1.2-1.5 long, heavy ~1.7.

def us_car(B):
    """Recon rover: compact 4x4 scout, faceted hull, telescoping sensor mast, small RWS autocannon."""
    B.axle_set((0.36, -0.34), 0.27, 0.115, 0.1)
    B.pr('hull', [(-0.56, 0.14), (0.44, 0.14), (0.62, 0.23), (0.54, 0.33), (0.18, 0.40), (-0.50, 0.40),
                  (-0.58, 0.30)], 0.50, bevel=0.018)
    B.b('roof_plate', (0.46, 0.40, 0.03), (-0.14, 0, 0.415), 'paint2')
    B.b('roof_team', (0.20, 0.44, 0.035), (0.18, 0, 0.405), 'team', rot=(0, -0.18, 0))
    for sy in (1, -1):
        B.b(f'side_team_{sy}', (0.62, 0.02, 0.06), (-0.04, sy * 0.255, 0.26), 'team')
        B.b(f'fender_{sy}', (0.30, 0.10, 0.03), (0.36, sy * 0.27, 0.25), 'paint2', detach=True, missing=True)
        B.b(f'stow_{sy}', (0.28, 0.05, 0.09), (-0.30, sy * 0.265, 0.31), 'trim', detach=True, missing=True)
    B.b('visor', (0.02, 0.40, 0.06), (0.47, 0, 0.35), 'glass', rot=(0, -0.9, 0), bevel=0, missing=True)
    B.headlights(0.61, 0.17, 0.22)
    B.c('spare', 0.10, 0.07, (-0.61, 0, 0.30), 'dark', rot=(0, math.pi / 2, 0), verts=14, missing=True)
    # telescoping sensor mast (rear) with EO head
    B.c('mast_base', 0.04, 0.08, (-0.40, 0.10, 0.46), 'trim')
    mast = B.e('mast', (-0.40, 0.10, 0.50))
    B.c('mast_tube', 0.02, 0.36, (0, 0, 0.18), 'metal', mast, verts=8, missing=True)
    B.b('mast_head', (0.08, 0.12, 0.07), (0.01, 0, 0.38), 'paint2', mast, missing=True)
    B.b('mast_lens', (0.012, 0.08, 0.04), (0.052, 0, 0.38), 'lens', mast, bevel=0, missing=True)
    B.h['mast'] = mast
    B.antenna('whip', (-0.52, -0.18, 0.40))
    B.begin_turret((0.02, 0.0), 0.43)
    B.c('ring', 0.10, 0.04, (0, 0, 0.0), 'trim', verts=14)
    B.b('rws', (0.20, 0.16, 0.10), (0.0, 0, 0.07), 'paint', taper=(0.85, 0.9))
    B.b('rws_team', (0.21, 0.165, 0.03), (0.0, 0, 0.06), 'team')
    B.b('rws_sight', (0.07, 0.06, 0.06), (0.02, -0.10, 0.10), 'paint2')
    B.b('rws_lens', (0.01, 0.045, 0.035), (0.055, -0.10, 0.10), 'lens', bevel=0)
    B.b('ammo_box', (0.08, 0.06, 0.06), (-0.04, 0.10, 0.07), 'trim')
    B.gun_mount((0.08, 0, 0.07), 0.34, r=0.016, brake=False, sleeve=False)
    B.end_turret()
    B.recoil = 0.03
    B.hardpoint('healthbar', (0, 0, 0.78), ['hull', 'whole'])


def us_apc(B):
    """Infantry carrier: tracked box hull, raked glacis, rear ramp, small MG turret, trim vane."""
    B.tracks(1.36, 0.30, r=0.08, n_wheels=5, band_h=0.18, width=0.17)
    B.pr('hull', [(-0.70, 0.13), (0.52, 0.13), (0.72, 0.26), (0.54, 0.47), (-0.70, 0.47)], 0.64, bevel=0.02)
    B.b('roof', (1.10, 0.60, 0.025), (-0.12, 0, 0.48), 'paint2')
    for sy in (1, -1):
        B.b(f'skirt_{sy}', (1.20, 0.035, 0.12), (0.0, sy * 0.40, 0.24), 'team', rot=(0.08 * sy, 0, 0), bevel=0.01)
        B.b(f'bin_{sy}', (0.42, 0.06, 0.10), (-0.30, sy * 0.35, 0.40), 'trim', detach=True, missing=True)
        for k in range(3):
            B.b(f'periscope_{sy}_{k}', (0.05, 0.03, 0.03), (-0.40 + k * 0.22, sy * 0.30, 0.505), 'glass', bevel=0)
    B.b('trim_vane', (0.03, 0.56, 0.16), (0.66, 0, 0.36), 'paint2', rot=(0, -0.6, 0), detach=True, missing=True)
    B.headlights(0.70, 0.22, 0.30)
    B.b('commander_hatch', (0.14, 0.14, 0.03), (0.18, -0.16, 0.50), 'trim')
    # rear ramp hinged at the hull floor
    ramp = B.e('ramp_hinge', (-0.70, 0, 0.13))
    B.b('ramp', (0.03, 0.54, 0.32), (-0.015, 0, 0.16), 'paint2', ramp)
    B.b('ramp_team', (0.035, 0.30, 0.05), (-0.02, 0, 0.26), 'team', ramp)
    B.h['doors'] = [(ramp, 'y', 1.45)]
    B.b('ramp_interior', (0.04, 0.50, 0.28), (-0.66, 0, 0.29), 'dark')
    B.hardpoint('exit', (-1.0, 0, 0), ['hull', 'whole'])
    B.begin_turret((0.10, 0.08), 0.49)
    B.c('ring', 0.11, 0.04, (0, 0, 0), 'trim', verts=14)
    B.sl('turret', [(0.14, 0.0), (0.08, 0.11), (-0.12, 0.11), (-0.14, 0.0), (-0.12, -0.11), (0.08, -0.11)], 0.02, 0.12,
         'paint', top_scale=0.85)
    B.b('turret_team', (0.26, 0.23, 0.025), (0.0, 0, 0.055), 'team')
    B.gun_mount((0.12, 0, 0.07), 0.26, r=0.012, brake=False, sleeve=False)
    B.end_turret()
    B.recoil = 0.02
    B.hardpoint('healthbar', (0, 0, 0.78), ['hull', 'whole'])


def us_artillery(B):
    """Precision howitzer: tracked, big rear-set boxy turret, long barrel, spade at rear."""
    B.tracks(1.62, 0.34, r=0.085, n_wheels=6, band_h=0.19, width=0.19)
    B.pr('hull', [(-0.80, 0.13), (0.62, 0.13), (0.82, 0.25), (0.66, 0.36), (-0.80, 0.36)], 0.72, bevel=0.02)
    B.b('engine_deck', (0.40, 0.60, 0.03), (0.48, 0, 0.375), 'trim')
    for k in range(4):
        B.b(f'grille_{k}', (0.32, 0.03, 0.01), (0.48, -0.18 + k * 0.12, 0.392), 'dark', bevel=0)
    B.headlights(0.80, 0.26, 0.27)
    for sy in (1, -1):
        B.b(f'skirt_{sy}', (1.40, 0.035, 0.12), (0.0, sy * 0.44, 0.24), 'team', rot=(0.08 * sy, 0, 0))
    spade = B.e('spade_hinge', (-0.80, 0, 0.18))
    B.b('spade', (0.03, 0.60, 0.18), (-0.02, 0, -0.07), 'metal', spade)
    B.h['spade'] = spade
    B.b('travel_lock', (0.04, 0.05, 0.22), (0.66, 0, 0.47), 'metal', detach=True, missing=True)
    B.begin_turret((-0.22, 0.0), 0.37)
    B.sl('turret', [(0.36, 0.26), (0.36, -0.26), (-0.42, -0.30), (-0.42, 0.30)], 0.0, 0.32, 'paint', top_scale=0.9,
         top_shift=(-0.03, 0))
    B.b('turret_team_L', (0.62, 0.02, 0.08), (-0.03, 0.29, 0.18), 'team')
    B.b('turret_team_R', (0.62, 0.02, 0.08), (-0.03, -0.29, 0.18), 'team')
    B.b('bustle', (0.18, 0.50, 0.20), (-0.50, 0, 0.14), 'paint2')
    B.b('cmd_cupola', (0.12, 0.12, 0.06), (-0.10, 0.14, 0.35), 'paint2')
    B.c('rws_mg', 0.01, 0.18, (-0.02, 0.14, 0.40), 'metal', rot=(0, math.pi / 2, 0), verts=6)
    B.antenna('whip', (-0.36, -0.22, 0.32), 0.38)
    B.gun_mount((0.38, 0, 0.18), 1.02, r=0.032)
    B.end_turret()
    B.aim_elev = math.radians(24)
    B.recoil = 0.14
    B.hardpoint('healthbar', (0, 0, 0.86), ['hull', 'whole'])


def us_aa(B):
    """Skyguard: 6x6 wheeled, turret with rotating-radar head and twin 4-cell missile pods."""
    B.axle_set((0.44, 0.10, -0.30), 0.31, 0.115, 0.1)
    B.pr('hull', [(-0.66, 0.16), (0.52, 0.16), (0.70, 0.26), (0.58, 0.38), (-0.66, 0.38)], 0.62, bevel=0.02)
    B.cab('cab', 0.22, 0.62, 0.30, 0.38, 0.56, 'paint')
    B.b('cab_team', (0.30, 0.52, 0.025), (0.40, 0, 0.565), 'team')
    B.headlights(0.69, 0.22, 0.27)
    for sy in (1, -1):
        B.b(f'box_{sy}', (0.46, 0.06, 0.12), (-0.28, sy * 0.32, 0.30), 'trim', detach=True, missing=True)
    B.begin_turret((-0.26, 0.0), 0.40)
    B.c('ring', 0.16, 0.05, (0, 0, 0.0), 'trim', verts=16)
    B.b('turret_body', (0.34, 0.28, 0.16), (0.0, 0, 0.10), 'paint', taper=(0.85, 0.9))
    B.b('turret_team', (0.35, 0.29, 0.03), (0.0, 0, 0.09), 'team')
    radar = B.e('radar', (-0.05, 0, 0.20))
    B.c('radar_post', 0.02, 0.10, (0, 0, 0.05), 'metal', radar, verts=8)
    B.b('radar_face', (0.03, 0.26, 0.14), (0, 0, 0.16), 'paint2', radar, rot=(0, -0.3, 0))
    B.b('radar_array', (0.005, 0.22, 0.11), (0.018, 0, 0.165), 'lens', radar, rot=(0, -0.3, 0), bevel=0)
    B.h['radar'] = radar
    B.gun = B.e('gun_root', (0.05, 0, 0.12))
    for sy in (1, -1):
        B.b(f'pod_{sy}', (0.34, 0.12, 0.12), (0.10, sy * 0.21, 0.02), 'paint2', B.gun)
        for i in range(2):
            for j in range(2):
                B.c(f'cell_{sy}_{i}_{j}', 0.022, 0.02, (0.275, sy * 0.21 + (i - 0.5) * 0.055, 0.02 + (j - 0.5) * 0.055),
                    'dark', B.gun, rot=(0, math.pi / 2, 0), verts=8)
        mis = B.c(f'missile_out_{sy}', 0.02, 0.22, (0.40, sy * 0.21, 0.05), 'missile', B.gun, fx='missile_out',
                  rot=(0, math.pi / 2, 0), verts=8)
    B.muzzle(0.30, B.gun, y=0.21, z=0.02)
    B.end_turret()
    B.aim_elev = math.radians(18)
    B.recoil = 0.02
    B.hardpoint('healthbar', (0, 0, 0.84), ['hull', 'whole'])


def us_repair(B):
    """Recovery vehicle: tracked hull, front dozer blade, rear slewing crane with hook, winch."""
    B.tracks(1.44, 0.31, r=0.085, n_wheels=5, band_h=0.18, width=0.18)
    B.pr('hull', [(-0.72, 0.13), (0.56, 0.13), (0.74, 0.25), (0.60, 0.42), (-0.72, 0.42)], 0.64, bevel=0.02)
    B.cab('cab', 0.14, 0.58, 0.28, 0.42, 0.58, 'paint', slope=0.1)
    B.b('cab_team', (0.30, 0.50, 0.025), (0.34, 0, 0.585), 'team')
    blade = B.e('blade_hinge', (0.74, 0, 0.20))
    B.b('blade', (0.05, 0.80, 0.18), (0.06, 0, -0.04), 'paint2', blade, rot=(0, -0.25, 0))
    B.b('blade_edge', (0.06, 0.80, 0.025), (0.09, 0, -0.13), 'steel', blade)
    B.h['blade'] = blade
    B.b('winch', (0.16, 0.24, 0.10), (-0.52, 0, 0.47), 'trim')
    B.headlights(0.72, 0.24, 0.32)
    for sy in (1, -1):
        B.b(f'skirt_{sy}', (1.20, 0.035, 0.12), (0.0, sy * 0.415, 0.24), 'team', rot=(0.08 * sy, 0, 0))
    slew = B.e('crane_slew', (-0.34, 0, 0.44))
    B.c('crane_base', 0.10, 0.08, (0, 0, 0.04), 'trim', slew, verts=12)
    boom = B.e('crane_boom', (0, 0, 0.08), slew)
    B.b('boom', (0.70, 0.08, 0.08), (0.30, 0, 0), 'team', boom)
    B.b('boom_tip', (0.10, 0.10, 0.10), (0.66, 0, 0), 'paint2', boom)
    hook = B.e('hook', (0.66, 0, -0.05), boom)
    B.c('cable', 0.006, 0.26, (0, 0, -0.13), 'dark', hook, verts=5, bevel=0)
    B.b('hook_block', (0.05, 0.05, 0.07), (0, 0, -0.29), 'steel', hook)
    B.h.update(slew=slew, boom=boom, hook=hook)
    boom.rotation_euler = (0, -0.35, 0)
    slew.rotation_euler = (0, 0, math.pi)
    for k in range(3):
        B.b(f'spark_{k}', (0.03, 0.03, 0.03), (0.66 + 0.04 * k, 0.03 * (k - 1), -0.33 - 0.02 * k), 'spark', boom,
            fx='sparks', bevel=0)
    B.hardpoint('work', (-1.0, 0, 0.10), ['body', 'whole'])
    B.hardpoint('healthbar', (0, 0, 0.84), ['body', 'whole'])


def launcher_truck(B, length, axles, half_w, cab_len, erector_len, missiles=1, style='US'):
    """Shared 8x8 missile-carrier layout; each faction styles cab, rails and canisters differently."""
    B.axle_set(axles, half_w, 0.12, 0.1)
    B.b('frame', (length, half_w * 1.5, 0.10), (0, 0, 0.21), 'dark')
    front = length / 2
    cab_m = 'paint'
    if style == 'SY':
        cab_m = 'primer'
    B.cab('cab', front - cab_len, front, half_w + 0.02, 0.24, 0.52, cab_m, slope=0.08 if style != 'SA' else 0.02)
    B.b('cab_team', (cab_len * 0.8, (half_w + 0.02) * 1.6, 0.025), (front - cab_len / 2 - 0.03, 0, 0.525), 'team')
    B.headlights(front + 0.005, half_w - 0.06, 0.30)
    B.b('bed', (length - cab_len - 0.06, half_w * 2 + 0.04, 0.08), (-cab_len / 2 - 0.03, 0, 0.30), 'paint2')
    for sy in (1, -1):
        B.b(f'fuel_{sy}', (0.30, 0.07, 0.10), (front - cab_len - 0.26, sy * (half_w + 0.04), 0.28), 'trim',
            detach=True, missing=True)
    rear = -length / 2
    for x in (front - cab_len - 0.05, rear + 0.10):
        for sy in (1, -1):
            B.jack(f'jack_{x:+.2f}_{sy}', x, sy * (half_w + 0.10), 0.26, 0.12)
    pivot = B.e('erector_pivot', (rear + 0.08, 0, 0.40))
    B.h['erector'] = pivot
    cradle_len = erector_len
    B.b('cradle', (cradle_len, 0.10, 0.05), (cradle_len / 2, 0, 0.0), 'metal', pivot)
    B.b('ram', (0.40, 0.05, 0.05), (0.30, 0, -0.07), 'steel', pivot, rot=(0, 0.35, 0))
    mis_list = []
    for i in range(missiles):
        off = (i - (missiles - 1) / 2) * 0.17
        if style in ('US', 'SY', 'IR'):
            body = B.c(f'missile_{i}', 0.055 if style != 'SY' else 0.065, cradle_len * 0.92,
                       (cradle_len * 0.52, off, 0.08), 'missile' if style != 'SY' else 'primer', pivot,
                       rot=(0, math.pi / 2, 0), verts=14)
            tip = B.c(f'warhead_{i}', 0.055 if style != 'SY' else 0.065, 0.16, (cradle_len * 0.98 + 0.08, off, 0.08),
                      'warhead', pivot, rot=(0, math.pi / 2, 0), verts=14, radius_top=0.01)
            fins = [B.b(f'fin_{i}_{k}', (0.10, 0.16 if k == 0 else 0.02, 0.02 if k == 0 else 0.16),
                        (cradle_len * 0.12, off, 0.08), 'paint2', pivot) for k in range(2)]
            mis_list.append([body, tip] + fins)
        else:  # SA sealed canisters
            can = B.b(f'canister_{i}', (cradle_len * 0.95, 0.16, 0.16), (cradle_len * 0.5, off, 0.10), 'paint', pivot)
            band = B.b(f'canister_team_{i}', (0.08, 0.17, 0.17), (cradle_len * 0.8, off, 0.10), 'team', pivot)
            cap = B.b(f'canister_cap_{i}', (0.02, 0.14, 0.14), (cradle_len * 0.975 + 0.01, off, 0.10), 'trim', pivot)
            mis_list.append([cap])
    B.h['missiles'] = mis_list
    for i in range(missiles):
        off = (i - (missiles - 1) / 2) * 0.17
        B.c(f'plume_{i}', 0.07, 0.55, (-0.25, off, 0.08), 'plume', pivot, fx=f'plume_{i}', rot=(0, math.pi / 2, 0),
            verts=12, radius_top=0.14, bevel=0)
        B.s(f'smoke_{i}', 0.22, (-0.35, off, 0.0), 'smoke', pivot, fx=f'smoke_{i}', scale=(1.4, 1.0, 0.7))
    B.hardpoint('launch', (cradle_len + 0.10, 0, 0.08), ['body', 'whole'], parent=pivot)
    B.hardpoint('healthbar', (0, 0, 0.92), ['body', 'whole'])
    return pivot


def us_launcher(B):
    """Precision missile carrier: 8x8, flat angular cab, single long missile on erector."""
    launcher_truck(B, 1.62, (0.56, 0.30, -0.18, -0.44), 0.30, 0.42, 1.08, missiles=1, style='US')
    B.antenna('whip', (0.50, -0.24, 0.53))
    B.b('ecu', (0.20, 0.30, 0.14), (0.18, 0, 0.41), 'trim')


def ir_car(B):
    """Patrol vehicle: military 4x4, rounded hood, armoured doors, ring-mounted autocannon with curved shield."""
    B.axle_set((0.36, -0.34), 0.26, 0.11, 0.1)
    B.b('chassis', (1.12, 0.40, 0.08), (0, 0, 0.14), 'dark')
    B.b('hood', (0.34, 0.50, 0.14), (0.40, 0, 0.25), 'paint', taper=(0.86, 0.9), bevel=0.04)
    B.b('grille', (0.03, 0.40, 0.10), (0.575, 0, 0.23), 'trim')
    B.c('hood_spare', 0.08, 0.05, (0.40, 0, 0.345), 'dark', verts=14, detach=True, missing=True)
    B.cab('cab', -0.12, 0.24, 0.25, 0.18, 0.44, 'paint')
    B.b('roof_team', (0.26, 0.42, 0.025), (0.05, 0, 0.445), 'team')
    B.b('bed', (0.52, 0.48, 0.14), (-0.38, 0, 0.26), 'paint2')
    for sy in (1, -1):
        B.b(f'door_{sy}', (0.26, 0.02, 0.16), (0.06, sy * 0.255, 0.28), 'paint2', missing=True)
        B.b(f'bed_team_{sy}', (0.50, 0.025, 0.04), (-0.38, sy * 0.245, 0.30), 'team')
        B.c(f'jerry_{sy}', 0.035, 0.10, (-0.60, sy * 0.18, 0.40), 'era', verts=8, missing=True)
    B.b('roll_bar', (0.03, 0.46, 0.03), (-0.16, 0, 0.52), 'metal')
    for sy in (1, -1):
        B.b(f'roll_post_{sy}', (0.03, 0.03, 0.30), (-0.16, sy * 0.215, 0.37), 'metal')
    B.headlights(0.58, 0.17, 0.26)
    B.antenna('whip', (-0.60, -0.22, 0.33), 0.4)
    B.begin_turret((-0.36, 0.0), 0.36)
    B.c('ring', 0.12, 0.03, (0, 0, 0.0), 'metal', verts=16)
    B.c('pedestal', 0.035, 0.14, (0, 0, 0.07), 'metal', verts=8)
    B.gun = B.e('gun_root', (0.0, 0, 0.14))
    B.b('receiver', (0.20, 0.08, 0.08), (0.02, 0, 0), 'metal', B.gun)
    B.c('barrel', 0.018, 0.40, (0.30, 0, 0.01), 'metal', B.gun, rot=(0, math.pi / 2, 0), verts=10)
    B.c('brake', 0.026, 0.05, (0.51, 0, 0.01), 'dark', B.gun, rot=(0, math.pi / 2, 0), verts=10)
    B.c('shield', 0.18, 0.16, (0.12, 0, 0.02), 'paint', B.gun, verts=14, radius_top=0.17)
    B.b('shield_cut', (0.30, 0.40, 0.18), (-0.06, 0, 0.02), 'paint', B.gun, bevel=0) if False else None
    B.b('shield_team', (0.03, 0.30, 0.04), (0.16, 0, 0.08), 'team', B.gun)
    B.b('ammo_can', (0.07, 0.07, 0.07), (-0.04, 0.08, -0.03), 'era', B.gun)
    B.muzzle(0.55, B.gun, z=0.01)
    B.end_turret()
    B.recoil = 0.03
    B.hardpoint('healthbar', (0, 0, 0.76), ['hull', 'whole'])


def ir_apc(B):
    """Armoured troop carrier: 8x8 boat-nosed hull, conical MG turret, twin side doors, trim vane."""
    B.axle_set((0.50, 0.24, -0.16, -0.42), 0.29, 0.105, 0.09)
    B.pr('hull', [(-0.74, 0.16), (0.52, 0.16), (0.78, 0.26), (0.56, 0.44), (-0.70, 0.44), (-0.76, 0.34)], 0.66,
         bevel=0.03)
    B.sl('hull_top', [(0.50, 0.26), (0.50, -0.26), (-0.68, -0.26), (-0.68, 0.26)], 0.44, 0.47, 'paint2')
    B.b('vane', (0.03, 0.54, 0.14), (0.70, 0, 0.36), 'paint2', rot=(0, -0.5, 0), detach=True, missing=True)
    B.headlights(0.76, 0.20, 0.30)
    for sy in (1, -1):
        B.b(f'side_team_{sy}', (0.90, 0.02, 0.05), (-0.08, sy * 0.335, 0.39), 'team')
        B.era_row(f'bricks_{sy}', -0.62, -0.20, sy * 0.34, 0.30, 4)
        hinge = B.e(f'door_hinge_{sy}', (0.10, sy * 0.335, 0.23))
        B.b(f'door_{sy}', (0.22, 0.025, 0.16), (-0.11, 0, 0.0), 'paint', hinge)
        B.h.setdefault('doors', []).append((hinge, 'z', -1.3 * sy))
        B.b(f'door_hole_{sy}', (0.20, 0.01, 0.14), (-0.01, sy * 0.328, 0.23), 'dark')
    for k in range(3):
        B.b(f'hatch_{k}', (0.12, 0.12, 0.02), (-0.44 + k * 0.18, (-1) ** k * 0.12, 0.475), 'trim')
    B.hardpoint('exit', (0.0, 0.7, 0), ['hull', 'whole'])
    B.begin_turret((0.18, 0.0), 0.47)
    B.c('turret', 0.13, 0.12, (0, 0, 0.06), 'paint', verts=10, radius_top=0.08, smooth=False)
    B.c('turret_team', 0.132, 0.03, (0, 0, 0.05), 'team', verts=10, smooth=False)
    B.gun_mount((0.10, 0, 0.07), 0.24, r=0.012, brake=False, sleeve=False)
    B.end_turret()
    B.recoil = 0.02
    B.hardpoint('healthbar', (0, 0, 0.76), ['hull', 'whole'])


def ir_tank(B):
    """Bastion tank: low hull, rounded cast turret with ERA bricks, long barrel with sleeve, rubber side flaps."""
    B.tracks(1.58, 0.34, r=0.08, n_wheels=6, band_h=0.18, width=0.19)
    B.pr('hull', [(-0.80, 0.12), (0.60, 0.12), (0.82, 0.22), (0.60, 0.33), (-0.78, 0.35), (-0.82, 0.28)], 0.74,
         bevel=0.02)
    B.era_row('glacis_era', 0.56, 0.78, 0.0, 0.29, 1)
    for k in range(5):
        B.b(f'glacis_brick_{k}', (0.09, 0.12, 0.03), (0.66, -0.26 + k * 0.13, 0.285), 'era', rot=(0, -0.45, 0),
            missing=True)
    for sy in (1, -1):
        B.b(f'flap_{sy}', (1.36, 0.03, 0.10), (0.0, sy * 0.45, 0.23), 'dark', rot=(0.06 * sy, 0, 0), detach=True,
            missing=True)
        B.b(f'flap_team_{sy}', (1.36, 0.032, 0.035), (0.0, sy * 0.452, 0.27), 'team', rot=(0.06 * sy, 0, 0))
        B.c(f'drum_{sy}', 0.07, 0.30, (-0.66, sy * 0.22, 0.40), 'era', rot=(0, math.pi / 2, 0), verts=12, detach=True,
            missing=True)
    B.b('rear_basket', (0.16, 0.46, 0.08), (-0.64, 0, 0.40), 'slat', missing=True)
    B.headlights(0.78, 0.26, 0.27)
    B.begin_turret((0.0, 0.0), 0.34)
    B.s('turret_dome', 0.36, (0.0, 0, 0.0), 'paint', scale=(1.05, 0.85, 0.40), segs=16)
    B.c('turret_team', 0.33, 0.035, (0, 0, 0.05), 'team', verts=18)
    for sy in (1, -1):
        for k in range(3):
            B.b(f'turret_era_{sy}_{k}', (0.10, 0.08, 0.06), (0.22 - k * 0.02, sy * (0.10 + k * 0.08), 0.10), 'era',
                rot=(0, -0.3, 0.35 * sy), missing=True)
    B.c('cupola', 0.06, 0.06, (-0.10, 0.12, 0.16), 'paint2', verts=12)
    B.b('sight', (0.08, 0.06, 0.06), (0.10, -0.17, 0.16), 'paint2')
    B.b('sight_lens', (0.01, 0.05, 0.035), (0.14, -0.17, 0.16), 'lens', bevel=0)
    B.c('hmg', 0.01, 0.20, (-0.04, 0.12, 0.22), 'metal', rot=(0, math.pi / 2, 0), verts=6, missing=True)
    B.smoke_dischargers(0.20, 0.30, 0.07)
    B.antenna('whip', (-0.26, -0.18, 0.14), 0.36)
    B.gun_mount((0.30, 0, 0.06), 0.92, r=0.028)
    B.end_turret()
    B.recoil = 0.10
    B.hardpoint('healthbar', (0, 0, 0.64), ['hull', 'whole'])


def ir_artillery(B):
    """Rocket artillery: 6x6 truck with 4x4 tube rack on a turntable; deploy jacks; four-round volley."""
    B.axle_set((0.48, -0.10, -0.38), 0.29, 0.11, 0.1)
    B.b('frame', (1.40, 0.44, 0.10), (0, 0, 0.21), 'dark')
    B.cab('cab', 0.30, 0.72, 0.30, 0.24, 0.52, 'paint', slope=0.12)
    B.b('cab_team', (0.30, 0.48, 0.025), (0.48, 0, 0.525), 'team')
    B.b('cab_grille', (0.03, 0.40, 0.12), (0.725, 0, 0.32), 'trim')
    B.headlights(0.73, 0.22, 0.32)
    B.b('bed', (0.92, 0.62, 0.08), (-0.20, 0, 0.30), 'paint2')
    for sy in (1, -1):
        B.jack(f'jack_r_{sy}', -0.58, sy * 0.40, 0.26, 0.12)
        B.jack(f'jack_f_{sy}', 0.20, sy * 0.40, 0.26, 0.12)
        B.c(f'reload_{sy}', 0.035, 0.40, (-0.22, sy * 0.28, 0.40), 'tube', rot=(0, math.pi / 2, 0), verts=8,
            detach=True, missing=True)
    turn = B.e('rack_turntable', (-0.24, 0, 0.36))
    B.c('turntable', 0.20, 0.05, (0, 0, 0.0), 'trim', turn, verts=16)
    rack = B.e('rack', (-0.10, 0, 0.08), turn)
    B.b('rack_frame', (0.66, 0.46, 0.34), (0.05, 0, 0.14), 'paint', rack)
    B.b('rack_team', (0.67, 0.47, 0.04), (0.05, 0, 0.30), 'team', rack)
    B.h['rack'] = rack
    B.h['tube_plumes'] = []
    for i in range(4):
        for j in range(4):
            y, z = (i - 1.5) * 0.105, 0.03 + j * 0.075
            B.c(f'tube_{i}_{j}', 0.03, 0.02, (0.385, y, z), 'dark', rack, rot=(0, math.pi / 2, 0), verts=8)
            if j == 3:
                B.c(f'tube_plume_{i}', 0.05, 0.40, (-0.36, y, z), 'plume', rack, fx=f'tube_plume_{i}',
                    rot=(0, math.pi / 2, 0), verts=10, radius_top=0.10, bevel=0)
                B.c(f'rocket_{i}', 0.022, 0.24, (0.52, y, z), 'missile', rack, fx=f'rocket_{i}',
                    rot=(0, math.pi / 2, 0), verts=8)
    B.s('volley_smoke', 0.30, (-0.40, 0, 0.10), 'smoke', rack, fx='volley_smoke', scale=(1.5, 1.2, 0.8))
    B.hardpoint('muzzle', (0.40, 0, 0.14), ['body', 'whole'], parent=rack)
    B.hardpoint('healthbar', (0, 0, 0.90), ['body', 'whole'])


def ir_aa(B):
    """Mobile SAM: tracked chassis, turret with 2x2 canted missile canisters and folding radar panel."""
    B.tracks(1.44, 0.32, r=0.08, n_wheels=6, band_h=0.18, width=0.18)
    B.pr('hull', [(-0.72, 0.12), (0.56, 0.12), (0.74, 0.22), (0.56, 0.36), (-0.72, 0.36)], 0.70, bevel=0.02)
    B.headlights(0.72, 0.24, 0.26)
    for sy in (1, -1):
        B.b(f'flap_{sy}', (1.22, 0.03, 0.10), (0.0, sy * 0.43, 0.23), 'dark', rot=(0.06 * sy, 0, 0), missing=True)
        B.b(f'flap_team_{sy}', (1.22, 0.032, 0.035), (0.0, sy * 0.432, 0.27), 'team', rot=(0.06 * sy, 0, 0))
    B.slat_cage('rear_slat', -0.70, -0.40, 0.36, 0.20, 0.38, 4)
    B.begin_turret((-0.10, 0.0), 0.37)
    B.c('turret', 0.28, 0.14, (0, 0, 0.07), 'paint', verts=12, radius_top=0.24, smooth=False)
    B.c('turret_team', 0.282, 0.035, (0, 0, 0.06), 'team', verts=12, smooth=False)
    radar = B.e('radar_fold', (-0.18, 0, 0.16))
    B.b('radar_panel', (0.04, 0.30, 0.22), (0, 0, 0.12), 'paint2', radar, rot=(0, -0.25, 0))
    B.b('radar_face', (0.005, 0.26, 0.18), (0.024, 0, 0.125), 'lens', radar, rot=(0, -0.25, 0), bevel=0)
    B.h['radar'] = radar
    B.gun = B.e('gun_root', (0.06, 0, 0.16))
    for sy in (1, -1):
        for j in range(2):
            B.b(f'canister_{sy}_{j}', (0.44, 0.10, 0.10), (0.10, sy * 0.19, 0.02 + j * 0.11), 'paint2', B.gun)
            B.b(f'canister_cap_{sy}_{j}', (0.015, 0.085, 0.085), (0.325, sy * 0.19, 0.02 + j * 0.11), 'warhead', B.gun,
                bevel=0)
        B.c(f'missile_out_{sy}', 0.025, 0.28, (0.48, sy * 0.19, 0.13), 'missile', B.gun, fx='missile_out',
            rot=(0, math.pi / 2, 0), verts=8)
    B.muzzle(0.34, B.gun, y=0.19, z=0.13)
    B.end_turret()
    B.aim_elev = math.radians(28)
    B.recoil = 0.01
    B.hardpoint('healthbar', (0, 0, 0.86), ['hull', 'whole'])


def ir_repair(B):
    """Maintenance truck: 6x6 workshop box with lifting side panels, rear crane and generator."""
    B.axle_set((0.46, -0.14, -0.40), 0.28, 0.11, 0.1)
    B.b('frame', (1.36, 0.42, 0.10), (0, 0, 0.21), 'dark')
    B.cab('cab', 0.32, 0.70, 0.29, 0.24, 0.52, 'paint')
    B.b('cab_team', (0.28, 0.46, 0.025), (0.49, 0, 0.525), 'team')
    B.headlights(0.71, 0.21, 0.32)
    B.b('workshop', (0.86, 0.60, 0.34), (-0.20, 0, 0.45), 'paint2')
    B.b('workshop_team', (0.87, 0.61, 0.04), (-0.20, 0, 0.60), 'team')
    B.h['panels'] = []
    for sy in (1, -1):
        hinge = B.e(f'panel_hinge_{sy}', (-0.20, sy * 0.305, 0.60))
        B.b(f'panel_{sy}', (0.70, 0.02, 0.26), (0, 0, -0.13), 'paint', hinge)
        B.h['panels'].append((hinge, sy))
        B.b(f'bench_{sy}', (0.66, 0.08, 0.20), (-0.20, sy * 0.25, 0.42), 'trim')
        for k in range(4):
            B.b(f'tool_{sy}_{k}', (0.03, 0.02, 0.10), (-0.46 + k * 0.16, sy * 0.29, 0.50), 'steel', bevel=0)
    B.c('generator', 0.06, 0.16, (0.14, 0.22, 0.34), 'era', rot=(0, math.pi / 2, 0), verts=10)
    slew = B.e('crane_slew', (-0.58, 0, 0.62))
    B.c('crane_base', 0.07, 0.06, (0, 0, 0.03), 'trim', slew, verts=10)
    boom = B.e('crane_boom', (0, 0, 0.06), slew)
    B.b('boom', (0.46, 0.06, 0.06), (0.20, 0, 0), 'paint', boom)
    hook = B.e('hook', (0.44, 0, -0.03), boom)
    B.c('cable', 0.005, 0.22, (0, 0, -0.11), 'dark', hook, verts=5, bevel=0)
    B.b('hook_block', (0.04, 0.04, 0.06), (0, 0, -0.24), 'steel', hook)
    B.h.update(slew=slew, boom=boom, hook=hook)
    slew.rotation_euler = (0, 0, math.pi)
    boom.rotation_euler = (0, -0.25, 0)
    for k in range(3):
        B.b(f'spark_{k}', (0.03, 0.03, 0.03), (0.44 + 0.03 * k, 0.03 * (k - 1), -0.28), 'spark', boom, fx='sparks',
            bevel=0)
    B.hardpoint('work', (-1.0, 0, 0.1), ['body', 'whole'])
    B.hardpoint('healthbar', (0, 0, 0.92), ['body', 'whole'])


def ir_launcher(B):
    """Tactical missile launcher: heavy 8x8, twin missiles side by side on a banked two-charge erector."""
    launcher_truck(B, 1.74, (0.62, 0.36, -0.18, -0.46), 0.32, 0.46, 1.16, missiles=2, style='IR')
    B.slat_cage('cab_slat', 0.44, 0.84, 0.36, 0.26, 0.46, 5)
    B.antenna('whip', (0.52, -0.26, 0.53))


def sy_apc(B):
    """Troop technical: armoured troop box welded on a truck chassis, firing ports, roof gun, rear doors."""
    B.axle_set((0.44, -0.30), 0.28, 0.12, 0.1)
    B.b('chassis', (1.30, 0.42, 0.08), (0, 0, 0.15), 'dark')
    B.b('hood', (0.30, 0.50, 0.14), (0.48, 0, 0.26), 'primer', taper=(0.9, 0.94), bevel=0.03)
    B.b('bull_bar', (0.04, 0.52, 0.03), (0.66, 0, 0.20), 'metal')
    B.b('grille_plate', (0.02, 0.44, 0.10), (0.64, 0, 0.26), 'rust', rot=(0, -0.2, 0))
    B.cab('cab', 0.12, 0.34, 0.26, 0.19, 0.46, 'paint', slope=0.06)
    B.b('box', (0.74, 0.60, 0.34), (-0.26, 0, 0.40), 'paint2', taper=(0.95, 0.9))
    B.b('box_plate_L', (0.34, 0.02, 0.22), (-0.10, 0.296, 0.40), 'rust', rot=(0.05, 0, 0))
    B.b('box_plate_R', (0.40, 0.02, 0.20), (-0.36, -0.296, 0.41), 'primer', rot=(-0.05, 0, 0))
    B.b('box_team', (0.75, 0.61, 0.04), (-0.26, 0, 0.555), 'team')
    for sy in (1, -1):
        for k in range(3):
            B.b(f'port_{sy}_{k}', (0.06, 0.012, 0.03), (-0.52 + k * 0.22, sy * 0.30, 0.46), 'dark', bevel=0)
    B.sandbags('hood_bags', 0.46, 0, 0.36, 3, 2)
    for sy in (1, -1):
        hinge = B.e(f'rear_door_hinge_{sy}', (-0.63, sy * 0.28, 0.40))
        B.b(f'rear_door_{sy}', (0.02, 0.27, 0.30), (0, -sy * 0.135, 0.0), 'paint', hinge)
        B.h.setdefault('doors', []).append((hinge, 'z', sy * 1.5))
    B.b('rear_opening', (0.01, 0.52, 0.28), (-0.625, 0, 0.40), 'dark')
    B.c('spare', 0.10, 0.07, (-0.20, 0, 0.60), 'dark', verts=14, missing=True)
    B.headlights(0.63, 0.18, 0.26)
    B.hardpoint('exit', (-1.0, 0, 0), ['hull', 'whole'])
    B.begin_turret((0.02, 0.0), 0.58)
    B.c('ring', 0.10, 0.03, (0, 0, 0), 'metal', verts=12)
    B.gun = B.e('gun_root', (0, 0, 0.10))
    B.b('receiver', (0.16, 0.07, 0.07), (0.02, 0, 0), 'metal', B.gun)
    B.c('barrel', 0.014, 0.30, (0.24, 0, 0.01), 'metal', B.gun, rot=(0, math.pi / 2, 0), verts=8)
    B.b('shield', (0.02, 0.26, 0.14), (0.12, 0, 0.03), 'rust', B.gun, rot=(0, -0.12, 0))
    B.b('shield_team', (0.025, 0.27, 0.035), (0.125, 0, 0.09), 'team', B.gun, rot=(0, -0.12, 0))
    B.muzzle(0.40, B.gun, z=0.01)
    B.end_turret()
    B.recoil = 0.025
    B.hardpoint('healthbar', (0, 0, 0.86), ['hull', 'whole'])


def sy_tank(B):
    """Refitted tank: older dome turret in a welded slat cage, sandbagged glacis, mismatched wheels, rust patches."""
    B.tracks(1.52, 0.33, r=0.085, n_wheels=5, band_h=0.18, width=0.18)
    B.pr('hull', [(-0.76, 0.12), (0.58, 0.12), (0.78, 0.24), (0.58, 0.34), (-0.76, 0.34)], 0.72, bevel=0.02)
    B.b('rust_patch', (0.30, 0.20, 0.012), (-0.30, 0.14, 0.346), 'rust', bevel=0)
    B.b('primer_patch', (0.24, 0.22, 0.012), (0.10, -0.18, 0.346), 'primer', bevel=0)
    B.sandbags('glacis_bags', 0.62, 0, 0.33, 4, 2, rot=0.0)
    B.b('spare_links', (0.06, 0.40, 0.10), (0.70, 0, 0.26), 'metal', rot=(0, -0.4, 0), missing=True)
    B.b('net_roll', (0.10, 0.52, 0.10), (-0.62, 0, 0.40), 'canvas', bevel=0.04, missing=True)
    for sy in (1, -1):
        B.b(f'side_team_{sy}', (1.10, 0.025, 0.06), (0.0, sy * 0.365, 0.30), 'team')
    B.headlights(0.76, 0.24, 0.27)
    B.begin_turret((0.05, 0.0), 0.34)
    B.s('turret_dome', 0.30, (0, 0, 0.0), 'paint', scale=(1.0, 0.95, 0.45), segs=14)
    B.s('turret_patch', 0.18, (-0.10, 0.12, 0.05), 'primer', scale=(1.0, 1.0, 0.45), segs=10)
    B.c('turret_team', 0.29, 0.03, (0, 0, 0.05), 'team', verts=16)
    for sy in (1, -1):
        B.slat_cage(f'turret_cage_{sy}', -0.30, 0.20, sy * 0.33, 0.00, 0.16, 5)
    B.slat_cage('turret_cage_rear', -0.001, 0.0, 0, 0, 0, 1) if False else None
    B.b('cage_rear', (0.02, 0.66, 0.16), (-0.33, 0, 0.08), 'slat', bevel=0, missing=True)
    B.c('cupola', 0.06, 0.06, (-0.06, 0.10, 0.15), 'rust', verts=10)
    B.c('dshk', 0.012, 0.22, (-0.02, 0.10, 0.21), 'metal', rot=(0, math.pi / 2, 0), verts=6, missing=True)
    B.gun = B.e('gun_root', (0.26, 0, 0.05))
    B.b('mantlet', (0.10, 0.16, 0.10), (0.0, 0, 0), 'paint2', B.gun)
    B.c('barrel', 0.026, 0.74, (0.42, 0, 0), 'metal', B.gun, rot=(0, math.pi / 2, 0), verts=12)
    B.c('evacuator', 0.042, 0.10, (0.52, 0, 0), 'metal', B.gun, rot=(0, math.pi / 2, 0), verts=12)
    B.muzzle(0.82, B.gun)
    B.end_turret()
    B.recoil = 0.09
    B.hardpoint('healthbar', (0, 0, 0.64), ['hull', 'whole'])


def pickup(B, bed_len=0.52, cab_m='paint', hood_m='primer'):
    """Shared repaired pickup chassis (distinct from technical.py: longer bed, welded plates)."""
    B.axle_set((0.38, -0.34), 0.25, 0.108, 0.09)
    B.b('chassis', (1.18, 0.40, 0.08), (0, 0, 0.13), 'dark')
    B.b('hood', (0.32, 0.48, 0.13), (0.42, 0, 0.24), hood_m, taper=(0.9, 0.95), bevel=0.02)
    B.b('bull_bar', (0.04, 0.50, 0.03), (0.61, 0, 0.19), 'metal')
    B.cab('cab', 0.00, 0.28, 0.24, 0.17, 0.44, cab_m, slope=0.07)
    B.b('cab_team', (0.22, 0.38, 0.025), (0.12, 0, 0.445), 'team')
    B.b('bed_floor', (bed_len, 0.46, 0.04), (-0.35, 0, 0.21), 'paint2')
    for sy in (1, -1):
        B.b(f'bed_side_{sy}', (bed_len, 0.03, 0.12), (-0.35, sy * 0.235, 0.28), 'rust' if sy > 0 else 'primer')
        B.b(f'bed_team_{sy}', (bed_len - 0.02, 0.034, 0.04), (-0.35, sy * 0.24, 0.30), 'team')
    B.headlights(0.59, 0.16, 0.24)


def sy_artillery(B):
    """Mobile mortar: repaired pickup, heavy mortar on a baseplate in the bed, two-man crew, ammo crates."""
    pickup(B, 0.56)
    base = B.e('mortar_base', (-0.40, 0, 0.23))
    B.b('baseplate', (0.20, 0.20, 0.03), (0, 0, 0.0), 'metal', base)
    tube = B.e('mortar_tube', (0, 0, 0.02), base)
    B.c('tube', 0.05, 0.52, (0, 0, 0.26), 'tube', tube, verts=12)
    B.c('tube_ring', 0.058, 0.04, (0, 0, 0.44), 'metal', tube, verts=12)
    B.rod('bipod_a', (0.20, 0.10, -0.01), (0.10, 0.02, 0.26), 0.012, parent=base)
    B.rod('bipod_b', (0.20, -0.10, -0.01), (0.10, -0.02, 0.26), 0.012, parent=base)
    tube.rotation_euler = (0, math.radians(35), 0)
    B.h['tube'] = tube
    B.h['crew'] = []
    for i, (x, y) in enumerate(((-0.20, 0.14), (-0.58, -0.12))):
        man = B.e(f'crew_{i}', (x, y, 0.23))
        B.b(f'crew_legs_{i}', (0.05, 0.08, 0.12), (0, 0, 0.06), 'canvas', man)
        B.b(f'crew_torso_{i}', (0.07, 0.10, 0.12), (0, 0, 0.17), 'paint2', man)
        B.s(f'crew_head_{i}', 0.034, (0.01, 0, 0.27), 'canvas', man, segs=8)
        B.h['crew'].append(man)
    for k in range(2):
        B.b(f'ammo_{k}', (0.12, 0.08, 0.07), (-0.58 + k * 0.14, 0.14, 0.27), 'era', missing=True)
    B.c('flash_ring', 0.08, 0.10, (0, 0, 0.58), 'flash', tube, fx='flash', verts=10, radius_top=0.02, bevel=0)
    B.s('mortar_smoke', 0.16, (0, 0, 0.70), 'smoke', tube, fx='smoke_0', scale=(1, 1, 1.3))
    B.hardpoint('muzzle', (0, 0, 0.54), ['body', 'whole'], parent=tube)
    B.hardpoint('healthbar', (0, 0, 0.80), ['body', 'whole'])


def sy_aa(B):
    """Air-defence technical: repaired pickup with a twin-barrel autocannon on a pedestal, gunner and shield."""
    pickup(B, 0.52, cab_m='paint', hood_m='rust')
    B.b('ammo_crate', (0.14, 0.12, 0.10), (-0.52, 0.12, 0.28), 'era', missing=True)
    B.begin_turret((-0.32, 0.0), 0.24)
    B.c('pedestal', 0.05, 0.18, (0, 0, 0.09), 'metal', verts=10)
    B.gun = B.e('gun_root', (0, 0, 0.20))
    B.b('cradle', (0.18, 0.18, 0.08), (0.02, 0, 0), 'metal', B.gun)
    for sy in (1, -1):
        B.c(f'barrel_{sy}', 0.014, 0.46, (0.32, sy * 0.05, 0.02), 'metal', B.gun, rot=(0, math.pi / 2, 0), verts=8)
        B.b(f'drum_{sy}', (0.08, 0.05, 0.10), (-0.02, sy * 0.12, 0.02), 'era', B.gun)
    B.b('shield', (0.02, 0.32, 0.14), (0.12, 0, 0.06), 'primer', B.gun, rot=(0, -0.15, 0))
    B.b('shield_team', (0.025, 0.33, 0.035), (0.125, 0, 0.12), 'team', B.gun, rot=(0, -0.15, 0))
    B.b('seat', (0.08, 0.10, 0.03), (-0.14, 0, -0.02), 'dark', B.gun)
    B.b('gunner_torso', (0.07, 0.10, 0.13), (-0.14, 0, 0.07), 'paint2', B.gun)
    B.s('gunner_head', 0.034, (-0.13, 0, 0.17), 'canvas', B.gun, segs=8)
    B.muzzle(0.58, B.gun, z=0.02)
    B.end_turret()
    B.aim_elev = math.radians(30)
    B.recoil = 0.03
    B.hardpoint('healthbar', (0, 0, 0.84), ['hull', 'whole'])


def sy_repair(B):
    """Salvage truck: tow truck with an A-frame boom, hook and winch, scrap load and gas bottles."""
    B.axle_set((0.44, -0.24, -0.46), 0.27, 0.11, 0.1)
    B.b('chassis', (1.34, 0.42, 0.08), (0, 0, 0.15), 'dark')
    B.b('hood', (0.30, 0.50, 0.14), (0.50, 0, 0.26), 'rust', taper=(0.9, 0.95))
    B.cab('cab', 0.12, 0.36, 0.26, 0.19, 0.46, 'primer', slope=0.06)
    B.b('cab_team', (0.22, 0.42, 0.025), (0.23, 0, 0.465), 'team')
    B.b('bed', (0.72, 0.50, 0.06), (-0.26, 0, 0.23), 'paint2')
    for sy in (1, -1):
        B.b(f'bed_team_{sy}', (0.70, 0.03, 0.06), (-0.26, sy * 0.25, 0.29), 'team')
        B.c(f'gas_{sy}', 0.03, 0.22, (-0.05, sy * 0.19, 0.37), 'warhead' if sy > 0 else 'steel', verts=8, missing=True)
    for k, (x, y, sx, sz) in enumerate(((-0.20, 0.08, 0.18, 0.10), (-0.34, -0.10, 0.22, 0.08), (-0.10, -0.06, 0.12, 0.14))):
        B.b(f'scrap_{k}', (sx, 0.14, sz), (x, y, 0.30), 'rust' if k % 2 else 'metal', rot=(0.2 * k, 0.1, 0.4 * k),
            missing=True)
    B.b('winch', (0.12, 0.22, 0.10), (-0.46, 0, 0.31), 'trim')
    boom = B.e('crane_boom', (-0.58, 0, 0.28))
    B.rod('aframe_L', (0, 0.18, 0), (0.12, 0.02, 0.46), 0.02, 'steel', boom)
    B.rod('aframe_R', (0, -0.18, 0), (0.12, -0.02, 0.46), 0.02, 'steel', boom)
    B.b('aframe_top', (0.06, 0.08, 0.06), (0.12, 0, 0.47), 'team', boom)
    hook = B.e('hook', (0.12, 0, 0.44), boom)
    B.c('cable', 0.005, 0.30, (0, 0, -0.15), 'dark', hook, verts=5, bevel=0)
    B.b('hook_block', (0.05, 0.05, 0.06), (0, 0, -0.32), 'steel', hook)
    B.h.update(boom=boom, hook=hook)
    boom.rotation_euler = (0, 0.45, 0)
    for k in range(3):
        B.b(f'spark_{k}', (0.03, 0.03, 0.03), (0.02 * k, 0.03 * (k - 1), -0.36), 'spark', hook, fx='sparks', bevel=0)
    crate = B.e('salvage_crate', (0.12, 0, 0.12), boom)
    B.b('crate', (0.12, 0.12, 0.10), (0, 0, 0), 'era', crate, fx='salvage')
    B.h['crate'] = crate
    B.headlights(0.66, 0.18, 0.26)
    B.hardpoint('work', (-1.0, 0, 0.1), ['body', 'whole'])
    B.hardpoint('healthbar', (0, 0, 0.84), ['body', 'whole'])


def sy_buggy(B):
    """Raider buggy: low tube space-frame, big rear tyres, open engine, twin AT launcher on a rear pivot."""
    for x, y, r in ((0.40, 0.30, 0.10), (0.40, -0.30, 0.10), (-0.32, 0.32, 0.13), (-0.32, -0.32, 0.13)):
        B.wheel(f'wheel_{x:+.2f}_{y:+.2f}', x, y, r, 0.11)
    B.b('floor', (1.00, 0.34, 0.04), (0.02, 0, 0.16), 'dark')
    B.b('nose', (0.26, 0.34, 0.08), (0.46, 0, 0.21), 'rust', taper=(0.7, 0.9))
    B.b('seat_pan', (0.30, 0.30, 0.04), (0.06, 0, 0.21), 'canvas')
    # space frame
    pts = [(0.52, 0.16, 0.20), (0.52, -0.16, 0.20), (0.16, 0.19, 0.44), (0.16, -0.19, 0.44), (-0.18, 0.19, 0.44),
           (-0.18, -0.19, 0.44), (-0.48, 0.18, 0.22), (-0.48, -0.18, 0.22)]
    edges = [(0, 2), (1, 3), (2, 3), (2, 4), (3, 5), (4, 5), (4, 6), (5, 7), (0, 1), (6, 7), (2, 5)]
    for k, (a, b) in enumerate(edges):
        B.rod(f'frame_tube_{k}', pts[a], pts[b], 0.013, 'steel')
    B.b('roof_team', (0.30, 0.34, 0.02), (-0.01, 0, 0.455), 'team')
    B.b('engine', (0.26, 0.24, 0.14), (-0.36, 0, 0.26), 'metal')
    B.c('exhaust', 0.02, 0.18, (-0.46, 0.10, 0.36), 'dark', verts=8)
    for sy in (1, -1):
        B.b(f'side_team_{sy}', (0.40, 0.02, 0.04), (0.05, sy * 0.17, 0.24), 'team')
        B.b(f'fender_{sy}', (0.22, 0.10, 0.02), (-0.32, sy * 0.30, 0.28), 'primer', missing=True)
    B.s('driver_head', 0.034, (0.12, 0.06, 0.34), 'canvas', segs=8)
    B.headlights(0.58, 0.10, 0.22)
    B.begin_turret((-0.16, 0.0), 0.44)
    B.c('post', 0.025, 0.08, (0, 0, 0.04), 'metal', verts=8)
    B.gun = B.e('gun_root', (0, 0, 0.09))
    for sy in (1, -1):
        B.c(f'tube_{sy}', 0.035, 0.44, (0.10, sy * 0.05, 0.0), 'era', B.gun, rot=(0, math.pi / 2, 0), verts=10)
        B.c(f'tip_{sy}', 0.03, 0.06, (0.35, sy * 0.05, 0.0), 'warhead', B.gun, rot=(0, math.pi / 2, 0), verts=10,
            radius_top=0.01)
    B.b('launcher_team', (0.10, 0.16, 0.03), (0.0, 0, 0.045), 'team', B.gun)
    B.b('gunner', (0.07, 0.10, 0.12), (-0.14, 0, -0.02), 'paint2', B.gun)
    B.s('gunner_head', 0.033, (-0.13, 0, 0.08), 'canvas', B.gun, segs=8)
    B.muzzle(0.40, B.gun, y=0.05)
    B.end_turret()
    B.recoil = 0.03
    B.hardpoint('healthbar', (0, 0, 0.74), ['hull', 'whole'])


def sy_launcher(B):
    """Heavy rocket carrier: truck with one large improvised rocket on a welded ladder rail."""
    launcher_truck(B, 1.56, (0.52, 0.26, -0.40), 0.30, 0.40, 1.00, missiles=1, style='SY')
    B.sandbags('cab_bags', 0.30, 0, 0.60, 2, 2)
    B.b('welded_plate', (0.28, 0.02, 0.18), (0.56, 0.325, 0.36), 'rust')


def sa_car(B):
    """Desert patrol car: heavy armoured 4x4, steep bonnet, big stowage racks, RWS autocannon."""
    B.axle_set((0.40, -0.36), 0.29, 0.125, 0.11)
    B.pr('hull', [(-0.60, 0.16), (0.46, 0.16), (0.66, 0.26), (0.58, 0.34), (0.26, 0.46), (-0.56, 0.46),
                  (-0.62, 0.34)], 0.56, bevel=0.02)
    B.b('bonnet_bar', (0.05, 0.56, 0.05), (0.66, 0, 0.21), 'trim')
    B.b('windscreen', (0.02, 0.44, 0.10), (0.42, 0, 0.40), 'glass', rot=(0, -0.95, 0), bevel=0, missing=True)
    B.b('roof_team', (0.40, 0.46, 0.03), (-0.14, 0, 0.47), 'team')
    for sy in (1, -1):
        B.b(f'buttress_{sy}', (0.70, 0.04, 0.16), (-0.06, sy * 0.29, 0.30), 'paint2')
        B.b(f'rack_{sy}', (0.40, 0.08, 0.12), (-0.34, sy * 0.30, 0.42), 'slat', missing=True)
        B.c(f'jerry_{sy}', 0.035, 0.12, (-0.62, sy * 0.16, 0.36), 'paint2', verts=8, missing=True)
    B.headlights(0.66, 0.19, 0.24)
    B.antenna('whip', (-0.50, 0.22, 0.46), 0.36)
    B.begin_turret((-0.02, 0.0), 0.48)
    B.c('ring', 0.12, 0.04, (0, 0, 0), 'trim', verts=14)
    B.b('rws', (0.24, 0.20, 0.12), (0, 0, 0.08), 'paint', taper=(0.85, 0.9))
    B.b('rws_team', (0.25, 0.205, 0.03), (0, 0, 0.06), 'team')
    B.b('rws_sight', (0.08, 0.07, 0.08), (0.02, 0.12, 0.10), 'paint2')
    B.b('rws_lens', (0.01, 0.05, 0.04), (0.065, 0.12, 0.10), 'lens', bevel=0)
    B.gun_mount((0.10, 0, 0.08), 0.36, r=0.018, brake=True, sleeve=False)
    B.end_turret()
    B.recoil = 0.03
    B.hardpoint('healthbar', (0, 0, 0.82), ['hull', 'whole'])


def sa_apc(B):
    """Wheeled infantry carrier: large 8x8 boxy buttressed hull, 30 mm turret, rear ramp."""
    B.axle_set((0.54, 0.26, -0.16, -0.44), 0.31, 0.12, 0.1)
    B.pr('hull', [(-0.78, 0.17), (0.58, 0.17), (0.80, 0.30), (0.60, 0.50), (-0.78, 0.50)], 0.70, bevel=0.03)
    for sy in (1, -1):
        B.b(f'buttress_{sy}', (1.30, 0.04, 0.12), (-0.08, sy * 0.36, 0.40), 'paint2')
        B.b(f'side_team_{sy}', (1.20, 0.045, 0.04), (-0.08, sy * 0.365, 0.47), 'team')
        B.b(f'bin_{sy}', (0.36, 0.06, 0.10), (-0.46, sy * 0.39, 0.28), 'trim', detach=True, missing=True)
    B.headlights(0.78, 0.22, 0.32)
    ramp = B.e('ramp_hinge', (-0.78, 0, 0.17))
    B.b('ramp', (0.03, 0.56, 0.32), (-0.015, 0, 0.16), 'paint', ramp)
    B.b('ramp_team', (0.035, 0.30, 0.05), (-0.02, 0, 0.27), 'team', ramp)
    B.h['doors'] = [(ramp, 'y', 1.4)]
    B.b('ramp_interior', (0.04, 0.52, 0.28), (-0.74, 0, 0.33), 'dark')
    B.hardpoint('exit', (-1.1, 0, 0), ['hull', 'whole'])
    B.begin_turret((0.12, 0.0), 0.51)
    B.sl('turret', [(0.20, 0.0), (0.14, 0.17), (-0.20, 0.18), (-0.24, 0.0), (-0.20, -0.18), (0.14, -0.17)], 0.0, 0.16,
         'paint', top_scale=0.88)
    B.b('turret_team', (0.40, 0.36, 0.03), (-0.02, 0, 0.07), 'team')
    B.b('launcher_box', (0.20, 0.08, 0.08), (-0.06, 0.21, 0.10), 'paint2')
    B.gun_mount((0.20, 0, 0.08), 0.40, r=0.018, brake=True, sleeve=True)
    B.end_turret()
    B.recoil = 0.04
    B.hardpoint('healthbar', (0, 0, 0.86), ['hull', 'whole'])


def sa_tank(B):
    """Guardian tank: heavy tracked hull, massive boxy wedge turret and bustle, dozer blade for hull-down berm."""
    B.tracks(1.74, 0.37, r=0.09, n_wheels=7, band_h=0.20, width=0.21)
    B.pr('hull', [(-0.88, 0.13), (0.66, 0.13), (0.90, 0.25), (0.66, 0.37), (-0.86, 0.39), (-0.90, 0.30)], 0.80,
         bevel=0.02)
    for sy in (1, -1):
        B.b(f'skirt_{sy}', (1.50, 0.05, 0.16), (0.02, sy * 0.49, 0.24), 'paint2', rot=(0.06 * sy, 0, 0))
        B.b(f'skirt_team_{sy}', (1.50, 0.052, 0.045), (0.02, sy * 0.492, 0.30), 'team', rot=(0.06 * sy, 0, 0))
        B.b(f'skirt_bolt_{sy}', (1.46, 0.056, 0.012), (0.02, sy * 0.494, 0.20), 'trim', rot=(0.06 * sy, 0, 0), bevel=0)
    blade = B.e('blade_hinge', (0.90, 0, 0.22))
    B.b('blade', (0.05, 0.82, 0.16), (0.05, 0, -0.03), 'paint2', blade, rot=(0, -0.2, 0))
    B.b('blade_edge', (0.06, 0.82, 0.025), (0.08, 0, -0.11), 'steel', blade)
    B.h['blade'] = blade
    blade.rotation_euler = (0, -0.9, 0)          # stowed up against the glacis
    berm = B.e('berm', (1.05, 0, 0.0))
    B.pr('berm_mound', [(-0.22, 0.0), (0.20, 0.0), (0.02, 0.24), (-0.14, 0.22)], 0.96, 'earth', berm, bevel=0.04)
    for sy in (1, -1):
        B.s(f'berm_side_{sy}', 0.26, (-0.28, sy * 0.52, 0.0), 'earth', berm, scale=(1.3, 0.8, 0.45), segs=10)
    B.h['berm'] = berm
    B.headlights(0.88, 0.28, 0.29)
    B.begin_turret((-0.05, 0.0), 0.39)
    B.sl('turret', [(0.52, 0.10), (0.30, 0.34), (-0.30, 0.36), (-0.36, 0.30), (-0.36, -0.30), (-0.30, -0.36),
                    (0.30, -0.34), (0.52, -0.10)], 0.0, 0.22, 'paint', top_scale=0.9, top_shift=(-0.04, 0))
    B.b('bustle', (0.30, 0.62, 0.18), (-0.50, 0, 0.10), 'paint2')
    for k in range(4):
        B.b(f'bustle_rack_{k}', (0.02, 0.66, 0.02), (-0.66, 0, 0.04 + k * 0.05), 'slat', bevel=0)
    for sy in (1, -1):
        B.b(f'turret_team_{sy}', (0.60, 0.02, 0.07), (0.02, sy * 0.35, 0.11), 'team', rot=(0, 0, -0.35 * sy))
        B.b(f'cheek_{sy}', (0.24, 0.12, 0.16), (0.36, sy * 0.21, 0.10), 'paint', rot=(0, 0, -0.55 * sy))
    B.c('cupola', 0.08, 0.07, (-0.14, 0.16, 0.25), 'paint2', verts=14)
    B.b('csight', (0.12, 0.10, 0.10), (0.10, -0.20, 0.27), 'paint2')
    B.b('csight_lens', (0.01, 0.08, 0.05), (0.165, -0.20, 0.27), 'lens', bevel=0)
    B.smoke_dischargers(0.26, 0.34, 0.16)
    B.antenna('whip', (-0.44, -0.26, 0.20), 0.40)
    B.gun_mount((0.46, 0, 0.11), 1.00, r=0.034)
    B.end_turret()
    B.recoil = 0.11
    B.hardpoint('healthbar', (0, 0, 0.70), ['hull', 'whole'])


def sa_artillery(B):
    """Mobile howitzer: 8x8 truck with armoured cab and a mid-rear gun turret; rear recoil spades."""
    B.axle_set((0.60, 0.32, -0.30, -0.56), 0.31, 0.12, 0.1)
    B.b('frame', (1.76, 0.46, 0.10), (0, 0, 0.21), 'dark')
    B.cab('cab', 0.46, 0.88, 0.33, 0.24, 0.54, 'paint', slope=0.03)
    B.b('cab_team', (0.34, 0.54, 0.025), (0.66, 0, 0.545), 'team')
    B.b('bed', (1.26, 0.66, 0.08), (-0.24, 0, 0.30), 'paint2')
    for sy in (1, -1):
        B.b(f'ammo_locker_{sy}', (0.40, 0.08, 0.16), (0.16, sy * 0.33, 0.40), 'trim', detach=True, missing=True)
        B.jack(f'jack_{sy}', -0.66, sy * 0.40, 0.26, 0.13)
    spade = B.e('spade_hinge', (-0.88, 0, 0.26))
    B.b('spade', (0.03, 0.60, 0.20), (-0.02, 0, -0.08), 'metal', spade)
    B.h['spade'] = spade
    B.headlights(0.885, 0.24, 0.32)
    B.begin_turret((-0.34, 0.0), 0.34)
    B.sl('turret', [(0.34, 0.26), (0.34, -0.26), (-0.36, -0.28), (-0.36, 0.28)], 0.0, 0.28, 'paint', top_scale=0.9)
    B.b('turret_team', (0.66, 0.56, 0.03), (-0.01, 0, 0.14), 'team')
    B.b('turret_hatch', (0.14, 0.14, 0.03), (-0.14, 0.12, 0.29), 'trim')
    B.gun_mount((0.36, 0, 0.16), 1.00, r=0.030)
    B.end_turret()
    B.aim_elev = math.radians(26)
    B.recoil = 0.14
    B.hardpoint('healthbar', (0, 0, 0.88), ['hull', 'whole'])


def sa_aa(B):
    """Air-shield vehicle: 8x8 with a turret combining a quad missile box, twin cannon and mast radar."""
    B.axle_set((0.54, 0.26, -0.16, -0.44), 0.31, 0.12, 0.1)
    B.pr('hull', [(-0.78, 0.17), (0.58, 0.17), (0.80, 0.30), (0.60, 0.46), (-0.78, 0.46)], 0.70, bevel=0.03)
    for sy in (1, -1):
        B.b(f'buttress_{sy}', (1.30, 0.04, 0.12), (-0.08, sy * 0.36, 0.38), 'paint2')
        B.b(f'side_team_{sy}', (1.20, 0.045, 0.04), (-0.08, sy * 0.365, 0.44), 'team')
    B.headlights(0.78, 0.22, 0.32)
    B.begin_turret((-0.18, 0.0), 0.47)
    B.sl('turret', [(0.26, 0.20), (0.26, -0.20), (-0.30, -0.24), (-0.30, 0.24)], 0.0, 0.18, 'paint', top_scale=0.88)
    B.b('turret_team', (0.54, 0.46, 0.03), (-0.02, 0, 0.08), 'team')
    B.c('mast', 0.02, 0.26, (-0.20, 0, 0.30), 'metal', verts=8)
    radar = B.e('radar', (-0.20, 0, 0.44))
    B.b('radar_face', (0.04, 0.30, 0.12), (0, 0, 0.0), 'paint2', radar, rot=(0, -0.2, 0))
    B.b('radar_array', (0.005, 0.26, 0.09), (0.024, 0, 0.005), 'lens', radar, rot=(0, -0.2, 0), bevel=0)
    B.h['radar'] = radar
    B.gun = B.e('gun_root', (0.12, 0, 0.12))
    B.b('missile_box', (0.34, 0.16, 0.18), (0.04, 0.26, 0.04), 'paint2', B.gun)
    for i in range(2):
        for j in range(2):
            B.c(f'cell_{i}_{j}', 0.028, 0.02, (0.215, 0.26 + (i - 0.5) * 0.07, 0.04 + (j - 0.5) * 0.08), 'dark', B.gun,
                rot=(0, math.pi / 2, 0), verts=8)
    for sy in (1, -1):
        B.c(f'cannon_{sy}', 0.013, 0.44, (0.30, -0.20 + sy * 0.04, 0.02), 'metal', B.gun, rot=(0, math.pi / 2, 0),
            verts=8)
    B.b('cannon_box', (0.18, 0.14, 0.12), (0.02, -0.20, 0.02), 'paint', B.gun)
    B.c('missile_out', 0.024, 0.26, (0.36, 0.26, 0.06), 'missile', B.gun, fx='missile_out', rot=(0, math.pi / 2, 0),
        verts=8)
    B.muzzle(0.54, B.gun, y=-0.20, z=0.02)
    B.end_turret()
    B.aim_elev = math.radians(24)
    B.recoil = 0.02
    B.hardpoint('healthbar', (0, 0, 0.94), ['hull', 'whole'])


def sa_repair(B):
    """Service vehicle: 6x6 with slewing crane and two service arms that unfold on deployment."""
    B.axle_set((0.48, -0.14, -0.42), 0.30, 0.12, 0.1)
    B.b('frame', (1.40, 0.46, 0.10), (0, 0, 0.21), 'dark')
    B.cab('cab', 0.30, 0.72, 0.32, 0.24, 0.54, 'paint', slope=0.03)
    B.b('cab_team', (0.32, 0.52, 0.025), (0.50, 0, 0.545), 'team')
    B.b('service_body', (0.84, 0.62, 0.22), (-0.22, 0, 0.38), 'paint2')
    B.b('service_team', (0.85, 0.63, 0.03), (-0.22, 0, 0.48), 'team')
    B.headlights(0.725, 0.23, 0.32)
    for sy in (1, -1):
        B.jack(f'jack_{sy}', -0.56, sy * 0.40, 0.26, 0.12)
        B.jack(f'jack_f_{sy}', 0.18, sy * 0.40, 0.26, 0.12)
    B.h['arms'] = []
    for sy in (1, -1):
        sh = B.e(f'arm_shoulder_{sy}', (-0.10, sy * 0.30, 0.50))
        B.b(f'arm_upper_{sy}', (0.04, 0.04, 0.30), (0, 0, 0.15), 'steel', sh)
        el = B.e(f'arm_elbow_{sy}', (0, 0, 0.30), sh)
        B.b(f'arm_lower_{sy}', (0.035, 0.035, 0.24), (0, 0, 0.12), 'steel', el)
        B.b(f'arm_tool_{sy}', (0.06, 0.06, 0.06), (0, 0, 0.26), 'brass', el)
        B.b(f'arm_spark_{sy}', (0.04, 0.04, 0.04), (0, 0, 0.31), 'spark', el, fx='sparks', bevel=0)
        B.h['arms'].append((sh, el, sy))
    slew = B.e('crane_slew', (-0.54, 0, 0.50))
    B.c('crane_base', 0.08, 0.06, (0, 0, 0.03), 'trim', slew, verts=12)
    boom = B.e('crane_boom', (0, 0, 0.06), slew)
    B.b('boom', (0.54, 0.07, 0.07), (0.24, 0, 0), 'paint', boom)
    hook = B.e('hook', (0.52, 0, -0.04), boom)
    B.c('cable', 0.005, 0.22, (0, 0, -0.11), 'dark', hook, verts=5, bevel=0)
    B.b('hook_block', (0.04, 0.04, 0.06), (0, 0, -0.24), 'steel', hook)
    B.h.update(slew=slew, boom=boom, hook=hook)
    slew.rotation_euler = (0, 0, math.pi)
    boom.rotation_euler = (0, -0.2, 0)
    B.hardpoint('work', (0, 0.9, 0.1), ['body', 'whole'])
    B.hardpoint('healthbar', (0, 0, 0.92), ['body', 'whole'])


def sa_launcher(B):
    """Cruise missile carrier: armoured 8x8, single sealed canister, 45-degree erector."""
    launcher_truck(B, 1.74, (0.62, 0.36, -0.18, -0.46), 0.32, 0.48, 1.10, missiles=1, style='SA')
    for sy in (1, -1):
        B.b(f'buttress_{sy}', (0.50, 0.04, 0.14), (0.40, sy * 0.35, 0.36), 'paint2')


KINDS = {
    'US.car': us_car, 'US.apc': us_apc, 'US.artillery': us_artillery, 'US.aa': us_aa, 'US.repair': us_repair,
    'US.launcher': us_launcher,
    'IR.car': ir_car, 'IR.apc': ir_apc, 'IR.tank': ir_tank, 'IR.artillery': ir_artillery, 'IR.aa': ir_aa,
    'IR.repair': ir_repair, 'IR.launcher': ir_launcher,
    'SY.apc': sy_apc, 'SY.tank': sy_tank, 'SY.artillery': sy_artillery, 'SY.aa': sy_aa, 'SY.repair': sy_repair,
    'SY.buggy': sy_buggy, 'SY.launcher': sy_launcher,
    'SA.car': sa_car, 'SA.apc': sa_apc, 'SA.tank': sa_tank, 'SA.artillery': sa_artillery, 'SA.aa': sa_aa,
    'SA.repair': sa_repair, 'SA.launcher': sa_launcher,
}
ERECT = {'US': math.radians(72), 'IR': math.radians(62), 'SY': math.radians(48), 'SA': math.radians(45)}


# =========================================================================== build / pose
def _all_objects(B):
    out = []
    seen = set()
    stack = [B.root]
    while stack:
        o = stack.pop()
        if id(o) in seen:
            continue
        seen.add(id(o))
        out.append(o)
        stack.extend(o.children)
    return out


def build(faction, params):
    kind = params['kind']
    if kind not in KINDS or not kind.startswith(faction + '.'):
        raise ValueError('Unknown vehicle/faction: ' + kind)
    B = VB(faction, kind)
    KINDS[kind](B)
    B.scorch = fclib.scorch_decal('wreck_scorch', 1.0 if B.track_len > 1.5 else 0.8, parent=B.root)
    rig = fclib.Rig(B.root)
    rig.vb = B
    rig.parts = {'hull': list(B.objs['hull']), 'turret': list(B.objs['turret'])}
    rig.hardpoints = dict(B.hp)
    # transform snapshot: every pose starts from exactly this state
    rig.original = {o: (tuple(o.location), tuple(o.rotation_euler), tuple(o.scale)) for o in _all_objects(B)}
    return rig


def _restore(rig):
    for o, (loc, rot, scl) in rig.original.items():
        o.location, o.rotation_euler, o.scale = loc, rot, scl


def _progress(frame, n):
    return (frame + 1) / max(1, n)


def _deploy(B, t):
    """Shared deploy/erect sequence: jacks 0..0.45, erector 0.3..1.0 (smoothstep)."""
    lt = min(1.0, t / 0.45)
    for foot, drop in B.h.get('jacks', []):
        foot.location = (foot.location[0], foot.location[1], foot.location[2] - drop * lt)
    et = max(0.0, min(1.0, (t - 0.3) / 0.7))
    et = et * et * (3 - 2 * et)
    if 'erector' in B.h:
        B.h['erector'].rotation_euler = (0, -ERECT[B.faction] * et, 0)
    if 'rack' in B.h:          # IR rocket artillery rack elevation
        B.h['rack'].rotation_euler = (0, -math.radians(32) * et, 0)
    if 'spade' in B.h:
        B.h['spade'].rotation_euler = (0, 0.9 * lt, 0)
    return lt, et


def pose(rig, st, frame, d):
    B = rig.vb
    _restore(rig)
    name, n = st['name'], max(1, st['frames'])
    part = st.get('part', 'body')
    ph = frame / n
    B.root.rotation_euler = (0, 0, fclib.heading_to_blender_z(d, st['directions']))
    turreted = B.turret_root is not None
    if turreted:
        B.turret_root.location = (0, 0, B.pivot[2]) if part == 'turret' else B.pivot
    fclib.set_grime_all(0.0)
    fclib.set_char_all(0.0)
    fclib.set_emission_scale(1.0)
    show_fx = set()
    missing = set()
    wave = math.sin(ph * TAU)

    if name in ('move', 'move_loaded'):
        for spin, r in B.spinners:
            spin.rotation_euler = (0, 0, -ph * (math.pi / 2))
        for shoe, x0 in B.shoes:
            L = B.track_len - 0.12
            x = x0 + ph * (L / 13)
            if x > B.track_len / 2 - 0.06:
                x -= L + L / 13
            shoe.location = (x, shoe.location[1], shoe.location[2])
        B.hull.location = (0, 0, 0.006 * wave)
        B.hull.rotation_euler = (0.008 * math.cos(ph * TAU), 0.005 * wave, 0)
    if name == 'damaged':
        fclib.set_grime_all(0.6)
        fclib.set_char_all(0.3)
        missing |= set(B.detach)

    # ---- turret / weapon
    if B.gun is not None and name in ('aim', 'fire'):
        B.gun.rotation_euler = (0, -B.aim_elev, 0)
    if B.gun is not None and name == 'fire':
        k = [1.0, 0.55, 0.15][min(frame, 2)]
        gx, gy, gz = rig.original[B.gun][0]
        dx = B.recoil * k
        B.gun.location = (gx - dx * math.cos(B.aim_elev), gy, gz - dx * math.sin(B.aim_elev))
        if frame == 0:
            show_fx.add('flash')
        if frame <= 1:
            show_fx.add('missile_out')
    if 'radar' in B.h and name in ('idle', 'aim', 'fire', 'move'):
        B.h['radar'].rotation_euler = (0, 0, (ph if name in ('idle', 'move') else 0.15) * TAU)
    if 'mast' in B.h:
        raise_t = 1.0 if name in ('idle', 'aim', 'fire', 'damaged') else 0.0
        B.h['mast'].scale = (1, 1, 0.35 + 0.65 * raise_t)

    # ---- doors / ramps
    if name == 'doors_open' and 'doors' in B.h:
        t = min(1.0, (frame + 1) / max(1, n - 1))
        for hinge, axis, ang in B.h['doors']:
            r = list(rig.original[hinge][1])
            r['xyz'.index(axis)] += ang * t
            hinge.rotation_euler = tuple(r)

    # ---- deployables
    if name == 'deploy':
        _deploy(B, _progress(frame, n))
        if 'arms' in B.h:
            t = _progress(frame, n)
            for sh, el, sy in B.h['arms']:
                sh.rotation_euler = (-sy * 1.15 * t, 0, 0)
                el.rotation_euler = (-sy * 0.9 * t, 0, 0)
    if name in ('ready', 'ready_empty', 'ready_two_charges', 'launch', 'volley', 'deployed_work') or (name == 'fire' and 'missiles' in B.h):
        _deploy(B, 1.0)
    if name == 'ready_empty':
        for group in B.h.get('missiles', []):
            missing.update(group)
    if name == 'ready' and len(B.h.get('missiles', [])) > 1:
        missing |= set(B.h['missiles'][1])      # one charge loaded; ready_two_charges shows both
    if name in ('launch', 'volley', 'fire') and 'missiles' in B.h:
        mis = B.h['missiles']
        if name == 'volley':
            # two sequential launches: first missile frames 0-2, second 3-5
            for i, group in enumerate(mis[:2]):
                start = i * (n // 2)
                if frame >= start:
                    rise = min(2, frame - start)
                    for ob in group:
                        lx, ly, lz = rig.original[ob][0]
                        ob.location = (lx + 0.18 * rise, ly, lz)
                    if frame - start <= 1:
                        show_fx.add(f'plume_{i}')
                    if frame - start >= 2:
                        missing |= set(group)
                    if frame - start >= 1:
                        show_fx.add(f'smoke_{i}')
        else:
            group = mis[0]
            rise = min(2, frame)
            for ob in group:
                lx, ly, lz = rig.original[ob][0]
                ob.location = (lx + 0.20 * rise, ly, lz)
            if frame <= 1:
                show_fx.add('plume_0')
            if frame >= 1:
                show_fx.add('smoke_0')
            if frame >= 2:
                missing |= set(group)
            if len(mis) > 1:
                missing |= set(mis[1])       # the second tube/charge is already empty in a single launch
    if name in ('volley', 'fire') and 'rack' in B.h:
        _deploy(B, 1.0)
        i = frame % 4
        show_fx.add(f'tube_plume_{i}')
        show_fx.add(f'rocket_{i}')
        if frame >= 1:
            show_fx.add('volley_smoke')
        rack = B.h['rack']
        rx_, ry_, rz_ = rack.rotation_euler
        rack.rotation_euler = (0.015 * (1 if frame % 2 else -1), ry_ + 0.01 * (frame % 2), rz_)
    if name in ('mortar_fire', 'fire') and 'tube' in B.h:
        tube = B.h['tube']
        k = [1.0, 0.5, 0.2, 0.0][min(frame, 3)]
        lx, ly, lz = rig.original[tube][0]
        tube.location = (lx, ly, lz - 0.03 * k)
        if frame == 0:
            show_fx.add('flash')
        if frame in (1, 2):
            show_fx.add('smoke_0')
        for i, man in enumerate(B.h.get('crew', [])):
            mx, my, mz = rig.original[man][0]
            man.rotation_euler = (0, 0.25 * k if i == 0 else -0.35 * (1 - k), 0)
            if name == 'fire' and i == 0:        # generic fire: loader drops a round in
                man.location = (mx + 0.05 * (1 - k), my, mz)

    # ---- service work
    if name in ('work_repair', 'work_salvage', 'deployed_work'):
        if 'boom' in B.h:
            b0 = rig.original[B.h['boom']][1]
            B.h['boom'].rotation_euler = (b0[0], b0[1] + 0.10 * wave, b0[2])
        if 'slew' in B.h:
            s0 = rig.original[B.h['slew']][1]
            B.h['slew'].rotation_euler = (0, 0, s0[2] + 0.30 * math.sin(ph * TAU))
        if 'hook' in B.h:
            hx, hy, hz = rig.original[B.h['hook']][0]
            B.h['hook'].location = (hx, hy, hz - 0.05 * (1 + wave))
        if 'panels' in B.h:
            for hinge, sy in B.h['panels']:
                hinge.rotation_euler = (sy * -1.35, 0, 0)
        if 'blade' in B.h and B.kind == 'US.repair':
            B.h['blade'].rotation_euler = (0, 0.18, 0)
        if name == 'work_salvage' and 'crate' in B.h:
            show_fx.add('salvage')
            cx, cy, cz = rig.original[B.h['crate']][0]
            B.h['crate'].location = (cx, cy, cz - 0.30 + 0.20 * ph)
        if name == 'deployed_work' and 'arms' in B.h:
            for sh, el, sy in B.h['arms']:
                sh.rotation_euler = (-sy * (1.15 + 0.12 * wave), 0, 0)
                el.rotation_euler = (-sy * (0.9 - 0.15 * wave), 0, 0)
        if frame % 2 == 0:
            show_fx.add('sparks')
    if name == 'work_repair' and 'arms' in B.h:   # single-arm focused repair when not deployed
        sh, el, sy = B.h['arms'][0]
        sh.rotation_euler = (-sy * (0.8 + 0.1 * wave), 0, 0)
        el.rotation_euler = (-sy * 0.7, 0, 0)

    # ---- Guardian hull-down
    if name in ('hulldown', 'hulldown_idle') and 'berm' in B.h:
        t = _progress(frame, n) if name == 'hulldown' else 1.0
        B.h['blade'].rotation_euler = (0, -0.9 + 0.95 * min(1.0, t * 1.6), 0)
        B.h['berm'].scale = (0.2 + 0.8 * t, 0.3 + 0.7 * t, max(0.02, t))
        B.hull.location = (0, 0, -0.035 * t)
    else:
        missing |= {o for o in B.objs['hull'] if o.name.startswith('berm')}

    # ---- wreck
    everything = B.objs['hull'] + B.objs['turret']
    if name == 'wreck':
        fclib.set_grime_all(0.7)
        fclib.set_char_all(0.92)
        fclib.set_emission_scale(0.0)
        B.hull.location = (0, 0, -0.045)
        B.hull.rotation_euler = (0.08, -0.06, 0.10)
        missing |= set(B.missing) | {o for o in B.objs['hull'] if o.name.startswith('berm')}
        if turreted:
            tx, ty, tz = B.pivot
            B.turret_root.location = (tx - 0.35, ty + 0.45, 0.10 + tz * 0.15)
            B.turret_root.rotation_euler = (0.55, 0.35, 2.1)
            if B.gun is not None:
                B.gun.rotation_euler = (0, 0.45, 0.2)
        if 'erector' in B.h:
            B.h['erector'].rotation_euler = (0.35, -0.25, 0.25)
        if 'rack' in B.h:
            B.h['rack'].rotation_euler = (0.45, -0.1, 0.3)
        for key in ('boom', 'tube'):
            if key in B.h:
                B.h[key].rotation_euler = (0.9, 0.6, 0.4)
        vis = [o for o in everything if o not in missing]
        return vis + [B.scorch], vis

    fx_objs = [o for k in sorted(show_fx) for o in B.effects.get(k, [])]
    hull = [o for o in B.objs['hull'] if o not in missing]
    turret = [o for o in B.objs['turret'] if o not in missing]
    if turreted:
        if part == 'turret':
            return turret + [o for o in fx_objs if _under(o, B.turret_root)], turret
        if part == 'hull':
            return hull + [o for o in fx_objs if not _under(o, B.turret_root)], hull
        return hull + turret + fx_objs, hull + turret
    solid = hull + turret
    return solid + fx_objs, solid + [o for o in fx_objs if o.name.startswith(('rocket', 'missile'))]


def _under(o, anc):
    p = o.parent
    while p is not None:
        if p is anc:
            return True
        p = p.parent
    return False
