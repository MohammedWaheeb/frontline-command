"""Copy the reviewed spec and unchanged helpers into a new empty isolated tree."""
from pathlib import Path
import hashlib,json,shutil
B=Path(__file__).resolve().parent;R=B.parents[2];S=B/'stage';assert not S.exists();S.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
audit=json.loads((B/'read-only-spec-audit.json').read_text());assert sha(B/'unit.US.rifle.json')==audit['candidate_sha256']
inputs={};outputs={}
paths=[R/'assets/pipeline/blender'/n for n in ['fclib.py','team_mask_png.py','render_asset.py','render_ui_shots.py']]
paths += [R/'assets/pipeline/blender/models'/n for n in ['infantry.py','infantry_roster.py']]
paths += list((R/'assets/pipeline/tools').glob('*.py'))
for p in paths:
 rel=p.relative_to(R);d=S/rel;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,d);inputs[str(rel)]=sha(p);outputs[str(rel)]=sha(d)
for rel,want in audit['other_24_specs_exact'].items():
 p=R/rel;assert sha(p)==want;d=S/rel;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,d);inputs[rel]=want;outputs[rel]=sha(d)
p=B/'unit.US.rifle.json';d=S/'assets/pipeline/specs/unit.US.rifle.json';shutil.copyfile(p,d);inputs[str(p.relative_to(R))]=sha(p);outputs[str(d.relative_to(S))]=sha(d)
p=R/'assets/pipeline/specs/unit.US.rifle.json';shutil.copyfile(p,B/'reference-spec.json');inputs[str(p.relative_to(R))]=sha(p)
plan=[{'state':st['name'],'direction':d,'frame':f} for st in json.loads(d.read_text())['states'] for d in [1,5] for f in range(st['frames'])]
assert len(plan)==50
(B/'pilot-plan.json').write_text(json.dumps({'id':'unit.US.rifle','poses':plan,'pose_count':50,'scope':'All declared frames at two opposite diagonal headings; full200 source bounds/reset checked separately. Original200 raw reference remains untouched.'},indent=2)+'\n')
(B/'pilot-source-lock.json').write_text(json.dumps({'scope':'Prepared independent empty-output stage; no renders or acceptance. Claude spec, existing quota-takeover model unchanged, accepted current pipeline helper bytes.','inputs':inputs,'stage_files':outputs,'candidate_spec_sha256':audit['candidate_sha256'],'read_only_audit_sha256':sha(B/'read-only-spec-audit.json'),'pilot_plan_sha256':sha(B/'pilot-plan.json'),'empty_output_paths':['assets/build/frames/unit.US.rifle','assets/source/blender/unit.US.rifle.blend'],'required_hardpoints':['muzzle','healthbar'],'additive_accepted_hardpoint':'work'},indent=2)+'\n')
print('FC_RIFLE_PILOT_PREPARED',len(outputs),'exact source/spec/helper copies;',len(plan),'selected tuples; no Blender launched')
