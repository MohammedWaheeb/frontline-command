"""Prepare an isolated, hash-guarded instrumented actor; no Go execution."""
from pathlib import Path
import hashlib,json,shutil,difflib
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
BASE=ROOT/'work/runtime-034-integrated-source'
sha=lambda b:hashlib.sha256(b).hexdigest()
lock_data=(BASE/'source-lock.json').read_bytes()
assert sha(lock_data)=='3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750'
lock=json.loads(lock_data)
source=HERE/'server-source'
assert not source.exists(),'Preserve prepared source; use a new successor.'
for p,h in lock['files'].items():
 b=(BASE/'source'/p).read_bytes();assert sha(b)==h,p
 target=source/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
path=source/'internal/server/match.go';original=path.read_text();text=original
replacements=[
 ('\t\t\tcase m.checkpoints <- matchCheckpoint{tick: uint32(m.engine.Tick()), data: save}:','\t\t\tcase m.checkpoints <- matchCheckpoint{tick: uint32(m.engine.Tick()), data: save}:'),
]
# Only insert measurements around the original actor's statements. No stage is copied/reimplemented.
def once(a,b):
 global text
 assert text.count(a)==1,(a,text.count(a))
 text=text.replace(a,b,1)
once('\t\tcase now := <-ticker.C:\n','\t\tcase now := <-ticker.C:\n\t\t\tmeasured := maximumLoopSample{Scheduled: now, Started: time.Now()}\n')
once('\t\t\tif advanced {\n\t\t\t\tm.engine.Advance()\n\t\t\t\ttickViews = archive.capture(m.engine, m.slots)\n','\t\t\tif advanced {\n\t\t\t\tpart := time.Now()\n\t\t\t\tm.engine.Advance()\n\t\t\t\tmeasured.AdvanceNS = time.Since(part).Nanoseconds()\n\t\t\t\tpart = time.Now()\n\t\t\t\ttickViews = archive.capture(m.engine, m.slots)\n\t\t\t\tmeasured.ArchiveNS = time.Since(part).Nanoseconds()\n')
once('\t\t\t\tif m.engine.Tick()%600 == 0 && replayErr == nil {\n','\t\t\t\tif m.engine.Tick()%600 == 0 && replayErr == nil {\n\t\t\t\t\tpart = time.Now()\n')
once('\t\t\t\t\treplayErr = replay.Capture(m.engine, true)\n','\t\t\t\t\treplayErr = replay.Capture(m.engine, true)\n\t\t\t\t\tmeasured.ReplayCheckpointNS = time.Since(part).Nanoseconds()\n\t\t\t\t\tpart = time.Now()\n')
once('\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\tif pendingCoop != nil {','\t\t\t\t\t}\n\t\t\t\t\tmeasured.SaveEnqueueNS = time.Since(part).Nanoseconds()\n\t\t\t\t}\n\t\t\t}\n\t\t\tif pendingCoop != nil {')
once('\t\t\t// Filter events at their authoritative tick before aggregating network frames.\n','\t\t\tpeerStart := time.Now()\n\t\t\t// Filter events at their authoritative tick before aggregating network frames.\n')
once('\t\t\tif m.engine.Outcome().Finished && !committed && now.Sub(lastCommitAttempt) >= time.Second {','\t\t\tmeasured.PeerEncodeEnqueueNS = time.Since(peerStart).Nanoseconds()\n\t\t\tif m.engine.Outcome().Finished && !committed && now.Sub(lastCommitAttempt) >= time.Second {')
once('\t\t\tif committed && now.Sub(finishedAt) > 5*time.Minute {','\t\t\tmeasured.TotalNS = time.Since(measured.Started).Nanoseconds()\n\t\t\tif maximumLoopProbe != nil && maximumLoopProbe.finish(measured, m, archive, replay, replayErr, tickViews, advanced) {\n\t\t\t\treturn // Test-only exact600-tick shutdown; ordinary production defers still run.\n\t\t\t}\n\t\t\tif committed && now.Sub(finishedAt) > 5*time.Minute {')
once('\t\terr := m.repo.CheckpointMatch(ctx, m.id, checkpoint.tick, checkpoint.data)\n','\t\tpersistStart := time.Now()\n\t\terr := m.repo.CheckpointMatch(ctx, m.id, checkpoint.tick, checkpoint.data)\n\t\tif maximumLoopProbe != nil {\n\t\t\tmaximumLoopProbe.persisted(checkpoint, time.Since(persistStart), err)\n\t\t}\n')
path.write_text(text)
test=HERE/'server_maximum_timing_test.go';target=source/'internal/server/server_maximum_timing_test.go';shutil.copyfile(test,target)
(source/'.gitignore').write_text('*\n!.gitignore\n')
(HERE/'server-instrumentation.diff').write_text(''.join(difflib.unified_diff(original.splitlines(True),text.splitlines(True),fromfile='integrated3d49/internal/server/match.go',tofile='private-instrumented/internal/server/match.go')))
manifest={'base_lock_sha256':sha(lock_data),'scope':'Private timing annotations in actual liveMatch.run plus one test; no shipping mutation, no build/run.','base_files':len(lock['files']),'production_annotations':{'internal/server/match.go':{'original':sha(original.encode()),'instrumented':sha(text.encode())}},'test_sha256':sha(test.read_bytes()),'preparer_sha256':sha(Path(__file__).read_bytes()),'files':{p:sha((source/p).read_bytes()) for p in sorted([*lock['files'],'internal/server/server_maximum_timing_test.go'])}}
(HERE/'server-source-lock.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'prepared_files':len(manifest['files']),'instrumented_production_paths':['internal/server/match.go'],'compiled':False,'executed':False}))
