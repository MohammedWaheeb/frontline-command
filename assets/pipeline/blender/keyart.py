"""Main-menu key art: a cinematic perspective render assembled from the production
model scripts (same geometry/materials as gameplay sprites), all four factions,
team colours applied, low evening sun and atmospheric haze.

Usage: blender -b --factory-startup -P assets/pipeline/blender/keyart.py -- [out.png] [--preview]
Default output: assets/build/ui/keyart/main_menu@1080.png (+ assets/source/blender/ui.keyart.main_menu.blend)
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, 'models'))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import fclib  # noqa: E402
import tank_tracked, technical, drone_fixed, aegis_carrier, us_buildings, props, infantry  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
preview = '--preview' in argv
out = next((a for a in argv if a.endswith('.png')), os.path.join(REPO, 'assets', 'build', 'ui', 'keyart', 'main_menu@1080.png'))

TEAM = {'US': '#3E8EDE', 'IR': '#D9463E', 'SA': '#2BB3A6', 'SY': '#E58A2E'}


def team_colour(faction):
    m = bpy.data.materials.get(f'{faction}_team')
    if not m:
        return
    for n in m.node_tree.nodes:
        if n.type == 'GROUP':
            n.inputs['Color'].default_value = fclib.srgb(TEAM[faction])


def place(rig, loc, rot_deg, z=0.0):
    """Key art is composed directly in Blender coordinates (x, y, z-up), rot about Z."""
    rig.root.location = (loc[0], loc[1], z)
    rig.root.rotation_euler = (0, 0, math.radians(rot_deg))


fclib.reset()
sc = bpy.context.scene
W, H = (960, 540) if preview else (1920, 1080)
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.render.film_transparent = False
sc.cycles.samples = 48 if preview else 160
sc.view_settings.exposure = 0.0

# ground: world-space sand/earth from the terrain pipeline, 4 tiles per texture
me = bpy.data.meshes.new('ground')
import bmesh  # noqa: E402
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=80)
bm.to_mesh(me)
bm.free()
ground = bpy.data.objects.new('ground', me)
sc.collection.objects.link(ground)
gm = bpy.data.materials.new('ground_mat')
gm.use_nodes = True
nt = gm.node_tree
bsdf = nt.nodes['Principled BSDF']
tc = nt.nodes.new('ShaderNodeTexCoord')
mp = nt.nodes.new('ShaderNodeMapping')
mp.inputs['Scale'].default_value = (0.25, 0.25, 0.25)
nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
mix_in = None
for name in ('sand', 'packed_earth'):
    im = nt.nodes.new('ShaderNodeTexImage')
    im.image = bpy.data.images.load(os.path.join(REPO, 'assets', 'build', 'terrain', f'{name}.png'))
    im.extension = 'REPEAT'
    nt.links.new(mp.outputs['Vector'], im.inputs['Vector'])
    if mix_in is None:
        mix_in = im
    else:
        noise = nt.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 0.06
        noise.inputs['Detail'].default_value = 3
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position = 0.45
        ramp.color_ramp.elements[1].position = 0.6
        nt.links.new(tc.outputs['Object'], noise.inputs['Vector'])
        nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        nt.links.new(ramp.outputs['Color'], mix.inputs['Factor'])
        nt.links.new(mix_in.outputs['Color'], mix.inputs['A'])
        nt.links.new(im.outputs['Color'], mix.inputs['B'])
        nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.95
ground.data.materials.append(gm)

# assets from the production model scripts (layout in Blender coords; camera looks toward -x,+y)
IDLE = {'name': 'idle', 'part': 'whole', 'directions': 16, 'frames': 1}
tank1 = tank_tracked.build('US', {})
tank_tracked.pose(tank1, IDLE, 0, 0)
place(tank1, (2.4, -0.9), -150)
tank1.turret_root.rotation_euler = (0, 0, math.radians(-25))
tank2 = tank_tracked.build('US', {})
tank_tracked.pose(tank2, IDLE, 0, 0)
place(tank2, (-1.2, 2.4), -140)
tank2.turret_root.rotation_euler = (0, 0, math.radians(-40))
tech = technical.build('SY', {})
technical.pose(tech, {'name': 'move', 'part': 'whole', 'directions': 16, 'frames': 4}, 1, 0)
place(tech, (-5.2, -2.6), 35)
tech.turret_root.rotation_euler = (0, 0, math.radians(20))
aeg = aegis_carrier.build('SA', {})
aegis_carrier.pose(aeg, {'name': 'deployed', 'part': 'whole', 'directions': 16, 'frames': 6}, 1, 0)
aeg.plume.hide_render = True
place(aeg, (-2.6, 6.2), 190)
dr = drone_fixed.build('IR', {})
drone_fixed.pose(dr, {'name': 'bank_left', 'part': 'body', 'directions': 16, 'frames': 3}, 0, 0)
place(dr, (0.2, 3.4), -125, z=3.0)
dr2 = drone_fixed.build('IR', {})
drone_fixed.pose(dr2, {'name': 'fly', 'part': 'body', 'directions': 16, 'frames': 3}, 1, 0)
place(dr2, (-6.5, 9.0), -110, z=4.2)
hq = us_buildings.build('US', {'building': 'hq'})
hq_vis, _ = us_buildings.pose(hq, {'name': 'idle', 'part': 'building', 'directions': 1, 'frames': 8}, 3, 0)
for o in hq.root.children_recursive:
    if o.type == 'MESH' and o not in hq_vis:
        o.hide_render = True        # scaffold, rubble: only visible in their states
place(hq, (-9.0, 8.5), 180)
pw = us_buildings.build('US', {'building': 'power'})
pw_vis, _ = us_buildings.pose(pw, {'name': 'idle', 'part': 'building', 'directions': 1, 'frames': 6}, 2, 0)
for o in pw.root.children_recursive:
    if o.type == 'MESH' and o not in pw_vis:
        o.hide_render = True
place(pw, (-12.5, 5.0), 180)
for i, (x, y) in enumerate(((0.9, -3.1), (1.5, -3.6), (0.3, -3.8), (1.0, -4.3))):
    inf = infantry.build('US', {'uniform': '#8A8668'})
    infantry.pose(inf, {'name': 'move', 'part': 'body', 'directions': 8, 'frames': 8}, (i * 3) % 8, 0)
    place(inf, (x, y), 130)
bags = props.build(None, {'prop': 'sandbags'})
props.pose(bags, {'name': 'idle'}, 0, 0)
place(bags, (-0.6, -2.6), 40)
for i, (x, y, r) in enumerate(((4.6, 1.8, 0), (-7.0, 1.0, 60), (3.0, 6.5, 120), (-3.5, -6.0, 200), (6.5, -3.5, 30),
                               (-11, 12, 90), (-1.5, 11.0, 10))):
    rk = props.build(None, {'prop': 'rocks'})
    props.pose(rk, {'name': 'idle'}, 0, 0)
    place(rk, (x, y), r)
for i, (x, y) in enumerate(((3.6, -2.4), (-2.8, -1.2), (5.5, 4.0), (-4.2, 3.4), (2.0, 9.0), (-8.0, -3.5), (4.4, -5.0))):
    sh = props.build(None, {'prop': 'shrub'})
    props.pose(sh, {'name': 'idle'}, 0, 0)
    place(sh, (x, y), i * 40)
    sh.root.scale = (1.6, 1.6, 1.6)
# distant ridges behind the haze for depth
ridge_mat = bpy.data.materials.new('ridge')
ridge_mat.use_nodes = True
ridge_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = fclib.srgb('#8C7556')
ridge_mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
for i, (x, y, sx, sz) in enumerate(((-30, 32, 22, 4.5), (-8, 40, 26, 6.0), (-44, 14, 18, 3.5), (12, 46, 20, 5.0))):
    rm = bpy.data.meshes.new(f'ridge{i}')
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=1.0)
    bm.to_mesh(rm)
    bm.free()
    ro = bpy.data.objects.new(f'ridge{i}', rm)
    sc.collection.objects.link(ro)
    ro.location = (x, y, -0.5)
    ro.scale = (sx, sx * 0.55, sz)
    ro.rotation_euler = (0, 0, math.radians(35 + i * 17))
    ro.data.materials.append(ridge_mat)
    for pgon in ro.data.polygons:
        pgon.use_smooth = True
for f in TEAM:
    team_colour(f)
fclib.set_emission_scale(1.0)
for o in list(sc.objects):
    if o.name.startswith(('fc_ground', 'fc_cutter')):
        o.hide_render = True

# camera: low three-quarter view toward the base, lens slightly long for compression
cam = bpy.data.cameras.new('keyart_cam')
cam.lens = 32
cam_o = bpy.data.objects.new('keyart_cam', cam)
sc.collection.objects.link(cam_o)
sc.camera = cam_o
cam_o.location = Vector((6.4, -5.6, 1.15))
target = Vector((-2.2, 3.2, 1.55))
cam_o.rotation_euler = (target - cam_o.location).to_track_quat('-Z', 'Y').to_euler()
cam.dof.use_dof = True
cam.dof.focus_distance = (Vector((2.4, -0.9, 0.4)) - cam_o.location).length
cam.dof.aperture_fstop = 5.6

# evening light and haze
sun = bpy.data.lights.new('evening_sun', 'SUN')
sun.energy = 3.2
sun.angle = math.radians(1.5)
sun.color = (1.0, 0.72, 0.46)
so = bpy.data.objects.new('evening_sun', sun)
sc.collection.objects.link(so)
so.rotation_euler = (0, -math.radians(90 - 14), math.radians(-35))
w = bpy.data.worlds.new('keyart_world')
sc.world = w
w.use_nodes = True
wn = w.node_tree
bg = wn.nodes['Background']
sky = wn.nodes.new('ShaderNodeTexGradient')
coord = wn.nodes.new('ShaderNodeTexCoord')
sep = wn.nodes.new('ShaderNodeSeparateXYZ')
wn.links.new(coord.outputs['Generated'], sep.inputs['Vector'])
ramp = wn.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position = 0.48
ramp.color_ramp.elements[0].color = (0.95, 0.55, 0.30, 1)
ramp.color_ramp.elements[1].position = 0.75
ramp.color_ramp.elements[1].color = (0.18, 0.24, 0.36, 1)
wn.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
wn.links.new(ramp.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 0.9
# bounded haze volume (a world volume is infinite and would swallow the sun)
hz = bpy.data.meshes.new('haze')
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
bm.to_mesh(hz)
bm.free()
haze = bpy.data.objects.new('haze', hz)
sc.collection.objects.link(haze)
haze.scale = (70, 70, 14)
haze.location = (0, 0, 6.9)
hm = bpy.data.materials.new('haze_mat')
hm.use_nodes = True
hm.node_tree.nodes.remove(hm.node_tree.nodes['Principled BSDF'])
vol = hm.node_tree.nodes.new('ShaderNodeVolumePrincipled')
vol.inputs['Density'].default_value = 0.010
vol.inputs['Color'].default_value = (1.0, 0.84, 0.68, 1)
hm.node_tree.links.new(vol.outputs['Volume'], hm.node_tree.nodes['Material Output'].inputs['Volume'])
haze.data.materials.append(hm)
sc.cycles.volume_step_rate = 4.0
sc.cycles.volume_max_steps = 64
fclib.save_blend(os.path.join(REPO, 'assets', 'source', 'blender', 'ui.keyart.main_menu.blend'))
os.makedirs(os.path.dirname(out), exist_ok=True)
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('FC_KEYART_DONE', out)
