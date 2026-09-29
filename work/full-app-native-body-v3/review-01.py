"""Extract compact facts from the immutable native run; do not relabel it."""
import collections, datetime, hashlib, json, pathlib
root=pathlib.Path(__file__).resolve().parents[2];here=pathlib.Path(__file__).resolve().parent;run=here/'chrome-01'
r=json.loads((run/'result.json').read_text());b=json.loads((run/'body-audit.json').read_text())
def pin(p):
 data=p.read_bytes();return {'path':str(p.relative_to(root)),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
assert r['functionalStatus']=='passed' and r['controlStatus']=='passed' and r['status']=='failed'
assert all(x['status']=='passed' for x in r['independent'])
assert r['closedProcess']['browserExitCode']==0 and not r['closedProcess']['httpListening']
lock=json.loads((here/'preflight-lock.json').read_text())
for x in lock['files']:
 f=here/x['path'];assert f.stat().st_size==x['bytes'] and hashlib.sha256(f.read_bytes()).hexdigest()==x['sha256'],x['path']
extra=json.loads((root/'work/full-app-native-body-v2/chrome-01-extra-pins-after.json').read_text())['pins']
for file,expected in extra.items():assert hashlib.sha256(pathlib.Path(file).read_bytes()).hexdigest()==expected,file
result={
 'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Read-only extraction; raw strict failures remain failed, no product or browser changes.',
 'status':r['status'],'functionalStatus':r['functionalStatus'],'rawStatus':r['rawStatus'],'bodyStatus':r['bodyStatus'],'controlStatus':r['controlStatus'],
 'runPins':[pin(f) for f in sorted(run.iterdir()) if f.is_file()],
 'preparedInputs':{'count':len(lock['files']),'preflightLock':pin(here/'preflight-lock.json'),'allUnchanged':True},'extraPins':extra,'allExtraPinsExact':True,
 'paid':r['paid'],'paidSession':r['paidSession'],'bootWorkers':r['bootWorkers'],'sessionBinding':r['sessionBinding'],'workerCleanup':r['workerCleanup'],
 'independentStages':r['independent'],'controlProofs':r['controlProofs'],'controlRequests':r['controlRequests'],'resourceCleanup':r['resourceCleanup'],
 'timing':{'uiSceneLoadingDismissedMs':r['uiSceneLoadingDismissedMs'],'sceneReadyIncludingCountdownMs':r['sceneReadyMsIncludingCountdown'],'qualifiedPerformance':False},
 'health':[{**h,'resources':{**h['resources'],'contexts':[{k:v for k,v in c.items() if k!='unreleased'} for c in h['resources']['contexts']]}} for h in r['health']],
 'network':{'appRawReports':len(b['allRawFailures']),'exactFailureBodyFacts':len(b['exactBodyFailureFacts']),'unprovedFailures':len(b['unprovedRawFailures']),'failedFileTypes':dict(collections.Counter(pathlib.Path(f['url']).suffix for f in b['allRawFailures'])),'eventOrdering':dict(collections.Counter(f['diagnostic']['observedOrder'] for f in b['exactBodyFailureFacts'])),'completeStaticBodies':b['coverage']['complete'],'staticBodyBytes':sum(p['native']['hashedBytes'] for p in b['reconciliation']['proofs'] if p['complete']),'unobserved':len(b['coverage']['unobservedRequests']),'unobservedTypes':dict(collections.Counter(x['type'] for x in b['coverage']['unobservedRequests'])),'observerAccountingIncludingControls':b['accounting'],'intentionalControlNetworkReports':len(r['controlDiagnostics']['expectedNetwork']),'intentionalControlConsoleReports':len(r['controlDiagnostics']['expectedConsole']),'unexpectedConsole':len(r['controlDiagnostics']['unexpectedConsole']),'errors':{k:len(r[k]) for k in ['pageErrors','httpErrors','serverErrors','cleanupErrors','observerFaults','definiteBodyMismatches']}},
 'closedProcess':r['closedProcess'],'closedAt':r['closedAt'],'inputPinsReverified':r['pinsVerifiedAfter'],
 'nativeReview':{'viewed':['scene-ready.png','paid-power.png','ordinary-menu.png'],'paidStationAndCostLegible':True,'ordinaryMenuKeyartPaintedAtCapture':False,'reason':'Menu DOM captured immediately on return; no later painted-menu native PNG. No completed menu-art acceptance claimed.'},
 'limits':['Single short ordinary solo paid build/save/menu, not victory or endurance.','Current incomplete live art; no final art qualification.','Shared Blender host/passive observer overhead; no quiet performance claim.','Only page WebGL API allocation/lifetime estimates; not total GPU/JS/worker/image/audio memory.','Raw abort remains failed even with exact original-body proof; no cause or decode inference.','Browser-native/script/CSS/image/font/worker realms remain outside original page-fetch byte proof.']}
(here/'chrome-01-review.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'status':result['status'],'functional':result['functionalStatus'],'controls':result['controlStatus'],'appRawReports':result['network']['appRawReports'],'preparedInputs':len(lock['files']),'extraPins':len(extra)}))
