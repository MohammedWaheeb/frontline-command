import {Observable} from './store';
import {create} from '@bufbuild/protobuf';
import {MatchResultSchema} from '../protocol/frontline_pb';
import {LocalAPI,type Lobby,type LobbyAI,type LobbyChanges,type LobbyConfig,type LobbyInvite,type LobbyResponse,type LobbySlot,type LocalReport,type QueueResponse,type RankedMap,type SaveSummary,type SocialAction,type SocialRelation} from '../runtime/api';
import {LocalProfileSession,type AccountState} from '../runtime/account';
import {SaveSynchronizer,type SaveMapping,type SaveSyncPreview,type SyncDecision,type SyncExecution} from '../runtime/save-sync';
import {RuntimeError} from '../runtime/errors';
import {randomUUID} from '../runtime/crypto';
import type {ContentLibrary} from '../runtime/content-library';
import type {LocalStore} from '../runtime/storage';
import type {OfflineTransport} from '../runtime/offline';
import type {SessionController,SessionEvent} from '../runtime/session';
import type {MatchConnection} from '../runtime/online';
import {ObserverTransport,type ObserverConnection,type ObserverGrant} from '../runtime/observer';
import type {ConnectionPhase,Difficulty,Faction,GameMap,MatchResult,MatchStatus,RuntimeVersion} from '../runtime/types';

export interface NetworkChat{id:number;room:string;sender:string;name:string;team:number;text:string;tick:number;created:number}
export interface NetworkState{
 host:string;connected:boolean;hostLatency?:number;account?:AccountState;busy?:string;error?:{code:string;message:string};pollError?:string;
 maps:Awaited<ReturnType<LocalAPI['listMaps']>>;missions:Awaited<ReturnType<LocalAPI['listMissions']>>;lobbies:Lobby[];
 lobby?:Lobby;lobbyState?:LobbyResponse['state'];joinCode?:string;chat:NetworkChat[];
 relations:SocialRelation[];invites:LobbyInvite[];saves:SaveSummary[];reports:LocalReport[];
 queue?:QueueResponse;rankedMaps:RankedMap[];rankedMessage?:string;
 connection:ConnectionPhase;remainingMs?:number;latency?:number;tick:number;status?:MatchStatus;result?:MatchResult;
 eliminated?:boolean;observer?:{matchID:string;player:number;delayTicks:number;buffering:boolean;error?:string};
 sync?:SaveSyncPreview;syncResult?:SyncExecution;syncProgress?:string;notice?:string;
}
export interface NetworkOptions{
 library:ContentLibrary;store:LocalStore;validator:Pick<OfflineTransport,'ready'|'validateMap'|'inspect'>;
 sessions:Pick<SessionController,'subscribe'|'state'|'transport'|'pause'|'resume'>;
 joinOnline:(baseURL:string,connection:MatchConnection,map:GameMap)=>Promise<void>;
 joinObserver?:(baseURL:string,connection:ObserverConnection,map:GameMap)=>Promise<void>;
 prepareAssets:(map:GameMap,slots:readonly LobbySlot[])=>Promise<void>;
 notice:(message:string)=>void;onSettingsDownloaded?:()=>void|Promise<void>;
 /** Test seams do not expose credentials through observable state. */
 makeAccount?:(origin:string)=>LocalProfileSession;makePublicAPI?:(origin:string)=>LocalAPI;references?:Pick<Storage,'getItem'|'setItem'|'removeItem'>;pollMs?:number;
}
const referenceKey='frontline-command:network-lobby';
const publicError=(error:unknown)=>{const value=RuntimeError.from(error);return {code:value.code,message:value.message}};
const encoder=new TextEncoder();
function origin(value:string){const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new RuntimeError('host_address','Enter an HTTP or HTTPS game host without embedded credentials.');return url.origin}

/** Product orchestration only. Go owns admission, teams, visibility, simulation and results. */
export class NetworkController{
 readonly state:Observable<NetworkState>;
 #account?:LocalProfileSession;#connection?:MatchConnection;#sync?:SaveSynchronizer;
 private accountUnsubscribe?:()=>void;private sessionUnsubscribe:()=>void;private timer?:ReturnType<typeof setInterval>;
 private references?:NetworkOptions['references'];private polling=false;private chatEpoch=0;private disposed=false;private initialized=false;private epoch=0;
 private autoJoin=false;private joining=false;private joinedMatch?:string;private syncAbort?:AbortController;private mapCache?:{key:string;map:GameMap};
 constructor(private readonly options:NetworkOptions){
  this.references=options.references;try{this.references??=globalThis.sessionStorage}catch{}
  const host=globalThis.location?.origin??'http://127.0.0.1:8080';
  this.state=new Observable<NetworkState>({host,connected:false,maps:[],missions:[],lobbies:[],chat:[],relations:[],invites:[],saves:[],reports:[],rankedMaps:[],connection:'idle',tick:0});
  this.sessionUnsubscribe=options.sessions.subscribe(event=>this.sessionEvent(event));
 }
 private patch(change:Partial<NetworkState>){if(!this.disposed)this.state.update(value=>({...value,...change}))}
 dismissError(){this.patch({error:undefined})}
 private inform(message:string){this.patch({notice:message});this.options.notice(message)}
 private async run(label:string,operation:()=>Promise<void>):Promise<boolean>{
  if(this.disposed)return false;if(this.state.get().busy){this.patch({error:{code:'network_busy',message:'Wait for the current host operation to finish.'}});return false}
  this.patch({busy:label,error:undefined});try{await operation();return true}catch(error){this.patch({error:publicError(error)});return false}finally{this.patch({busy:undefined})}
 }
 private account(){if(!this.#account)throw new RuntimeError('host_required','Connect to a game host first.');return this.#account}
 private authenticated<T>(operation:(api:LocalAPI)=>Promise<T>){return this.account().authenticated(operation)}
 private lobby(){const lobby=this.state.get().lobby;if(!lobby)throw new RuntimeError('lobby_required','Join a lobby first.');return lobby}
 private publicAPI(host=this.state.get().host){return this.options.makePublicAPI?.(host)??new LocalAPI(host)}
 private remember(lobby?:Lobby){try{if(lobby)this.references?.setItem(referenceKey,JSON.stringify({host:this.state.get().host,profile:this.#account?.context?.profileId,id:lobby.id}));else this.references?.removeItem(referenceKey)}catch{/* Browser persistence is optional; explicit lobby ID remains usable. */}}
 private privateActivity(){const s=this.state.get();return !!this.#account?.context&&(!!s.lobby&&s.lobbyState!=='completed'||s.queue?.status==='searching')||this.options.sessions.state.kind==='online'&&!s.result?.committed}
 private reconcileProfile(){const lobby=this.state.get().lobby;if(lobby&&!lobby.slots.some(slot=>slot.profile===this.#account?.context?.profileId)){this.#connection=undefined;this.autoJoin=false;this.remember();this.patch({lobby:undefined,lobbyState:undefined,joinCode:undefined,chat:[],status:undefined,queue:undefined,result:undefined,sync:undefined,syncResult:undefined})}}
 async initialize(){if(this.initialized)return;this.initialized=true;await this.connect(this.state.get().host)}
 async connect(address:string){return this.run('Connecting to host…',async()=>{
  if(this.privateActivity())throw new RuntimeError('activity_active','Leave the forming lobby or finish the active match before changing hosts.');
  const host=origin(address),api=this.publicAPI(host),started=performance.now();await api.health();const hostLatency=Math.round(performance.now()-started);
  const [maps,missions]=await Promise.all([api.listMaps(),api.listMissions()]);
  this.accountUnsubscribe?.();const epoch=++this.epoch;const account=this.options.makeAccount?.(host)??new LocalProfileSession({baseURL:host});this.#account=account;this.#connection=undefined;this.#sync=new SaveSynchronizer(account,this.options.store,data=>this.options.validator.inspect(data));
  this.accountUnsubscribe=account.subscribe(value=>{if(epoch===this.epoch)this.patch({account:value,...(value.phase==='sign-in-required'?{error:value.error}: {})})});
  this.patch({host,connected:true,hostLatency,maps,missions,lobbies:[],lobby:undefined,lobbyState:undefined,joinCode:undefined,chat:[],relations:[],invites:[],saves:[],reports:[],account:account.state,sync:undefined,syncResult:undefined,queue:undefined,connection:'idle',status:undefined,result:undefined,tick:0});
  await account.restore();await this.refreshData();
  if(account.context)try{const raw=this.references?.getItem(referenceKey);const ref=raw?JSON.parse(raw):undefined;if(ref?.host===host&&ref.profile===account.context.profileId&&typeof ref.id==='string')await this.accept(await account.authenticated(api=>api.lobby(ref.id)),false)}catch{/* An expired lobby reference does not prevent local play or account use. */}
  if(!this.timer)this.timer=setInterval(()=>void this.poll(),this.options.pollMs??2000);
 })}
 createProfile(name:string,remember:boolean){return this.run('Creating local profile…',async()=>{if(this.privateActivity())throw new RuntimeError('activity_active','Leave the lobby before changing profiles.');await this.account().create(name,{remember});this.reconcileProfile();await this.refreshData()})}
 restoreProfile(token:string,remember:boolean){return this.run('Restoring local profile…',async()=>{if(this.privateActivity())throw new RuntimeError('activity_active','Leave the lobby before changing profiles.');await this.account().restoreToken(token,{remember});this.reconcileProfile();await this.refreshData()})}
 logout(){return this.run('Signing out…',async()=>{if(this.privateActivity())throw new RuntimeError('activity_active','Leave the forming lobby or finish the match before signing out.');this.syncAbort?.abort();await this.account().logout();this.remember();this.#connection=undefined;this.patch({lobby:undefined,lobbyState:undefined,chat:[],relations:[],invites:[],saves:[],reports:[],sync:undefined,syncResult:undefined,queue:undefined});this.inform('Signed out of this host. Local saves and campaign progress remain available.')})}
 refresh(){return this.run('Refreshing host…',async()=>{await this.refreshData();const lobby=this.state.get().lobby;if(lobby)await this.accept(await this.authenticated(api=>api.lobby(lobby.id)),this.autoJoin)})}
 private async refreshData(){
  const account=this.#account,epoch=this.epoch;if(!account)return;
  if(!account.context){this.patch({lobbies:[]});return}
  const [lobbies,relations,inbox,saves,queue]=await Promise.all([account.authenticated(api=>api.listLobbies()),account.authenticated(api=>api.social()),account.authenticated(api=>api.lobbyInvites()),account.authenticated(api=>api.listSaves()),account.authenticated(api=>api.rankedQueue())]);
  if(epoch!==this.epoch)return;this.patch({lobbies,relations,invites:inbox.invites,saves,queue,pollError:undefined});
  const queuedLobby=queue.lobby_id;if(queue.status==='matched'&&queuedLobby&&!this.state.get().lobby)await this.accept(await account.authenticated(api=>api.lobby(queuedLobby)),true);
 }
 private async poll(){
  if(this.disposed||this.polling||this.state.get().busy||!this.#account?.context)return;this.polling=true;const epoch=this.epoch;
  try{
   const lobby=this.state.get().lobby;if(lobby){await this.accept(await this.authenticated(api=>api.lobby(lobby.id)),this.autoJoin);if(this.options.sessions.state.kind!=='observer')await this.refreshChat()}else await this.refreshData();
   if(epoch===this.epoch)this.patch({pollError:undefined});
  }catch(error){if(epoch===this.epoch)this.patch({pollError:publicError(error).message})}finally{this.polling=false}
 }
 private async accept(response:LobbyResponse,autoJoin:boolean){
  const current=this.state.get().lobby;if(current?.id===response.lobby.id&&current.revision>response.lobby.revision)return;
  const changed=this.state.get().lobby?.id!==response.lobby.id;this.#connection=response.connection;this.autoJoin=autoJoin;
  this.patch({lobby:response.lobby,lobbyState:response.state??(response.lobby.match_id?'active':'forming'),joinCode:response.code??(changed?undefined:this.state.get().joinCode),...(changed?{chat:[],result:undefined,status:undefined,tick:0,connection:'idle' as const,eliminated:undefined}: {})});this.remember(response.lobby);
  if(response.state==='completed'&&this.options.sessions.state.kind!=='observer'&&!this.state.get().result?.committed)await this.recoverResult(response.lobby);
  if(response.connection&&autoJoin&&response.state!=='completed'&&this.joinedMatch!==response.connection.match_id&&!this.joining)await this.enterMatch();
 }
 private async recoverResult(lobby:Lobby){
  const record=(await this.authenticated(api=>api.history())).find(value=>value.id===lobby.match_id);if(!record||this.state.get().lobby?.id!==lobby.id)return;
  let value:any;try{value=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(record.payload),character=>character.charCodeAt(0))))}catch{throw new RuntimeError('result_invalid','The host result could not be read. Its original record remains on the host.')}
  if(value.match_id!==lobby.match_id)throw new RuntimeError('result_invalid','The host returned a different match result.');
  const outcome=value.outcome??(record.void?{finished:true,draw:true,winning_team:0,reason:value.reason??'void',tick:value.tick}:undefined);
  if(!outcome?.finished||!Number.isSafeInteger(outcome.tick)||outcome.tick<0||!Number.isInteger(outcome.winning_team)||outcome.winning_team<0||outcome.winning_team>4||typeof outcome.reason!=='string')throw new RuntimeError('result_invalid','The host result has incomplete outcome metadata.');
  this.patch({result:create(MatchResultSchema,{matchId:record.id,committed:true,void:record.void,outcome:{finished:true,draw:!!outcome.draw,winningTeam:outcome.winning_team,reason:outcome.reason,tick:outcome.tick}}),tick:outcome.tick});
 }
 createLobby(config:LobbyConfig){return this.run('Creating lobby…',async()=>this.accept(await this.authenticated(api=>api.createLobby(config)),true))}
 joinLobby(id:string,options:{code?:string;faction?:Faction|'random';team?:number;color?:number}={}){return this.run('Joining lobby…',async()=>this.accept(await this.authenticated(api=>api.joinLobby(id.trim(),options)),true))}
 changeLobby(changes:LobbyChanges){return this.run('Updating lobby…',async()=>this.accept(await this.authenticated(api=>api.updateLobby(this.lobby().id,changes)),this.autoJoin))}
 addAI(config:LobbyAI){return this.run('Adding AI commander…',async()=>this.accept(await this.authenticated(api=>api.addLobbyAI(this.lobby().id,config)),this.autoJoin))}
 changeAI(player:number,config:Partial<LobbyAI>){return this.run('Updating AI commander…',async()=>this.accept(await this.authenticated(api=>api.updateLobbyAI(this.lobby().id,player,config)),this.autoJoin))}
 removeSlot(player:number){return this.run('Removing commander…',async()=>this.accept(await this.authenticated(api=>api.removeLobbySlot(this.lobby().id,player)),this.autoJoin))}
 leaveLobby(){return this.run('Leaving lobby…',async()=>{await this.authenticated(api=>api.leaveLobby(this.lobby().id));this.#connection=undefined;this.autoJoin=false;this.remember();this.patch({lobby:undefined,lobbyState:undefined,joinCode:undefined,chat:[],status:undefined});await this.refreshData()})}
 private async compatible(){const [local,remote]=await Promise.all([this.options.validator.ready,this.publicAPI().health()]);if(local.protocol!==remote.protocol||local.simulation!==remote.simulation||local.content_hash!==remote.content_hash)throw new RuntimeError('version_mismatch','This browser and host use different game versions. Load the game from this host before marking ready.');return local}
 private async mapFor(lobby:Lobby){
  const key=`${this.state.get().host}:${lobby.map_id}:${lobby.map_version}:${lobby.map_hash}`;if(this.mapCache?.key===key)return structuredClone(this.mapCache.map);
  const map=await this.publicAPI().map(lobby.map_id),checked=await this.options.validator.validateMap(encoder.encode(JSON.stringify(map)));
  if(checked.id!==lobby.map_id||checked.version!==lobby.map_version)throw new RuntimeError('map_version_mismatch','The host map changed. Refresh the lobby before marking ready.');this.mapCache={key,map:checked};return structuredClone(checked);
 }
 async previewMap(id:string){const source=await this.publicAPI().map(id),map=await this.options.validator.validateMap(encoder.encode(JSON.stringify(source)));if(map.id!==id)throw new RuntimeError('map_invalid','The host returned a different map.');return map}
 ready(ready:boolean){return this.run(ready?'Loading assets and checking readiness…':'Clearing readiness…',async()=>{
  const lobby=this.lobby(),version=await this.compatible();if(ready)await this.options.prepareAssets(await this.mapFor(lobby),lobby.slots);
  // Capture before asynchronous preflight: the host rejects assets prepared for any old configuration.
  try{await this.accept(await this.authenticated(api=>api.readyLobby(lobby.id,version,ready,ready,lobby.revision)),true)}
  catch(error){if(RuntimeError.from(error).code==='lobby_changed'){await this.accept(await this.authenticated(api=>api.lobby(lobby.id)),false);throw new RuntimeError('lobby_changed','The lobby changed while your assets were loading. Review the updated commanders and battlefield, then mark ready again.')}throw error}
 })}
 start(){return this.run('Starting operation…',async()=>this.accept(await this.authenticated(api=>api.startLobby(this.lobby().id)),true))}
 joinMatch(){return this.run('Connecting to operation…',async()=>{await this.accept(await this.authenticated(api=>api.lobby(this.lobby().id)),false);await this.enterMatch()})}
 private async enterMatch(){
  const connection=this.#connection;if(!connection)throw new RuntimeError('match_not_ready','This lobby has no match connection yet.');this.joining=true;
  try{await this.compatible();const lobby=this.lobby(),map=await this.mapFor(lobby);await this.options.prepareAssets(map,lobby.slots);this.patch({connection:'connecting'});await this.options.joinOnline(this.state.get().host,{...connection},map);this.joinedMatch=connection.match_id;this.patch({connection:'connected'});this.autoJoin=true}
  catch(error){this.autoJoin=false;this.patch({connection:'closed',error:publicError(error)});throw error}finally{this.joining=false}
 }
 reconnect(){return this.run('Reconnecting commander…',async()=>{const transport=this.options.sessions.transport;if(transport?.mode==='online'&&'reconnect' in transport)await (transport as {reconnect:()=>Promise<void>}).reconnect();else{await this.accept(await this.authenticated(api=>api.lobby(this.lobby().id)),false);await this.enterMatch()}})}
 pause(paused:boolean){return this.run(paused?'Requesting shared pause…':'Resuming operation…',async()=>{if(this.options.sessions.transport?.mode!=='online')throw new RuntimeError('match_required','Connect to the match before requesting a shared pause.');await(paused?this.options.sessions.pause():this.options.sessions.resume())})}
 surrender(){return this.run('Sending surrender order…',async()=>{const transport=this.options.sessions.transport;if(transport?.mode!=='online')throw new RuntimeError('match_required','Connect to your active match before surrendering.');await transport.sendOrders([{kind:'surrender'}]);this.inform('Surrender submitted. The host will confirm the result.')})}
 surrenderVote(vote:boolean){return this.run('Updating team surrender vote…',async()=>{if(this.options.sessions.state.kind!=='online')throw new RuntimeError('match_required','Connect to your commander before voting.');await this.options.sessions.transport!.sendOrders([{kind:vote?'surrender_vote':'surrender_cancel'}]);this.inform(vote?'Team surrender vote submitted. Every surviving human teammate must agree.':'Team surrender vote withdrawn.')})}
 rematch(){return this.run('Creating rematch lobby…',async()=>{await this.accept(await this.authenticated(api=>api.rematch(this.lobby().id)),true);this.joinedMatch=undefined;this.inform('Rematch lobby created. Other human commanders must join and mark ready again.')})}
 createCoop(id:string,difficulty:Difficulty,allyAI?:Difficulty){return this.run('Creating co-op lobby…',async()=>this.accept(await this.authenticated(api=>api.coopLobby(id,{difficulty,ally_ai:allyAI,private:true,pause_enabled:true})),true))}
 resumeCoop(id:string,player?:number){return this.run('Restoring shared checkpoint…',async()=>this.accept(await this.authenticated(api=>api.resumeCoop(id,{player,private:true,pause_enabled:true})),true))}
 async refreshChat(){
  const lobby=this.state.get().lobby;if(!lobby)return;const epoch=this.epoch,request=++this.chatEpoch,messages:NetworkChat[]=[];let after=0;
  // The host retains 500 messages and pages at 100. Re-read the retained window so
  // changed mute/block filters remove previously displayed messages as well.
  for(let page=0;page<5;page++){
   const batch=await this.authenticated(api=>api.request<NetworkChat[]>(`/lobbies/${encodeURIComponent(lobby.id)}/chat?after=${after}`));
   if(epoch!==this.epoch||request!==this.chatEpoch||this.state.get().lobby?.id!==lobby.id)return;
   if(!batch?.length)break;for(const message of batch){if(!Number.isSafeInteger(message.id)||message.id<=after)throw new RuntimeError('chat_invalid','The host returned an invalid chat page.');after=message.id;messages.push(message)}
   if(batch.length<100)break;
  }
  this.patch({chat:messages.slice(-500)});
 }
 sendChat(text:string,teamOnly:boolean){return this.run('Sending message…',async()=>{await this.authenticated(api=>api.request(`/lobbies/${encodeURIComponent(this.lobby().id)}/chat`,'POST',{text,team_only:teamOnly}));await this.refreshChat()})}
 social(target:string,action:SocialAction){return this.run('Updating local contacts…',async()=>{await this.authenticated(api=>api.changeSocial(target.trim(),action));await this.refreshData();if(this.state.get().lobby)await this.refreshChat()})}
 invite(target:string){return this.run('Sending lobby invitation…',async()=>{await this.authenticated(api=>api.inviteToLobby(this.lobby().id,target));this.inform('Invitation sent to this local profile.')})}
 acceptInvite(id:string){return this.run('Accepting lobby invitation…',async()=>{await this.accept(await this.authenticated(api=>api.acceptLobbyInvite(id)),true);await this.refreshData()})}
 dismissInvite(id:string){return this.run('Dismissing invitation…',async()=>{await this.authenticated(api=>api.dismissLobbyInvite(id));await this.refreshData()})}
 loadRanked(){return this.run('Checking local ranked maps…',async()=>{const result=await this.authenticated(api=>api.rankedMaps());this.patch({rankedMaps:result.maps,rankedMessage:result.maps.length?undefined:'This host has no reviewed ranked maps. Custom LAN lobbies remain available.'})})}
 queue(faction:Faction|'random',maps:string[]){return this.run('Joining local queue…',async()=>{const start=performance.now(),version=await this.compatible(),latency_ms=Math.round(performance.now()-start);this.patch({queue:await this.authenticated(api=>api.joinRankedQueue(version,{faction,maps,latency_ms}))});await this.refreshData()})}
 leaveQueue(){return this.run('Leaving local queue…',async()=>{await this.authenticated(api=>api.leaveRankedQueue());this.patch({queue:undefined});await this.refreshData()})}
 loadReports(){return this.run('Loading your local reports…',async()=>this.patch({reports:(await this.authenticated(api=>api.reports({status:'all',limit:50}))).reports}))}
 report(reason:string,tick=this.state.get().tick){return this.run('Recording local report…',async()=>{const id=this.lobby().match_id;if(!id)throw new RuntimeError('match_required','Reports require a match you participated in.');const result=await this.authenticated(api=>api.reportMatch(id,tick,reason));this.patch({reports:[result.report,...this.state.get().reports]});this.inform('Report recorded on this host for its operator. It was not sent to a hosted moderation service.')})}
 saveReplay(){return this.run('Saving verified replay…',async()=>{const lobby=this.lobby();if(!lobby.match_id)throw new RuntimeError('match_required','There is no match replay to download.');const matchID=lobby.match_id;const bytes=await this.authenticated(api=>api.replay(matchID));await this.options.store.putReplay(`match-${randomUUID()}`,lobby.name,bytes,0);this.inform('Replay saved to this browser’s replay archive.')})}
 observe(matchID:string,player:number,code?:string){return this.run('Opening authorized observer feed…',async()=>{
  if(!this.options.joinObserver)throw new RuntimeError('observer_unavailable','This application build cannot open observer views.');
  if(this.options.sessions.state.kind==='online'&&!this.state.get().eliminated&&!this.state.get().result?.committed)throw new RuntimeError('active_player_cannot_observe','Finish your active command before opening another perspective.');
  const local=await this.compatible();const grant=await this.authenticated(api=>api.request<ObserverGrant&{map_id:string;map_version:string;protocol:number;simulation:string;content_hash:string;slots:LobbySlot[]}>(`/matches/${encodeURIComponent(matchID.trim())}/observer`,'POST',{player,code:code??''}));
  if(grant.protocol!==local.protocol||grant.simulation!==local.simulation||grant.content_hash!==local.content_hash)throw new RuntimeError('version_mismatch','The observer feed needs a different installed game version.');
  const source=await this.publicAPI().map(grant.map_id),map=await this.options.validator.validateMap(encoder.encode(JSON.stringify(source)));if(map.id!==grant.map_id||map.version!==grant.map_version)throw new RuntimeError('map_version_mismatch','The installed host map differs from this match.');
  await this.options.prepareAssets(map,grant.slots);await this.options.joinObserver(this.state.get().host,{...grant,match_id:matchID.trim()},map);const transport=this.options.sessions.transport;
  this.autoJoin=false;this.patch({observer:{matchID:matchID.trim(),player:grant.player,delayTicks:grant.delay_ticks,buffering:transport instanceof ObserverTransport?transport.buffering:true},connection:'connected',tick:transport?.current?.tick??0});
 })}
 reconnectObserver(){return this.run('Reconnecting observer feed…',async()=>{const transport=this.options.sessions.transport;if(!(transport instanceof ObserverTransport))throw new RuntimeError('observer_required','Open an observer feed first.');await transport.reconnect()})}
 previewSync(migration=false,mappings?:SaveMapping[]){return this.run('Comparing local and host files…',async()=>{this.syncAbort=new AbortController();this.patch({sync:undefined,syncResult:undefined});const options={settingsId:'settings',mappings,signal:this.syncAbort.signal,onProgress:(done:number,total:number)=>this.patch({syncProgress:`${done} / ${total} items compared`})};const sync=this.#sync;if(!sync)throw new RuntimeError('sign_in_required','Sign in to preview optional account copies.');const preview=await(migration?sync.previewMigration(options):sync.preview(options));this.patch({sync:preview,syncProgress:undefined})})}
 copySync(decisions:SyncDecision[]){return this.run('Copying reviewed files…',async()=>{const preview=this.state.get().sync;if(!preview||!this.#sync)throw new RuntimeError('sync_preview_required','Preview the files before choosing copies.');this.syncAbort=new AbortController();const result=await this.#sync.execute(preview,decisions,{signal:this.syncAbort.signal,onProgress:(_receipt,done,total)=>this.patch({syncProgress:`${done} / ${total} choices applied`})});this.patch({syncResult:result,sync:undefined,syncProgress:undefined});if(result.receipts.some(receipt=>receipt.key==='settings'&&receipt.action==='download'&&receipt.status==='copied'))await this.options.onSettingsDownloaded?.();await this.refreshData()})}
 cancelSync(){this.syncAbort?.abort();this.patch({syncProgress:'Cancellation requested. Completed copies are retained.'})}
 private sessionEvent(event:SessionEvent){
  if(event.type==='session'){if(event.state.kind!=='online'&&event.state.phase!=='loading')this.joinedMatch=undefined;if(event.state.kind!=='observer'&&event.state.phase!=='loading')this.patch({observer:undefined});return}
  if(event.type!=='runtime'||!['online','observer'].includes(this.options.sessions.state.kind??''))return;const value=event.event;
  if(value.type==='connection'){const transport=this.options.sessions.transport,observer=this.state.get().observer;this.patch({connection:value.phase,remainingMs:value.remainingMs,...(transport&&'terminalReason' in transport&&transport.terminalReason==='player_eliminated'?{eliminated:true}:{}),...(observer&&transport instanceof ObserverTransport?{observer:{...observer,buffering:transport.buffering,error:transport.lastError?.message}}:{})})}
  else if(value.type==='latency')this.patch({latency:value.milliseconds});
  else if(value.type==='status')this.patch({status:value.status});
  else if(value.type==='result')this.patch({result:value.result});
  else if(value.type==='snapshot'&&(Math.floor(value.snapshot.tick/20)!==Math.floor(this.state.get().tick/20)||value.snapshot.outcome?.finished))this.patch({tick:value.snapshot.tick});
 }
 dispose(){this.disposed=true;this.epoch++;if(this.timer)clearInterval(this.timer);this.syncAbort?.abort();this.sessionUnsubscribe();this.accountUnsubscribe?.();this.#connection=undefined;this.#account=undefined;this.#sync=undefined}
}
