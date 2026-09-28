import {Container,Graphics,Sprite} from 'pixi.js';
import type {Entity,Point} from '../runtime';
import type {CatalogIndex} from '../content/catalog';
import type {ArtLibrary,SpriteSheet,SpriteState} from './art';
import {headingIndex,toScreen,LEVEL_PX} from './iso';
import {TerrainSurface,projectSurfaceVertex} from './terrain-surface';
import {drawStructure,structureHeight} from './structure';
import {actorSpriteState,actorEventStates,visibleSquadMembers,type BuildingPresentation} from './poses';
import {FlightPresentation} from './flight-presentation';
import {actorArtKey,physicalArtType} from './art-id';
import {ActorStatusOverlay} from './actor-status';
import type {ActorStatusModel} from '../app/actor-status';

interface LayeredPart {root:Container;shadowRoot:Container;shadow:Sprite;beauty:Sprite;team:Sprite;offset:Point;poses:Record<string,{state:string;direction:number;frame:number}>}
function part(parent:Container,groundShadows:Container,offset:Point):LayeredPart {
 const root=new Container(),shadowRoot=new Container(),shadow=new Sprite(),beauty=new Sprite(),team=new Sprite();
 shadowRoot.addChild(shadow);groundShadows.addChild(shadowRoot);
 root.addChild(beauty,team);parent.addChild(root);shadow.alpha=.46;
 return {root,shadowRoot,shadow,beauty,team,offset,poses:{}};
}

/** Presentation only: every pose is chosen from the latest Go-authorized state.
 * Temporary art substitutions are exposed to QA, never labeled final assets. */
export class ActorVisual {
 readonly root=new Container();readonly fallback=new Graphics();readonly overlays=new Graphics();
 private readonly groundShadows=new Container();
 private readonly foundation=new Graphics();private support?:{surface:TerrainSurface;x:number;y:number;width:number;height:number;level:number};
 readonly id:number;readonly artKey:string;standIn=false;missingArt=false;
 /** Aircraft shadows join the terrain scene separately from the airborne body. */
 readonly terrainShadow?:Container;
 readonly ready:Promise<void>;
 private sheet?:SpriteSheet;private parts:LayeredPart[]=[];private turret?:LayeredPart;
 private disposed=false;private lastState='';private stateAt=0;
 private lastPosition:Point;private nextPosition:Point;private changedAt=0;
 private previousFacing=0;private nextFacing=0;
 private action?:{names:string[];at:number};
 private livingMembers=Infinity;
 private readonly flight=new FlightPresentation();private suppressTransition=false;
 presentation?:BuildingPresentation;
 receivingBoarder=false;
 status?:ActorStatusModel;private readonly statusOverlay=new ActorStatusOverlay();private externalStatus=false;
 /** Authorized information stays above world geometry, including a collapsed
  * service building beneath an aircraft's emergency takeoff. */
 attachStatusLayer(layer:Container){this.externalStatus=true;layer.addChild(this.statusOverlay.root)}
 hideStatus(){this.statusOverlay.root.visible=false}
 private serviceDeck?:ActorVisual;
 setServiceDeck(deck:ActorVisual|undefined){this.serviceDeck=deck}
 departureDeck(now:number){return !this.entity.landed&&this.entity.state!=='destroyed'&&this.flight.altitude(this.entity,now,this.cruiseAltitude())<this.cruiseAltitude()?this.serviceDeck?.id:undefined}
 serviceRoofOffset(){const b=this.catalog.buildings.get(physicalArtType(this.entity));return !this.sheet&&b?.service_slots?structureHeight(b.role):0}
 entity:Entity;
 constructor(entity:Entity,private catalog:CatalogIndex,art:ArtLibrary,faction?:string,private surface?:TerrainSurface,private readonly skin?:{asset:string;direction:0|1|2|3}){
  this.id=entity.id;this.artKey=actorArtKey(entity,faction);this.entity=entity;this.lastPosition=this.nextPosition={...entity.position!};
  this.lastState=entity.state;this.stateAt=performance.now();this.previousFacing=this.nextFacing=entity.facing;
  // All projected ground shadows sit behind the whole actor. A turret's
  // independent shadow must never darken an already-painted hull or plinth.
  this.root.addChild(this.foundation,this.groundShadows,this.fallback,this.overlays,this.statusOverlay.root);
  if(surface&&catalog.units.get(entity.type)?.armor==='air'){this.root.removeChild(this.groundShadows);this.terrainShadow=this.groundShadows}
  const resolved=skin?{id:skin.asset,standIn:false}:art.resolve(physicalArtType(entity),faction,catalog);this.standIn=resolved?.standIn??false;
  this.missingArt=!resolved;
  this.ready=resolved?art.sheet(resolved.id).then(sheet=>{
   if(this.disposed)return;
   this.sheet=sheet;this.missingArt=!sheet;
   if(!sheet)return;
   const members=sheet.meta.squad?.member_offsets_mt??[[0,0]];
   for(const [x,y] of members)this.parts.push(part(this.root,this.groundShadows,{x,y}));
   if(sheet.meta.states.some(s=>s.part==='turret'))this.turret=part(this.root,this.groundShadows,{x:0,y:0});
   this.root.addChild(this.overlays);if(!this.externalStatus)this.root.addChild(this.statusOverlay.root);
  }):Promise.resolve();
 }
 update(entity:Entity,now:number){
  const p=this.suppressTransition?entity.position!:this.position(now);this.lastPosition=p;this.nextPosition={...entity.position!};this.changedAt=now;
  this.previousFacing=this.suppressTransition?entity.facing:this.nextFacing;this.nextFacing=entity.facing;
  const unit=this.catalog.units.get(entity.type);
  if(unit?.armor==='air'&&!this.suppressTransition)this.flight.observe(this.entity,entity,now,this.cruiseAltitude(),this.sheet?.states,unit.faction==='IR'||unit.role==='scout_drone');
  this.suppressTransition=false;
  if(entity.state!==this.lastState){this.lastState=entity.state;this.stateAt=now}
  this.entity=entity;
 }
 clearFeedback(){this.action=undefined;this.flight.reset();this.suppressTransition=true}
 setSurface(surface:TerrainSurface){this.surface=surface;this.support=undefined}
 /** A rigid foundation reaches the highest exact clipped terrain point. This
  * changes presentation only; Go remains the authority for legal footprints. */
 groundAnchor(now:number,reducedMotion=false):Point{
  const p=this.position(now),surface=this.surface;if(!surface)return toScreen(p.x,p.y);
  const b=this.catalog.buildings.get(this.entity.type),w=this.entity.footprintWidth||b?.width||0,h=this.entity.footprintHeight||b?.height||0;
  if(w&&h){
   if(!this.support||this.support.surface!==surface||this.support.x!==p.x||this.support.y!==p.y||this.support.width!==w||this.support.height!==h){
    const support=surface.footprintSurface(p,w,h),origin=projectSurfaceVertex({...p,height:support.height});this.foundation.clear();
    if(support.boundary.some(v=>v.height<support.height-.001)){
     const top=support.top.map(v=>projectSurfaceVertex(v));this.foundation.poly(top.flatMap(v=>[v.x-origin.x,v.y-origin.y])).fill({color:0x766a54});
     for(let i=0;i<support.boundary.length;i++){
      const a=support.boundary[i],b=support.boundary[(i+1)%support.boundary.length];
      // Only the two camera-facing perimeter sides need a visible skirt.
      if(Math.abs(a.x-(p.x+w*500))>.01&&Math.abs(a.y-(p.y+h*500))>.01)continue;
      if(Math.abs(b.x-(p.x+w*500))>.01&&Math.abs(b.y-(p.y+h*500))>.01)continue;
      const vertices=[{...a,height:support.height},{...b,height:support.height},b,a].map(projectSurfaceVertex);
      this.foundation.poly(vertices.flatMap(v=>[v.x-origin.x,v.y-origin.y])).fill({color:a.x===b.x?0x625644:0x514936});
     }
    }
    this.support={surface,x:p.x,y:p.y,width:w,height:h,level:support.height};
   }
   return projectSurfaceVertex({...p,height:this.support.level});
  }
  const anchor=surface.projectGround(p),deck=this.serviceDeck;
  if(deck){
   const d=deck.position(now),support=deck.groundAnchor(now,reducedMotion),lift=toScreen(d.x,d.y).y-support.y+deck.serviceRoofOffset();
   const weight=1-this.flight.altitude(this.entity,now,this.cruiseAltitude(),reducedMotion)/this.cruiseAltitude();
   anchor.y+=(toScreen(p.x,p.y).y-lift-anchor.y)*weight;
  }
  return anchor;
 }
 /** Cosmetic airborne height over local ground. At cruise all aircraft clear
  * the public map's highest plateau; takeoff/landing keep Go-derived timing. */
 visualAltitude(now:number,reducedMotion=false):number{
  if(this.catalog.units.get(this.entity.type)?.armor!=='air')return 0;
  const cruise=this.cruiseAltitude(),base=this.flight.altitude(this.entity,now,cruise,reducedMotion),surface=this.surface;
  return base+(surface?(surface.maxHeight-surface.sampleGround(this.position(now)))*LEVEL_PX*(base/cruise):0);
 }
 groundDepth(now:number,reducedMotion=false):number{
  const p=this.position(now),b=this.catalog.buildings.get(this.entity.type),w=this.entity.footprintWidth||b?.width||0,h=this.entity.footprintHeight||b?.height||0;
  return Math.max(p.x+p.y+(w&&h?(w+h)*500:0),this.entity.landed&&this.serviceDeck?this.serviceDeck.groundDepth(now,reducedMotion)+.01:0)+(this.visualAltitude(now,reducedMotion)>0?1000000:0);
 }
 private cruiseAltitude(){return Math.max(20,(this.sheet?.meta.air?.cruise_altitude_mt??1400)/1000*25)}
 cue(kind:string,now:number,owned=false){
  const names=actorEventStates(kind,this.entity,owned);
  if(names)this.action={names,at:now};
 }
 private activeAction(now:number):SpriteState|undefined{
  if(!this.action||!this.sheet||this.entity.state==='destroyed'||!this.entity.enabled||!this.entity.complete)return;
  for(const name of this.action.names){const state=this.sheet.states.get(name);if(state&&state.fps>0&&now-this.action.at<state.frames/state.fps*1000)return state}
 }
 position(now:number):Point{
  const a=Math.min(1,Math.max(0,(now-this.changedAt)/50));
  // Never extrapolate beyond an authorized position.
  return {x:this.lastPosition.x+(this.nextPosition.x-this.lastPosition.x)*a,y:this.lastPosition.y+(this.nextPosition.y-this.lastPosition.y)*a};
 }
 private state(now:number,reducedMotion=false):SpriteState|undefined{
  if(!this.sheet)return;
  const action=this.activeAction(now);
  if(action&&action.part!=='turret'&&!(this.presentation&&this.entity.health<=500))return action;
  const transition=this.entity.enabled&&this.entity.complete?this.flight.state(now,this.sheet.states,reducedMotion):undefined;
  if(transition)return transition;
  const moving=Math.hypot(this.nextPosition.x-this.lastPosition.x,this.nextPosition.y-this.lastPosition.y)>4;
  const turning=reducedMotion?0:((this.nextFacing-this.previousFacing)%360000+540000)%360000-180000;
  return actorSpriteState(this.entity,this.catalog.units.get(this.entity.type),moving,this.sheet.states,this.presentation,turning,this.receivingBoarder);
 }
 private frameIndex(state:SpriteState,now:number){
  const progress=state.name==='charging'?this.presentation?.strategicProgress??0:this.entity.progress;
  const start=this.action?.names.includes(state.name)?this.action.at:this.flight.startedAt(state.name,now)??this.stateAt;
  let frame=state.progress_driven?Math.min(state.frames-1,Math.max(0,Math.floor(progress/1000*state.frames))):state.fps>0?Math.max(0,Math.floor((now-start)/1000*state.fps)):0;
  return state.loop?frame%state.frames:Math.min(state.frames-1,frame);
 }
 private hardpoint(name:string,state:SpriteState,heading:number,now:number):Point|undefined{
  const values=this.sheet?.meta.hardpoints_2x_rel_anchor?.[name];if(!values)return;
  const source=this.sheet!.sourceFrame(state.name,headingIndex(heading,state.directions),this.frameIndex(state,now));
  const direction=String(source.direction).padStart(2,'0'),frame=String(source.index).padStart(2,'0');
  const point=values[`${source.state}/d${direction}_f${frame}`]??values[`${source.state}/d${direction}_f00`];
  return point?{x:point[0]/2,y:point[1]/2}:undefined;
 }
 private paintPart(p:LayeredPart,state:SpriteState,heading:number,now:number,team:number,altitude:number,groundOffset=0,position=this.position(now)){
  const sheet=this.sheet!,frame=this.frameIndex(state,now);
  const d=headingIndex(heading,state.directions),offset=toScreen(p.offset.x,p.offset.y);
  p.root.position.set(offset.x,offset.y-altitude+groundOffset);
  p.shadowRoot.position.copyFrom(p.root.position);
  for(const [name,sprite] of [['shadow',p.shadow],['beauty',p.beauty],['team',p.team]] as const){
   const f=sheet.frame(name,state.name,d,frame)??sheet.frame(name,state.name,d,0);
   if(!f){
    // Keep the last authorized pose while the next animation page uploads.
    // A layer absent from this state (for example wreck team color) is hidden.
    if(!sheet.hasFrame(name,state.name,d,frame)&&!sheet.hasFrame(name,state.name,d,0)){sprite.visible=false;delete p.poses[name]}
    else {const previous=p.poses[name];if(previous)sheet.frame(name,previous.state,previous.direction,previous.frame)}
    continue;
   }
   sprite.visible=true;p.poses[name]={state:state.name,direction:d,frame};
   sprite.texture=f.texture;sprite.anchor.set(f.anchorX,f.anchorY);sprite.scale.set(sheet.pixelScale);
   sprite.tint=name==='team'?team:0xffffff;
   if(name==='shadow'&&this.terrainShadow&&this.surface){
    const cast={x:position.x+p.offset.x+altitude*12.5,y:position.y+p.offset.y},ground=this.surface.projectGround(cast),deck=this.serviceDeck;
    if(deck){const home=deck.entity,center=deck.position(now);if(Math.abs(cast.x-center.x)<=home.footprintWidth*500&&Math.abs(cast.y-center.y)<=home.footprintHeight*500){const support=deck.groundAnchor(now);ground.y=toScreen(cast.x,cast.y).y-(toScreen(center.x,center.y).y-support.y+deck.serviceRoofOffset())}}
    p.shadowRoot.position.set(ground.x-this.terrainShadow.x,ground.y-this.terrainShadow.y);sprite.position.set(0,0);
   }else sprite.position.set(name==='shadow'?altitude*.4:0,name==='shadow'?altitude*1.2:0);
  }
 }
 render(now:number,team:number,selected:boolean,healthBars:'always'|'selected'|'damaged',reducedMotion:boolean,zoom=1,statusDetail=selected){
  const e=this.entity,p=this.position(now),screen=this.groundAnchor(now,reducedMotion),unit=this.catalog.units.get(e.type),building=this.catalog.buildings.get(e.type);
  const altitude=this.visualAltitude(now,reducedMotion);
  this.root.position.set(screen.x,screen.y);this.root.zIndex=this.groundDepth(now,reducedMotion);
  this.root.alpha=e.concealed?.65:1;
  if(this.terrainShadow){this.terrainShadow.position.set(screen.x,screen.y);this.terrainShadow.zIndex=Math.max(p.x+p.y+altitude*12.5+.001,this.serviceDeck?this.serviceDeck.groundDepth(now)+.005:0);this.terrainShadow.alpha=this.root.alpha;this.terrainShadow.visible=this.root.visible}
  const state=this.state(now,reducedMotion),facing=this.skin?this.skin.direction*90000:reducedMotion?e.facing:this.previousFacing+(((this.nextFacing-this.previousFacing)%360000+540000)%360000-180000)*Math.min(1,(now-this.changedAt)/50);
  const animationTime=reducedMotion?(e.state==='destroyed'?this.stateAt+10000:this.activeAction(now)?this.action!.at:this.stateAt):now;
  this.fallback.visible=!state;
  if(state){
   if(e.state!=='destroyed')this.livingMembers=visibleSquadMembers(e.health,this.parts.length);
   for(const [index,member] of this.parts.entries()){
    member.root.visible=member.shadowRoot.visible=index<this.livingMembers;
    if(member.root.visible){
     const memberGround=this.surface&&!building&&unit?.armor!=='air'?this.surface.projectGround({x:p.x+member.offset.x,y:p.y+member.offset.y}).y-screen.y-toScreen(member.offset.x,member.offset.y).y:0;
     this.paintPart(member,state,facing,animationTime,team,altitude,memberGround,p);
    }
   }
   if(this.turret){
    // Building construction and damage plates already contain their assembled
    // turret. Drawing its independent live layer again creates a floating gun.
    this.turret.root.visible=this.turret.shadowRoot.visible=e.state!=='destroyed'&&(!building||(e.complete&&e.enabled&&e.health>500&&e.state!=='selling'&&!this.presentation?.lowPower));
    const turret=this.activeAction(now)?.part==='turret'?this.activeAction(now):this.sheet!.states.get(e.state==='firing'?'fire':'aim')??this.sheet!.states.get('aim');
    if(turret){
     const pivot=this.sheet!.meta.turret_pivot_mt??[0,0],a=facing*Math.PI/180000;
     this.turret.offset={x:pivot[0]*Math.cos(a)-pivot[1]*Math.sin(a),y:pivot[0]*Math.sin(a)+pivot[1]*Math.cos(a)};
     this.paintPart(this.turret,turret,e.turretFacing,animationTime,team,altitude,0,p);
    }
   }
  }else if(building||e.footprintWidth){
   const physical=this.catalog.buildings.get(physicalArtType(e));
   drawStructure(this.fallback,{width:e.footprintWidth||building?.width||2,height:e.footprintHeight||building?.height||2,role:physical?.role??building?.role??'garrison',paint:0x7d7963,team,progress:e.progress,complete:e.complete,health:e.health,enabled:e.enabled});
  }else{
   // Explicit development marker until the missing sprite is authored.
   this.fallback.clear().poly([-10,0,0,-10,10,0,0,7]).fill({color:team}).stroke({width:2,color:0x15130f});
  }
  this.overlays.clear();
  const radius=building?(e.footprintWidth+e.footprintHeight)*16:Math.max(12,(unit?.radius??400)/1000*48);
  if(selected)this.overlays.ellipse(0,0,radius,radius*.5).stroke({width:1.5,color:0xb6dd77});
  const show=e.state!=='destroyed'&&(healthBars==='always'||selected||healthBars==='damaged'&&e.health<1000);
  if(show){
   const anchor=state?this.hardpoint('healthbar',state,facing,animationTime):undefined;
   const x=anchor?.x??0,y=-altitude+(anchor?.y??-(building?45:24)),width=building?60:30;
   this.overlays.rect(x-width/2,y,width,4).fill({color:0x161410,alpha:.95});
   this.overlays.rect(x-width/2+1,y+1,(width-2)*Math.max(0,e.health)/1000,2).fill({color:e.health>600?0x9fc776:e.health>300?0xd3b359:0xc64f3c});
  }
  if(!this.status&&e.private?.ambushReady)this.overlays.poly([-4,-37,0,-42,4,-37,0,-32]).fill({color:0xe2a232});
  if(e.rank>0){for(let i=0;i<e.rank;i++)this.overlays.poly([-4+i*7,-27,0+i*7,-30,4+i*7,-27]).stroke({width:2,color:0xe5c57a})}
  const statusAnchor=state?this.hardpoint('healthbar',state,facing,animationTime):undefined;
  this.statusOverlay.root.position.set((this.externalStatus?screen.x:0)+(statusAnchor?.x??0),(this.externalStatus?screen.y:0)-altitude+(statusAnchor?.y??-(building?45:24))-18/Math.max(.1,zoom));
  this.statusOverlay.draw(e.state==='destroyed'?undefined:this.status,selected&&statusDetail,zoom);
 }
 dispose(){this.disposed=true;this.statusOverlay.dispose();this.root.destroy({children:true});this.terrainShadow?.destroy({children:true})}
}
