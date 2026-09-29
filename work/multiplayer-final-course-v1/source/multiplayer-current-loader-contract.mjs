// Test-only matrix. Future private commander differs only in public station owner eligibility.
import assert from 'node:assert/strict';
export {MatrixCommander,strictDiagnosticStatus} from './multiplayer-v24-contract.mjs';
export const cases=Object.freeze([
 {id:'1h1ai',humans:1,bots:1,mode:'custom',map:'industrial-valley',factions:['US'],botFactions:['IR'],rounds:1},
 {id:'1h3ai',humans:1,bots:3,mode:'ffa',map:'industrial-valley',factions:['US'],botFactions:['IR','SY','SA'],rounds:1},
 {id:'2h',humans:2,bots:0,mode:'1v1',map:'industrial-valley',factions:['US','IR'],botFactions:[],rounds:1},
 {id:'2h2ai',humans:2,bots:2,mode:'custom',teams:true,map:'industrial-valley',factions:['US','IR'],botFactions:['SY','SA'],rounds:1},
 {id:'3h',humans:3,bots:0,mode:'ffa',map:'industrial-valley',factions:['US','IR','SY'],botFactions:[],rounds:1},
 {id:'3h1ai',humans:3,bots:1,mode:'ffa',map:'industrial-valley',factions:['US','IR','SY'],botFactions:['SA'],rounds:1},
 {id:'4h2v2',humans:4,bots:0,mode:'2v2',teams:true,map:'industrial-valley',factions:['US','IR','SY','SA'],botFactions:[],rounds:1},
 {id:'endurance2h',humans:2,bots:0,mode:'1v1',map:'dry-river',factions:['US','SA'],botFactions:[],rounds:2,long:true},
].map(c=>Object.freeze({...c,factions:Object.freeze(c.factions),botFactions:Object.freeze(c.botFactions)})));
export function acceptanceCase(id){const value=cases.find(c=>c.id===id);assert(value,'Choose exactly one explicit case; no automatic next case');return value}
export function expectedPlayers(config){return [...config.factions,...config.botFactions].map((faction,index)=>({id:index+1,faction,team:config.teams?(index<2?1:2):index+1,ai:index<config.humans?'':'normal'}))}
export function assertLobby(config,lobby,profiles,{ready=false}={}){
 assert.equal(lobby.map_id,config.map);assert.equal(lobby.mode,config.mode);assert.equal(lobby.rated,false);assert.equal(lobby.slots.length,config.humans+config.bots);
 assert.deepEqual(lobby.rules,{ruleset:'standard-v2',speed:1,starting_credits:6000,supply_cap:100,fog:true,strategic_operations:true});
 for(const expected of expectedPlayers(config)){
  const slot=lobby.slots.find(s=>s.player===expected.id);assert(slot,`Missing player ${expected.id}`);
  assert.equal(slot.faction,expected.faction);assert.equal(slot.team,expected.team);assert.equal(slot.ai??'',expected.ai);assert(!slot.script,'Script opponent is not a deterministic skirmish bot');
  if(expected.ai)assert(!slot.profile,'AI slot must not use another human profile');else assert.equal(slot.profile,profiles[expected.id-1]);
  if(ready){assert.equal(slot.ready,true);assert.equal(slot.assets_ready,true)}
 }
 return lobby.slots.map(({player,faction,team,ai,profile,ready,assets_ready})=>({player,faction,team,ai:ai??'',profile,ready,assets_ready}));
}
export function assertAuditRoster(config,audit){
 assert.equal(audit.map_id,config.map);assert.equal(audit.players.length,config.humans+config.bots);
 for(const expected of expectedPlayers(config)){
  const actual=audit.players.find(p=>p.id===expected.id);assert(actual);
  for(const key of ['faction','team'])assert.equal(actual[key],expected[key]);assert.equal(actual.ai??'',expected.ai);
  assert(actual.income_milli>0&&actual.spent_milli>0,'Every human and bot needs ordinary paid economy');
  assert(actual.orders.build>0&&actual.orders.train>0,'Every human and bot needs real build/train commands');
 }
 assert.equal(audit.full_checkpoint_and_resumed_hashes_equal,true);
}
export function assertHumanJourney(config,record){
 for(let player=1;player<=config.humans;player++){
  assert(record.reconnects?.some(r=>r.player===player),`Human ${player} did not reconnect while active`);
  assert(record.ownershipRejections?.some(r=>r.player===player&&r.code==='not_owner'),`Human ${player} ownership boundary unproved`);
  const receipts=(record.commandSummary??{})[player]??{};
  for(const kind of ['build','train'])assert(receipts[kind]?.accepted>0,`Human ${player} has no accepted paid ${kind}`);
  assert(['move','attack_move','attack'].some(kind=>receipts[kind]?.accepted>0),`Human ${player} has no accepted tactical order`);
 }
}
