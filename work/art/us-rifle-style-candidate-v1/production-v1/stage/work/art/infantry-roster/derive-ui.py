"""Derive requested 1x UI artwork with the existing packer's alpha-safe filter."""
import importlib.util
import pathlib
import json
import sys
import numpy as np
from PIL import Image

repo=pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(repo / 'assets/pipeline/tools'))
aid=sys.argv[1]
assert json.loads((repo/'assets/pipeline/specs'/f'{aid}.json').read_text())['model']=='infantry_roster'
role=aid.removeprefix('unit.')
spec=importlib.util.spec_from_file_location('fc_packer',repo/'assets/pipeline/tools/pack_sprites.py')
packer=importlib.util.module_from_spec(spec)
spec.loader.exec_module(packer)
for part in ('portraits','icons/build'):
 for layer in ('beauty','team'):
  source=repo/'assets/build/ui'/part/f'{role}@2x.{layer}.png'
  im=Image.open(source).convert('RGBA')
  result=packer.downsample_premultiplied(np.asarray(im).astype(np.float32),2)
  Image.fromarray(result,'RGBA').save(source.with_name(source.name.replace('@2x','@1x')),optimize=True)
print(aid,'matched portraits/cameos at1x/2x')

checks=[]
for part,expected in [('portraits',(192,192)),('icons/build',(128,96))]:
 for scale,factor in [('2x',1),('1x',2)]:
  beauty=Image.open(repo/'assets/build/ui'/part/f'{role}@{scale}.beauty.png').convert('RGBA')
  team=Image.open(repo/'assets/build/ui'/part/f'{role}@{scale}.team.png').convert('RGBA')
  a=np.array(beauty)[:,:,3];t=np.array(team)[:,:,3]
  shape=(expected[0]//factor,expected[1]//factor)
  border=np.concatenate([a[0],a[-1],a[:,0],a[:,-1]])
  outside=int(((t>32)&(a<8)).sum())
  conditions={
   'dimensions':beauty.size==shape and team.size==shape,
   'nonempty':int((a>8).sum())>30 and int((t>8).sum())>5,
   'transparent-corners':int(max(a[0,0],a[0,-1],a[-1,0],a[-1,-1]))==0,
   'no-border-clipping':not bool((border>8).any()),
   'team-inside-beauty':outside<=max(4,0.005*int((t>32).sum())),
  }
  checks.extend((part,scale,name,ok) for name,ok in conditions.items())
lines=[f'# {aid} portrait/cameo verification','',f'{len(checks)} checks; {sum(not c[3] for c in checks)} failures.','','| Output | Scale | Check | Result |','|---|---|---|---|']
for part,scale,name,ok in checks:
 lines.append(f"| {part} | {scale} | {name} | {'PASS' if ok else 'FAIL'} |")
(repo/'work/art/infantry-roster'/f'ui-check-{aid}.md').write_text('\n'.join(lines)+'\n')
assert all(c[3] for c in checks),[c for c in checks if not c[3]]
