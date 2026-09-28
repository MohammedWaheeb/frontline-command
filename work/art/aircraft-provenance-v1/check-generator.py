"""Verify attribution for the exact approved IDs without generating a manifest."""
from pathlib import Path
import hashlib,importlib.util,json,shutil,tempfile
HERE=Path(__file__).resolve().parent;REPO=HERE.parents[2]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
lock=json.loads((HERE/'source-lock.json').read_text())
def load(label,path):
 spec=importlib.util.spec_from_file_location(label,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
assert sha(HERE/'before-gen_manifest.py')==lock['before_generator_sha256'];assert sha(HERE/'candidate-gen_manifest.py')==lock['candidate_generator_sha256']
a=load('before_attribution',HERE/'before-gen_manifest.py');b=load('candidate_attribution',HERE/'candidate-gen_manifest.py');data=json.loads((HERE/'aircraft_provenance.json').read_text());rows=[]
with tempfile.TemporaryDirectory() as temporary:
 root=Path(temporary);directory=root/'assets/pipeline/manifest';directory.mkdir(parents=True);shutil.copy2(HERE/'aircraft_provenance.json',directory/'aircraft_provenance.json');b.REPO=str(root)
 for path in sorted((REPO/'assets/pipeline/specs').glob('*.json')):
  spec=json.loads(path.read_text());aid=spec['id'];target=aid in data['ids'];source=b.blender_source(spec);provenance=b.blender_provenance(spec)
  if target:assert source==data['source'] and provenance==data['provenance']
  else:assert source==a.blender_source(spec) and provenance==spec.get('provenance'),aid
  rows.append({'id':aid,'target':target,'unchanged_other_attribution':not target})
assert sum(r['target'] for r in rows)==11
out=HERE/'generator-check.json';assert not out.exists();out.write_text(json.dumps({'checks':len(rows),'targeted':11,'unrelated_exact':len(rows)-11,'failures':0,'rows':rows,'no_manifest_regeneration':True},indent=2)+'\n');print('FC_AIRCRAFT_PROVENANCE_GENERATOR_CHECK',len(rows),11,0)
