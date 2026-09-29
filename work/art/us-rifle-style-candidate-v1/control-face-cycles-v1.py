"""Old-source only control for polygon cyclic start-index nondeterminism."""
from pathlib import Path
p=Path(__file__).resolve().parent/'check-source-semantic-v3.py';exec(compile(p.read_text().split('\nrows=[]')[0],str(p),'exec'),globals())
spec=json.loads((S/'assets/pipeline/specs/unit.IR.at.json').read_text())
def cycle(v):return min(tuple(v[i:]+v[:i]) for i in range(len(v)))
def canonical(g):
 return [list(row[:4])+[sorted((cycle(face[0]),face[1],face[2]) for face in row[4]) if row[4] is not None else None]+list(row[5:]) for row in g]
rows=[];first=None
for i in range(6):
 value=run(control,spec);geo=value.pop('geometry_detail');value.pop('geometry');details=value.pop('pose_detail');c={'geometry':canonical(geo),'value':value};d=digest(c)
 if first is None:first=c;raw=geo
 changed=[{'name':a[0],'old_faces':a[4],'new_faces':b[4]} for a,b in zip(raw,geo) if a!=b]
 assert c==first,('unchanged-source oriented cycle canonical equivalence',i)
 rows.append({'iteration':i,'source_sha256':sha(R/'assets/pipeline/blender/models/infantry_roster.py'),'geometry_pose_material_hardpoint_canonical_sha256':d,'raw_face_records_exact':not changed,'changed_objects':changed})
 print('FC_RIFLE_FACE_CYCLE_CONTROL',i,[x['name'] for x in changed],flush=True)
out=B/'old-source-face-cycle-control-v1.json';assert not out.exists();out.write_text(json.dumps({'scope':'Six unchanged source builds plus complete forward/reverse poses; only polygon row order and cyclic starting index canonicalized, orientation/vertex/material/smoothing/numerical values exact. Original strict failures preserved.','script_sha256':sha(Path(__file__)),'iterations':rows,'failures':0},indent=2)+'\n');print('FC_RIFLE_FACE_CYCLE_CONTROL_DONE',flush=True)
