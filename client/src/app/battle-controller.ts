import {BattlefieldSelection,ModifierToggles,CommandTargeting,OfflineTransport,createOfflineCommandEnvironment,createOnlineCommandEnvironment,planCommand,planContextCommand,resolvePointer,resolveShortcut,sameSelection,STANDARD_COMMAND_DESCRIPTORS,type OrderIntent,type CommandAffordances,type CommandRequest,type CommandTarget,type PlayerSnapshot,type Point,type Entity} from '../runtime';
import {BattlefieldRenderer,type BattlefieldGesture} from '../render/battlefield';
import {art} from '../render/art';
import {COMMANDS,ABILITIES,STRATEGIC,reason} from '../content/labels';
import {Observable} from './store';
import type {Application} from './application';
import {readMissionMarkers,type MissionMarker} from './mission-markers';
import {readMissionGroupLabels,missionGroups,type MissionGroupLabel} from './mission-groups';
export interface ProductionChoice {type:string;kind:'build'|'train'|'research';producer:number;available:boolean;reason?:string;waitsFor?:string}
export interface BattleState {ids:number[];affordances?:CommandAffordances;production:ProductionChoice[];target?:{kind:string;type?:string;label:string};pending:boolean;learned:string[];placementReason?:string;markers:MissionMarker[];missionGroups:MissionGroupLabel[]}
/** Input only: every executable decision is validated by the Go runtime. */
export class BattleController {
 readonly selection=new BattlefieldSelection();readonly modifiers=new ModifierToggles();readonly targeting=new CommandTargeting();
 readonly state=new Observable<BattleState>({ids:[],production:[],pending:false,learned:[],markers:[],missionGroups:[]});
 private markerMission?:string;
 private terminal=false;
 private inactive(){return !!this.snapshot?.outcome?.finished||!!this.snapshot?.players.find(player=>player.id===this.snapshot?.player)?.defeated}
 private async loadMarkers(mission:NonNullable<PlayerSnapshot['mission']>){
  const state=this.app.state.get(),entry=state.index?.missions.find(entry=>entry.id===mission.id&&entry.version===mission.version),map=state.session.map;
  if(!entry?.presentation_url||!map)return;
  try{const response=await fetch(entry.presentation_url,{signal:this.keyAbort.signal});if(!response.ok)throw Error('Objective locations are unavailable.');const text=await response.text();if(text.length>256*1024)throw Error('Operation presentation is too large.');const data=JSON.parse(text),markers=readMissionMarkers(data,map,mission),groups=this.snapshot?readMissionGroupLabels(data,this.snapshot):[];if(this.closed)return;this.state.update(state=>({...state,markers,missionGroups:groups}));this.renderer?.setMissionMarkers(markers)}catch(error){if(!this.closed)this.app.patch({notice:error instanceof Error?error.message:'Objective locations unavailable.'})}
 }
 renderer?:BattlefieldRenderer;private detachAudio?:()=>void;private snapshot?:PlayerSnapshot;private practicePlacement?:OrderIntent;private tutorialMission?:{id:string;version:string};private orderKinds=new Map<number,Array<{kind:string;entity?:Pick<Entity,'type'|'owner'>}>>();private unsubscribeResults?:()=>void;private subgroupCycle?:{groups:number[][];index:number};private scope:string;private closed=false;private generation=0;private refreshAt=0;private refreshing=false;private hoverPending=false;private advisoryWork?:Promise<unknown>;private hoverAt=0;private keyAbort=new AbortController();private activeTarget?:{kind:string;type?:string;label:string};
 constructor(readonly app:Application,readonly openPause:()=>void,readonly chooseEntryEdge:()=>void){this.scope=app.sessions.state.id!;this.unsubscribeResults=app.sessions.subscribe(event=>{if(event.type!=='runtime'||event.session!==this.scope||event.event.type!=='order-result')return;const result=event.event.result,kinds=this.orderKinds.get(result.sequence);if(!kinds)return;if(result.accepted){const kind=kinds[result.index]?.kind;if(kind)this.learn(kind)}else this.learn('rejected_order');const command=kinds[result.index];if(command)app.audioDirector.receipt(command.kind,result.accepted,command.entity,result.code);if(result.index===kinds.length-1)this.orderKinds.delete(result.sequence)})}
 private learn(kind:string){if(this.app.sessions.state.kind!=='solo'||this.state.get().learned.includes(kind))return;this.state.update(state=>({...state,learned:[...state.learned,kind]}));const mission=this.tutorialMission;if(mission)void this.app.tutorialInput.record(mission.id,mission.version,kind).catch(error=>this.app.error(error))}
 async mount(host:HTMLElement){
  await this.app.beforeBattlefield();if(this.closed)return;
  const state=this.app.state.get();if(!state.catalog||!state.session.map)throw Error('The session map and catalog must be loaded.');
  const renderer=await BattlefieldRenderer.create(host,{map:state.session.map,catalog:state.catalog,art,settings:state.settings,onGesture:gesture=>this.gesture(gesture),onError:error=>this.app.error(error)});
  if(this.closed){renderer.dispose();return}this.renderer=renderer;renderer.setMissionMarkers(this.state.get().markers);this.detachAudio=this.app.audioDirector.attachBattlefield(state.session.map,()=>({viewport:renderer.viewport(),bounds:entity=>renderer.bounds(entity)}));
  this.app.frames.add(this.frame);if(this.app.sessions.transport?.current)this.frame(this.app.sessions.transport.current);
  await renderer.whenAssetsReady();if(this.closed||this.app.sessions.state.id!==this.scope)return;if(!['online','observer'].includes(this.app.sessions.state.kind??''))await this.app.sessions.resume();
  window.addEventListener('keydown',this.key,{signal:this.keyAbort.signal});window.addEventListener('blur',()=>this.modifiers.clear(),{signal:this.keyAbort.signal});
 }
 frame=(snapshot:PlayerSnapshot)=>{
  if(!this.closed&&!this.terminal&&(snapshot.outcome?.finished||snapshot.players.find(player=>player.id===snapshot.player)?.defeated)){
   this.terminal=true;this.cancel();if(this.app.sessions.state.kind==='online')this.app.commandAdvice().cancel();this.state.update(state=>({...state,production:[],affordances:undefined,pending:false}));
  }
  if(!this.closed&&snapshot.mission&&this.markerMission!==snapshot.mission.id){this.markerMission=snapshot.mission.id;void this.loadMarkers(snapshot.mission)}
  if(this.closed)return;this.snapshot=snapshot;if(!this.tutorialMission&&this.app.sessions.state.kind==='solo'&&this.app.state.get().index?.missions.some(entry=>entry.mode==='tutorial'&&entry.id===snapshot.mission?.id)){const mission=this.tutorialMission={id:snapshot.mission!.id,version:snapshot.mission!.version};void this.app.tutorialInput.read(mission.id,mission.version).then(learned=>{if(!this.closed)this.state.update(state=>({...state,learned:[...new Set([...state.learned,...learned])]}))}).catch(error=>this.app.error(error))}const before=this.selection.token;this.selection.reconcile(snapshot,this.scope);this.renderer?.setSnapshot(snapshot);
  if(!sameSelection(before,this.selection.token))this.changed(true,false);
  if(!this.closed&&snapshot.events.some(event=>event.kind==='route_blocked'&&event.owner===snapshot.player))this.learn('rejected_order');
  if(performance.now()>this.refreshAt&&!this.refreshing){this.refreshAt=performance.now()+3000;void this.refresh()}
 };
 private changed(resetCycle=true,audible=true){if(audible&&this.snapshot)this.app.audioDirector.selection(this.snapshot.entities.filter(entity=>this.selection.ids.includes(entity.id)),this.snapshot.player);if(resetCycle)this.subgroupCycle=undefined;this.generation++;this.targeting.reconcile(this.selection.token);if(!this.targeting.targeting)this.clearTarget(false);this.renderer?.setSelection(this.selection.ids);this.state.update(state=>({...state,ids:this.selection.ids,production:[],affordances:undefined}));void this.refresh()}
 select(ids:number[]){this.selection.apply(ids);this.changed()}
 selectMissionGroup(origin:string){if(!this.snapshot)return;const group=missionGroups(this.state.get().missionGroups,this.snapshot).find(group=>group.origin===origin);if(!group?.ids.length)return;this.select(group.ids);const point=this.selection.center();if(point)this.renderer?.center(point)}
 cancel(){this.generation++;this.targeting.cancel();this.clearTarget(false);this.renderer?.cancelDrag()}
 private clearTarget(cancel=true){if(cancel)this.targeting.cancel();this.practicePlacement=undefined;this.activeTarget=undefined;this.renderer?.setTargeting(undefined);this.renderer?.setPlacement(undefined);this.state.update(state=>({...state,target:undefined,placementReason:undefined}))}
 private runtime(){const transport=this.app.sessions.transport;if(!transport)throw Error('No active operation.');return transport}
 private affordances(ids:number[]){const runtime=this.runtime();return runtime instanceof OfflineTransport?runtime.affordances(ids):this.app.commandAdvice().affordances(ids)}
 private preview(orders:Parameters<OfflineTransport['previewOrders']>[0]){const runtime=this.runtime();return runtime instanceof OfflineTransport?runtime.previewOrders(orders):this.app.commandAdvice().preview(orders)}
 async refresh(){
  if(this.closed||this.refreshing||this.state.get().pending||!this.snapshot||this.snapshot.outcome?.finished||this.snapshot.players.find(player=>player.id===this.snapshot?.player)?.defeated||['replay','observer'].includes(this.app.sessions.state.kind??''))return;this.refreshing=true;const token=this.selection.token,generation=this.generation;
  try{
   const ids=this.selection.ids.slice(0,64),work=this.affordances(ids);this.advisoryWork=work;const affordances=await work;if(this.closed||generation!==this.generation||!sameSelection(token,this.selection.token))return;
   const production:ProductionChoice[]=[];
   for(const entity of affordances.entities){for(const [key,kind] of [['builds','build'],['trains','train'],['research','research']] as const)for(const type of entity[key])if(!production.some(item=>item.type===type&&item.kind===kind)){const status=entity.production_status?.find(status=>status.kind===kind&&status.type===type);production.push({type,kind,producer:entity.id,available:status?.code==='ok'||status?.code==='indeterminate',reason:status&&status.code!=='ok'&&status.code!=='indeterminate'?reason(status.code):status?undefined:'Availability unavailable',waitsFor:status?.waits_for?reason(status.waits_for):undefined})}}
   if(this.closed||generation!==this.generation||!sameSelection(token,this.selection.token))return;
   this.state.update(state=>({...state,affordances,production}));
  }catch(error){if(!this.closed&&generation===this.generation&&sameSelection(token,this.selection.token)&&!['advice_pending','advice_unavailable','targeting_changed','player_inactive'].includes((error as {code?:string}).code??''))this.app.error(error)}finally{this.refreshing=false}
 }
 placePractice(order:OrderIntent){if(this.app.sessions.state.kind!=='practice')return;this.cancel();this.practicePlacement=structuredClone(order);this.activeTarget={kind:'practice_spawn',type:order.type,label:'Place practice forces'};this.state.update(state=>({...state,target:this.activeTarget}));this.renderer?.setTargeting('practice_spawn')}
 async command(kind:string,type?:string,producer?:number,queued=false,index?:number){
  if(['observer','replay'].includes(this.app.sessions.state.kind??'')||this.inactive())return;
  // Rebase is a targeting affordance for Go's targeted Return order.
  // The ordinary Return button and hotkey keep their immediate behavior.
  const rebase=kind==='rebase';if(rebase)kind='return';
  if(producer!==undefined&&(this.selection.ids.length!==1||this.selection.ids[0]!==producer))this.select([producer]);
  if(kind==='ability'&&type==='strategic'&&index===undefined&&this.snapshot?.players.find(player=>player.id===this.snapshot?.player)?.faction==='US'){this.chooseEntryEdge();return}
  const descriptor=STANDARD_COMMAND_DESCRIPTORS.find(value=>value.kind===kind);if(!descriptor)return;
  let target=COMMANDS[kind]?.target??(descriptor.targetOptional?'none':'ground');let count=1;let label=COMMANDS[kind]?.label??kind;
  if(rebase){target='entity';label='Rebase';queued=false}
  if(kind==='ability'&&type){const ability=type==='strategic'?STRATEGIC[this.snapshot?.players.find(player=>player.id===this.snapshot?.player)?.faction as keyof typeof STRATEGIC]:ABILITIES[type];if(ability){label=ability.label;target=ability.target==='points'?'ground':ability.target;count=ability.points??1}}
  if(kind==='build'){target='ground';label=`Place ${this.app.state.get().catalog?.name(type??'')}`}
  if(target==='none'){await this.execute({kind,type,index,entities:producer?[producer]:this.selection.ids,queued});return}
  this.generation++;this.targeting.begin({kind,type,index,queued},this.selection.token,count);this.activeTarget={kind,type,label};this.state.update(state=>({...state,target:this.activeTarget}));this.renderer?.setTargeting(kind);
  const building=kind==='build'?this.app.state.get().catalog?.buildings.get(type??''):undefined;if(building)this.renderer?.setPlacement({type:type!,width:building.width,height:building.height});
 }
 private point(point:Point):Point{return {x:Math.round(point.x),y:Math.round(point.y)}}
 private target(gesture:BattlefieldGesture):CommandTarget{
  if(this.activeTarget?.kind==='build')return {kind:'ground',position:{x:Math.round(gesture.point.x/500)*500,y:Math.round(gesture.point.y/500)*500}};
  const descriptor=STANDARD_COMMAND_DESCRIPTORS.find(value=>value.kind===this.activeTarget?.kind);
  return gesture.hit&&(!descriptor||descriptor.targets.includes(gesture.hit.kind))?gesture.hit:{kind:'ground',position:this.point(gesture.point)};
 }
 gesture(gesture:BattlefieldGesture){
  if(this.closed||!this.snapshot||this.app.state.get().busy)return;
  if(gesture.kind==='hover'){void this.hover(gesture);return}
  const entity=gesture.hit?.kind==='entity'?this.snapshot.entities.find(entity=>entity.id===(gesture.hit as {id:number}).id):undefined;
  const intent=resolvePointer({button:gesture.button,phase:gesture.kind==='box'?'drag':gesture.kind==='double-click'?'double-click':'click',hit:entity?.owner===this.snapshot.player?'owned':gesture.hit&&gesture.hit.kind!=='ground'?'visible-entity':'ground',hasSelection:this.selection.ids.length>0,targeting:this.targeting.targeting,shiftKey:gesture.shift,ctrlKey:gesture.ctrl,altKey:gesture.alt,metaKey:gesture.meta},this.app.state.get().settings.bindings,this.modifiers.context);
  if(this.practicePlacement&&gesture.kind==='context'){this.cancel();return}
  if(!intent)return;
  if(this.practicePlacement&&gesture.kind==='click'&&gesture.button===this.app.state.get().settings.bindings.pointer.select){const order:OrderIntent={kind:this.practicePlacement.kind,type:this.practicePlacement.type,target:this.practicePlacement.target,index:this.practicePlacement.index,position:this.point(gesture.point)},runtime=this.runtime();this.clearTarget();if(runtime instanceof OfflineTransport)void this.app.task('Placing practice forces…',async()=>{const preview=await runtime.previewOrders([order]);if(!preview.results[0]?.accepted)throw Error(reason(preview.results[0]?.code));await runtime.sendOrders([order])});return}
  if(intent.action==='select'){this.selection.click(entity?.id,intent.additive);this.changed();if(this.selection.ids.length===1)this.learn('single_select')}
  else if(intent.action==='select-type'&&entity&&this.renderer){this.selection.sameTypeOnScreen(entity.id,this.renderer.viewport(),value=>this.renderer!.bounds(value),intent.additive);this.changed()}
  else if(intent.action==='box-select'&&gesture.rect&&this.renderer){this.selection.box(gesture.rect,value=>this.renderer!.bounds(value),intent.additive);this.changed();if(this.selection.ids.length>1)this.learn('box_select')}
  else if(intent.action==='cancel-targeting')this.cancel();
  else if(intent.action==='clear-selection'){this.selection.clear();this.changed()}
  else if(intent.action==='confirm-target'){
   const choice=this.targeting.choose(this.target(gesture),this.selection.token,intent.queued);
   if(choice.status==='ready')void this.execute(choice.request,choice.generation).finally(()=>{if(this.targeting.current(choice.generation,this.selection.token))this.clearTarget()});
   else if(choice.status==='pending')this.app.patch({notice:`Choose ${choice.remaining} more target point${choice.remaining===1?'':'s'}.`});
  }else if(intent.action==='context-command')void this.executeContext(gesture.hit??{kind:'ground',position:this.point(gesture.point)},intent.queued);
  else if(intent.action==='force-fire')void this.execute({kind:'force_fire',entities:this.selection.ids,target:{kind:'ground',position:this.point(gesture.point)},queued:intent.queued});
 }
 private async hover(gesture:BattlefieldGesture){
  if(this.activeTarget?.kind!=='build'||this.state.get().pending||this.hoverPending||performance.now()<this.hoverAt)return;const building=this.app.state.get().catalog?.buildings.get(this.activeTarget.type!);if(!building)return;
  this.hoverPending=true;this.hoverAt=performance.now()+180;const generation=this.generation,type=this.activeTarget.type!,target=this.target(gesture);if(target.kind!=='ground'){this.hoverPending=false;return}
  this.renderer?.setPlacement({type,width:building.width,height:building.height,position:target.position});
  try{const work=this.preview([{kind:'build',type,entities:this.selection.ids.slice(0,1),position:target.position}]);this.advisoryWork=work;const result=await work;if(generation===this.generation&&!this.closed){this.renderer?.setPlacement({type,width:building.width,height:building.height,position:target.position,valid:result.results[0]?.code==='indeterminate'?undefined:result.results[0]?.accepted&&result.results[0].code==='ok'});this.state.update(state=>({...state,placementReason:reason(result.results[0]?.code)}))}}catch{/* final confirmation reports actionable errors */}finally{this.hoverPending=false}
 }
 private async executeContext(target:CommandTarget,queued:boolean){await this.plan(async environment=>planContextCommand(this.selection.ids,target,environment,{queued}))}
 async execute(request:CommandRequest,targetGeneration?:number){await this.plan(environment=>planCommand(request,environment),targetGeneration)}
 private async plan(create:(environment:Awaited<ReturnType<typeof createOfflineCommandEnvironment>>)=>ReturnType<typeof planCommand>,targetGeneration?:number){
  if(!this.snapshot||this.inactive()||this.state.get().pending||['replay','observer'].includes(this.app.sessions.state.kind??''))return;const token=this.selection.token,generation=this.generation,runtime=this.runtime();const current=()=>!this.closed&&!this.inactive()&&generation===this.generation&&sameSelection(token,this.selection.token)&&(targetGeneration===undefined||this.targeting.current(targetGeneration,this.selection.token));
  this.state.update(state=>({...state,pending:true}));
  try{if(!(runtime instanceof OfflineTransport)){this.app.commandAdvice().cancel();await Promise.allSettled([this.advisoryWork]);if(!current())return}const environment=await (runtime instanceof OfflineTransport?createOfflineCommandEnvironment(runtime,this.snapshot,this.selection.ids,{isCurrent:current}):createOnlineCommandEnvironment(this.app.commandAdvice(),this.snapshot,this.selection.ids,{isCurrent:current}));const plan=await create(environment);if(!current())return;
   if(plan.issues.length)this.learn('rejected_order');
   if(plan.issues.length){this.app.patch({notice:reason(plan.issues[0].code,plan.issues[0].message)});this.app.audioDirector.receipt('',false,this.snapshot.entities.find(entity=>this.selection.ids.includes(entity.id)&&entity.owner===this.snapshot?.player),plan.issues[0].code)}
   for(const batch of plan.batches){if(!current())return;this.orderKinds.set(await runtime.sendOrders(batch),batch.map(order=>{const entity=this.snapshot?.entities.find(entity=>entity.id===order.entities?.[0]&&entity.owner===this.snapshot?.player);return {kind:order.kind??'',entity:entity?{type:entity.type,owner:entity.owner}:undefined}}));while(this.orderKinds.size>256)this.orderKinds.delete(this.orderKinds.keys().next().value!)}
   this.refreshAt=0;
  }catch(error){if(current())this.app.error(error)}finally{if(!this.closed)this.state.update(state=>({...state,pending:false}))}
 }
 private key=(event:KeyboardEvent)=>{
  const focus=event.target as HTMLElement|null;const intent=resolveShortcut(event,this.app.state.get().settings.bindings,{...this.modifiers.context,tagName:focus?.tagName,role:focus?.getAttribute('role')??undefined,isContentEditable:focus?.isContentEditable,enabled:!document.querySelector('[role="dialog"]')});if(!intent)return;event.preventDefault();const action=intent.action;
  if(action==='escape'){if(this.targeting.targeting||this.practicePlacement)this.cancel();else this.openPause();return}
  if(action==='center_selection'){const point=this.selection.center();if(point)this.renderer?.center(point);return}
  if(action.startsWith('pan_')){if(this.app.state.get().settings.keyboardCamera){const delta=35*this.app.state.get().settings.scrollSpeed;this.renderer?.pan(action==='pan_left'?-delta:action==='pan_right'?delta:0,action==='pan_up'?-delta:action==='pan_down'?delta:0)}return}
  if(action==='zoom_in'||action==='zoom_out'){this.renderer?.zoomBy(action==='zoom_in'?1.12:1/1.12);return}
  if(action==='toggle_queue'||action==='toggle_multiselect'){this.modifiers.toggle(action==='toggle_queue'?'queue':'selection');return}
  if(action==='select_all'){this.select(this.snapshot?.entities.filter(value=>value.owner===this.snapshot?.player).map(value=>value.id)??[]);return}
  if(action==='select_same_type'&&this.selection.ids[0]&&this.renderer){this.selection.sameTypeOnScreen(this.selection.ids[0],this.renderer.viewport(),entity=>this.renderer!.bounds(entity));this.changed();return}
  const group=/^group_(\d)_(recall|store|append)$/.exec(action);if(group){if(group[2]==='recall'){const recalled=this.selection.recallGroup(Number(group[1]),performance.now());this.changed();if(this.selection.ids.length)this.learn('group_recall');if(recalled.center)this.renderer?.center(recalled.center)}else{this.selection.storeGroup(Number(group[1]),group[2]==='append');if(this.selection.ids.length)this.learn('group_store')}return}
  if(action==='quick_save'&&!['online','observer'].includes(this.app.sessions.state.kind??'')){void this.app.save('Quick save');return}
  if(action==='quick_load'&&!['online','observer'].includes(this.app.sessions.state.kind??'')){void this.app.task('Loading latest save…',async()=>{const saves=await this.app.store.listSaveSummaries();if(!saves[0])throw Error('No local saves exist.');await this.app.sessions.continueSave(saves[0].id)});return}
  if(action==='next_subgroup'||action==='previous_subgroup'){if(!this.subgroupCycle)this.subgroupCycle={groups:this.selection.subgroups().map(group=>group.ids),index:action==='next_subgroup'?-1:0};const cycle=this.subgroupCycle;if(cycle.groups.length){cycle.index=(cycle.index+(action==='next_subgroup'?1:-1)+cycle.groups.length)%cycle.groups.length;this.selection.apply(cycle.groups[cycle.index]);this.changed(false)}return}
  if(action.startsWith('ability_')){const abilities=[...new Set(this.state.get().affordances?.entities.flatMap(entity=>entity.abilities)??[])],type=abilities[Number(action.slice(8))-1];if(type)void this.command('ability',type,undefined,intent.queued);return}
  if(action==='cancel_production'){const producer=this.snapshot?.entities.find(entity=>this.selection.ids.includes(entity.id)&&entity.private?.jobs.length);if(producer)void this.execute({kind:'cancel',entities:[producer.id],index:producer.private!.jobs.length-1});return}
  if(action==='build'){const rig=this.snapshot?.entities.find(entity=>entity.owner===this.snapshot?.player&&this.app.state.get().catalog?.units.get(entity.type)?.role==='rig');if(rig)this.select([rig.id]);return}
  if(action==='train'||action==='research'){this.app.patch({notice:'Choose a production option in the command sidebar.'});return}
  if(action==='chat'||action==='team_chat'){if(this.app.sessions.state.kind==='online'){this.openPause();setTimeout(()=>document.querySelector<HTMLInputElement>('[aria-label="Chat message"]')?.focus(),0)}return}
  if(action==='center_alert'){const event=this.snapshot?.events.slice().reverse().find(value=>value.position);if(event?.position)this.renderer?.center(event.position);return}
  void this.command(action,undefined,undefined,intent.queued);
 };
 dispose(){this.closed=true;this.detachAudio?.();this.generation++;this.keyAbort.abort();this.unsubscribeResults?.();this.orderKinds.clear();this.app.frames.delete(this.frame);this.renderer?.dispose();this.renderer=undefined;void this.app.releaseBattlefieldArt()}
}
