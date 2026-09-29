"""Freeze independent candidate/baseline/helper/spec copies; no Blender."""
from pathlib import Path
import json,hashlib,shutil
B=Path(__file__).resolve().parent;R=B.parents[2];S=B/'stage';assert not S.exists();S.mkdir();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();audit=json.loads((B/'read-only-source-audit.json').read_text());assert sha(B/'candidate-building_roster.py')==audit['candidate_sha256'];inputs={};outputs={}
paths=[R/'assets/pipeline/blender'/n for n in ['fclib.py','team_mask_png.py','render_asset.py','render_ui_shots.py']]+[R/'assets/pipeline/blender/models'/n for n in ['building_common.py']]+list((R/'assets/pipeline/tools').glob('*.py'))
specs={}
for p in sorted((R/'assets/pipeline/specs').glob('building.*.json')):
 if json.loads(p.read_text())['model']=='building_roster':paths.append(p);specs[p.stem]=sha(p)
assert len(specs)==59
for p in paths:
 rel=p.relative_to(R);dst=S/rel;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dst);inputs[str(rel)]=sha(p);outputs[str(rel)]=sha(dst)
for src,dest in [(R/audit['baseline'],B/'baseline-building_roster.py'),(B/'candidate-building_roster.py',S/'assets/pipeline/blender/models/building_roster.py')]:
 dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dest);inputs[str(src.relative_to(R))]=sha(src)
helper=R/'work/art/interceptor-launch-pilot/check-isolation.py';shutil.copyfile(helper,B/'signature-reference.py');inputs[str(helper.relative_to(R))]=sha(helper)
outputs['assets/pipeline/blender/models/building_roster.py']=audit['candidate_sha256']
plan={}
for aid in ['building.SY.hq','building.SA.hq']:
 s=json.loads((S/'assets/pipeline/specs'/f'{aid}.json').read_text());plan[aid]=[{'state':st['name'],'direction':0,'frame':f} for st in s['states'] for f in sorted({0,st['frames']//2,st['frames']-1})]
(B/'pilot-plan.json').write_text(json.dumps(plan,indent=2)+'\n')
(B/'source-lock.json').write_text(json.dumps({'scope':'Independent exact Claude HQ candidate proof/pilot, no live source/output mutation or acceptance.','inputs':inputs,'stage_files':outputs,'baseline_sha256':audit['baseline_sha256'],'candidate_sha256':audit['candidate_sha256'],'signature_reference_sha256':sha(B/'signature-reference.py'),'specs':specs,'targets':['building.SY.hq','building.SA.hq'],'pilot_plan_sha256':sha(B/'pilot-plan.json')},indent=2)+'\n')
print('FC_HQ_PREPARED',len(specs),'specs;', {k:len(v) for k,v in plan.items()},'selected poses; no Blender launched')
