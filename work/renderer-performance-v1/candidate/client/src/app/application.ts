import {AudioMixer} from '../audio/mixer';
import {AudioDirector} from '../audio/director';
import type {ObserverConnection} from '../runtime/observer';
import {randomUUID} from '../runtime/crypto';
import {OfflineTransport,SessionController,LocalStore,ContentLibrary,CampaignJourney,CampaignProgressStore,FirstRunJourney,RuntimeError,OnlineCommandAdvice,type MatchConnection,type GameMap,type LobbySlot,type ContentIndex,type SessionState,type PlayerSnapshot,type Faction,type Difficulty,type LoadedMission,type OfflineConfig} from '../runtime';
import {CatalogIndex,type Catalog} from '../content/catalog';
import {reason} from '../content/labels';
import {art} from '../render/art';
import {TutorialInputMemory} from './tutorial-memory';
import {EditorController} from './editor-controller';
import {NetworkController} from './network-controller';
import {prepareBattleAssets} from './asset-preparation';
import {mapBlueprintKey} from '../runtime/content-library';
import {environmentAssetIds,type MapEnvironment} from '../content/environment';
import {Observable} from './store';
import type {SessionEvent} from '../runtime/session';
import {readSettingsMirror,writeSettingsMirror,applySettingsToDocument,sanitizeSettings,type Settings} from './settings';
export type Page='command'|'skirmish'|'campaign'|'tutorials'|'saves'|'settings'|'network'|'replays'|'content'|'practice'|'help'|'editor';
export interface ApplicationState {briefing?:{content:LoadedMission;config:OfflineConfig;difficulty:Difficulty};booting:boolean;busy?:string;error?:string;notice?:string;page:Page;session:SessionState;index?:ContentIndex;catalog?:CatalogIndex;firstRun:boolean;settings:Settings;paused:boolean;speed:number;snapshot?:PlayerSnapshot;autosave?:string;assetStatus?:{files:number;fallbacks:string[]};assetProgress?:string}
/** Owns one active simulation. High-frequency world frames bypass React. */
export class Application {
 readonly audio:AudioMixer;readonly audioDirector:AudioDirector;
 readonly validator=new OfflineTransport();
 readonly store:LocalStore;
 readonly sessions:SessionController;
 readonly library:ContentLibrary;
 readonly campaign:CampaignJourney;
 readonly firstRun:FirstRunJourney;
 readonly state:Observable<ApplicationState>;
 readonly network:NetworkController;
 readonly editor:EditorController;readonly tutorialInput:TutorialInputMemory;
 private contentReload?:Promise<ContentIndex>;
 private assetGeneration=0;private artCleanup:Promise<void>=Promise.resolve();private onlineIdentity?:{session:string;baseURL:string;connection:Pick<MatchConnection,'match_id'|'player'|'protocol'|'simulation'|'content_hash'>};private networkProgressUnsubscribe?:()=>void;private onlineAdvice?:OnlineCommandAdvice;private settingsRevision=0;private settingsWrites:Promise<void>=Promise.resolve();private firstRunRevision=0;private lastHUD=0;private progressPending=false;private progressRecorded=new Set<string>();
 readonly frames=new Set<(snapshot:PlayerSnapshot)=>void>();
 private hudSnapshot?:PlayerSnapshot;private forceHUD=true;
 private preparedEnvironment?:{mapKey:string;data:MapEnvironment};
 constructor(){
  this.store=new LocalStore('frontline-command',data=>this.validator.inspect(data),data=>this.validator.inspectReplay(data));
  this.sessions=new SessionController({store:this.store,prepare:async(input,signal)=>{await this.contentReload?.catch(()=>{});await art.init();const map=input.map??input.config?.map,catalog=this.state?.get().catalog;if(map&&catalog&&input.kind!=='online'){const missionPlayers=input.config?.mission?.players as Array<{faction:Faction}>|undefined;const slots=input.config?.players??missionPlayers??[{faction:'US'},{faction:'IR'},{faction:'SY'},{faction:'SA'}];await this.prepareVisuals(map,[...slots,...(input.config?.tutorial_faction?[{faction:input.config.tutorial_faction}]:[])],signal)}}});
  this.library=new ContentLibrary({validator:this.validator,onLoad:event=>{if(event.stage!=='ready'&&event.stage!=='error')this.patch({busy:`${event.stage[0].toUpperCase()+event.stage.slice(1)} ${event.id}…`})}});
  this.campaign=new CampaignJourney(this.library,new CampaignProgressStore(this.store));
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
   if(event.type==='session'){const changed=event.state.id!==this.state.get().session.id;if(changed||event.state.phase==='menu'){this.hudSnapshot=undefined;this.forceHUD=true}this.audioDirector.operation(event.state.id??'');if(changed)this.audioDirector.setPaused(!['online','observer'].includes(event.state.kind??''));this.patch({session:event.state,...(event.state.phase==='menu'||changed)?{snapshot:undefined}: {}});return}
   if(event.type==='error'){this.error(event.error);return}
   if(event.type==='autosave'){this.patch({autosave:event.status.phase});return}
   if(event.type!=='runtime')return;
   const current=event.event;
   if(current.type==='presentation-reset'){this.forceHUD=true;this.audioDirector.discontinuity()}
   if(current.type==='connection')this.audioDirector.connection(current.phase);
   if(current.type==='snapshot'){
    this.audioDirector.snapshot(current.snapshot);
    for(const listener of this.frames)listener(current.snapshot);this.recordOnlineProgress();
    this.hudSnapshot=current.snapshot;
    if(this.forceHUD||this.state.get().paused||performance.now()-this.lastHUD>100||current.snapshot.outcome?.finished)this.publishHUD();
    if(current.snapshot.outcome?.finished&&this.sessions.transport instanceof OfflineTransport&&!this.progressPending&&!this.progressRecorded.has(event.session)){this.progressPending=true;const id=this.sessions.state.id;void this.campaign.recordSolo(this.sessions.transport,this.sessions.state.kind==='replay'?'replay':this.sessions.state.kind==='practice'?'practice':'solo',{isCurrent:()=>this.sessions.state.id===id}).then(()=>{if(id)this.progressRecorded.add(id)}).catch(error=>this.error(error)).finally(()=>{this.progressPending=false})}
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
  const catalog=new CatalogIndex(await this.library.catalog() as unknown as Catalog);this.patch({catalog});
  await this.reloadContent();
 });this.patch({booting:false})}
 async reloadContent():Promise<ContentIndex>{
  if(this.contentReload)return this.contentReload;
  if(this.sessions.state.phase!=='menu')throw new RuntimeError('content_busy','Return to the command menu before updating game content.');
  const work=(async()=>{const source=await this.library.fetchIndexSource();await art.useIndex(source,()=>this.sessions.state.phase==='menu');const index=this.library.useIndex(source);this.patch({index});return index})();
  this.contentReload=work;const clear=()=>{if(this.contentReload===work)this.contentReload=undefined};void work.then(clear,clear);return work;
 }
 setSettings(settings:Settings,persist=true){settings=sanitizeSettings(settings);this.audio?.update(settings);this.patch({settings});applySettingsToDocument(settings);writeSettingsMirror(settings);if(persist){const copy=structuredClone(settings);this.settingsWrites=this.settingsWrites.then(async()=>{const record=await this.store.putSetting('settings',copy,this.settingsRevision);this.settingsRevision=record.revision}).catch(error=>this.error(error))}}
 async finishFirstRun(sound:boolean,scale:number,tutorial:boolean){await this.task('Saving commander preferences…',async()=>{
  const record=await this.firstRun.complete({language:'en',ui_scale:scale,sound:sound?'enabled':'disabled',destination:tutorial?'tutorial':'modes'},this.firstRunRevision);this.firstRunRevision=record.revision;
  this.setSettings({...this.state.get().settings,uiScale:scale,audioConsent:sound,firstRunComplete:true});this.patch({firstRun:false,page:tutorial?'tutorials':'command'});
 })}
 async skirmish(mapID:string,faction:Faction,opponents:Array<{faction:Faction;difficulty:Difficulty;team:number}>,team=1){await this.task('Preparing battlefield…',async()=>{
  const content=await this.library.loadMap(mapID);const seed=(crypto.getRandomValues(new Uint32Array(1))[0]||1);
  const players=[{id:1,name:'Commander',faction,team,color:1},...opponents.map((opponent,index)=>({id:index+2,name:`${opponent.difficulty} ${opponent.faction}`,faction:opponent.faction,team:opponent.team,color:index+2,ai:opponent.difficulty}))];
  await this.sessions.startSolo({map:content.map,seed,ruleset:'standard-v2',players});
 })}
 async mission(id:string,difficulty:Difficulty){await this.task('Preparing operation briefing…',async()=>{const prepared=await this.campaign.prepareSolo(id,difficulty,(crypto.getRandomValues(new Uint32Array(1))[0]||1));this.patch({briefing:{...prepared,difficulty}})})}
 async launchBriefing(faction?:Faction){const prepared=this.state.get().briefing;if(!prepared)return;await this.task('Deploying operation…',async()=>{await this.sessions.startSolo({...prepared.config,...(faction?{tutorial_faction:faction}:{})});this.patch({briefing:undefined})})}
 async beforeBattlefield(){await this.artCleanup}
 releaseBattlefieldArt(){this.artCleanup=this.artCleanup.then(()=>art.release()).catch(error=>this.error(error));return this.artCleanup}
 private recordOnlineProgress(){const identity=this.onlineIdentity,snapshot=this.sessions.transport?.current,result=this.network.state.get().result;if(!identity||identity.session!==this.sessions.state.id||this.sessions.state.kind!=='online'||!snapshot?.mission||!snapshot.outcome?.finished||!result?.committed||result.void||result.matchId!==identity.connection.match_id||this.progressPending||this.progressRecorded.has(identity.session))return;this.progressPending=true;void this.campaign.recordServer({...identity,snapshot,result,kind:'online'},{isCurrent:()=>this.sessions.state.id===identity.session&&this.sessions.state.kind==='online'}).then(value=>{if(value.reason!=='unfinished'&&value.reason!=='result_pending')this.progressRecorded.add(identity.session)}).catch(error=>this.error(error)).finally(()=>{this.progressPending=false})}
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
 async prepareAssets(map:GameMap,slots:readonly LobbySlot[]){await this.prepareVisuals(map,slots)}
 commandAdvice(){if(!this.onlineAdvice)throw Error('Online command advice is unavailable.');return this.onlineAdvice}
 async joinObserver(base:string,connection:ObserverConnection,map:GameMap){await this.sessions.joinObserver(base,connection,map);this.onlineIdentity=undefined;this.onlineAdvice?.dispose();this.onlineAdvice=undefined;this.patch({paused:false,autosave:undefined})}
 async joinOnline(base:string,connection:MatchConnection,map:GameMap){const advice=new OnlineCommandAdvice(base,connection),previous=this.onlineAdvice;this.onlineAdvice=advice;try{await this.sessions.joinOnline(base,connection,map);this.onlineIdentity={session:this.sessions.state.id!,baseURL:base,connection:{match_id:connection.match_id,player:connection.player,protocol:connection.protocol,simulation:connection.simulation,content_hash:connection.content_hash}};previous?.dispose();this.recordOnlineProgress();this.patch({paused:false,autosave:undefined})}catch(error){this.onlineAdvice=previous;advice.dispose();throw error}}
 async save(name:string){return this.task('Saving operation…',async()=>{const record=await this.sessions.saveManual(randomUUID(),name);this.patch({notice:`Saved: ${record.name}`});return record})}
 async leave(){await this.task('Securing checkpoint…',async()=>{await this.sessions.flushAutosave();this.sessions.leave();this.onlineAdvice?.dispose();this.onlineAdvice=undefined;this.onlineIdentity=undefined;this.patch({page:this.editor.finishTest()?'editor':'command',paused:true})})}
 dispose(){this.audioDirector.dispose();this.audio.dispose();this.networkProgressUnsubscribe?.();this.editor.dispose();this.network.dispose();this.onlineAdvice?.dispose();this.sessions.dispose();this.validator.dispose();void this.store.close();this.frames.clear();void this.releaseBattlefieldArt()}
}
