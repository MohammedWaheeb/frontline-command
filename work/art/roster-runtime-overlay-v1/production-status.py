"""Light read-only status; separate technical closure from accepted handoffs.

Usage: python3 production-status.py path/to/current/catalog/result.json
File presence is progress only. No atlas hashing, image decoding or subprocesses.
"""
from pathlib import Path
import hashlib,json,sys

REPO=Path(__file__).resolve().parents[3]
catalog_path=REPO/sys.argv[1];catalog=json.loads(catalog_path.read_text())
selected={row['id']:row for row in catalog['assets']}
families=[]
for name,subdir in [('aircraft-final-production-v3',''),('vehicle-final-production-v1','work/art/vehicle-production'),('building-final-production-v1','work/art/building-roster')]:
 base=REPO/'work/art'/name;lock=json.loads((base/'production-lock.json').read_text());stage=REPO/lock['stage'];family=stage/subdir if subdir else base
 mechanically_closed=(family/'completed-assets.txt').read_text().splitlines() if (family/'completed-assets.txt').exists() else []
 rows=[]
 for aid in lock['assets']:
  spec=json.loads((stage/'assets/pipeline/specs'/(aid+'.json')).read_text());poses=sum(s['directions']*s['frames'] for s in spec['states'])
  row={'id':aid,'poses':poses,'mechanically_closed_in_this_stage':aid in mechanically_closed}
  review=family/'contacts'/aid/'native-review.json'
  if not review.exists():review=base/'contacts'/aid/'native-review.json'
  if review.exists():
   native=json.loads(review.read_text());row['this_stage_native_accepted']=native.get('accepted',native.get('accepted_bounded_export'))
   row['review']=str(review.relative_to(REPO))
  if aid in selected:
   row['catalog_handoff']=selected[aid]['handoff'];row['catalog_handoff_sha256']=selected[aid]['handoff_sha256']
   row['catalog_stage_may_differ']=not selected[aid]['handoff'].startswith(str(base.relative_to(REPO))+'/')
  rows.append(row)
 currentpath=base/'current-asset.txt';current=currentpath.read_text().strip() if currentpath.exists() else None
 entry={'family':name,'current_marker_not_process_claim':current,'assets':rows}
 if current in lock['assets'] and current not in mechanically_closed:
  spec=json.loads((stage/'assets/pipeline/specs'/(current+'.json')).read_text());raw=stage/'assets/build/frames'/current
  counts=[]
  for state in spec['states']:
   layers=state.get('layers',spec['passes']);present=sum(all((raw/layer/state['name']/f'd{d:02d}_f{f:02d}.png').is_file() for layer in layers) for d in range(state['directions']) for f in range(state['frames']))
   counts.append({'state':state['name'],'present_tuples':present,'expected_tuples':state['directions']*state['frames']})
  entry['file_presence_only']={'complete_tuples':sum(r['present_tuples'] for r in counts),'expected_tuples':sum(r['expected_tuples'] for r in counts),'states':counts}
 families.append(entry)
result={'scope':'Read-only status. Mechanical footer/list and file presence never imply native acceptance. Catalog selects the exact immutable handoff; a rejected old stage can coexist with an accepted corrected sibling. No current process, live publication or runtime acceptance is inferred.','catalog':str(catalog_path.relative_to(REPO)),'catalog_sha256':hashlib.sha256(catalog_path.read_bytes()).hexdigest(),'sealed_handoffs':len(selected),'sealed_files':sum(r['files'] for r in selected.values()),'sealed_bytes':sum(r['bytes'] for r in selected.values()),'families':families}
print(json.dumps(result,indent=2))
