"""Bounded attribution-only change, never a whole-manifest regeneration."""
from pathlib import Path
import hashlib,json,shutil,subprocess
HERE=Path(__file__).resolve().parent;REPO=HERE.parents[2];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
lock=json.loads((HERE/'source-lock.json').read_text());gen=REPO/'assets/pipeline/manifest/gen_manifest.py';manifest=REPO/'assets/manifest/asset-manifest.json'
assert sha(gen)==lock['before_generator_sha256'],'Generator changed; merge explicitly before publication'
assert sha(HERE/'candidate-gen_manifest.py')==lock['candidate_generator_sha256'];assert sha(HERE/'aircraft_provenance.json')==lock['attribution_data_sha256']
assert not json.loads((HERE/'generator-check.json').read_text())['failures']
assert not any(Path(p.strip()).name.lower()=='blender' for p in subprocess.check_output(['ps','-axo','comm='],text=True).splitlines()),'Whole asset boundary required'
archive=HERE/'before-publication';assert not archive.exists();archive.mkdir()
shutil.copy2(gen,archive/'gen_manifest.py');shutil.copy2(manifest,archive/'asset-manifest.json')
before=json.loads(manifest.read_text());after=json.loads(manifest.read_text());data=json.loads((HERE/'aircraft_provenance.json').read_text());targets=set(data['ids']);changed=[]
for e in after['entries']:
 if e['id'] in targets:e['source']=data['source'];e['provenance']=data['provenance'];changed.append(e['id'])
assert set(changed)==targets
for old,new in zip(before['entries'],after['entries']):
 check=json.loads(json.dumps(new))
 if old['id'] in targets:
  for key in ['source','provenance']:
   if key in old:check[key]=old[key]
   else:check.pop(key,None)
 assert check==old,old['id']
assert {k:v for k,v in before.items() if k!='entries'}=={k:v for k,v in after.items() if k!='entries'}
manifest.write_text(json.dumps(after,indent=1)+'\n');shutil.copy2(HERE/'candidate-gen_manifest.py',gen);destination=REPO/'assets/pipeline/manifest/aircraft_provenance.json';assert not destination.exists();shutil.copy2(HERE/'aircraft_provenance.json',destination)
receipt={'targets':sorted(targets),'fields':['source','provenance'],'before_manifest_sha256':sha(archive/'asset-manifest.json'),'after_manifest_sha256':sha(manifest),'before_generator_sha256':lock['before_generator_sha256'],'after_generator_sha256':sha(gen),'attribution_data_sha256':sha(destination),'all_other_fields_entries_status_audio_fx_exact':True,'frozen_aircraft_stage_manifests_untouched':True,'no_source_image_or_status_promotion':True}
(HERE/'publication.json').write_text(json.dumps(receipt,indent=2)+'\n');print('FC_AIRCRAFT_ATTRIBUTION_PUBLISHED',len(targets))
