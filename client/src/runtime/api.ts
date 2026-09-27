import {RuntimeError} from './errors';
import type {Difficulty,Faction,GameMap,RuntimeVersion} from './types';
import type {MatchConnection} from './online';
export interface Profile{id:string;name:string;created:number;local?:boolean}
export interface LobbySlot{player:number;color:number;profile?:string;name:string;faction:Faction;team:number;ai?:Difficulty;script?:boolean;ready:boolean;assets_ready:boolean}
export interface Lobby{id:string;revision:number;map_hash:string;map_version:string;rules?:LobbyRules;scenario_rules?:LobbyScenarioRules;name:string;host:string;map_id:string;mode:string;private:boolean;rated:boolean;live_observers:boolean;pause_enabled:boolean;slots:LobbySlot[];match_id?:string;scenario_id?:string;difficulty?:Difficulty;resume_tick?:number;previous_match_id?:string}
export interface LobbyResponse{state?:'forming'|'active'|'completed';lobby:Lobby;code?:string;connection?:MatchConnection}
export interface LobbyConfig{name:string;map_id:string;mode:'1v1'|'2v2'|'ffa'|'coop'|'custom';private?:boolean;faction:Faction|'random';team?:number;color?:number;rules?:LobbyRules;ai?:Array<{faction:Faction|'random';difficulty:Difficulty;team?:number;color?:number}>;live_observers?:boolean;pause_enabled?:boolean}
export interface LobbyRules{ruleset:'standard-v2';speed:1;starting_credits:6000;supply_cap:100;fog:true;strategic_operations:true}
export interface LobbyScenarioRules{ruleset:'scenario-v2';mission_version:string;difficulty:Difficulty;rules_notice:string;resumed:boolean;starting_credits?:Array<{player:number;credits_milli:number}>}
export interface LobbyChanges{map_id?:string;faction?:Faction|'random';team?:number;color?:number;name?:string;private?:boolean;pause_enabled?:boolean;live_observers?:boolean;rules?:LobbyRules}
export interface LobbyAI{faction?:Faction|'random';difficulty:Difficulty;team?:number;color?:number}
export interface LobbyInvite{id:string;lobby_id:string;lobby_name:string;sender:string;sender_name:string;recipient:string;created:number;expires:number;accepted:boolean}
export interface SocialRelation{target:string;name:string;kind:'request'|'friend'|'mute'|'block';incoming:boolean}
export type SocialAction='request'|'accept'|'decline'|'remove'|'mute'|'unmute'|'block'|'unblock';
export interface RankedMap{id:string;title:string;version:string;hash:string;players:2}
export interface QueueResponse{status:'idle'|'searching'|'matched'|'canceled'|'completed';region:'local';local?:boolean;latency_ms?:number;rating_range?:number;joined?:number;maps?:string[];selection?:'pre_queue_allowlist';lobby_id?:string;match_id?:string}
export interface SaveSummary{id:string;owner:string;name:string;revision:number;updated:number}
export interface RemoteSettings<T=Record<string,unknown>>{revision:number;data:T}
export type ReportDecision='pending'|'confirmed'|'dismissed'|'needs_context';
export interface LocalReport{id:string;match_id:string;tick:number;reason:string;created:number;revision:number;decision:ReportDecision;reviewed?:number}
export interface ReportPage{reports:LocalReport[];next_cursor:string}
/** Payload is the server's base64-encoded result JSON; it is never an engine save. */
export interface MatchHistoryRecord{id:string;payload:string;created:number;void:boolean}
export class APIError extends RuntimeError {constructor(code:string,message:string,public status:number){super(code,message,status!==401);this.name='APIError'}}
export class LocalAPI {
 constructor(readonly baseURL=globalThis.location?.origin??'http://127.0.0.1:8080',public token=''){}
 private async response(path:string,method='GET',body?:string,signal?:AbortSignal){
  const headers:Record<string,string>={};if(this.token)headers.Authorization=`Bearer ${this.token}`;if(body!==undefined)headers['Content-Type']='application/json';
  let response:Response;
  try{response=await fetch(new URL('/api/v1'+path,this.baseURL),{method,headers,body,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000),cache:'no-store'})}
  catch(error){if(signal?.aborted)throw new RuntimeError('request_canceled','This host request was canceled. Recheck its result before retrying a write.');throw new RuntimeError('host_unreachable','The local host could not be reached. Check its address and keep your local saves.',true,error)}
  if(!response.ok){let detail:any;try{detail=await response.json()}catch{}throw new APIError(detail?.code??'request_failed',detail?.message??`The host could not complete this request (${response.status}).`,response.status)}
  return response;
 }
 async request<T>(path:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T>{const response=await this.response(path,method,body===undefined?undefined:JSON.stringify(body),signal);return response.status===204?undefined as T:response.json() as Promise<T>}
 health(){return this.request<RuntimeVersion&{status:string;tick_rate:number;local:boolean}>('/health')}
 async createProfile(name:string,signal?:AbortSignal){const result=await this.request<{profile:Profile;token:string}>('/profiles','POST',{name},signal);this.token=result.token;return result}
 me(signal?:AbortSignal){return this.request<Profile>('/profiles/me','GET',undefined,signal)}
 listMaps(){return this.request<Array<{id:string;title:string;author?:string;version?:string;players?:number;installed:boolean;ranked:boolean;hash?:string}>>('/maps')}
 map(id:string){return this.request<GameMap>(`/maps/${encodeURIComponent(id)}`)}
 content(){return this.request<Record<string,unknown>>('/content')}
 listMissions(){return this.request<Array<{id:string;title:string;version:string;map_id:string;faction:Faction;mode:string;briefing:string;rules_notice:string}>>('/missions')}
 mission(id:string){return this.request<Record<string,unknown>>(`/missions/${encodeURIComponent(id)}`)}
 listLobbies(){return this.request<Lobby[]>('/lobbies')}
 createLobby(config:LobbyConfig){return this.request<LobbyResponse>('/lobbies','POST',config)}
 lobby(id:string){return this.request<LobbyResponse>(`/lobbies/${encodeURIComponent(id)}`)}
 joinLobby(id:string,options:{code?:string;faction?:Faction|'random';team?:number;color?:number}={}){return this.request<LobbyResponse>(`/lobbies/${encodeURIComponent(id)}/join`,'POST',options)}
 updateLobby(id:string,changes:LobbyChanges){return this.request<LobbyResponse>(`/lobbies/${encodeURIComponent(id)}`,'PATCH',changes)}
 addLobbyAI(id:string,config:LobbyAI){return this.request<LobbyResponse>(`/lobbies/${encodeURIComponent(id)}/ai`,'POST',config)}
 updateLobbyAI(id:string,player:number,changes:Partial<LobbyAI>){return this.request<LobbyResponse>(`/lobbies/${encodeURIComponent(id)}/ai/${player}`,'PATCH',changes)}
 removeLobbySlot(id:string,player:number){return this.request<LobbyResponse>(`/lobbies/${encodeURIComponent(id)}/slots/${player}`,'DELETE')}
 social(){return this.request<SocialRelation[]>('/social')}
 changeSocial(target:string,action:SocialAction){return this.request<void>('/social','POST',{target,action})}
 reportMatch(matchID:string,tick:number,reason:string,signal?:AbortSignal){return this.request<{recorded_locally:true;report:LocalReport}>('/reports','POST',{match_id:matchID,tick,reason},signal)}
 reports(options:{status?:'all'|'pending'|'reviewed';before?:string;limit?:number}={},signal?:AbortSignal){const query=new URLSearchParams();if(options.status)query.set('status',options.status);if(options.before)query.set('before',options.before);if(options.limit!==undefined)query.set('limit',String(options.limit));return this.request<ReportPage>('/reports'+(query.size?'?'+query:''),'GET',undefined,signal)}
 history(signal?:AbortSignal){return this.request<MatchHistoryRecord[]>('/history','GET',undefined,signal)}
 inviteToLobby(id:string,target:string){return this.request<LobbyInvite>(`/lobbies/${encodeURIComponent(id)}/invites`,'POST',{target})}
 lobbyInvites(){return this.request<{invites:LobbyInvite[]}>('/invites')}
 acceptLobbyInvite(invite:string,options:{faction?:Faction|'random';team?:number;color?:number}={}){return this.request<LobbyResponse>(`/invites/${encodeURIComponent(invite)}/accept`,'POST',options)}
 dismissLobbyInvite(invite:string){return this.request<void>(`/invites/${encodeURIComponent(invite)}`,'DELETE')}
 rankedMaps(){return this.request<{maps:RankedMap[];selection:'pre_queue_allowlist';region:'local';local:true;rules:LobbyRules}>('/matchmaking/maps')}
 joinRankedQueue(version:Pick<RuntimeVersion,'simulation'|'protocol'|'content_hash'>,options:{faction:Faction|'random';maps?:string[];latency_ms:number}){return this.request<QueueResponse>('/matchmaking','POST',{protocol:version.protocol,simulation:version.simulation,content_hash:version.content_hash,faction:options.faction,maps:options.maps,latency_ms:options.latency_ms})}
 rankedQueue(){return this.request<QueueResponse>('/matchmaking')}
 leaveRankedQueue(){return this.request<void>('/matchmaking','DELETE')}
 leaveLobby(id:string){return this.request<void>(`/lobbies/${encodeURIComponent(id)}/membership`,'DELETE')}
 readyLobby(id:string,version:Pick<RuntimeVersion,'simulation'|'protocol'|'content_hash'>,ready=true,assetsReady=true,expectedRevision?:number){return this.request<LobbyResponse>(`/lobbies/${encodeURIComponent(id)}/ready`,'POST',{protocol:version.protocol,simulation:version.simulation,content_hash:version.content_hash,ready,assets_ready:assetsReady,expected_revision:expectedRevision})}
 rematch(id:string){return this.request<LobbyResponse>(`/lobbies/${encodeURIComponent(id)}/rematch`,'POST',{})}
 startLobby(id:string){return this.request<LobbyResponse>(`/lobbies/${encodeURIComponent(id)}/start`,'POST',{})}
 coopLobby(id:string,options:{difficulty:Difficulty;ally_ai?:Difficulty;private?:boolean;pause_enabled?:boolean}){return this.request<LobbyResponse>(`/missions/${encodeURIComponent(id)}/lobby`,'POST',options)}
 resumeCoop(id:string,options:{player?:number;private?:boolean;pause_enabled?:boolean}={}){return this.request<LobbyResponse>(`/saves/${encodeURIComponent(id)}/coop-lobby`,'POST',options)}
 listSaves(signal?:AbortSignal){return this.request<SaveSummary[]>('/saves','GET',undefined,signal)}
 settings<T=Record<string,unknown>>(signal?:AbortSignal){return this.request<RemoteSettings<T>>('/settings','GET',undefined,signal)}
 putSettings<T extends Record<string,unknown>>(data:T,expectedRevision:number,signal?:AbortSignal){return this.request<RemoteSettings<T>>('/settings','PUT',{data,expected_revision:expectedRevision},signal)}
 async downloadSave(id:string,signal?:AbortSignal){const response=await this.response(`/saves/${encodeURIComponent(id)}/download`,'GET',undefined,signal);const revision=Number(response.headers.get('X-Save-Revision'));if(!Number.isSafeInteger(revision)||revision<1)throw new RuntimeError('invalid_response','The host returned a save without a valid revision.');const data=new Uint8Array(await response.arrayBuffer());if(data.length>64*1024*1024)throw new RuntimeError('save_too_large','The host save exceeds 64 MiB.');return {data,revision}}
 async uploadSave(id:string,name:string,data:Uint8Array,expectedRevision:number,signal?:AbortSignal){
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||data.length>64*1024*1024)throw new RuntimeError('invalid_save','The save or revision is invalid.');
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(data);
  try{const envelope=JSON.parse(raw);if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))throw new Error('invalid envelope')}catch{throw new RuntimeError('save_invalid','The engine save must contain one valid JSON document.')}

  // Preserve exact JSON integer tokens. Never JSON.parse/stringify engine bytes:
  // random state and replay seeds may exceed JavaScript's safe integer range.
  const body=`{"name":${JSON.stringify(name)},"expected_revision":${expectedRevision},"data":${raw}}`;
  const response=await this.response(`/saves/${encodeURIComponent(id)}`,'PUT',body,signal);return response.json() as Promise<SaveSummary>;
 }
 deleteSave(id:string,revision:number){return this.request<void>(`/saves/${encodeURIComponent(id)}`,'DELETE',{revision})}
 async replay(id:string){return new Uint8Array(await(await this.response(`/replays/${encodeURIComponent(id)}`)).arrayBuffer())}
}
