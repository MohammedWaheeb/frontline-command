import {Application,Container,Graphics,Matrix,Sprite,Texture} from 'pixi.js';
import {create} from '@bufbuild/protobuf';
import {EntitySchema} from '../protocol/frontline_pb';
import type {CommandTarget,Entity,GameMap,PlayerSnapshot,Point,Rect} from '../runtime';
import type {CatalogIndex} from '../content/catalog';
import type {Settings} from '../app/settings';
import {tokens} from '../design/tokens';
import {ArtLibrary} from './art';
import {ActorVisual} from './actors';
import {buildingPresentations} from './poses';
import {CHUNK,TerrainBaker} from './terrain';
import {toScreen,toWorld,HALF_W,HALF_H} from './iso';
import {drawStructure} from './structure';
import {activeMissionMarkers,type MissionMarker} from '../app/mission-markers';

export interface BattlefieldGesture {
 kind:'click'|'double-click'|'context'|'box'|'hover';point:Point;hit?:CommandTarget;rect?:Rect;
 shift:boolean;ctrl:boolean;alt:boolean;meta:boolean;button:number;
}
export interface BattlefieldOptions {
 map:GameMap;catalog:CatalogIndex;art:ArtLibrary;settings:Settings;
 onGesture:(event:BattlefieldGesture)=>void;onError?:(error:Error)=>void;
}
export interface PlacementPreview {type:string;width:number;height:number;position?:Point;valid?:boolean}
interface Chunk {sprite:Sprite;texture:Texture;used:number}
const color=(hex:string)=>parseInt(hex.replace('#',''),16);
const clamp=(value:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,value));

/** Fixed-camera presentation over authorized snapshots; never simulates game rules. */
export class BattlefieldRenderer {
 private readonly app=new Application();private readonly world=new Container();
 private readonly terrain=new Container();private readonly actorsLayer=new Container();private readonly propsLayer=new Container();
 private readonly memories=new Container();private readonly tactical=new Graphics();private readonly overlay=new Graphics();
 private readonly actors=new Map<number,ActorVisual>();private readonly props:ActorVisual[]=[];
 private readonly chunks=new Map<string,Chunk>();private readonly missing=new Set<string>();
 private readonly deaths:Array<{actor:ActorVisual;until:number}>=[];
 private readonly fogCanvas=document.createElement('canvas');private fogTexture?:Texture;private fogSprite?:Sprite;
 private readonly listeners=new AbortController();private resizeObserver?:ResizeObserver;
 private baker:TerrainBaker;private snapshot?:PlayerSnapshot;private selected=new Set<number>();private settings:Settings;
 private camera={x:0,y:0,zoom:1};private centered=false;private disposed=false;private tickAt=0;
 private drag?:{start:Point;last:Point;button:number;pointer:number};private pointer?:Point;
 private placement?:PlacementPreview;private targeting?:string;private lastHover=0;private frame=0;private fogTick=-1;
 private memoryKey='';private rubbleKey='';private lost=false;private presentationMap:GameMap;
 private effectEvent=0;private shake={until:0,strength:0,x:0,y:0};
 private missionMarkers:MissionMarker[]=[];
 private constructor(private host:HTMLElement,private options:BattlefieldOptions){this.settings=options.settings;this.presentationMap={...options.map,tiles:options.map.tiles.map(tile=>({...tile}))};this.baker=new TerrainBaker(this.presentationMap,options.art)}
 static async create(host:HTMLElement,options:BattlefieldOptions):Promise<BattlefieldRenderer>{
  const renderer=new BattlefieldRenderer(host,options);
  try{await renderer.init();return renderer}catch(error){renderer.dispose();throw error}
 }
 private async init(){
  this.options.art.configure(this.settings.artQuality);await this.options.art.init();await this.baker.load();
  await this.app.init({resizeTo:this.host,background:0x14130f,antialias:true,resolution:Math.min(devicePixelRatio,2),autoDensity:true,preference:'webgl'});
  if(this.disposed){this.app.destroy(true,{children:true});return}
  const canvas=this.app.canvas;canvas.tabIndex=0;canvas.setAttribute('aria-label','Battlefield. Select units and give orders.');canvas.style.display='block';canvas.style.touchAction='none';canvas.style.outlineColor='var(--fc-color-brass-light, #d0ae66)';canvas.style.outlineOffset='-2px';
  this.host.appendChild(canvas);
  this.app.stage.addChild(this.world,this.overlay);this.world.addChild(this.terrain,this.propsLayer,this.actorsLayer);
  this.actorsLayer.sortableChildren=true;this.propsLayer.sortableChildren=true;
  const m=this.options.map;this.fogCanvas.width=m.width;this.fogCanvas.height=m.height;
  const fogContext=this.fogCanvas.getContext('2d')!;fogContext.fillStyle='#080907';fogContext.fillRect(0,0,m.width,m.height);
  this.fogTexture=Texture.from(this.fogCanvas);this.fogTexture.source.scaleMode='linear';
  this.fogSprite=new Sprite(this.fogTexture);this.fogSprite.setFromMatrix(new Matrix(HALF_W,HALF_H,-HALF_W,HALF_H,0,0));
  this.world.addChild(this.fogSprite,this.memories,this.tactical);
  for(const field of m.fields??[]){
   const visual=new ActorVisual(create(EntitySchema,{id:field.id,type:'map.supply_field',position:field.position,health:1000,complete:true,enabled:true}),this.options.catalog,this.options.art);
   this.props.push(visual);this.propsLayer.addChild(visual.root);
  }
  this.center(m.spawns[0]?.position??{x:m.width*500,y:m.height*500});
  this.bindInput();this.resizeObserver=new ResizeObserver(()=>{if(!this.disposed){this.app.resize();this.cameraTransform()}});this.resizeObserver.observe(this.host);
  this.app.ticker.add(()=>this.render());
 }
 get missingArt():string[]{return [...this.missing].sort()}
 setMissionMarkers(markers:MissionMarker[]){this.missionMarkers=structuredClone(markers)}
 async whenAssetsReady(){await Promise.all([...this.actors.values(),...this.props].map(actor=>actor.ready));this.render();await this.options.art.settle();this.render()}
 viewport():Rect{return {left:0,top:0,right:this.app.screen.width,bottom:this.app.screen.height}}
 center(point:Point){const p=toScreen(point.x,point.y);this.camera.x=p.x;this.camera.y=p.y;this.cameraTransform()}
 pan(dxPixels:number,dyPixels:number){this.camera.x+=dxPixels/this.camera.zoom;this.camera.y+=dyPixels/this.camera.zoom;this.limitCamera();this.cameraTransform()}
 zoomBy(factor:number,anchor?:Point){
  if(!Number.isFinite(factor)||factor<=0)return;
  const a=anchor??{x:this.app.screen.width/2,y:this.app.screen.height/2},before=this.screenToIso(a);
  this.camera.zoom=clamp(this.camera.zoom*factor,.45,1.8);this.cameraTransform();const after=this.screenToIso(a);
  this.camera.x+=before.x-after.x;this.camera.y+=before.y-after.y;this.limitCamera();this.cameraTransform();
 }
 private limitCamera(){
  const p=toWorld(this.camera.x,this.camera.y),m=this.options.map;
  const s=toScreen(clamp(p.x,0,m.width*1000),clamp(p.y,0,m.height*1000));this.camera.x=s.x;this.camera.y=s.y;
 }
 private cameraTransform(){
  if(!this.app.renderer)return;
  this.world.scale.set(this.camera.zoom);this.world.position.set(this.app.screen.width/2-this.camera.x*this.camera.zoom+this.shake.x,this.app.screen.height/2-this.camera.y*this.camera.zoom+this.shake.y);
 }
 private screenToIso(p:Point):Point{return {x:(p.x-this.world.x)/this.camera.zoom,y:(p.y-this.world.y)/this.camera.zoom}}
 private point(p:Point):Point{const iso=this.screenToIso(p),w=toWorld(iso.x,iso.y),m=this.options.map;return {x:Math.round(clamp(w.x,0,m.width*1000-1)),y:Math.round(clamp(w.y,0,m.height*1000-1))}}
 private project(p:Point):Point{const iso=toScreen(p.x,p.y);return {x:iso.x*this.camera.zoom+this.world.x,y:iso.y*this.camera.zoom+this.world.y}}
 bounds(entity:Entity):Rect|undefined{
  if(!entity.position||entity.private?.container)return;
  const actor=this.actors.get(entity.id),p=actor?.position(performance.now())??entity.position,s=this.project(p),b=this.options.catalog.buildings.get(entity.type);
  const airborne=this.options.catalog.units.get(entity.type)?.armor==='air'&&!entity.landed;
  const width=b?(entity.footprintWidth+entity.footprintHeight)*16:Math.max(14,(this.options.catalog.units.get(entity.type)?.radius??400)/1000*40),height=b?width*.5+30:airborne?80:30;
  return {left:s.x-width*this.camera.zoom,right:s.x+width*this.camera.zoom,top:s.y-height*this.camera.zoom,bottom:s.y+Math.max(10,width*.4)*this.camera.zoom};
 }
 private hit(p:Point):CommandTarget{
  const snap=this.snapshot;
  if(snap){
   let best:Entity|undefined;
   for(const entity of snap.entities){
    const rect=this.bounds(entity);if(!rect)continue;
    if(p.x>=rect.left-this.settings.selectionTolerance&&p.x<=rect.right+this.settings.selectionTolerance&&p.y>=rect.top-this.settings.selectionTolerance&&p.y<=rect.bottom+this.settings.selectionTolerance){
     if(!best||(entity.position!.x+entity.position!.y)>(best.position!.x+best.position!.y))best=entity;
    }
   }
   if(best)return {kind:'entity',id:best.id};
   for(const [kind,items] of [['salvage',snap.salvage],['station',snap.stations],['field',snap.fields]] as const){
    for(const item of items){if(!item.position)continue;const q=this.project(item.position);if(Math.hypot(p.x-q.x,p.y-q.y)<(kind==='field'?38:22)*this.camera.zoom)return {kind,id:item.id}}
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
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.lost=true;this.cancelDrag();this.pointer=undefined;this.options.onError?.(new Error('Graphics context lost. Simulation remains in its worker; pause or save while graphics recover.'))},{signal});
  canvas.addEventListener('webglcontextrestored',()=>{this.lost=false;this.invalidateTerrain();this.fogTick=-1},{signal});
  window.addEventListener('blur',()=>{this.cancelDrag();this.pointer=undefined},{signal});
 }
 cancelDrag(){if(this.drag&&this.app.canvas?.hasPointerCapture(this.drag.pointer))this.app.canvas.releasePointerCapture(this.drag.pointer);this.drag=undefined;this.overlay.clear()}
 setTargeting(kind:string|undefined){this.targeting=kind;if(this.app.canvas)this.app.canvas.style.cursor=kind?'crosshair':'default'}
 setPlacement(placement:PlacementPreview|undefined){this.placement=placement}
 setSelection(ids:number[]){this.selected=new Set(ids)}
 updateSettings(settings:Settings){this.settings=settings;if(settings.reducedMotion||settings.reducedFlashing||settings.screenShake===0)this.shake={until:0,strength:0,x:0,y:0}}
 setSnapshot(snapshot:PlayerSnapshot){
  if(this.disposed)return;
  if(!this.snapshot||snapshot.tick<this.snapshot.tick||snapshot.player!==this.snapshot.player){
   this.effectEvent=Math.max(0,...snapshot.events.map(event=>event.id));this.shake={until:0,strength:0,x:0,y:0};
  }
  if(this.snapshot&&(snapshot.tick<this.snapshot.tick||snapshot.player!==this.snapshot.player)){
   this.fogTick=-1;this.memoryKey='';
   for(const actor of this.actors.values())actor.clearFeedback();
   for(const death of this.deaths)death.actor.dispose();this.deaths.length=0;
   for(const prop of this.props)prop.update({...prop.entity,state:'full'},performance.now());
  }
  this.snapshot=snapshot;this.tickAt=performance.now();const living=new Set<number>();
  for(const field of snapshot.fields){
   const prop=this.props.find(p=>p.id===field.id),initial=this.options.map.fields?.find(p=>p.id===field.id)?.credits;
   if(!prop||!initial)continue;
   const fraction=Number(field.remaining)/initial,state=fraction<=0?'depleted':fraction<.25?'low':fraction<.75?'high':'full';
   prop.update({...prop.entity,state},this.tickAt);
  }
  const presentations=buildingPresentations(snapshot,this.options.catalog);
  for(const entity of snapshot.entities){
   if(!entity.position||entity.private?.container)continue;
   living.add(entity.id);let actor=this.actors.get(entity.id);
   if(actor&&actor.entity.type!==entity.type){actor.dispose();this.actors.delete(entity.id);actor=undefined}
   if(!actor){actor=new ActorVisual(entity,this.options.catalog,this.options.art,snapshot.players.find(p=>p.id===entity.owner)?.faction);this.actors.set(entity.id,actor);this.actorsLayer.addChild(actor.root)}
   actor.presentation=presentations.get(entity.id);actor.update(entity,this.tickAt);
  }
  this.readFeedback(snapshot);
  // A disappeared enemy is removed immediately: interpolation cannot expose
  // its route after sight loss. No distinction is guessed between fog/death.
  for(const [id,actor] of this.actors)if(!living.has(id)){
   if(snapshot.events.some(event=>event.entity===id&&event.kind==='destroyed')){
    actor.update({...actor.entity,state:'destroyed',health:0},this.tickAt);this.deaths.push({actor,until:this.tickAt+2400});
   }else actor.dispose();
   this.actors.delete(id);
  }
  if(!this.centered){const hq=snapshot.entities.find(e=>e.owner===snapshot.player&&e.type==='hq')??snapshot.entities.find(e=>e.owner===snapshot.player);if(hq?.position){this.center(hq.position);this.centered=true}}
  this.updateRubble();this.updateFog();this.updateMemories();
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
  for(const key of changed){const chunk=this.chunks.get(key);if(chunk){chunk.sprite.destroy();chunk.texture.destroy(true);this.chunks.delete(key)}}
 }
 private team(owner:number){const player=this.snapshot?.players.find(p=>p.id===owner);const palette=tokens.color.team[this.settings.palette];return color(palette[Math.max(0,(player?.color??owner)-1)%palette.length]??'#b9b4a6')}
 private updateFog(){
  const snapshot=this.snapshot;if(!snapshot||snapshot.tick===this.fogTick)return;this.fogTick=snapshot.tick;
  const context=this.fogCanvas.getContext('2d')!,pixels=context.createImageData(this.fogCanvas.width,this.fogCanvas.height);
  for(let i=0;i<snapshot.visible.length;i++){const a=i*4;pixels.data[a]=8;pixels.data[a+1]=9;pixels.data[a+2]=7;pixels.data[a+3]=snapshot.visible[i]?0:snapshot.explored[i]?175:255}
  context.putImageData(pixels,0,0);this.fogTexture?.source.update();
 }
 private updateMemories(){
  const snapshot=this.snapshot;if(!snapshot)return;const key=JSON.stringify(snapshot.memory);
  if(key===this.memoryKey)return;this.memoryKey=key;
  for(const child of this.memories.removeChildren())child.destroy({children:true});
  for(const memory of snapshot.memory){
   if(!memory.position||snapshot.entities.some(entity=>entity.id===memory.id))continue;
   const i=Math.floor(memory.position.y/1000)*this.options.map.width+Math.floor(memory.position.x/1000);
   if(!snapshot.explored[i])continue;
   const g=new Graphics(),b=this.options.catalog.buildings.get(memory.type),p=toScreen(memory.position.x,memory.position.y);
   drawStructure(g,{width:memory.footprintWidth||b?.width||2,height:memory.footprintHeight||b?.height||2,role:b?.role??'garrison',paint:0x514d41,team:0x666353,progress:1000,complete:true,health:1000,enabled:false,memory:true});
   g.position.set(p.x,p.y);this.memories.addChild(g);
  }
 }
 private invalidateTerrain(){for(const chunk of this.chunks.values()){chunk.sprite.destroy();chunk.texture.destroy(true)}this.chunks.clear()}
 private terrainFrame(){
  const corners=[this.point({x:-600,y:-400}),this.point({x:this.app.screen.width+600,y:-400}),this.point({x:-600,y:this.app.screen.height+400}),this.point({x:this.app.screen.width+600,y:this.app.screen.height+400})];
  const minX=Math.floor(Math.min(...corners.map(p=>p.x))/1000/CHUNK),maxX=Math.floor(Math.max(...corners.map(p=>p.x))/1000/CHUNK);
  const minY=Math.floor(Math.min(...corners.map(p=>p.y))/1000/CHUNK),maxY=Math.floor(Math.max(...corners.map(p=>p.y))/1000/CHUNK);
  for(const c of this.chunks.values())c.sprite.visible=false;
  let baked=0;
  for(let y=minY;y<=Math.min(maxY,this.baker.chunksY-1);y++)for(let x=minX;x<=Math.min(maxX,this.baker.chunksX-1);x++){
   const key=`${x}:${y}`;let chunk=this.chunks.get(key);
   if(!chunk){if(baked>=2)continue;const texture=this.baker.bake(x,y),sprite=new Sprite(texture),origin=this.baker.chunkOrigin(x,y);sprite.position.set(origin.x,origin.y);this.terrain.addChild(sprite);chunk={texture,sprite,used:this.frame};this.chunks.set(key,chunk);baked++}
   chunk.sprite.visible=true;chunk.used=this.frame;
  }
  if(this.chunks.size>36){for(const [key,chunk] of [...this.chunks].sort(([,a],[,b])=>a.used-b.used)){if(this.chunks.size<=36)break;if(chunk.sprite.visible)continue;chunk.sprite.destroy();chunk.texture.destroy(true);this.chunks.delete(key)}}
 }
 private readFeedback(snapshot:PlayerSnapshot){
  for(const event of snapshot.events){
   if(event.id<=this.effectEvent)continue;this.effectEvent=event.id;
   if(event.tick+4>=snapshot.tick)this.actors.get(event.entity)?.cue(event.kind,this.tickAt-(snapshot.tick-event.tick)*50);
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
  for(const prop of this.props)prop.render(now,0xaaa584,false,'selected',true);
  for(const actor of this.actors.values()){
   const bounds=this.bounds(actor.entity);actor.root.visible=!!bounds&&bounds.right>=-200&&bounds.left<=this.app.screen.width+200&&bounds.bottom>=-200&&bounds.top<=this.app.screen.height+200;
   if(actor.root.visible)actor.render(now,this.team(actor.entity.owner),this.selected.has(actor.id),this.settings.healthBars,this.settings.reducedMotion);
   if(actor.standIn||actor.missingArt)this.missing.add(actor.entity.type);
  }
  for(let i=this.deaths.length-1;i>=0;i--){const death=this.deaths[i];if(now>=death.until){death.actor.dispose();this.deaths.splice(i,1);continue}death.actor.render(now,this.team(death.actor.entity.owner),false,'selected',this.settings.reducedMotion);death.actor.root.alpha=Math.min(1,(death.until-now)/700)}
  if(this.frame%60===0)this.options.art.trim();
  this.drawTactical(now);this.overlay.clear();
  if(this.drag&&this.drag.button!==this.settings.bindings.pointer.pan&&Math.hypot(this.drag.start.x-this.drag.last.x,this.drag.start.y-this.drag.last.y)>=this.settings.dragThreshold){const a=this.drag.start,b=this.drag.last;this.overlay.rect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(a.x-b.x),Math.abs(a.y-b.y)).fill({color:0xbcce88,alpha:.08}).stroke({width:1,color:0xc7d895})}
 }
 private diamond(g:Graphics,p:Point,w:number,h:number,paint:number,alpha=.2){
  const a=toScreen(p.x-w*500,p.y-h*500),b=toScreen(p.x+w*500,p.y-h*500),c=toScreen(p.x+w*500,p.y+h*500),d=toScreen(p.x-w*500,p.y+h*500);
  g.poly([a.x,a.y,b.x,b.y,c.x,c.y,d.x,d.y]).fill({color:paint,alpha}).stroke({width:1.5,color:paint});
 }
 private drawTactical(now:number){
  const g=this.tactical.clear(),s=this.snapshot;if(!s)return;
  for(const marker of activeMissionMarkers(this.missionMarkers,s.mission)){
   this.diamond(g,marker.position,(marker.max.x-marker.min.x+1)/1000,(marker.max.y-marker.min.y+1)/1000,0xe0bc65,.04);
   const p=toScreen(marker.position.x,marker.position.y);g.ellipse(p.x,p.y,15,7.5).stroke({width:2,color:0xf1ce78});g.moveTo(p.x-23,p.y).lineTo(p.x-10,p.y).moveTo(p.x+10,p.y).lineTo(p.x+23,p.y).moveTo(p.x,p.y-15).lineTo(p.x,p.y-6).moveTo(p.x,p.y+6).lineTo(p.x,p.y+15).stroke({width:2,color:0xf1ce78});
  }
  for(const station of s.stations){if(!station.position)continue;const p=toScreen(station.position.x,station.position.y);g.rect(p.x-11,p.y-18,22,18).fill({color:0x4c4b3b}).stroke({width:2,color:this.team(station.owner)});g.moveTo(p.x,p.y-18).lineTo(p.x,p.y-36).lineTo(p.x+12,p.y-32).lineTo(p.x,p.y-27).fill({color:this.team(station.owner)}).stroke({width:1,color:0xdbd0a5})}
  for(const salvage of s.salvage){if(salvage.position)this.diamond(g,salvage.position,.5,.5,0xb9934b,.65)}
  for(const projectile of s.projectiles){
   if(!projectile.position||!projectile.impact)continue;
   const p=toScreen(projectile.position.x,projectile.position.y),end=toScreen(projectile.impact.x,projectile.impact.y);
   g.circle(p.x,p.y-10,projectile.interceptable?3:1.7).fill({color:projectile.interceptable?0xe9caa0:0xeed49a});
   if(projectile.warning){g.ellipse(end.x,end.y,38,19).stroke({width:2,color:0xe18348});g.moveTo(end.x-10,end.y).lineTo(end.x+10,end.y).moveTo(end.x,end.y-7).lineTo(end.x,end.y+7).stroke({width:1,color:0xffd19b})}
  }
  for(const warning of s.warnings){if(!warning.position)continue;const p=toScreen(warning.position.x,warning.position.y);g.ellipse(p.x,p.y,55,27.5).stroke({width:2,color:warning.kind==='transfer'?0xd8bd79:0xdf7046})}
  for(const entity of s.entities){if(!this.selected.has(entity.id)||!entity.position||!entity.private)continue;let start=toScreen(entity.position.x,entity.position.y);for(const order of entity.private.orders){if(!order.position)continue;const end=toScreen(order.position.x,order.position.y);g.moveTo(start.x,start.y).lineTo(end.x,end.y).stroke({width:1,color:0xc5cb91,alpha:.5});g.ellipse(end.x,end.y,6,3).stroke({width:1,color:0xc5cb91});if(entity.state==='blocked'){g.moveTo(end.x-7,end.y-7).lineTo(end.x+7,end.y+7).moveTo(end.x+7,end.y-7).lineTo(end.x-7,end.y+7).stroke({width:2,color:0xea926f})}start=end}}
  if(this.placement){const p=this.placement.position??(this.pointer?this.point(this.pointer):undefined);if(p)this.diamond(g,p,this.placement.width,this.placement.height,this.placement.valid===false?0xdb5c46:this.placement.valid?0xa9cc79:0xd8b766)}
  void now;
 }
 renderMinimap(canvas:HTMLCanvasElement){
  const ctx=canvas.getContext('2d'),s=this.snapshot,m=this.options.map;if(!ctx||!s)return;
  const image=ctx.createImageData(m.width,m.height);
  for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++){const i=y*m.width+x,[r,g,b]=TerrainBaker.minimapColor(this.presentationMap,x,y),k=s.visible[i]?1:s.explored[i]?.4:.04;image.data.set([r*k,g*k,b*k,255],i*4)}
  const temp=document.createElement('canvas');temp.width=m.width;temp.height=m.height;temp.getContext('2d')!.putImageData(image,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(temp,0,0,canvas.width,canvas.height);
  const sx=canvas.width/(m.width*1000),sy=canvas.height/(m.height*1000);
  for(const marker of activeMissionMarkers(this.missionMarkers,s.mission)){const x=marker.position.x*sx,y=marker.position.y*sy;ctx.strokeStyle='#f1ce78';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x,y-5);ctx.lineTo(x+5,y);ctx.lineTo(x,y+5);ctx.lineTo(x-5,y);ctx.closePath();ctx.stroke()}
  for(const e of s.entities){if(!e.position||e.private?.container)continue;ctx.fillStyle=`#${this.team(e.owner).toString(16).padStart(6,'0')}`;const size=this.options.catalog.isBuilding(e.type)?4:2;ctx.fillRect(e.position.x*sx-size/2,e.position.y*sy-size/2,size,size)}
  ctx.strokeStyle='#e2d6ad';ctx.lineWidth=1;ctx.beginPath();const corners=[{x:0,y:0},{x:this.app.screen.width,y:0},{x:this.app.screen.width,y:this.app.screen.height},{x:0,y:this.app.screen.height}].map(p=>this.point(p));corners.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x*sx,p.y*sy);else ctx.lineTo(p.x*sx,p.y*sy)});ctx.closePath();ctx.stroke();
 }
 minimapPoint(canvas:HTMLCanvasElement,clientX:number,clientY:number):Point{const r=canvas.getBoundingClientRect(),m=this.options.map;return {x:Math.round(clamp((clientX-r.left)/r.width,0,1)*m.width*1000),y:Math.round(clamp((clientY-r.top)/r.height,0,1)*m.height*1000)}}
 dispose(){
  if(this.disposed)return;this.disposed=true;this.listeners.abort();this.resizeObserver?.disconnect();
  for(const actor of this.actors.values())actor.dispose();this.actors.clear();for(const prop of this.props)prop.dispose();
  for(const death of this.deaths)death.actor.dispose();this.deaths.length=0;
  this.invalidateTerrain();this.fogTexture?.destroy(true);
  if(this.app.renderer)this.app.destroy(true,{children:true});
 }
}
