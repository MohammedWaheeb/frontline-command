import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptanceCase,cases,expectedPlayers,assertLobby,assertAuditRoster,assertHumanJourney,MatrixCommander,strictDiagnosticStatus} from './multiplayer-current-loader-contract.mjs';
import {readFileSync} from 'node:fs';
const map=JSON.parse(readFileSync(new URL('../../../content/maps/industrial-valley.json',import.meta.url)));
const catalog=JSON.parse(readFileSync(new URL('../../../pkg/content/rules.json',import.meta.url)));
const config=acceptanceCase('3h1ai'),profiles=['profile-a','profile-b','profile-c'];
const roster=expectedPlayers(config);
function lobby(){return {map_id:config.map,mode:config.mode,rated:false,rules:{ruleset:'standard-v2',speed:1,starting_credits:6000,supply_cap:100,fog:true,strategic_operations:true},slots:roster.map(p=>({player:p.id,...p,profile:p.ai?undefined:profiles[p.id-1],ready:true,assets_ready:true}))}}
function audit(){return {map_id:config.map,full_checkpoint_and_resumed_hashes_equal:true,players:roster.map(p=>({...p,income_milli:1,spent_milli:1,orders:{build:1,train:1}}))}}
test('explicit same-package matrix includes missing 3H+1 normal Go bot and all human counts',()=>{
 assert.equal(cases.length,8);assert.deepEqual([...new Set(cases.map(c=>c.humans))],[1,2,3,4]);assert.deepEqual(roster.map(p=>p.ai),['','','','normal']);assert.deepEqual(roster.map(p=>p.faction),['US','IR','SY','SA']);assert.throws(()=>acceptanceCase('3h,3h1ai'));assert.throws(()=>acceptanceCase(undefined));
});
test('lobby gate rejects substituted humans, script bots, difficulty or rules changes',()=>{
 assertLobby(config,lobby(),profiles,{ready:true});
 for(const mutate of [x=>x.slots[3].ai='hard',x=>x.slots[3].script=true,x=>x.slots[3].profile='someone',x=>x.slots[2].profile=profiles[0],x=>x.slots[3].team=1,x=>x.slots[0].assets_ready=false,x=>x.rules.starting_credits=9999]){const value=lobby();mutate(value);assert.throws(()=>assertLobby(config,value,profiles,{ready:true}))}
});
test('earned replay roster and paid bot economy must agree with the intended lobby',()=>{
 assertAuditRoster(config,audit());
 for(const mutate of [x=>x.players[3].ai='',x=>x.players[3].orders.train=0,x=>x.players[3].income_milli=0,x=>x.players.pop(),x=>x.full_checkpoint_and_resumed_hashes_equal=false]){const value=audit();mutate(value);assert.throws(()=>assertAuditRoster(config,value))}
});
test('every human needs reconnect, ownership rejection and accepted paid/tactical orders',()=>{
 const record={reconnects:profiles.map((_,i)=>({player:i+1})),ownershipRejections:profiles.map((_,i)=>({player:i+1,code:'not_owner'})),commandSummary:Object.fromEntries(profiles.map((_,i)=>[i+1,{build:{accepted:1},train:{accepted:1},move:{accepted:1}}]))};assertHumanJourney(config,record);
 for(const key of ['reconnects','ownershipRejections']){const v=structuredClone(record);v[key].pop();assert.throws(()=>assertHumanJourney(config,v))}
 const v=structuredClone(record);v.commandSummary[3].train.accepted=0;assert.throws(()=>assertHumanJourney(config,v));
});
test('3H+1AI policy consumes separate owner views and public spawns without foreign private data',()=>{
 for(let player=1;player<=3;player++){
  const view={players:roster.map(p=>({...p,defeated:false})),entities:[{id:10+player,owner:player,type:'hq',health:100,position:map.spawns[player-1].position,private:{orders:[]}}]};
  const c=new MatrixCommander({player,map,catalog,view:()=>view}),ctx=c.context(view);assert.equal(ctx.enemyBases.length,3);assert(!ctx.enemyBases.some(p=>p===map.spawns[player-1].position));assert.equal(ctx.own.length,1);
  view.players.find(p=>p.id!==player).defeated=true;assert.equal(c.context(view).enemyBases.length,2);
 }
});
test('complete native bytes do not turn an unclassified browser abort into a clean course',()=>{
 assert.equal(strictDiagnosticStatus({}),'passed');assert.equal(strictDiagnosticStatus({requestFailures:[{errorText:'net::ERR_ABORTED',exactBody:true}]}),'failed');
});
