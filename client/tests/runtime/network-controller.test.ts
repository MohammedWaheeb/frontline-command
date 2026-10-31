import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {NetworkController,parseInvite,formatInvite,networkErrorMessage,type NetworkOptions} from '../../src/app/network-controller';
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
async function fixture(work:(value:{controller:NetworkController;host:FakeLocalHost;store:LocalStore;vault:LocalCredentialVault;state:{missingLobby:boolean;historyAvailable:boolean;failHistory:boolean;historyReads:number;lobby:Lobby;started:boolean;completed:boolean;readyBodies:any[];joinBodies:any[];patchBodies:any[];privateDenied:boolean;startRemaining:number;joined:any[];prepares:number;mutateOnPrepare:boolean;failPrepare:boolean;remoteVersion:RuntimeVersion;chat:any[];chatAfter:number[];mapWrites:any[];mapRevision:number;invites:any[];voidReason:string};emit:(event:SessionEvent)=>void})=>Promise<void>,connect=true,pollMs=3600000){
 const old=globalThis.fetch,host=new FakeLocalHost(),id=`network-controller-${++count}`,vault=new LocalCredentialVault(`${id}-auth`),store=new LocalStore(`${id}-files`,inspectFixture),state={missingLobby:false,historyAvailable:true,failHistory:false,historyReads:0,lobby:structuredClone(lobby),started:false,completed:false,readyBodies:[] as any[],joinBodies:[] as any[],patchBodies:[] as any[],privateDenied:false,startRemaining:120000,joined:[] as any[],prepares:0,mutateOnPrepare:false,failPrepare:false,remoteVersion:{...version},chat:[] as any[],chatAfter:[] as number[],mapWrites:[] as any[],mapRevision:0,invites:[] as any[],voidReason:''};
 const response=():LobbyResponse=>({...(state.started?{start_remaining_ms:state.startRemaining}:{}),state:state.completed?'completed':state.started?'active':'forming',lobby:structuredClone(state.lobby),...(state.started?{connection:{match_id:'match-fixture',player:1,token:'slot-secret',protocol:1,simulation:'test',content_hash:'fixture'}}:{})});
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
 const sessions={state:sessionState,transport:undefined,subscribe:(listener:(event:SessionEvent)=>void)=>{listeners.add(listener);return()=>listeners.delete(listener)},pause:async()=>{},resume:async()=>{}};
 const options:NetworkOptions={library:{} as ContentLibrary,store,validator:{ready:Promise.resolve(version),inspect:inspectFixture,validateMap:async()=>map},sessions,prepareAssets:async()=>{state.prepares++;if(state.failPrepare)throw new Error('Referenced terrain unavailable');if(state.mutateOnPrepare){state.lobby.revision++;state.lobby.map_hash='new-map';state.mutateOnPrepare=false}},joinOnline:async(base,connection,loaded)=>{state.joined.push({base,connection,map:loaded});sessionState.kind='online';sessionState.phase='active'},notice:()=>{},makeAccount:origin=>new LocalProfileSession({baseURL:origin,credentials:vault}),references:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},pollMs};
 const controller=new NetworkController(options);
 try{if(connect)assert.equal(await controller.connect(host.origin),true);await work({controller,host,store,vault,state,emit:event=>{for(const listener of listeners)listener(event)}})}finally{controller.dispose();await store.close();await vault.close();globalThis.fetch=old}
}
test('network guest can reach host without a profile; profile credentials stay out of public controller state',()=>fixture(async({controller,vault,host,store})=>{
 assert.equal(controller.state.get().connected,true);assert.equal(controller.state.get().account?.phase,'guest');assert.deepEqual(controller.state.get().maps,[]);assert.equal(await controller.createProfile('Commander',true),true);assert.deepEqual(controller.state.get().maps.map(value=>value.id),[map.id]);
 const token=(await vault.read(host.origin))!.token;assert.equal(JSON.stringify(controller.state.get()).includes(token),false);assert.equal(Object.keys(controller).includes('account'),false);
 await store.putSave('solo','Solo fixture',fixtureSave());assert.equal(await controller.logout(),true);assert.equal((await store.listSaves()).length,1);assert.equal(await vault.read(host.origin),undefined);
}));
test('ready proves matching Go version and actual asset loading; failure never sends ready flags',()=>fixture(async({controller,state})=>{
 await controller.createProfile('Commander',true);await controller.createLobby({name:'Test',map_id:map.id,mode:'custom',faction:'US'});
 state.remoteVersion={...version,content_hash:'other'};assert.equal(await controller.ready(true),false);assert.equal(controller.state.get().error?.code,'version_mismatch');assert.equal(state.prepares,0);assert.equal(state.readyBodies.length,0);
 state.remoteVersion=version;state.failPrepare=true;assert.equal(await controller.ready(true),false);assert.equal(state.readyBodies.length,0);
 state.failPrepare=false;assert.equal(await controller.ready(true),true);assert.equal(state.readyBodies[0].expected_revision,1);assert.deepEqual(Object.keys(state.readyBodies[0]).sort(),['assets_ready','content_hash','expected_revision','protocol','ready','simulation']);
}));
test('configuration mutation during assets preflight uses captured revision and requires renewed readiness',()=>fixture(async({controller,state})=>{
 await controller.createProfile('Commander',true);await controller.createLobby({name:'Test',map_id:map.id,mode:'custom',faction:'US'});state.mutateOnPrepare=true;
 assert.equal(await controller.ready(true),false);assert.equal(state.readyBodies[0].expected_revision,1);assert.equal(state.lobby.revision,2);assert.equal(state.lobby.slots[0].ready,false);assert.equal(controller.state.get().lobby?.revision,2);assert.equal(controller.state.get().error?.code,'lobby_changed');
 assert.equal(await controller.ready(true),true);assert.equal(state.readyBodies[1].expected_revision,2);
}));
test('start installs real slot connection and validated host map, while slot token never enters observable state',()=>fixture(async({controller,state})=>{
 await controller.createProfile('Commander',true);await controller.createLobby({name:'Test',map_id:map.id,mode:'custom',faction:'US'});await controller.ready(true);assert.equal(await controller.start(),true);
 assert.equal(state.joined.length,1);assert.equal(state.joined[0].connection.player,1);assert.equal(state.joined[0].connection.token,'slot-secret');assert.deepEqual(state.joined[0].map,map);assert.equal(controller.state.get().connection,'connected');assert.equal(JSON.stringify(controller.state.get()).includes('slot-secret'),false);
 assert.equal(await controller.logout(),false);assert.equal(controller.state.get().error?.code,'activity_active');
}));
test('expired profile authentication produces recoverable local sign-in without deleting saves',()=>fixture(async({controller,host,store})=>{
 await controller.createProfile('Commander',true);await store.putSave('solo','Keep this',fixtureSave());host.profiles.clear();assert.equal(await controller.refresh(),false);assert.equal(controller.state.get().account?.phase,'sign-in-required');assert.equal((await store.listSaves()).length,1);
}));
test('product sync requires explicit per-item decisions and preserves exact engine bytes through migration',()=>fixture(async({controller,host,store})=>{
 await controller.createProfile('Commander',true);const original=fixtureSave();await store.putSave('solo','Portable operation',original);await store.putSetting('settings',{volume:0.4});assert.equal(await controller.previewSync(true),true);
 const preview=controller.state.get().sync!;assert.equal(preview.mode,'migration');assert.equal(preview.entries.length,2);assert.equal(await controller.copySync([]),false);assert.equal(host.writes,0);
 assert.equal(await controller.copySync(preview.entries.map(entry=>({key:entry.key,action:'upload'}))),true);assert.equal(host.writes,2);assert.deepEqual([...host.saves.values()][0].data,original.data);assert.equal((await store.listSaves()).length,1);assert.equal(controller.state.get().syncResult?.status,'completed');
}));

test('completed lobby recovers durable result for an eliminated socket without replaying commands',()=>fixture(async({controller,state})=>{
 await controller.createProfile('Commander',true);await controller.createLobby({name:'Test',map_id:map.id,mode:'custom',faction:'US'});await controller.ready(true);await controller.start();state.completed=true;
 assert.equal(await controller.refresh(),true);assert.equal(controller.state.get().result?.committed,true);assert.equal(controller.state.get().result?.outcome?.winningTeam,2);assert.equal(controller.state.get().tick,640);assert.equal(state.joined.length,1);
}));

test('chat reads every retained page, displays new messages beyond the first 100 and removes newly filtered history',()=>fixture(async({controller,state})=>{
 await controller.createProfile('Commander',true);await controller.createLobby({name:'Test',map_id:map.id,mode:'custom',faction:'US'});
 state.chat=Array.from({length:230},(_,index)=>({id:index+1,room:lobby.id,sender:'other',name:'Other',team:0,text:`Transmission ${index+1}`,tick:0,created:index}));
 await controller.refreshChat();assert.equal(controller.state.get().chat.length,230);assert.equal(controller.state.get().chat.at(-1)?.text,'Transmission 230');assert.deepEqual(state.chatAfter,[0,100,200]);
 state.chat.push({...state.chat[0],id:231,text:'Newest transmission'});await controller.refreshChat();assert.equal(controller.state.get().chat.at(-1)?.text,'Newest transmission');
 state.chat=state.chat.filter(message=>message.id>225);await controller.refreshChat();assert.deepEqual(controller.state.get().chat.map(message=>message.id),[226,227,228,229,230,231]);
}));
test('expired profile can create a replacement identity without inheriting old lobby membership or deleting files',()=>fixture(async({controller,host,store})=>{
 await controller.createProfile('Commander',true);await controller.createLobby({name:'Test',map_id:map.id,mode:'custom',faction:'US'});await store.putSave('solo','Keep this',fixtureSave());const retired=[...host.profiles.values()][0];host.profiles.clear();host.profiles.set('revoked-token-fixture',retired);assert.equal(await controller.refresh(),false);
 assert.equal(await controller.createProfile('Replacement',true),true);assert.equal(controller.state.get().lobby,undefined);assert.equal((await store.listSaves()).length,1);
}));

test('profile replacement without a lobby clears private reports, host copies and prior notices immediately',()=>fixture(async({controller})=>{
 await controller.createProfile('First commander',false);controller.state.update(value=>({...value,reports:[{id:'private-report',match_id:'private-match',reason:'Private context',tick:1,created:1,revision:0,decision:'pending'}],notice:'Private review context'}));
 assert.equal(await controller.createProfile('Second commander',false),true);assert.deepEqual(controller.state.get().reports,[]);assert.equal(controller.state.get().notice,undefined);
}));
test('credential expiry removes report evidence from public state even without a lobby',()=>fixture(async({controller,host})=>{
 await controller.createProfile('Commander',false);controller.state.update(value=>({...value,reports:[{id:'private-report',match_id:'private-match',reason:'Private context',tick:1,created:1,revision:0,decision:'pending'}]}));host.profiles.clear();assert.equal(await controller.refresh(),false);assert.deepEqual(controller.state.get().reports,[]);
}));
test('workshop preparation never uploads implicitly; explicit private write uses reviewed revision and stale writes preserve preview',()=>fixture(async({controller,state})=>{
 await controller.createProfile('Author',false);const file=new Blob([JSON.stringify(map)],{type:'application/json'});assert.equal(await controller.prepareMapUpload(file,'original.json'),true);assert.equal(state.mapWrites.length,0);assert.equal(controller.state.get().mapUpload?.expectedRevision,0);assert.equal(await controller.uploadMap(),true);assert.equal(state.mapWrites.length,1);assert.equal(state.mapWrites[0].expected_revision,0);assert.equal(controller.state.get().mapUpload,undefined);
 assert.equal(await controller.prepareMapUpload(file,'revised.json'),true);assert.equal(controller.state.get().mapUpload?.expectedRevision,1);state.mapRevision++;assert.equal(await controller.uploadMap(),false);assert.equal(state.mapWrites.length,2);assert.equal(controller.state.get().error?.code,'map_conflict');assert.equal(controller.state.get().mapUpload?.expectedRevision,1);
 assert.equal(await controller.createProfile('Other',false),true);assert.equal(controller.state.get().mapUpload,undefined);assert.deepEqual(controller.state.get().ownMaps,[]);
}));
test('leaving an active online session stops automatic re-entry while explicit reconnect remains available',()=>fixture(async({controller,state,emit})=>{
 await controller.createProfile('Commander',true);await controller.createLobby({name:'Test',map_id:map.id,mode:'custom',faction:'US'});await controller.ready(true);await controller.start();assert.equal(state.joined.length,1);
 emit({type:'session',state:{phase:'menu'}});await controller.refresh();assert.equal(state.joined.length,1);assert.equal(await controller.joinMatch(),true);assert.equal(state.joined.length,2);
}));


test('missing retained lobby recovers only an exact durable result and never rejoins a frozen participant',()=>fixture(async({controller,state})=>{
 await controller.createProfile('Commander',true);await controller.createLobby({name:'Test',map_id:map.id,mode:'custom',faction:'US'});await controller.ready(true);await controller.start();state.missingLobby=true;
 assert.equal(await controller.refresh(),true);assert.equal(controller.state.get().result?.committed,true);assert.equal(controller.state.get().lobbyUnavailable,true);assert.equal(controller.state.get().lobbyState,'completed');assert.equal(state.joined.length,1);
 const reads=state.historyReads;assert.equal(await controller.joinMatch(),true);assert.equal(state.joined.length,1);assert.equal(state.historyReads,reads);assert.equal(await controller.leaveLobby(),true);assert.equal(controller.state.get().lobby,undefined);
}));
test('missing lobby stops lobby reads while an unresolved durable result can be retried explicitly',()=>fixture(async({controller,state})=>{
 await controller.createProfile('Commander',true);await controller.createLobby({name:'Test',map_id:map.id,mode:'custom',faction:'US'});await controller.ready(true);await controller.start();state.missingLobby=true;state.historyAvailable=false;
 assert.equal(await controller.refresh(),true);assert.equal(controller.state.get().error,undefined);assert.equal(controller.state.get().result,undefined);assert.equal(controller.state.get().lobbyUnavailable,true);assert.equal(controller.state.get().lobbyClosed,true);
 state.historyAvailable=true;state.failHistory=true;assert.equal(await controller.refresh(),false);assert.equal(controller.state.get().error?.code,'history_unavailable');assert.equal(controller.state.get().result,undefined);
 state.failHistory=false;assert.equal(await controller.refresh(),true);assert.equal(controller.state.get().result?.outcome?.tick,640);assert.equal(state.joined.length,1);
}));
test('recorded history is available without a lobby and is cleared on profile change',()=>fixture(async({controller,state})=>{
 await controller.createProfile('Commander',true);assert.equal(await controller.loadHistory(),true);assert.equal(controller.state.get().history[0]?.id,'match-fixture');assert.equal(controller.state.get().lobby,undefined);assert.equal(controller.state.get().result,undefined);
 assert.equal(await controller.archiveRecorded('unknown'),false);assert.equal(controller.state.get().error?.code,'replay_unavailable');
 assert.equal(await controller.logout(),true);assert.deepEqual(controller.state.get().history,[]);assert.equal(controller.state.get().historyLoaded,false);
 await controller.createProfile('Other commander',true);assert.equal(await controller.loadHistory(),true);assert.deepEqual(controller.state.get().history,[]);assert.equal(state.joined.length,0);
}));


test('combined invite round-trips private/public codes with whitespace, dashes and case',()=>{
 const id='abcdef0123456789abcdef01',code='012345abcdef';
 assert.deepEqual(parseInvite(formatInvite(id,code)),{id,code});assert.deepEqual(parseInvite(formatInvite(id)),{id});
 assert.deepEqual(parseInvite(' ABCD-EF01-2345-6789-ABCD-EF01 · 0123-45AB-CDEF\n'),{id,code});
 assert.throws(()=>formatInvite(id.slice(0,12),code),{code:'invite_invalid'});assert.throws(()=>formatInvite(id,'0'),{code:'invite_invalid'});
 for(const bad of ['',id.slice(1),id+'0',id+'012345abcdeZ','https://other.test/'+id])assert.throws(()=>parseInvite(bad),{code:'invite_invalid'});
});
test('first-click host creates remembered commander once and reuses its identity',()=>fixture(async({controller,vault,host})=>{
 assert.equal(await controller.createLobby({name:'Quick game',map_id:map.id,mode:'custom',faction:'US'}),true);
 const credential=await vault.read(host.origin);assert.ok(credential);assert.match(credential.profile.name,/^Commander-[A-F0-9]{4}$/);
 assert.equal(controller.state.get().commanderName,credential.profile.name);assert.equal(await controller.ensureProfile('Replacement'),true);
 assert.equal((await vault.read(host.origin))?.profile.id,credential.profile.id);assert.equal(host.profiles.size,1);
}));
test('first-click co-op host accepts a chosen commander name without advanced sign-in',()=>fixture(async({controller,vault,host,state})=>{
 state.lobby.mode='coop';assert.equal(await controller.createCoop('scenario','normal',undefined,'Co-op commander'),true);
 assert.equal((await vault.read(host.origin))?.profile.name,'Co-op commander');assert.equal(controller.state.get().lobby?.mode,'coop');
}));
test('first-click join and co-op join pass combined private code and chosen faction/team/spawn',()=>fixture(async({controller,state,host})=>{
 const id='abcdef0123456789abcdef01',code='012345abcdef';state.lobby.id=id;state.lobby.private=true;
 assert.equal(await controller.joinCoop(formatInvite(id,code),{faction:'IR',team:2,spawn:2},'Partner'),true);
 assert.deepEqual(state.joinBodies[0],{path:`/lobbies/${id}/join`,code,faction:'IR',team:2,spawn:2});
 assert.equal(controller.state.get().account?.profile?.name,'Partner');assert.equal(host.profiles.size,1);
 assert.equal(await controller.joinByCode('invalid'),false);assert.equal(controller.state.get().error?.code,'invite_invalid');assert.equal(host.profiles.size,1);
}));
test('LAN discovery is available to a guest and copy text contains host and combined invite',()=>fixture(async({controller,state})=>{
 assert.equal(controller.state.get().account?.phase,'guest');assert.equal(controller.state.get().lanEnabled,true);assert.deepEqual(controller.state.get().joinURLs,['http://192.168.1.20:8080']);
 state.lobby.id='abcdef0123456789abcdef01';await controller.createLobby({name:'Quick game',map_id:map.id,mode:'custom',faction:'US'});
 assert.equal(controller.inviteString(),formatInvite(state.lobby.id));assert.equal(controller.inviteText(),`Game host: http://192.168.1.20:8080\nInvite code: ${formatInvite(state.lobby.id)}`);
}));
test('spawn request updates roster and barrier remaining time follows server responses',()=>fixture(async({controller,state})=>{
 await controller.createLobby({name:'Quick game',map_id:map.id,mode:'custom',faction:'US'});
 assert.equal(await controller.changeSpawn(2),true);assert.deepEqual(state.patchBodies,[{spawn:2}]);assert.equal(controller.state.get().lobby?.slots[0].spawn,2);
 await controller.ready(true);await controller.start();assert.equal(controller.state.get().startRemainingMs,120000);
 state.startRemaining=43000;await controller.refresh();assert.equal(controller.state.get().startRemainingMs,43000);
 state.startRemaining=0;await controller.refresh();assert.equal(controller.state.get().startRemainingMs,0);
}));
test('public lobby own-slot removal clears stale lobby and leaves a persistent notice',()=>fixture(async({controller,state})=>{
 await controller.createLobby({name:'Quick game',map_id:map.id,mode:'custom',faction:'US'});state.lobby.slots=[];state.lobby.revision++;
 assert.equal(await controller.refresh(),true);assert.equal(controller.state.get().lobby,undefined);assert.equal(controller.state.get().removedFromLobby,true);
 assert.equal(controller.state.get().notice,'The host removed you from this lobby.');assert.equal(controller.state.get().pollError,undefined);
}));
test('private lobby kick response clears membership rather than showing an opaque poll error',()=>fixture(async({controller,state})=>{
 state.lobby.private=true;await controller.createLobby({name:'Quick game',map_id:map.id,mode:'custom',faction:'US'});state.privateDenied=true;
 assert.equal(await controller.refresh(),true);assert.equal(controller.state.get().lobby,undefined);assert.equal(controller.state.get().removedFromLobby,true);assert.equal(controller.state.get().error,undefined);
}));
test('network error mapping presents useful text while preserving unknown authored messages',()=>{
 assert.match(networkErrorMessage('lobby_missing'),/no longer exists/);assert.match(networkErrorMessage('spawn_unavailable'),/start position/);
 assert.match(networkErrorMessage('players_missing'),/did not connect/);assert.match(networkErrorMessage('version_mismatch'),/different game versions/);assert.match(networkErrorMessage('reconnect_expired'),/window has ended/);assert.equal(networkErrorMessage('custom_error','Authored message.'),'Authored message.');assert.equal(networkErrorMessage('raw_code','raw_code'),'The host could not complete that request. Try again.');
});

test('first-click Host connects to the current page origin without initialize or advanced host entry',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'location');Object.defineProperty(globalThis,'location',{value:{origin:'http://current-host.test:8088'},configurable:true});
 try{await fixture(async({controller})=>{assert.equal(controller.state.get().connected,false);assert.equal(await controller.createLobby({name:'One click',map_id:map.id,mode:'custom',faction:'US'}),true);assert.equal(controller.state.get().host,'http://current-host.test:8088');assert.equal(controller.state.get().account?.phase,'signed-in');assert.ok(controller.state.get().lobby);await controller.initialize();assert.equal(controller.state.get().error,undefined)},false)}finally{if(previous)Object.defineProperty(globalThis,'location',previous);else Reflect.deleteProperty(globalThis,'location')}
});
test('malformed first invite reports the problem without creating an unused profile',()=>fixture(async({controller,host})=>{
 assert.equal(await controller.joinByCode('not a complete code'),false);assert.equal(host.profiles.size,0);assert.equal(controller.state.get().account?.phase,'guest');assert.equal(controller.state.get().error?.message,'Enter the complete invite code shared by your host.');
}));

test('debrief polling receives a partner rematch invite without leaving the completed lobby',()=>fixture(async({controller,state})=>{
 await controller.createLobby({name:'Quick game',map_id:map.id,mode:'custom',faction:'US'});await controller.ready(true);await controller.start();state.completed=true;
 await controller.refresh();assert.equal(controller.state.get().lobbyState,'completed');
 state.invites=[{id:'rematch-invite',lobby_id:'new-lobby',lobby_name:'Rematch',sender:'partner',sender_name:'Partner',recipient:'profile-1',created:100,expires:700,accepted:false}];
 for(let attempt=0;attempt<100&&!controller.state.get().invites.length;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(controller.state.get().invites[0]?.lobby_id,'new-lobby');assert.equal(controller.state.get().lobby?.id,lobby.id);
},true,10));

test('missing-player void recovery explains the failure and clears the start countdown',()=>fixture(async({controller,state})=>{
 await controller.createLobby({name:'Quick game',map_id:map.id,mode:'custom',faction:'US'});await controller.ready(true);await controller.start();assert.equal(controller.state.get().startRemainingMs,120000);
 state.voidReason='players_missing';state.missingLobby=true;
 assert.equal(await controller.refresh(),true);assert.equal(controller.state.get().result?.void,true);assert.equal(controller.state.get().result?.outcome?.reason,'players_missing');
 assert.equal(controller.state.get().startRemainingMs,undefined);assert.equal(controller.state.get().notice,'The game could not start because some players did not connect.');
}));

test('rename updates the same commander and forming roster without replacing membership or readiness',()=>fixture(async({controller,state,host,vault})=>{
 await controller.createLobby({name:'Rename game',map_id:map.id,mode:'custom',faction:'US'});await controller.ready(true);
 const before=(await vault.read(host.origin))!,identity=controller.commandRecordIdentity();
 assert.equal(await controller.renameProfile('  New name  '),true);assert.equal(controller.state.get().commanderName,'New name');assert.equal(controller.state.get().account?.profile?.name,'New name');assert.equal(controller.state.get().lobby?.id,lobby.id);assert.equal(controller.state.get().lobby?.slots[0].name,'New name');assert.equal(controller.state.get().lobby?.slots[0].ready,true);assert.deepEqual(controller.commandRecordIdentity(),identity);assert.equal(host.profiles.size,1);assert.equal((await vault.read(host.origin))?.token,before.token);
 assert.equal(await controller.renameProfile('<invalid>'),false);assert.equal(controller.state.get().error?.code,'invalid_profile');assert.equal(controller.state.get().commanderName,'New name');assert.equal(state.lobby.slots[0].name,'New name');
}));
test('only a rematch for the current results enables one-click join and acceptance clears readiness state',()=>fixture(async({controller,state})=>{
 await controller.createLobby({name:'Result game',map_id:map.id,mode:'custom',faction:'US'});await controller.ready(true);await controller.start();state.completed=true;await controller.refresh();
 const base={lobby_name:'Rematch',sender:'partner',sender_name:'Partner',recipient:'profile-1',created:100,expires:700,accepted:false};
 state.invites=[{...base,id:'ordinary',lobby_id:'ordinary-lobby',rematch:false},{...base,id:'other-match',lobby_id:'other-lobby',rematch:true,previous_match_id:'different-match'}];await controller.refresh();assert.equal(controller.state.get().rematchInvite,undefined);assert.equal(await controller.joinRematch(),false);assert.equal(controller.state.get().error?.code,'rematch_unavailable');assert.equal(controller.state.get().lobby?.id,lobby.id);
 state.invites.push({...base,id:'correct',lobby_id:'shared-rematch',rematch:true,previous_match_id:'match-fixture'});await controller.refresh();assert.equal(controller.state.get().rematchInvite?.id,'correct');
 assert.equal(await controller.joinRematch(),true);assert.equal(controller.state.get().lobby?.id,'shared-rematch');assert.equal(controller.state.get().lobby?.rematch,true);assert.equal(controller.state.get().lobby?.previous_match_id,'match-fixture');assert.equal(controller.state.get().lobbyState,'forming');assert.equal(controller.state.get().rematchInvite,undefined);assert.equal(controller.state.get().result,undefined);assert.equal(controller.state.get().startRemainingMs,undefined);assert.equal(controller.state.get().invites.some(invite=>invite.id==='correct'),false);
}));
