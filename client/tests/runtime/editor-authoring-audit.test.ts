import assert from 'node:assert/strict';
import {test} from 'node:test';
import {indexedDB} from 'fake-indexeddb';
import {editorObjectPosition,editorRegionFromCells} from '../../src/app/editor-geometry';
import {EditorController} from '../../src/app/editor-controller';
import {EditorDraftStore} from '../../src/runtime/editor';
import type {GameMap} from '../../src/runtime/types';
import type {Application} from '../../src/app/application';

globalThis.indexedDB=indexedDB;
function map(id:string):GameMap{return {id,title:id,author:'Audit fixture',version:'1',format_version:1,ruleset:'standard-v2',width:64,height:96,tiles:Array.from({length:64*96},()=>({terrain:'open',height:0})),spawns:[{position:{x:10000,y:10000},team:1}],fields:[],stations:[],objects:[],regions:[],shipment:{x:32000,y:48000},required_packs:[]}}
function controller(validateMap:(bytes:Uint8Array)=>Promise<GameMap>=async bytes=>JSON.parse(new TextDecoder().decode(bytes))){
 const app={library:{loadMap:async(id:string)=>({map:map(id)})},validator:{validateMap,validateMission:async()=>({})}} as unknown as Application;
 const editor=new EditorController(app);
 Object.defineProperty(editor,'drafts',{value:new EditorDraftStore(`editor-audit-${crypto.randomUUID()}`)});
 return editor;
}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done});return {promise,resolve}}

test('object anchors respect odd and even dimensions independently',()=>{
 assert.deepEqual(editorObjectPosition({x:40,y:40},{width:1,height:1}),{x:40500,y:40500});
 assert.deepEqual(editorObjectPosition({x:40,y:40},{width:2,height:2}),{x:40000,y:40000});
 assert.deepEqual(editorObjectPosition({x:40,y:40},{width:3,height:3}),{x:40500,y:40500});
 assert.deepEqual(editorObjectPosition({x:40,y:40},{width:2,height:3}),{x:40000,y:40500});
});
test('interior region coordinates retain the accepted editor behavior',()=>{
 const expected={id:'new_zone',min:{x:20500,y:40500},max:{x:26500,y:47500}};
 assert.deepEqual(editorRegionFromCells('new_zone',{x:20,y:40},{x:25,y:46},{width:64,height:96}),expected);
 assert.deepEqual(editorRegionFromCells('new_zone',{x:25,y:46},{x:20,y:40},{width:64,height:96}),expected);
});
test('edge region maxima remain inside a rectangular map',()=>{
 const region=editorRegionFromCells('edge',{x:20,y:40},{x:63,y:95},{width:64,height:96});
 assert.deepEqual(region,{id:'edge',min:{x:20500,y:40500},max:{x:63999,y:95999}});
 const one=editorRegionFromCells('corner',{x:63,y:95},{x:63,y:95},{width:64,height:96});
 assert.ok(one.min.x<=one.max.x&&one.min.y<=one.max.y);
 assert.ok(one.max.x<64000&&one.max.y<96000);
});
test('late validation belongs to its original document',async t=>{
 const pending=deferred<GameMap>(),editor=controller(()=>pending.promise);
 t.after(()=>editor.drafts.close());await editor.fromInstalled('first');
 const validation=editor.validate();await editor.fromInstalled('second');
 pending.resolve(map('first'));await validation;
 assert.match(editor.state.get().snapshot!.map.title,/second/);
 assert.equal(editor.state.get().validation,undefined);
});
test('late save cannot replace a newly opened documents storage revision',async t=>{
 const editor=controller();t.after(()=>editor.drafts.close());await editor.fromInstalled('first');
 const first=editor.state.get().snapshot!.documentId,pending=deferred<void>(),put=editor.drafts.put.bind(editor.drafts);
 editor.drafts.put=async(document,revision)=>{if(document.documentId===first)await pending.promise;return put(document,revision)};
 const save=editor.save();await editor.fromInstalled('second');
 const before=editor.state.get();pending.resolve();await save;
 assert.equal(editor.state.get().snapshot!.documentId,before.snapshot!.documentId);
 assert.equal(editor.state.get().storedRevision,before.storedRevision);
});
test('corrupt stored drafts retain an original export route',async t=>{
 const editor=controller();t.after(()=>editor.drafts.close());await editor.fromInstalled('first');
 const id=editor.state.get().snapshot!.documentId,record=(await editor.drafts.get(id))!;
 const original=new TextEncoder().encode('{"corrupted":"preserve these exact bytes"}');
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const opening=indexedDB.open(editor.drafts.name,2);opening.onsuccess=()=>resolve(opening.result);opening.onerror=()=>reject(opening.error)});
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({...record,data:original});tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error)});db.close();
 await assert.rejects(editor.open(id),/integrity check/);
 assert.deepEqual(new Uint8Array(await(await editor.exportStoredOriginal(id)).arrayBuffer()),original);
});
