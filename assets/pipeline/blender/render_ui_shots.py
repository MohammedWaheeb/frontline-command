"""Render UI portraits (192x192 @2x) and build cameos (128x96 @2x) from a model spec.

Usage:
  blender -b --factory-startup -P assets/pipeline/blender/render_ui_shots.py -- <spec.json> [...]
Outputs (beauty + team layers, transparent background; the UI frame supplies the panel):
  assets/build/ui/portraits/<role-or-id>@2x.{beauty,team}.png
  assets/build/ui/icons/build/<role-or-id>@2x.{beauty,team}.png
"""
import importlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, 'models'))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import fclib  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))


def bbox(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        if o.type != 'MESH' or o.hide_render:
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def shoot(rig, objs, out_base, size, kind):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = size
    cam = sc.camera
    cam.data.type = 'ORTHO'
    cam.data.shift_x = cam.data.shift_y = 0
    cam.data.sensor_fit = 'HORIZONTAL'
    bpy.context.view_layer.update()
    # 3/4 front view from the lit side, lower than gameplay for a heroic read
    az = math.radians(-35)
    el = math.radians(20 if kind == 'portrait' else 26)
    d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
    rot = (-d).to_track_quat('-Z', 'Y')
    cam.rotation_euler = rot.to_euler()
    right, up = rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0))
    pts = []
    for o in objs:
        if o.type == 'MESH':
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    us = [p.dot(right) for p in pts]
    vs = [p.dot(up) for p in pts]
    w, h = max(us) - min(us), max(vs) - min(vs)
    aspect = size[0] / size[1]
    margin = 1.08 if kind == 'portrait' else 1.06
    cam.data.ortho_scale = max(w, h * aspect) * margin
    cu, cv = (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2
    centre = sum(pts, Vector()) / len(pts)
    base = centre - right * centre.dot(right) - up * centre.dot(up)
    cam.location = base + right * cu + up * cv + d * 60
    paths = {'beauty': f'{out_base}.beauty.png', 'team': f'{out_base}.team.png'}
    os.makedirs(os.path.dirname(out_base), exist_ok=True)
    fclib.render_passes(rig, objs, paths, layers=('beauty', 'team'))


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    for spec_path in argv:
        spec = json.load(open(spec_path))
        model = importlib.import_module(spec['model'])
        fclib.reset()
        fclib.setup_camera(64, 64, (32, 32))
        fclib.setup_lights(spec.get('sun_strength', 3.3))
        rig = model.build(spec.get('faction'), spec.get('params', {}))
        # face the viewer's left-front: model +X toward camera-left
        is_building = spec['id'].startswith('building.')
        if is_building:
            # Whole assembly includes independent weapon layers in the cameo.
            st = {'name': 'idle', 'part': 'whole', 'directions': 1, 'frames': 8}
            objs, _ = model.pose(rig, st, 0, 0)
        else:
            st = {'name': 'idle', 'part': 'whole', 'directions': 16, 'frames': 1}
            if spec['id'].startswith('unit.IR.strike'):
                st['name'] = 'fly'
            objs, _ = model.pose(rig, st, 0, 0)
            rig.root.rotation_euler = (0, 0, math.radians(-15))
        key = spec.get('role_id') or spec['id']
        shoot(rig, objs, os.path.join(REPO, 'assets', 'build', 'ui', 'portraits', f'{key}@2x'), (192, 192), 'portrait')
        shoot(rig, objs, os.path.join(REPO, 'assets', 'build', 'ui', 'icons', 'build', f'{key}@2x'), (128, 96), 'cameo')
        print('FC_UI_SHOTS_DONE', key)


main()
