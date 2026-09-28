"""Promote only the parent-reviewed exact helper at an idle asset boundary."""
from pathlib import Path
import ast,hashlib,json,shutil,subprocess
HERE=Path(__file__).resolve().parent;REPO=HERE.parents[2]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
lock=json.loads((HERE/'source-lock.json').read_text());archive=HERE/'before-live-promotion';assert not archive.exists()
processes=subprocess.check_output(['ps','-axo','comm='],text=True).splitlines();assert not any(Path(p.strip()).name.lower()=='blender' for p in processes),'Wait for the whole asset boundary'
before=REPO/'assets/pipeline/blender/fclib.py';after=HERE/'candidate-fclib.py';helper=HERE/'team_mask_png.py'
assert sha(before)==lock['before_sha256'];assert sha(after)==lock['candidate_sha256'];assert sha(helper)==lock['png_helper_sha256']
oldtree=ast.parse(before.read_text());newtree=ast.parse(after.read_text())
newdefs={n.name:n for n in newtree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef))};names=[]
for old in oldtree.body:
 if not isinstance(old,(ast.FunctionDef,ast.ClassDef)):continue
 key='_render_passes_original' if old.name=='render_passes' else old.name
 new=newdefs[key];original_name=new.name;new.name=old.name
 assert ast.dump(old,include_attributes=False)==ast.dump(new,include_attributes=False),old.name
 new.name=original_name;names.append(old.name)
assert len(names)==28
functional=json.loads((HERE/'controls-v2/check.json').read_text());assert not functional['failures']
actual=json.loads((HERE/'actual-v1/check.json').read_text());assert all(' exact' in r['name'] for r in actual['failures'])
archive.mkdir();copies={}
locks=[('work/art/infantry-roster/source-lock.json','sha256'),('work/art/building-roster/production-lock.json','sources'),('work/art/vehicle-production/production-lock.json','sources')]
for relative in ['assets/pipeline/blender/fclib.py']+[x[0] for x in locks]:
 path=REPO/relative;target=archive/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target);assert sha(path)==sha(target);copies[relative]=sha(path)
shutil.copy2(after,before)
newhelper=REPO/'assets/pipeline/blender/team_mask_png.py';assert not newhelper.exists();shutil.copy2(helper,newhelper)
test=REPO/'assets/pipeline/tools/test_team_mask_png.py';assert not test.exists()
test.write_text("import sys\nfrom pathlib import Path\nsys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'blender'))\n"+(HERE/'test_team_mask_png.py').read_text())
amendments=[]
for relative,field in locks:
 path=REPO/relative;original=json.loads(path.read_text());changed=json.loads(path.read_text());values=changed[field]
 if 'assets/pipeline/blender/fclib.py' in values:assert values['assets/pipeline/blender/fclib.py']==lock['before_sha256']
 values['assets/pipeline/blender/fclib.py']=lock['candidate_sha256'];values['assets/pipeline/blender/team_mask_png.py']=lock['png_helper_sha256']
 # Preserve all existing fields other than these explicit tool hashes.
 check=json.loads(json.dumps(changed))
 for key in ['assets/pipeline/blender/fclib.py','assets/pipeline/blender/team_mask_png.py']:
  if key in original[field]:check[field][key]=original[field][key]
  else:del check[field][key]
 assert check==original
 path.write_text(json.dumps(changed,indent=2)+'\n');amendments.append({'path':relative,'before_sha256':copies[relative],'after_sha256':sha(path),'fields':[field+'.assets/pipeline/blender/fclib.py',field+'.assets/pipeline/blender/team_mask_png.py'],'other_fields_exact':True})
receipt={'before_sha256':lock['before_sha256'],'promoted_sha256':sha(before),'png_sha256':sha(newhelper),'original_definitions_ast_exact':names,'archived':copies,'lock_amendments':amendments,'strict_byte_gate':'FAIL retained; bounded control/native acceptance only','native_parent_approval':'All actual sheets plus same-process repeats reviewed; controlled production authorized at next whole asset boundary','no_prior_raw_png_or_manifest_edits':True}
(HERE/'promotion.json').write_text(json.dumps(receipt,indent=2)+'\n')
print('FC_TEAM_MASK_HELPER_PROMOTED',sha(before),len(amendments))
