"""Infantry squad member with a hierarchical part rig and procedural poses.

Used for: unit.US.rifle (Ranger squad). Squads are one gameplay footprint
(radius 0.35 tiles) drawn as several cosmetic members from this one sprite set
(design 6.1 / 23.1). Members are exaggerated ~1.35x for readability.
States: idle (breathing), move (walk cycle), aim, fire (recoil), death, cover
(crouched). Team colour is on the helmet cover and the chest rig so it reads
at 20 px.
"""
import math

import fclib
from fclib import box, cyl, sphere, empty, mat

S = 0.55  # standing height in tiles


def build(faction, params):
    M = fclib.faction_mats(faction or 'US')
    uniform = mat(f'{faction}_uniform', params.get('uniform', '#6B6A55'), rough=0.9, grime=0.35)
    boots = mat('boots', '#3A342C', rough=0.8, grime=0.2)
    skin = mat('skin', '#8A6A52', rough=0.7, grime=0.1)
    gear = mat('gear', '#4A4A3E', rough=0.85, grime=0.3)
    root = empty('root')
    pelvis = empty('pelvis', loc=(0, 0, 0.26), parent=root)
    parts = []
    parts.append(box('hips', (0.07, 0.12, 0.06), loc=(0, 0, 0), material=uniform, parent=pelvis))
    spine = empty('spine', loc=(0, 0, 0.03), parent=pelvis)
    parts.append(box('torso', (0.09, 0.13, 0.15), loc=(0, 0, 0.08), material=uniform, taper=(1.0, 1.1),
                     parent=spine))
    parts.append(box('chest_rig', (0.10, 0.135, 0.08), loc=(0.008, 0, 0.09), material=M['team'], parent=spine))
    parts.append(box('backpack', (0.06, 0.10, 0.10), loc=(-0.07, 0, 0.10), material=gear, parent=spine))
    neck = empty('neck', loc=(0, 0, 0.17), parent=spine)
    parts.append(sphere('head', 0.034, loc=(0.005, 0, 0.035), material=skin, parent=neck))
    parts.append(sphere('helmet', 0.043, loc=(-0.002, 0, 0.05), material=M['team'], parent=neck,
                        scale=(1.05, 1.0, 0.8)))
    legs, arms = {}, {}
    for s, side in ((1, 'L'), (-1, 'R')):
        hip = empty(f'hip_{side}', loc=(0, 0.035 * s, -0.02), parent=pelvis)
        parts.append(box(f'thigh_{side}', (0.05, 0.05, 0.13), loc=(0, 0, -0.065), material=uniform, parent=hip))
        knee = empty(f'knee_{side}', loc=(0, 0, -0.13), parent=hip)
        parts.append(box(f'shin_{side}', (0.045, 0.045, 0.11), loc=(0, 0, -0.055), material=uniform, parent=knee))
        parts.append(box(f'boot_{side}', (0.07, 0.045, 0.03), loc=(0.012, 0, -0.115), material=boots,
                         parent=knee))
        legs[side] = (hip, knee)
        sh = empty(f'shoulder_{side}', loc=(0.0, 0.075 * s, 0.14), parent=spine)
        parts.append(box(f'upper_arm_{side}', (0.04, 0.04, 0.10), loc=(0, 0, -0.05), material=uniform, parent=sh))
        el = empty(f'elbow_{side}', loc=(0, 0, -0.10), parent=sh)
        parts.append(box(f'forearm_{side}', (0.036, 0.036, 0.09), loc=(0, 0, -0.045), material=uniform, parent=el))
        arms[side] = (sh, el)
    # rifle held in front of the chest, attached to spine so aim follows torso
    rifle = empty('rifle', loc=(0.07, -0.03, 0.11), parent=spine)
    parts.append(box('rifle_body', (0.20, 0.022, 0.04), loc=(0.04, 0, 0), material=M['dark'], parent=rifle))
    parts.append(cyl('rifle_barrel', 0.008, 0.10, loc=(0.18, 0, 0.008), rot=(0, math.pi / 2, 0),
                     material=M['metal'], verts=6, bevel=0, parent=rifle))
    parts.append(box('rifle_mag', (0.025, 0.018, 0.04), loc=(0.03, 0, -0.03), material=M['dark'], parent=rifle))
    hp_muzzle = empty('hp_muzzle', loc=(0.235, 0, 0.008), parent=rifle)
    hp_muzzle['fc_parts'] = ['body']
    hp_top = empty('hp_healthbar', loc=(0, 0, 0.66), parent=root)
    hp_top['fc_parts'] = ['body']
    rig = fclib.Rig(root)
    rig.parts = {'body': parts}
    rig.pelvis, rig.spine, rig.neck, rig.legs, rig.arms, rig.rifle = pelvis, spine, neck, legs, arms, rifle
    rig.hardpoints = {'muzzle': hp_muzzle, 'healthbar': hp_top}
    return rig


def _neutral(rig):
    rig.pelvis.location = (0, 0, 0.26)
    rig.pelvis.rotation_euler = (0, 0, 0)
    rig.spine.rotation_euler = (0, 0, 0)
    rig.neck.rotation_euler = (0, 0, 0)
    rig.rifle.location = (0.07, -0.03, 0.11)
    rig.rifle.rotation_euler = (0, 0, 0)
    for side, (hip, knee) in rig.legs.items():
        hip.rotation_euler = (0, 0, 0)
        knee.rotation_euler = (0, 0, 0)
    # port-arms: both forearms forward holding rifle
    for side, (sh, el) in rig.arms.items():
        sh.rotation_euler = (0, -0.35 if side == 'L' else -0.5, 0)
        el.rotation_euler = (0, -1.2 if side == 'L' else -1.0, 0)


def _aim(rig, recoil=0.0):
    rig.spine.rotation_euler = (0, 0.05 - recoil * 0.4, 0)
    rig.rifle.location = (0.05 - recoil, -0.02, 0.14)
    rig.rifle.rotation_euler = (0, 0, 0)
    rig.neck.rotation_euler = (0, 0.15, 0)
    rig.arms['R'][0].rotation_euler = (0.3, -1.25, 0)
    rig.arms['R'][1].rotation_euler = (0, -0.6, 0)
    rig.arms['L'][0].rotation_euler = (-0.2, -1.45, 0)
    rig.arms['L'][1].rotation_euler = (0, -0.1, 0)


def pose(rig, st, frame, d):
    rig.root.rotation_euler = (0, 0, fclib.heading_to_blender_z(d, st['directions']))
    _neutral(rig)
    fclib.set_char_all(0.0)
    name, n = st['name'], max(1, st['frames'])
    t = frame / n
    if name == 'idle':
        rig.spine.rotation_euler = (0, 0.02 * math.sin(t * 2 * math.pi), 0)
        rig.pelvis.location.z = 0.26 + 0.002 * math.sin(t * 2 * math.pi)
    elif name == 'move':
        ph = t * 2 * math.pi
        for side, sgn in (('L', 1), ('R', -1)):
            hip, knee = rig.legs[side]
            a = math.sin(ph) * 0.8 * sgn
            hip.rotation_euler = (0, -a, 0)
            knee.rotation_euler = (0, max(0.0, -math.cos(ph) * 0.9 * sgn) + 0.1, 0)
        rig.pelvis.location.z = 0.255 + 0.008 * abs(math.cos(ph))
        rig.spine.rotation_euler = (0, 0.18, 0.06 * math.sin(ph))
    elif name == 'aim':
        _aim(rig)
    elif name == 'fire':
        _aim(rig, recoil=[0.03, 0.015, 0.0, 0.0][min(frame, 3)])
    elif name == 'cover':
        rig.pelvis.location.z = 0.17
        for side in ('L', 'R'):
            hip, knee = rig.legs[side]
            hip.rotation_euler = (0, -1.2 if side == 'L' else -0.3, 0)
            knee.rotation_euler = (0, 1.9 if side == 'L' else 1.4, 0)
        rig.spine.rotation_euler = (0, 0.35 + 0.08 * math.cos(t * 2 * math.pi), 0)
        rig.neck.rotation_euler = (0, 0, 0.45 * math.cos(t * 2 * math.pi))   # opposite scan poses for the two-frame cover loop
    elif name == 'death':
        k = min(1.0, (frame + 1) / (n - 1))
        k = k * k
        rig.pelvis.rotation_euler = (1.0 * k, -1.05 * k, 0.3 * k)
        rig.pelvis.location = (-0.08 * k, -0.08 * k, 0.26 - 0.21 * k)
        for side in ('L', 'R'):
            hip, knee = rig.legs[side]
            hip.rotation_euler = (0, 0.5 * k, 0)
            knee.rotation_euler = (0, 0.4 * k, 0)
        rig.arms['L'][0].rotation_euler = (-1.0 * k, -0.3, 0)
        rig.rifle.location = (0.10 + 0.1 * k, -0.08 - 0.1 * k, 0.11)
        rig.rifle.rotation_euler = (0.6 * k, 0, 0.8 * k)
        if frame == n - 1:
            fclib.set_char_all(0.0)
    return rig.parts['body'], rig.parts['body']
