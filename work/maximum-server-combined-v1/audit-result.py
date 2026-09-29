"""Read-only completed-course audit and exact original save/replay comparison."""
from pathlib import Path
import datetime, json
from runner_guard import digest, verify_source

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
out = HERE/'server-01'
old = ROOT/'work/maximum-load-034-course/server-01'
receipt = json.loads((out/'receipt.json').read_text())
for name, sha in receipt['artifacts'].items(): assert digest(out/name) == sha, name
assert digest(out/'server.test') == receipt['binary_sha256']
guard = verify_source(HERE/'source', HERE/'source-lock.json', '7ac31472467322e374eee42781735b2ada2ab2f062445d38097ed43681e2abd3')
clean = verify_source(HERE/'clean-source', HERE/'clean-source-lock.json', 'a7ccba8c892abcf4bc643ed41109399741cf74d6b33161a0e5e29c977adcc5c0')
r = json.loads((out/'evidence/server.json').read_text())
baseline = json.loads((old/'evidence/server.json').read_text())
samples = r['samples']
assert [s['tick'] for s in samples] == list(range(1,601))
assert receipt['status'] == r['status'] == 'passed'
assert not r['missed_ticker_slots'] and not r['actor_ticks_at_or_over50ms']
assert all(s['actor_tick_ns'] < 50_000_000 for s in samples)
for prior, current in zip(samples,samples[1:]):
    gap = (datetime.datetime.fromisoformat(current['scheduled'])-datetime.datetime.fromisoformat(prior['scheduled'])).total_seconds()
    assert gap <= .075
assert r['summary']['advance']['p95_ms'] < 25 and r['summary']['advance']['p99_ms'] < 40
exact = {}
old_receipt = json.loads((old/'receipt.json').read_text())
for name in ('final.save.json','closed.save.json','replay.gz','captured.replay.gz'):
    original, candidate = old/'evidence'/name, out/'evidence'/name
    assert digest(original) == old_receipt['artifacts']['evidence/'+name]
    assert original.read_bytes() == candidate.read_bytes(), name
    exact[name] = {'bytes':candidate.stat().st_size,'sha256':digest(candidate)}
for key in ('hash','final_hash_after_close','executed_results','submitted_batches','landed','archive_frames','authorized_unique_event_counts','restore_full_and_checkpoint_replay_exact'):
    assert r[key] == baseline[key], key
assert r['checkpoint'][0]['RowExact'] and not r['checkpoint'][0]['Error']
report = {'status':'passed','audited_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Read-only completed receipt/raw-sample/hash audit; no rerun. Exact original save/full-replay byte comparison; protocol counts and original privacy checks are not relabeled as retained per-frame wire-byte equality.','script_sha256':digest(Path(__file__)),'receipt_sha256':digest(out/'receipt.json'),'server_json_sha256':digest(out/'evidence/server.json'),'binary_sha256':receipt['binary_sha256'],'source_guard':guard,'clean_guard':clean,'artifact_hashes_verified':len(receipt['artifacts']),'original_receipt_status':old_receipt['status'],'exact_original_artifacts':exact,'summary':r['summary'],'tick2':samples[1],'tick600':samples[-1],'maximum_actor_sample':max(samples,key=lambda s:s['actor_tick_ns']),'checkpoint':r['checkpoint'],'canonical_hash':r['hash'],'executed_results':r['executed_results'],'landed':r['landed'],'missed_ticker_slots':r['missed_ticker_slots'],'actor_ticks_at_or_over50ms':r['actor_ticks_at_or_over50ms']}
with (out/'postrun-audit.json').open('x') as f:
    json.dump(report,f,indent=2);f.write('\n')
print(json.dumps({'status':report['status'],'artifact_hashes_verified':report['artifact_hashes_verified'],'exact_original_artifacts':list(exact),'original_status_preserved':old_receipt['status']}))
