import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeSkirmishSetup,skirmishPreset} from '../../src/app/skirmish-setup';
import {addAI,alliedSpawns,applyPreset,fitToMap,initialSetup,matchFormat,parseCreditsDraft,removeSlot,setColor,setSpawn,setupProblem,updateSlot,compass} from '../../src/ui/menu/skirmish/skirmish-model';

const maps=[{id:'copper-junction',players:2},{id:'industrial-valley',players:4}];

test('skirmish screen restores a fitting remembered setup and falls back to a fresh 1v1',()=>{
 const remembered=skirmishPreset('ffa','industrial-valley','SA');
 const restored=initialSetup({...remembered,startingCredits:25000},maps)!;
 assert.equal(restored.mapID,'industrial-valley');assert.equal(restored.slots.length,4);assert.equal(restored.startingCredits,25000);assert.equal(restored.slots[0].faction,'SA');
 const fresh=initialSetup({...remembered,mapID:'missing'},maps)!;
 assert.equal(fresh.mapID,'copper-junction');assert.equal(fresh.slots.length,2);
 assert.equal(initialSetup(undefined,[]),undefined);
});

test('every table edit keeps a setup the client-logic validator accepts',()=>{
 let setup=initialSetup(undefined,maps)!;setup={...setup,mapID:'industrial-valley'};
 setup=addAI(setup,4);setup=addAI(setup,4);
 assert.equal(setup.slots.length,4);assert.deepEqual(setup.slots.map(slot=>slot.id),[1,2,3,4]);
 assert.equal(new Set(setup.slots.map(slot=>slot.color)).size,4);
 assert.equal(addAI(setup,4),setup,'a full battlefield accepts no fifth commander');
 setup=setColor(setup,1,2);assert.equal(setup.slots[0].color,2);assert.equal(setup.slots[1].color,1,'a taken colour swaps with its holder');
 setup=setSpawn(setup,1,3);setup=setSpawn(setup,2,3);assert.equal(setup.slots[1].spawn,3);assert.equal(setup.slots[0].spawn,0,'claiming a held start swaps positions');
 setup=setSpawn(setup,2,3,true);assert.equal(setup.slots[1].spawn,0,'clicking your own start again frees it');
 setup=setSpawn(setup,4,4);setup=removeSlot(setup,2);
 assert.deepEqual(setup.slots.map(slot=>slot.id),[1,2,3]);assert.equal(setup.slots[2].spawn,4,'removing a commander preserves valid battlefield starts');
 setup=updateSlot(setup,2,{difficulty:'hard',faction:'IR'});assert.equal(setup.slots[1].name,'Hard AI 1');
 assert.ok(sanitizeSkirmishSetup(setup));assert.equal(setupProblem(setup,6000,4),undefined);
 assert.equal(removeSlot(setup,1),setup,'the local commander cannot be removed');
});

test('presets keep your faction and colour; 2v2 seats allies on authored team starts',()=>{
 const base=setColor(updateSlot(initialSetup(undefined,maps)!,1,{faction:'SY'}),1,5);
 const teams=applyPreset({...base,mapID:'industrial-valley'},'2v2',[1,2,1,2]);
 assert.deepEqual(teams.slots.map(slot=>slot.team),[1,1,2,2]);assert.equal(teams.slots[0].faction,'SY');assert.equal(teams.slots[0].color,5);
 assert.deepEqual(teams.slots.map(slot=>slot.spawn),[1,3,2,4]);assert.ok(sanitizeSkirmishSetup(teams));
 assert.equal(matchFormat(teams.slots),'2 v 2');
 assert.equal(matchFormat(applyPreset(teams,'ffa').slots),'Free-for-all · 4');
 assert.deepEqual(alliedSpawns(teams.slots,[1,2,undefined,2]),teams.slots,'incomplete hints leave starts unchanged');
});

test('switching to a smaller battlefield drops surplus AI and keeps opposing teams',()=>{
 const allied={...skirmishPreset('2v2','industrial-valley'),slots:skirmishPreset('2v2','industrial-valley').slots.map(slot=>({...slot,team:slot.id<=3?1:2}))};
 const {setup,removed}=fitToMap(allied,'copper-junction',2);
 assert.equal(removed,2);assert.equal(setup.slots.length,2);assert.notEqual(setup.slots[0].team,setup.slots[1].team);assert.ok(sanitizeSkirmishSetup(setup));
});

test('launch blockers and helper copy are player language',()=>{
 const setup=initialSetup(undefined,maps)!;
 assert.equal(setupProblem(setup,undefined,2),'Enter starting credits from 1 to 1,000,000.');
 assert.equal(setupProblem({...setup,slots:setup.slots.map(slot=>({...slot,team:1}))},6000,2),'Put at least one commander on an opposing team.');
 assert.equal(setupProblem(undefined,6000,undefined),'Choose a battlefield.');
 assert.equal(parseCreditsDraft('12,500'),12500);assert.equal(parseCreditsDraft('0'),undefined);assert.equal(parseCreditsDraft('1000001'),undefined);
 assert.equal(compass(18500,64500,128,128),'west');assert.equal(compass(134500,25500,160,160),'north-east');
});


test('a duel can restore, select and swap every map start without losing choices on table edits',()=>{
 const base=skirmishPreset('1v1','industrial-valley');base.slots[0].spawn=4;base.slots[1].spawn=3;
 let setup=initialSetup(base,maps)!;
 assert.deepEqual(setup.slots.map(slot=>slot.spawn),[4,3]);
 setup=setSpawn(setup,1,3,false,4);assert.deepEqual(setup.slots.map(slot=>slot.spawn),[3,4]);
 setup=addAI(setup,4);assert.deepEqual(setup.slots.map(slot=>slot.spawn),[3,4,0]);
 setup=updateSlot(setup,1,{faction:'IR'});setup=setColor(setup,1,5);setup=removeSlot(setup,3);
 assert.deepEqual(setup.slots.map(slot=>slot.spawn),[3,4]);
 assert.equal(setSpawn(setup,1,5,false,4),setup);assert.equal(setSpawn(setup,1,3,false,2),setup);
 const smaller=fitToMap(setup,'copper-junction',2).setup;
 assert.deepEqual(smaller.slots.map(slot=>slot.spawn),[0,0],'only switching to a smaller map clears out-of-bounds starts');
});
