"""Render one asset spec to per-frame PNG layers.

Usage (from repo root):
  blender -b --factory-startup -P assets/pipeline/blender/render_asset.py -- \
      assets/pipeline/specs/unit.US.tank.json [--states idle,move] [--dirs 0,4] [--no-blend]

Outputs:
  assets/build/frames/<id>/<layer>/<state>/d<DD>_f<FF>.png   (layer: beauty|team|shadow)
  assets/source/blender/<id>.blend                             (editable scene, unless --no-blend)
"""
import importlib
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, 'models'))

import fclib  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    spec_path = argv[0]
    opts = {'states': None, 'dirs': None, 'blend': True}
    i = 1
    while i < len(argv):
        if argv[i] == '--states':
            opts['states'] = set(argv[i + 1].split(','))
            i += 2
        elif argv[i] == '--dirs':
            opts['dirs'] = [int(x) for x in argv[i + 1].split(',')]
            i += 2
        elif argv[i] == '--no-blend':
            opts['blend'] = False
            i += 1
        else:
            raise SystemExit(f'unknown option {argv[i]}')
    return spec_path, opts


def main():
    spec_path, opts = parse_args()
    with open(spec_path) as f:
        spec = json.load(f)
    aid = spec['id']
    model = importlib.import_module(spec['model'])
    fclib.reset()
    cw, ch = spec['canvas']
    fclib.setup_camera(cw, ch, spec['anchor'])
    fclib.setup_lights(spec.get('sun_strength', 3.3))
    rig = model.build(spec.get('faction'), spec.get('params', {}))
    if opts['blend']:
        fclib.save_blend(os.path.join(REPO, 'assets', 'source', 'blender', f'{aid}.blend'))
    layers = spec.get('passes', ['beauty', 'team', 'shadow'])
    out_root = os.path.join(REPO, 'assets', 'build', 'frames', aid)
    t0 = time.time()
    count = 0
    meta_path = os.path.join(out_root, 'hardpoints.json')
    hardpoints = {}
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            hardpoints = json.load(f)
    for st in spec['states']:
        if opts['states'] and st['name'] not in opts['states']:
            continue
        ndir = st['directions']
        dirs = range(ndir) if not opts['dirs'] else [d for d in opts['dirs'] if d < ndir]
        for d in dirs:
            for fr in range(st['frames']):
                part_objs, shadow_objs = model.pose(rig, st, fr, d)
                fclib.bpy.context.view_layer.update()
                for hp_name, hp_obj in getattr(rig, 'hardpoints', {}).items():
                    if st.get('part', 'body') not in hp_obj.get('fc_parts', [st.get('part', 'body')]):
                        continue
                    key = f"{st['name']}/d{d:02d}_f{fr:02d}"
                    hardpoints.setdefault(hp_name, {})[key] = fclib.project_px(hp_obj.matrix_world.translation)
                st_layers = [l for l in layers if l in st.get('layers', layers)]
                paths = {}
                for l in st_layers:
                    p = os.path.join(out_root, l, st['name'], f'd{d:02d}_f{fr:02d}.png')
                    os.makedirs(os.path.dirname(p), exist_ok=True)
                    paths[l] = p
                fclib.render_passes(rig, part_objs, paths, layers=st_layers, shadow_objs=shadow_objs)
                count += 1
    os.makedirs(out_root, exist_ok=True)
    with open(meta_path, 'w') as f:
        json.dump(hardpoints, f, indent=1, sort_keys=True)
    print(f'FC_RENDER_DONE {aid} poses={count} seconds={time.time() - t0:.1f}')


main()
