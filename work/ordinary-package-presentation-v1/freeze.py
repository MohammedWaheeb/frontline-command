from pathlib import Path
import hashlib,json,subprocess,datetime,shutil
root=Path.cwd(); here=root/'work/ordinary-package-presentation-v1'; out=here/'build-02'; out.mkdir(); package=root/'dist/frontline-darwin-arm64'; target=out/'package'
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  while b:=f.read(1024*1024):h.update(b)
 return h.hexdigest()
def inventory(p):
 rows=[]
 for f in sorted(p.rglob('*')):
  assert not f.is_symlink(),f
  if f.is_file():rows.append({'path':str(f.relative_to(p)),'bytes':f.stat().st_size,'sha256':digest(f)})
 return rows
prior=json.loads((root/'work/ordinary-package-cadence-v1/evidence/version.json').read_text());version=json.loads((package/'version.json').read_text())
assert version['source_inputs']==prior['source_inputs'],'Go/content inputs changed'
for key in ['simulation','protocol','content_hash']:assert version[key]==prior[key]
original=inventory(package);listed=json.loads((package/'package-files.json').read_text())['files'];assert sorted(listed,key=lambda x:x['path'])==[f for f in original if f['path']!='package-files.json']
subprocess.run(['cp','-cR',str(package),str(target)],check=True);assert inventory(target)==original
pinned={}
parity=out/'fresh-runtime-parity-01';parity.mkdir();old=root/'work/ordinary-package-cadence-v1/build-01/fresh-runtime-parity-02';priorPins=json.loads((old/'input-pins.json').read_text())['files']
for key in ['fixtures','parity/native']:
 subprocess.run(['cp','-cR',str(old/key),str(parity/key)] if (parity/key).parent.exists() else ['mkdir','-p',str((parity/key).parent)],check=True)
 if not (parity/key).exists():subprocess.run(['cp','-cR',str(old/key),str(parity/key)],check=True)
for name in ['production-wasm-parity.mjs','native-scenario.json']:
 expected=priorPins[name]['sha256'] if name in priorPins else '9c7f319b1deba92585a0f7600816311607cd62d2a33823715ee3fe994a81913c'
 assert digest(old/name)==expected;shutil.copyfile(old/name,parity/name)
for f in parity.rglob('*'):
 if f.is_file():
  rel=str(f.relative_to(parity));assert digest(f)==(priorPins[rel]['sha256'] if rel in priorPins else '9c7f319b1deba92585a0f7600816311607cd62d2a33823715ee3fe994a81913c');pinned[rel]={'bytes':f.stat().st_size,'sha256':digest(f)}
(parity/'runtime').mkdir()
for name,src in [('frontline.wasm',target/'client/runtime/frontline.wasm'),('wasm_exec.js',target/'client/runtime/wasm_exec.js'),('runtime-native',root/'bin/runtime-native')]:
 shutil.copy2(src,parity/'runtime'/name);pinned['runtime/'+name]={'bytes':src.stat().st_size,'sha256':digest(src)}
shutil.copy2(old/'native-scenario-fresh.json',parity/'expected-native-scenario.json');pinned['expected-native-scenario.json']={'bytes':(old/'native-scenario-fresh.json').stat().st_size,'sha256':digest(old/'native-scenario-fresh.json')}
(parity/'input-pins.json').write_text(json.dumps({'files':pinned},indent=2)+'\n')
receipt={'status':'built-and-frozen-runtime-browser-unrun','makeExit':0,'package':str(target.relative_to(root)),'files':len(original),'bytes':sum(f['bytes'] for f in original),'inventory':original,'versionSHA256':digest(target/'version.json'),'packSHA256':digest(target/'client/assets/packs/base.json'),'runtimeWASMSHA256':digest(target/'client/runtime/frontline.wasm'),'runtimeNativeSHA256':digest(root/'bin/runtime-native'),'hostSHA256':digest(target/'frontline'),'sameGoContentSourceInputs':version['source_inputs'],'cloneReadbackExact':True,'builtAt':version['built_at'],'finished':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Ordinary make build with4352bac UI/renderer integration. Incomplete art; no final game qualification.'}
(here/'build-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
for name in ['version.json','package-files.json']:shutil.copyfile(target/name,here/name)
config=json.loads((root/'work/full-app-native-body-v4/execution-01.config.json').read_text());config.update(product=str(target/'client'),artifact=str(target/'version.json'),artifactSHA256=receipt['versionSHA256'],packSHA256=receipt['packSHA256'],artScope='Ordinary4352bac integrated UI4+renderer3 including memory Container; Go0.3.4 current runtime; incomplete inherited art.',hostConditions='AC100%, sole browser with sole USstrike Blender export; shared host, no quiet performance claim.')
(here/'ordinary-app.config.json').write_text(json.dumps(config,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k!='inventory'}))
