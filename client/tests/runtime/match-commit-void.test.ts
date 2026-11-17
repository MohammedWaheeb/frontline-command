import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {create} from '@bufbuild/protobuf';
import {MatchResultSchema,MatchStatusSchema} from '../../src/protocol/frontline_pb';
import {NetworkController,resultDurabilityLabel,canRejoinOperation,type NetworkOptions,type NetworkState} from '../../src/app/network-controller';
import {Observable} from '../../src/app/store';
import {LocalProfileSession,LocalCredentialVault} from '../../src/runtime/account';
import {LocalStore} from '../../src/runtime/storage';
import type {Lobby} from '../../src/runtime/api';
import type {ContentLibrary} from '../../src/runtime/content-library';
import type {GameMap,RuntimeVersion} from '../../src/runtime/types';
import type {SessionController,SessionEvent} from '../../src/runtime/session';
import {LobbyScreen} from '../../src/ui/network/LobbyScreen';
import {NetworkMatchPanel} from '../../src/ui/network/MatchPanel';
import {FakeLocalHost,inspectFixture} from './account-fixture';
const version:RuntimeVersion={adapter:'wasm',go:'test',simulation:'test',protocol:1,content_hash:'fixture'};
const map={id:'fixture-map',version:'1',spawns:[{position:{x:1000,y:1000}},{position:{x:2000,y:2000}}]} as GameMap;
const lobby:Lobby={id:'fixture-lobby',revision:1,name:'Test operation',host:'profile-1',map_id:map.id,map_hash:'fixture-hash',map_version:'1',mode:'custom',private:false,pause_enabled:true,rated:false,live_observers:false,slots:[{player:1,name:'Commander',faction:'US',team:1,color:1,profile:'profile-1',ready:false,assets_ready:false}]};
const voidResult=()=>create(MatchResultSchema,{matchId:'match-fixture',committed:false,void:true,outcome:{finished:true,draw:false,winningTeam:1,reason:'result_commit_failed',tick:640}});
let count=0;
// Host fixture (same shape as the other network fixtures): a lobby that can be
// flipped to completed while /history has no durable entry, modelling a match
// whose result commit failed so its void exists only in the live actor cache.
async function fixture(work:(value:{controller:NetworkController;state:{historyAvailable:boolean;failHistory:boolean;failJoin:number;lobby:Lobby;started:boolean;completed:boolean;joined:any[]};closeTransport:(reason:'player_eliminated'|'reconnect_expired')=>void;emit:(event:SessionEvent)=>void;reload:(freshTab?:boolean)=>Promise<NetworkController>})=>Promise<void>){
 const old=globalThis.fetch,host=new FakeLocalHost(),id=`match-commit-void-${++count}`,vault=new LocalCredentialVault(`${id}-auth`),store=new LocalStore(`${id}-files`,inspectFixture),state={historyAvailable:true,failHistory:false,failJoin:0,lobby:structuredClone(lobby),started:false,completed:false,joined:[] as any[]};
 const response=()=>({state:state.completed?'completed':state.started?'active':'forming',lobby:structuredClone(state.lobby),...(state.started?{connection:{match_id:'match-fixture',player:1,token:'slot-secret',protocol:1,simulation:'test',content_hash:'fixture'}}:{})});
 globalThis.fetch=(async(input:string|URL|Request,init:RequestInit={})=>{
  const path=new URL(String(input)).pathname.replace('/api/v1',''),json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}}),method=init.method??'GET';
  if(path==='/health')return json({...version,status:'ok',tick_rate:20,local:true});
  if(path==='/host')return json({lan_enabled:true,join_urls:['http://192.168.1.20:8080'],message:'Share this host address.'});
  if(path==='/missions')return json([]);
  if(path===`/maps/${map.id}`){const value=json(map);value.headers.set('X-Frontline-Map-Hash',state.lobby.map_hash);return value}
  if(path==='/lobbies'&&method==='GET')return json([]);
  if(path==='/profiles'||path==='/profiles/me'||path==='/saves'||path.startsWith('/saves/')||path==='/settings'||path==='/progress/campaign')return host.fetch(input,init);
  const token=new Headers(init.headers).get('Authorization')?.slice(7);if(!token||!host.profiles.has(token))return json({code:'authentication_required',message:'Sign in.'},401);
  if(path==='/maps'&&method==='GET')return json([{id:map.id,title:'Synthetic fixture',version:'1',players:2,installed:true,ranked:false}]);
  if(path==='/maps/mine')return json([]);
  if(path==='/history'){if(state.failHistory)return json({code:'history_unavailable',message:'Try the host again.'},503);return json(state.historyAvailable?[{id:'match-fixture',created:2000,void:false,payload:btoa(JSON.stringify({match_id:'match-fixture',outcome:{finished:true,draw:false,winning_team:1,reason:'elimination',tick:640}}))}]:[])}
  if(path==='/social')return json([]);if(path==='/invites')return json({invites:[]});if(path==='/matchmaking')return json({status:'idle',region:'local'});
  if(path.startsWith('/lobbies/')&&path.endsWith('/join'))return json(response());
  if(path==='/lobbies'&&method==='POST'||path===`/lobbies/${lobby.id}`&&method==='GET')return json(response());
  if(path===`/lobbies/${lobby.id}/start`){state.started=true;state.lobby.match_id='match-fixture';return json(response())}
  if(path===`/lobbies/${lobby.id}/chat`)return json([]);
  throw new Error(`Unexpected fixture request ${method} ${path}`);
 }) as typeof fetch;
 const listeners=new Set<(event:SessionEvent)=>void>(),sessionState={phase:'menu'} as SessionController['state'];
 let transport:NetworkOptions['sessions']['transport'];
 const sessions={state:sessionState,get transport(){return transport},subscribe:(listener:(event:SessionEvent)=>void)=>{listeners.add(listener);return()=>listeners.delete(listener)},pause:async()=>{},resume:async()=>{}};
 const memory=new Map<string,string>(),persistent=new Map<string,string>(),refs=(data:Map<string,string>)=>({getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value)},removeItem:(key:string)=>{data.delete(key)}});
 const options:NetworkOptions={library:{} as ContentLibrary,store,validator:{ready:Promise.resolve(version),inspect:inspectFixture,validateMap:async()=>map},sessions,prepareAssets:async()=>{},joinOnline:async(base,connection,loaded)=>{if(state.failJoin>0){state.failJoin--;throw new Error('transient join failure')}state.joined.push({base,connection,map:loaded});sessionState.kind='online';sessionState.phase='active';sessionState.id='session-fixture';transport={mode:'online',connection} as unknown as NetworkOptions['sessions']['transport']},notice:()=>{},makeAccount:origin=>new LocalProfileSession({baseURL:origin,credentials:vault}),references:refs(memory),persistentReferences:refs(persistent),pollMs:3600000};
 let controller=new NetworkController(options);
 try{assert.equal(await controller.connect(host.origin),true);await work({controller,state,closeTransport:reason=>{if(transport)Object.assign(transport,{terminalReason:reason});for(const listener of listeners)listener({type:'runtime',session:'session-fixture',event:{type:'connection',phase:'closed'}})},emit:event=>{for(const listener of listeners)listener(event)},reload:async(freshTab=false)=>{controller.dispose();if(freshTab)memory.clear();sessionState.kind=undefined;sessionState.phase='menu';controller=new NetworkController(options);await controller.connect(host.origin);await controller.initialize();return controller}})}finally{controller.dispose();await store.close();await vault.close();globalThis.fetch=old}
}

test('same-tab restore during retention connects so the actor redelivers the cached void',()=>fixture(async({controller,state,emit,reload})=>{
 await controller.joinLobby(lobby.id);await controller.start();assert.equal(state.joined.length,1);
 state.completed=true;state.historyAvailable=false;
 controller=await reload();assert.equal(controller.state.get().lobbyState,'completed');assert.equal(state.joined.length,2,'restore must connect when no durable history entry exists');assert.equal(controller.state.get().result,undefined);
 emit({type:'runtime',session:'session-fixture',event:{type:'result',result:voidResult()}});
 assert.equal(controller.state.get().result?.void,true);assert.equal(controller.state.get().result?.committed,false);assert.equal(controller.state.get().result?.outcome?.reason,'result_commit_failed');
 await controller.refresh();assert.equal(state.joined.length,2,'a known void result must not trigger repeated connections');
}));
test('fresh-tab restore during retention also reaches the cached void',()=>fixture(async({controller,state,emit,reload})=>{
 await controller.joinLobby(lobby.id);await controller.start();assert.equal(state.joined.length,1);
 state.completed=true;state.historyAvailable=false;
 controller=await reload(true);assert.equal(controller.state.get().lobbyState,'completed');assert.equal(state.joined.length,2,'completed-history gap must connect even without same-tab auto-join');
 emit({type:'runtime',session:'session-fixture',event:{type:'result',result:voidResult()}});
 assert.equal(controller.state.get().result?.void,true);assert.equal(controller.state.get().result?.outcome?.reason,'result_commit_failed');
}));
test('restore still connects for the cached void when the history read itself fails',()=>fixture(async({controller,state,emit,reload})=>{
 await controller.joinLobby(lobby.id);await controller.start();assert.equal(state.joined.length,1);
 state.completed=true;state.failHistory=true;
 controller=await reload();assert.equal(state.joined.length,2,'a failed history read must not block cached-terminal recovery');
 emit({type:'runtime',session:'session-fixture',event:{type:'result',result:voidResult()}});
 assert.equal(controller.state.get().result?.void,true);
}));
test('a failed first recovery connection is retried on the next refresh',()=>fixture(async({controller,state,emit,reload})=>{
 await controller.joinLobby(lobby.id);await controller.start();assert.equal(state.joined.length,1);
 state.completed=true;state.historyAvailable=false;state.failJoin=1;
 controller=await reload();assert.equal(state.joined.length,1,'the first recovery connection failed');
 await controller.refresh();assert.equal(state.joined.length,2,'recovery must retry after a transient failure');
 emit({type:'runtime',session:'session-fixture',event:{type:'result',result:voidResult()}});
 assert.equal(controller.state.get().result?.void,true);
}));
test('completed restore with a durable history entry recovers it without connecting',()=>fixture(async({controller,state,reload})=>{
 await controller.joinLobby(lobby.id);await controller.start();assert.equal(state.joined.length,1);
 state.completed=true;
 controller=await reload(true);assert.equal(controller.state.get().result?.committed,true);assert.equal(controller.state.get().result?.outcome?.reason,'elimination');assert.equal(state.joined.length,1,'a recovered durable result must never reconnect to the finished match');
}));

test('void is final in the result durability labels',()=>{
 const pending=create(MatchResultSchema,{matchId:'match-fixture',committed:false,void:false,outcome:{finished:true,draw:false,winningTeam:1,reason:'elimination',tick:640}}),committed=create(MatchResultSchema,{...pending,committed:true});
 assert.equal(resultDurabilityLabel(pending,'Waiting for the host to confirm','No result was saved'),'Waiting for the host to confirm');
 assert.equal(resultDurabilityLabel(voidResult(),'Waiting for the host to confirm','No result was saved'),'No result was saved');
 assert.equal(resultDurabilityLabel(committed,'Waiting for the host to confirm','No result was saved'),'');
 assert.equal(resultDurabilityLabel(undefined,'Waiting for the host to confirm','No result was saved'),'');
});
test('lobby and match panels never present a void result as awaiting confirmation',()=>{
 const slot={player:1,name:'Alex',profile:'self',faction:'US',team:1,color:1,ready:true,assets_ready:true},peer={...slot,player:2,name:'Blake',profile:'other',team:2};
 const state=()=>({host:'http://127.0.0.1:8080',connected:true,joinURLs:[],connection:'connected',tick:640,account:{phase:'signed-in',profile:{id:'self',name:'Alex'}},lobby:{id:'lobby',name:'Voided operation',revision:1,host:'self',match_id:'match-fixture',mode:'custom',map_id:'copper-junction',private:false,pause_enabled:true,rated:false,live_observers:false,slots:[slot,peer]},lobbyState:'completed',status:create(MatchStatusSchema,{pauseEnabled:true,teammates:[{player:1,connected:true},{player:2,connected:true}]}),result:voidResult(),maps:[{id:'copper-junction',title:'Copper Junction',players:2}],invites:[],chat:[],ownMaps:[],mapReports:[],missions:[],lobbies:[],history:[],relations:[],saves:[],reports:[],rankedMaps:[]} as unknown as NetworkState);
 const value=state(),controller={state:new Observable(value),inviteString:()=>'fixture-invite',inviteText:()=>'fixture-invite'} as unknown as NetworkController;
 const lobbyHTML=renderToStaticMarkup(createElement(LobbyScreen,{controller,state:value,palette:'standard' as never}));
 assert.match(lobbyHTML,/Operation voided/);assert.match(lobbyHTML,/No result was saved/);assert.doesNotMatch(lobbyHTML,/Waiting for the host to confirm/);
 const panelHTML=renderToStaticMarkup(createElement(NetworkMatchPanel,{controller}));
 assert.match(panelHTML,/Voided operation/);assert.match(panelHTML,/no result was saved/);assert.doesNotMatch(panelHTML,/waiting for durable host confirmation/);
 value.result=create(MatchResultSchema,{matchId:'match-fixture',committed:false,void:false,outcome:{finished:true,draw:false,winningTeam:1,reason:'elimination',tick:640}});
 assert.match(renderToStaticMarkup(createElement(NetworkMatchPanel,{controller})),/waiting for durable host confirmation/,'a non-void uncommitted result still reads as pending');
});


test('a cached final void stops failed durable-history recovery and permits changing profile',()=>fixture(async({controller,state,emit})=>{
 await controller.joinLobby(lobby.id);await controller.start();
 state.completed=true;state.historyAvailable=false;await controller.refresh();
 emit({type:'runtime',session:'session-fixture',event:{type:'result',result:voidResult()}});
 state.failHistory=true;
 assert.equal(await controller.refresh(),true,'a final cached void no longer depends on durable history');
 assert.equal(controller.state.get().pollError,undefined);
 assert.equal(await controller.joinMatch(),true);assert.equal(state.joined.length,1,'a final void must not reconnect again');
 assert.equal(await controller.createProfile('Next commander',false),true,'a finished void must not trap the old profile as active');
 assert.equal(controller.state.get().account?.profile?.name,'Next commander');
}));

test('a final void cannot offer Rejoin even while the last lobby poll still says active',()=>{
 const value={lobby:{...lobby,match_id:'match-fixture'},lobbyState:'active',lobbyUnavailable:false,account:{profile:{id:'profile-1'}},result:voidResult()} as NetworkState;
 assert.equal(canRejoinOperation(value),false);
 value.result=create(MatchResultSchema,{matchId:'match-fixture',committed:false,void:false});
 assert.equal(canRejoinOperation(value),true,'a pending commit may still need its actor connection');
});


test('an already-open eliminated commander stays frozen while live and reconnects once for the completed cached void',()=>fixture(async({controller,state,closeTransport,emit})=>{
 await controller.joinLobby(lobby.id);await controller.start();assert.equal(state.joined.length,1);
 closeTransport('player_eliminated');assert.equal(controller.state.get().eliminated,true);assert.equal(controller.state.get().connection,'closed');
 await controller.refresh();assert.equal(state.joined.length,1,'an eliminated commander cannot reopen live fogged play');
 state.completed=true;state.historyAvailable=false;await controller.refresh();assert.equal(state.joined.length,2,'the closed same-match transport must be replaced to receive the final cached result');
 await controller.refresh();await controller.refresh();assert.equal(state.joined.length,2,'completed lobby polls cannot repeatedly replace a recovered connection');
 emit({type:'runtime',session:'session-fixture',event:{type:'result',result:voidResult()}});assert.equal(controller.state.get().result?.void,true);
 await controller.refresh();assert.equal(state.joined.length,2);
}));

test('a closed expired transport can upgrade its pending uncommitted result to the completed cached void',()=>fixture(async({controller,state,closeTransport,emit})=>{
 await controller.joinLobby(lobby.id);await controller.start();
 emit({type:'runtime',session:'session-fixture',event:{type:'result',result:create(MatchResultSchema,{...voidResult(),void:false})}});
 closeTransport('reconnect_expired');state.completed=true;state.historyAvailable=false;await controller.refresh();assert.equal(state.joined.length,2);
 emit({type:'runtime',session:'session-fixture',event:{type:'result',result:voidResult()}});assert.equal(controller.state.get().result?.void,true);
}));

test('a healthy same-match connection waits for its final result without replacement',()=>fixture(async({controller,state})=>{
 await controller.joinLobby(lobby.id);await controller.start();state.completed=true;state.historyAvailable=false;
 await controller.refresh();await controller.refresh();assert.equal(state.joined.length,1);
}));
