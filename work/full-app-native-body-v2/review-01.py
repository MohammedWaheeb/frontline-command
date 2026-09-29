"""Read-only extraction of retained run evidence. Never relabels result.json."""
import collections, hashlib, json, pathlib
root=pathlib.Path(__file__).resolve().parents[2]
here=pathlib.Path(__file__).resolve().parent
run=here/'chrome-01'
r=json.loads((run/'result.json').read_text()); b=json.loads((run/'body-audit.json').read_text())
def pin(p):
 p=root/p if not p.is_absolute() else p
 data=p.read_bytes();return {'path':str(p.relative_to(root)), 'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
files=['client/src/app/application.ts','client/src/runtime/session.ts','client/src/runtime/offline.ts','client/tests/render/battlefield-clarity-product.browser.mjs','work/full-app-offline-v3/runner-v2.mjs','client/src/protocol/frontline_pb.ts','pkg/sim/preview.go']
source=[pin(pathlib.Path(f)) for f in files]
old=json.loads((root/'work/full-app-native-body-v1/source-audit.json').read_text())
old_by={x['path']:x for x in old['files']}
for x in source:
 if x['path'] in old_by:x['matches_prepackage_source_audit']=x['sha256']==old_by[x['path']]['sha256']
w=r['finalWorkerObservation'];match={q['worker'] for q in w['requests'] if q['method']=='create'}
assert len(match)==1 and all(not x['live'] and x['pending']==x['pendingAtTerminate']==0 for x in w['workers'] if x['id'] in match)
final=r['health'][-1];assert final['label']=='before-final-close'
assert final['dom']=={'canvas':0,'battlefieldCanvas':0}
assert all(not c['canvasConnected'] and c['contextCollected'] and c['lost'] and c['liveEstimatedBytes']==0 and not c['unreleased'] and all(n==0 for n in c['liveCounts'].values()) for c in final['resources']['contexts'])
summary={
 'scope':'Separate read-only extraction; original course remains failed. No browser or product changes.',
 'original_status':r['status'],'original_error':r['error'],'controls':r['controlStatus'],
 'run_pins':[pin(p) for p in sorted(run.iterdir()) if p.is_file()], 'source_pins':source,
 'paid':r['paid'],'worker_observation':{k:w[k] for k in ['workers','requests','errors','overflow']},
 'source_attribution':'Application-owned boot validator is retained at menu; actual create/submit/save worker closed. Observer v2 did not retain content/validate method names, so its first-worker label is source/order attribution, not an observed content RPC label.',
 'resource_health':[{**h,'resources':{**h['resources'],'contexts':[{k:v for k,v in c.items() if k!='unreleased'} for c in h['resources']['contexts']]}} for h in r['health']],
 'network':{'raw_status':r['rawStatus'],'raw_count':len(r['requestFailures']),'body_status':r['bodyStatus'],'body_facts':len(b['exactBodyFailureFacts']),'unproved_failed_requests':len(b['unprovedRawFailures']),'complete_original_bodies':b['coverage']['complete'],'unobserved_requests':len(b['coverage']['unobservedRequests']),'unobserved_categories':dict(collections.Counter(x['type']+'/'+x['realm'] for x in b['coverage']['unobservedRequests'])),'event_order':dict(collections.Counter(x['diagnostic']['observedOrder'] for x in b['exactBodyFailureFacts'])),'accounting':b['accounting'],'errors':{k:len(r[k]) for k in ['pageErrors','consoleErrors','httpErrors','serverErrors','cleanupErrors','observerFaults','definiteBodyMismatches']}},
 'closed_process':r['closedProcess'],'pins_verified_after':r['pinsVerifiedAfter'], 'screenshots':[pin(run/n) for n in ['scene-ready.png','paid-power.png','failure.png']],
 'scope_limits':['Single short solo readiness/build/menu cycle; not victory/endurance acceptance.','Shared Blender host and passive observers; no quiet FPS/performance acceptance.','API allocation estimates exclude JS/image/2D/worker/audio caches and actual GPU total memory.','GL context loss/collection, not all-object explicit deletion: 45 created and 43 explicitly deleted.','Exact consumer bytes/EOF do not waive raw aborts or prove cancellation cause/decode.','All four native negative controls remain unrun in this course.','102 browser-native/other requests lack original-body proof; none had a failure here.','Current ordinary package contains incomplete live art; no final-art visual acceptance.']}
(here/'chrome-01-review.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({'review':str(here/'chrome-01-review.json'),'run_status':r['status'],'body_facts':summary['network']['body_facts'],'match_workers':sorted(match),'final_gl_bytes':sum(c['liveEstimatedBytes'] for c in final['resources']['contexts'])}))
