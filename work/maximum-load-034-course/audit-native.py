"""Audit a preserved native log independently; never rewrites its failed wrapper receipt."""
from pathlib import Path
import collections, datetime, hashlib, json, re, sys
HERE=Path(__file__).resolve().parent
OUT=HERE/sys.argv[1]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
r=json.loads((OUT/'receipt.json').read_text())
assert r['status']=='failed' and r['source_verified_after'] is True
assert next(s for s in r['stages'] if s['stage']=='native-gates')['exit']==0
assert sha(OUT/'native-gates.log')==next(s for s in r['stages'] if s['stage']=='native-gates')['log_sha256']
text=(OUT/'native-gates.log').read_text()
passed=re.findall(r'^--- PASS: ([A-Za-z0-9_]+) \(',text,re.M)
assert len(passed)==12 and collections.Counter(passed)=={name:3 for name in r['selectors']}
assert text.splitlines()[-1]=='PASS' and not re.search(r'^(FAIL|--- FAIL:|--- SKIP:)',text,re.M)
measurements=[];current=None
for line in text.splitlines():
 if line.startswith('=== RUN   '):current=line[len('=== RUN   '):]
 if 'p50' in line:
  values={name:float(re.search(name+r'=?([0-9.]+)ms',line).group(1)) for name in ['p50','p95','p99']}
  assert values['p95']<25 and values['p99']<40
  measurements.append(dict(test=current,**values,raw=line.strip()))
assert len(measurements)==12
base=HERE.parents[1]/'work/runtime-034-integrated-source'
lock=json.loads((base/'source-lock.json').read_text())
assert sha(base/'source-lock.json')==r['source_lock_sha256']
assert all(sha(base/'source'/f)==h for f,h in lock['files'].items())
a={'audited_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'passed','scope':'Independent post-run artifact audit of12 successful actual native tests; original receipt remains failed due PASS-name parser leading-space error, no native rerun.','original_receipt_sha256':sha(OUT/'receipt.json'),'original_log_sha256':sha(OUT/'native-gates.log'),'auditor_sha256':sha(Path(__file__)),'binary_sha256':sha(OUT/'sim.test'),'source_lock_sha256':r['source_lock_sha256'],'source_files_verified_now':len(lock['files']),'passed_tests':passed,'measurements_ms':measurements,'limits':'Existing selectors retain only logged percentiles and workload counters, not every raw tick sample. Native Engine.Advance only; no full server loop/browser/reference Intel claim.'}
assert a['binary_sha256']==r['binary_sha256']
(OUT/'independent-log-audit.json').write_text(json.dumps(a,indent=2)+'\n')
print(json.dumps({'actual_tests_passed':len(passed),'original_wrapper_status':r['status'],'audit_status':a['status'],'source_verified':len(lock['files'])}))
