"""Flat geometry contacts only, not production Cycles art."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw
repo = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(repo / 'work/art/vehicle-roster/preview'), str(repo / 'assets/pipeline/blender/models')]
import fcpreview as fc
fc.install()
import environment_roster as model
specs = [json.loads(p.read_text()) for p in sorted((repo / 'assets/pipeline/specs').glob('prop.*.json'))
         if json.loads(p.read_text()).get('model') == 'environment_roster']
out = repo / 'work/art/environment-roster/prop-source-previews'
out.mkdir(exist_ok=True)
cells, damage = [], []
for spec in specs:
    fc.reset()
    rig = model.build(None, spec['params'])
    for state in spec['states']:
        visible, shadow = model.pose(rig, state, 0, 0)
        image = fc.render(visible, shadow, spec['canvas'], spec['anchor'], ss=2)
        image.save(out / (spec['id'] + '-' + state['name'] + '@2x.png'))
        native = image.resize((image.width // 2, image.height // 2), Image.Resampling.LANCZOS)
        if state == spec['states'][0]:
            cells.append((spec['id'], native))
        if len(spec['states']) > 1:
            damage.append((spec['id'] + '/' + state['name'], native))
def contact(cells, name, cols):
    w, h = 320, 200
    board = Image.new('RGBA', (w * cols, ((len(cells) + cols - 1) // cols) * h + 30), '#81755E')
    draw = ImageDraw.Draw(board)
    draw.text((8, 8), 'SOURCE GEOMETRY ONLY | not Cycles or approved production art', fill='white')
    for i, (label, image) in enumerate(cells):
        image = image.crop(image.getbbox())
        x, y = i % cols * w, i // cols * h + 30
        board.alpha_composite(image, (x + (w - image.width) // 2, y + 30))
        draw.text((x + 8, y + 8), label, fill='white')
    board.convert('RGB').save(out / name, quality=94)
contact(cells, 'native-overview.jpg', 4)
contact(damage, 'damage-states@1x.jpg', 3)
print(len(cells), 'native prop previews;', len(damage), 'damage-state previews')
