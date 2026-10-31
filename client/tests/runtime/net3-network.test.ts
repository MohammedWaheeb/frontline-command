import 'fake-indexeddb/auto';
import {create} from '@bufbuild/protobuf';
import {MatchStatusSchema} from '../../src/protocol/frontline_pb';
import test from 'node:test';
import assert from 'node:assert/strict';
import {NetworkController,parseInvite,formatInvite,networkErrorMessage,canRejoinOperation,type NetworkOptions} from '../../src/app/network-controller';
import {LocalProfileSession,LocalCredentialVault} from '../../src/runtime/account';
import {LocalStore} from '../../src/runtime/storage';
import type {Lobby,LobbyResponse} from '../../src/runtime/api';
import type {ContentLibrary} from '../../src/runtime/content-library';
import type {GameMap,RuntimeVersion} from '../../src/runtime/types';
import type {SessionController,SessionEvent} from '../../src/runtime/session';
import {FakeLocalHost,fixtureSave,inspectFixture} from './account-fixture';
const version:RuntimeVersion={adapter:'wasm',go:'test',simulation:'test',protocol:1,content_hash:'fixture'};
const map={id:'fixture-map',version:'1',spawns:[{position:{x:1000,y:1000}},{position:{x:2000,y:2000}}]} as GameMap;
const lobby:Lobby={id:'fixture-lobby',revision:1,name:'Test operation',host:'profile-1',map_id:map.id,map_hash:'fixture-hash',map_version:'1',mode:'custom',private:false,pause_enabled:true,rated:false,live_observers:false,slots:[{player:1,name:'Commander',faction:'US',team:1,color:1,profile:'profile-1',ready:false,assets_ready:false}]};
let count=0;
async function fixture(work:(value:{controller:NetworkController;host:FakeLocalHost;store:LocalStore;vault:LocalCredentialVault;state:{pauseCalls:boolean[];lobbyReads:number;aiWrites:number;opened:number;priorMatch?:string;hostOffline:boolean;missingLobby:boolean;historyAvailable:boolean;failHistory:boolean;historyReads:number;lobby:Lobby;started:boolean;completed:boolean;readyBodies:any[];joinBodies:any[];patchBodies:any[];privateDenied:boolean;startRemaining:number;joined:any[];prepares:number;mutateOnPrepare:boolean;failPrepare:boolean;remoteVersion:RuntimeVersion;chat:any[];chatAfter:number[];mapWrites:any[];mapRevision:number;invites:any[];voidReason:string};emit:(event:SessionEvent)=>void;reload:(freshTab?:boolean)=>Promise<NetworkController>})=>Promise<void>,connect=true,pollMs=3600000){
 const old=globalThis.fetch,host=new FakeLocalHost(),id=`network-controller-${++count}`,vault=new LocalCredentialVault(`${id}-auth`),store=new LocalStore(`${id}-files`,inspectFixture),state={pauseCalls:[] as boolean[],lobbyReads:0,aiWrites:0,opened:0,priorMatch:undefined as string|undefined,hostOffline:false,missingLobby:false,historyAvailable:true,failHistory:false,historyReads:0,lobby:structuredClone(lobby),started:false,completed:false,readyBodies:[] as any[],joinBodies:[] as any[],patchBodies:[] as any[],privateDenied:false,startRemaining:120000,joined:[] as any[],prepares:0,mutateOnPrepare:false,failPrepare:false,remoteVersion:{...version},chat:[] as any[],chatAfter:[] as number[],mapWrites:[] as any[],mapRevision:0,invites:[] as any[],voidReason:''};
 const response=()=>({host_offline:state.hostOffline,...(state.started?{start_remaining_ms:state.startRemaining}:{}),state:state.completed?'completed':state.started?'active':'forming',lobby:structuredClone(state.lobby),...(state.started?{connection:{match_id:'match-fixture',player:1,token:'slot-secret',protocol:1,simulation:'test',content_hash:'fixture'}}:{})});
 globalThis.fetch=(async(input:string|URL|Request,init:RequestInit={})=>{
  const path=new URL(String(input)).pathname.replace('/api/v1',''),json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}}),method=init.method??'GET';
  if(path==='/health')return json({...state.remoteVersion,status:'ok',tick_rate:20,local:true});
  if(path==='/host')return json({lan_enabled:true,join_urls:['http://192.168.1.20:8080'],message:'Share this host address.'});
  if(path==='/missions')return json([]);if(path===`/maps/${map.id}`){const response=json(map);response.headers.set('X-Frontline-Map-Hash',state.lobby.map_hash);return response};
  if(path==='/lobbies'&&method==='GET')return json([]);
  if(path==='/profiles/me'&&method==='PATCH'){const result=await host.fetch(input,init);if(result.ok){const profile=await result.clone().json();for(const slot of state.lobby.slots)if(slot.profile===profile.id)slot.name=profile.name}return result}
  if(path==='/profiles'||path==='/profiles/me'||path==='/saves'||path.startsWith('/saves/')||path==='/settings'||path==='/progress/campaign')return host.fetch(input,init);
  const token=new Headers(init.headers).get('Authorization')?.slice(7);if(!token||!host.profiles.has(token))return json({code:'authentication_required',message:'Sign in.'},401);
  if(path.startsWith('/invites/')&&path.endsWith('/accept')){const id=path.split('/')[2],invite=state.invites.find(value=>value.id===id);if(!invite)return json({code:'invite_missing',message:'Invite expired.'},404);state.lobby={...state.lobby,id:invite.lobby_id,match_id:undefined,previous_match_id:invite.previous_match_id,rematch:true} as Lobby;state.started=false;state.completed=false;state.invites=state.invites.filter(value=>value.id!==id);return json(response())}
  if(path==='/maps'&&method==='GET')return json([{id:map.id,title:'Synthetic fixture',version:'1',players:2,installed:true,ranked:false}]);
  if(path==='/maps/mine')return json(state.mapRevision?[{id:map.id,title:'Own fixture',revision:state.mapRevision,content_revision:state.mapRevision,owner:'profile-1',owner_name:'Author',published:false,removed:false}]:[]);
  if(path==='/maps'&&method==='POST'){const body=JSON.parse(String(init.body));state.mapWrites.push(body);if(body.expected_revision!==state.mapRevision)return json({code:'map_conflict',message:'Map changed.'},409);return json({id:map.id,title:'Own fixture',revision:++state.mapRevision,content_revision:state.mapRevision,owner:'profile-1',owner_name:'Author',published:false,removed:false})}
  if(path==='/history'){state.historyReads++;if(state.failHistory)return json({code:'history_unavailable',message:'Try the host again.'},503);return json(state.historyAvailable&&host.profiles.get(token)?.id==='profile-1'?[{id:'match-fixture',created:2000,void:!!state.voidReason,payload:btoa(JSON.stringify(state.voidReason?{match_id:'match-fixture',void:true,reason:state.voidReason,tick:0}:{match_id:'match-fixture',outcome:{finished:true,draw:false,winning_team:2,reason:'elimination',tick:640}}))}]:[])}if(path==='/social')return json([]);if(path==='/invites')return json({invites:state.invites});if(path==='/matchmaking')return json({status:'idle',region:'local'});
  if(path===`/lobbies/${lobby.id}`&&method==='GET')state.lobbyReads++;
  if(path.endsWith('/membership')&&method==='DELETE')return new Response(null,{status:204});
  if(path.endsWith('/ai')){state.aiWrites++;return json(response())}
  if(path.endsWith('/rematch')){state.lobby={...state.lobby,id:'rematch-lobby',match_id:undefined};state.started=false;state.completed=false;return json(response())}
  if(path===`/lobbies/${lobby.id}`&&method==='GET'&&state.privateDenied)return json({code:'private_lobby',message:'Join this private lobby with its code.'},403);
  if(path===`/lobbies/${lobby.id}`&&method==='GET'&&state.missingLobby)return json({code:'lobby_missing',message:'The lobby no longer exists.'},404);
  if(path.startsWith('/lobbies/')&&path.endsWith('/join')){state.joinBodies.push({path,...JSON.parse(String(init.body))});return json(response())}
  if(path.startsWith('/missions/')&&path.endsWith('/lobby'))return json(response());
  if(path===`/lobbies/${lobby.id}`&&method==='PATCH'){const body=JSON.parse(String(init.body));state.patchBodies.push(body);Object.assign(state.lobby.slots[0],body);state.lobby.revision++;return json(response())}
  if(path==='/lobbies'&&method==='POST'||path===`/lobbies/${lobby.id}`&&method==='GET')return json(response());
  if(path===`/lobbies/${lobby.id}/ready`){const body=JSON.parse(String(init.body));state.readyBodies.push(body);if(body.ready&&body.expected_revision!==state.lobby.revision)return json({code:'lobby_changed',message:'Lobby changed.'},409);state.lobby.slots[0].ready=body.ready;state.lobby.slots[0].assets_ready=body.assets_ready;return json(response())}
  if(path===`/lobbies/${lobby.id}/start`){state.started=true;state.lobby.match_id='match-fixture';return json(response())}
  if(path===`/lobbies/${lobby.id}/chat`){const after=Number(new URL(String(input)).searchParams.get('after')??0);state.chatAfter.push(after);return json(state.chat.filter(message=>message.id>after).slice(0,100))}
  throw new Error(`Unexpected fixture request ${method} ${path}`);
 }) as typeof fetch;
 const listeners=new Set<(event:SessionEvent)=>void>(),sessionState={phase:'menu'} as SessionController['state'];
 let transport:NetworkOptions['sessions']['transport'];
 const sessions={state:sessionState,get transport(){return transport},subscribe:(listener:(event:SessionEvent)=>void)=>{listeners.add(listener);return()=>listeners.delete(listener)},pause:async()=>{state.pauseCalls.push(true)},resume:async()=>{state.pauseCalls.push(false)}};
 const memory=new Map<string,string>(),persistent=new Map<string,string>();
 const options:NetworkOptions={library:{} as ContentLibrary,store,validator:{ready:Promise.resolve(version),inspect:inspectFixture,validateMap:async()=>map},sessions,prepareAssets:async()=>{state.prepares++;if(state.failPrepare)throw new Error('Referenced terrain unavailable');if(state.mutateOnPrepare){state.lobby.revision++;state.lobby.map_hash='new-map';state.mutateOnPrepare=false}},joinOnline:async(base,connection,loaded)=>{state.joined.push({base,connection,map:loaded});sessionState.kind='online';sessionState.phase='active';sessionState.id='session-fixture';transport={mode:'online',connection} as unknown as NetworkOptions['sessions']['transport']},notice:()=>{},onOpenLobby:async()=>{state.opened++;state.priorMatch=controller.state.get().lobby?.match_id;sessionState.kind=undefined;sessionState.phase='menu'},persistentReferences:{getItem:key=>persistent.get(key)??null,setItem:(key,value)=>{persistent.set(key,value)},removeItem:key=>{persistent.delete(key)}},makeAccount:origin=>new LocalProfileSession({baseURL:origin,credentials:vault}),references:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>{memory.set(key,value)},removeItem:key=>{memory.delete(key)}},pollMs};
 let controller=new NetworkController(options);
 try{if(connect)assert.equal(await controller.connect(host.origin),true);await work({controller,host,store,vault,state,emit:event=>{for(const listener of listeners)listener(event)},reload:async(freshTab=false)=>{controller.dispose();if(freshTab)memory.clear();sessionState.kind=undefined;sessionState.phase='menu';controller=new NetworkController(options);await controller.connect(host.origin);await controller.initialize();return controller}})}finally{controller.dispose();await store.close();await vault.close();globalThis.fetch=old}
}


test('R1-01: a new tab restores a remembered operation without an invite and waits for Rejoin',()=>fixture(async({controller,state,reload})=>{
 await controller.joinLobby(lobby.id);await controller.start();assert.equal(state.joined.length,1);
 controller=await reload(true);assert.equal(controller.state.get().lobby?.id,lobby.id);assert.equal(canRejoinOperation(controller.state.get()),true);assert.equal(state.joined.length,1);
 assert.equal(await controller.joinMatch(),true);assert.equal(state.joined.length,2);assert.equal(state.joinBodies.length,1);assert.equal(state.joinBodies[0].code,undefined);
}));
test('R1-01: same-tab reload keeps automatic recovery',()=>fixture(async({controller,state,reload})=>{
 await controller.joinLobby(lobby.id);await controller.start();controller=await reload();assert.equal(state.joined.length,2);assert.equal(controller.state.get().connection,'connected');
}));
test('R1-01: another profile cannot restore the remembered operation',()=>fixture(async({controller,state,reload})=>{
 await controller.joinLobby(lobby.id);state.started=true;state.lobby.match_id='match-fixture';
 // A different remembered account has no matching profile ID in the durable reference.
 controller.state.update(value=>({...value,lobby:undefined,lobbyState:undefined}));
 await controller.createProfile('Other commander',true);controller=await reload(true);
 assert.equal(controller.state.get().lobby,undefined);assert.equal(state.joined.length,0);assert.equal(canRejoinOperation(controller.state.get()),false);
}));
test('R1-01: session-only profiles do not retain a lobby across tab closure',()=>fixture(async({controller,state,reload})=>{
 await controller.createProfile('Session commander',false);await controller.joinLobby(lobby.id);controller=await reload(true);assert.equal(controller.state.get().lobby,undefined);assert.equal(state.joined.length,0);
}));
test('R1-02/R1-05: full-map Add AI is rejected locally with specific recovery and no HTTP write',()=>fixture(async({controller,state})=>{
 await controller.joinLobby(lobby.id);state.lobby.slots.push({...state.lobby.slots[0],profile:'guest',player:2});await controller.refresh();
 assert.equal(await controller.addAI({difficulty:'normal',faction:'IR'}),false);assert.equal(state.aiWrites,0);assert.equal(controller.state.get().error?.code,'ai_slot_unavailable');assert.match(controller.state.get().error?.message??'',/No open slot.*larger map/);assert.doesNotMatch(controller.state.get().error?.message??'',/choose another game/i);
 state.lobby.slots.pop();await controller.refresh();assert.equal(await controller.addAI({difficulty:'normal',faction:'IR'}),true);assert.equal(state.aiWrites,1);
}));
test('R1-04: creating a rematch opens its lobby after leaving the prior result',()=>fixture(async({controller,state})=>{
 await controller.joinLobby(lobby.id);await controller.start();state.completed=true;await controller.refresh();
 assert.equal(await controller.rematch(),true);assert.equal(state.opened,1);assert.equal(state.priorMatch,'match-fixture');assert.equal(controller.state.get().lobby?.id,'rematch-lobby');assert.equal(controller.state.get().lobbyState,'forming');assert.equal(controller.state.get().result,undefined);assert.match(controller.state.get().notice??'',/Rematch lobby ready/);
}));
test('R1-04: accepting an invitation from the result also opens the new lobby',()=>fixture(async({controller,state})=>{
 await controller.joinLobby(lobby.id);await controller.start();state.completed=true;await controller.refresh();state.invites=[{id:'invite',lobby_id:'rematch-lobby',rematch:true,previous_match_id:'match-fixture'}];await controller.refresh();
 assert.equal(await controller.acceptInvite('invite'),true);assert.equal(state.opened,1);assert.equal(state.priorMatch,'match-fixture');assert.equal(controller.state.get().lobby?.id,'rematch-lobby');assert.equal(controller.state.get().lobbyState,'forming');
}));
test('R1-05: terminal forming-lobby 404 stops polling and Leave skips the expired membership endpoint',()=>fixture(async({controller,state})=>{
 await controller.joinLobby(lobby.id);state.missingLobby=true;const reads=state.lobbyReads;assert.equal(await controller.refresh(),true);
 assert.equal(controller.state.get().lobbyClosed,true);assert.equal(controller.state.get().lobbyUnavailable,true);assert.equal(controller.state.get().pollError,undefined);
 await new Promise(resolve=>setTimeout(resolve,45));await controller.refresh();assert.equal(state.lobbyReads,reads+1);
 assert.equal(await controller.leaveLobby(),true);assert.equal(controller.state.get().lobby,undefined);assert.equal(controller.state.get().lobbyClosed,undefined);
},true,5));
test('R1-05: an unresolved result retries history without retrying a terminal lobby 404',()=>fixture(async({controller,state})=>{
 await controller.joinLobby(lobby.id);await controller.start();state.missingLobby=true;state.historyAvailable=false;await controller.refresh();const reads=state.lobbyReads;
 await new Promise(resolve=>setTimeout(resolve,35));assert.equal(state.lobbyReads,reads);assert.equal(controller.state.get().result,undefined);
 state.historyAvailable=true;await controller.refresh();assert.equal(state.lobbyReads,reads);assert.equal(controller.state.get().result?.committed,true);assert.equal(controller.state.get().lobbyClosed,undefined);
},true,5));
test('R1-01/R1-03: current transport statuses drive presence alerts and pause controls; old-session frames are ignored',()=>fixture(async({controller,state,emit})=>{
 state.lobby.slots.push({...state.lobby.slots[0],player:2,profile:'guest',name:'Guest'});await controller.joinLobby(lobby.id);await controller.start();
 const status=create(MatchStatusSchema,{pauseEnabled:true,teammates:[{player:1,connected:true},{player:2,connected:true}]});
 const send=(session='session-fixture')=>emit({type:'runtime',session,event:{type:'status',status:structuredClone(status)}});
 send();assert.deepEqual(controller.state.get().presenceAlerts,[]);
 status.teammates[1].connected=false;send();assert.equal(controller.state.get().presenceAlerts?.[0].text,'Commander Guest disconnected.');send();assert.equal(controller.state.get().presenceAlerts?.length,1);
 status.teammates[1].connected=true;send('old-session');assert.equal(controller.state.get().presenceAlerts?.length,1);send();assert.equal(controller.state.get().presenceAlerts?.[1].text,'Commander Guest reconnected.');
 status.pauseVotes=[2];send();assert.deepEqual(controller.state.get().status?.pauseVotes,[2]);assert.equal(await controller.pause(true),true);assert.deepEqual(state.pauseCalls,[true]);
 status.pauseVotes=[1,2];status.paused=true;send();assert.equal(controller.state.get().status?.paused,true);assert.equal(await controller.pause(false),true);assert.deepEqual(state.pauseCalls,[true,false]);
}));
