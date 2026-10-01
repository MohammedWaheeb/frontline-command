import test from 'node:test';
import assert from 'node:assert/strict';
import {recordedOperation,frozenResultAvailable,recordedResultLabel} from '../../src/app/recorded-result';
const record={id:'match-original',created:1000,void:false,payload:btoa('{"match_id":"match-original","metadata":{"seed":17931671840595635671},"outcome":{"finished":true,"draw":false,"winning_team":2,"reason":"elimination","tick":16074}}')};
test('recorded result reads only authenticated result metadata and preserves original payload bytes',()=>{
 const original=record.payload,entry=recordedOperation(record);assert.equal(entry.result.outcome?.tick,16074);assert.equal(entry.result.outcome?.winningTeam,2);assert.equal(recordedResultLabel(entry.result),'Team 2 victorious');assert.equal(record.payload,original);assert.equal('metadata' in entry,false);
 for(const bad of [{...record,id:'other'},{...record,payload:'invalid'},{...record,created:NaN},{...record,payload:btoa(JSON.stringify({match_id:record.id,outcome:{finished:true,draw:false,winning_team:7,reason:'elimination',tick:1}}))}])assert.throws(()=>recordedOperation(bad),/invalid metadata/);
});
test('frozen result cue requires matching committed result and never replaces live or observer state',()=>{
 const result=recordedOperation(record).result,base={kind:'online',liveFinished:false,matchID:record.id,result,eliminated:true,connection:'closed' as const};
 assert(frozenResultAvailable(base));assert(frozenResultAvailable({...base,eliminated:false,connection:'reconnecting'}));
 for(const overrides of [{kind:'observer'},{kind:'replay'},{kind:'solo'},{liveFinished:true},{matchID:'other'},{result:undefined},{result:{...result,committed:false}},{eliminated:false,connection:'connected' as const},{eliminated:false,connection:'idle' as const}])assert.equal(frozenResultAvailable({...base,...overrides}),false);
 assert.equal(result.outcome?.tick,16074);
});
