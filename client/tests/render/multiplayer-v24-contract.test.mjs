import test from 'node:test';
import assert from 'node:assert/strict';
import {cases,acceptanceCase,MatrixCommander,strictDiagnosticStatus} from './multiplayer-v24-contract.mjs';
import {ExpansionCommander} from './expansion-commander.mjs';
import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('../../../pkg/content/rules.json',import.meta.url)));
const dry=JSON.parse(readFileSync(new URL('../../../content/maps/dry-river.json',import.meta.url)));
test('six distinct human/bot formats plus one explicit two-round endurance configuration',()=>{
 assert.equal(cases.length,7);assert.equal(cases.filter(c=>c.rounds===2).length,1);assert.deepEqual(cases.slice(0,6).map(c=>[c.humans,c.bots]),[[1,1],[1,3],[2,0],[2,2],[3,0],[4,0]]);
 assert.throws(()=>acceptanceCase('1h3ai,3h'));assert.equal(acceptanceCase('endurance2h').long,true);
});
test('teams and defeated summaries select only current enemy public spawns, never an allied base',()=>{
 const map={id:'matrix',spawns:[{position:{x:0,y:0}},{position:{x:10,y:0}},{position:{x:100,y:0}},{position:{x:200,y:0}}],fields:[{id:1,position:{x:0,y:2}},{id:2,position:{x:25,y:2}}]};
 const view={players:[{id:1,team:1},{id:2,team:1},{id:3,team:2,defeated:true},{id:4,team:2}],entities:[]};
 const c=new MatrixCommander({player:2,map,catalog,view:()=>view});assert.deepEqual(c.context(view).enemyBases,[map.spawns[3].position]);assert.deepEqual(c.context(view).enemyBase,map.spawns[3].position);
 view.players[2].defeated=false;assert.deepEqual(c.context(view).enemyBase,map.spawns[2].position);
});
test('the existing two-player Dry River policy context stays exactly the same',()=>{
 const view={players:[{id:1,team:1},{id:2,team:2}],entities:[]},options={player:1,map:dry,catalog,view:()=>view};
 const a=new ExpansionCommander(options).context(view),b=new MatrixCommander(options).context(view);delete a.building;delete b.building;assert.deepEqual(a,b);
});
test('known stream primitive findings never whitelist even one actual request failure',()=>{
 assert.equal(strictDiagnosticStatus({}),'passed');for(const key of ['errors','httpErrors','requestFailures','collectorFaults'])assert.equal(strictDiagnosticStatus({[key]:[{message:'net::ERR_ABORTED',bodyMatched:true}]}),'failed');assert.equal(strictDiagnosticStatus({diagnosticsAgree:false}),'failed');
});
test('each real matrix map supplies valid independent public contexts for every human',()=>{
 const industrial=JSON.parse(readFileSync(new URL('../../../content/maps/industrial-valley.json',import.meta.url)));
 for(const c of cases){const map=c.map==='dry-river'?dry:industrial;assert(map.spawns.length>=c.humans+c.bots);const players=Array.from({length:c.humans+c.bots},(_,i)=>({id:i+1,team:c.teams?(i<2?1:2):i+1,faction:c.factions[i]??['US','IR','SY','SA'][i],defeated:false}));
  for(let id=1;id<=c.humans;id++){const v={players,entities:[]},commander=new MatrixCommander({player:id,map,catalog,view:()=>v}),ctx=commander.context(v);assert.deepEqual(ctx.base,map.spawns[id-1].position);assert(ctx.primary);assert(ctx.enemyBase);assert(!players.filter(p=>p.team===players[id-1].team).some(p=>JSON.stringify(map.spawns[p.id-1].position)===JSON.stringify(ctx.enemyBase)),`${c.id}/${id} targeted ally`);}
 }
});
