import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {AudioDirector} from '../../src/audio/director';
import type {AudioMixer} from '../../src/audio/mixer';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {PlayerSnapshotSchema,EventSchema} from '../../src/protocol/frontline_pb';

function harness(){
 const music:Array<{ids:string[];levels?:number[]}>=[],
  plays:string[]=[];
 const mixer={play:(id:string)=>plays.push(id),music:(ids:string[],levels?:number[])=>music.push({ids,levels}),
  continuous:()=>{},caption:()=>{},reset:()=>{},stopTransient:()=>{},clearCaptions:()=>{},afterSpeech:()=>{},manifest:undefined} as unknown as AudioMixer;
 const catalog=new CatalogIndex({units:[{id:'US.rifle',name:'Ranger',faction:'US',role:'rifle',armor:'infantry',weapon:'RIF'}],weapons:[],buildings:[],upgrades:[]} as unknown as Catalog);
 return {music,plays,director:new AudioDirector(mixer,()=>catalog)};
}
const snapshot=(tick:number,events:ReturnType<typeof create<typeof EventSchema>>[]=[])=>create(PlayerSnapshotSchema,{tick,player:1,players:[{id:1,faction:'US',team:1},{id:2,faction:'IR',team:2}],entities:[{id:1,type:'US.rifle',owner:1},{id:2,type:'US.rifle',owner:2}],events});
const fire=(id:number,tick:number)=>create(EventSchema,{id,tick,kind:'weapon_fired',entity:1,owner:1});
const levels=(h:ReturnType<typeof harness>)=>h.music.at(-1)?.levels;

let now=1_000_000;
const realNow=performance.now.bind(performance);
performance.now=()=>now;
test.after(()=>{performance.now=realNow});

test('a lone shot raises tension without engaging the combat layer',()=>{
 const h=harness();now=1_000_000;
 h.director.snapshot(snapshot(100));
 h.director.snapshot(snapshot(101,[fire(1,101)]));
 assert.deepEqual(levels(h),[0,1,0]);
});

test('confirmed exchanges engage combat; own-unit damage engages immediately',()=>{
 const h=harness();now=2_000_000;
 h.director.snapshot(snapshot(100));
 h.director.snapshot(snapshot(101,[fire(1,101)]));
 now+=500;
 h.director.snapshot(snapshot(102,[fire(2,102)]));
 assert.deepEqual(levels(h),[0,0,1]);

 const g=harness();now=3_000_000;
 g.director.snapshot(snapshot(99));
 g.director.snapshot(snapshot(100,[create(EventSchema,{id:1,tick:100,kind:'under_attack',entity:1,owner:1})]));
 assert.deepEqual(levels(g),[0,0,1]);
});

test('combat exits decay through tension instead of dropping to calm',()=>{
 const h=harness();now=4_000_000;
 h.director.snapshot(snapshot(100));
 h.director.snapshot(snapshot(101,[fire(1,101)]));
 h.director.snapshot(snapshot(102,[fire(2,102)]));
 assert.deepEqual(levels(h),[0,0,1]);
 now+=8100; // past the 8000 ms combat hold, inside the exit decay
 h.director.snapshot(snapshot(103));
 assert.deepEqual(levels(h),[0,1,0]);
 now+=8000; // past the original 15000 ms tension hold: only the exit decay keeps tension
 h.director.snapshot(snapshot(104));
 assert.deepEqual(levels(h),[0,1,0]);
 now+=16000; // past the extended decay
 h.director.snapshot(snapshot(105));
 assert.deepEqual(levels(h),[1,0,0]);
});

test('repeated objective stingers are suppressed while terminal stingers always play',()=>{
 const h=harness();now=5_000_000;
 const objective=(id:number,tick:number)=>create(EventSchema,{id,tick,kind:'objective_complete'});
 h.director.snapshot(snapshot(100));
 h.director.snapshot(snapshot(101,[objective(1,101)]));
 assert.ok(h.plays.includes('music.stinger_objective'));
 const count=h.plays.filter(id=>id==='music.stinger_objective').length;
 now+=1000;
 h.director.snapshot(snapshot(102,[objective(2,102)]));
 assert.equal(h.plays.filter(id=>id==='music.stinger_objective').length,count);
 now+=15000;
 h.director.snapshot(snapshot(103,[objective(3,103)]));
 assert.equal(h.plays.filter(id=>id==='music.stinger_objective').length,count+1);
});
