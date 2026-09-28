"""Flat source design contacts. NOT Blender/Cycles production or acceptance."""
import importlib
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw

repo = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(repo / 'work/art/vehicle-roster/preview'), str(repo / 'assets/pipeline/blender/models')]
import fcpreview as fc
fc.install()
lane = sys.argv[1]
module = importlib.import_module(lane + '_roster')
specs = [json.loads(p.read_text()) for p in sorted((repo / 'assets/pipeline/specs').glob('unit.*.json'))
         if json.loads(p.read_text()).get('model') == lane + '_roster']
columns = 4
cellw, cellh = 240, 180
board = Image.new('RGBA', (columns * cellw, ((len(specs) + columns - 1) // columns) * cellh + 30), '#82765F')
draw = ImageDraw.Draw(board)
draw.text((8, 8), 'SOURCE GEOMETRY PREVIEW ONLY | flat stub, not production lighting/masks', fill='white')
out = repo / 'work/art' / (lane + '-roster') / 'source-previews'
out.mkdir(exist_ok=True)
for index, spec in enumerate(specs):
    fc.reset()
    rig = module.build(spec['faction'], spec['params'])
    state = dict(spec['states'][0])
    if lane == 'vehicle':
        state['part'] = 'body'  # assembled model, preserving actual turret pivot
    visible, shadow = module.pose(rig, state, 0, 3)
    image = fc.render(visible, shadow, spec['canvas'], spec['anchor'], ss=2)
    image.save(out / (spec['id'] + '@2x.png'))
    image = image.resize((image.width // 2, image.height // 2), Image.Resampling.LANCZOS)
    x, y = (index % columns) * cellw, (index // columns) * cellh + 30
    # Keep exact native @1x scale; crop only transparent canvas whitespace.
    image = image.crop(image.getbbox())
    board.alpha_composite(image, (x + (cellw - image.width) // 2, y + 27))
    draw.text((x + 8, y + 7), spec['id'], fill='white')
    print(spec['id'], flush=True)
board.convert('RGB').save(out / 'native-overview.jpg', quality=94)
