import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalStore} from '../../src/runtime/storage';
import {CampaignProgressStore,type MissionCompletion} from '../../src/runtime/progress';
const completion:MissionCompletion={result_id:'result-1',mission:'mission-01',mission_version:'1',difficulty:'normal',completed_at:100,tick:3000,optional_objectives:['keep-rig'],metadata:{simulation:'test',protocol:1,content_hash:'fixture',map_version:'1',ruleset:'standard-v2',seed:1}};
test('campaign completion is idempotent across tabs and replay playback never updates progression',async()=>{
 const a=new LocalStore('campaign-ledger'),b=new LocalStore('campaign-ledger'),first=new CampaignProgressStore(a),second=new CampaignProgressStore(b);
 await Promise.all([first.record(completion,'live-solo'),second.record(completion,'live-solo')]);const state=await first.read();assert.equal(state?.revision,1);assert.equal(state?.data.missions['mission-01:1:normal'].completions,1);
 await first.record({...completion,result_id:'replay-result'},'replay');assert.equal((await first.read())?.revision,1);
 await second.record({...completion,result_id:'result-2',tick:2000,completed_at:200,optional_objectives:['keep-rig','find-cache']},'live-solo');const updated=await first.read();assert.equal(updated?.data.missions['mission-01:1:normal'].best_tick,2000);assert.deepEqual(updated?.data.missions['mission-01:1:normal'].optional_objectives,['find-cache','keep-rig']);assert.equal(updated?.data.missions['mission-01:1:normal'].completions,2);await a.close();await b.close();
});
test('future progress schema and invalid completion remain untouched',async()=>{
 const store=new LocalStore('campaign-invalid'),ledger=new CampaignProgressStore(store);await assert.rejects(()=>ledger.record({...completion,tick:-1},'live-solo'),{code:'progress_invalid'});assert.equal(await ledger.read(),undefined);
 await store.putProgress('campaign',{version:2,results:[],missions:{}});await assert.rejects(()=>ledger.record(completion,'live-solo'),{code:'progress_incompatible'});assert.equal((await store.progress('campaign'))?.revision,1);await store.close();
});

test('damaged progress records cannot turn counters into invalid values',async()=>{
 const store=new LocalStore('campaign-damaged'),ledger=new CampaignProgressStore(store);await store.putProgress('campaign',{version:1,results:['r'],missions:{'mission-01:1:normal':{mission:'mission-01',mission_version:'1',difficulty:'normal',completions:'bad',first_completed:1,last_completed:1,best_tick:1,optional_objectives:[]}}});
 await assert.rejects(()=>ledger.record(completion,'live-solo'),{code:'progress_invalid'});assert.equal((await store.progress('campaign'))?.revision,1);await store.close();
});

test('practice results cannot update campaign progress even when mislabeled as live by a caller',async()=>{
 const store=new LocalStore('campaign-practice'),ledger=new CampaignProgressStore(store);
 await ledger.record({...completion,metadata:{...completion.metadata,ruleset:'practice-v1'}},'live-solo');assert.equal(await ledger.read(),undefined);
 await ledger.record(completion,'practice');assert.equal(await ledger.read(),undefined);await store.close();
});
