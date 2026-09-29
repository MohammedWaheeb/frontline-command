// Post-run artifact projection only; never edits raw evidence or starts a process.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import path from 'node:path';
assert.equal(process.argv.length,3,'Use summarize-run.mjs COMPLETED_RUN_DIRECTORY');
const directory=path.resolve(process.argv[2]),bytes=await readFile(path.join(directory,'browser.json')),report=JSON.parse(bytes);
assert(report.completed&&report.browserAndHostClosed,'Only summarize a completely closed course');
const sha=b=>createHash('sha256').update(b).digest('hex');
const summaries=[];
for(const record of report.cases){
 const ledger=(await readFile(path.join(directory,record.id+'-commands.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));
 const receipts={};let orders=0;
 for(const entry of ledger)for(let index=0;index<entry.orders.length;index++){
  const order=entry.orders[index],receipt=entry.receipts[index];assert(receipt);orders++;
  const key=String(entry.player),value=receipts[key]??={accepted:0,rejected:{},acceptedKinds:{}};
  if(receipt.accepted){value.accepted++;value.acceptedKinds[order.kind]=(value.acceptedKinds[order.kind]??0)+1}
  else value.rejected[receipt.code]=(value.rejected[receipt.code]??0)+1;
  assert(!['surrender','surrender_vote','sell','practice'].includes(order.kind),'Forbidden accelerated result');
 }
 summaries.push({id:record.id,status:record.status,phase:record.phase,result:record.result,replay:record.replay,replayUI:record.replayUI,nativeStatus:record.nativeStatus,nativeFailure:record.nativeFailure,nativeProof:record.nativeProof,duration:record.duration,startBlockedBeforeReady:record.startBlockedBeforeReady,readyRoster:record.readyRoster,reconnects:record.reconnects,reconnectAttempts:record.reconnectAttempts,ownershipRejections:record.ownershipRejections,clients:record.clients.map(c=>({player:c.player,faction:c.faction,team:c.team,openingTick:c.openingTick,final:c.final?{tick:c.final.tick,privacyFrames:c.final.privacyFrames,ownSnapshotUnchanged:c.final.ownSnapshotUnchanged,result:c.final.info?.result}:undefined})),adviceFailures:record.adviceFailures,adviceRetries:record.adviceRetries,commandReceipts:{batches:ledger.length,orders,players:receipts}});
}
const summary={status:report.status,combatStatus:report.combatStatus,lifecycleStatus:report.lifecycleStatus,strictStatus:report.strictStatus,browserFailure:report.browserFailure,scope:report.scope,configuration:report.configuration,conditions:report.conditions,started:report.started,completed:report.completed,browserAndHostClosed:report.browserAndHostClosed,hostExit:report.hostExit,browser:report.browser,executable:report.executable,gpu:report.gpu,preparationSHA256:report.preparationSHA256,productReceiptSHA256:report.build.sourceReceiptSHA256,goSourceLockSHA256:report.build.sourceLockSHA256,runtimeReceiptSHA256:report.build.runtimeReceiptSHA256,actualBuild:report.actualBuild,commanderSHA256:report.commanderSHA256,finalInputGuard:report.finalInputGuard,overallWatchdog:report.overallWatchdog,overallDeadline:report.overallDeadline,errors:report.errors,httpErrors:report.httpErrors,rawDiagnostics:{failures:report.requestFailures?.length,collectors:report.diagnosticCollectors.map(x=>({targetId:x.targetId,failures:x.failures.length,playwright:x.playwright.length,diagnosticsAgree:x.diagnosticsAgree,faults:x.faults,requests:x.requests})),meaning:'All raw failures remain strict. This passive course has no original-body instrument; another run cannot supply attribution or a whitelist.'},cases:summaries,boundaries:report.boundaries,rawReport:{bytes:bytes.length,sha256:sha(bytes)}};
await writeFile(path.join(directory,'summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
const archives=[];
for(const file of ['browser.json',...report.cases.flatMap(c=>[c.id+'-commands.jsonl',c.id+'-progress.jsonl'])]){
 const body=await readFile(path.join(directory,file)),packed=gzipSync(body,{mtime:0});assert.deepEqual(gunzipSync(packed),body);
 await writeFile(path.join(directory,file+'.gz'),packed,{flag:'wx'});archives.push({file,bytes:body.length,sha256:sha(body),archive:file+'.gz',archiveBytes:packed.length,archiveSHA256:sha(packed)});
}
await writeFile(path.join(directory,'archive-receipt.json'),JSON.stringify({scope:'Exact lossless original evidence archives; originals and prior failures remain unchanged. Host database and credentials excluded.',archives},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:summary.status,combat:summary.combatStatus,lifecycle:summary.lifecycleStatus,strict:summary.strictStatus,rawFailures:summary.rawDiagnostics.failures,originalSHA256:sha(bytes),directory},null,2));
