import test from 'node:test';
import assert from 'node:assert/strict';
import {checkActorGroups,resolveActorGroups,effectiveTutorialMission,publicTutorialFactionActors} from './lib/presentation-actors.mjs';
const mission=()=>({id:'fixture',players:[{id:1,controller:'human',team:1},{id:2,controller:'script',team:2},{id:3,controller:'script',team:1}],initial:[{tag:'owned',type:'US.rifle',owner:1},{tag:'owned',type:'US.rifle',owner:1},{tag:'enemy',type:'IR.rifle',owner:2},{tag:'recover',type:'US.rig',owner:3},{tag:'script-convoy',type:'US.hauler',owner:3}],triggers:[{actions:[{kind:'recover_tag',tag:'recover',owner:1}]}]});
test('duplicate Initial tag/type canonicalizes to the first origin and omits raw tags',()=>{
 assert.deepEqual(resolveActorGroups(mission(),[['owned','Original team'],['recover','Recovered rig']]),[{origin:'initial:0',text:'Original team'},{origin:'initial:3',text:'Recovered rig'}]);
 assert.equal(checkActorGroups(mission(),[{origin:'initial:0',text:'Original team'}]),1);
 assert.throws(()=>checkActorGroups(mission(),[{origin:'initial:1',text:'Original team'}]),/noncanonical/);
});
test('enemy, future spawn and script-controlled convoy labels are rejected',()=>{
 for(const tag of ['enemy','future','script-convoy'])assert.throws(()=>resolveActorGroups(mission(),[[tag,'Do not publish']]));
});
test('ambiguous types, duplicate origins and unsupported presentation fields are rejected',()=>{
 const m=mission();m.initial[1].type='US.at';
 assert.throws(()=>resolveActorGroups(m,[['owned','Ambiguous']]),/ambiguous/);
 assert.throws(()=>checkActorGroups(mission(),[{origin:'initial:0',text:'A'},{origin:'initial:0',text:'B'}]),/duplicate/);
 assert.throws(()=>checkActorGroups(mission(),[{origin:'initial:0',text:'A',tag:'owned'}]),/invalid/);
});
test('indices, labels and list size are bounded',()=>{
 for(const origin of ['initial:-1','initial:01','initial:99','spawn:0'])assert.throws(()=>checkActorGroups(mission(),[{origin,text:'A'}]));
 for(const text of ['', ' ', 'x'.repeat(121)])assert.throws(()=>resolveActorGroups(mission(),[['owned',text]]));
 assert.throws(()=>resolveActorGroups(mission(),Array.from({length:257},()=>['owned','A'])),/list/);
});
test('tutorial faction origins use retained nonhuman actors followed by replacement human Initial',()=>{
 const m=mission();m.id='tutorial-5-command-a-match';m.tutorial_variants=[{faction:'IR',initial:[{tag:'tutorial-survey',type:'IR.isr',owner:1}],triggers:[],objectives:[]}];
 const effective=effectiveTutorialMission(m,'IR');
 assert.deepEqual(effective.initial.map(actor=>actor.tag),['enemy','recover','script-convoy','tutorial-survey']);
 assert.deepEqual(publicTutorialFactionActors(m,'IR'),[{origin:'initial:3',text:'Faction ability Survey Drone'}]);
 assert.equal(checkActorGroups(effective,publicTutorialFactionActors(m,'IR')),1);
 assert.throws(()=>effectiveTutorialMission(m,'XX'),/unknown tutorial faction/);
});
