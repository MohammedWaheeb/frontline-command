// Read-only audit of a completed course and its exact evidence archives.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
assert.equal(process.argv.length,3,'Use audit-completed-run.mjs COMPLETED_RUN_DIRECTORY');
const directory=path.resolve(process.argv[2]);
const sha=value=>createHash('sha256').update(value).digest('hex');
const load=async file=>JSON.parse(await readFile(path.join(directory,file),'utf8'));
const receipt=await load('archive-receipt.json'),summary=await load('summary.json');
const bodies=new Map();
for(const item of receipt.archives){
 const packed=await readFile(path.join(directory,item.archive)),body=gunzipSync(packed);
 assert.equal(packed.length,item.archiveBytes);assert.equal(sha(packed),item.archiveSHA256);
 assert.equal(body.length,item.bytes);assert.equal(sha(body),item.sha256);
 assert.deepEqual(body,await readFile(path.join(directory,item.file)));
 bodies.set(item.file,body);
}
const report=JSON.parse(bodies.get('browser.json'));
assert(report.completed&&report.browserAndHostClosed);assert.equal(report.hostExit.code,0);
for(const key of ['status','combatStatus','lifecycleStatus','strictStatus','finalInputGuard'])assert.deepEqual(summary[key],report[key]);
assert.equal(report.finalInputGuard.status,'passed');
assert.equal(report.finalInputGuard.receiptSHA256,report.preparationSHA256);
assert.equal(sha(bodies.get('browser.json')),summary.rawReport.sha256);
assert.equal(report.requestFailures.length,summary.rawDiagnostics.failures);
assert.equal(report.requestFailures.length,report.diagnosticCollectors.reduce((n,c)=>n+c.failures.length,0));
for(const collector of report.diagnosticCollectors){assert.equal(collector.diagnosticsAgree,true);assert.deepEqual(collector.faults,[]);assert.equal(collector.failures.length,collector.playwright.length)}
if(report.requestFailures.length)assert.equal(report.strictStatus,'failed','Raw failures cannot become a strict pass');
const cases=[];
for(const record of report.cases){
 const compact=summary.cases.find(c=>c.id===record.id);assert(compact);
 const audit=await load(record.id+'-native-audit/audit.json');assert.deepEqual(audit,record.nativeProof);
 assert.equal(sha(await readFile(path.join(directory,record.id+'.replay.gz'))),audit.replay_sha256);
 assert.equal(audit.replay_sha256,record.replay.sha256);assert.equal(audit.full_checkpoint_and_resumed_hashes_equal,true);
 assert.equal(audit.final_tick,record.result.outcome.tick);assert.equal(audit.outcome.reason,'elimination');
 const ledger=bodies.get(record.id+'-commands.jsonl').toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 const counts={};let total=0;
 for(const batch of ledger){assert.equal(batch.orders.length,batch.receipts.length);for(let i=0;i<batch.orders.length;i++){
  const order=batch.orders[i],result=batch.receipts[i];total++;
  assert(!['surrender','surrender_vote','sell','practice'].includes(order.kind));
  const count=counts[batch.player]??={accepted:0,rejected:{},acceptedKinds:{}};
  if(result.accepted){count.accepted++;count.acceptedKinds[order.kind]=(count.acceptedKinds[order.kind]??0)+1}
  else count.rejected[result.code]=(count.rejected[result.code]??0)+1;
 }}
 assert.deepEqual(counts,compact.commandReceipts.players);assert.equal(total,compact.commandReceipts.orders);assert.equal(ledger.length,compact.commandReceipts.batches);
 for(const human of record.clients){
  assert(record.reconnects.some(r=>r.player===human.player&&r.after.tick>=r.before.tick&&r.after.sequence===r.before.sequence));
  assert(record.ownershipRejections.some(r=>r.player===human.player&&r.code==='not_owner'));
  assert(counts[human.player].acceptedKinds.build>0&&counts[human.player].acceptedKinds.train>0);
  assert.equal(human.final.info.result.matchId,record.result.matchId);assert.equal(human.final.info.result.committed,true);
 }
 assert.equal(record.replayUI.status,'passed');assert.equal(record.replayUI.readOnly.before.submit,record.replayUI.readOnly.after.submit);
 cases.push({id:record.id,orders:total,batches:ledger.length,finalTick:audit.final_tick,finalHash:audit.final_hash,replaySHA256:audit.replay_sha256});
}
const evidence={status:'passed',scope:'Read-only exact archive, receipt, native-audit, replay-byte and derived-summary reconciliation. Does not waive raw failures, rerun a match, or establish request-body delivery.',courseStatus:report.status,strictStatus:report.strictStatus,rawFailures:report.requestFailures.length,rawReportSHA256:summary.rawReport.sha256,archiveReceiptSHA256:sha(await readFile(path.join(directory,'archive-receipt.json'))),summarySHA256:sha(await readFile(path.join(directory,'summary.json'))),cases};
await writeFile(path.join(directory,'artifact-audit.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(evidence,null,2));
