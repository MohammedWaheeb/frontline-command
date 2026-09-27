import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MapEditorDocument,EditorDraftStore,snapEditorPoint,type EditorMap,type EditorValidators,type EditorTransaction} from '../../src/runtime/editor';
import {RuntimeError} from '../../src/runtime/errors';
// Synthetic editor geometry only; not a shipping map or authored scenario.
function fixture():EditorMap{return {id:'editor-fixture',title:'Synthetic editor fixture',author:'automated test',version:'1',format_version:1,ruleset:'standard-v2',width:32,height:32,tiles:Array.from({length:1024},()=>({terrain:'open',height:0})),spawns:[{position:{x:4000,y:4000},team:1},{position:{x:27000,y:27000},team:2}],fields:[{id:1,position:{x:9000,y:4000},credits:36000000}],stations:[],shipment:{x:16000,y:16000},regions:[],objects:[],required_packs:[]}}
const validators:EditorValidators={async validateMap(data){return JSON.parse(new TextDecoder().decode(data))},async validateMission(_map,data){return JSON.parse(new TextDecoder().decode(data))}};
function document(options={}){return new MapEditorDocument({map:fixture()},validators,{documentId:'fixture-document',...options})}
test('a grouped paint/object/mission edit is one reversible transaction with detached snapshots',()=>{
 const draft=document();let leaked:EditorTransaction|undefined;
 draft.transact('Build synthetic crossing',tx=>{leaked=tx;tx.paintRectangle({x:5,y:6},{x:6,y:7},{terrain:'ramp',height:2,mandatory:true});tx.object({id:9,class:'light_prop',position:{x:12500,y:12500}});tx.field({id:1,position:{x:9500,y:4500},credits:24000000});tx.station({id:3,position:{x:18500,y:18500}});tx.region({id:'approach',min:{x:5000,y:6000},max:{x:9000,y:9000}});tx.spawn(1,{position:{x:26000,y:26000},team:3});tx.shipment({x:17000,y:17000});tx.setMission({id:'fixture',triggers:[]});tx.spliceMission(['triggers'],0,0,[{id:'trigger',condition:{kind:'timer',tick:200},actions:[]}]);tx.setMissionValue(['triggers',0,'condition','tick'],400)});
 assert.equal(draft.revision,1);assert.equal(draft.dirty,true);assert.equal(draft.snapshot().map.tiles[6*32+5].terrain,'ramp');assert.equal(draft.snapshot().map.objects?.length,1);assert.equal((draft.snapshot().mission?.triggers as any[])[0].condition.tick,400);
 assert.throws(()=>leaked!.metadata({title:'late'}),{code:'editor_transaction_closed'});const snapshot=draft.snapshot();snapshot.map.tiles[0].terrain='water';assert.equal(draft.snapshot().map.tiles[0].terrain,'open');
 assert.equal(draft.undo(),true);assert.equal(draft.dirty,false);assert.equal(draft.snapshot().map.objects?.length,0);assert.equal(draft.redo(),true);assert.equal(draft.snapshot().map.spawns[1].team,3);
});
test('failed transactions are atomic; no-op and escaped edits cannot corrupt undo history',()=>{
 const draft=document();const original=draft.snapshot();assert.throws(()=>draft.transact('Invalid stroke',tx=>{tx.metadata({title:'Do not commit'});tx.paint([{x:99,y:0}],{terrain:'water'})}),{code:'editor_index'});assert.deepEqual(draft.snapshot(),original);
 assert.equal(draft.transact('No change',tx=>tx.metadata({title:original.map.title})),false);assert.equal(draft.revision,0);
 assert.throws(()=>draft.transact('Nested',()=>draft.transact('Child',tx=>tx.metadata({title:'child'}))),{code:'editor_nested_transaction'});assert.throws(()=>draft.transact('Async',async tx=>tx.metadata({title:'async'})),{code:'editor_async_transaction'});assert.equal(draft.revision,0);
});
test('undo history is bounded; editing after undo removes the abandoned redo branch',()=>{
 const draft=document({historyEntries:2});for(const title of ['One','Two','Three'])draft.transact(title,tx=>tx.metadata({title}));assert.equal(draft.undo(),true);assert.equal(draft.undo(),true);assert.equal(draft.undo(),false);assert.equal(draft.snapshot().map.title,'One');
 draft.transact('Different branch',tx=>tx.metadata({title:'Branch'}));assert.equal(draft.redo(),false);assert.equal(draft.snapshot().map.title,'Branch');
 const small=document({historyBytes:1024});small.transact('Exceeds history budget',tx=>tx.metadata({title:'Still saved as current state'}));assert.equal(small.snapshot().canUndo,false);assert.equal(small.snapshot().map.title,'Still saved as current state');
});
test('resizing preserves surviving cells and objects for explicit repair; snapping is geometry only',()=>{
 const draft=document();draft.transact('Resize',tx=>{tx.paint([{x:2,y:3}],{terrain:'road',sight_blocker:true});tx.resize(40,35,{terrain:'water',height:1});tx.removeField(1);tx.removeSpawn(1)});const map=draft.snapshot().map;assert.equal(map.tiles.length,1400);assert.equal(map.tiles[3*40+2].terrain,'road');assert.equal(map.tiles[34*40+39].terrain,'water');assert.equal(map.fields.length,0);assert.equal(map.spawns.length,1);
 assert.deepEqual(snapEditorPoint({x:1249,y:2780},1000,{x:500,y:500}),{x:1500,y:2500});assert.throws(()=>snapEditorPoint({x:Infinity,y:0}),{code:'editor_grid'});
});
test('Go validation errors remain precise and prevent export and practice launch',async()=>{
 let missions=0;const goError=new RuntimeError('map_invalid','spawn 1 needs clear 7×7 base area',true,{tile:88});const draft=new MapEditorDocument({map:fixture(),mission:{id:'fixture'}},{async validateMap(){throw goError},async validateMission(){missions++;return {}}});
 const validation=await draft.validate();assert.equal(validation.ok,false);assert.deepEqual(validation.issues[0],{scope:'map',code:'map_invalid',message:goError.message,details:{tile:88}});assert.equal(missions,0);
 await assert.rejects(()=>draft.exportMap(),{code:'editor_validation'});await assert.rejects(()=>draft.prepareTest({seed:1}),{code:'editor_validation'});assert.ok((await draft.exportDraft()).file.size>0);
});
test('validation that races an edit is stale and can never authorize a launch',async()=>{
 let release!:(value:EditorMap)=>void;const wait=new Promise<EditorMap>(resolve=>release=resolve);const draft=new MapEditorDocument({map:fixture()},{...validators,validateMap:()=>wait});const validation=draft.validate();draft.transact('Edit while validating',tx=>tx.metadata({title:'Current'}));release(fixture());const result=await validation;assert.equal(result.stale,true);assert.equal(result.ok,false);assert.equal(result.issues.at(-1)?.code,'editor_changed');assert.equal(draft.validation,undefined);
});
test('editor exports verify checksums, preserve supported mission/presentation, and keep background edits dirty',async()=>{
 const draft=document();draft.transact('Add editor metadata',tx=>{tx.setPresentation({description:'Synthetic test only',screenshot:{mime:'image/png',base64:'AA=='}});tx.setMission({id:'fixture',triggers:[{id:'t',condition:{kind:'timer',tick:200}}]})});const artifact=await draft.exportDraft();draft.transact('Later edit',tx=>tx.metadata({title:'Later'}));draft.markSaved(artifact);assert.equal(draft.dirty,true);draft.undo();assert.equal(draft.dirty,false);
 const imported=await MapEditorDocument.importDraft(new Uint8Array(await artifact.file.arrayBuffer()),validators);assert.deepEqual(imported.snapshot().mission,draft.snapshot().mission);assert.deepEqual(imported.snapshot().presentation,draft.snapshot().presentation);assert.equal(imported.dirty,false);
 const corrupted=JSON.parse(await artifact.file.text());corrupted.map.title='Tampered';await assert.rejects(()=>MapEditorDocument.importDraft(new TextEncoder().encode(JSON.stringify(corrupted)),validators),{code:'editor_checksum'});
 const future={...corrupted,version:2};await assert.rejects(()=>MapEditorDocument.importDraft(new TextEncoder().encode(JSON.stringify(future)),validators),{code:'editor_version'});
});
test('map and mission practice launches are validated, cannot mutate editor state, and retain the draft on return',async()=>{
 const draft=document();draft.transact('Paint',tx=>tx.paint([{x:10,y:10}],{terrain:'cover'}));const before=draft.snapshot(),launch=await draft.prepareTest({seed:12});assert.equal(launch.config.ruleset,'practice-v1');assert.equal(launch.config.players?.length,2);assert.equal(launch.config.players?.[0].controller,'human');assert.equal(launch.config.players?.[1].ai,'normal');assert.equal(launch.config.skip_countdown,undefined);
 launch.config.map.tiles[0].terrain='water';assert.deepEqual(draft.returnFromTest(launch),before);assert.throws(()=>document().returnFromTest(launch),{code:'editor_test_token'});
 await assert.rejects(()=>draft.prepareTest({seed:12,players:[{id:1,name:'AI',team:1,faction:'US',ai:'normal'}]}),{code:'editor_test_players'});
 let inspected=0;const mission=new MapEditorDocument({map:fixture(),mission:{id:'fixture',players:[{id:1,controller:'human'}]}},{...validators,async validateMission(map,data){inspected++;assert.equal(JSON.parse(new TextDecoder().decode(map)).id,'editor-fixture');return JSON.parse(new TextDecoder().decode(data))}});const missionLaunch=await mission.prepareTest({seed:1,difficulty:'hard'});assert.equal(inspected,1);assert.equal(missionLaunch.config.ruleset,'practice-v1');assert.equal(missionLaunch.config.difficulty,'hard');assert.equal(missionLaunch.config.players,undefined);
});
test('mission edits reject executable/non-JSON values and prototype paths without changing the document',()=>{
 const draft=document();draft.transact('Mission',tx=>tx.setMission({id:'fixture',triggers:[]}));const before=draft.snapshot();assert.throws(()=>draft.transact('Unsafe path',tx=>tx.setMissionValue(['__proto__'],{})),{code:'editor_mission_path'});assert.throws(()=>draft.transact('Function',tx=>tx.setMission({script:(()=>{}) as any})),{code:'editor_json_value'});assert.throws(()=>draft.transact('Inexact integer',tx=>tx.setMission({seed:Number.MAX_SAFE_INTEGER+1})),{code:'editor_json_number'});assert.throws(()=>draft.transact('Oversized splice',tx=>tx.spliceMission(['triggers'],0,0,Array(4097).fill(null))),{code:'editor_mission_path'});assert.deepEqual(draft.snapshot(),before);
});
test('draft persistence is CAS protected and preserves exact portable documents',async()=>{
 const firstStore=new EditorDraftStore('editor-cas'),otherStore=new EditorDraftStore('editor-cas'),draft=document();draft.transact('First edit',tx=>tx.metadata({title:'First'}));const first=await firstStore.put(draft);assert.equal(first.revision,1);assert.equal(draft.dirty,false);const loaded=await firstStore.get(draft.documentId);assert.ok(loaded);
 const other=await MapEditorDocument.importDraft(loaded!.data,validators);draft.transact('Local edit',tx=>tx.metadata({title:'Local'}));other.transact('Other edit',tx=>tx.metadata({title:'Other'}));const writes=await Promise.allSettled([firstStore.put(draft,1),otherStore.put(other,1)]);assert.equal(writes.filter(result=>result.status==='fulfilled').length,1);const rejected=writes.find(result=>result.status==='rejected');assert.equal(rejected?.status==='rejected'&&rejected.reason.code,'editor_draft_conflict');
 const summaries=await firstStore.list();assert.equal(summaries[0].revision,2);assert.equal('data' in summaries[0],false);await assert.rejects(()=>firstStore.delete(draft.documentId,1),{code:'editor_draft_conflict'});const original=await firstStore.exportOriginal(draft.documentId);assert.equal(JSON.parse(await original.text()).format,'frontline-editor-document');await firstStore.close();await otherStore.close();
});

test('a microtask edit after Go validation resolves cannot be substituted into a validated export',async()=>{
 const draft=document(),validate=draft.validate.bind(draft);draft.validate=async()=>{const result=await validate();queueMicrotask(()=>draft.transact('Concurrent change',tx=>tx.metadata({title:'Unchecked'})));return result};await assert.rejects(()=>draft.prepareTest({seed:1}),{code:'editor_changed'});
});
test('a failed summary write aborts the entire draft save and keeps the dirty document available',async()=>{
 const store=new EditorDraftStore('editor-quota'),draft=document();draft.transact('Unsaved edit',tx=>tx.metadata({title:'Keep me'}));const original=IDBObjectStore.prototype.put;let writes=0;
 IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){if(++writes===2)throw new DOMException('full','QuotaExceededError');return original.apply(this,args)};
 try{await assert.rejects(()=>store.put(draft),{code:'storage_full'})}finally{IDBObjectStore.prototype.put=original}
 assert.equal(draft.dirty,true);assert.equal((await store.list()).length,0);assert.equal(await store.get(draft.documentId),undefined);await store.put(draft);assert.equal(draft.dirty,false);await store.close();
});
test('supported optional map arrays normalize without losing metadata, and mission corruption is detected on draft import',async()=>{
 const map:any=fixture();delete map.required_packs;delete map.fields;map.stations=null;delete map.spawns[0].team;const imported=await MapEditorDocument.importMap(new TextEncoder().encode(JSON.stringify(map)),validators);assert.equal(imported.snapshot().map.author,map.author);assert.deepEqual(imported.snapshot().map.required_packs,[]);assert.deepEqual(imported.snapshot().map.fields,[]);
 imported.transact('Mission',tx=>tx.setMission({id:'fixture',triggers:[]}));const artifact=await imported.exportDraft(),bad=JSON.parse(await artifact.file.text());bad.mission.id='altered';await assert.rejects(()=>MapEditorDocument.importDraft(new TextEncoder().encode(JSON.stringify(bad)),validators),{code:'editor_checksum'});
});

test('draft deletion retains revisions across reopen so stale tabs cannot overwrite or delete recreated drafts',async()=>{
 let store=new EditorDraftStore('editor-aba');const draft=document();await store.put(draft);await store.delete(draft.documentId,1);await store.close();store=new EditorDraftStore('editor-aba');const recreated=await store.put(draft,0);assert.equal(recreated.revision,2);await assert.rejects(()=>store.put(draft,1),{code:'editor_draft_conflict'});await assert.rejects(()=>store.delete(draft.documentId,1),{code:'editor_draft_conflict'});assert.equal((await store.get(draft.documentId))?.revision,2);await store.close();
});
test('schema-one draft migration preserves content and starts the tombstone above the old revision',async()=>{
 const draft=document(),artifact=await draft.exportDraft(),data=new Uint8Array(await artifact.file.arrayBuffer());const summary={id:draft.documentId,title:'Legacy',mapId:'editor-fixture',revision:9,documentRevision:0,updated:1,bytes:data.length,checksum:artifact.checksum};
 const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('editor-legacy',1);r.onupgradeneeded=()=>{for(const name of ['drafts','summaries'])r.result.createObjectStore(name,{keyPath:'id'})};r.onsuccess=()=>resolve(r.result)});await new Promise<void>(resolve=>{const tx=db.transaction(['drafts','summaries'],'readwrite');tx.objectStore('drafts').put({...summary,data});tx.objectStore('summaries').put(summary);tx.oncomplete=()=>resolve()});db.close();const store=new EditorDraftStore('editor-legacy');assert.deepEqual((await store.get(draft.documentId))?.data,data);await store.delete(draft.documentId,9);assert.equal((await store.put(draft,0)).revision,10);await store.close();
});
