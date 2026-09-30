import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,type PlayerSnapshot} from '../protocol/frontline_pb';
import {RuntimeError} from '../runtime/errors';
import type {MatchConnection} from '../runtime/online';

export interface CommanderHostIdentity{origin:string;profileId:string;generation:number;hostGeneration:number}
export interface CommanderFinalBinding{
 key:string;session:string;baseURL:string;identity:CommanderHostIdentity;
 connection:Pick<MatchConnection,'match_id'|'player'|'protocol'|'simulation'|'content_hash'>;
 snapshot:PlayerSnapshot;
}
export interface CommanderFinalBindingInput{
 session?:string;kind?:string;baseURL?:string;identity?:CommanderHostIdentity;
 connection?:CommanderFinalBinding['connection'];snapshot?:PlayerSnapshot;
 slots:readonly {profile?:string;player:number}[];
}
const UINT32_MAX=0xffffffff,MAX_BYTES=16*1024;
const integer=(value:unknown,maximum=Number.MAX_SAFE_INTEGER):value is number=>Number.isSafeInteger(value)&&Number(value)>=0&&Number(value)<=maximum;
const id=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value);
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const faction=(value:unknown)=>typeof value==='string'&&['US','IR','SY','SA'].includes(value);
function invalid(message='The final commander data is incomplete or inconsistent.'):never{throw new RuntimeError('commander_final_invalid',message)}
function mismatch():never{throw new RuntimeError('commander_final_mismatch','The final match does not belong to this signed-in commander and host.')}
function originOf(value:unknown):string|undefined{
 if(typeof value!=='string'||!value||value.length>2048)return undefined;
 try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/'?url.origin:undefined}catch{return undefined}
}
function validIdentity(value:CommanderHostIdentity|undefined):value is CommanderHostIdentity{
 return object(value)&&typeof value.origin==='string'&&originOf(value.origin)===value.origin&&id(value.profileId)&&integer(value.generation)&&integer(value.hostGeneration);
}
/** Absence never authenticates; re-sign-in and host epochs are exact identities. */
export function sameCommanderIdentity(a?:CommanderHostIdentity,b?:CommanderHostIdentity):boolean{
 return validIdentity(a)&&validIdentity(b)&&a.origin===b.origin&&a.profileId===b.profileId&&a.generation===b.generation&&a.hostGeneration===b.hostGeneration;
}

/** Pure bounded receipt capture. Caller separately guards the identity/session
 * while waiting for its committed host result; this helper sends no request. */
export function captureCommanderFinalBinding(input:CommanderFinalBindingInput):CommanderFinalBinding|undefined{
 const snapshot=input.snapshot;
 if(input.kind!=='online'||!snapshot?.outcome||snapshot.outcome.finished===false)return undefined;
 if(snapshot.outcome.finished!==true)invalid();
 if(snapshot.metadata?.ruleset==='practice-v1')return undefined;
 if(snapshot.metadata&&!['standard-v2','scenario-v2'].includes(snapshot.metadata.ruleset))return undefined;
 if(!validIdentity(input.identity))throw new RuntimeError('commander_final_auth','Sign in to the original match host before recording its final commander result.');
 const origin=originOf(input.baseURL),connection=input.connection,identity=input.identity;
 if(!id(input.session)||!origin||!connection||!id(connection.match_id)||!integer(connection.player,4)||connection.player<1||!integer(connection.protocol,UINT32_MAX)||connection.protocol<1||!id(connection.simulation)||typeof connection.content_hash!=='string'||!/^[a-f0-9]{64}$/.test(connection.content_hash))invalid();
 if(origin!==identity.origin) mismatch();
 if(!Array.isArray(input.slots)||input.slots.length<1||input.slots.length>4||input.slots.some(slot=>!object(slot)||!integer(slot.player,4)||slot.player<1||slot.profile!==undefined&&!id(slot.profile)))mismatch();
 const profiles=input.slots.filter(slot=>slot.profile===identity.profileId),players=input.slots.filter(slot=>slot.player===connection.player);
 if(profiles.length!==1||players.length!==1||profiles[0].player!==connection.player||players[0].profile!==identity.profileId||new Set(input.slots.map(slot=>slot.player)).size!==input.slots.length)mismatch();
 const metadata=snapshot.metadata,outcome=snapshot.outcome;
 if(!metadata||snapshot.player!==connection.player||metadata.protocol!==connection.protocol||metadata.simulation!==connection.simulation||metadata.contentHash!==connection.content_hash)mismatch();
 if(!integer(snapshot.tick,UINT32_MAX)||outcome.tick!==snapshot.tick||typeof outcome.draw!=='boolean'||!integer(outcome.winningTeam,UINT32_MAX)||!id(outcome.reason)||!id(metadata.mapVersion)||typeof metadata.seed!=='bigint'||metadata.seed<0n||metadata.seed>0xffffffffffffffffn||!Array.isArray(snapshot.players)||!Array.isArray(snapshot.debrief?.players))invalid();
 const participants=snapshot.players.filter(value=>object(value)&&value.id===snapshot.player),ownStats=snapshot.debrief.players.filter(value=>object(value)&&value.player===snapshot.player);
 if(participants.length!==1||ownStats.length!==1)invalid();
 const participant=participants[0],stats=ownStats[0],metrics=stats.metrics;
 if(!faction(participant.faction)||!integer(participant.team,UINT32_MAX)||participant.team<1||stats.faction!==participant.faction||stats.team!==participant.team||!metrics||metrics.player!==snapshot.player||![stats.exploredTiles,stats.unitsSurviving,stats.structuresSurviving,metrics.interceptorsFired,metrics.stationControlTicks].every(value=>integer(value,UINT32_MAX)))invalid();
 const mission=snapshot.mission;
 if(metadata.ruleset==='scenario-v2'&&!mission)invalid();
 if(mission&&(metadata.ruleset!=='scenario-v2'||!id(mission.id)||!id(mission.version)||!['easy','normal','hard'].includes(mission.difficulty)||!Array.isArray(mission.objectives)||mission.objectives.length>100||mission.objectives.some(value=>!object(value)||!id(value.id)||typeof value.optional!=='boolean'||typeof value.failure!=='boolean'||typeof value.complete!=='boolean')||new Set(mission.objectives.map(value=>value.id)).size!==mission.objectives.length))invalid();
 // Construct only the fields read by the final-result recorders. Protobuf's
 // unused fields retain empty defaults rather than copying source payloads.
 const reduced=create(PlayerSnapshotSchema,{
  tick:snapshot.tick,player:snapshot.player,
  metadata:{protocol:metadata.protocol,simulation:metadata.simulation,contentHash:metadata.contentHash,mapVersion:metadata.mapVersion,ruleset:metadata.ruleset,seed:metadata.seed},
  outcome:{finished:true,draw:outcome.draw,winningTeam:outcome.winningTeam,reason:outcome.reason,tick:outcome.tick},
  players:[{id:participant.id,faction:participant.faction,team:participant.team}],
  debrief:{players:[{player:stats.player,faction:stats.faction,team:stats.team,exploredTiles:stats.exploredTiles,unitsSurviving:stats.unitsSurviving,structuresSurviving:stats.structuresSurviving,metrics:{player:metrics.player,interceptorsFired:metrics.interceptorsFired,stationControlTicks:metrics.stationControlTicks}}]},
  mission:mission?{id:mission.id,version:mission.version,difficulty:mission.difficulty,objectives:mission.objectives.map(value=>({id:value.id,optional:value.optional,failure:value.failure,complete:value.complete}))}:undefined,
 });
 const binding:CommanderFinalBinding={key:JSON.stringify([input.session,connection.match_id,connection.player]),session:input.session,baseURL:origin,identity:{origin:identity.origin,profileId:identity.profileId,generation:identity.generation,hostGeneration:identity.hostGeneration},connection:{match_id:connection.match_id,player:connection.player,protocol:connection.protocol,simulation:connection.simulation,content_hash:connection.content_hash},snapshot:reduced};
 const bytes=new TextEncoder().encode(JSON.stringify(binding,(_key,value)=>typeof value==='bigint'?String(value):value)).byteLength;
 if(bytes>MAX_BYTES)throw new RuntimeError('commander_final_size','The reduced final commander record exceeds the supported 16 KiB limit.');
 return binding;
}
