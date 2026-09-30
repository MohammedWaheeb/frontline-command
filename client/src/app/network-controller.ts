import {Observable} from './store';
import {ModerationController} from './moderation-controller';
import {recordedOperation,type RecordedOperation} from './recorded-result';
import {LocalAPI,type Lobby,type LobbyAI,type LobbyChanges,type LobbyConfig,type LobbyInvite,type LobbyResponse,type LobbySlot,type LocalReport,type MapRecord,type MapReport,type QueueResponse,type RankedMap,type SaveSummary,type SocialAction,type SocialRelation} from '../runtime/api';
import {LocalProfileSession,type AccountState} from '../runtime/account';
import {SaveSynchronizer,syncSelectionBudget,type SyncInventory,type SaveMapping,type SaveSyncPreview,type SyncDecision,type SyncExecution} from '../runtime/save-sync';
import {RuntimeError} from '../runtime/errors';
import {randomUUID} from '../runtime/crypto';
import type {ContentLibrary} from '../runtime/content-library';
import type {LocalStore} from '../runtime/storage';
import type {OfflineTransport} from '../runtime/offline';
import type {SessionController,SessionEvent} from '../runtime/session';
import type {MatchConnection} from '../runtime/online';
import {ObserverTransport,type ObserverConnection,type ObserverGrant} from '../runtime/observer';
import type {ConnectionPhase,Difficulty,Faction,GameMap,MatchResult,MatchStatus,RuntimeVersion} from '../runtime/types';
import {sameCommanderIdentity,type CommanderHostIdentity} from './commander-final-binding';

export interface NetworkChat{id:number;room:string;sender:string;name:string;team:number;text:string;tick:number;created:number}
export interface NetworkState{
 host:string;connected:boolean;hostLatency?:number;account?:AccountState;busy?:string;error?:{code:string;message:string};pollError?:string;
 maps:Awaited<ReturnType<LocalAPI['listMaps']>>;missions:Awaited<ReturnType<LocalAPI['listMissions']>>;lobbies:Lobby[];
 lobby?:Lobby;lobbyState?:LobbyResponse['state'];lobbyUnavailable?:boolean;joinCode?:string;chat:NetworkChat[];
 ownMaps:MapRecord[];mapReports:MapReport[];mapReportCursor?:string;mapUpload?:{map:GameMap;filename:string;bytes:number;expectedRevision:number};
 history:RecordedOperation[];historyLoaded?:boolean;relations:SocialRelation[];invites:LobbyInvite[];saves:SaveSummary[];reports:LocalReport[];
 queue?:QueueResponse;rankedMaps:RankedMap[];rankedMessage?:string;
 connection:ConnectionPhase;remainingMs?:number;latency?:number;tick:number;status?:MatchStatus;result?:MatchResult;
 eliminated?:boolean;observer?:{matchID:string;player:number;delayTicks:number;buffering:boolean;error?:string};
 syncInventory?:SyncInventory;sync?:SaveSyncPreview;syncResult?:SyncExecution;syncProgress?:string;notice?:string;
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
 readonly moderation=new ModerationController();
 private identity?:string;private uploadGeneration=0;
 #account?:LocalProfileSession;#connection?:MatchConnection;#sync?:SaveSynchronizer;
 private accountUnsubscribe?:()=>void;private sessionUnsubscribe:()=>void;private timer?:ReturnType<typeof setInterval>;
 private references?:NetworkOptions['references'];private polling=false;private chatEpoch=0;private disposed=false;private initialized=false;private epoch=0;private responseEpoch=0;
 private autoJoin=false;private joining=false;private joinedMatch?:string;private syncAbort?:AbortController;private mapCache?:{key:string;map:GameMap};
 constructor(private readonly options:NetworkOptions){
  this.references=options.references;try{this.references??=globalThis.sessionStorage}catch{}
  const host=globalThis.location?.origin??'http://127.0.0.1:8080';
  this.state=new Observable<NetworkState>({host,connected:false,maps:[],ownMaps:[],mapReports:[],mapReportCursor:undefined,missions:[],lobbies:[],chat:[],history:[],historyLoaded:false,relations:[],invites:[],saves:[],reports:[],rankedMaps:[],connection:'idle',tick:0});
  this.sessionUnsubscribe=options.sessions.subscribe(event=>this.sessionEvent(event));
 }
 private patch(change:Partial<NetworkState>){if(!this.disposed)this.state.update(value=>({...value,...change}))}
 private currentResponse(epoch:number,responseEpoch:number){return !this.disposed&&this.epoch===epoch&&this.responseEpoch===responseEpoch}
 dismissError(){this.patch({error:undefined})}
 private inform(message:string){this.patch({notice:message});this.options.notice(message)}
 private async run(label:string,operation:()=>Promise<void>):Promise<boolean>{
  if(this.disposed)return false;if(this.state.get().busy){this.patch({error:{code:'network_busy',message:'Wait for the current host operation to finish.'}});return false}
  // A foreground operation supersedes any already-running background read.
  this.responseEpoch++;this.patch({busy:label,error:undefined});try{await operation();return true}catch(error){this.patch({error:publicError(error)});return false}finally{this.patch({busy:undefined})}
 }
 private account(){if(!this.#account)throw new RuntimeError('host_required','Connect to a game host first.');return this.#account}
 /** Public identity only. Credentials never enter result bindings or backups. */
 commandRecordIdentity():CommanderHostIdentity|undefined{const context=this.#account?.context,state=this.state.get();if(!context||!['signed-in','offline'].includes(state.account?.phase??'')||state.host!==context.origin||state.account?.origin!==context.origin||state.account.profile?.id!==context.profileId)return;return {...context,hostGeneration:this.epoch}}
 async recoverCommanderResult(matchID:string,identity:CommanderHostIdentity):Promise<MatchResult|undefined>{
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(matchID)||!sameCommanderIdentity(this.commandRecordIdentity(),identity))throw new RuntimeError('commander_identity_changed','The host or local profile changed before this final result could be recovered.');
  const records=await this.account().authenticated(api=>api.history(),{context:{origin:identity.origin,profileId:identity.profileId,generation:identity.generation}});
  if(!sameCommanderIdentity(this.commandRecordIdentity(),identity))throw new RuntimeError('commander_identity_changed','The host or local profile changed before this final result could be recovered.');
  const record=records.find(value=>value.id===matchID);return record?recordedOperation(record).result:undefined;
 }
 private authenticated<T>(operation:(api:LocalAPI)=>Promise<T>){return this.account().authenticated(operation)}
 private lobby(){const lobby=this.state.get().lobby;if(!lobby)throw new RuntimeError('lobby_required','Join a lobby first.');return lobby}
 private publicAPI(host=this.state.get().host){return this.options.makePublicAPI?.(host)??new LocalAPI(host)}
 private remember(lobby?:Lobby){try{if(lobby)this.references?.setItem(referenceKey,JSON.stringify({host:this.state.get().host,profile:this.#account?.context?.profileId,id:lobby.id}));else this.references?.removeItem(referenceKey)}catch{/* Browser persistence is optional; explicit lobby ID remains usable. */}}
 private privateActivity(){const s=this.state.get();return !!this.#account?.context&&(!!s.lobby&&s.lobbyState!=='completed'||s.queue?.status==='searching')||this.options.sessions.state.kind==='online'&&!s.result?.committed}
 private clearPrivateState(){
  this.responseEpoch++;this.chatEpoch++;this.uploadGeneration++;this.syncAbort?.abort();this.#connection=undefined;this.mapCache=undefined;this.autoJoin=false;this.joinedMatch=undefined;this.moderation.lock();
  this.patch({ownMaps:[],mapReports:[],mapReportCursor:undefined,mapUpload:undefined,maps:this.state.get().maps.filter(map=>map.installed||map.published!==false),lobby:undefined,lobbyState:undefined,lobbyUnavailable:undefined,joinCode:undefined,chat:[],history:[],historyLoaded:false,relations:[],invites:[],saves:[],reports:[],lobbies:[],queue:undefined,rankedMaps:[],status:undefined,result:undefined,sync:undefined,syncInventory:undefined,syncResult:undefined,syncProgress:undefined,observer:undefined,eliminated:undefined,notice:undefined,error:undefined,pollError:undefined,connection:'idle',tick:0,remainingMs:undefined,latency:undefined});
 }
 private reconcileProfile(){const lobby=this.state.get().lobby;if(lobby&&!lobby.slots.some(slot=>slot.profile===this.#account?.context?.profileId)){this.#connection=undefined;this.autoJoin=false;this.remember();this.patch({lobby:undefined,lobbyState:undefined,lobbyUnavailable:undefined,joinCode:undefined,chat:[],status:undefined,queue:undefined,result:undefined,sync:undefined,syncInventory:undefined,syncResult:undefined})}}
 async initialize(){if(this.initialized)return;this.initialized=true;await this.connect(this.state.get().host)}
 async connect(address:string){return this.run('Connecting to host…',async()=>{
  if(this.privateActivity())throw new RuntimeError('activity_active','Leave the forming lobby or finish the active match before changing hosts.');
  const host=origin(address),api=this.publicAPI(host),started=performance.now();await api.health();const hostLatency=Math.round(performance.now()-started);
  const [maps,missions]=await Promise.all([api.listMaps(),api.listMissions()]);
  this.accountUnsubscribe?.();const epoch=++this.epoch;const account=this.options.makeAccount?.(host)??new LocalProfileSession({baseURL:host});this.#account=account;this.#connection=undefined;this.#sync=new SaveSynchronizer(account,this.options.store,data=>this.options.validator.inspect(data));
  this.identity=undefined;this.moderation.setHost(host);
  this.accountUnsubscribe=account.subscribe(value=>{if(epoch!==this.epoch)return;const identity=account.context?.profileId;if(identity!==this.identity){this.clearPrivateState();this.identity=identity}this.patch({account:value,...(value.phase==='sign-in-required'?{error:value.error}: {})})});
  this.patch({host,connected:true,hostLatency,maps,ownMaps:[],mapReports:[],mapUpload:undefined,mapReportCursor:undefined,missions,lobbies:[],lobby:undefined,lobbyState:undefined,lobbyUnavailable:undefined,joinCode:undefined,chat:[],history:[],historyLoaded:false,relations:[],invites:[],saves:[],reports:[],account:account.state,sync:undefined,syncInventory:undefined,syncResult:undefined,queue:undefined,connection:'idle',status:undefined,result:undefined,tick:0});
  await account.restore();await this.refreshData();
  if(account.context)try{const raw=this.references?.getItem(referenceKey);const ref=raw?JSON.parse(raw):undefined;if(ref?.host===host&&ref.profile===account.context.profileId&&typeof ref.id==='string')await this.accept(await account.authenticated(api=>api.lobby(ref.id)),false)}catch{/* An expired lobby reference does not prevent local play or account use. */}
  if(!this.timer)this.timer=setInterval(()=>void this.poll(),this.options.pollMs??2000);
 })}
 createProfile(name:string,remember:boolean){return this.run('Creating local profile…',async()=>{if(this.privateActivity())throw new RuntimeError('activity_active','Leave the lobby before changing profiles.');await this.account().create(name,{remember});this.reconcileProfile();await this.refreshData()})}
 restoreProfile(token:string,remember:boolean){return this.run('Restoring local profile…',async()=>{if(this.privateActivity())throw new RuntimeError('activity_active','Leave the lobby before changing profiles.');await this.account().restoreToken(token,{remember});this.reconcileProfile();await this.refreshData()})}
 exportSignInKey(){return this.run('Exporting private sign-in key…',async()=>{const file=this.account().exportSignInKey(),url=URL.createObjectURL(file);try{const link=document.createElement('a');link.href=url;link.download='frontline-local-sign-in.private.json';link.click()}finally{setTimeout(()=>URL.revokeObjectURL(url),10000)}this.inform('Private sign-in key exported. Keep it separately from shared game files.')})}
 restoreSignInKey(file:Blob,remember:boolean){return this.run('Verifying private sign-in key…',async()=>{if(this.privateActivity())throw new RuntimeError('activity_active','Leave the lobby before changing profiles.');await this.account().restoreSignInKey(file,{remember});this.reconcileProfile();await this.refreshData()})}
 logout(){return this.run('Signing out…',async()=>{if(this.privateActivity())throw new RuntimeError('activity_active','Leave the forming lobby or finish the match before signing out.');this.syncAbort?.abort();await this.account().logout();this.remember();this.#connection=undefined;this.patch({lobby:undefined,lobbyState:undefined,chat:[],history:[],historyLoaded:false,relations:[],invites:[],saves:[],reports:[],sync:undefined,syncInventory:undefined,syncResult:undefined,queue:undefined});this.inform('Signed out of this host. Local saves and campaign progress remain available.')})}
 refresh(){return this.run('Refreshing host…',async()=>{await this.refreshData();const lobby=this.state.get().lobby;if(lobby)await this.refreshLobby(lobby)})}
 private async refreshData(){
  const account=this.#account,epoch=this.epoch,responseEpoch=this.responseEpoch;if(!account)return;
  if(!account.context){if(this.currentResponse(epoch,responseEpoch))this.patch({lobbies:[]});return}
  const [lobbies,relations,inbox,saves,queue]=await Promise.all([account.authenticated(api=>api.listLobbies()),account.authenticated(api=>api.social()),account.authenticated(api=>api.lobbyInvites()),account.authenticated(api=>api.listSaves()),account.authenticated(api=>api.rankedQueue())]);
  if(!this.currentResponse(epoch,responseEpoch))return;this.patch({lobbies,relations,invites:inbox.invites,saves,queue,pollError:undefined});
  const queuedLobby=queue.lobby_id;if(queue.status==='matched'&&queuedLobby&&!this.state.get().lobby){const response=await account.authenticated(api=>api.lobby(queuedLobby));if(this.currentResponse(epoch,responseEpoch))await this.accept(response,true)}
 }
 private async poll(){
  if(this.disposed||this.polling||this.state.get().busy||!this.#account?.context)return;this.polling=true;const epoch=this.epoch,responseEpoch=this.responseEpoch;
  try{
   const lobby=this.state.get().lobby;if(lobby){await this.refreshLobby(lobby);if(this.currentResponse(epoch,responseEpoch)&&this.state.get().lobby?.id===lobby.id&&!this.state.get().lobbyUnavailable&&this.options.sessions.state.kind!=='observer')await this.refreshChat()}else await this.refreshData();
   if(this.currentResponse(epoch,responseEpoch))this.patch({pollError:undefined});
  }catch(error){if(this.currentResponse(epoch,responseEpoch))this.patch({pollError:publicError(error).message})}finally{this.polling=false}
 }
 private async refreshLobby(lobby:Lobby){
  if(this.state.get().lobbyUnavailable&&this.state.get().result?.committed)return;
  const epoch=this.epoch,responseEpoch=this.responseEpoch;
  try{const response=await this.authenticated(api=>api.lobby(lobby.id));if(!this.currentResponse(epoch,responseEpoch)||this.state.get().lobby?.id!==lobby.id)return;await this.accept(response,this.autoJoin)}
  catch(error){
   if(!this.currentResponse(epoch,responseEpoch)||this.state.get().lobby?.id!==lobby.id)return;
   if(RuntimeError.from(error).code!=='lobby_missing'||!lobby.match_id||this.options.sessions.state.kind==='observer')throw error;
   if(!await this.recoverResult(lobby))throw error;
   this.#connection=undefined;this.autoJoin=false;this.patch({lobbyState:'completed',lobbyUnavailable:true});
  }
 }
 private async accept(response:LobbyResponse,autoJoin:boolean){
  if(this.disposed)return;const current=this.state.get().lobby;if(current?.id===response.lobby.id&&current.revision>response.lobby.revision)return;
  const changed=this.state.get().lobby?.id!==response.lobby.id;this.#connection=response.connection;this.autoJoin=autoJoin;
  this.patch({lobby:response.lobby,lobbyUnavailable:undefined,lobbyState:response.state??(response.lobby.match_id?'active':'forming'),joinCode:response.code??(changed?undefined:this.state.get().joinCode),...(changed?{chat:[],result:undefined,status:undefined,tick:0,connection:'idle' as const,eliminated:undefined}: {})});this.remember(response.lobby);
  if(response.state==='completed'&&this.options.sessions.state.kind!=='observer'&&!this.state.get().result?.committed)await this.recoverResult(response.lobby);
  if(response.connection&&autoJoin&&response.state!=='completed'&&this.joinedMatch!==response.connection.match_id&&!this.joining)await this.enterMatch();
 }
 private async recoverResult(lobby:Lobby){
  const epoch=this.epoch,responseEpoch=this.responseEpoch;
  const record=(await this.authenticated(api=>api.history())).find(value=>value.id===lobby.match_id);if(!this.currentResponse(epoch,responseEpoch)||!record||this.state.get().lobby?.id!==lobby.id||this.state.get().lobby?.match_id!==lobby.match_id)return false;
  const entry=recordedOperation(record);this.patch({result:entry.result,tick:entry.result.outcome!.tick});return true;
 }
 loadHistory(){return this.run('Loading recorded operations…',async()=>{const records=await this.authenticated(api=>api.history());this.patch({history:records.map(recordedOperation),historyLoaded:true})})}
 archiveRecorded(id:string){return this.run('Saving verified replay…',async()=>{const record=this.state.get().history.find(entry=>entry.id===id);if(!record||record.result.void)throw new RuntimeError('replay_unavailable','Select a completed recorded operation with an available replay.');const bytes=await this.authenticated(api=>api.replay(id));await this.options.store.putReplay(`match-${randomUUID()}`,`Recorded operation ${id}`,bytes,0);this.inform('Replay saved to this browser’s replay archive.')})}

 createLobby(config:LobbyConfig){return this.run('Creating lobby…',async()=>this.accept(await this.authenticated(api=>api.createLobby(config)),true))}
 joinLobby(id:string,options:{code?:string;faction?:Faction|'random';team?:number;color?:number}={}){return this.run('Joining lobby…',async()=>this.accept(await this.authenticated(api=>api.joinLobby(id.trim(),options)),true))}
 changeLobby(changes:LobbyChanges){return this.run('Updating lobby…',async()=>this.accept(await this.authenticated(api=>api.updateLobby(this.lobby().id,changes)),this.autoJoin))}
 addAI(config:LobbyAI){return this.run('Adding AI commander…',async()=>this.accept(await this.authenticated(api=>api.addLobbyAI(this.lobby().id,config)),this.autoJoin))}
 changeAI(player:number,config:Partial<LobbyAI>){return this.run('Updating AI commander…',async()=>this.accept(await this.authenticated(api=>api.updateLobbyAI(this.lobby().id,player,config)),this.autoJoin))}
 removeSlot(player:number){return this.run('Removing commander…',async()=>this.accept(await this.authenticated(api=>api.removeLobbySlot(this.lobby().id,player)),this.autoJoin))}
 leaveLobby(){return this.run('Leaving lobby…',async()=>{if(!this.state.get().lobbyUnavailable)await this.authenticated(api=>api.leaveLobby(this.lobby().id));this.#connection=undefined;this.autoJoin=false;this.remember();this.patch({lobby:undefined,lobbyState:undefined,lobbyUnavailable:undefined,joinCode:undefined,chat:[],status:undefined});await this.refreshData()})}
 private async compatible(){const [local,remote]=await Promise.all([this.options.validator.ready,this.publicAPI().health()]);if(local.protocol!==remote.protocol||local.simulation!==remote.simulation||local.content_hash!==remote.content_hash)throw new RuntimeError('version_mismatch','This browser and host use different game versions. Load the game from this host before marking ready.');return local}
 private async mapFor(lobby:Lobby){
  const key=`${this.state.get().host}:${lobby.map_id}:${lobby.map_version}:${lobby.map_hash}`;if(this.mapCache?.key===key)return structuredClone(this.mapCache.map);
  const map=await this.authenticated(api=>api.map(lobby.map_id,lobby.match_id?{match_id:lobby.match_id}:{lobby_id:lobby.id},lobby.map_hash)),checked=await this.options.validator.validateMap(encoder.encode(JSON.stringify(map)));
  if(checked.id!==lobby.map_id||checked.version!==lobby.map_version)throw new RuntimeError('map_version_mismatch','The host map changed. Refresh the lobby before marking ready.');this.mapCache={key,map:checked};return structuredClone(checked);
 }
 async previewMap(id:string){const lobby=this.state.get().lobby;const source=await(this.#account?.context?this.authenticated(api=>api.map(id,lobby?.map_id===id?(lobby.match_id?{match_id:lobby.match_id}:{lobby_id:lobby.id}):undefined)):this.publicAPI().map(id)),map=await this.options.validator.validateMap(encoder.encode(JSON.stringify(source)));if(map.id!==id)throw new RuntimeError('map_invalid','The host returned a different map.');return map}
 ready(ready:boolean){return this.run(ready?'Loading assets and checking readiness…':'Clearing readiness…',async()=>{
  const lobby=this.lobby(),version=await this.compatible();if(ready)await this.options.prepareAssets(await this.mapFor(lobby),lobby.slots);
  // Capture before asynchronous preflight: the host rejects assets prepared for any old configuration.
  try{await this.accept(await this.authenticated(api=>api.readyLobby(lobby.id,version,ready,ready,lobby.revision)),true)}
  catch(error){if(RuntimeError.from(error).code==='lobby_changed'){await this.accept(await this.authenticated(api=>api.lobby(lobby.id)),false);throw new RuntimeError('lobby_changed','The lobby changed while your assets were loading. Review the updated commanders and battlefield, then mark ready again.')}throw error}
 })}
 start(){return this.run('Starting operation…',async()=>this.accept(await this.authenticated(api=>api.startLobby(this.lobby().id)),true))}
 joinMatch(){return this.run('Connecting to operation…',async()=>{await this.refreshLobby(this.lobby());if(!this.state.get().result?.committed)await this.enterMatch()})}
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
  const lobby=this.state.get().lobby;if(!lobby)return;const epoch=this.epoch,responseEpoch=this.responseEpoch,request=++this.chatEpoch,messages:NetworkChat[]=[];let after=0;
  // The host retains 500 messages and pages at 100. Re-read the retained window so
  // changed mute/block filters remove previously displayed messages as well.
  for(let page=0;page<5;page++){
   const batch=await this.authenticated(api=>api.request<NetworkChat[]>(`/lobbies/${encodeURIComponent(lobby.id)}/chat?after=${after}`));
   if(!this.currentResponse(epoch,responseEpoch)||request!==this.chatEpoch||this.state.get().lobby?.id!==lobby.id)return;
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
 async reloadMaps(){const [maps,ownMaps]=await Promise.all([this.publicAPI().listMaps(),this.authenticated(api=>api.myMaps())]);const merged=[...maps];for(const record of ownMaps)if(!merged.some(map=>map.id===record.id))merged.push({...record,installed:false,ranked:false});this.patch({maps:merged,ownMaps})}
 loadMaps(){return this.run('Loading published maps and your drafts…',()=>this.reloadMaps())}
 cancelMapUpload(){this.uploadGeneration++;this.patch({mapUpload:undefined})}
 prepareMapUpload(file:File|Blob,filename='editor-map.json'){return this.run('Validating map upload with Go…',async()=>{
  const generation=++this.uploadGeneration,identity=this.#account?.context;if(!identity)throw new RuntimeError('sign_in_required','Sign in to review a map upload.');
  this.patch({mapUpload:undefined});if(file.size>16*1024*1024)throw new RuntimeError('map_too_large','Map uploads must be at most 16 MiB.');
  const bytes=new Uint8Array(await file.arrayBuffer());let map:GameMap;try{map=await this.options.validator.validateMap(bytes)}catch(error){await this.options.store.preserveRecovery(file,filename.slice(0,100),'Map upload validation failed; original preserved.');throw error}
  const ownMaps=await this.authenticated(api=>api.myMaps());if(generation!==this.uploadGeneration||this.#account?.context?.profileId!==identity.profileId)return;
  const existing=ownMaps.find(value=>value.id===map.id);this.patch({ownMaps,mapUpload:{map,filename:filename.slice(0,100),bytes:bytes.length,expectedRevision:existing?.revision??0}});
 })}
 uploadMap(){return this.run('Uploading reviewed map as private…',async()=>{
  const preview=this.state.get().mapUpload;if(!preview)throw new RuntimeError('map_preview_required','Validate and review the map file before uploading.');
  const record=await this.authenticated(api=>api.uploadMap(preview.map,preview.expectedRevision));this.patch({mapUpload:undefined});await this.reloadMaps();this.inform(`${record.title} uploaded as a private map. Publish explicitly to list it for other commanders.`);
 })}
 publishMap(id:string,published:boolean){return this.run(published?'Publishing your map…':'Making your map private…',async()=>{
  const record=this.state.get().ownMaps.find(value=>value.id===id);if(!record)throw new RuntimeError('map_review_required','Refresh your map list before changing publication.');
  await this.authenticated(api=>api.publishMap(id,published,record.revision));await this.reloadMaps();this.inform(published?'Map published on this local host. It remains unranked.':'Map is private. Existing admitted operations keep their original battlefield.');
 })}
 loadMapReports(more=false){return this.run('Loading your map reports…',async()=>{const page=await this.authenticated(api=>api.mapReports(more?this.state.get().mapReportCursor:undefined));this.patch({mapReports:more?[...this.state.get().mapReports,...page.reports]:page.reports,mapReportCursor:page.next_cursor})})}
 reportMap(id:string,reason:string){return this.run('Recording map report…',async()=>{const report=await this.authenticated(api=>api.reportMap(id,reason));this.patch({mapReports:[report,...this.state.get().mapReports.filter(value=>value.id!==report.id)]});this.inform('Map report recorded for this local host’s operator. The reported content revision is preserved as evidence.')})}
 loadReports(){return this.run('Loading your local reports…',async()=>this.patch({reports:(await this.authenticated(api=>api.reports({status:'all',limit:50}))).reports}))}
 report(reason:string,tick=this.state.get().tick){return this.run('Recording local report…',async()=>{const id=this.lobby().match_id;if(!id)throw new RuntimeError('match_required','Reports require a match you participated in.');const result=await this.authenticated(api=>api.reportMatch(id,tick,reason));this.patch({reports:[result.report,...this.state.get().reports]});this.inform('Report recorded on this host for its operator. It was not sent to a hosted moderation service.')})}
 saveReplay(){return this.run('Saving verified replay…',async()=>{const lobby=this.lobby();if(!lobby.match_id)throw new RuntimeError('match_required','There is no match replay to download.');const matchID=lobby.match_id;const bytes=await this.authenticated(api=>api.replay(matchID));await this.options.store.putReplay(`match-${randomUUID()}`,lobby.name,bytes,0);this.inform('Replay saved to this browser’s replay archive.')})}
 observe(matchID:string,player:number,code?:string){return this.run('Opening authorized observer feed…',async()=>{
  if(!this.options.joinObserver)throw new RuntimeError('observer_unavailable','This application build cannot open observer views.');
  if(this.options.sessions.state.kind==='online'&&!this.state.get().eliminated&&!this.state.get().result?.committed)throw new RuntimeError('active_player_cannot_observe','Finish your active command before opening another perspective.');
  const local=await this.compatible();const grant=await this.authenticated(api=>api.request<ObserverGrant&{map_id:string;map_version:string;map_hash:string;protocol:number;simulation:string;content_hash:string;slots:LobbySlot[]}>(`/matches/${encodeURIComponent(matchID.trim())}/observer`,'POST',{player,code:code??''}));
  if(grant.protocol!==local.protocol||grant.simulation!==local.simulation||grant.content_hash!==local.content_hash)throw new RuntimeError('version_mismatch','The observer feed needs a different installed game version.');
  const source=await this.authenticated(api=>api.map(grant.map_id,{match_id:matchID.trim()},grant.map_hash)),map=await this.options.validator.validateMap(encoder.encode(JSON.stringify(source)));if(map.id!==grant.map_id||map.version!==grant.map_version)throw new RuntimeError('map_version_mismatch','The installed host map differs from this match.');
  await this.options.prepareAssets(map,grant.slots);await this.options.joinObserver(this.state.get().host,{...grant,match_id:matchID.trim()},map);const transport=this.options.sessions.transport;
  this.autoJoin=false;this.patch({observer:{matchID:matchID.trim(),player:grant.player,delayTicks:grant.delay_ticks,buffering:transport instanceof ObserverTransport?transport.buffering:true},connection:'connected',tick:transport?.current?.tick??0});
 })}
 reconnectObserver(){return this.run('Reconnecting observer feed…',async()=>{const transport=this.options.sessions.transport;if(!(transport instanceof ObserverTransport))throw new RuntimeError('observer_required','Open an observer feed first.');await transport.reconnect()})}
 selectSync(migration=false){return this.run('Listing archive metadata…',async()=>{const sync=this.#sync;if(!sync)throw new RuntimeError('sign_in_required','Sign in before selecting account copies.');this.syncAbort=new AbortController();this.patch({sync:undefined,syncInventory:undefined,syncResult:undefined});const inventory=await sync.inventory(migration?'migration':'sync',this.syncAbort.signal);this.patch({syncInventory:inventory})})}
 cancelSyncSelection(){this.patch({syncInventory:undefined})}
 previewSelectedSync(keys:string[],settings:boolean,campaign:boolean){return this.run('Comparing selected local and host files…',async()=>{const inventory=this.state.get().syncInventory,sync=this.#sync;if(!inventory||!sync)throw new RuntimeError('sync_selection_required','Choose the archive items first.');this.syncAbort=new AbortController();const preview=await sync.previewSelected(inventory,keys,{settingsId:settings?'settings':undefined,campaignId:campaign?'campaign':undefined,signal:this.syncAbort.signal,onProgress:(done,total)=>this.patch({syncProgress:`${done} / ${total} items compared`})});this.patch({sync:preview,syncInventory:undefined,syncProgress:undefined,syncResult:undefined})})}
 previewSync(migration=false,mappings?:SaveMapping[],include={settings:true,campaign:true}){return this.run('Comparing local and host files…',async()=>{
  this.syncAbort=new AbortController();this.patch({sync:undefined,syncInventory:undefined,syncResult:undefined});const options={settingsId:include.settings?'settings':undefined,campaignId:include.campaign?'campaign':undefined,mappings,signal:this.syncAbort.signal,onProgress:(done:number,total:number)=>this.patch({syncProgress:`${done} / ${total} items compared`})};const sync=this.#sync;if(!sync)throw new RuntimeError('sign_in_required','Sign in to preview optional account copies.');
  if(!mappings){const inventory=await sync.inventory(migration?'migration':'sync',options.signal);if(!syncSelectionBudget(inventory.items,include.settings,include.campaign).fits){this.patch({syncInventory:inventory,syncProgress:undefined});this.inform('Choose a smaller archive batch before comparing its contents. No save payloads have been downloaded.');return}const preview=await sync.previewSelected(inventory,inventory.items.map(item=>item.key),options);this.patch({sync:preview,syncProgress:undefined});return}
  const preview=await(migration?sync.previewMigration(options):sync.preview(options));this.patch({sync:preview,syncProgress:undefined});
 })}
 copySync(decisions:SyncDecision[]){return this.run('Copying reviewed files…',async()=>{const preview=this.state.get().sync;if(!preview||!this.#sync)throw new RuntimeError('sync_preview_required','Preview the files before choosing copies.');this.syncAbort=new AbortController();const context=this.account().context;if(!context)throw new RuntimeError('sign_in_required','Sign in before copying reviewed files.');const result=await this.#sync.execute(preview,decisions,{signal:this.syncAbort.signal,onProgress:(_receipt,done,total)=>this.patch({syncProgress:`${done} / ${total} choices applied`})});this.account().assertContext(context);this.patch({syncResult:result,sync:undefined,syncProgress:undefined});if(result.receipts.some(receipt=>receipt.key==='settings'&&receipt.action==='download'&&receipt.status==='copied'))await this.options.onSettingsDownloaded?.();await this.refreshData()})}
 cancelSync(){this.syncAbort?.abort();this.patch({syncProgress:'Cancellation requested. Completed copies are retained.'})}
 private sessionEvent(event:SessionEvent){
  if(event.type==='session'){if(event.state.kind!=='online'&&event.state.phase!=='loading'){this.joinedMatch=undefined;this.autoJoin=false;}if(event.state.kind!=='observer'&&event.state.phase!=='loading')this.patch({observer:undefined});return}
  if(event.type!=='runtime'||event.session!==this.options.sessions.state.id||!['online','observer'].includes(this.options.sessions.state.kind??''))return;const value=event.event;
  if(this.options.sessions.state.kind==='online'){
   const matchID=this.state.get().lobby?.match_id,transport=this.options.sessions.transport;
   // A finished session can remain mounted while a new forming lobby is shown.
   if(!matchID||this.#connection?.match_id!==matchID||!transport||!('connection' in transport)||(transport.connection as MatchConnection).match_id!==matchID||value.type==='result'&&value.result.matchId!==matchID)return;
  }
  if(value.type==='connection'){const transport=this.options.sessions.transport,observer=this.state.get().observer;this.patch({connection:value.phase,remainingMs:value.remainingMs,...(transport&&'terminalReason' in transport&&transport.terminalReason==='player_eliminated'?{eliminated:true}:{}),...(observer&&transport instanceof ObserverTransport?{observer:{...observer,buffering:transport.buffering,error:transport.lastError?.message}}:{})})}
  else if(value.type==='latency')this.patch({latency:value.milliseconds});
  else if(value.type==='status')this.patch({status:value.status});
  else if(value.type==='result')this.patch({result:value.result});
  else if(value.type==='snapshot'&&(Math.floor(value.snapshot.tick/20)!==Math.floor(this.state.get().tick/20)||value.snapshot.outcome?.finished))this.patch({tick:value.snapshot.tick});
 }
 dispose(){this.moderation.dispose();this.disposed=true;this.epoch++;this.responseEpoch++;if(this.timer)clearInterval(this.timer);this.syncAbort?.abort();this.sessionUnsubscribe();this.accountUnsubscribe?.();this.#connection=undefined;this.#account=undefined;this.#sync=undefined}
}
