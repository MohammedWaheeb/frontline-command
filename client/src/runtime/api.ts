import {RuntimeError} from './errors';
import type {Difficulty,Faction,GameMap,RuntimeVersion} from './types';
import type {MatchConnection} from './online';
export interface Profile{id:string;name:string;created:number}
export interface LobbySlot{player:number;profile?:string;name:string;faction:Faction;team:number;ai?:Difficulty;script?:boolean;ready:boolean;assets_ready:boolean}
export interface Lobby{id:string;name:string;host:string;map_id:string;mode:string;private:boolean;rated:boolean;live_observers:boolean;pause_enabled:boolean;slots:LobbySlot[];match_id?:string;scenario_id?:string;difficulty?:Difficulty;resume_tick?:number}
export interface LobbyResponse{lobby:Lobby;code?:string;connection?:MatchConnection}
export interface LobbyConfig{name:string;map_id:string;mode:'1v1'|'2v2'|'ffa'|'coop'|'custom';private?:boolean;faction:Faction|'random';team?:number;ai?:Array<{faction:Faction|'random';difficulty:Difficulty;team?:number}>;live_observers?:boolean;pause_enabled?:boolean}
export interface SaveSummary{id:string;owner:string;name:string;revision:number;updated:number}
export class APIError extends RuntimeError {constructor(code:string,message:string,public status:number){super(code,message,status!==401);this.name='APIError'}}
export class LocalAPI {
 constructor(readonly baseURL=globalThis.location?.origin??'http://127.0.0.1:8080',public token=''){}
 private async response(path:string,method='GET',body?:string,signal?:AbortSignal){
  const headers:Record<string,string>={};if(this.token)headers.Authorization=`Bearer ${this.token}`;if(body!==undefined)headers['Content-Type']='application/json';
  let response:Response;
  try{response=await fetch(new URL('/api/v1'+path,this.baseURL),{method,headers,body,signal:signal??AbortSignal.timeout(15000),cache:'no-store'})}
  catch(error){throw new RuntimeError('host_unreachable','The local host could not be reached. Check its address and keep your local saves.',true,error)}
  if(!response.ok){let detail:any;try{detail=await response.json()}catch{}throw new APIError(detail?.code??'request_failed',detail?.message??`The host could not complete this request (${response.status}).`,response.status)}
  return response;
 }
 async request<T>(path:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T>{const response=await this.response(path,method,body===undefined?undefined:JSON.stringify(body),signal);return response.status===204?undefined as T:response.json() as Promise<T>}
 health(){return this.request<RuntimeVersion&{status:string;tick_rate:number;local:boolean}>('/health')}
 async createProfile(name:string){const result=await this.request<{profile:Profile;token:string}>('/profiles','POST',{name});this.token=result.token;return result}
 me(){return this.request<Profile>('/profiles/me')}
 listMaps(){return this.request<Array<{id:string;title:string;author?:string;version?:string;players?:number;installed:boolean}>>('/maps')}
 map(id:string){return this.request<GameMap>(`/maps/${encodeURIComponent(id)}`)}
 content(){return this.request<Record<string,unknown>>('/content')}
 listMissions(){return this.request<Array<{id:string;title:string;version:string;map_id:string;faction:Faction;mode:string;briefing:string;rules_notice:string}>>('/missions')}
 mission(id:string){return this.request<Record<string,unknown>>(`/missions/${encodeURIComponent(id)}`)}
 listLobbies(){return this.request<Lobby[]>('/lobbies')}
 createLobby(config:LobbyConfig){return this.request<LobbyResponse>('/lobbies','POST',config)}
 lobby(id:string){return this.request<LobbyResponse>(`/lobbies/${encodeURIComponent(id)}`)}
 joinLobby(id:string,options:{code?:string;faction?:Faction|'random';team?:number}={}){return this.request<LobbyResponse>(`/lobbies/${encodeURIComponent(id)}/join`,'POST',options)}
 updateLobby(id:string,changes:{map_id?:string;faction?:Faction|'random';team?:number}){return this.request<LobbyResponse>(`/lobbies/${encodeURIComponent(id)}`,'PATCH',changes)}
 leaveLobby(id:string){return this.request<void>(`/lobbies/${encodeURIComponent(id)}/membership`,'DELETE')}
 readyLobby(id:string,version:Pick<RuntimeVersion,'simulation'|'protocol'|'content_hash'>,ready=true,assetsReady=true){return this.request<LobbyResponse>(`/lobbies/${encodeURIComponent(id)}/ready`,'POST',{...version,ready,assets_ready:assetsReady})}
 startLobby(id:string){return this.request<LobbyResponse>(`/lobbies/${encodeURIComponent(id)}/start`,'POST',{})}
 coopLobby(id:string,options:{difficulty:Difficulty;ally_ai?:Difficulty;private?:boolean;pause_enabled?:boolean}){return this.request<LobbyResponse>(`/missions/${encodeURIComponent(id)}/lobby`,'POST',options)}
 resumeCoop(id:string,options:{player?:number;private?:boolean;pause_enabled?:boolean}={}){return this.request<LobbyResponse>(`/saves/${encodeURIComponent(id)}/coop-lobby`,'POST',options)}
 listSaves(){return this.request<SaveSummary[]>('/saves')}
 async downloadSave(id:string){const response=await this.response(`/saves/${encodeURIComponent(id)}/download`);return {data:new Uint8Array(await response.arrayBuffer()),revision:Number(response.headers.get('X-Save-Revision'))}}
 async uploadSave(id:string,name:string,data:Uint8Array,expectedRevision:number){
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||data.length>64*1024*1024)throw new RuntimeError('invalid_save','The save or revision is invalid.');
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(data);
  try{const envelope=JSON.parse(raw);if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))throw new Error('invalid envelope')}catch{throw new RuntimeError('save_invalid','The engine save must contain one valid JSON document.')}

  // Preserve exact JSON integer tokens. Never JSON.parse/stringify engine bytes:
  // random state and replay seeds may exceed JavaScript's safe integer range.
  const body=`{"name":${JSON.stringify(name)},"expected_revision":${expectedRevision},"data":${raw}}`;
  const response=await this.response(`/saves/${encodeURIComponent(id)}`,'PUT',body);return response.json() as Promise<SaveSummary>;
 }
 deleteSave(id:string,revision:number){return this.request<void>(`/saves/${encodeURIComponent(id)}`,'DELETE',{revision})}
 async replay(id:string){return new Uint8Array(await(await this.response(`/replays/${encodeURIComponent(id)}`)).arrayBuffer())}
}
