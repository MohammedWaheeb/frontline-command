import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fromBinary} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema} from '../runtime-034-candidate/runtime/frontline_pb';
import {CatalogIndex} from '../../client/src/content/catalog';
import {combatFacts} from '../../client/src/app/combat-feedback';
import {combatSound} from '../../client/src/audio/combat-sound';
import {AudioDirector} from '../../client/src/audio/director';
import type {AudioMixer} from '../../client/src/audio/mixer';

const root=new URL('../../',import.meta.url),load=async(path:string)=>new Uint8Array(await readFile(new URL(path,root))),json=async(path:string)=>JSON.parse(new TextDecoder().decode(await load(path))),sha=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
const catalog=new CatalogIndex(await json('pkg/content/rules.json'));
const native=await json('work/combat-audio/native-wire.json'),wasm=await json('work/combat-audio/wasm-wire.json');assert.deepEqual(native,wasm);assert.equal(Object.keys(native).length,14);
const cases=[];
for(const [name,pair]of Object.entries(native) as [string,{previous:string;current:string}][]){
 const previous=fromBinary(PlayerSnapshotSchema,Buffer.from(pair.previous,'base64')),current=fromBinary(PlayerSnapshotSchema,Buffer.from(pair.current,'base64'));
 const cues=current.events.flatMap(event=>{const cue=combatSound(event,current,previous,catalog);return cue?[{id:event.id,event:event.kind,owner:event.owner,entity:event.entity,cue,facts:combatFacts(event,current,catalog)}]:[]});
 const sounds:string[]=[],captions:string[]=[];const mixer={play:(id:string)=>sounds.push(id),caption:(text:string)=>captions.push(text),music:()=>{},continuous:()=>{},reset:()=>{},manifest:undefined} as unknown as AudioMixer;const director=new AudioDirector(mixer,()=>catalog);director.snapshot(previous);director.snapshot(current);const once={sounds:[...sounds],captions:[...captions]};director.snapshot(current);assert.deepEqual({sounds,captions},once,'duplicate snapshot repeated sound');director.discontinuity();director.snapshot(current);assert.deepEqual({sounds,captions},once,'restore replayed history');director.dispose();
 if(name.startsWith('source-'))assert(cues.some(value=>value.cue.sound==='sfx.weapon.RIF'),'real original weapon lost');
 if(name==='landed.json'){const impact=cues.find(value=>value.event==='impact');assert.equal(impact?.facts.targetArmor,'light');assert.equal(impact?.cue.sound,'sfx.impact_metal_light');assert(current.entities.some(value=>value.type==='IR.fighter'&&value.landed));}
 if(name.startsWith('privacy-')&&name!=='privacy-visible.json'){const impact=cues.find(value=>value.event==='impact');assert.equal(impact?.entity,0);assert.equal(impact?.facts.hit,false);assert.equal(impact?.cue.sound,'sfx.impact_ground');}
 if(name==='privacy-visible.json'||name==='ordinary.json')assert(cues.some(value=>value.facts.hit&&value.facts.coverMitigated),'actual covered positive hit lost');
 if(name==='decoy.json'){assert.equal(cues.filter(value=>value.cue.kind==='decoy').length,1);assert.equal(captions.filter(value=>value==='Decoy defeated an incoming shot.').length,1);assert(!sounds.includes('sfx.intercept_burst'));assert(!cues.some(value=>value.facts.hit));}
 if(name==='abm.json'||name==='SA.mobile_abm.json'){assert.equal(sounds.filter(value=>value==='sfx.intercept_burst').length,1);assert.equal(sounds.filter(value=>value==='vo.announcer.US.interceptor_depleted').length,1);const intercept=cues.find(value=>value.cue.kind==='intercept');assert.equal(intercept?.owner,2);assert.equal(intercept?.entity,0);assert.equal(captions.length,0);}
 cases.push({name,tick:current.tick,simulation:current.metadata?.simulation,events:current.events.length,cues,sounds,captions,previous_sha256:sha(Buffer.from(pair.previous,'base64')),current_sha256:sha(Buffer.from(pair.current,'base64'))});
}
const files=['client/src/audio/combat-sound.ts','client/src/audio/director.ts','client/src/app/combat-feedback.ts','work/runtime-034-candidate/source-lock.json','work/runtime-034-candidate/runtime/frontline_pb.ts','work/combat-audio/source/pkg/sim/combat_audio_capture_test.go','work/combat-audio/source/cmd/wasm/combat_audio_codec_test.go'];
const sources=Object.fromEntries(await Promise.all(files.map(async path=>[path,sha(await load(path))])));const result={recorded_utc:new Date().toISOString(),node:process.version,cases:cases.length,native_wasm_wire_exact:true,actual_simulation:true,fixture:'Controlled synthetic mechanics snapshots; ordinary case uses a submitted attack order. Exceptional source, visibility and buff states are test setup, not campaign accomplishments.',mixer:'Recording mixer; no audible playback acceptance.',sources,results:cases};await writeFile(new URL('work/evidence/combat-audio/go-consumer.json',root),JSON.stringify(result,null,2));console.log(JSON.stringify({cases:cases.length,native_wasm_wire_exact:true,assertions:'PASS'}));
