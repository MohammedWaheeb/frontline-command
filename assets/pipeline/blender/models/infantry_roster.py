"""Original specialist infantry silhouettes and procedural role animations.

Codex-authored during the user-authorized Claude quota takeover. Extends only
fclib's existing projection/material/render contract. The original US Ranger
model remains in infantry.py. One cosmetic member represents a Go squad; this
module never changes gameplay footprint, actor count, weapon rules or vision.
"""
import math

import fclib
from fclib import box, cyl, empty, mat, sphere
from mathutils import Euler, Matrix, Vector


UNIFORMS = {
    'US': ('#85816A', '#676B55', '#464E40'),
    'IR': ('#7E7558', '#6B5F43', '#54503C'),
    'SY': ('#8A6F52', '#6E5A41', '#514339'),
    'SA': ('#B2A286', '#8D826C', '#666755'),
}
ROLES = {'rifle', 'at', 'recon', 'elite', 'engineer', 'medic', 'portable_aa'}


class Soldier:
    def __init__(self, faction, role):
        self.faction, self.role = faction, role
        self.m = fclib.faction_mats(faction)
        cloth, patch, armor = UNIFORMS[faction]
        self.m.update({
            'cloth': mat(f'{faction}_field_uniform', cloth, rough=.92, grime=.28),
            'patch': mat(f'{faction}_field_patch', patch, rough=.94, grime=.32),
            'armor': mat(f'{faction}_field_armor', armor, rough=.75, grime=.22),
            'boot': mat('infantry_boot_leather', '#39372F', rough=.88, grime=.25),
            'skin': mat('infantry_skin', {'US':'#92735A','IR':'#947154','SY':'#997857','SA':'#917155'}[faction], rough=.8, grime=.08),
            'glove': mat('infantry_glove', '#625A46', rough=.86),
            'brass': mat('infantry_brass', '#B29B62', rough=.55, metal=.35),
            'aid': mat('infantry_aid_canvas', '#C8C4AD', rough=.86, grime=.12),
            'wood': mat('infantry_wood_furniture', '#75604A', rough=.83, grime=.18),
        })
        self.root = empty('root')
        self.pelvis = empty('pelvis', (0, 0, .28), self.root)
        self.spine = empty('spine', (0, 0, .035), self.pelvis)
        self.neck = empty('neck', (0, 0, .17), self.spine)
        self.parts, self.weapon_meshes, self.work_meshes, self.optics_meshes = [], [], [], []
        self.legs, self.arms = {}, {}
        self.weapon = empty('weapon_mount', (.07, -.033, .11), self.spine)
        self.work = empty('work_gear_mount', (.10, -.09, .05), self.spine)
        self.optics = empty('observation_mount', (.06, 0, .15), self.spine)
        self.special = {}

    def b(self, name, size, loc, material='cloth', parent=None, group=None, **kw):
        ob = box(name, size, loc=loc, material=self.m[material], parent=parent or self.spine,
                 bevel=kw.pop('bevel', .005), **kw)
        (self.parts if group is None else group).append(ob)
        return ob

    def c(self, name, radius, depth, loc, material='metal', parent=None, group=None, **kw):
        ob = cyl(name, radius, depth, loc=loc, material=self.m[material], parent=parent or self.spine,
                 verts=kw.pop('verts', 10), bevel=kw.pop('bevel', .002), **kw)
        (self.parts if group is None else group).append(ob)
        return ob

    def s(self, name, radius, loc, material='cloth', parent=None, **kw):
        ob = sphere(name, radius, loc=loc, material=self.m[material], parent=parent or self.spine,
                    segs=12, **kw)
        self.parts.append(ob)
        return ob

    def cap(self, name, radius, loc, material, parent, **kw):
        # Keep a real open-faced dome instead of hiding the face inside a sphere.
        ob = self.s(name, radius, loc, material, parent, **kw)
        bm = fclib.bmesh.new()
        bm.from_mesh(ob.data)
        fclib.bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -.00001], context='VERTS')
        fclib.bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
        return ob

    def body(self):
        f = self.faction
        self.b('trouser_hips', (.075,.125,.058), (0,0,0), parent=self.pelvis)
        self.b('field_tunic', (.092,.137,.154), (0,0,.078), taper=(1.03,1.08))
        self.b('web_belt', (.099,.143,.022), (0,0,-.002), 'armor', self.pelvis)
        self.b('belt_buckle', (.014,.037,.017), (.055,0,-.002), 'brass', self.pelvis)
        self.s('face', .035, (.004,0,.032), 'skin', self.neck, scale=(1.02,.90,1.12))
        self.b('face_nose', (.016,.018,.020), (.035,0,.034), 'skin', self.neck, bevel=.004)
        for sign in (-1,1):
            self.b('eye_'+str(sign), (.006,.009,.006), (.036,sign*.015,.041), 'dark', self.neck, bevel=.001)
        for side, sign in (('L',1),('R',-1)):
            hip = empty('hip_'+side, (0,.037*sign,0), self.pelvis)
            self.b('thigh_'+side, (.050,.052,.130), (0,0,-.065), parent=hip)
            knee = empty('knee_'+side, (0,0,-.130), hip)
            self.b('shin_'+side, (.044,.045,.113), (0,0,-.056), parent=knee)
            self.b('boot_'+side, (.075,.049,.032), (.014,0,-.129), 'boot', knee)
            self.b('boot_sole_'+side, (.078,.051,.010), (.015,0,-.145), 'dark', knee, bevel=.002)
            self.b('trouser_pocket_'+side, (.035,.013,.048), (.004,.029*sign,-.049), 'patch', hip)
            self.legs[side] = hip, knee
            shoulder = empty('shoulder_'+side, (0,.079*sign,.143), self.spine)
            self.b('upper_sleeve_'+side, (.043,.044,.093), (0,0,-.045), parent=shoulder)
            elbow = empty('elbow_'+side, (0,0,-.09), shoulder)
            self.b('forearm_'+side, (.036,.037,.080), (0,0,-.040), 'skin' if f=='SY' else 'cloth', elbow)
            self.b('glove_'+side, (.041,.036,.032), (0,0,-.088), 'glove', elbow)
            self.b('sleeve_team_band_'+side, (.046,.046,.026), (0,0,-.028), 'team', shoulder)
            self.arms[side] = shoulder, elbow
        if f == 'US':
            self.b('modular_front_plate', (.032,.128,.110), (.054,0,.084), 'armor', taper=(.95,.91))
            self.b('rear_plate', (.026,.123,.105), (-.055,0,.088), 'armor')
            self.cap('low_profile_helmet', .046, (-.004,0,.055), 'patch', self.neck, scale=(1.10,1,.73))
            self.b('helmet_team_crown', (.056,.044,.013), (-.006,0,.091), 'team', self.neck)
            for y in (-.043,0,.043):
                self.b('front_mag_pouch_'+str(y), (.035,.036,.047), (.081,y,.055), 'patch')
            for side,(hip,knee) in self.legs.items():
                self.b('knee_pad_'+side, (.018,.042,.046), (.026,0,.003), 'armor', knee)
        elif f == 'IR':
            self.b('long_jacket_skirt', (.109,.143,.089), (-.008,0,-.022), 'patch', self.pelvis, taper=(1.05,1.12))
            self.b('woven_chest_webbing', (.026,.142,.082), (.052,0,.070), 'armor')
            self.cap('round_field_helmet', .047, (-.002,0,.051), 'cloth', self.neck, scale=(1.02,1,.82))
            self.b('helmet_team_strip', (.085,.028,.014), (-.002,0,.091), 'team', self.neck)
            self.b('raised_jacket_collar', (.093,.122,.024), (-.008,0,.150), 'patch')
            self.c('shoulder_bedroll', .032,.150, (-.077,0,.137), 'canvas', rot=(math.pi/2,0,0))
            for y in (-.046,.046):
                self.b('webbing_pouch_'+str(y), (.036,.046,.063), (.070,y,.051), 'patch')
        elif f == 'SY':
            self.b('asymmetric_field_vest', (.027,.138,.113), (.049,0,.081), 'armor')
            self.b('repaired_shoulder_panel', (.058,.074,.047), (-.006,.053,.135), 'patch')
            self.cap('soft_field_cap', .043, (-.005,0,.055), 'patch', self.neck, scale=(1.15,1,.47))
            self.b('cap_peak', (.058,.067,.012), (.039,0,.059), 'armor', self.neck)
            self.b('cap_team_patch', (.024,.044,.017), (.024,0,.069), 'team', self.neck)
            self.b('crossbody_strap', (.018,.018,.161), (.065,0,.076), 'canvas', rot=(.38,0,0))
            self.b('side_messenger_bag', (.074,.047,.083), (-.013,.100,.027), 'canvas')
            self.b('mended_jacket_patch', (.020,.047,.044), (-.045,-.065,.043), 'patch')
        else:
            self.b('broad_plate_carrier', (.037,.150,.119), (.056,0,.082), 'armor', taper=(.98,1.02))
            self.b('rear_armor_panel', (.027,.134,.112), (-.056,0,.085), 'patch')
            self.cap('desert_helmet', .046, (-.005,0,.053), 'patch', self.neck, scale=(1.13,1.02,.76))
            self.b('visor', (.023,.078,.026), (.035,0,.050), 'glass', self.neck, bevel=.006)
            self.b('helmet_team_panel', (.051,.044,.014), (-.013,0,.091), 'team', self.neck)
            self.b('neck_scarf', (.105,.140,.032), (-.012,0,.153), 'canvas')
            for side,sign in (('L',1),('R',-1)):
                self.b('shoulder_plate_'+side, (.066,.063,.028), (0,0,.002), 'patch', self.arms[side][0], bevel=.008)
                self.c('belt_canteen_'+side,.025,.066,(-.046,.084*sign,.017),'armor')
        chest_x = {'US':.076,'IR':.071,'SY':.0685,'SA':.0805}[f]
        self.b('chest_team_marker', (.012,.050,.031), (chest_x,0,.116), 'team')

    def firearm(self):
        role, f = self.role, self.faction
        if role in ('engineer','medic'):
            return
        group, mount = self.weapon_meshes, self.weapon
        if role in ('at','portable_aa'):
            length = .43 if role == 'at' else .49
            radius = .037 if role == 'at' else .025
            self.c('shoulder_launch_tube',radius,length,(.015,0,0),'armor',mount,group,rot=(0,math.pi/2,0),verts=12)
            self.c('launcher_front_ring',radius*1.20,.035,(length/2+.015,0,0),'metal',mount,group,rot=(0,math.pi/2,0),verts=12)
            self.c('launcher_mouth',radius*.79,.038,(length/2+.021,0,0),'dark',mount,group,rot=(0,math.pi/2,0))
            self.c('rear_tube_collar',radius*1.24,.055,(-length/2+.01,0,0),'patch',mount,group,rot=(0,math.pi/2,0))
            self.b('launcher_team_sleeve',(.065,radius*2.05,radius*2.05),(-.075,0,0),'team',mount,group)
            self.b('launcher_grip',(.031,.029,.082),(.034,0,-.054),'dark',mount,group)
            self.b('launcher_optic',(.075,.031,.035),(.090,-radius-.008,.026),'glass',mount,group)
            if role == 'at':
                self.b('guidance_box',(.084,.055,.058),(.030,-radius-.017,-.010),'patch',mount,group)
                self.c('spare_capped_tube',.028,.31,(-.090,.034,.082),'armor',self.spine,rot=(0,-.15,0))
            else:
                self.b('tracking_battery',(.077,.040,.080),(-.046,0,-.054),'patch',mount,group)
            muzzle = (length/2+.044,0,0)
        else:
            length = {'US':.195,'IR':.208,'SY':.221,'SA':.194}[f]
            if role == 'recon':
                length *= .82
            self.b('carbine_receiver',(length,.025,.039),(.026,0,0),'metal',mount,group)
            self.b('weapon_stock',(.074,.030,.033),(-length/2-.006,0,-.001),'wood' if f=='SY' else 'armor',mount,group)
            self.b('weapon_foregrip',(.073,.031,.025),(.090,0,-.008),'wood' if f=='SY' else 'patch',mount,group)
            self.c('carbine_barrel',.008,.092,(length/2+.058,0,.008),'metal',mount,group,rot=(0,math.pi/2,0),verts=8)
            self.b('carbine_magazine',(.027,.022,.050),(.026,0,-.034),'dark',mount,group,rot=(0,-.18,0))
            self.b('sight_rail',(.076,.019,.013),(.024,0,.027),'dark',mount,group)
            muzzle = (length/2+.106,0,.008)
            if role == 'elite':
                self.c('barrel_shroud',.017,.080,(muzzle[0]+.018,0,.008),'dark',mount,group,rot=(0,math.pi/2,0))
                self.b('compact_optic',(.054,.030,.029),(.041,0,.045),'glass',mount,group)
                muzzle = (muzzle[0]+.06,0,.008)
        self.special['muzzle'] = empty('hp_muzzle',muzzle,mount)

    def equipment(self):
        role, f = self.role, self.faction
        if role == 'recon':
            self.b('field_radio',(.079,.105,.134),(-.089,0,.070),'armor')
            self.b('radio_team_panel',(.010,.061,.038),(-.133,0,.096),'team')
            self.c('radio_antenna',.004,.220,(-.102,-.039,.220),'metal',verts=6,bevel=0)
            self.c('radio_antenna_tip',.009,.016,(-.102,-.039,.332),'brass',verts=8)
            self.b('folded_map_case',(.028,.070,.072),(.067,.047,.016),'canvas')
            for sign in (-1,1):
                self.c('binocular_'+str(sign),.022,.082,(.027,sign*.027,0),'armor',self.optics,self.optics_meshes,rot=(0,math.pi/2,0))
                self.c('binocular_glass_'+str(sign),.018,.009,(.070,sign*.027,0),'glass',self.optics,self.optics_meshes,rot=(0,math.pi/2,0))
            self.b('binocular_bridge',(.024,.064,.020),(.010,0,0),'metal',self.optics,self.optics_meshes)
            if f == 'IR':
                self.b('forward_beacon_kit',(.085,.095,.044),(0,0,0),'armor',self.work,self.work_meshes)
                self.b('beacon_identifier',(.060,.065,.011),(0,0,.028),'team',self.work,self.work_meshes)
                self.c('beacon_whip',.004,.130,(-.027,0,.091),'metal',self.work,self.work_meshes,verts=6,bevel=0)
                self.b('beacon_foldout_foot',(.130,.025,.012),(0,0,-.027),'patch',self.work,self.work_meshes)
        elif role == 'elite':
            self.b('reinforced_abdominal_plate',(.031,.117,.055),(.062,0,-.008),'armor')
            self.b('compact_mission_pack',(.063,.116,.132),(-.082,0,.081),'armor')
            self.b('mission_pack_team_panel',(.013,.073,.038),(-.118,0,.100),'team')
            for side in ('L','R'):
                self.b('elite_shoulder_guard_'+side,(.064,.060,.033),(0,0,.005),'armor',self.arms[side][0])
                self.b('elite_kneepad_'+side,(.022,.045,.043),(.028,0,.008),'armor',self.legs[side][1])
            self.b('folded_optics_mount',(.030,.028,.036),(.042,0,.085),'dark',self.neck)
            self.b('sabotage_case',(.098,.079,.064),(0,0,0),'armor',self.work,self.work_meshes)
            self.b('sabotage_case_control',(.038,.038,.010),(.023,0,.037),'brass',self.work,self.work_meshes)
        elif role == 'engineer':
            self.b('repair_backpack',(.095,.120,.143),(-.095,0,.073),'armor')
            self.c('repair_pack_cylinder',.029,.150,(-.108,.065,.080),'patch')
            self.b('repair_pack_team_panel',(.014,.085,.034),(-.150,0,.105),'team')
            self.b('tool_belt_apron',(.027,.141,.072),(.053,0,-.029),'canvas')
            for y in (-.046,0,.046):
                self.b('apron_tool_'+str(y),(.018,.014,.062),(.072,y,-.022),'metal')
            self.b('tool_handle',(.020,.022,.140),(0,0,-.040),'metal',self.work,self.work_meshes)
            self.b('spanner_fork_left',(.023,.019,.041),(0,.018,.038),'brass',self.work,self.work_meshes)
            self.b('spanner_fork_right',(.023,.019,.041),(0,-.018,.038),'brass',self.work,self.work_meshes)
            self.b('spanner_head_bridge',(.023,.050,.018),(0,0,.017),'brass',self.work,self.work_meshes)
            self.b('handheld_access_panel',(.073,.075,.019),(0,0,0),'armor',self.optics,self.work_meshes)
            self.b('access_panel_keys',(.041,.047,.005),(.004,-.002,.012),'brass',self.optics,self.work_meshes)
        elif role == 'medic':
            self.b('medical_backpack',(.085,.140,.138),(-.093,0,.073),'aid')
            self.b('medical_pack_flap',(.020,.145,.060),(-.142,0,.115),'armor')
            self.b('aid_identifier_band',(.011,.109,.035),(-.155,0,.117),'team')
            self.b('medical_side_satchel',(.076,.054,.093),(-.006,.108,.026),'aid')
            self.b('medical_satchel_flap',(.077,.058,.032),(-.006,.111,.078),'patch')
            self.b('medical_case',(.109,.080,.057),(0,0,-.030),'aid',self.work,self.work_meshes)
            self.b('medical_case_band',(.116,.031,.061),(0,0,-.028),'team',self.work,self.work_meshes)
            self.b('medical_case_handle',(.061,.018,.027),(0,0,.012),'armor',self.work,self.work_meshes)
        elif role in ('rifle','at','portable_aa'):
            self.b('field_haversack',(.061,.097,.093),(-.080,0,.070),'canvas')
            self.b('haversack_straps',(.066,.108,.022),(-.082,0,.111),'armor')
        if f == 'SY':
            self.b('rolled_groundsheet',(.093,.039,.073),(-.099,-.071,.040),'patch',rot=(.15,0,0))
        elif f == 'SA':
            self.b('hydration_side_pouch',(.052,.036,.102),(-.079,-.079,.055),'patch')


def build(faction, params):
    faction = faction or 'US'
    role = params.get('role', 'rifle')
    if faction not in UNIFORMS or role not in ROLES or role == 'portable_aa' and faction != 'SY':
        raise ValueError('unknown infantry roster role or faction')
    h = Soldier(faction, role)
    h.body(); h.firearm(); h.equipment()
    rig = fclib.Rig(h.root)
    rig.soldier = h
    rig.parts = {'body': h.parts + h.weapon_meshes + h.work_meshes + h.optics_meshes}
    rig.hardpoints = {'healthbar': empty('hp_healthbar',(0,0,.74 if role=='recon' else .66),h.root)}
    if 'muzzle' in h.special:
        rig.hardpoints['muzzle'] = h.special['muzzle']
    rig.hardpoints['work'] = empty('hp_work',(.070,0,0),h.optics) if role=='recon' and faction!='IR' else empty('hp_work',(.03,0,.03),h.work)
    for hp in rig.hardpoints.values():
        hp['fc_parts'] = ['body','whole']
    rig.original = {o:(o.location.copy(),o.rotation_euler.copy(),o.scale.copy())
                    for o in fclib.bpy.context.scene.objects if o is h.root or o.parent is not None}
    return rig


def crouch(h, amount=1.0):
    h.pelvis.location.z = .28 - .075*amount
    for side in ('L','R'):
        hip,knee = h.legs[side]
        hip.rotation_euler.y = (-1.08 if side=='L' else -.35)*amount
        knee.rotation_euler.y = (1.73 if side=='L' else 1.35)*amount
    h.spine.rotation_euler.y = .22*amount


def aim(h, recoil=0.0):
    h.spine.rotation_euler.y = .06 - recoil*.65
    h.weapon.location = (.046-recoil,-.033,.15)
    h.weapon.rotation_euler.y = 0
    h.neck.rotation_euler.y = .11
    for side in ('L','R'):
        h.arms[side][0].rotation_euler = ((-.18 if side=='L' else .20),-1.32,0)
        h.arms[side][1].rotation_euler.y = -.30 if side=='L' else -.65
    if h.role in ('at','portable_aa'):
        h.weapon.location = (.035-recoil,-.081,.183)
        h.weapon.rotation_euler.y = -.12 if h.role=='at' else -.47
        h.neck.rotation_euler.z = -.13


def grip(h, side, mount, point):
    """Place the two arm segments around a reachable equipment grip socket."""
    shoulder, elbow = h.arms[side]
    target = mount.location + mount.rotation_euler.to_matrix() @ Vector(point)
    delta = target - shoulder.location
    # These are the model's shoulder-to-elbow and elbow-to-glove lengths.
    upper, lower = .090, .088
    distance = delta.length
    assert .006 < distance <= upper+lower+.007, (h.role,h.pose_key,side,'unreachable grip',distance)
    direction = delta.normalized()
    reach = min(distance,upper+lower-.0001)
    along = (upper*upper-lower*lower+reach*reach)/(2*reach)
    radius = math.sqrt(max(0,upper*upper-along*along))
    pole = Vector((-.25,.60 if side=='L' else -.60,-1))
    bend = (pole-direction*pole.dot(direction)).normalized()
    joint = shoulder.location + direction*along + bend*radius
    first = (joint-shoulder.location).normalized()
    shoulder.rotation_euler = Vector((0,0,-1)).rotation_difference(first).to_euler()
    # The elbow's local pivot is the end of the rotated upper segment.
    last = shoulder.rotation_euler.to_matrix().inverted() @ (target-joint).normalized()
    elbow.rotation_euler = Vector((0,0,-1)).rotation_difference(last).to_euler()
    h.grip_checks.append({'side':side,'reach':distance,
                         'error':(joint+(target-joint).normalized()*lower-target).length})


def hold_equipment(h, name):
    if name == 'death':
        return
    working = name.startswith('work_')
    if h.role == 'engineer':
        grip(h,'R',h.work,(0,0,-.040))
        grip(h,'L',h.optics,(0,0,-.013))
    elif h.role == 'medic':
        grip(h,'L' if working else 'R',h.work,(0,0,.023))
    elif h.role == 'elite' and working:
        grip(h,'L',h.work,(0,.043,.010))
        grip(h,'R',h.work,(0,-.043,.010))
    elif h.role == 'recon' and name == 'channel':
        if h.faction == 'IR':
            grip(h,'L',h.work,(0,.045,.015))
            grip(h,'R',h.work,(0,-.045,.015))
        else:
            grip(h,'L',h.optics,(0,.035,-.005))
            grip(h,'R',h.optics,(0,-.035,-.005))
    elif h.role in ('at','portable_aa'):
        grip(h,'L',h.weapon,(.065,.037,-.030))
        grip(h,'R',h.weapon,(.034,-.008,-.072))
    else:
        grip(h,'L',h.weapon,(.065,.018,-.013))
        grip(h,'R',h.weapon,(.025,-.013,-.035))


def local_matrix(ob):
    return Matrix.Translation(ob.location) @ ob.rotation_euler.to_matrix().to_4x4()


def drop_equipment(h, mount, start, amount, location, rotation):
    """Settle released gear in the ground frame, independent of torso rotation."""
    origin, attitude, _ = start.decompose()
    position = origin.lerp(Vector(location),amount)
    turn = attitude.slerp(Euler(rotation,'XYZ').to_quaternion(),amount)
    ground = Matrix.Translation(position) @ turn.to_matrix().to_4x4()
    parent = local_matrix(h.pelvis) @ local_matrix(h.spine)
    loc, rot, _ = (parent.inverted() @ ground).decompose()
    mount.location, mount.rotation_euler = loc, rot.to_euler()


def pose(rig, st, frame, d):
    h = rig.soldier
    for ob,(loc,rot,scale) in rig.original.items():
        ob.location,ob.rotation_euler,ob.scale = loc.copy(),rot.copy(),scale.copy()
    h.root.rotation_euler.z = fclib.heading_to_blender_z(d,st['directions'])
    name,n = st['name'],max(1,st.get('frames',1))
    h.pose_key, h.grip_checks = (name,d,frame), []
    phase = frame/n*math.tau
    sine,cosine = math.sin(phase),math.cos(phase)
    fclib.set_char_all(0);fclib.set_grime_all(0);fclib.set_emission_scale(1)
    armed = h.role not in ('engineer','medic')
    visible = list(h.parts)
    if armed:
        visible += h.weapon_meshes
        for side in ('L','R'):
            h.arms[side][0].rotation_euler.y = -.45 if side=='L' else -.56
            h.arms[side][1].rotation_euler.y = -1.02 if side=='L' else -.91
        h.weapon.rotation_euler.y = .14
        if h.role in ('at','portable_aa'):
            h.weapon.location = (.014,-.076,.153)
            h.weapon.rotation_euler.y = -.27
    else:
        visible += h.work_meshes
        h.work.location = (.018,-.112,.025 if h.role=='engineer' else -.020)
        h.optics.location = (.070,.080,.030)
        h.optics.rotation_euler.y = -.18
        h.arms['R'][0].rotation_euler.y = -.24
        h.arms['R'][1].rotation_euler.y = -.23
    if h.role == 'recon':
        visible += h.optics_meshes
        h.optics.location = (.098,.015,.053)
        h.optics.rotation_euler.y = .65
    if name == 'idle':
        h.spine.rotation_euler.y = .025*sine
        h.pelvis.location.z += .003*cosine
        h.neck.rotation_euler.z = .11*sine
    elif name == 'move':
        for side,sgn in (('L',1),('R',-1)):
            hip,knee = h.legs[side]
            hip.rotation_euler.y = -.64*sine*sgn
            knee.rotation_euler.y = max(0,-cosine*sgn)*.91+.04
            if not armed:
                h.arms[side][0].rotation_euler.y = .45*sine*sgn
        h.pelvis.location.z = .277+.009*abs(cosine)
        h.spine.rotation_euler = (0,.14,.055*sine)
        h.work.location.x += .023*sine
    elif name in ('aim','fire'):
        recoil = [0.035,.012,0,0][min(frame,3)] if name=='fire' else 0
        aim(h,recoil)
    elif name in ('cover','concealed_idle'):
        crouch(h,1 if name=='cover' else 1.12)
        h.spine.rotation_euler.y += .080*cosine
        h.neck.rotation_euler.z = .36*cosine
        h.weapon.rotation_euler.y = -.04
        if name == 'concealed_idle':
            h.spine.rotation_euler.x = -.08+.04*cosine
            h.work.location.z -= .045
    elif name == 'channel':
        crouch(h,.72)
        h.spine.rotation_euler.y += .035*cosine
        h.neck.rotation_euler.z = .12*cosine
        h.weapon.location = (.050,-.038,.055)
        h.weapon.rotation_euler.y = .52
        h.optics.location = (.067,0,.192)
        h.optics.rotation_euler = (0,.04*cosine,.09*sine)
        h.arms['L'][0].rotation_euler = (-.18,-1.45,0)
        h.arms['L'][1].rotation_euler.y = -.59
        h.arms['R'][0].rotation_euler = (.16,-1.30+.10*cosine,0)
        h.arms['R'][1].rotation_euler.y = -.74
        if h.faction == 'IR':
            crouch(h,.96)
            h.spine.rotation_euler.y += .16+.04*cosine
            h.neck.rotation_euler.y = .32
            h.work.location = (.110,0,.005)
            h.work.rotation_euler.y = -.15
            h.arms['L'][0].rotation_euler.y = -.98
            h.arms['L'][1].rotation_euler.y = -.27
            h.arms['R'][0].rotation_euler.y = -.86+.16*cosine
            h.arms['R'][1].rotation_euler.y = -.38
            visible = [o for o in visible if o not in h.optics_meshes] + h.work_meshes
    elif name in ('work_capture','work_repair','work_heal','work_sabotage'):
        crouch(h,.92)
        h.spine.rotation_euler.y += .15+.06*cosine
        h.neck.rotation_euler.y = .30+.05*sine
        h.weapon.location = (-.070,-.074,.080)
        h.weapon.rotation_euler = (0,1.12,-.30)
        h.work.location = (.100,-.045,.070)
        h.work.rotation_euler.y = -.18
        if h.work_meshes and not all(o in visible for o in h.work_meshes):
            visible += h.work_meshes
        h.arms['L'][0].rotation_euler = (-.10,-.89,0)
        h.arms['L'][1].rotation_euler.y = -.31
        h.arms['R'][0].rotation_euler = (.13,-.82+.25*sine,0)
        h.arms['R'][1].rotation_euler.y = -.39-.18*sine
        if name == 'work_repair':
            h.work.rotation_euler.x = .32*sine
            h.work.location.z += .018*cosine
        elif name == 'work_capture':
            h.work.rotation_euler.y = -.65
            h.work.location.z += .012*cosine
            h.arms['R'][1].rotation_euler.y -= .16*cosine
        elif name == 'work_heal':
            h.work.location = (.100,.090,.020)
            h.work.rotation_euler.y = -.08
            h.arms['L'][0].rotation_euler.y += .13*cosine
            h.arms['R'][0].rotation_euler.y -= .12*cosine
        else:
            h.work.location = (.110,.010,.015)
            h.work.rotation_euler.z = .08*sine
    elif name == 'death':
        parent = local_matrix(h.pelvis) @ local_matrix(h.spine)
        held = {mount:parent @ local_matrix(mount) for mount in (h.weapon,h.work,h.optics)}
        k = min(1,(frame+1)/max(1,n-1))
        smooth = k*k*(3-2*k)
        h.pelvis.location = (-.068*smooth,-.058*smooth,.28-.225*smooth)
        h.pelvis.rotation_euler = (.62*smooth,-1.35*smooth,.22*smooth)
        h.spine.rotation_euler.y = -.14*smooth
        for side in ('L','R'):
            h.legs[side][0].rotation_euler.y = .40*smooth
            h.legs[side][1].rotation_euler.y = .36*smooth
        h.arms['L'][0].rotation_euler = (-.8*smooth,-.3,0)
        h.arms['R'][0].rotation_euler = (.5*smooth,.2,0)
        if armed:
            height = .085 if h.role=='at' else .052 if h.role=='portable_aa' else .019
            drop_equipment(h,h.weapon,held[h.weapon],smooth,(.08,-.16,height),(math.pi/2,0,.60))
        elif h.role == 'engineer':
            drop_equipment(h,h.work,held[h.work],smooth,(.08,-.16,.030),(math.pi/2,0,.80))
            drop_equipment(h,h.optics,held[h.optics],smooth,(.12,.09,.015),(0,0,.25))
        else:
            drop_equipment(h,h.work,held[h.work],smooth,(.10,-.16,.043),(math.pi/2,0,.50))
    else:
        raise ValueError('infantry roster state not implemented: '+name)
    hold_equipment(h,name)
    return visible,visible
