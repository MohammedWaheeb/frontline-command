import {Container,Graphics,Sprite} from 'pixi.js';
import type {Entity,Point} from '../runtime';
import type {CatalogIndex} from '../content/catalog';
import type {ArtLibrary,SpriteSheet,SpriteState} from './art';
import {headingIndex,toScreen} from './iso';
import {drawStructure} from './structure';
import {actorSpriteState,visibleSquadMembers,type BuildingPresentation} from './poses';

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
 readonly id:number;standIn=false;missingArt=false;
 readonly ready:Promise<void>;
 private sheet?:SpriteSheet;private parts:LayeredPart[]=[];private turret?:LayeredPart;
 private disposed=false;private lastState='';private stateAt=0;
 private lastPosition:Point;private nextPosition:Point;private changedAt=0;
 private previousFacing=0;private nextFacing=0;
 private action?:{names:string[];at:number};
 private livingMembers=Infinity;
 presentation?:BuildingPresentation;
 entity:Entity;
 constructor(entity:Entity,private catalog:CatalogIndex,art:ArtLibrary,faction?:string){
  this.id=entity.id;this.entity=entity;this.lastPosition=this.nextPosition={...entity.position!};
  // All projected ground shadows sit behind the whole actor. A turret's
  // independent shadow must never darken an already-painted hull or plinth.
  this.root.addChild(this.groundShadows,this.fallback,this.overlays);
  const resolved=art.resolve(entity.type,faction,catalog);this.standIn=resolved?.standIn??false;
  this.missingArt=!resolved;
  this.ready=resolved?art.sheet(resolved.id).then(sheet=>{
   if(this.disposed)return;
   this.sheet=sheet;this.missingArt=!sheet;
   if(!sheet)return;
   const members=sheet.meta.squad?.member_offsets_mt??[[0,0]];
   for(const [x,y] of members)this.parts.push(part(this.root,this.groundShadows,{x,y}));
   if(sheet.meta.states.some(s=>s.part==='turret'))this.turret=part(this.root,this.groundShadows,{x:0,y:0});
   this.root.addChild(this.overlays);
  }):Promise.resolve();
 }
 update(entity:Entity,now:number){
  const p=this.position(now);this.lastPosition=p;this.nextPosition={...entity.position!};this.changedAt=now;
  this.previousFacing=this.nextFacing;this.nextFacing=entity.facing;
  if(entity.state!==this.lastState){this.lastState=entity.state;this.stateAt=now}
  this.entity=entity;
 }
 clearFeedback(){this.action=undefined}
 cue(kind:string,now:number){
  const names=kind==='weapon_fired'?['fire','volley','launch']:kind==='interceptor_fired'?['launch']:kind==='strategic_activated'?['activate']:undefined;
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
 private state(now:number):SpriteState|undefined{
  if(!this.sheet)return;
  const action=this.activeAction(now);
  if(action&&action.part!=='turret'&&!(this.presentation&&this.entity.health<=500))return action;
  const moving=Math.hypot(this.nextPosition.x-this.lastPosition.x,this.nextPosition.y-this.lastPosition.y)>4;
  return actorSpriteState(this.entity,this.catalog.units.get(this.entity.type),moving,this.sheet.states,this.presentation);
 }
 private frameIndex(state:SpriteState,now:number){
  const progress=state.name==='charging'?this.presentation?.strategicProgress??0:this.entity.progress;
  const start=this.action?.names.includes(state.name)?this.action.at:this.stateAt;
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
 private paintPart(p:LayeredPart,state:SpriteState,heading:number,now:number,team:number,altitude:number){
  const sheet=this.sheet!,frame=this.frameIndex(state,now);
  const d=headingIndex(heading,state.directions),offset=toScreen(p.offset.x,p.offset.y);
  p.root.position.set(offset.x,offset.y-altitude);
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
   // Ground shadow remains on the terrain while the aircraft rises.
   sprite.position.set(name==='shadow'?altitude*.4:0,name==='shadow'?altitude*1.2:0);
  }
 }
 render(now:number,team:number,selected:boolean,healthBars:'always'|'selected'|'damaged',reducedMotion:boolean){
  const e=this.entity,p=this.position(now),screen=toScreen(p.x,p.y),unit=this.catalog.units.get(e.type),building=this.catalog.buildings.get(e.type);
  const air=unit?.armor==='air'&&!e.landed,altitude=air?Math.max(20,(this.sheet?.meta.air?.cruise_altitude_mt??1400)/1000*25):0;
  this.root.position.set(screen.x,screen.y);this.root.zIndex=p.x+p.y+(air?1000000:0);
  this.root.alpha=e.concealed?.65:1;
  const state=this.state(now),facing=reducedMotion?e.facing:this.previousFacing+(((this.nextFacing-this.previousFacing)%360000+540000)%360000-180000)*Math.min(1,(now-this.changedAt)/50);
  const animationTime=reducedMotion?(e.state==='destroyed'?this.stateAt+10000:this.activeAction(now)?this.action!.at:this.stateAt):now;
  this.fallback.visible=!state;
  if(state){
   if(e.state!=='destroyed')this.livingMembers=visibleSquadMembers(e.health,this.parts.length);
   for(const [index,member] of this.parts.entries()){
    member.root.visible=member.shadowRoot.visible=index<this.livingMembers;
    if(member.root.visible)this.paintPart(member,state,facing,animationTime,team,altitude);
   }
   if(this.turret){
    // Building construction and damage plates already contain their assembled
    // turret. Drawing its independent live layer again creates a floating gun.
    this.turret.root.visible=this.turret.shadowRoot.visible=e.state!=='destroyed'&&(!building||(e.complete&&e.enabled&&e.health>500&&e.state!=='selling'&&!this.presentation?.lowPower));
    const turret=this.activeAction(now)?.part==='turret'?this.activeAction(now):this.sheet!.states.get(e.state==='firing'?'fire':'aim')??this.sheet!.states.get('aim');
    if(turret){
     const pivot=this.sheet!.meta.turret_pivot_mt??[0,0],a=facing*Math.PI/180000;
     this.turret.offset={x:pivot[0]*Math.cos(a)-pivot[1]*Math.sin(a),y:pivot[0]*Math.sin(a)+pivot[1]*Math.cos(a)};
     this.paintPart(this.turret,turret,e.turretFacing,animationTime,team,altitude);
    }
   }
  }else if(building||e.footprintWidth){
   drawStructure(this.fallback,{width:e.footprintWidth||building?.width||2,height:e.footprintHeight||building?.height||2,role:building?.role??'garrison',paint:0x7d7963,team,progress:e.progress,complete:e.complete,health:e.health,enabled:e.enabled});
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
  if(e.private?.ambushReady)this.overlays.poly([-4,-37,0,-42,4,-37,0,-32]).fill({color:0xe2a232});
  if(e.rank>0){for(let i=0;i<e.rank;i++)this.overlays.poly([-4+i*7,-27,0+i*7,-30,4+i*7,-27]).stroke({width:2,color:0xe5c57a})}
 }
 dispose(){this.disposed=true;this.root.destroy({children:true})}
}
