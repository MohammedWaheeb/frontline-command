"""Read-only snapshot; file presence never means final validation passed."""
from pathlib import Path
import json
BASE=Path(__file__).resolve().parent;REPO=BASE.parents[2]
lock=json.loads((BASE/'production-lock.json').read_text());stage=REPO/lock['stage'];current=(BASE/'current-asset.txt').read_text().strip()
spec=json.loads((stage/'assets/pipeline/specs'/(current+'.json')).read_text());frames=stage/'assets/build/frames'/current
states=[];total=complete=0
for state in spec['states']:
 expected=state['directions']*state['frames'];present=0
 for direction in range(state['directions']):
  for frame in range(state['frames']):
   key=f"{state['name']}/d{direction:02d}_f{frame:02d}.png"
   if all((frames/layer/key).is_file() for layer in state.get('layers',spec['passes'])):present+=1
 states.append({'state':state['name'],'poses_present':present,'poses_expected':expected});total+=expected;complete+=present
result={'current':current,'poses_with_all_files_present':complete,'expected':total,'complete_exports':(BASE/'completed-assets.txt').read_text().splitlines() if (BASE/'completed-assets.txt').exists() else [],'states':states,'disclaimer':'Read-only file-presence snapshot includes SHA-verified reused pilot files. Packing, checks and native review remain required.'}
print(json.dumps(result,indent=2))
