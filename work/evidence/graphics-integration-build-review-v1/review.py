"""Read existing maps/manifests; no build, browser, product write or test execution."""
import collections, hashlib, json, pathlib
root=pathlib.Path(__file__).resolve().parents[3];here=pathlib.Path(__file__).resolve().parent
base=root/'work/ordinary-package-cadence-v1/build-01/package';new=root/'work/graphics-integration-v1/build-02/package'
def pin(p):
 b=p.read_bytes();return {'path':str(p.relative_to(root)),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def load(p):return json.loads(p.read_text())
def sources(product):
 result={};pins=[]
 for p in sorted((product/'client/assets').glob('*.js.map')):
  pins.append(pin(p));m=load(p)
  assert len(m['sources'])==len(m['sourcesContent'])
  for source,content in zip(m['sources'],m['sourcesContent']):
   if '/src/' not in source or 'node_modules' in source or content is None:continue
   key='client/src/'+source.split('/src/',1)[1];sha=hashlib.sha256(content.encode()).hexdigest()
   if key in result:assert result[key]==sha,key
   result[key]=sha
 return result,pins
A,ap=sources(base);B,bp=sources(new);assert A.keys()==B.keys()
changed=[{'path':key,'before':A[key],'after':B[key]} for key in sorted(A) if A[key]!=B[key]]
r=load(new.parent/'receipt.json');assert sorted(changed,key=lambda x:x['path'])==sorted(r['changes'],key=lambda x:x['path'])
assert len(changed)==3 and len(A)==122
oldpack=load(base/'client/assets/packs/base.json');newpack=load(new/'client/assets/packs/base.json');old={x['path']:x for x in oldpack['files']};n={x['path']:x for x in newpack['files']}
protected=[k for k in old if k.startswith(('/art/','/runtime/','/fonts/','/licenses/','/notices/'))]
assert all(old[k]==n[k] for k in protected)
contentOld=load(base/'client/content/index.json');contentNew=load(new/'client/content/index.json')
next(p for p in contentNew['packs'] if p['id']=='2.0.0')['version']=next(p for p in contentOld['packs'] if p['id']=='2.0.0')['version'];assert contentOld==contentNew
oldInventory={f['path']:f for f in load(base/'package-files.json')['files']};newInventory={f['path']:f for f in load(new/'package-files.json')['files']}
nonclient=[k for k in oldInventory if not k.startswith('client/') and k not in ('version.json','package-files.json')]
assert len(nonclient)==156 and all(oldInventory[k]==newInventory[k] for k in nonclient)
expected={'version.json':'a20da5913d75fb125fa0c03ada0eee76c2867be0ec9d2345d688d3b1816d1904','client/assets/packs/base.json':'56673aca898ee4344ceb323eae01f0b1e4f8af19ed5299f222569c0c9056afec'}
for rel,sha in expected.items():assert pin(new/rel)['sha256']==sha
files=[root/'work/graphics-integration-v1/build.mjs',new.parent/'actual-build.mjs',new.parent/'receipt.json',new.parent/'post-build-audit.json',base/'version.json',base/'package-files.json',new/'version.json',new/'package-files.json',base/'client/assets/packs/base.json',new/'client/assets/packs/base.json',root/'work/renderer-performance-v1/evidence/combined-validation.json',root/'work/renderer-performance-v1/evidence/source-lock.json']
assert pin(files[0])['sha256']==pin(files[1])['sha256']
output={'status':'reviewed-no-current-artifact-blocker','scope':'Read-only source/map/manifest review. No new full build, browser, runtime execution or rehash of every payload. Root full-byte post-build receipt retained separately.','pins':[pin(f) for f in files]+ap+bp,'sourceMapClientFiles':len(A),'unchangedSourceMapClientFiles':len(A)-len(changed),'changedSources':changed,'protectedPackDescriptorsExact':len(protected),'unchangedNonclientDescriptors':len(nonclient),'contentIndexOnlyPackVersionChanged':True,'baseInventoryEntries':len(oldInventory),'candidateInventoryEntries':len(newInventory),'limits':['The private builder is not the general ordinary make-build path; it deliberately inherits original native/Go/art outputs.','All emitted Vite paths are admitted as replaceable. Fixed-artifact review shows no art/runtime mutation, but a reusable builder should bound emitted paths or invoke existing presentation-output collision checks.','Original make receipt counts 4699 listed files; private receipt adds the inventory itself and reports4700. Both inventory entry sets contain4699; no unexplained extra file is implied.','Compiler sourcemap content corroborates exactly3client source changes but is not an independent compiler correctness proof.','Native renderer/visual/picking/resource acceptance remains a separate browser gate.']}
(here/'result.json').write_text(json.dumps(output,indent=2)+'\n');print(json.dumps({k:v for k,v in output.items() if k not in ['pins','limits']}))
