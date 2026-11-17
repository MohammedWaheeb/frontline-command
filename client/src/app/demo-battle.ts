import type {ContentLibrary} from '../runtime/content-library';
import {RuntimeError} from '../runtime/errors';
import type {GameMap,GameTransport,OfflineConfig,PlayerSnapshot} from '../runtime/types';

export const DEMO_MAP_ID='copper-junction';
interface Spawn {tag:string;type:string;owner:number;position:{x:number;y:number};count:number}

/** An authored opening, executed by the same Go mission rules as every solo operation. */
export function buildDemoBattle(map:GameMap):OfflineConfig {
 if(map.id!==DEMO_MAP_ID||map.version!=='1')throw new RuntimeError('demo_battlefield_unavailable','The demo needs the installed Copper Junction battlefield, version 1.');
 const initial:Spawn[]=[];
 const add=(owner:number,type:string,x:number,y:number,count=1)=>initial.push({tag:`demo-${owner}-${initial.length}`,type,owner,position:{x:Math.round(x*1000),y:Math.round(y*1000)},count});
 // Keep clear lanes between the economy, production buildings and forward guns.
 // Aircraft homes precede their aircraft; supply centers get explicit haulers.
 const base=(owner:number)=>{
  const place=(type:string,x:number,y:number)=>add(owner,type,owner===1?x:128-x,owner===1?y:128-y);
  place('hq',18.5,64.5);
  for(const y of [54,58,62,66,70])place('power',6.5,y);
  place('supply',22.5,58.5);
  place('barracks',18,70);
  place('factory',25,65);
  place('radar',18,74);
  place('tech',12,65);
  place('depot',24,75);
  place('strategic',12,58);
  place(owner===1?'US.airfield':'IR.drone_hub',11,72);
  place('turret',29,57);
  place('turret',29,70);
  place('aa_post',26,54);
  place('aa_post',28,76);
  place('abm',18,58);
 };
 base(1);base(2);
 add(1,'US.rig',15,68);
 add(1,'US.hauler',22,55,2);
 add(1,'US.rifle',30,53,6);
 add(1,'US.at',30,57,2);
 add(1,'US.recon',27,60);
 add(1,'US.engineer',20,68);
 add(1,'US.medic',28,60);
 add(1,'US.elite',29,60);
 add(1,'US.tank',29,72,4);
 add(1,'US.apc',30,76,2);
 add(1,'US.artillery',25,70,2);
 add(1,'US.aa',30,79,2);
 add(1,'US.repair',25,78);
 add(1,'US.launcher',28,79);
 add(1,'US.fighter',10,69);
 add(1,'US.strike',12,69);
 add(1,'US.gunship',14,69);
 add(1,'US.airlift',16,69);
 add(2,'IR.rig',113,60);
 add(2,'IR.hauler',106,73,2);
 add(2,'IR.rifle',96,73,4);
 add(2,'IR.at',96,69,2);
 add(2,'IR.tank',96,56,3);
 add(2,'IR.aa',96,51);
 add(2,'IR.artillery',102,58);
 add(2,'IR.repair',102,51);
 add(2,'IR.fighter',116,59);
 add(2,'IR.strike',114,59);
 const qualifying=['hq','barracks','factory','IR.drone_hub'];
 return {map,seed:20261116,ruleset:'practice-v1',difficulty:'normal',mission:{
  id:'demo-battle',version:'1',title:'Demo — Battle-ready base',map_id:map.id,faction:'US',mode:'campaign',
  briefing:'Your US base is fully operational. Command infantry, armor and aircraft, protect your supply trucks, and defeat the opposing base.',
  debrief:'Demo operation complete.',rules_notice:'Prepared demo opening. Standard combat, power, economy and unit limits apply. This operation does not award campaign progress.',
  default_bases:false,
  players:[{id:1,name:'Demo commander',faction:'US',team:1,controller:'human',credits:25000000},{id:2,name:'Demo opponent',faction:'IR',team:2,controller:'ai',ai:'easy',credits:12000000}],
  initial,
  objectives:[{id:'defeat-opponent',text:'Destroy the opposing headquarters and production buildings.',condition:{kind:'all',children:qualifying.map(type=>({kind:'count_type',owner:2,type,compare:'at_most',count:0}))}}],
  triggers:[],difficulty:[{id:'normal',enemy_credits_multiplier:1000,wave_time_multiplier:1000}],
 }};
}

export async function prepareDemoBattle(library:Pick<ContentLibrary,'loadMap'>):Promise<OfflineConfig> {
 const {map}=await library.loadMap(DEMO_MAP_ID);
 return buildDemoBattle(map);
}

/** Preplaced haulers need an ordinary gather command after Go's opening countdown. */
export function armDemoEconomy(runtime:Pick<GameTransport,'current'|'subscribe'|'sendOrders'>,onError:(error:unknown)=>void):()=>void {
 let done=false;
 let unsubscribe=()=>{};
 const stop=()=>{done=true;unsubscribe()};
 const ready=(snapshot:PlayerSnapshot|undefined)=>{
  if(done||!snapshot)return;
  if(snapshot.mission?.id!=='demo-battle'||snapshot.outcome?.finished){stop();return}
  if(snapshot.countdown>0)return;
  const entities=snapshot.entities.filter(actor=>actor.owner===snapshot.player&&actor.type==='US.hauler').map(actor=>actor.id);
  stop();
  if(entities.length)void Promise.resolve().then(()=>runtime.sendOrders([{kind:'gather',entities}])).catch(onError);
 };
 unsubscribe=runtime.subscribe(event=>{if(event.type==='snapshot')ready(event.snapshot)});
 ready(runtime.current);
 return stop;
}
