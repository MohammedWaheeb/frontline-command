import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {create,toBinary,fromBinary} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {CatalogIndex} from '../../src/content/catalog';
import {ownedBoardingReceivers} from '../../src/app/transport-presentation';
const repo=path.resolve('..');
const catalog=new CatalogIndex(JSON.parse(readFileSync(path.join(repo,'pkg/content/rules.json'),'utf8')));
const base=create(PlayerSnapshotSchema,{player:1,tick:100,entities:[
 {id:1,type:'US.rifle',owner:1,state:'board',enabled:true,complete:true,health:1000,channelUntil:130,private:{orders:[{kind:'board',target:10}]}},
 {id:2,type:'US.rifle',owner:1,state:'board',enabled:true,complete:true,health:1000,channelUntil:130,private:{orders:[{kind:'board',target:10}]}},
 {id:10,type:'US.airlift',owner:1,state:'idle',enabled:true,complete:true,health:1000},
 {id:11,type:'US.airlift',owner:1,state:'idle',enabled:true,complete:true,health:1000,position:{x:1,y:1}},
 {id:12,type:'US.apc',owner:2,state:'idle',enabled:true,complete:true,health:1000},
 {id:13,type:'map.garrison',owner:0,state:'idle',enabled:true,complete:true,health:1000}
]});

function check(name:string,change:(s:typeof base)=>void,expected:number[]){
 test(name,()=>{
 const snapshot=fromBinary(PlayerSnapshotSchema,toBinary(PlayerSnapshotSchema,base));change(snapshot);
 const before=toBinary(PlayerSnapshotSchema,snapshot),result=ownedBoardingReceivers(snapshot,catalog);
 assert.deepEqual(result,expected,name);assert.deepEqual(toBinary(PlayerSnapshotSchema,snapshot),before,name+' mutated input');
 assert.deepEqual(ownedBoardingReceivers(fromBinary(PlayerSnapshotSchema,before),catalog),result,name+' wire replay');
 });
}
check('two boarders deduplicate exact explicit receiver',()=>{},[10]);
check('one interrupted boarder does not hide the remaining boarder',s=>{s.entities[0].state='idle'},[10]);
check('all interrupted boarders immediately clear doors',s=>{s.entities[0].state=s.entities[1].state='idle'},[]);
check('completion or expired channel does not linger',s=>{s.entities[0].channelUntil=s.entities[1].channelUntil=100},[]);
check('moving approach orders alone do not open doors',s=>{s.entities[0].state=s.entities[1].state='moving'},[]);
check('missing receiver remains unknown despite nearby airlift',s=>{s.entities=s.entities.filter(e=>e.id!==10)},[]);
check('foreign receiver is not inferred or opened',s=>{s.entities[0].private!.orders[0].target=s.entities[1].private!.orders[0].target=12},[]);
check('foreign passenger with artificial private data is ignored',s=>{s.entities[0].owner=s.entities[1].owner=2},[]);
check('no private order means unknown even with public board state',s=>{s.entities[0].private=s.entities[1].private=undefined},[]);
check('queued target does not replace active head order',s=>{for(const e of s.entities.slice(0,2))e.private!.orders.unshift({$typeName:'frontline.v1.Order',kind:'move',entities:[],target:0,type:'',queued:false,index:0,points:[]})},[]);
check('destroyed receiver closes independently of old order',s=>{s.entities[2].state='destroyed';s.entities[2].health=0},[]);
check('disabled receiver closes independently of old order',s=>{s.entities[2].enabled=false},[]);
check('neutral garrison requires exact disclosed target',s=>{s.entities[0].private!.orders[0].target=s.entities[1].private!.orders[0].target=13},[13]);
check('multiple receivers sorted independent of snapshot order',s=>{s.entities[1].private!.orders[0].target=11;s.entities.reverse()},[10,11]);
check('reconnect/replay snapshot without active boarders clears context',s=>{s.entities=s.entities.filter(e=>e.id>2)},[]);
