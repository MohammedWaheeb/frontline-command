import {Application,Container,Graphics,Texture,Text} from 'pixi.js';
import type {CommandTarget,Entity,GameMap,PlayerSnapshot,Point,Rect} from '../runtime';
import type {MapEnvironment,EnvironmentObjectSkin} from '../content/environment';
import type {CatalogIndex} from '../content/catalog';
import type {Settings} from '../app/settings';
import {tokens} from '../design/tokens';
import {ArtLibrary} from './art';
import {ActorVisual} from './actors';
import {SurfaceShadows} from './surface-shadows';
import {EnvironmentRenderer} from './environment';
import {actorArtKey,physicalArtType} from './art-id';
import {buildingPresentations} from './poses';
import {CHUNK,TerrainBaker,type TerrainFragment} from './terrain';
import {TerrainSurface,projectSurfaceVertex} from './terrain-surface';
import {toWorld} from './iso';
import {drawStructure} from './structure';
import {activeMissionMarkers,type MissionMarker} from '../app/mission-markers';
import {minimapLayout,minimapProject,minimapWorldPoint} from './minimap';
import {ownerRanges} from '../app/owner-ranges';
import {tacticalCircle} from './tactical-geometry';
import {PlacementGhost} from './placement-ghost';
import type {RangeMode} from './range-geometry';
import {memoryCaption} from '../app/battlefield-cues';
import {soldDestruction} from '../app/combat-feedback';
import {actorStatus} from '../app/actor-status';
import {ownedBoardingReceivers} from '../app/transport-presentation';
import {tacticalPresentation,type TacticalPresentation} from '../app/tactical-presentation';
import {TacticalOverlay} from './tactical-overlay';
import {StrikePreviewOverlay} from './strike-preview';
import {CombatEffects} from './combat-effects';
import type {SkybreakerPlan} from '../runtime/types';

export interface BattlefieldGesture {
 kind:'click'|'double-click'|'context'|'box'|'hover';point:Point;hit?:CommandTarget;rect?:Rect;
 shift:boolean;ctrl:boolean;alt:boolean;meta:boolean;button:number;
}
export interface BattlefieldOptions {
 map:GameMap;catalog:CatalogIndex;art:ArtLibrary;settings:Settings;environment?:MapEnvironment;
 onGesture:(event:BattlefieldGesture)=>void;onError?:(error:Error)=>void;
}
export interface PlacementPreview {type:string;width:number;height:number;position?:Point;valid?:boolean}
interface Chunk {fragments:TerrainFragment[];texture:Texture;used:number;visible:boolean}
const color=(hex:string)=>parseInt(hex.replace('#',''),16);
const clamp=(value:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,value));
const MINIMAP_MS=80;
/** Last-seen tag size in screen px: follows the HUD scale, never below 11px. */
export const memoryLabelSize=(uiScale:number)=>Math.round(Math.max(11,12*(Number.isFinite(uiScale)?uiScale:1)));

/** Fixed-camera presentation over authorized snapshots; never simulates game rules. */
export class BattlefieldRenderer {
 private readonly app=new Application();private readonly world=new Container();
 private readonly ground=new Container();
 private readonly surfaceShadows=new SurfaceShadows(this.ground);
 private readonly actorStatuses=new Container();
 private readonly placementGhost:PlacementGhost;private combat:CombatEffects;private effectsReleased:Promise<void>=Promise.resolve();
 private readonly memoryLabels:Container[]=[];private readonly memories:Container[]=[];private readonly tactical=new Graphics();private readonly overlay=new Graphics();
 private readonly strikePreview=new StrikePreviewOverlay();private readonly tacticalOverlay=new TacticalOverlay();private tacticalModel?:TacticalPresentation;
 private readonly objectSkins=new Map<string,EnvironmentObjectSkin>();
 private readonly actors=new Map<number,ActorVisual>();private environment:EnvironmentRenderer;
 private readonly chunks=new Map<string,Chunk>();
 private readonly deaths:Array<{actor:ActorVisual;until:number}>=[];
 private surface:TerrainSurface;
 private readonly listeners=new AbortController();private resizeObserver?:ResizeObserver;
 private baker:TerrainBaker;private snapshot?:PlayerSnapshot;private selected=new Set<number>();private settings:Settings;
 private camera={x:0,y:0,zoom:1};private centered=false;private disposed=false;private tickAt=0;
 private drag?:{start:Point;last:Point;button:number;pointer:number};private pointer?:Point;
 private rangeMode:RangeMode='off';private placement?:PlacementPreview;private targeting?:string;private lastHover=0;private frame=0;private fogTick=-1;
 private memoryKey='';private rubbleKey='';private terrainKey='';private lost=false;private presentationMap:GameMap;
 private effectEvent=0;private feedbackBaseline=false;private shake={until:0,strength:0,x:0,y:0};
 private missionMarkers:MissionMarker[]=[];
 private rejection?:{point:Point;player:number;tick:number;until:number};
 // Attached minimap: dirtied by snapshot/overlay/camera changes, repainted from the existing ticker at most every MINIMAP_MS.
 private minimap?:{canvas:HTMLCanvasElement;resize:ResizeObserver;view:number[]};private minimapDirty=false;private minimapAt=-Infinity;
 private constructor(private host:HTMLElement,private options:BattlefieldOptions){this.placementGhost=new PlacementGhost(options.art);this.combat=new CombatEffects(options.catalog,options.map,options.onError,options.art.fetch);this.settings=options.settings;this.presentationMap={...options.map,tiles:options.map.tiles.map(tile=>({...tile}))};this.baker=new TerrainBaker(this.presentationMap,options.art);this.surface=new TerrainSurface(this.presentationMap);this.environment=new EnvironmentRenderer(options.map,options.art,this.ground,this.surface,options.environment);for(const skin of options.environment?.object_skins??[]){const object=options.map.objects?.find(o=>o.id===skin.object_id);if(object)this.objectSkins.set(`map.${object.class}:${object.position.x}:${object.position.y}`,skin)}}
 static async create(host:HTMLElement,options:BattlefieldOptions):Promise<BattlefieldRenderer>{
  const renderer=new BattlefieldRenderer(host,options);
  try{await renderer.init();return renderer}catch(error){renderer.dispose();throw error}
 }
 private async init(){
  this.options.art.configure(this.settings.artQuality);await this.options.art.init();await this.baker.load();
  try{await this.combat.init(this.options.art.index?.effects)}catch(error){this.options.onError?.(error instanceof Error?error:Error(String(error)))}
  await this.app.init({resizeTo:this.host,background:0x14130f,antialias:true,resolution:Math.min(devicePixelRatio,2),autoDensity:true,preference:'webgl'});
  if(this.disposed){this.app.destroy(true,{children:true});return}
  const canvas=this.app.canvas;canvas.tabIndex=0;canvas.setAttribute('aria-label','Battlefield. Select units and give orders.');canvas.style.display='block';canvas.style.touchAction='none';canvas.style.outlineColor='var(--fc-color-brass-light, #d0ae66)';canvas.style.outlineOffset='-2px';
  this.host.appendChild(canvas);
  this.surfaceShadows.configure(this.app.renderer);
  this.app.stage.addChild(this.world,this.overlay);this.world.addChild(this.ground,this.combat.root,this.tactical,this.tacticalOverlay.root,this.strikePreview.root,this.placementGhost.root,this.actorStatuses);this.ground.sortableChildren=true;this.actorStatuses.eventMode='none';
  const m=this.options.map;
  this.center(m.spawns[0]?.position??{x:m.width*500,y:m.height*500});
  this.bindInput();this.resizeObserver=new ResizeObserver(()=>{if(!this.disposed){this.app.resize();this.cameraTransform()}});this.resizeObserver.observe(this.host);
  this.app.ticker.add(()=>this.render());
 }
 get missingArt():string[]{
  const actors=[...this.actors.values()].filter(actor=>actor.root.visible).flatMap(actor=>[
   ...(actor.standIn||actor.missingArt?[actor.entity.type]:[]),
   ...(actor.missingPayloadArt?[`${actor.entity.type}:${actor.missingPayloadArt}`]:[]),
  ]);
  return [...new Set([...this.environment.missingArt,...this.combat.diagnostics.missing,...actors])].sort();
 }
 setMissionMarkers(markers:MissionMarker[]){this.missionMarkers=structuredClone(markers);this.minimapDirty=true}
 async whenAssetsReady(){await Promise.all([...this.actors.values()].map(actor=>actor.ready));await this.environment.ready();this.render();await this.placementGhost.settle();this.render();await Promise.all([this.options.art.settle(),this.combat.settle()]);this.render();await this.combat.settle();this.render()}
 viewport():Rect{return {left:0,top:0,right:this.app.screen.width,bottom:this.app.screen.height}}
 center(point:Point){const p=this.surface.projectGround(point);this.camera.x=p.x;this.camera.y=p.y;this.cameraTransform()}
 pan(dxPixels:number,dyPixels:number){this.camera.x+=dxPixels/this.camera.zoom;this.camera.y+=dyPixels/this.camera.zoom;this.limitCamera();this.cameraTransform()}
 zoomBy(factor:number,anchor?:Point){
  if(!Number.isFinite(factor)||factor<=0)return;
  const a=anchor??{x:this.app.screen.width/2,y:this.app.screen.height/2},before=this.screenToIso(a);
  this.camera.zoom=clamp(this.camera.zoom*factor,.45,1.8);this.cameraTransform();const after=this.screenToIso(a);
  this.camera.x+=before.x-after.x;this.camera.y+=before.y-after.y;this.limitCamera();this.cameraTransform();
 }
 private limitCamera(){
  const iso={x:this.camera.x,y:this.camera.y},m=this.options.map,p=this.surface.pickSurface(iso)?.point??toWorld(iso.x,iso.y);
  if(p.x>=0&&p.y>=0&&p.x<=m.width*1000&&p.y<=m.height*1000)return;
  const s=this.surface.projectGround({x:clamp(p.x,0,m.width*1000),y:clamp(p.y,0,m.height*1000)});this.camera.x=s.x;this.camera.y=s.y;
 }
 private cameraTransform(){
  if(!this.app.renderer)return;
  this.world.scale.set(this.camera.zoom);this.world.position.set(this.app.screen.width/2-this.camera.x*this.camera.zoom+this.shake.x,this.app.screen.height/2-this.camera.y*this.camera.zoom+this.shake.y);
 }
 private screenToIso(p:Point):Point{return {x:(p.x-this.world.x)/this.camera.zoom,y:(p.y-this.world.y)/this.camera.zoom}}
 private point(p:Point):Point{const iso=this.screenToIso(p),w=this.surface.pickSurface(iso)?.commandPoint??toWorld(iso.x,iso.y),m=this.options.map;return {x:Math.round(clamp(w.x,0,m.width*1000-1)),y:Math.round(clamp(w.y,0,m.height*1000-1))}}
 private project(p:Point):Point{const iso=this.surface.projectGround(p);return {x:iso.x*this.camera.zoom+this.world.x,y:iso.y*this.camera.zoom+this.world.y}}
 bounds(entity:Entity):Rect|undefined{
  if(!entity.position||entity.private?.container)return;
  const actor=this.actors.get(entity.id),painted=actor?.paintedBodyBounds();
  if(painted)return {left:painted.left*this.camera.zoom+this.world.x,top:painted.top*this.camera.zoom+this.world.y,right:painted.right*this.camera.zoom+this.world.x,bottom:painted.bottom*this.camera.zoom+this.world.y};
  // Loading/development markers without known body ink keep their existing
  // geometric target until an authored displayed pose supplies exact bounds.
  const now=performance.now(),p=actor?.position(now)??entity.position,anchor=actor?.groundAnchor(now,this.settings.reducedMotion)??this.surface.projectGround(p),s={x:anchor.x*this.camera.zoom+this.world.x,y:anchor.y*this.camera.zoom+this.world.y},b=this.options.catalog.buildings.get(entity.type);
  const airborne=this.options.catalog.units.get(entity.type)?.armor==='air'&&!entity.landed;
  const width=b?(entity.footprintWidth+entity.footprintHeight)*16:Math.max(14,(this.options.catalog.units.get(entity.type)?.radius??400)/1000*40),height=b?width*.5+30:airborne?Math.max(80,(actor?.visualAltitude(now,this.settings.reducedMotion)??0)+30):30;
  return {left:s.x-width*this.camera.zoom,right:s.x+width*this.camera.zoom,top:s.y-height*this.camera.zoom,bottom:s.y+Math.max(10,width*.4)*this.camera.zoom};
 }
 private hit(p:Point):CommandTarget{
  const snap=this.snapshot;
  if(snap){
   let best:Entity|undefined,bestDepth=-Infinity;const terrainHit=this.surface.pickSurface(this.screenToIso(p));
   for(const entity of snap.entities){
    const rect=this.bounds(entity);if(!rect)continue;
    if(p.x>=rect.left-this.settings.selectionTolerance&&p.x<=rect.right+this.settings.selectionTolerance&&p.y>=rect.top-this.settings.selectionTolerance&&p.y<=rect.bottom+this.settings.selectionTolerance){
     const actor=this.actors.get(entity.id);
     if(actor?.containsPaintedBody(this.screenToIso(p),this.settings.selectionTolerance/this.camera.zoom)===false)continue;
     const depth=actor?.groundDepth(performance.now(),this.settings.reducedMotion)??entity.position!.x+entity.position!.y;
     if(terrainHit&&terrainHit.triangle.depth>depth+.01)continue;
     if(depth>bestDepth){best=entity;bestDepth=depth}
    }
   }
   if(best)return {kind:'entity',id:best.id};
   for(const [kind,items] of [['salvage',snap.salvage],['station',snap.stations],['field',snap.fields]] as const){
    for(const item of kind==='field'?[...items].sort((a,b)=>Number(b.remaining>0n)-Number(a.remaining>0n)):items){if(!item.position)continue;const q=this.project(item.position);if(Math.hypot(p.x-q.x,p.y-q.y)<(kind==='field'?38:22)*this.camera.zoom)return {kind,id:item.id}}
   }
  }
  return {kind:'ground',position:this.point(p)};
 }
 private emit(kind:BattlefieldGesture['kind'],event:PointerEvent|MouseEvent,p:Point,rect?:Rect){
  if(this.lost||this.disposed)return;
  this.options.onGesture({kind,point:this.point(p),hit:this.hit(p),rect,shift:event.shiftKey,ctrl:event.ctrlKey,alt:event.altKey,meta:event.metaKey,button:event.button});
 }
 private bindInput(){
  const canvas=this.app.canvas,signal=this.listeners.signal;
  const local=(event:MouseEvent)=>{const r=canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top}};
  canvas.addEventListener('contextmenu',event=>event.preventDefault(),{signal});
  canvas.addEventListener('pointerdown',event=>{event.preventDefault();if(this.lost)return;canvas.focus({preventScroll:true});const p=local(event);this.drag={start:p,last:p,button:event.button,pointer:event.pointerId};canvas.setPointerCapture(event.pointerId)},{signal});
  canvas.addEventListener('pointermove',event=>{
   if(this.lost)return;
   const p=local(event);this.pointer=p;
   if(this.drag?.button===this.settings.bindings.pointer.pan){this.pan(this.drag.last.x-p.x,this.drag.last.y-p.y);this.drag.last=p;return}
   if(this.drag)this.drag.last=p;
   const now=performance.now();if(now-this.lastHover>40){this.emit('hover',event,p);this.lastHover=now}
  },{signal});
  canvas.addEventListener('pointerup',event=>{
   const d=this.drag;if(!d)return;const p=local(event);this.drag=undefined;
   if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
   if(d.button===this.settings.bindings.pointer.pan)return;
   const distance=Math.hypot(d.start.x-p.x,d.start.y-p.y);
   if(distance>=this.settings.dragThreshold){this.emit('box',event,p,{left:d.start.x,top:d.start.y,right:p.x,bottom:p.y});return}
   this.emit(d.button===2?'context':'click',event,p);
  },{signal});
  canvas.addEventListener('dblclick',event=>this.emit('double-click',event,local(event)),{signal});
  canvas.addEventListener('pointercancel',()=>this.cancelDrag(),{signal});
  canvas.addEventListener('pointerleave',()=>{this.pointer=undefined},{signal});
  canvas.addEventListener('wheel',event=>{event.preventDefault();if(!this.lost)this.zoomBy(Math.exp(-event.deltaY*.001*this.settings.zoomSpeed),local(event))},{signal,passive:false});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.lost=true;this.resetFeedback();this.cancelDrag();this.pointer=undefined;this.options.onError?.(new Error('Graphics context lost. Simulation remains in its worker; pause or save while graphics recover.'))},{signal});
  canvas.addEventListener('webglcontextrestored',()=>{this.lost=false;this.resetFeedback();this.invalidateTerrain();this.fogTick=-1},{signal});
  window.addEventListener('blur',()=>{this.cancelDrag();this.pointer=undefined},{signal});
 }
 cancelDrag(){if(this.drag&&this.app.canvas?.hasPointerCapture(this.drag.pointer))this.app.canvas.releasePointerCapture(this.drag.pointer);this.drag=undefined;this.overlay.clear()}
 setTargeting(kind:string|undefined){this.targeting=kind;if(this.app.canvas)this.app.canvas.style.cursor=kind?'crosshair':'default'}
 setRangeMode(mode:RangeMode){this.rangeMode=mode}
 showRejectedOrder(point:Point,player:number){
  const s=this.snapshot;if(!s||s.player!==player||!Number.isSafeInteger(point.x)||!Number.isSafeInteger(point.y)||point.x<0||point.y<0||point.x>=this.options.map.width*1000||point.y>=this.options.map.height*1000)return;
  // Cosmetic acknowledgement only. Accepted queues always remain Go snapshots.
  // One static marker survives reduced motion/flashing without pulsing.
  this.rejection={point:{...point},player,tick:s.tick,until:performance.now()+1800};
 }
 setPlacement(placement:PlacementPreview|undefined){this.placement=placement;if(!placement)this.placementGhost.clear()}
 setSelection(ids:number[]){
  if(ids.length===this.selected.size&&ids.every(id=>this.selected.has(id)))return;
  this.selected=new Set(ids);this.refreshTactical();
 }
 private refreshTactical(reset=false){this.minimapDirty=true;if(this.snapshot){this.tacticalModel=tacticalPresentation(this.snapshot,this.options.catalog,[...this.selected]);this.tacticalOverlay.sync(this.tacticalModel,this.snapshot.player,reset)}}
 get tacticalDiagnostics(){return {...this.tacticalOverlay.diagnostics,previewRoutes:this.strikePreview.routes}}
 get combatDiagnostics(){return this.combat.diagnostics}
 async whenEffectsReleased(){await this.effectsReleased}
 resetFeedback(){this.rejection=undefined;this.feedbackBaseline=true;this.combat.reset();this.surfaceShadows.clear();this.effectEvent=Math.max(0,...(this.snapshot?.events.map(event=>event.id)??[]));this.shake={until:0,strength:0,x:0,y:0};for(const actor of this.actors.values())actor.clearFeedback();for(const death of this.deaths)death.actor.dispose();this.deaths.length=0}
 setStrikePreview(plan:SkybreakerPlan|undefined,_observedTick?:number){this.strikePreview.set(plan);this.minimapDirty=true}
 updateSettings(settings:Settings){const rescale=settings.uiScale!==this.settings.uiScale;this.settings=settings;this.minimapDirty=true;if(rescale&&!this.disposed){this.memoryKey='';this.updateMemories()}if(settings.reducedMotion||settings.reducedFlashing||settings.screenShake===0)this.shake={until:0,strength:0,x:0,y:0}}
 setSnapshot(snapshot:PlayerSnapshot){
  if(this.disposed)return;
  const tacticalReset=!this.snapshot||snapshot.tick<this.snapshot.tick||snapshot.player!==this.snapshot.player;
  if(tacticalReset||this.feedbackBaseline){
   this.rejection=undefined;
   this.strikePreview.set(undefined);
   this.effectEvent=Math.max(0,...snapshot.events.map(event=>event.id));this.shake={until:0,strength:0,x:0,y:0};
   this.feedbackBaseline=false;
  }
  if(this.snapshot&&(snapshot.tick<this.snapshot.tick||snapshot.player!==this.snapshot.player)){
   this.fogTick=-1;this.memoryKey='';
   for(const actor of this.actors.values())actor.clearFeedback();
   for(const death of this.deaths)death.actor.dispose();this.deaths.length=0;
  }
  this.snapshot=snapshot;this.refreshTactical(tacticalReset);this.tickAt=performance.now();this.combat.sync(snapshot,this.tacticalModel?.projectiles??[],tacticalReset,id=>this.actors.get(id)?.visualAltitude(this.tickAt,this.settings.reducedMotion));const living=new Set<number>();
  const presentations=buildingPresentations(snapshot,this.options.catalog),boardingReceivers=new Set(ownedBoardingReceivers(snapshot,this.options.catalog));
  for(const entity of snapshot.entities){
   if(!entity.position||entity.private?.container)continue;
   living.add(entity.id);let actor=this.actors.get(entity.id);const faction=snapshot.players.find(p=>p.id===entity.owner)?.faction;
   if(actor&&actor.artKey!==actorArtKey(entity,faction)){actor.dispose();this.actors.delete(entity.id);actor=undefined}
   if(!actor){actor=new ActorVisual(entity,this.options.catalog,this.options.art,faction,this.surface,this.objectSkins.get(`${entity.type}:${entity.position.x}:${entity.position.y}`));this.actors.set(entity.id,actor);this.ground.addChild(actor.root);actor.attachStatusLayer(this.actorStatuses);actor.useSurfaceShadows();if(actor.terrainShadow)this.ground.addChild(actor.terrainShadow)}
   actor.viewer=snapshot.player;actor.presentation=presentations.get(entity.id);actor.status=actorStatus(entity,snapshot,this.options.catalog);actor.receivingBoarder=boardingReceivers.has(entity.id);actor.update(entity,this.tickAt);
  }
  const serviceBases=[...this.actors.values()].filter(actor=>living.has(actor.id)&&(this.options.catalog.buildings.get(actor.entity.type)?.service_slots??0)>0);
  for(const actor of this.actors.values()){
   const e=actor.entity;if(this.options.catalog.units.get(e.type)?.armor!=='air')continue;
   // Home is owner-private. Foreign aircraft only use already-visible, same-owner
   // overlapping geometry; this presentation never infers a hidden service base.
   const departing=actor.departureDeck(this.tickAt),deck=serviceBases.find(base=>base.entity.owner===e.owner&&(base.id===departing||e.landed&&(!e.private?.home||base.id===e.private.home)&&Math.abs(base.entity.position!.x-e.position!.x)<=base.entity.footprintWidth*500&&Math.abs(base.entity.position!.y-e.position!.y)<=base.entity.footprintHeight*500));
   actor.setServiceDeck(deck);
  }
  this.readFeedback(snapshot);
  // A disappeared enemy is removed immediately: interpolation cannot expose
  // its route after sight loss. No distinction is guessed between fog/death.
  for(const [id,actor] of this.actors)if(!living.has(id)){
   const persistentRubble=actor.entity.type.startsWith('map.')&&(this.options.map.objects??[]).some(object=>snapshot.rubble.includes(object.id)&&object.position.x===actor.entity.position!.x&&object.position.y===actor.entity.position!.y);
   if(!persistentRubble&&snapshot.events.some(event=>event.entity===id&&event.kind==='destroyed'&&!soldDestruction(event,snapshot))){
    actor.setServiceDeck(undefined);actor.update({...actor.entity,state:'destroyed',health:0},this.tickAt);this.deaths.push({actor,until:this.tickAt+2400});
   }else actor.dispose();
   this.actors.delete(id);
  }
  if(!this.centered){const hq=snapshot.entities.find(e=>e.owner===snapshot.player&&e.type==='hq')??snapshot.entities.find(e=>e.owner===snapshot.player);if(hq?.position){this.center(hq.position);this.centered=true}}
  this.updateRubble();this.environment.sync(snapshot);this.updateFog();this.updateMemories();
 }
 private updateRubble(){
  const snapshot=this.snapshot;if(!snapshot)return;const key=snapshot.rubble.join(',');if(key===this.rubbleKey)return;this.rubbleKey=key;
  const map=this.presentationMap,baseline=this.options.map,known=new Set(snapshot.rubble),next=baseline.tiles.map(tile=>({...tile}));
  for(const object of baseline.objects??[]){
   if(!known.has(object.id))continue;const rule=this.options.catalog.objects.get(object.class);if(!rule)continue;
   const left=Math.floor((object.position.x-rule.width*500)/1000),top=Math.floor((object.position.y-rule.height*500)/1000);
   const right=Math.floor((object.position.x+rule.width*500-1)/1000),bottom=Math.floor((object.position.y+rule.height*500-1)/1000);
   for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const tile=next[y*map.width+x];if(tile){tile.terrain='rubble';tile.sight_blocker=false}}
  }
  const changed=new Set<string>();
  for(let i=0;i<next.length;i++)if(next[i].terrain!==map.tiles[i].terrain){
   const x=i%map.width,y=Math.floor(i/map.width);
   // Neighbouring chunk masks sample two tiles beyond their visible boundary.
   for(let cy=Math.max(0,Math.floor((y-2)/CHUNK));cy<=Math.floor((y+2)/CHUNK);cy++)for(let cx=Math.max(0,Math.floor((x-2)/CHUNK));cx<=Math.floor((x+2)/CHUNK);cx++)changed.add(`${cx}:${cy}`);
  }
  map.tiles=next;
  if(changed.size){this.terrainKey='';this.surface=new TerrainSurface(map);for(const actor of [...this.actors.values(),...this.deaths.map(d=>d.actor)])actor.setSurface(this.surface);this.environment.setSurface(this.surface);this.memoryKey='';this.fogTick=-1}
  for(const key of changed){const chunk=this.chunks.get(key);if(chunk){this.disposeChunk(chunk);this.chunks.delete(key)}}
 }
 private team(owner:number){const player=this.snapshot?.players.find(p=>p.id===owner);const palette=tokens.color.team[this.settings.palette];return color(palette[Math.max(0,(player?.color??owner)-1)%palette.length]??'#b9b4a6')}
 private updateFog(){
  const snapshot=this.snapshot;if(!snapshot||snapshot.tick===this.fogTick)return;this.fogTick=snapshot.tick;
  for(const chunk of this.chunks.values())for(const fragment of chunk.fragments)fragment.setFog(snapshot.visible,snapshot.explored);
 }
 private updateMemories(){
  const snapshot=this.snapshot;if(!snapshot)return;const occupied=new Set(snapshot.entities.map(entity=>entity.id));const known=snapshot.memory.filter(memory=>{if(!memory.position||occupied.has(memory.id))return false;const i=Math.floor(memory.position.y/1000)*this.options.map.width+Math.floor(memory.position.x/1000);return snapshot.explored[i]&&!snapshot.visible[i]&&memoryCaption(memory.seen,snapshot.tick)!==undefined});const key=JSON.stringify(known);
  if(key===this.memoryKey)return;this.memoryKey=key;
  for(const child of this.memories)child.destroy({children:true});this.memories.length=0;this.memoryLabels.length=0;
  for(const memory of known){
   if(!memory.position||snapshot.entities.some(entity=>entity.id===memory.id))continue;
   const i=Math.floor(memory.position.y/1000)*this.options.map.width+Math.floor(memory.position.x/1000);
   if(!snapshot.explored[i])continue;
   const g=new Graphics(),holder=new Container(),b=this.options.catalog.buildings.get(physicalArtType(memory)),support=this.surface.footprintSurface(memory.position,memory.footprintWidth||b?.width||2,memory.footprintHeight||b?.height||2),p=projectSurfaceVertex({...memory.position,height:support.height});
   drawStructure(g,{width:memory.footprintWidth||b?.width||2,height:memory.footprintHeight||b?.height||2,role:b?.role??'garrison',paint:0x514d41,team:0x666353,progress:1000,complete:true,health:1000,enabled:false,memory:true});
   // Preserve the existing inherited memory alpha on both structure and tag.
   holder.alpha=g.alpha;g.alpha=1;
   // Screen-constant LCD tag: amber text on a dark plate, sized by the UI scale
   // (never below 11px) and rasterised at that size rather than stretched.
   const label=new Container(),text=new Text({text:memoryCaption(memory.seen,snapshot.tick)!,style:{fontFamily:'Arial,sans-serif',fontSize:memoryLabelSize(this.settings.uiScale),fontWeight:'700',letterSpacing:.5,fill:0xf2b340}}),plate=new Graphics();
   text.anchor.set(.5,1);text.position.set(0,-2);plate.rect(-text.width/2-5,-text.height-4,text.width+10,text.height+4).fill({color:0x0b0a09,alpha:.86}).stroke({width:1,color:0x6e5528,alignment:1});
   label.addChild(plate,text);label.position.set(0,-48);label.eventMode=plate.eventMode=text.eventMode='none';holder.addChild(g,label);this.memoryLabels.push(label);
   holder.position.set(p.x,p.y);holder.zIndex=memory.position.x+memory.position.y+((memory.footprintWidth||b?.width||2)+(memory.footprintHeight||b?.height||2))*500+.001;this.memories.push(holder);this.ground.addChild(holder);
  }
 }
 private disposeChunk(chunk:Chunk){for(const fragment of chunk.fragments)fragment.dispose();chunk.texture.destroy(true)}
 private invalidateTerrain(){for(const chunk of this.chunks.values())this.disposeChunk(chunk);this.chunks.clear();this.terrainKey=''}
 private terrainFrame(){
  // Culling uses a conservative flat inverse, not command picking. The 440px
  // vertical guard includes the entire 40px maximum raised surface.
  const corners=[{x:-600,y:-440},{x:this.app.screen.width+600,y:-440},{x:-600,y:this.app.screen.height+440},{x:this.app.screen.width+600,y:this.app.screen.height+440}].map(p=>{const iso=this.screenToIso(p),w=toWorld(iso.x,iso.y);return {x:clamp(w.x,0,this.options.map.width*1000-1),y:clamp(w.y,0,this.options.map.height*1000-1)}});
  const minX=Math.floor(Math.min(...corners.map(p=>p.x))/1000/CHUNK),maxX=Math.floor(Math.max(...corners.map(p=>p.x))/1000/CHUNK);
  const minY=Math.floor(Math.min(...corners.map(p=>p.y))/1000/CHUNK),maxY=Math.floor(Math.max(...corners.map(p=>p.y))/1000/CHUNK);
  // Chunk admission is deliberately conservative. Individual projected bounds
  // avoid packing offscreen diagonals from every admitted chunk each frame.
  const view={left:(-this.world.x-2)/this.camera.zoom,top:(-this.world.y-2)/this.camera.zoom,right:(this.app.screen.width-this.world.x+2)/this.camera.zoom,bottom:(this.app.screen.height-this.world.y+2)/this.camera.zoom};
  const keyBounds=`${minX}:${maxX}:${minY}:${maxY}@${view.left}/${view.top}/${view.right}/${view.bottom}`;if(this.terrainKey===keyBounds)return;
  // The inverse range encloses a diagonal footprint with large unused corners.
  // Preserve the full existing prefetch guard, admitting only chunks whose
  // raised geometry envelope can reach it. Fragment culling below stays exact.
  const prefetch={left:(-this.world.x-600)/this.camera.zoom,top:(-this.world.y-440)/this.camera.zoom,right:(this.app.screen.width-this.world.x+600)/this.camera.zoom,bottom:(this.app.screen.height-this.world.y+440)/this.camera.zoom};
  const wanted=new Set<string>(),admission:Array<{x:number;y:number;visible:boolean;distance:number}>=[],centerX=(view.left+view.right)/2,centerY=(view.top+view.bottom)/2;let baked=0,pending=false;
  for(let y=minY;y<=Math.min(maxY,this.baker.chunksY-1);y++)for(let x=minX;x<=Math.min(maxX,this.baker.chunksX-1);x++){
   const bounds=this.baker.chunkBounds(x,y,this.surface.maxHeight);if(bounds.right<prefetch.left||bounds.left>prefetch.right||bounds.bottom<prefetch.top||bounds.top>prefetch.bottom)continue;
   const visible=bounds.right>=view.left&&bounds.left<=view.right&&bounds.bottom>=view.top&&bounds.top<=view.bottom,dx=Math.max(bounds.left-centerX,0,centerX-bounds.right),dy=Math.max(bounds.top-centerY,0,centerY-bounds.bottom);
   admission.push({x,y,visible,distance:dx*dx+dy*dy});
  }
  // Spend the unchanged two-bake allowance on the viewport before its prefetch
  // ring. Stable geometric ties retain y/x order; final fragment depths stay
  // unchanged and continue to control the world painter order.
  admission.sort((a,b)=>Number(b.visible)-Number(a.visible)||a.distance-b.distance||a.y-b.y||a.x-b.x);
  for(const {x,y} of admission){
   const key=`${x}:${y}`;wanted.add(key);let chunk=this.chunks.get(key);
   if(!chunk){if(baked>=2){pending=true;continue}const texture=this.baker.bake(x,y,true),fragments=this.baker.surfaceFragments(x,y,texture,this.surface);for(const fragment of fragments){fragment.setFog(this.snapshot?.visible??[],this.snapshot?.explored??[]);this.ground.addChild(fragment.mesh,fragment.fog)}chunk={texture,fragments,used:this.frame,visible:true};this.chunks.set(key,chunk);baked++}
   chunk.visible=true;for(const fragment of chunk.fragments){const b=fragment.bounds;fragment.setVisible(b.right>=view.left&&b.left<=view.right&&b.bottom>=view.top&&b.top<=view.bottom)}chunk.used=this.frame;
  }
  for(const [key,chunk] of this.chunks)if(chunk.visible&&!wanted.has(key)){chunk.visible=false;for(const fragment of chunk.fragments)fragment.setVisible(false)}
  this.terrainKey=pending?'':keyBounds;
  if(this.chunks.size>36){for(const [key,chunk] of [...this.chunks].sort(([,a],[,b])=>a.used-b.used)){if(this.chunks.size<=36)break;if(chunk.visible)continue;this.disposeChunk(chunk);this.chunks.delete(key)}}
 }
 private readFeedback(snapshot:PlayerSnapshot){
  for(const event of snapshot.events){
   if(event.id<=this.effectEvent)continue;this.effectEvent=event.id;
   if(soldDestruction(event,snapshot))continue;
   if(event.tick+4>=snapshot.tick)this.actors.get(event.entity)?.cue(event.kind,this.tickAt-(snapshot.tick-event.tick)*50,this.actors.get(event.entity)?.entity.owner===snapshot.player);
   if(!event.position||event.tick+4<snapshot.tick||this.settings.reducedMotion||this.settings.reducedFlashing||this.settings.screenShake===0)continue;
   const p=this.project(event.position);if(p.x<0||p.y<0||p.x>this.app.screen.width||p.y>this.app.screen.height)continue;
   let strength=event.kind==='impact'?1.4:event.kind==='missile_intercepted'?2.2:0;
   if(event.kind==='destroyed'){
    const entity=this.actors.get(event.entity)?.entity;
    if(entity&&this.options.catalog.units.get(entity.type)?.armor!=='infantry')strength=3;
   }
   if(strength){this.shake.strength=Math.max(this.shake.strength,strength);this.shake.until=performance.now()+220}
  }
 }
 private updateShake(now:number){
  const enabled=!this.settings.reducedMotion&&!this.settings.reducedFlashing&&!this.drag&&!this.placement&&this.settings.screenShake>0;
  const remaining=Math.max(0,(this.shake.until-now)/220),amplitude=enabled?Math.min(3,this.shake.strength)*this.settings.screenShake*remaining:0;
  this.shake.x=Math.sin(now*.052)*amplitude;this.shake.y=Math.cos(now*.063)*amplitude*.55;
  if(!remaining)this.shake.strength=0;
 }
 private render(){
  if(this.disposed||this.lost)return;
  const now=performance.now();this.frame++;this.updateShake(now);this.cameraTransform();this.terrainFrame();
  if(this.settings.edgeScroll&&this.pointer&&!this.drag){const p=this.pointer,w=this.app.screen.width,h=this.app.screen.height,s=7*this.settings.scrollSpeed;this.pan(p.x<12?-s:p.x>w-12?s:0,p.y<12?-s:p.y>h-12?s:0)}
  this.environment.render(owner=>this.team(owner),{left:-this.world.x/this.camera.zoom,top:-this.world.y/this.camera.zoom,right:(this.app.screen.width-this.world.x)/this.camera.zoom,bottom:(this.app.screen.height-this.world.y)/this.camera.zoom});
  for(const actor of this.actors.values()){
   // Culled actors skip painting, but their last ink bounds must follow the
   // authorized interpolated ground position so they can enter the view again.
   if(!actor.root.visible){const p=actor.groundAnchor(now,this.settings.reducedMotion);actor.root.position.set(p.x,p.y)}
   const bounds=this.bounds(actor.entity);actor.root.visible=!!bounds&&bounds.right>=-200&&bounds.left<=this.app.screen.width+200&&bounds.bottom>=-200&&bounds.top<=this.app.screen.height+200;
   if(actor.terrainShadow)actor.terrainShadow.visible=actor.root.visible;
   if(actor.root.visible)actor.render(now,this.team(actor.entity.owner),this.selected.has(actor.id),this.settings.healthBars,this.settings.reducedMotion,this.camera.zoom,this.selected.size<=4);else actor.hideStatus();
  }
  for(let i=this.deaths.length-1;i>=0;i--){const death=this.deaths[i];if(now>=death.until){death.actor.dispose();this.deaths.splice(i,1);continue}death.actor.render(now,this.team(death.actor.entity.owner),false,'selected',this.settings.reducedMotion);death.actor.root.alpha=Math.min(1,(death.until-now)/700);if(death.actor.terrainShadow)death.actor.terrainShadow.alpha=death.actor.root.alpha}
  this.surfaceShadows.update([...this.actors.values()].filter(actor=>actor.root.visible).flatMap(actor=>actor.shadowPlates).concat(this.deaths.flatMap(({actor,until})=>actor.shadowPlates.map(plate=>({...plate,alpha:plate.alpha*Math.min(1,(until-now)/700)}))),this.environment.shadowPlates),this.surface,this.snapshot?.visible,{left:-this.world.x/this.camera.zoom,top:-this.world.y/this.camera.zoom,right:(this.app.screen.width-this.world.x)/this.camera.zoom,bottom:(this.app.screen.height-this.world.y)/this.camera.zoom,zoom:this.camera.zoom});
  if(this.frame%60===0)void this.combat.trim();
  this.combat.draw(this.surface,this.camera.zoom,this.settings,{left:-this.world.x/this.camera.zoom,top:-this.world.y/this.camera.zoom,right:(this.app.screen.width-this.world.x)/this.camera.zoom,bottom:(this.app.screen.height-this.world.y)/this.camera.zoom},id=>this.actors.get(id)?.visualAltitude(now,this.settings.reducedMotion),(id,eventID)=>this.actors.get(id)?.muzzleAttachment(eventID),id=>{const actor=this.actors.get(id);return actor?.root.visible?actor.root.position:undefined});
  for(const label of this.memoryLabels)label.scale.set(1/this.camera.zoom);
  this.drawTactical(now);this.overlay.clear();
  if(this.drag&&this.drag.button!==this.settings.bindings.pointer.pan&&Math.hypot(this.drag.start.x-this.drag.last.x,this.drag.start.y-this.drag.last.y)>=this.settings.dragThreshold){const a=this.drag.start,b=this.drag.last;this.overlay.rect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(a.x-b.x),Math.abs(a.y-b.y)).fill({color:0xbcce88,alpha:.08}).stroke({width:1,color:0xc7d895})}
  this.paintMinimap(now);
  // Every displayed world/placement page has now been touched for this frame.
  if(this.frame%60===0)this.options.art.trim(now);
 }
 /** Attaches one HUD minimap. Draws immediately when a snapshot exists, then only when dirtied. The returned detach is a no-op once another canvas replaced it. */
 attachMinimap(canvas:HTMLCanvasElement):()=>void{
  this.detachMinimap();if(this.disposed)return()=>{};
  const resize=new ResizeObserver(()=>{this.minimapDirty=true});resize.observe(canvas);
  const attachment={canvas,resize,view:[] as number[]};
  this.minimap=attachment;this.minimapDirty=true;this.minimapAt=-Infinity;this.paintMinimap(performance.now());
  return()=>{if(this.minimap===attachment)this.detachMinimap()};
 }
 private detachMinimap(){this.minimap?.resize.disconnect();this.minimap=undefined;this.minimapDirty=false}
 private paintMinimap(now:number){
  const attached=this.minimap;if(!attached||!this.snapshot||!this.app.renderer)return;
  // Camera pans, zooms, minimap clicks and resizes change this key even while the simulation is paused.
  const view=[this.camera.x,this.camera.y,this.camera.zoom,this.app.screen.width,this.app.screen.height];
  if(view.some((value,i)=>value!==attached.view[i])){attached.view=view;this.minimapDirty=true}
  if(!this.minimapDirty||now-this.minimapAt<MINIMAP_MS)return;
  this.minimapDirty=false;this.minimapAt=now;this.renderMinimap(attached.canvas);
 }
 private diamond(g:Graphics,p:Point,w:number,h:number,paint:number,alpha=.2){
  const corners=[{x:p.x-w*500,y:p.y-h*500},{x:p.x+w*500,y:p.y-h*500},{x:p.x+w*500,y:p.y+h*500},{x:p.x-w*500,y:p.y+h*500}],outline:Point[]=[];
  for(let i=0;i<4;i++){const a=corners[i],b=corners[(i+1)%4],steps=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/250));for(let j=0;j<steps;j++)outline.push(this.surface.projectGround({x:a.x+(b.x-a.x)*j/steps,y:a.y+(b.y-a.y)*j/steps}))}
  g.poly(outline.flatMap(v=>[v.x,v.y])).fill({color:paint,alpha}).stroke({width:1.5,color:paint});
 }
 private drawTactical(now:number){
  const g=this.tactical.clear(),s=this.snapshot;if(!s)return;
  for(const marker of activeMissionMarkers(this.missionMarkers,s.mission)){
   this.diamond(g,marker.position,(marker.max.x-marker.min.x+1)/1000,(marker.max.y-marker.min.y+1)/1000,0xe0bc65,.04);
   const p=this.surface.projectGround(marker.position);g.ellipse(p.x,p.y,15,7.5).stroke({width:2,color:0xf1ce78});g.moveTo(p.x-23,p.y).lineTo(p.x-10,p.y).moveTo(p.x+10,p.y).lineTo(p.x+23,p.y).moveTo(p.x,p.y-15).lineTo(p.x,p.y-6).moveTo(p.x,p.y+6).lineTo(p.x,p.y+15).stroke({width:2,color:0xf1ce78});
  }
  for(const salvage of s.salvage){if(salvage.position)this.diamond(g,salvage.position,.5,.5,0xb9934b,.65)}
  if(this.tacticalModel)this.tacticalOverlay.draw(this.tacticalModel,this.surface,this.camera.zoom,owner=>this.team(owner),this.rangeMode);
  this.strikePreview.draw(this.surface,this.camera.zoom);
  if(this.placement){
   const p=this.placement.position??(this.pointer?this.point(this.pointer):undefined),b=this.options.catalog.buildings.get(this.placement.type);
   if(p&&b){
    const paint=this.placement.valid===false?0xdb5c46:this.placement.valid?0xa9cc79:0xd8b766;
    const line=(points:Point[],alpha=.4)=>{const projected=points.map(point=>this.surface.projectGround(point));if(!projected.length)return;g.moveTo(projected[0].x,projected[0].y);for(const at of projected.slice(1))g.lineTo(at.x,at.y);g.stroke({width:1/this.camera.zoom,color:paint,alpha})};
    // Go measures the ordinary build radius between anchor and proposed center.
    // Exceptions (outpost and HQ replacement) need no circle constraint.
    if(b.role!=='outpost'&&!(b.role==='hq'&&!s.entities.some(e=>e.owner===s.player&&e.type==='hq'&&e.complete&&e.health>0)))for(const e of s.entities){
     const radius=ownerRanges(e,s)?.buildRadius;if(radius&&e.position){const points=tacticalCircle(e.position,radius);line([...points,points[0]],.25)}
    }
    this.diamond(g,p,b.width,b.height,paint,.12);
    for(let x=1;x<b.width;x++)line(Array.from({length:b.height*4+1},(_,i)=>({x:p.x-b.width*500+x*1000,y:p.y-b.height*500+i*250})));
    for(let y=1;y<b.height;y++)line(Array.from({length:b.width*4+1},(_,i)=>({x:p.x-b.width*500+i*250,y:p.y-b.height*500+y*1000})));
    this.placementGhost.draw(b,s.players.find(player=>player.id===s.player)?.faction,p,this.placement.valid,this.surface);
   }else this.placementGhost.clear();
  }else this.placementGhost.clear();
  if(this.rejection){
   const marker=this.rejection;
   if(now>=marker.until||s.player!==marker.player||s.tick<marker.tick)this.rejection=undefined;
   else{
    const p=this.surface.projectGround(marker.point),px=1/this.camera.zoom;
    // Dark surround and a crossed copper ring, distinct from accepted routes.
    for(const [width,paint] of [[5,0x20170f],[2,0xe8a568]]){
     g.circle(p.x,p.y,11*px).stroke({width:width*px,color:paint});
     g.moveTo(p.x-5*px,p.y-5*px).lineTo(p.x+5*px,p.y+5*px).moveTo(p.x+5*px,p.y-5*px).lineTo(p.x-5*px,p.y+5*px).stroke({width:width*px,color:paint});
    }
   }
  }
 }
 renderMinimap(canvas:HTMLCanvasElement){
  const ctx=canvas.getContext('2d'),s=this.snapshot,m=this.options.map;if(!ctx||!s)return;
  const width=Math.max(1,canvas.clientWidth||canvas.width),height=Math.max(1,canvas.clientHeight||canvas.height),ratio=Math.min(devicePixelRatio||1,2);
  const physicalWidth=Math.ceil(width*ratio),physicalHeight=Math.ceil(height*ratio);
  if(canvas.width!==physicalWidth||canvas.height!==physicalHeight){canvas.width=physicalWidth;canvas.height=physicalHeight}
  ctx.setTransform(physicalWidth/width,0,0,physicalHeight/height,0,0);
  ctx.fillStyle='#0b0c08';ctx.fillRect(0,0,width,height);
  const box=minimapLayout(m.width,m.height,width,height);
  const image=ctx.createImageData(m.width,m.height);
  for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++){const i=y*m.width+x,[r,g,b]=TerrainBaker.minimapColor(this.presentationMap,x,y),k=s.visible[i]?1:s.explored[i]?.4:.04;image.data.set([r*k,g*k,b*k,255],i*4)}
  const temp=document.createElement('canvas');temp.width=m.width;temp.height=m.height;temp.getContext('2d')!.putImageData(image,0,0);
  ctx.save();const tile=box.scale*1000;ctx.transform(tile,tile*.5,-tile,tile*.5,box.originX,box.originY);ctx.drawImage(temp,0,0);ctx.restore();
  const project=(p:Point)=>minimapProject(box,p),outline=[{x:0,y:0},{x:m.width*1000,y:0},{x:m.width*1000,y:m.height*1000},{x:0,y:m.height*1000}].map(project);
  ctx.beginPath();outline.forEach((p,i)=>{if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y)});ctx.closePath();ctx.strokeStyle='#777354';ctx.lineWidth=1;ctx.stroke();ctx.save();ctx.clip();
  for(const marker of activeMissionMarkers(this.missionMarkers,s.mission)){const {x,y}=project(marker.position);ctx.strokeStyle='#f1ce78';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x,y-5);ctx.lineTo(x+5,y);ctx.lineTo(x,y+5);ctx.lineTo(x-5,y);ctx.closePath();ctx.stroke()}
  for(const e of s.entities){if(!e.position||e.private?.container)continue;ctx.fillStyle=`#${this.team(e.owner).toString(16).padStart(6,'0')}`;const size=this.options.catalog.isBuilding(e.type)?4:2,p=project(e.position);ctx.fillRect(p.x-size/2,p.y-size/2,size,size)}
  if(this.tacticalModel)this.tacticalOverlay.drawMinimap(ctx,this.tacticalModel,project,owner=>this.team(owner));
  this.strikePreview.drawMinimap(ctx,project);
  ctx.strokeStyle='#e2d6ad';ctx.lineWidth=1;ctx.beginPath();const corners=[{x:0,y:0},{x:this.app.screen.width,y:0},{x:this.app.screen.width,y:this.app.screen.height},{x:0,y:this.app.screen.height}].map(p=>project(this.point(p)));corners.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y)});ctx.closePath();ctx.stroke();
  ctx.restore();
 }
 minimapPoint(canvas:HTMLCanvasElement,clientX:number,clientY:number):Point{const r=canvas.getBoundingClientRect(),m=this.options.map;return minimapWorldPoint(m.width,m.height,r.width,r.height,{x:clientX-r.left,y:clientY-r.top})}
 dispose(){
  if(this.disposed)return;this.disposed=true;this.listeners.abort();this.resizeObserver?.disconnect();this.detachMinimap();
  for(const actor of this.actors.values())actor.dispose();this.actors.clear();this.environment.dispose();
  for(const death of this.deaths)death.actor.dispose();this.deaths.length=0;
  this.surfaceShadows.dispose();this.memoryLabels.length=0;this.memories.length=0;
  this.invalidateTerrain();this.baker.disposeSurfaceResources();this.tacticalModel=undefined;this.tacticalOverlay.dispose();this.strikePreview.dispose();this.placementGhost.dispose();this.effectsReleased=this.combat.dispose();
  if(this.app.renderer)this.app.destroy(true,{children:true});
 }
}
