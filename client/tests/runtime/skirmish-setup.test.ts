import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSkirmishPlayers,sanitizeSkirmishSetup,skirmishPreset,type SkirmishSlot} from '../../src/app/skirmish-setup';

test('skirmish presets provide distinct FFA teams and an allied AI in 2v2',()=>{
 const duel=skirmishPreset('1v1','copper-junction','IR');
 assert.equal(duel.slots.length,2);assert.equal(duel.startingCredits,6000);assert.equal(duel.slots[0].faction,'IR');
 assert.equal(duel.slots[0].difficulty,undefined);assert.equal(duel.slots[1].difficulty,'normal');
 const teams=skirmishPreset('2v2','industrial-valley');assert.deepEqual(teams.slots.map(slot=>slot.team),[1,1,2,2]);
 assert.deepEqual(skirmishPreset('ffa','industrial-valley').slots.map(slot=>slot.team),[1,2,3,4]);
 teams.slots[0].name='Changed';assert.equal(skirmishPreset('2v2','industrial-valley').slots[0].name,'Commander');
});

test('explicit starts preserve IDs and AI options without reordering players',()=>{
 const slots=skirmishPreset('1v1','copper-junction').slots;
 Object.assign(slots[0],{spawn:2,color:8,name:'Local commander',team:3});
 Object.assign(slots[1],{spawn:1,color:7,name:'Iranian opponent',faction:'IR',difficulty:'hard',team:4});
 const original=structuredClone(slots),players=resolveSkirmishPlayers(slots,42,2);
 assert.deepEqual(players,[{spawn:2,id:1,name:'Local commander',faction:'US',team:3,color:8,controller:'human'},{spawn:1,id:2,name:'Iranian opponent',faction:'IR',team:4,color:7,controller:'ai',ai:'hard'}]);
 assert.deepEqual(slots,original);
});

test('seeded random faction and automatic spawn choices are stable across row ordering',()=>{
 const slots=skirmishPreset('ffa','industrial-valley','random').slots;
 const first=resolveSkirmishPlayers(slots,12345,4);
 assert.deepEqual(first.map(slot=>[slot.id,slot.faction]),[[1,'SY'],[2,'SA'],[3,'SY'],[4,'US']]);
 assert.deepEqual(resolveSkirmishPlayers([...slots].reverse(),12345,4),first);
 assert.deepEqual(resolveSkirmishPlayers(slots,12345,4),first);
 assert.deepEqual(new Set(first.map(slot=>slot.id)),new Set([1,2,3,4]));
 assert.ok(first.every(slot=>['US','IR','SY','SA'].includes(slot.faction)));
 assert.notDeepEqual(resolveSkirmishPlayers(slots,54321,4),first);
 assert.deepEqual(resolveSkirmishPlayers(slots,0,4),resolveSkirmishPlayers(slots,1,4));
});

test('explicit spawn is reserved before automatic placement',()=>{
 const slots=skirmishPreset('2v2','industrial-valley').slots;slots[2].spawn=1;
 assert.equal(resolveSkirmishPlayers(slots,44,4).find(player=>player.id===3)!.spawn,1);
});

test('spawn resolution accepts sparse map choices and rejects invalid or duplicate positions',()=>{
 const slots=skirmishPreset('1v1','industrial-valley').slots;slots[0].spawn=4;
 assert.equal(resolveSkirmishPlayers(slots,42,4)[0].spawn,4);
 assert.throws(()=>resolveSkirmishPlayers(slots,42,2),/within this battlefield/);
 slots[0].spawn=0;
 assert.throws(()=>resolveSkirmishPlayers(slots,42,1),/exceeds/);
 slots[0].spawn=1;slots[1].spawn=1;
 assert.throws(()=>resolveSkirmishPlayers(slots,42,4),/distinct starting position/);
});

test('slot validation guards human identity, factions, difficulty, teams, colors and seed',()=>{
 const setup=skirmishPreset('1v1','copper-junction');
 const malformed:Partial<SkirmishSlot>[]=[{id:2},{team:-1},{team:5},{faction:'bad' as never},{color:0},{color:9},{color:2},{spawn:-1},{difficulty:'easy'},{name:'😀'.repeat(13)},{name:'\u0000bad'}];
 for(const change of malformed){const slots=structuredClone(setup.slots);Object.assign(slots[0],change);assert.throws(()=>resolveSkirmishPlayers(slots,1,2),JSON.stringify(change))}
 const noAI=structuredClone(setup.slots);delete noAI[1].difficulty;assert.throws(()=>resolveSkirmishPlayers(noAI,1,2),/AI difficulty/);
 const arrayDifficulty=structuredClone(setup.slots);arrayDifficulty[1].difficulty=['normal'] as never;assert.throws(()=>resolveSkirmishPlayers(arrayDifficulty,1,2),/AI difficulty/);
 const noLocal=[{...setup.slots[1]},{...setup.slots[1],id:3,color:3}];assert.throws(()=>resolveSkirmishPlayers(noLocal,1,2),/local commander/);
 for(const seed of [-1,1.5,0x100000000,NaN])assert.throws(()=>resolveSkirmishPlayers(setup.slots,seed,2),/seed/);
});

test('No team commanders receive distinct unused teams without colliding with explicit allies',()=>{
 const setup=skirmishPreset('2v2','industrial-valley');
 setup.slots[0].team=0;setup.slots[1].team=1;setup.slots[2].team=0;setup.slots[3].team=1;
 const players=resolveSkirmishPlayers(setup.slots,42,4).sort((a,b)=>a.id-b.id);
 assert.deepEqual(players.map(player=>player.team),[2,1,3,1]);
 assert.deepEqual(sanitizeSkirmishSetup(setup)?.slots.map(slot=>slot.team),[0,1,0,1]);
 assert.deepEqual(resolveSkirmishPlayers([...setup.slots].reverse(),42,4).sort((a,b)=>a.id-b.id),players);
 const duel=skirmishPreset('1v1','copper-junction');duel.slots[0].team=0;duel.slots[1].team=1;
 assert.deepEqual(resolveSkirmishPlayers(duel.slots,42,2).sort((a,b)=>a.id-b.id).map(player=>player.team),[2,1]);
 const ffa=setup.slots.map(slot=>({...slot,team:0}));
 assert.deepEqual(resolveSkirmishPlayers(ffa,42,4).sort((a,b)=>a.id-b.id).map(player=>player.team),[1,2,3,4]);
});

test('skirmish requires at least two commanders and two opposing teams',()=>{
 const setup=skirmishPreset('1v1','copper-junction');
 assert.throws(()=>resolveSkirmishPlayers([setup.slots[0]],1,2),/two to four commanders/);
 assert.equal(sanitizeSkirmishSetup({...setup,slots:[setup.slots[0]]}),undefined);
 const allied=setup.slots.map(slot=>({...slot,team:1}));
 assert.throws(()=>resolveSkirmishPlayers(allied,1,2),/opposing teams/);
 assert.equal(sanitizeSkirmishSetup({...setup,slots:allied}),undefined);
 const sparse:SkirmishSlot[]=Array(2);sparse[0]=setup.slots[0];
 assert.throws(()=>resolveSkirmishPlayers(sparse,1,2),/Commander IDs/);
 assert.equal(sanitizeSkirmishSetup({...setup,slots:sparse}),undefined);
});

test('memory sanitizer preserves intended setup with fresh data and discards malformed shapes',()=>{
 const setup={...skirmishPreset('1v1','copper-junction'),seed:99};
 const safe=sanitizeSkirmishSetup({...setup,unknown:'ignored'});assert.deepEqual(safe,setup);assert.notEqual(safe?.slots,setup.slots);
 for(const change of [{mapID:'../unsafe'},{mapID:''},{startingCredits:0},{startingCredits:NaN},{seed:-1},{slots:[]},{slots:[null]}])assert.equal(sanitizeSkirmishSetup({...setup,...change}),undefined);
 assert.equal(sanitizeSkirmishSetup(null),undefined);
 assert.equal(sanitizeSkirmishSetup({...setup,slots:[...setup.slots,...setup.slots,...setup.slots]}),undefined);
});

// Different authored maps enumerate their corners differently.
test('automatic duels choose the actual diagonal and respect explicit sparse anchors',async()=>{
 const {readFile}=await import('node:fs/promises');
 for(const id of ['industrial-valley','port-outskirts','border-depots']){
  const map=JSON.parse(await readFile(`../content/maps/${id}.json`,'utf8'));
  for(const anchor of [0,1,2,3,4]){
   const slots=skirmishPreset('1v1',id).slots;slots[0].spawn=anchor;
   const players=resolveSkirmishPlayers(slots,42,4,map.spawns),a=map.spawns[players[0].spawn-1].position,b=map.spawns[players[1].spawn-1].position;
   assert.notEqual(a.x,b.x,id);assert.notEqual(a.y,b.y,id);
   const actual=(a.x-b.x)**2+(a.y-b.y)**2;
   assert.equal(actual,Math.max(...map.spawns.map((start:{position:{x:number;y:number}})=>(start.position.x-a.x)**2+(start.position.y-a.y)**2)),id);
   if(anchor)assert.equal(players[0].spawn,anchor);
  }
 }
});
