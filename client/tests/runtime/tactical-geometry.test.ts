import test from 'node:test';
import assert from 'node:assert/strict';
import {tacticalCircle,warningCaption,zoneCaption,layoutTacticalLabels,orderSymbol,TacticalPingHistory} from '../../src/render/tactical-geometry';
import {tacticalDeadline,type TacticalWarning,type TacticalZone,type TacticalEventCue} from '../../src/app/tactical-presentation';

test('world-space rings preserve exact radius at every sample, including large zones',()=>{
 for(const radius of [1500,2000,9000,10000]){const points=tacticalCircle({x:37000,y:24500},radius);assert(points.length>=32&&points.length<=256);for(const p of points)assert(Math.abs(Math.hypot(p.x-37000,p.y-24500)-radius)<1e-8);assert.equal(points[0].x,37000+radius)}
});
test('caption semantics retain pending launch versus impact and round up the last live tick',()=>{
 const w={kind:'second_volley',deadline:tacticalDeadline(100,101)} as TacticalWarning;
 assert.equal(warningCaption(w),'Next launch · 1s');assert.equal(warningCaption({...w,kind:'tactical'}),'Missile impact · 1s');
 assert.equal(warningCaption({...w,kind:'transfer'}),'Transfer arrives · 1s');
 const z={kind:'shieldline',phase:'preparing',deadline:tacticalDeadline(100,340)} as TacticalZone;
 assert.equal(zoneCaption(z),'Shieldline prepares · 12s');assert.equal(zoneCaption({...z,phase:'active'}),'Shieldline active · 12s');
});
test('coincident and nearby salvo captions remain separate without moving their target points',()=>{
 const input=Array.from({length:6},(_,i)=>({key:String(i),point:{x:500+(i%3)*10,y:400+(i%3)*5},width:130,height:20})),before=structuredClone(input),placed=layoutTacticalLabels(input);
 assert.equal(placed.size,6);assert.equal(new Set([...placed.values()].map(p=>p.y)).size,6);assert.deepEqual(input,before);
 assert.deepEqual(layoutTacticalLabels(input),placed);
});
test('command symbols distinguish target, ground, queued guard, patrol and return intent',()=>{
 assert.deepEqual(['move','attack','attack_move','force_fire','guard','patrol','return','capture'].map(kind=>orderSymbol({index:0,kind,unresolvedTarget:false})),['M','A','AM','F','G','P','R','C']);
});

test('restored ping baseline survives selection refresh; new pings expire and remain bounded',()=>{
 const history=new TacticalPingHistory(),cue=(id:number,tick=100):TacticalEventCue=>({id,tick,kind:'tactical_ping',owner:1,position:{x:1000,y:2000}});
 history.sync([cue(5)],100,true);assert.equal(history.values.length,0);
 history.sync([cue(5)],100);assert.equal(history.values.length,0);
 history.sync([cue(5),cue(6,101)],101);assert.deepEqual(history.values.map(p=>p.id),[6]);
 history.sync([cue(6,101)],161);assert.equal(history.values.length,1);
 history.sync([cue(6,101)],162);assert.equal(history.values.length,0);
 history.sync([cue(6,101)],101,true);history.sync([cue(6,101)],101);assert.equal(history.values.length,0);
 history.sync(Array.from({length:40},(_,i)=>cue(i+7,102)),102);assert.equal(history.values.length,32);assert.equal(Math.min(...history.values.map(p=>p.id)),15);
 history.clear();assert.equal(history.values.length,0);
});
