import {AudioMixer} from '../audio/mixer';
import {AudioDirector} from '../audio/director';
import type {ObserverConnection} from '../runtime/observer';
import {randomUUID} from '../runtime/crypto';
import {OfflineTransport,SessionController,LocalStore,ContentLibrary,CampaignJourney,CampaignProgressStore,FirstRunJourney,RuntimeError,OnlineCommandAdvice,type MatchConnection,type GameMap,type LobbySlot,type ContentIndex,type SessionState,type PlayerSnapshot,type Faction,type Difficulty,type LoadedMission,type OfflineConfig} from '../runtime';
import {CatalogIndex,type Catalog} from '../content/catalog';
import {reason} from '../content/labels';
import {art,type ArtOwnershipSnapshot} from '../render/art';
import {TutorialInputMemory} from './tutorial-memory';
import {EditorController} from './editor-controller';
import {NetworkController} from './network-controller';
import {STANDARD_STARTING_CREDITS,skirmishStartingMoney} from './starting-money';
import {prepareBattleAssets} from './asset-preparation';
import {decodeContentIndex,mapBlueprintKey} from '../runtime/content-library';
import {environmentAssetIds,type MapEnvironment} from '../content/environment';
import {captureAssetGeneration} from '../runtime/asset-generation';
import {artGenerationInput} from '../runtime/asset-generation-input';
import {assertOfflineRuntime,captureOfflineRuntime,type OfflineRuntimeIdentity} from '../runtime/offline-runtime';
import {Observable} from './store';
import {CommanderProgressStore,commanderOverview,type CommanderOverview,type CommanderRecordResult} from '../runtime/commander-progress';
import {prepareCommanderChallenge,type CommanderChallengeFocus} from './commander-challenges';
import {captureCommanderFinalBinding,sameCommanderIdentity,type CommanderFinalBinding} from './commander-final-binding';
import type {MatchResult} from '../runtime';
import type {SessionEvent} from '../runtime/session';
import {readSettingsMirror,writeSettingsMirror,applySettingsToDocument,sanitizeSettings,type Settings} from './settings';
export type Page='command'|'skirmish'|'campaign'|'tutorials'|'saves'|'settings'|'network'|'replays'|'content'|'practice'|'help'|'editor'|'mastery';
export interface CommanderPendingView {id:string;faction:Faction;phase:'awaiting'|'recording'|'failed';error?:string}
interface CommanderPendingFinal {binding:CommanderFinalBinding;phase:CommanderPendingView['phase'];error?:string;recovering?:boolean}
export interface ApplicationState {briefing?:{content:LoadedMission;config:OfflineConfig;difficulty:Difficulty;challenge?:CommanderChallengeFocus};activeChallenge?:CommanderChallengeFocus;commanderStatus?:'awaiting'|'recording'|'saved'|'duplicate'|'unavailable';commanderError?:string;commanderFinals?:CommanderPendingView[];booting:boolean;busy?:string;error?:string;notice?:string;page:Page;session:SessionState;index?:ContentIndex;catalog?:CatalogIndex;firstRun:boolean;settings:Settings;paused:boolean;speed:number;snapshot?:PlayerSnapshot;autosave?:string;autosaveError?:string;assetStatus?:{files:number;fallbacks:string[]};assetProgress?:string}
/** Read-only binding to this Application's normal shared ArtLibrary. */
export interface ArtStatsReadout {
 readonly schema:'fc-art-stats-readonly/1';
 readonly status:'available'|'application-disposed';
 readonly ownership:ArtOwnershipSnapshot;
}
/** Owns one active simulation. High-frequency world frames bypass React. */
export class Application {
 readonly audio:AudioMixer;readonly audioDirector:AudioDirector;
 private readonly validationRuntime=new OfflineTransport();
 readonly validator:Pick<OfflineTransport,'ready'|'content'|'validateMap'|'validateMission'|'previewEditor'|'inspect'|'inspectReplay'|'dispose'>={
  ready:this.validationRuntime.ready,
  content:()=>this.validateContent(()=>this.validationRuntime.content()),
  validateMap:data=>this.validateContent(()=>this.validationRuntime.validateMap(data)),
  validateMission:(map,mission)=>this.validateContent(()=>this.validationRuntime.validateMission(map,mission)),
  previewEditor:(map,request)=>this.validateContent(()=>this.validationRuntime.previewEditor(map,request)),
  inspect:data=>this.validateContent(()=>this.validationRuntime.inspect(data)),
  inspectReplay:data=>this.validateContent(()=>this.validationRuntime.inspectReplay(data)),
  dispose:()=>this.validationRuntime.dispose(),
 };
 readonly store:LocalStore;
 readonly sessions:SessionController;
 readonly library:ContentLibrary;
 readonly campaign:CampaignJourney;
 readonly commander:CommanderProgressStore;
 readonly firstRun:FirstRunJourney;
 readonly state:Observable<ApplicationState>;
 readonly network:NetworkController;
 readonly editor:EditorController;readonly tutorialInput:TutorialInputMemory;
 private contentReload?:Promise<ContentIndex>;
 private runtimeIdentity?:OfflineRuntimeIdentity;private contentReaders=0;private briefingGeneration?:string;
 private assetGeneration=0;private artCleanup:Promise<void>=Promise.resolve();private onlineIdentity?:{session:string;baseURL:string;connection:Pick<MatchConnection,'match_id'|'player'|'protocol'|'simulation'|'content_hash'>};private networkProgressUnsubscribe?:()=>void;private onlineAdvice?:OnlineCommandAdvice;private settingsRevision=0;private settingsWrites:Promise<void>=Promise.resolve();private firstRunRevision=0;private lastHUD=0;private progressPending=new Map<string,Promise<void>>();private progressRecorded=new Set<string>();private challengeLaunch?:{focus?:CommanderChallengeFocus};private commanderFinals=new Map<string,CommanderPendingFinal>();private closed=false;
 readonly frames=new Set<(snapshot:PlayerSnapshot)=>void>();
 /** Available means a live reader, not asset readiness. Closed owners still
  * report the shared library's actual pending/failed ownership charges. */
 readonly readArtStats=():ArtStatsReadout=>Object.freeze({schema:'fc-art-stats-readonly/1',
  status:this.closed?'application-disposed':'available',ownership:art.ownershipSnapshot});
 private hudSnapshot?:PlayerSnapshot;private forceHUD=true;
 private preparedEnvironment?:{mapKey:string;data:MapEnvironment};
 constructor(){
  this.store=new LocalStore('frontline-command',data=>this.validator.inspect(data),data=>this.validator.inspectReplay(data));
  this.sessions=new SessionController({store:this.store,beforeLaunch:signal=>this.waitForContent(signal),expectedRuntime:async signal=>{await this.waitForContent(signal);return this.selectedRuntime()},prepare:async(input,signal)=>{signal.throwIfAborted();this.selectedRuntime();await art.init();signal.throwIfAborted();const map=input.map??input.config?.map,catalog=this.state?.get().catalog;if(map&&catalog&&input.kind!=='online'){const missionPlayers=input.config?.mission?.players as Array<{faction:Faction}>|undefined;const slots=input.config?.players??missionPlayers??[{faction:'US'},{faction:'IR'},{faction:'SY'},{faction:'SA'}];await this.prepareVisuals(map,[...slots,...(input.config?.tutorial_faction?[{faction:input.config.tutorial_faction}]:[])],signal)}}});
  this.library=new ContentLibrary({validator:this.validator,onLoad:event=>{if(event.stage!=='ready'&&event.stage!=='error')this.patch({busy:`${event.stage[0].toUpperCase()+event.stage.slice(1)} ${event.id}…`})}});
  this.campaign=new CampaignJourney(this.library,new CampaignProgressStore(this.store));
  this.commander=new CommanderProgressStore(this.store);
  this.firstRun=new FirstRunJourney(this.store,{languages:['en'],scales:[.85,1,1.15,1.25,1.5]});
  const settings=readSettingsMirror();applySettingsToDocument(settings);
  this.state=new Observable<ApplicationState>({booting:true,page:'command',session:this.sessions.state,firstRun:false,settings,paused:true,speed:1});
  this.audio=new AudioMixer(settings);this.audioDirector=new AudioDirector(this.audio,()=>this.state.get().catalog);this.audio.attach();void this.audio.loadIndex();this.audioDirector.page('command');
  art.onError=error=>this.error(error);
  this.tutorialInput=new TutorialInputMemory(this.store);
  this.editor=new EditorController(this);
  this.network=new NetworkController({library:this.library,store:this.store,validator:this.validator,sessions:this.sessions,joinOnline:(base,connection,map)=>this.joinOnline(base,connection,map),joinObserver:(base,connection,map)=>this.joinObserver(base,connection,map),prepareAssets:(map,slots)=>this.prepareAssets(map,slots),notice:notice=>this.patch({notice}),onSettingsDownloaded:()=>this.reloadSettings()});
  this.networkProgressUnsubscribe=this.network.state.subscribe(()=>this.recordOnlineProgress());
  this.sessions.subscribe(event=>this.sessionEvent(event));
 }
 private sessionEvent(event:SessionEvent){
   if(event.type==='session'){const changed=event.state.id!==this.state.get().session.id;if(changed||event.state.phase==='menu'){this.hudSnapshot=undefined;this.forceHUD=true}this.audioDirector.operation(event.state.id??'');if(changed)this.audioDirector.setPaused(!['online','observer'].includes(event.state.kind??''));this.patch({session:event.state,...(event.state.phase==='menu'||changed)?{snapshot:undefined,activeChallenge:event.state.phase==='active'&&event.state.kind==='solo'?this.challengeLaunch?.focus:undefined,commanderStatus:undefined,commanderError:undefined,autosave:undefined,autosaveError:undefined}: {}});return}
   if(event.type==='error'){this.error(event.error);return}
   if(event.type==='autosave'){this.patch({autosave:event.status.phase,autosaveError:event.status.error?.message});return}
   if(event.type!=='runtime')return;
   const current=event.event;
   if(current.type==='presentation-reset'){this.forceHUD=true;this.audioDirector.discontinuity()}
   if(current.type==='connection')this.audioDirector.connection(current.phase);
   if(current.type==='snapshot'){
    this.audioDirector.snapshot(current.snapshot);
    for(const listener of this.frames)listener(current.snapshot);this.recordOnlineProgress();
    this.hudSnapshot=current.snapshot;
    if(this.forceHUD||this.state.get().paused||performance.now()-this.lastHUD>100||current.snapshot.outcome?.finished)this.publishHUD();
    if(current.snapshot.outcome?.finished)this.recordOfflineProgress();
   }else if(current.type==='status'){this.audioDirector.status(current.status);this.audioDirector.setPaused(current.status.paused);if(current.status.paused)this.publishHUD();this.patch({paused:current.status.paused})}
   else if(current.type==='clock'){this.audioDirector.setPaused(current.paused);if(current.paused)this.publishHUD();this.patch({paused:current.paused,speed:current.speed})}
   else if(current.type==='error')this.error(current.error);
   else if(current.type==='order-result'&&!current.result.accepted)this.patch({notice:`Order rejected: ${reason(current.result.code)}`});
 }
 private publishHUD(){
  // Seek/load/perspective frames and the last frame before pause may have no
  // successor. They cannot be discarded by the live-play React throttle.
  if(!this.hudSnapshot)return;this.forceHUD=false;this.lastHUD=performance.now();
  if(this.state.get().snapshot!==this.hudSnapshot)this.patch({snapshot:this.hudSnapshot});
 }
 patch(change:Partial<ApplicationState>){this.state.update(state=>({...state,...change}));if(this.audioDirector&&(change.page!==undefined||'briefing' in change||change.session!==undefined)){const state=this.state.get();this.audioDirector.page(state.page,state.briefing?.content.entry.id)}}
 error(error:unknown){this.patch({error:RuntimeError.from(error).message,busy:undefined})}
 async task<T>(label:string,work:()=>Promise<T>):Promise<T|undefined>{this.patch({busy:label,error:undefined});try{return await work()}catch(error){if((error as {code?:string}).code==='launch_canceled')this.patch({notice:'Loading canceled.'});else this.error(error)}finally{this.patch({busy:undefined})}}
 async boot(){await this.task('Initializing command systems…',async()=>{
  const [setting,onboarding]=await Promise.all([this.store.setting<Settings>('settings'),this.firstRun.read(),this.validator.ready]);
  if(setting){this.settingsRevision=setting.revision;this.setSettings(setting.data,false)}
  this.firstRunRevision=onboarding.record?.revision??0;this.patch({firstRun:onboarding.required});
  await this.reloadContent();
 });this.patch({booting:false})}
 private selectedRuntime(){if(!this.runtimeIdentity)throw new RuntimeError('runtime_not_verified','Reload the matching game content before starting or importing a session.');return this.runtimeIdentity}
 /** A launch may wait for a reload without canceling that shared reload. A
  * rejected candidate leaves the prior verified tuple available for retry. */
 private async waitForContent(signal?:AbortSignal){
  signal?.throwIfAborted();
  while(this.contentReload){
   const pending=this.contentReload;
   await new Promise<void>((resolve,reject)=>{
    const done=()=>{signal?.removeEventListener('abort',canceled);resolve()},canceled=()=>{signal?.removeEventListener('abort',canceled);reject(signal?.reason)};
    signal?.addEventListener('abort',canceled,{once:true});void pending.then(done,done);if(signal?.aborted)canceled();
   });signal?.throwIfAborted();
  }
 }
 private async readContent<T>(read:()=>Promise<T>):Promise<T>{do{await this.waitForContent()}while(this.contentReload);this.selectedRuntime();this.contentReaders++;try{return await read()}finally{this.contentReaders--}}
 private validateContent<T>(read:()=>Promise<T>){return this.readContent(async()=>{assertOfflineRuntime(await this.validationRuntime.ready,this.selectedRuntime());return read()})}
 async reloadContent():Promise<ContentIndex>{
  if(this.contentReload)return this.contentReload;
  if(this.sessions.state.phase!=='menu'||!this.sessions.contentIdle||this.contentReaders)throw new RuntimeError('content_busy','Return to the command menu and finish reading game content before updating it.');
  const work=(async()=>{
   const source=(await this.library.fetchIndexSource()).slice();decodeContentIndex(source);
   const input=await artGenerationInput(undefined,source),generation=await captureAssetGeneration(input.source,input.packId);let runtime:OfflineRuntimeIdentity;let catalog:CatalogIndex;
   // This candidate runtime is verified before its catalog is read. The wrapped
   // validator would wait on this pending reload, so read the verified worker directly.
   try{runtime=await captureOfflineRuntime(generation);assertOfflineRuntime(await this.validator.ready,runtime);catalog=new CatalogIndex(await this.validationRuntime.content() as unknown as Catalog)}finally{generation.dispose()}
   await art.useIndex(source,next=>this.sessions.contentIdle&&this.contentReaders===0&&runtime.generation===next.key);
   // The exact source was decoded before art admission; there is no await or
   // cancellation check between these matching caller-owned publications.
   const index=this.library.useIndex(source);this.runtimeIdentity=runtime;
   try{this.patch({index,catalog})}catch(error){console.error('Frontline content subscriber failed',error)}
   return index;
  })();
  this.contentReload=work;const clear=()=>{if(this.contentReload===work)this.contentReload=undefined};void work.then(clear,clear);return work;
 }
 setSettings(settings:Settings,persist=true){settings=sanitizeSettings(settings);this.audio?.update(settings);this.patch({settings});applySettingsToDocument(settings);writeSettingsMirror(settings);if(persist){const copy=structuredClone(settings);this.settingsWrites=this.settingsWrites.then(async()=>{const record=await this.store.putSetting('settings',copy,this.settingsRevision);this.settingsRevision=record.revision}).catch(error=>this.error(error))}}
 async finishFirstRun(sound:boolean,scale:number,tutorial:boolean){await this.task('Saving commander preferences…',async()=>{
  const record=await this.firstRun.complete({language:'en',ui_scale:scale,sound:sound?'enabled':'disabled',destination:tutorial?'tutorial':'modes'},this.firstRunRevision);this.firstRunRevision=record.revision;
  this.setSettings({...this.state.get().settings,uiScale:scale,audioConsent:sound,firstRunComplete:true});this.patch({firstRun:false,page:tutorial?'tutorials':'command'});
 })}
 async skirmish(mapID:string,faction:Faction,opponents:Array<{faction:Faction;difficulty:Difficulty;team:number}>,team=1,startingCredits=STANDARD_STARTING_CREDITS){await this.task('Preparing battlefield…',()=>this.readContent(async()=>{
  const funds=skirmishStartingMoney(startingCredits);
  const content=await this.library.loadMap(mapID);const seed=(crypto.getRandomValues(new Uint32Array(1))[0]||1);
  const players=[{id:1,name:'Commander',faction,team,color:1},...opponents.map((opponent,index)=>({id:index+2,name:`${opponent.difficulty} ${opponent.faction}`,faction:opponent.faction,team:opponent.team,color:index+2,ai:opponent.difficulty}))];
  await this.sessions.startSolo({map:content.map,seed,...funds,players});
 }))}
 async mission(id:string,difficulty:Difficulty){await this.task('Preparing operation briefing…',()=>this.readContent(async()=>{const prepared=await this.campaign.prepareSolo(id,difficulty,(crypto.getRandomValues(new Uint32Array(1))[0]||1));this.briefingGeneration=this.selectedRuntime().generation;this.patch({briefing:{...prepared,difficulty}})}))}
 private async readCommandRecord():Promise<CommanderOverview>{
  const index=this.library.index;
  if(!index)throw new RuntimeError('content_index_missing','Load the installed content index first.');
  const [campaign,mastery]=await Promise.all([this.campaign.progress.read(),this.commander.read()]);
  return commanderOverview(index,campaign?.data,mastery?.data);
 }
 async commandRecord():Promise<CommanderOverview>{return this.readContent(()=>this.readCommandRecord())}
 async challenge(id:string,difficulty:Difficulty){
  await this.task('Preparing field exercise…',()=>this.readContent(async()=>{
   // Use one content read for overview, mission validation and publication.
   const prepared=await prepareCommanderChallenge(this.campaign,await this.readCommandRecord(),id,difficulty,(crypto.getRandomValues(new Uint32Array(1))[0]||1));
   this.briefingGeneration=this.selectedRuntime().generation;
   this.patch({briefing:prepared});
  }));
 }
 async launchBriefing(faction?:Faction){
  const prepared=this.state.get().briefing,generation=this.briefingGeneration;
  if(!prepared)return;
  await this.task('Deploying operation…',()=>this.readContent(async()=>{
   if(generation!==this.selectedRuntime().generation)throw new RuntimeError('content_superseded','Game content changed after this briefing. Prepare the selected operation again before deploying.');
   const launch={focus:prepared.challenge};this.challengeLaunch=launch;
   try{
    await this.sessions.startSolo({...prepared.config,...(faction?{tutorial_faction:faction}:{})});
    this.briefingGeneration=undefined;this.patch({briefing:undefined});
   }finally{if(this.challengeLaunch===launch)this.challengeLaunch=undefined}
  }));
 }
 async restartOperation(){const id=this.sessions.state.id,launch={focus:this.state.get().activeChallenge},settled=await this.settleProgress();if(this.sessions.state.id!==id)throw new RuntimeError('session_changed','The active operation changed before restart.');const recordError=this.state.get().commanderError;this.challengeLaunch=launch;try{const result=await this.sessions.restart();if(!settled||recordError)this.patch({notice:!settled?'The previous operation’s command record is still waiting. Existing local saves are preserved.':'The previous operation’s command record could not be updated. Existing local saves are preserved.'});return result}finally{if(this.challengeLaunch===launch)this.challengeLaunch=undefined}}
 async beforeBattlefield(){await this.artCleanup}
 releaseBattlefieldArt(){this.artCleanup=this.artCleanup.then(()=>art.release()).catch(error=>this.error(error));return this.artCleanup}
 /** Campaign and mastery writes are independently idempotent. A partial write can
  * be retried without awarding the successful half twice. Pending work is keyed
  * by session so a slow previous result cannot block a newly completed match. */
 private recordProgress(id:string,isCurrent:()=>boolean,campaign:()=>Promise<{recorded:boolean;reason?:string}>,mastery:()=>Promise<CommanderRecordResult>,publish:(change:Partial<ApplicationState>)=>void=change=>this.patch(change)){
  if(!isCurrent()||this.progressPending.has(id)||this.progressRecorded.has(id))return;
  const work:Promise<void>=Promise.allSettled([Promise.resolve().then(campaign),Promise.resolve().then(mastery)]).then(values=>{
   if(!isCurrent())return;
   const failure=values.find(value=>value.status==='rejected');if(failure?.status==='rejected'){publish({commanderStatus:undefined,commanderError:RuntimeError.from(failure.reason).message});return}
   const completed=values as [PromiseFulfilledResult<{recorded:boolean;reason?:string}>,PromiseFulfilledResult<CommanderRecordResult>];
   if(completed.some(value=>value.value.reason==='unfinished'||value.value.reason==='result_pending')){publish({commanderStatus:undefined});return}
   this.progressRecorded.add(id);const result=completed[1].value;
   publish({commanderStatus:result.recorded?'saved':result.reason==='duplicate'?'duplicate':'unavailable'});
  }).finally(()=>{if(this.progressPending.get(id)===work)this.progressPending.delete(id)});
  this.progressPending.set(id,work);publish({commanderStatus:'recording',commanderError:undefined});
 }
 private recordOfflineProgress(){const id=this.sessions.state.id,runtime=this.sessions.transport,kind=this.sessions.state.kind;if(!id||kind!=='solo'||!(runtime instanceof OfflineTransport)||!runtime.current?.outcome?.finished)return;const options={isCurrent:()=>this.sessions.state.id===id&&this.sessions.state.kind==='solo'&&this.sessions.transport===runtime};this.recordProgress(id,options.isCurrent,()=>this.campaign.recordSolo(runtime,'solo',options),()=>this.commander.recordSolo(runtime,'solo',options))}
 private publishCommanderFinals(){this.patch({commanderFinals:[...this.commanderFinals.entries()].map(([id,value])=>({id,faction:value.binding.snapshot.players[0].faction as Faction,phase:value.phase,error:value.error}))})}
 private currentCommanderFinal(value:CommanderPendingFinal){return !this.closed&&this.commanderFinals.get(value.binding.session)===value&&sameCommanderIdentity(this.network.commandRecordIdentity(),value.binding.identity)}
 private writeCommanderFinal(value:CommanderPendingFinal,result:MatchResult){
  if(!this.currentCommanderFinal(value)||result.matchId!==value.binding.connection.match_id)return;
  if(result.void){const id=value.binding.session;this.commanderFinals.delete(id);this.progressRecorded.add(id);this.publishCommanderFinals();if(this.sessions.state.id===id)this.patch({commanderStatus:'unavailable',commanderError:undefined});else if(this.sessions.state.phase==='menu')this.patch({notice:'The host voided this operation. No command record was awarded.'});return}
  if(value.phase==='failed'||!result.committed)return;
  const id=value.binding.session,options={isCurrent:()=>this.currentCommanderFinal(value)},input={baseURL:value.binding.baseURL,connection:value.binding.connection,snapshot:value.binding.snapshot,result,kind:'online' as const};
  this.recordProgress(id,options.isCurrent,()=>this.campaign.recordServer(input,options),()=>this.commander.recordServer(input,options),change=>{
   if(!this.currentCommanderFinal(value))return;
   if(change.commanderStatus==='saved'||change.commanderStatus==='duplicate'||change.commanderStatus==='unavailable')this.commanderFinals.delete(id);
   else{value.phase=change.commanderError?'failed':change.commanderStatus==='recording'?'recording':'awaiting';value.error=change.commanderError}
   this.publishCommanderFinals();if(this.sessions.state.id===id)this.patch(change);
  });
 }
 private recordOnlineProgress(){
  let changed=false;for(const [id,value] of this.commanderFinals)if(!this.currentCommanderFinal(value)){this.commanderFinals.delete(id);changed=true;if(this.sessions.state.id===id)this.patch({commanderStatus:'unavailable',commanderError:'The host or local profile changed before the final command record could be saved.'})}if(changed){this.publishCommanderFinals();this.patch({notice:'Pending command records were canceled because the host or local profile changed.'})}
  const identity=this.onlineIdentity,snapshot=this.sessions.transport?.current,state=this.network.state.get();
  if(identity&&identity.session===this.sessions.state.id&&this.sessions.state.kind==='online'&&snapshot?.outcome?.finished&&!this.progressRecorded.has(identity.session)&&!this.commanderFinals.has(identity.session)){
   try{
    if(this.commanderFinals.size>=8)throw new RuntimeError('commander_pending_full','Eight command records are already waiting. Retry them from the command record screen. This operation continues normally.');
    if(state.lobby?.match_id!==identity.connection.match_id)throw new RuntimeError('commander_result_mismatch','The final operation does not match the authenticated lobby.');
    const binding=captureCommanderFinalBinding({...identity,kind:'online',identity:this.network.commandRecordIdentity(),snapshot,slots:state.lobby.slots});
    if(binding){this.commanderFinals.set(identity.session,{binding,phase:'awaiting'});this.publishCommanderFinals();this.patch({commanderStatus:'awaiting',commanderError:undefined})}
   }catch(error){this.patch({commanderStatus:'unavailable',commanderError:RuntimeError.from(error).message})}
  }
  if(state.result)for(const value of this.commanderFinals.values())this.writeCommanderFinal(value,state.result);
 }
 async retryCommanderFinal(id:string){
  const value=this.commanderFinals.get(id);if(!value||value.recovering||this.progressPending.has(id))return;
  if(!this.currentCommanderFinal(value)){this.recordOnlineProgress();return}
  value.phase='awaiting';value.error=undefined;value.recovering=true;this.publishCommanderFinals();
  try{const result=await this.network.recoverCommanderResult(value.binding.connection.match_id,value.binding.identity);if(!this.currentCommanderFinal(value))return;if(result)this.writeCommanderFinal(value,result);else if(value.phase==='awaiting'){value.phase='failed';value.error='The host has not made this committed result available. Retry when the host is reachable.'}}
  catch(error){if(this.currentCommanderFinal(value)){value.phase='failed';value.error=RuntimeError.from(error).message}}
  finally{value.recovering=false;if(this.currentCommanderFinal(value))this.publishCommanderFinals()}
 }
 /** Drain already-started writes before disposal, without trapping navigation
  * if the engine or local storage stops answering. Retained online bindings
  * stay authorized independently; offline writes retain their session guard. */
 private async settleProgress():Promise<boolean>{this.recordOfflineProgress();this.recordOnlineProgress();const id=this.sessions.state.id,pending=id?this.progressPending.get(id):undefined;if(!pending)return true;let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([pending.then(()=>true),new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),5000)})])}finally{if(timer!==undefined)clearTimeout(timer)}}
 retryCommanderProgress(){const id=this.sessions.state.id;if(!id||this.progressPending.has(id))return;if(this.commanderFinals.has(id)){void this.retryCommanderFinal(id);return}this.progressRecorded.delete(id);this.patch({commanderStatus:undefined,commanderError:undefined});this.recordOfflineProgress();this.recordOnlineProgress()}
 async reloadSettings(){await this.settingsWrites;const record=await this.store.setting<Settings>('settings');if(record){this.settingsRevision=record.revision;this.setSettings(record.data,false)}}
 environmentFor(map:GameMap){return this.preparedEnvironment?.mapKey===mapBlueprintKey(map)?this.preparedEnvironment.data:undefined}
 private async prepareVisuals(map:GameMap,slots:readonly {faction:string}[],signal?:AbortSignal){
  const generation=++this.assetGeneration,catalog=this.state.get().catalog;if(!catalog)throw Error('Content catalog is not ready.');this.library.packsFor(map.required_packs??[]);art.configure(this.state.get().settings.artQuality);
  try{
   let environment:MapEnvironment|undefined;
   try{environment=await this.library.loadEnvironment(map,signal)}catch(error){signal?.throwIfAborted();const detail=RuntimeError.from(error);if(detail.code==='content_superseded')throw error;if(generation===this.assetGeneration)this.patch({notice:`Optional scenery unavailable: ${detail.message}`})}
   signal?.throwIfAborted();if(generation!==this.assetGeneration)return;
   const status=await prepareBattleAssets(map,slots,catalog,art,assetProgress=>{if(generation===this.assetGeneration)this.patch({assetProgress})},signal,environment?environmentAssetIds(environment):[]);
   if(generation===this.assetGeneration){this.preparedEnvironment=environment?{mapKey:mapBlueprintKey(map),data:environment}:undefined;this.patch({assetStatus:status})}
  }finally{if(generation===this.assetGeneration)this.patch({assetProgress:undefined})}
 }
 async prepareAssets(map:GameMap,slots:readonly LobbySlot[]){await this.readContent(()=>this.prepareVisuals(map,slots))}
 commandAdvice(){if(!this.onlineAdvice)throw Error('Online command advice is unavailable.');return this.onlineAdvice}
 async joinObserver(base:string,connection:ObserverConnection,map:GameMap){await this.sessions.joinObserver(base,connection,map);this.onlineIdentity=undefined;this.onlineAdvice?.dispose();this.onlineAdvice=undefined;this.patch({paused:false,autosave:undefined})}
 async joinOnline(base:string,connection:MatchConnection,map:GameMap){const advice=new OnlineCommandAdvice(base,connection),previous=this.onlineAdvice;this.onlineAdvice=advice;try{await this.sessions.joinOnline(base,connection,map);this.onlineIdentity={session:this.sessions.state.id!,baseURL:base,connection:{match_id:connection.match_id,player:connection.player,protocol:connection.protocol,simulation:connection.simulation,content_hash:connection.content_hash}};previous?.dispose();this.recordOnlineProgress();this.patch({paused:false,autosave:undefined})}catch(error){this.onlineAdvice=previous;advice.dispose();throw error}}
 async save(name:string){return this.task('Saving operation…',async()=>{const record=await this.sessions.saveManual(randomUUID(),name);this.patch({notice:`Saved: ${record.name}`});return record})}
 async leave(){await this.task('Securing checkpoint…',async()=>{const id=this.sessions.state.id;await this.sessions.flushAutosave();const settled=await this.settleProgress();if(this.sessions.state.id!==id)throw new RuntimeError('session_changed','The active operation changed before leaving.');const recordError=this.state.get().commanderError;this.sessions.leave();this.onlineAdvice?.dispose();this.onlineAdvice=undefined;this.onlineIdentity=undefined;this.patch({page:this.editor.finishTest()?'editor':'command',paused:true,...!settled||recordError?{notice:!settled?'The command record is still waiting. Existing local saves are preserved.':'Your command record could not be updated. Existing local saves are preserved.'}:{}})})}
 dispose(){this.closed=true;this.commanderFinals.clear();this.audioDirector.dispose();this.audio.dispose();this.networkProgressUnsubscribe?.();this.editor.dispose();this.network.dispose();this.onlineAdvice?.dispose();this.sessions.dispose();this.validator.dispose();void this.store.close();this.frames.clear();void this.releaseBattlefieldArt()}
}
