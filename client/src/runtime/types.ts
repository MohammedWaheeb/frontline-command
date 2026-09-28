import type {MessageInitShape} from '@bufbuild/protobuf';
import type {PlayerSnapshot,MatchStatus,OrderResult,MatchResult,OrderSchema} from '../protocol/frontline_pb';
import type {RuntimeError} from './errors';
export type {PlayerSnapshot,MatchStatus,OrderResult,MatchResult,Entity,Vec,Job,Economy,Metadata} from '../protocol/frontline_pb';
export type OrderIntent=MessageInitShape<typeof OrderSchema>;
export type Difficulty='easy'|'normal'|'hard';
export type Faction='US'|'IR'|'SY'|'SA';
export type Speed=0.75|1|1.5;
export interface Point{x:number;y:number}
export interface GameMap {
 id:string;title:string;author:string;version:string;format_version:number;ruleset:string;width:number;height:number;
 tiles:Array<{terrain:string;height?:number;sight_blocker?:boolean;mandatory?:boolean}>;
 spawns:Array<{position:Point;team?:number}>;shipment:Point;fields:Array<{id:number;position:Point;credits:number}>;
 stations?:Array<{id:number;position:Point}>;regions?:Array<{id:string;min:Point;max:Point}>;
 objects?:Array<{id:number;class:string;position:Point}>;required_packs?:string[];
}
export interface PlayerConfig{id:number;name:string;faction:Faction;team:number;color?:number;ai?:Difficulty;controller?:'human'|'ai'|'script'}
export interface OfflineConfig{map:GameMap;players?:PlayerConfig[];seed:number;ruleset?:string;mission?:Record<string,unknown>;difficulty?:Difficulty;tutorial_faction?:Faction;skip_countdown?:boolean}
export interface EngineMetadata{simulation:string;protocol:number;content_hash:string;map_version:string;ruleset:string;seed:number}
export interface ReplayLobby{name:string;mode:'1v1'|'2v2'|'ffa'|'coop'|'custom';private:boolean;live_observers:boolean;pause_enabled:boolean;rated:boolean}
export interface SessionInfo{adapter:string;metadata?:EngineMetadata;tick:number;local_players:number[];finished:boolean;replay:boolean;replay_start:number;replay_end:number;replay_lobby?:ReplayLobby}
export interface SaveData {data:Uint8Array;tick:number;hash:string;metadata:EngineMetadata;local_players:number[]}
export interface RuntimeVersion {adapter:string;simulation:string;protocol:number;go:string;content_hash:string}
export type ConnectionPhase='idle'|'connecting'|'connected'|'reconnecting'|'closed';
export type RuntimeEvent =
 |{type:'snapshot';snapshot:PlayerSnapshot}
 |{type:'order-result';result:OrderResult}
 |{type:'status';status:MatchStatus}
 |{type:'result';result:MatchResult}
 |{type:'connection';phase:ConnectionPhase;remainingMs?:number}
 |{type:'latency';milliseconds:number}
 |{type:'clock';paused:boolean;speed:Speed;stalled:boolean}
 |{type:'error';error:RuntimeError};
export type RuntimeListener=(event:RuntimeEvent)=>void;
export interface GameTransport {readonly mode:'offline'|'online';readonly current:PlayerSnapshot|undefined;subscribe(listener:RuntimeListener):()=>void;sendOrders(orders:OrderIntent[]):Promise<number>;pause():Promise<void>;resume():Promise<void>;dispose():void}
export class RuntimeEvents {
 private listeners=new Set<RuntimeListener>();
 subscribe(listener:RuntimeListener):()=>void{this.listeners.add(listener);return()=>this.listeners.delete(listener)}
 protected emit(event:RuntimeEvent){for(const listener of this.listeners){try{listener(event)}catch(error){console.error('Frontline runtime subscriber failed',error)}}}
 protected clearListeners(){this.listeners.clear()}
}

// Replay history shows requested commands; execution success comes from the
// replayed snapshot/results and must not be inferred from an entry alone.
export interface ReplayCommand {tick:number;player:number;sequence:number;orders:Array<{kind:string;entities?:number[];target?:number;position?:Point;type?:string;queue?:boolean;index?:number}>}
export interface ReplayCommandPage {commands:ReplayCommand[];next:number}
export interface ProductionStatus{kind:'build'|'train'|'research';type:string;code:string;waits_for?:string}
export interface EntityAffordance{id:number;commands:string[];abilities:string[];builds:string[];trains:string[];research:string[];production_status?:ProductionStatus[]}
export interface CommandAffordances{tick:number;player:number;entities:EntityAffordance[];player_commands:string[]}

/** Nonbinding owner-only advice. Absolute estimates share Go's actual launch
 * geometry; execution, delay and interception remain authoritative. */
export interface SkybreakerRoute {entry:Point;drop:Point;impact:Point;entry_at:number;release_at:number;impact_at:number;splash:number}
export interface SkybreakerPlan {order_index:number;kind:'skybreaker';edge:0|1|2|3;routes:SkybreakerRoute[]}
export interface AdviceOrderResult {player:number;sequence:number;index:number;accepted:boolean;code:string;tick:number}
export interface OrderPreview {tick:number;results:AdviceOrderResult[];plans?:SkybreakerPlan[]}
