"""Native paired portrait/cameo beauty+team composition; no source image edits."""
from pathlib import Path
import sys
from PIL import Image,ImageDraw
repo=Path(__file__).resolve().parents[3];sys.path.insert(0,str(repo/'assets/pipeline/tools'));from composite import tint
id=sys.argv[1];role=id.removeprefix('unit.');sheet=Image.new('RGBA',(520,224),'#8C806B');draw=ImageDraw.Draw(sheet)
for folder,label,x in [('portraits','portrait',0),('icons/build','cameo',200)]:
 for scale,pos in [('2x',(x,24)),('1x',(356+x//2,24))]:
  root=repo/'assets/build/ui'/folder
  for layer in ('beauty','team'):
   im=Image.open(root/f'{role}@{scale}.{layer}.png').convert('RGBA');sheet.alpha_composite(tint(im,'#C6A34A') if layer=='team' else im,pos)
 draw.text((x+3,5),label+'2x',fill='#171713')
sheet.convert('RGB').save(repo/'work/art/infantry-roster'/f'native-ui-{id}.png')
