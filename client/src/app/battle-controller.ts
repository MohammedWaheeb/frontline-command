import {BattlefieldSelection,ModifierToggles,CommandTargeting,OfflineTransport,createOfflineCommandEnvironment,createOnlineCommandEnvironment,planCommand,planContextCommand,resolvePointer,resolveShortcut,sameSelection,STANDARD_COMMAND_DESCRIPTORS,type OrderIntent,type CommandAffordances,type CommandRequest,type CommandTarget,type PlayerSnapshot,type Point,type Entity} from '../runtime';
import {BattlefieldRenderer,type BattlefieldGesture} from '../render/battlefield';
import {art} from '../render/art';
import {COMMANDS,ABILITIES,STRATEGIC,reason} from '../content/labels';
import {selectBattleAlerts} from './battle-alerts';
import {Observable} from './store';
import {SkybreakerReview,type StrikeReviewState} from './strike-review';
import type {GameTransport,OrderPreview} from '../runtime/types';
import {productionFocus,productionSources,selectionAffordances} from './production-focus';
import type {ProductionTab} from '../content/catalog';
import type {Application} from './application';
import {readMissionMarkers,type MissionMarker} from './mission-markers';
import {readMissionGroupLabels,missionGroups,type MissionGroupLabel} from './mission-groups';
import {adviceFeedback} from './advice-feedback';
import {orderFeedbackPoint} from './order-feedback';
import {selectionSettingState,observeSettingState,executionCountFeedback} from './player-controls';
import {haulerRequest,sameHaulerSelection,type HaulerAction} from './hauler-controls';
import {HaulerIncomeWindow} from './hauler-income-window';
export interface ProductionChoice {type:string;kind:'build'|'train'|'research';producer:number;available:boolean;reason?:string;waitsFor?:string}
export interface BattleState {ids:number[];affordances?:CommandAffordances;production:ProductionChoice[];productionSource?:number;adviceUnavailable?:string;target?:{kind:string;type?:string;label:string};pending:boolean;learned:string[];placementReason?:string;markers:MissionMarker[];missionGroups:MissionGroupLabel[];strikeReview?:StrikeReviewState}
/** Input only: every executable decision is validated by the Go runtime. */
export class BattleController {
 readonly selection=new BattlefieldSelection();readonly modifiers=new ModifierToggles();readonly targeting=new CommandTargeting();
 readonly state=new Observable<BattleState>({ids:[],production:[],pending:false,learned:[],markers:[],missionGroups:[]});
 private readonly strikeReview=new SkybreakerReview();private strikeAbort?:AbortController;
 private readonly incomeWindow=new HaulerIncomeWindow();private incomeRuntime?:GameTransport;
 private markerMission?:string;
 private adviceNotice?:string;
 private terminal=false;
 private sceneReady=false;private pauseRequested=false;private resumeAfterMenu=true;
 private inactive(){return !!this.snapshot?.outcome?.finished||!!this.snapshot?.players.find(player=>player.id===this.snapshot?.player)?.defeated}
 private async loadMarkers(mission:NonNullable<PlayerSnapshot['mission']>){
  const state=this.app.state.get(),entry=state.index?.missions.find(entry=>entry.id===mission.id&&entry.version===mission.version),map=state.session.map;
  if(!entry?.presentation_url||!map)return;
  try{const response=await fetch(entry.presentation_url,{signal:this.keyAbort.signal});if(!response.ok)throw Error('Objective locations are unavailable.');const text=await response.text();if(text.length>256*1024)throw Error('Operation presentation is too large.');const data=JSON.parse(text),markers=readMissionMarkers(data,map,mission),groups=this.snapshot?readMissionGroupLabels(data,this.snapshot):[];if(this.closed)return;this.state.update(state=>({...state,markers,missionGroups:groups}));this.renderer?.setMissionMarkers(markers)}catch(error){if(!this.closed)this.app.patch({notice:error instanceof Error?error.message:'Objective locations unavailable.'})}
 }
 renderer?:BattlefieldRenderer;private detachAudio?:()=>void;private snapshot?:PlayerSnapshot;private practicePlacement?:OrderIntent;private tutorialMission?:{id:string;version:string};private orderKinds=new Map<number,Array<{kind:string;player:number;point?:Point;handled?:boolean;entity?:Pick<Entity,'type'|'owner'>}>>();private unsubscribeResults?:()=>void;private subgroupCycle?:{groups:number[][];index:number};private scope:string;private closed=false;private generation=0;private refreshAt=0;private refreshing=false;private refreshPending=false;private hoverPending=false;private hoverLatest?:{generation:number;type:string;position:Point};private hoverTimer?:ReturnType<typeof setTimeout>;private advisoryWork?:Promise<unknown>;private hoverAt=0;private keyAbort=new AbortController();private activeTarget?:{kind:string;type?:string;label:string;groundOnly?:boolean};
 constructor(readonly app:Application,readonly openPause:()=>void,readonly chooseEntryEdge:()=>void,readonly onChat?:(teamOnly:boolean)=>void){
  this.scope=app.sessions.state.id!;
  this.unsubscribeResults=app.sessions.subscribe(event=>{
   if(event.type!=='runtime'||event.session!==this.scope)return;
   if(event.event.type==='presentation-reset'||event.event.type==='connection'&&event.event.phase!=='connected'){this.incomeWindow.reset();this.incomeRuntime=undefined;this.orderKinds.clear();this.renderer?.resetFeedback();return}
   if(event.event.type!=='order-result')return;
   const result=event.event.result,kinds=this.orderKinds.get(result.sequence),command=kinds?.[result.index];
   if(!kinds||!command||command.handled||command.player!==this.snapshot?.player||result.player!==command.player)return;
   if(result.accepted&&result.code==='accepted'){app.patch({notice:'Order accepted. Awaiting execution.'});return}
   command.handled=true;
   if(result.accepted){if(command.kind)this.learn(command.kind);const feedback=executionCountFeedback(result);if(feedback)app.patch({notice:feedback})}else this.learn('rejected_order');
   app.audioDirector.receipt(command.kind,result.accepted,command.entity,result.code);
   if(!result.accepted&&command.point)this.renderer?.showRejectedOrder(command.point,command.player);
   if(kinds.every(value=>value.handled))this.orderKinds.delete(result.sequence);
  });
 }
 /** A retained frame from a previous perspective/runtime cannot display income. */
 recentHaulerIncome(player:number){if(this.closed||this.app.sessions.state.id!==this.scope||this.snapshot?.player!==player||this.incomeRuntime!==this.app.sessions.transport)return;return this.incomeWindow.current}
 private learn(kind:string){if(this.app.sessions.state.kind!=='solo'||this.state.get().learned.includes(kind))return;this.state.update(state=>({...state,learned:[...state.learned,kind]}));const mission=this.tutorialMission;if(mission)void this.app.tutorialInput.record(mission.id,mission.version,kind).catch(error=>this.app.error(error))}
 async mount(host:HTMLElement){
  await this.app.beforeBattlefield();if(this.closed)return;
  const state=this.app.state.get();if(!state.catalog||!state.session.map)throw Error('The session map and catalog must be loaded.');
  const renderer=await BattlefieldRenderer.create(host,{map:state.session.map,environment:this.app.environmentFor(state.session.map),catalog:state.catalog,art,settings:state.settings,onGesture:gesture=>this.gesture(gesture),onError:error=>this.app.error(error)});
  if(this.closed){renderer.dispose();return}this.renderer=renderer;renderer.setMissionMarkers(this.state.get().markers);this.detachAudio=this.app.audioDirector.attachBattlefield(state.session.map,()=>({viewport:renderer.viewport(),bounds:entity=>renderer.bounds(entity)}));
  this.app.frames.add(this.frame);if(this.app.sessions.transport?.current)this.frame(this.app.sessions.transport.current);
  await renderer.whenAssetsReady();if(this.closed||this.app.sessions.state.id!==this.scope)return;this.sceneReady=true;if(!['online','observer'].includes(this.app.sessions.state.kind??'')&&!this.pauseRequested)await this.app.sessions.resume();
  window.addEventListener('keydown',this.key,{signal:this.keyAbort.signal});window.addEventListener('blur',()=>this.modifiers.clear(),{signal:this.keyAbort.signal});
 }
 /** Remember menu intent synchronously while the initial scene is still loading. */
 pause(){if(this.closed||this.app.sessions.state.id!==this.scope)return Promise.resolve();if(!this.pauseRequested)this.resumeAfterMenu=this.app.sessions.state.kind!=='replay'||!this.sceneReady||!this.app.state.get().paused;this.pauseRequested=true;return this.app.sessions.pause()}
 /** Closing the menu before readiness restores automatic start after assets settle. */
 resume(){if(this.closed||this.app.sessions.state.id!==this.scope)return Promise.resolve();this.pauseRequested=false;this.resumeAfterMenu=true;return this.sceneReady?this.app.sessions.resume():Promise.resolve()}
 /** Menu Close restores a ready replay’s prior playback state; explicit Resume still plays. */
 closePause(){if(this.closed||this.app.sessions.state.id!==this.scope)return Promise.resolve();if(this.resumeAfterMenu)return this.resume();this.pauseRequested=false;return Promise.resolve()}
 frame=(snapshot:PlayerSnapshot)=>{
  if(this.closed||this.app.sessions.state.id!==this.scope)return;
  if(!this.closed&&!this.terminal&&(snapshot.outcome?.finished||snapshot.players.find(player=>player.id===snapshot.player)?.defeated)){
   this.terminal=true;this.cancel();if(this.app.sessions.state.kind==='online')this.app.commandAdvice().cancel();this.state.update(state=>({...state,production:[],productionSource:undefined,affordances:undefined,pending:false}));
  }
  if(!this.closed&&snapshot.mission&&this.markerMission!==snapshot.mission.id){this.markerMission=snapshot.mission.id;void this.loadMarkers(snapshot.mission)}
  if(this.closed)return;if(this.incomeRuntime!==this.app.sessions.transport){this.incomeWindow.reset();this.incomeRuntime=this.app.sessions.transport}this.incomeWindow.observe(`${this.scope}:${this.app.sessions.state.kind??''}`,snapshot.player,snapshot.tick,snapshot.economy?.income);if(this.snapshot&&(snapshot.player!==this.snapshot.player||snapshot.tick<this.snapshot.tick))this.orderKinds.clear();this.snapshot=snapshot;if(this.state.get().strikeReview&&!this.strikeReview.state)this.clearStrikeReview();if(!this.tutorialMission&&this.app.sessions.state.kind==='solo'&&this.app.state.get().index?.missions.some(entry=>entry.mode==='tutorial'&&entry.id===snapshot.mission?.id)){const mission=this.tutorialMission={id:snapshot.mission!.id,version:snapshot.mission!.version};void this.app.tutorialInput.read(mission.id,mission.version).then(learned=>{if(!this.closed)this.state.update(state=>({...state,learned:[...new Set([...state.learned,...learned])]}))}).catch(error=>this.app.error(error))}const before=this.selection.token;this.selection.reconcile(snapshot,this.scope);this.renderer?.setSnapshot(snapshot);
  if(!sameSelection(before,this.selection.token))this.changed(true,false);
  this.reconcileProduction();
  if(!this.closed&&snapshot.events.some(event=>event.kind==='route_blocked'&&event.owner===snapshot.player))this.learn('rejected_order');
  if(performance.now()>this.refreshAt&&!this.refreshing){this.refreshAt=performance.now()+3000;void this.refresh()}
 };
 private reconcileProduction(followSelection=false){
  const catalog=this.app.state.get().catalog;if(!this.snapshot||!catalog)return;
  const old=this.state.get().productionSource,next=productionFocus(this.snapshot,catalog,old,followSelection?this.selection.ids:[]);
  if(old!==next){this.generation++;this.refreshAt=0;this.state.update(state=>({...state,productionSource:next,production:[]}))}
 }
 chooseProduction(id:number){
  const catalog=this.app.state.get().catalog;if(!this.snapshot||!catalog||!productionSources(this.snapshot,catalog).some(entity=>entity.id===id))return;
  this.cancel();this.refreshAt=0;this.state.update(state=>({...state,productionSource:id,production:[]}));void this.refresh();
 }
 productionCategory(category:ProductionTab){
  const catalog=this.app.state.get().catalog;if(!this.snapshot||!catalog)return;
  const id=productionFocus(this.snapshot,catalog,this.state.get().productionSource,[],category);if(id!==undefined&&id!==this.state.get().productionSource)this.chooseProduction(id);
 }
 private changed(resetCycle=true,audible=true){this.clearStrikeReview();if(audible&&this.snapshot)this.app.audioDirector.selection(this.snapshot.entities.filter(entity=>this.selection.ids.includes(entity.id)),this.snapshot.player);if(resetCycle)this.subgroupCycle=undefined;this.generation++;this.targeting.reconcile(this.selection.token);if(!this.targeting.targeting)this.clearTarget(false);this.renderer?.setSelection(this.selection.ids);this.reconcileProduction(true);this.state.update(state=>({...state,ids:this.selection.ids,production:[],affordances:undefined}));void this.refresh()}
 select(ids:number[]){this.selection.apply(ids);this.changed()}
 selectMissionGroup(origin:string){if(!this.snapshot)return;const group=missionGroups(this.state.get().missionGroups,this.snapshot).find(group=>group.origin===origin);if(!group?.ids.length)return;this.select(group.ids);const point=this.selection.center();if(point)this.renderer?.center(point)}
 cancel(){this.generation++;this.targeting.cancel();this.clearTarget(false);this.renderer?.cancelDrag()}
 private clearTarget(cancel=true){this.clearHover();if(/^Choose \d+ more target point/.test(this.app.state.get().notice??''))this.app.patch({notice:undefined});this.clearStrikeReview();if(cancel)this.targeting.cancel();this.practicePlacement=undefined;this.activeTarget=undefined;this.renderer?.setTargeting(undefined);this.renderer?.setPlacement(undefined);this.state.update(state=>({...state,target:undefined,placementReason:undefined}))}
 private runtime(){const transport=this.app.sessions.transport;if(!transport)throw Error('No active operation.');return transport}
 private affordances(ids:number[]){const runtime=this.runtime();return runtime instanceof OfflineTransport?runtime.affordances(ids):this.app.commandAdvice().affordances(ids)}
 private preview(orders:Parameters<OfflineTransport['previewOrders']>[0]){const runtime=this.runtime();return runtime instanceof OfflineTransport?runtime.previewOrders(orders):this.app.commandAdvice().preview(orders)}
 private adviceFailed(error:unknown,phase:'background'|'command'){
  const feedback=adviceFeedback(error,phase);
  if(feedback.kind==='ignore')return;
  if(feedback.kind==='error'){this.app.error(error);return}
  this.adviceNotice=feedback.message;
  if(phase==='background'){
   const changed=this.state.get().adviceUnavailable!==feedback.message;
   this.state.update(state=>({...state,adviceUnavailable:feedback.message,production:state.production.map(choice=>({...choice,available:false,reason:'Options unavailable'}))}));
   if(changed)this.app.patch({notice:feedback.message});
  }else this.app.patch({notice:feedback.message});
 }
 private adviceRecovered(){if(this.adviceNotice&&this.app.state.get().notice===this.adviceNotice)this.app.patch({notice:undefined});this.adviceNotice=undefined}
 /** One advice request at a time; selection/facility changes coalesce into a
  * fresh request as soon as obsolete advice settles, without a HUD-frame delay. */
 async refresh(){
  if(this.closed||this.app.sessions.state.id!==this.scope||this.state.get().pending||!this.snapshot||this.inactive()||['replay','observer'].includes(this.app.sessions.state.kind??''))return;
  const runtime=this.app.sessions.transport;if(!runtime)return;
  if(this.refreshing){this.refreshPending=true;return}this.refreshPending=false;this.refreshing=true;
  const token=this.selection.token,generation=this.generation,player=this.snapshot.player;
  const currentSession=()=>!this.closed&&this.app.sessions.state.id===this.scope&&this.app.sessions.transport===runtime&&this.snapshot?.player===player&&(!runtime.current||runtime.current.player===player)&&!this.inactive()&&!['replay','observer'].includes(this.app.sessions.state.kind??'');
  const current=()=>currentSession()&&generation===this.generation&&sameSelection(token,this.selection.token);
  try{
   if(!current())return;
   const advice=runtime instanceof OfflineTransport?undefined:this.app.commandAdvice();
   const read=(ids:number[])=>runtime instanceof OfflineTransport?runtime.affordances(ids):advice!.affordances(ids,{isCurrent:current});
   const ids=this.selection.ids.slice(0,64),source=this.state.get().productionSource;
   const request=source!==undefined&&!ids.includes(source)?[...ids,source]:ids;
   const work=(async()=>{
    const result=await read(request.slice(0,64));if(!current())return;
    if(request.length>64){const extra=await read(request.slice(64));if(!current())return;result.entities.push(...extra.entities)}
    return result;
   })();this.advisoryWork=work;const combined=await work;if(!combined||!current())return;
   const affordances=selectionAffordances(combined,ids);
   const production:ProductionChoice[]=[];
   for(const entity of combined.entities.filter(entity=>entity.id===source)){for(const [key,kind] of [['builds','build'],['trains','train'],['research','research']] as const)for(const type of entity[key])if(!production.some(item=>item.type===type&&item.kind===kind)){const status=entity.production_status?.find(status=>status.kind===kind&&status.type===type);production.push({type,kind,producer:entity.id,available:status?.code==='ok'||status?.code==='indeterminate',reason:status&&status.code!=='ok'&&status.code!=='indeterminate'?reason(status.code):status?undefined:'Availability unavailable',waitsFor:status?.waits_for?reason(status.waits_for):undefined})}}
   if(!current())return;
   this.state.update(state=>({...state,affordances,production,adviceUnavailable:undefined}));
   if(current())this.adviceRecovered();
  }catch(error){if(current())this.adviceFailed(error,'background')}finally{this.refreshing=false;if(this.refreshPending){this.refreshPending=false;if(currentSession())void this.refresh()}}
 }
 placePractice(order:OrderIntent){if(this.app.sessions.state.kind!=='practice')return;this.cancel();this.practicePlacement=structuredClone(order);this.activeTarget={kind:'practice_spawn',type:order.type,label:'Place practice forces'};this.state.update(state=>({...state,target:this.activeTarget}));this.renderer?.setTargeting('practice_spawn')}
 /** Capture the visible selection at the caller boundary, then retain the usual
  * Go affordance/preview, generation, ownership and binary transport path. */
 async configureHaulers(expected:readonly number[],action:HaulerAction){
  if(this.closed||this.app.sessions.state.id!==this.scope||!this.snapshot||!this.app.sessions.transport||this.snapshot.countdown||['observer','replay'].includes(this.app.sessions.state.kind??'')||this.inactive()||this.state.get().pending)return;
  if(!sameHaulerSelection(expected,this.selection.ids)){this.app.patch({notice:'The selection changed. Choose the hauler route again.'});return}
  const catalog=this.app.state.get().catalog;if(!catalog)return;
  const request=haulerRequest(this.snapshot,catalog,expected,this.state.get().affordances,action);
  if(!request){this.app.patch({notice:'This hauler route setting is unavailable. Select owned haulers and an observed field or active owned depot.'});return}
  this.cancel();await this.execute(request);
 }
 async command(kind:string,type?:string,producer?:number,queued=false,index?:number){
  if(this.closed||this.app.sessions.state.id!==this.scope||!this.snapshot||this.snapshot.countdown||['observer','replay'].includes(this.app.sessions.state.kind??'')||this.inactive()||this.state.get().pending)return;
  if(kind==='power'||kind==='repeat_sortie'){
   if(index!==undefined&&index!==0&&index!==1){this.app.patch({notice:'Choose Enable or Disable for this setting.'});return}
   if(index===undefined){const setting=selectionSettingState(kind,this.snapshot,producer?[producer]:this.selection.ids,this.state.get().affordances);if(!setting){this.app.patch({notice:'Select owned forces that support this setting.'});return}index=setting.nextIndex}
   queued=false;
  }
  if(kind==='ability'&&type==='observe'){
   if(index!==undefined&&index!==0&&index!==1){this.app.patch({notice:'Choose Enable or Disable for Recon Observe.'});return}
   if(index===undefined){const setting=observeSettingState(this.snapshot,producer?[producer]:this.selection.ids,this.state.get().affordances);if(!setting){this.app.patch({notice:'Select an owned recon team to Observe.'});return}index=setting.nextIndex}
   queued=false;
  }
  if(kind==='repair_reserve'&&index===undefined){this.app.patch({notice:'Choose a repair reserve amount in the command sidebar, then apply it.'});return}
  this.cancel();
  // Rebase is a targeting affordance for Go's targeted Return order.
  // The ordinary Return button and hotkey keep their immediate behavior.
  const rebase=kind==='rebase';if(rebase)kind='return';
  if(producer!==undefined&&kind==='build'&&type!=='barrier'&&(this.selection.ids.length!==1||this.selection.ids[0]!==producer))this.select([producer]);
  if(kind==='ability'&&type==='strategic'&&index===undefined&&this.snapshot?.players.find(player=>player.id===this.snapshot?.player)?.faction==='US'){this.chooseEntryEdge();return}
  const descriptor=STANDARD_COMMAND_DESCRIPTORS.find(value=>value.kind===kind);if(!descriptor)return;
  let target=COMMANDS[kind]?.target??(descriptor.targetOptional?'none':'ground');let count=1;let label=COMMANDS[kind]?.label??kind;
  if(rebase){target='entity';label='Rebase';queued=false}
  if(kind==='ability'&&type){const ability=type==='strategic'?STRATEGIC[this.snapshot?.players.find(player=>player.id===this.snapshot?.player)?.faction as keyof typeof STRATEGIC]:ABILITIES[type];if(ability){label=ability.label;target=ability.target==='points'?'ground':ability.target;count=ability.points??1}}
  if(kind==='build'){target='ground';label=`Place ${this.app.state.get().catalog?.name(type??'')}`}
  if(target==='none'){await this.execute({kind,type,index,entities:producer?[producer]:this.selection.ids,queued});return}
  this.generation++;this.targeting.begin({kind,type,index,queued},this.selection.token,count);this.activeTarget={kind,type,label,groundOnly:kind==='ability'&&target==='ground'};this.state.update(state=>({...state,target:this.activeTarget}));this.renderer?.setTargeting(kind);
  const building=kind==='build'?this.app.state.get().catalog?.buildings.get(type??''):undefined;if(building)this.renderer?.setPlacement({type:type!,width:building.width,height:building.height});
 }
 private point(point:Point):Point{return {x:Math.round(point.x),y:Math.round(point.y)}}
 private target(gesture:BattlefieldGesture):CommandTarget{
  if(this.activeTarget?.kind==='build')return {kind:'ground',position:{x:Math.round(gesture.point.x/500)*500,y:Math.round(gesture.point.y/500)*500}};
  if(this.activeTarget?.groundOnly)return {kind:'ground',position:this.point(gesture.point)};
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
   const choice=this.targeting.choose(this.target(gesture),this.selection.token,this.activeTarget?.kind==='return'||STANDARD_COMMAND_DESCRIPTORS.find(command=>command.kind===this.activeTarget?.kind)?.queueable===false?false:intent.queued);
   if(choice.status==='ready'&&this.isSkybreaker(choice.request))void this.reviewStrike(choice.request);
   else if(choice.status==='ready')void this.execute(choice.request,choice.generation).finally(()=>{if(this.targeting.current(choice.generation,this.selection.token))this.clearTarget()});
   else if(choice.status==='pending')this.app.patch({notice:`Choose ${choice.remaining} more target point${choice.remaining===1?'':'s'}.`});
  }else if(intent.action==='context-command')void this.executeContext(gesture.hit??{kind:'ground',position:this.point(gesture.point)},intent.queued);
  else if(intent.action==='force-fire')void this.execute({kind:'force_fire',entities:this.selection.ids,target:{kind:'ground',position:this.point(gesture.point)},queued:intent.queued});
 }
 /** Pointer presentation stays immediate while Go preview requests remain
  * serialized and throttled. Only advice for the latest snapped site may paint. */
 private hover(gesture:BattlefieldGesture){
  if(this.closed||this.activeTarget?.kind!=='build'||this.state.get().pending)return;
  const type=this.activeTarget.type!,building=this.app.state.get().catalog?.buildings.get(type);if(!building)return;
  const target=this.target(gesture);if(target.kind!=='ground')return;const latest=this.hoverLatest;
  if(!latest||latest.generation!==this.generation||latest.type!==type||latest.position.x!==target.position.x||latest.position.y!==target.position.y){
   this.hoverLatest={generation:this.generation,type,position:{...target.position}};
   this.renderer?.setPlacement({type,width:building.width,height:building.height,position:target.position});
   this.state.update(state=>({...state,placementReason:undefined}));
  }
  void this.refreshHover();
 }
 private clearHover(){if(this.hoverTimer!==undefined)clearTimeout(this.hoverTimer);this.hoverTimer=undefined;this.hoverLatest=undefined;this.hoverAt=0}
 private async refreshHover(){
  const latest=this.hoverLatest;if(!latest||this.closed||this.app.sessions.state.id!==this.scope||!this.snapshot||this.inactive()||['replay','observer'].includes(this.app.sessions.state.kind??'')||this.state.get().pending||this.hoverPending||latest.generation!==this.generation||this.activeTarget?.kind!=='build'||this.activeTarget.type!==latest.type)return;
  const runtime=this.app.sessions.transport;if(!runtime)return;const player=this.snapshot.player;
  const currentSession=()=>!this.closed&&this.app.sessions.state.id===this.scope&&this.app.sessions.transport===runtime&&this.snapshot?.player===player&&(!runtime.current||runtime.current.player===player)&&!this.inactive()&&!['replay','observer'].includes(this.app.sessions.state.kind??'');
  if(!currentSession())return;
  const building=this.app.state.get().catalog?.buildings.get(latest.type);if(!building)return;
  const remaining=this.hoverAt-performance.now();if(remaining>0){if(this.hoverTimer===undefined)this.hoverTimer=setTimeout(()=>{this.hoverTimer=undefined;if(currentSession())void this.refreshHover()},remaining);return}
  if(this.hoverTimer!==undefined)clearTimeout(this.hoverTimer);this.hoverTimer=undefined;this.hoverPending=true;this.hoverAt=performance.now()+180;
  try{const orders=[{kind:'build',type:latest.type,entities:latest.type==='barrier'?this.selection.ids.slice():this.selection.ids.slice(0,1),position:latest.position}];const work=runtime instanceof OfflineTransport?runtime.previewOrders(orders):this.app.commandAdvice().preview(orders,{isCurrent:currentSession});this.advisoryWork=work;const result=await work;
   if(currentSession()&&latest===this.hoverLatest&&latest.generation===this.generation){this.renderer?.setPlacement({type:latest.type,width:building.width,height:building.height,position:latest.position,valid:result.results[0]?.code==='indeterminate'?undefined:result.results[0]?.accepted&&result.results[0].code==='ok'});this.state.update(state=>({...state,placementReason:reason(result.results[0]?.code)}))}
  }catch{/* final confirmation reports actionable errors */}finally{this.hoverPending=false;if(currentSession()&&this.hoverLatest&&this.hoverLatest!==latest)void this.refreshHover()}
 }
 private isSkybreaker(request:CommandRequest){return request.kind==='ability'&&request.type==='strategic'&&this.snapshot?.players.find(player=>player.id===this.snapshot?.player)?.faction==='US'}
 private clearStrikeReview(){
  this.strikeAbort?.abort();this.strikeAbort=undefined;this.strikeReview.clear();this.renderer?.setStrikePreview(undefined);
  if(this.state.get().strikeReview)this.state.update(state=>({...state,strikeReview:undefined,pending:false}));
 }
 private async reviewStrike(request:CommandRequest){
  if(!this.snapshot||this.inactive()||this.state.get().pending||['replay','observer'].includes(this.app.sessions.state.kind??''))return;
  this.cancel();const token=this.selection.token,generation=this.generation,runtime=this.runtime(),player=this.snapshot.player,abort=this.strikeAbort=new AbortController();
  const current=()=>!this.closed&&!abort.signal.aborted&&!this.inactive()&&this.app.sessions.state.id===this.scope&&this.app.sessions.transport===runtime&&this.snapshot?.player===player&&!['replay','observer'].includes(this.app.sessions.state.kind??'')&&generation===this.generation&&sameSelection(token,this.selection.token);
  const ticket=this.strikeReview.begin(request,current);this.state.update(state=>({...state,strikeReview:this.strikeReview.state,pending:true}));
  try{
   if(!(runtime instanceof OfflineTransport)){this.app.commandAdvice().cancel();await Promise.allSettled([this.advisoryWork]);if(!current())return}
   let preview:OrderPreview|undefined;const options={signal:abort.signal,isCurrent:current,onPreview:(value:OrderPreview)=>{preview=value}};
   const environment=await (runtime instanceof OfflineTransport?createOfflineCommandEnvironment(runtime,this.snapshot,request.entities,options):createOnlineCommandEnvironment(this.app.commandAdvice(),this.snapshot,request.entities,options));
   const plan=await planCommand(request,environment);if(!current())return;
   if(plan.issues.length||plan.orders.length!==1||!preview){this.strikeReview.fail(ticket,reason(plan.issues[0]?.code??'preview_unavailable',plan.issues[0]?.message));if(plan.issues.length)this.learn('rejected_order')}
   else this.strikeReview.complete(ticket,preview);
   const review=this.strikeReview.state;this.state.update(state=>({...state,strikeReview:review}));this.renderer?.setStrikePreview(review?.plan,review?.observedTick);
  }catch(error){if(current()){const review=this.strikeReview.fail(ticket,error instanceof Error?error.message:'Approach preview unavailable.');this.state.update(state=>({...state,strikeReview:review}))}}
  finally{if(current())this.state.update(state=>({...state,pending:false}))}
 }
 async confirmStrike(){if(this.state.get().pending)return;const request=this.strikeReview.consume();if(!request)return;this.clearStrikeReview();await this.plan(environment=>planCommand(request,environment),undefined,request.entities)}
 retargetStrike(){const edge=this.strikeReview.state?.edge;this.cancel();if(edge!==undefined)void this.command('ability','strategic',undefined,false,edge)}
 private async executeContext(target:CommandTarget,queued:boolean){this.cancel();await this.plan(async environment=>planContextCommand(this.selection.ids,target,environment,{queued}))}
 async execute(request:CommandRequest,targetGeneration?:number){
  const descriptor=STANDARD_COMMAND_DESCRIPTORS.find(value=>value.kind===request.kind);
  // Explicit ordinary actions use capable owned actors; paid jobs stay single.
  if(request.allowPartial===undefined&&descriptor&&(descriptor.selection==='group'||descriptor.selection==='each'||request.kind==='build'&&request.type==='barrier'))request={...request,allowPartial:true};
  if(this.isSkybreaker(request)){await this.reviewStrike(request);return}this.clearStrikeReview();await this.plan(environment=>planCommand(request,environment),targetGeneration,request.entities)}
 private async plan(create:(environment:Awaited<ReturnType<typeof createOfflineCommandEnvironment>>)=>ReturnType<typeof planCommand>,targetGeneration?:number,adviceIDs:readonly number[]=this.selection.ids){
  if(this.closed||this.app.sessions.state.id!==this.scope||!this.snapshot||this.snapshot.countdown||this.inactive()||this.state.get().pending||['replay','observer'].includes(this.app.sessions.state.kind??''))return;const token=this.selection.token,generation=this.generation,runtime=this.runtime(),player=this.snapshot.player;const current=()=>!this.closed&&this.app.sessions.state.id===this.scope&&this.app.sessions.transport===runtime&&this.snapshot?.player===player&&!this.snapshot.countdown&&!['replay','observer'].includes(this.app.sessions.state.kind??'')&&!this.inactive()&&generation===this.generation&&sameSelection(token,this.selection.token)&&(targetGeneration===undefined||this.targeting.current(targetGeneration,this.selection.token));
  this.state.update(state=>({...state,pending:true}));
  try{if(!(runtime instanceof OfflineTransport)){this.app.commandAdvice().cancel();await Promise.allSettled([this.advisoryWork]);if(!current())return}const environment=await (runtime instanceof OfflineTransport?createOfflineCommandEnvironment(runtime,this.snapshot,adviceIDs,{isCurrent:current}):createOnlineCommandEnvironment(this.app.commandAdvice(),this.snapshot,adviceIDs,{isCurrent:current}));const plan=await create(environment);if(!current())return;
   let partialNotice:string|undefined;
   const failed=plan.issues.filter(issue=>issue.code!=='unsupported_command');
   if(failed.length||!plan.orders.length&&plan.issues.length)this.learn('rejected_order');
   if(failed.length||!plan.orders.length&&plan.issues.length){const issue=failed[0]??plan.issues[0];this.app.patch({notice:!plan.orders.length&&issue.code==='unsupported_command'?'No selected units support this action. Their current orders are unchanged.':reason(issue.code,issue.message)});this.app.audioDirector.receipt('',false,this.snapshot.entities.find(entity=>this.selection.ids.includes(entity.id)&&entity.owner===this.snapshot?.player),issue.code)}
   else if(plan.issues.length){const skipped=plan.issues.reduce((count,issue)=>count+issue.entities.length,0);partialNotice=`${skipped} unsupported selected unit${skipped===1?'':'s'} keep their current orders.`;this.app.patch({notice:`Sending order. ${partialNotice}`})}
   for(const batch of plan.batches){
    if(!current())return;
    const player=this.snapshot.player,feedback=batch.map(order=>{const entity=this.snapshot?.entities.find(entity=>entity.id===order.entities?.[0]&&entity.owner===player);return {kind:order.kind??'',player,point:orderFeedbackPoint(order),entity:entity?{type:entity.type,owner:entity.owner}:undefined}});
    const sequence=await runtime.sendOrders(batch);if(!current())return;this.orderKinds.set(sequence,feedback);
    while(this.orderKinds.size>256)this.orderKinds.delete(this.orderKinds.keys().next().value!);
   }
   if(partialNotice)this.app.patch({notice:`Order sent. ${partialNotice}`});
   this.refreshAt=0;
   this.adviceRecovered();
  }catch(error){if(current())this.adviceFailed(error,'command')}finally{if(!this.closed)this.state.update(state=>({...state,pending:false}))}
 }
 private key=(event:KeyboardEvent)=>{
  const focus=event.target as HTMLElement|null;const intent=resolveShortcut(event,this.app.state.get().settings.bindings,{...this.modifiers.context,tagName:focus?.tagName,role:focus?.getAttribute('role')??undefined,isContentEditable:focus?.isContentEditable,enabled:!document.querySelector('[role="dialog"]')});if(!intent)return;event.preventDefault();const action=intent.action;
  if(action==='escape'){if(this.targeting.targeting||this.practicePlacement||this.state.get().strikeReview)this.cancel();else this.openPause();return}
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
  if(action==='cancel_production'){const producer=this.snapshot?.entities.find(entity=>entity.id===this.state.get().productionSource&&entity.private?.jobs.length);if(producer)void this.execute({kind:'cancel',entities:[producer.id],index:producer.private!.jobs.length-1});return}
  if(action==='build'){const rig=this.snapshot?.entities.find(entity=>entity.owner===this.snapshot?.player&&this.app.state.get().catalog?.units.get(entity.type)?.role==='rig');if(rig)this.select([rig.id]);return}
  if(action==='train'||action==='research'){this.app.patch({notice:'Choose a production option in the command sidebar.'});return}
  if(action==='repair_reserve'){if(!this.closed&&this.app.sessions.state.id===this.scope&&!this.inactive()&&!['replay','observer'].includes(this.app.sessions.state.kind??''))document.querySelector<HTMLInputElement>('[data-repair-reserve]')?.focus();return}
  if(action==='chat'||action==='team_chat'){if(this.app.sessions.state.kind==='online'){this.onChat?.(action==='team_chat');this.openPause();setTimeout(()=>document.querySelector<HTMLInputElement>('[aria-label="Chat message"]')?.focus(),0)}return}
  if(action==='center_alert'){const event=selectBattleAlerts(this.snapshot?.events??[]).latestActionable?.event;if(event?.position)this.renderer?.center(event.position);return}
  void this.command(action,undefined,undefined,intent.queued);
 };
 dispose(){this.clearHover();this.clearStrikeReview();this.closed=true;this.detachAudio?.();this.generation++;this.keyAbort.abort();this.unsubscribeResults?.();this.incomeWindow.reset();this.incomeRuntime=undefined;this.orderKinds.clear();this.app.frames.delete(this.frame);this.renderer?.dispose();this.renderer=undefined;void this.app.releaseBattlefieldArt()}
}
