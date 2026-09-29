"""Frontline Command shared Blender library.

Everything a model script needs to build an original procedural asset and have
it rendered under the one fixed camera contract used by the whole game.

Projection contract (see docs/asset-pipeline.md, "Projection"):
  * 1 Blender unit == 1 simulation tile == 1000 millitiles.
  * Simulation (x, y, z-up) maps to Blender (x, -y, z).
  * Orthographic camera, elevation 30 deg, azimuth looking toward sim (-1, -1).
    This yields a true 2:1 dimetric tile: 64 x 32 px at 1x, 128 x 64 px at 2x.
  * Art is rendered at 2x (ART_SCALE) and derived to 1x by the packer.
  * Heading index d of N means sim heading 2*pi*d/N measured from +x toward +y.
    d=0 faces screen lower-right, d=N/4 faces screen lower-left.
  * The anchor pixel of every frame is the sim position at ground level.
"""
import math
import os
import random

import bpy
import bmesh
from mathutils import Vector, Matrix

ART_SCALE = 2
TILE_W = 64 * ART_SCALE          # screen width of one tile diamond
TILE_H = 32 * ART_SCALE
PX_PER_BU = TILE_W / math.sqrt(2)  # horizontal pixels per Blender unit
CAM_ELEVATION = 30.0
CAM_AZIMUTH = 45.0
SUN_ELEVATION = 50.0
SUN_TRAVEL_DEG = 33.4            # horizontal travel direction of sunlight (Blender XY)

# --------------------------------------------------------------------------- palettes
# Linear-ish base colours chosen in sRGB and converted. All original.
def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c) + (1.0,)

FACTION_PAINT = {
    'US': {'paint': '#666B5C', 'paint2': '#555A4E', 'trim': '#2F3331', 'wall': '#B3B2A2'},
    'IR': {'paint': '#6E6A47', 'paint2': '#56593F', 'trim': '#2E3128', 'wall': '#A59C7C'},
    'SY': {'paint': '#8A6A43', 'paint2': '#6F6553', 'trim': '#3F3226', 'wall': '#AE9670'},
    'SA': {'paint': '#AE9669', 'paint2': '#8F7D5C', 'trim': '#4C4436', 'wall': '#CDB98F'},
}
TEAM_BEAUTY_GREY = '#9DA3A8'   # what team regions look like before client tint

# --------------------------------------------------------------------------- scene
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATS.clear()   # cached datablocks are invalid after a factory reset
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == 'METAL'
        sc.cycles.device = 'GPU'
    except Exception:  # pragma: no cover - CPU fallback is still deterministic enough
        sc.cycles.device = 'CPU'
    sc.cycles.samples = 64
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.02
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 2
    sc.cycles.transparent_max_bounces = 4
    sc.cycles.seed = 7
    sc.render.film_transparent = True
    sc.render.filter_size = 1.2
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.color_depth = '8'
    sc.view_settings.view_transform = 'AgX'
    try:
        sc.view_settings.look = 'AgX - Punchy'
    except TypeError:
        pass
    sc.view_settings.exposure = 0.25
    return sc


def setup_camera(canvas_w, canvas_h, anchor):
    sc = bpy.context.scene
    sc.render.resolution_x = canvas_w
    sc.render.resolution_y = canvas_h
    sc.render.resolution_percentage = 100
    cam = bpy.data.cameras.new('fc_camera')
    cam.type = 'ORTHO'
    cam.sensor_fit = 'HORIZONTAL'
    cam.ortho_scale = canvas_w / PX_PER_BU
    ax, ay = anchor
    cam.shift_x = (canvas_w / 2 - ax) / canvas_w
    cam.shift_y = (ay - canvas_h / 2) / canvas_w
    cam.clip_start = 0.1
    cam.clip_end = 400
    obj = bpy.data.objects.new('fc_camera', cam)
    sc.collection.objects.link(obj)
    sc.camera = obj
    el = math.radians(CAM_ELEVATION)
    obj.rotation_euler = (math.radians(90 - CAM_ELEVATION), 0, math.radians(CAM_AZIMUTH))
    d = Vector((1, -1, 0)).normalized() * math.cos(el) + Vector((0, 0, math.sin(el)))
    obj.location = d * 150
    return obj


def setup_lights(sun_strength=3.3):
    sc = bpy.context.scene
    sun = bpy.data.lights.new('fc_sun', 'SUN')
    sun.energy = sun_strength
    sun.angle = math.radians(3.0)
    sun.color = (1.0, 0.95, 0.86)
    so = bpy.data.objects.new('fc_sun', sun)
    sc.collection.objects.link(so)
    so.rotation_euler = (0, -math.radians(90 - SUN_ELEVATION), math.radians(SUN_TRAVEL_DEG))
    # cool sky fill so shaded faces stay readable, never black
    w = bpy.data.worlds.new('fc_world')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    bg.inputs[0].default_value = (0.52, 0.60, 0.72, 1)
    bg.inputs[1].default_value = 0.8
    # rim light from behind so silhouettes separate from dark terrain
    rim = bpy.data.lights.new('fc_rim', 'SUN')
    rim.energy = 1.1
    rim.color = (0.80, 0.88, 1.0)
    ro = bpy.data.objects.new('fc_rim', rim)
    sc.collection.objects.link(ro)
    ro.rotation_euler = (math.radians(55), 0, math.radians(45 + 180))
    rim.use_shadow = False
    return so


def shadow_catcher(size=40):
    me = bpy.data.meshes.new('fc_ground')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size / 2)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('fc_ground', me)
    bpy.context.scene.collection.objects.link(ob)
    ob.is_shadow_catcher = True
    ob.hide_render = True
    return ob

# --------------------------------------------------------------------------- materials
_MATS = {}


def _grime_group():
    """Shared node group: base colour darkened by grime noise and cavity AO."""
    if 'fc_grime' in bpy.data.node_groups:
        return bpy.data.node_groups['fc_grime']
    g = bpy.data.node_groups.new('fc_grime', 'ShaderNodeTree')
    g.interface.new_socket('Color', in_out='INPUT', socket_type='NodeSocketColor')
    g.interface.new_socket('Grime', in_out='INPUT', socket_type='NodeSocketFloat')
    g.interface.new_socket('Char', in_out='INPUT', socket_type='NodeSocketFloat')
    g.interface.new_socket('Color', in_out='OUTPUT', socket_type='NodeSocketColor')
    n = g.nodes
    l = g.links
    gi = n.new('NodeGroupInput')
    go = n.new('NodeGroupOutput')
    tc = n.new('ShaderNodeTexCoord')
    noise = n.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 7.0
    noise.inputs['Detail'].default_value = 6.0
    noise.inputs['Roughness'].default_value = 0.62
    l.new(tc.outputs['Object'], noise.inputs['Vector'])
    ramp = n.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.42
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    l.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    ao = n.new('ShaderNodeAmbientOcclusion')
    ao.samples = 8
    ao.inputs['Distance'].default_value = 0.12
    dirt = n.new('ShaderNodeMix')
    dirt.data_type = 'RGBA'
    dirt.blend_type = 'MULTIPLY'
    l.new(gi.outputs['Color'], dirt.inputs['A'])
    dirt.inputs['B'].default_value = (0.55, 0.50, 0.44, 1)
    mul = n.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    l.new(ramp.outputs['Color'], mul.inputs[0])
    l.new(gi.outputs['Grime'], mul.inputs[1])
    l.new(mul.outputs[0], dirt.inputs['Factor'])
    cav = n.new('ShaderNodeMix')
    cav.data_type = 'RGBA'
    cav.blend_type = 'MULTIPLY'
    cav.inputs['Factor'].default_value = 0.38
    l.new(dirt.outputs['Result'], cav.inputs['A'])
    l.new(ao.outputs['AO'], cav.inputs['B'])
    char = n.new('ShaderNodeMix')
    char.data_type = 'RGBA'
    l.new(cav.outputs['Result'], char.inputs['A'])
    char.inputs['B'].default_value = (0.018, 0.016, 0.014, 1)
    cmul = n.new('ShaderNodeMath')
    cmul.operation = 'MULTIPLY'
    cmul.inputs[2].default_value = 0.0
    cscale = n.new('ShaderNodeMath')
    cscale.operation = 'MULTIPLY'
    cscale.inputs[1].default_value = 0.15
    l.new(gi.outputs['Char'], cscale.inputs[0])
    l.new(cscale.outputs[0], cmul.inputs[0])
    l.new(ramp.outputs['Color'], cmul.inputs[1])
    cadd = n.new('ShaderNodeMath')
    cadd.operation = 'MULTIPLY_ADD'
    l.new(gi.outputs['Char'], cadd.inputs[0])
    cadd.inputs[1].default_value = 0.85
    l.new(cmul.outputs[0], cadd.inputs[2])
    l.new(cadd.outputs[0], char.inputs['Factor'])
    l.new(char.outputs['Result'], go.inputs['Color'])
    return g


def mat(name, color, rough=0.6, metal=0.0, grime=0.35, team=False, emission=None,
        emission_strength=0.0, alpha=1.0):
    """Create (or return cached) material. team=True marks team-colour regions."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    col = srgb(TEAM_BEAUTY_GREY) if team else (srgb(color) if isinstance(color, str) else color)
    grp = nt.nodes.new('ShaderNodeGroup')
    grp.node_tree = _grime_group()
    grp.inputs['Color'].default_value = col
    grp.inputs['Grime'].default_value = grime
    nt.links.new(grp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emission:
        bsdf.inputs['Emission Color'].default_value = srgb(emission)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    if alpha < 1.0:
        bsdf.inputs['Alpha'].default_value = alpha
    m['fc_team'] = 1 if team else 0
    m['fc_emissive'] = 1 if emission else 0
    m['fc_base_emission'] = emission_strength
    _MATS[name] = m
    return m


def set_emission_scale(scale):
    """Scale every emissive material (lights on / dim for low power / off)."""
    for m in bpy.data.materials:
        if m.get('fc_emissive'):
            b = m.node_tree.nodes.get('Principled BSDF')
            if b:
                b.inputs['Emission Strength'].default_value = m['fc_base_emission'] * scale


def set_grime_all(extra):
    """Add burn/grime to all materials for damage states (0 = pristine)."""
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        for n in m.node_tree.nodes:
            if n.type == 'GROUP' and n.node_tree and n.node_tree.name == 'fc_grime':
                if 'fc_base_grime' not in m:
                    m['fc_base_grime'] = n.inputs['Grime'].default_value
                n.inputs['Grime'].default_value = min(1.0, m['fc_base_grime'] + extra)


def set_char_all(amount):
    """Blacken all materials toward soot (wrecks, rubble). 0 = none."""
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        for n in m.node_tree.nodes:
            if n.type == 'GROUP' and n.node_tree and n.node_tree.name == 'fc_grime':
                n.inputs['Char'].default_value = amount


def faction_mats(faction):
    p = FACTION_PAINT[faction]
    return {
        'paint': mat(f'{faction}_paint', p['paint'], rough=0.62, grime=0.35),
        'paint2': mat(f'{faction}_paint2', p['paint2'], rough=0.66, grime=0.4),
        'trim': mat(f'{faction}_trim', p['trim'], rough=0.55, metal=0.2, grime=0.3),
        'wall': mat(f'{faction}_wall', p['wall'], rough=0.85, grime=0.45),
        'team': mat(f'{faction}_team', None, rough=0.5, grime=0.15, team=True),
        'metal': mat('gunmetal', '#3C4044', rough=0.42, metal=0.75, grime=0.25),
        'dark': mat('dark_rubber', '#1E2022', rough=0.85, grime=0.1),
        'glass': mat('glass_dark', '#1F2A30', rough=0.12, metal=0.3, grime=0.0),
        'canvas': mat('canvas_khaki', '#8A7F62', rough=0.9, grime=0.45),
        'light': mat('lamp_amber', '#403424', rough=0.3, emission='#FFC46B', emission_strength=6.0, grime=0),
        'lens': mat('lens_cyan', '#10202A', rough=0.2, emission='#6BE6FF', emission_strength=3.0, grime=0),
        'concrete': mat('concrete', '#8E8A80', rough=0.9, grime=0.5),
        'concrete_dark': mat('concrete_dark', '#6A675F', rough=0.9, grime=0.5),
    }

# --------------------------------------------------------------------------- geometry
def _link(ob, parent=None):
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


def empty(name, loc=(0, 0, 0), parent=None):
    ob = bpy.data.objects.new(name, None)
    ob.location = loc
    return _link(ob, parent)


def _finish(ob, material, bevel, parent, loc, rot, segments=2):
    ob.location = loc
    ob.rotation_euler = rot
    if material is not None:
        ob.data.materials.append(material)
    if bevel:
        mod = ob.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(35)
        mod.harden_normals = False
    for p in ob.data.polygons:
        p.use_smooth = False
    return _link(ob, parent)


def box(name, size, loc=(0, 0, 0), rot=(0, 0, 0), material=None, bevel=0.015, parent=None,
        taper=(1.0, 1.0), top_shift=(0.0, 0.0)):
    """Box centred on loc. taper scales the top face (x, y); top_shift moves it."""
    sx, sy, sz = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
        if v.co.z > 0:
            v.co.x = v.co.x * taper[0] + top_shift[0]
            v.co.y = v.co.y * taper[1] + top_shift[1]
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return _finish(bpy.data.objects.new(name, me), material, bevel, parent, loc, rot)


def cyl(name, radius, depth, loc=(0, 0, 0), rot=(0, 0, 0), material=None, verts=20, bevel=0.01,
        parent=None, radius_top=None, smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts,
                          radius1=radius, radius2=radius if radius_top is None else radius_top,
                          depth=depth)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = _finish(bpy.data.objects.new(name, me), material, bevel, parent, loc, rot)
    if smooth:
        for p in ob.data.polygons:
            p.use_smooth = abs(p.normal.z) < 0.5
    return ob


def sphere(name, radius, loc=(0, 0, 0), material=None, parent=None, scale=(1, 1, 1), segs=16):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(8, segs // 2), radius=radius)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = _finish(bpy.data.objects.new(name, me), material, 0, parent, loc, (0, 0, 0))
    ob.scale = scale
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def prism(name, profile, depth, loc=(0, 0, 0), rot=(0, 0, 0), material=None, bevel=0.01, parent=None):
    """Extrude a 2D profile (list of (x, z) in the XZ plane) along Y by depth."""
    bm = bmesh.new()
    vs0 = [bm.verts.new((x, -depth / 2, z)) for x, z in profile]
    vs1 = [bm.verts.new((x, depth / 2, z)) for x, z in profile]
    bm.faces.new(vs0[::-1])
    bm.faces.new(vs1)
    n = len(profile)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((vs0[i], vs0[j], vs1[j], vs1[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return _finish(bpy.data.objects.new(name, me), material, bevel, parent, loc, rot)


def slab(name, poly, z0, z1, loc=(0, 0, 0), rot=(0, 0, 0), material=None, bevel=0.012, parent=None,
         top_scale=1.0, top_shift=(0.0, 0.0)):
    """Extrude a top-view polygon [(x, y), ...] vertically from z0 to z1."""
    bm = bmesh.new()
    cx = sum(p[0] for p in poly) / len(poly)
    cy = sum(p[1] for p in poly) / len(poly)
    lo = [bm.verts.new((x, y, z0)) for x, y in poly]
    hi = [bm.verts.new((cx + (x - cx) * top_scale + top_shift[0],
                        cy + (y - cy) * top_scale + top_shift[1], z1)) for x, y in poly]
    bm.faces.new(lo[::-1])
    bm.faces.new(hi)
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return _finish(bpy.data.objects.new(name, me), material, bevel, parent, loc, rot)


def scorch_decal(name, radius, parent=None, seed=3):
    """Flat burnt-ground contact decal for wrecks/rubble (beauty layer only).
    Irregular soot disc with soft noisy edge so destroyed units sit in the terrain."""
    m = bpy.data.materials.new(name + '_mat')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    grad = nt.nodes.new('ShaderNodeTexGradient')
    grad.gradient_type = 'SPHERICAL'
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / radius, 1 / radius, 1)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], grad.inputs['Vector'])
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 5.0 / radius
    noise.inputs['Detail'].default_value = 4
    nt.links.new(tc.outputs['Object'], noise.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMath')
    mix.operation = 'MULTIPLY_ADD'
    nt.links.new(noise.outputs['Fac'], mix.inputs[0])
    mix.inputs[1].default_value = 0.55
    nt.links.new(grad.outputs['Fac'], mix.inputs[2])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.85, 0.85, 0.85, 1)
    nt.links.new(mix.outputs[0], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Alpha'])
    b.inputs['Base Color'].default_value = (0.016, 0.014, 0.012, 1)
    b.inputs['Roughness'].default_value = 1.0
    m['fc_team'] = 0
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=32, radius=radius)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(m)
    ob.location = (0, 0, 0.004)
    ob.visible_shadow = False
    return _link(ob, parent)


def project_px(world_co):
    """Project a world point to canvas pixel coordinates (origin top-left)."""
    from bpy_extras.object_utils import world_to_camera_view
    sc = bpy.context.scene
    v = world_to_camera_view(sc, sc.camera, Vector(world_co))
    return (round(v.x * sc.render.resolution_x, 1), round((1 - v.y) * sc.render.resolution_y, 1))


def mirror_y(fn, *args, y=0.0, **kw):
    """Call a primitive twice mirrored across the XZ plane."""
    name = args[0]
    out = []
    for s, suf in ((1, 'L'), (-1, 'R')):
        a = list(args)
        a[0] = f'{name}_{suf}'
        loc = list(kw.get('loc', (0, 0, 0)))
        loc[1] = y * s
        k = dict(kw)
        k['loc'] = tuple(loc)
        out.append(fn(*a, **k))
    return out


def rng(seed):
    return random.Random(seed)

# --------------------------------------------------------------------------- render passes
class Rig:
    """Holds a model's render-relevant objects and pass bookkeeping."""

    def __init__(self, root):
        self.root = root
        self.parts = {}          # part name -> list of objects rendered for that part
        self.shadow_extra = []   # objects that only cast shadow for all parts
        self.ground = shadow_catcher()

    def meshes(self):
        return [o for o in bpy.context.scene.objects if o.type == 'MESH' and o is not self.ground]


def _team_mask_material():
    if 'fc_mask_team' in bpy.data.materials:
        return bpy.data.materials['fc_mask_team'], bpy.data.materials['fc_mask_hold']
    t = bpy.data.materials.new('fc_mask_team')
    t.use_nodes = True
    b = t.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (1, 1, 1, 1)
    b.inputs['Roughness'].default_value = 0.5
    h = bpy.data.materials.new('fc_mask_hold')
    h.use_nodes = True
    nt = h.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    hold = nt.nodes.new('ShaderNodeHoldout')
    nt.links.new(hold.outputs[0], out.inputs['Surface'])
    return t, h


def render_passes(rig, part_objs, out_paths, layers=('beauty', 'team', 'shadow'), shadow_objs=None):
    """Render beauty / team mask / shadow for the currently posed scene.

    part_objs: objects visible in this part (others hidden entirely).
    shadow_objs: objects that should contribute to the ground shadow (default part_objs).
    """
    sc = bpy.context.scene
    meshes = rig.meshes()
    part_set = set(part_objs)
    shadow_set = set(shadow_objs) if shadow_objs is not None else part_set
    t_mat, h_mat = _team_mask_material()

    def vis(beauty_mode):
        for o in meshes:
            if beauty_mode == 'shadow':
                o.hide_render = o not in shadow_set
                o.visible_camera = False
            else:
                o.hide_render = o not in part_set
                o.visible_camera = True

    if 'beauty' in layers:
        vis('beauty')
        rig.ground.hide_render = True
        sc.render.filepath = out_paths['beauty']
        bpy.ops.render.render(write_still=True)
    if 'team' in layers:
        vis('beauty')
        rig.ground.hide_render = True
        saved = []
        for o in meshes:
            if o.hide_render:
                continue
            for slot in o.material_slots:
                saved.append((slot, slot.material))
                slot.material = t_mat if (slot.material and slot.material.get('fc_team')) else h_mat
        sc.render.filepath = out_paths['team']
        samples = sc.cycles.samples
        sc.cycles.samples = 32
        bpy.ops.render.render(write_still=True)
        sc.cycles.samples = samples
        for slot, m in saved:
            slot.material = m
    if 'shadow' in layers:
        vis('shadow')
        rig.ground.hide_render = False
        sc.render.filepath = out_paths['shadow']
        samples = sc.cycles.samples
        sc.cycles.samples = 24
        bpy.ops.render.render(write_still=True)
        sc.cycles.samples = samples
        rig.ground.hide_render = True
    for o in meshes:
        o.hide_render = False
        o.visible_camera = True


def heading_to_blender_z(index, count):
    """Sim heading index -> Blender Z rotation (model authored facing Blender +X)."""
    theta = 2 * math.pi * index / count
    return -theta


def save_blend(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
