"""Bounded read-only identity/receipt review; no runtime/browser/build execution."""
from pathlib import Path
import json,hashlib,subprocess,tarfile,datetime

ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
BASE=ROOT/'work/ordinary-package-presentation-v1'
PACKAGE=BASE/'build-02/package'
PARITY=BASE/'build-02/fresh-runtime-parity-01'
pins={}
def sha(b): return hashlib.sha256(b).hexdigest()
def read(p):
    b=p.read_bytes();pins[str(p.relative_to(ROOT))]={'bytes':len(b),'sha256':sha(b)};return b
def data(p): return json.loads(read(p))
receipt=data(BASE/'build-receipt.json');version=data(PACKAGE/'version.json')
manifest=data(PACKAGE/'package-files.json');config=data(BASE/'ordinary-app.config.json')
assert len(receipt['inventory'])==receipt['files']==4700
assert sum(f['bytes'] for f in receipt['inventory'])==receipt['bytes']==592186087
assert len({x['path'] for x in receipt['inventory']})==4700
assert sorted(manifest['files'],key=lambda x:x['path'])==[x for x in receipt['inventory'] if x['path']!='package-files.json']
actual=[]
for p in sorted(PACKAGE.rglob('*')):
    assert not p.is_symlink(),p
    if p.is_file(): actual.append({'path':p.relative_to(PACKAGE).as_posix(),'bytes':p.stat().st_size})
assert actual==[{k:f[k] for k in ['path','bytes']} for f in receipt['inventory']]
by={x['path']:x for x in receipt['inventory']}
for name in ['version.json','package-files.json','client/runtime/frontline.wasm','client/runtime/worker.js','client/runtime/wasm_exec.js','client/runtime/version.json','client/assets/packs/base.json']:
    b=read(PACKAGE/name);assert sha(b)==by[name]['sha256'] and len(b)==by[name]['bytes']
assert sha(read(PACKAGE/'version.json'))==receipt['versionSHA256']==config['artifactSHA256']
assert sha(read(PACKAGE/'client/assets/packs/base.json'))==receipt['packSHA256']==config['packSHA256']
assert config['product']==str(PACKAGE/'client') and config['artifact']==str(PACKAGE/'version.json')
assert sha(read(PACKAGE/'client/runtime/frontline.wasm'))==receipt['runtimeWASMSHA256']
assert version['source_revision']=='4352bac875e7471153333da450119c1377edf210'
assert version['source_dirty'] is True and version['simulation']=='0.3.4'
prior=data(ROOT/'work/ordinary-package-cadence-v1/evidence/version.json')
assert version['source_inputs']==prior['source_inputs']==receipt['sameGoContentSourceInputs']
assert version['source_inputs']['files']==211

sourcefiles=['render/art.ts','render/battlefield.ts','render/terrain.ts','ui/App.tsx','ui/StrikeReview.tsx']
maps=[]
for p in sorted((PACKAGE/'client/assets').glob('*.map')):
    j=data(p);assert sha(read(p))==by[p.relative_to(PACKAGE).as_posix()]['sha256'];maps.append(j)
sourceproof=[]
for name in sourcefiles:
    matches=[content for m in maps for src,content in zip(m['sources'],m['sourcesContent']) if src.endswith('/src/'+name)]
    assert len(matches)==1,name
    authored=subprocess.check_output(['git','show','4352bac:client/src/'+name],cwd=ROOT)
    assert matches[0].encode()==authored,name
    sourceproof.append({'path':'client/src/'+name,'sha256':sha(authored),'proof':'exact production source-map content'})
for name in ['styles/game.css','ui/strike-review.css']:
    authored=subprocess.check_output(['git','show','4352bac:client/src/'+name],cwd=ROOT)
    assert read(ROOT/'client/src'/name)==authored
    sourceproof.append({'path':'client/src/'+name,'sha256':sha(authored),'proof':'current source exact commit; output consistency relies on reviewed ordinary build capture/verification, no CSS source-map reconstruction'})
assert sourceproof[2]['sha256']!='14a6772156ec236f166d60f30fedd28e582ace5c3be271c995e1db4d6417578a'

inputpins=data(PARITY/'input-pins.json')['files']
for name,d in inputpins.items():
    b=read(PARITY/name);assert len(b)==d['bytes'] and sha(b)==d['sha256'],name
assert inputpins['runtime/frontline.wasm']['sha256']==receipt['runtimeWASMSHA256']
assert inputpins['runtime/runtime-native']['sha256']==receipt['runtimeNativeSHA256']
audit=data(PARITY/'audit.json');proof=data(PARITY/'parity/production-wasm.json')
assert audit['status']==proof['status']=='passed' and audit['wasmExit']==audit['nativeExit']==0
assert proof['goExited'] and proof['unauthorized_view_denied']
assert len(proof['cases'])==6 and len(proof['checkpoint'])==3
assert sum(len(r['views']) for r in proof['checkpoint'])==12
for r in proof['cases']: assert r==data(PARITY/'parity/native/service'/f"{r['scene']}.json")
expected=data(PARITY/'parity/native/checkpoint/checkpoint.json');assert proof['checkpoint']==expected['records']
for r in proof['checkpoint']:
    for player,digest in r['views'].items(): assert sha(read(PARITY/'parity/native/checkpoint'/f"{r['tick']}-p{player}.pb"))==digest
    assert sha(read(PARITY/'parity/native/checkpoint'/f"{r['tick']}.save.json"))==r['save_sha256']
lineage=data(BASE/'scenario-lineage.json');archive=ROOT/lineage['archive']
assert sha(read(archive))==lineage['archiveSHA256']
with tarfile.open(archive) as t:
    archived=t.extractfile(lineage['member']).read();assert sha(archived)==lineage['memberSHA256']
    assert archived==read(PARITY/'native-scenario.json')
    expectednative=t.extractfile('fresh-runtime-parity-02/native-scenario-fresh.json').read()
assert expectednative==read(PARITY/'expected-native-scenario.json')==read(PARITY/'native-scenario-fresh.json')
assert sha(expectednative)==audit['nativeScenarioSHA256']
failure=data(BASE/'freeze-attempt01-failure.json')
assert sha(read(BASE/'freeze-attempt01.py'))==failure['scriptSHA256']
assert failure['status']=='failed-before-runtime-or-browser'

result=data(BASE/'chrome-01/result.json');body=data(HERE/'body-review.json')
assert result['status']=='failed' and result['functionalStatus']=='passed' and result['rawStatus']=='failed'
assert len(result['independent'])==7 and all(x['status']=='passed' for x in result['independent'])
assert result['product']==result['productAfter']==version['product_pack']
assert result['closedProcess']['browserExitCode']==0 and result['closedProcess']['httpListening'] is False
assert all(not result[k] for k in ['pageErrors','httpErrors','serverErrors','cleanupErrors','observerFaults','definiteBodyMismatches'])
assert not result['controlDiagnostics']['unexpectedConsole']
health=[]
for h in result['health']:
    assert not h['resources']['faults']
    c=h['resources']['contexts']
    health.append({'label':h['label'],'domCanvases':h['dom']['canvas'],'estimatedGLBytes':sum(x['liveEstimatedBytes'] for x in c),'peakEstimatedGLBytes':max([x['peakEstimatedBytes'] for x in c] or [0]),'p95RAFms':h['resources']['frame']['p95']})
for h in result['health'][-3:]:
    assert h['dom']['canvas']==0
    for c in h['resources']['contexts']: assert c['lost'] and c['liveEstimatedBytes']==0 and not c['unreleased'] and not any(c['liveCounts'].values())
for name in ['freeze.py','validate-runtime.mjs','build-01.log','chrome-01.log','chrome-01/body-audit.json','chrome-01/native-ledger.json','chrome-01/scene-ready.png','chrome-01/paid-power.png','chrome-01/menu-art-ready.png']:
    read(BASE/name)
report={'status':'accepted-within-recorded-scope','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'packageFiles':4700,'packageBytes':592186087,'packageFullHashRerun':False,'packageReview':'Exact receipt/inventory relation plus actual full path/size/no-symlink closure; selected metadata/runtime/source-map bytes independently hashed. Root freeze and original browser pre/post verifier performed full product hashing.','sources':sourceproof,'nativeInputsRehashed':len(inputpins),'nativeCases':6,'checkpointStages':3,'authorizedViews':12,'nativeScenarioArchivedExact':True,'earlierFreezeFailurePreserved':True,'browserFunctional':'passed','browserStrict':'failed','rawAppFailures':25,'intentionalControlNetworkFailures':2,'bodyProofs':689,'health':health,'blockingFindings':[],'limitations':['No compiler/runtime/browser repeated','Incomplete inherited art; current private catalog60 is not in this package','Known isolated fog diamonds remain visible; MAX fog candidate excluded','One 1600x900 standard solo course, no victory/replay/rematch/multiplayer/endurance acceptance','Observed GL release is not total GPU/JS/image/cache memory proof','Shared Blender host and test observers exclude qualified performance comparisons','102 successful unsupported/browser-native requests; all25 actual App failures are proved but remain strict failures'],'pins':pins}
(HERE/'review.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['pins','sources','health']},indent=2))
