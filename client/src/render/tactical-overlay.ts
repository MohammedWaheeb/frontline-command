import {Container,Graphics,Text} from 'pixi.js';
import type {Point} from '../runtime/types';
import type {TacticalPresentation,TacticalEventCue,TacticalOrderMarker} from '../app/tactical-presentation';
import type {TerrainSurface} from './terrain-surface';
import {selectionRange,type RangeMode} from './range-geometry';
import {tacticalCircle,tacticalLabels,layoutTacticalLabels,orderSymbol,TacticalPingHistory} from './tactical-geometry';
import {tokens} from '../design/tokens';

const WARNING=0xe8a568,ORDER=0xbccb91,INK=0x11140e;
const hex=(css:string)=>Number.parseInt(css.replace('#',''),16);
/** Order colours from world tokens: move green, attack red, attack-move amber. */
export const ORDER_COLORS={move:hex(tokens.color.world.order_move),attack:hex(tokens.color.world.order_attack),attackMove:hex(tokens.color.world.order_attack_move),support:0xe0c27a} as const;
export function orderColor(kind:string):number{
 switch(kind){
  case 'attack':case 'force_fire':return ORDER_COLORS.attack;
  case 'attack_move':case 'aggressive':case 'patrol':return ORDER_COLORS.attackMove;
  case 'gather':case 'salvage':case 'capture':case 'build':case 'repair':return ORDER_COLORS.support;
  default:return ORDER_COLORS.move;
 }
}
/** Transient acknowledgement for a newly accepted order (observed in Go snapshots). */
export interface OrderPulse {kind:string;position:Point;at:number}
const PULSE_MS=700,PULSE_STATIC_MS=800;
/** Signature of a selection's newest spatial order. Entity targets use the id so a
 * moving target never re-triggers; ground orders use their exact point. */
export function orderSignature(orders:readonly TacticalOrderMarker[]):{key:string;kind:string;position:Point}|undefined{
 for(let i=orders.length-1;i>=0;i--){const o=orders[i];if(!o.position)continue;const where=o.patrol?o.patrol.points.map(p=>`${p.x},${p.y}`).join('/'):o.target?`#${o.target}`:`${o.position.x},${o.position.y}`;return {key:`${o.kind}:${where}`,kind:o.kind,position:o.patrol?.points.at(-1)??o.position}}
 return undefined;
}
/** Diff newest-order signatures between snapshots. Newly selected entities only
 * set a baseline, so selecting a unit never replays its old order. */
export function newOrderPulses(previous:ReadonlyMap<number,string>,selected:ReadonlyArray<{entity:number;orders:readonly TacticalOrderMarker[]}>,now:number,reset=false){
 const next=new Map<number,string>(),pulses:OrderPulse[]=[],seen=new Set<string>();
 for(const item of selected){
  const sig=orderSignature(item.orders);next.set(item.entity,sig?.key??'');
  if(!sig||reset||!previous.has(item.entity)||previous.get(item.entity)===sig.key)continue;
  const tile=`${sig.kind}:${Math.floor(sig.position.x/1000)}:${Math.floor(sig.position.y/1000)}`;if(seen.has(tile))continue;seen.add(tile);
  pulses.push({kind:sig.kind,position:{...sig.position},at:now});
 }
 return {signatures:next,pulses};
}
interface LabelNode {root:Container;back:Graphics;text:Text}
export interface TacticalOverlayStats {warnings:number;zones:number;labels:number;orderMarkers:number;projectileBodies:number;pings:number;rebuilds:number;coverageRings:number;assignments:number;rangeRings:number}
/** Essential tactical geometry is independent of particle budgets and flashing.
 * No simulated trajectories, extrapolation, target lookup or gameplay lives here. */
export class TacticalOverlay {
 readonly root=new Container();private readonly graphics=new Graphics();private readonly pulseGraphics=new Graphics();
 private signatures=new Map<number,string>();private pulses:OrderPulse[]=[];
 private readonly labels=new Map<string,LabelNode>();private readonly orderLabels=new Map<string,LabelNode>();
 private last?:TacticalPresentation;private surface?:TerrainSurface;private zoom=0;private rangeMode:RangeMode='off';private colorKey='';
 private pings=new TacticalPingHistory();private perspective?:number;private tick=-1;
 private stats:TacticalOverlayStats={warnings:0,zones:0,labels:0,orderMarkers:0,projectileBodies:0,pings:0,rebuilds:0,coverageRings:0,assignments:0,rangeRings:0};
 constructor(){this.root.eventMode='none';this.root.addChild(this.graphics,this.pulseGraphics)}
 /** A new perspective, backwards seek or explicit replacement clears ephemeral
  * pings. Persistent warnings do not depend on receiving an activation event. */
 sync(model:TacticalPresentation,player:number,reset=false){
  this.pings.sync(model.eventCues,model.tick,reset||this.perspective!==player||model.tick<this.tick);
  const reset2=reset||this.perspective!==player||model.tick<this.tick;
  const diff=newOrderPulses(this.signatures,model.selected,performance.now(),reset2);this.signatures=diff.signatures;
  if(reset2)this.pulses=[];else this.pulses.push(...diff.pulses);
  this.perspective=player;this.tick=model.tick;this.last=undefined;
 }
 get activePulses(){return this.pulses.length}
 /** Animated order acknowledgements; drawn every frame, independent of the cached
  * tactical geometry. Reduced motion shows a static mark; reduced flashing keeps
  * attack brackets steady. Sizes are screen px. */
 drawPulses(surface:TerrainSurface,zoom:number,now:number,reducedMotion=false,reducedFlashing=false){
  const g=this.pulseGraphics.clear(),px=1/zoom;
  this.pulses=this.pulses.filter(p=>now-p.at<(reducedMotion?PULSE_STATIC_MS:PULSE_MS));
  for(const pulse of this.pulses){
   const t=reducedMotion?.55:Math.min(1,(now-pulse.at)/PULSE_MS),ease=1-(1-t)*(1-t),p=surface.projectGround(pulse.position),color=orderColor(pulse.kind);
   const alpha=reducedMotion?1:t<.7?1:1-(t-.7)/.3;
   if(pulse.kind==='attack'||pulse.kind==='force_fire'){
    // Red corner brackets that tighten onto the target and flash twice.
    const on=reducedFlashing||reducedMotion||Math.floor((now-pulse.at)/130)%2===0;if(!on)continue;
    const r=(28-ease*12)*px,len=8*px;
    for(const [sx,sy] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
     const cx=p.x+sx*r,cy=p.y+sy*r*.62;
     for(const [w,c] of [[4.2,INK],[2.2,color]] as const)g.moveTo(cx-sx*len,cy).lineTo(cx,cy).lineTo(cx,cy-sy*len*.62).stroke({width:w*px,color:c,alpha:alpha*(c===INK?.7:1),cap:'round',join:'miter'});
    }
    continue;
   }
   // Four chevrons on a ground ellipse contracting onto the point.
   const r=(30-ease*20)*px;
   for(let i=0;i<4;i++){
    const a=i*Math.PI/2+Math.PI/4,cx=p.x+Math.cos(a)*r,cy=p.y+Math.sin(a)*r*.5,ix=-Math.cos(a),iy=-Math.sin(a)*.5,nx=-iy,ny=ix,s=6*px;
    const tip={x:cx+ix*s*.6,y:cy+iy*s*.6},l={x:cx-ix*s*.5+nx*s,y:cy-iy*s*.5+ny*s},rr={x:cx-ix*s*.5-nx*s,y:cy-iy*s*.5-ny*s};
    for(const [w,c] of [[4.4,INK],[2.4,color]] as const)g.moveTo(l.x,l.y).lineTo(tip.x,tip.y).lineTo(rr.x,rr.y).stroke({width:w*px,color:c,alpha:alpha*(c===INK?.7:1),cap:'round',join:'round'});
   }
   g.circle(p.x,p.y,2.2*px).fill({color,alpha}).stroke({width:1*px,color:INK,alpha:alpha*.7});
  }
 }
 get diagnostics(){return {...this.stats}}
 get activePings(){return this.pings.values}
 private label(pool:Map<string,LabelNode>,key:string,text:string,size:number){
  let node=pool.get(key);
  if(!node){const root=new Container(),back=new Graphics(),label=new Text({text,style:{fontFamily:'Arial, sans-serif',fontSize:size,fontWeight:'600',fill:0xf1d7a6}});label.anchor.set(.5,0);root.addChild(back,label);node={root,back,text:label};pool.set(key,node);this.root.addChild(root)}
  if(node.text.text!==text)node.text.text=text;
  return node;
 }
 private trim(pool:Map<string,LabelNode>,used:Set<string>){for(const [key,node] of pool)if(!used.has(key)){node.root.destroy({children:true});pool.delete(key)}}
 draw(model:TacticalPresentation,surface:TerrainSurface,zoom:number,team:(owner:number)=>number,rangeMode:RangeMode='off'){
  const colorKey=[...new Set([...model.warnings,...model.zones,...this.activePings].map(v=>v.owner))].map(owner=>`${owner}:${team(owner)}`).join('|');
  if(this.last===model&&this.surface===surface&&this.zoom===zoom&&this.colorKey===colorKey&&this.rangeMode===rangeMode)return;
  this.last=model;this.surface=surface;this.zoom=zoom;this.colorKey=colorKey;this.rangeMode=rangeMode;
  const g=this.graphics.clear(),project=(p:Point)=>surface.projectGround(p),px=1/zoom,usedLabels=new Set<string>(),usedOrder=new Set<string>();
  const orderMeasurements:Array<{key:string;point:Point;width:number;height:number}>=[],labelSpots=new Set<string>();
  this.stats={warnings:model.warnings.length,zones:model.zones.length,labels:0,orderMarkers:0,projectileBodies:0,pings:this.pings.values.length,rebuilds:this.stats.rebuilds+1,coverageRings:0,assignments:0,rangeRings:0};
  const line=(points:Point[],color:number,width=1.5,alpha=1,closed=false)=>{if(!points.length)return;g.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))g.lineTo(p.x,p.y);if(closed)g.closePath();g.stroke({color,width:width*px,alpha})};
  // Dashed route in screen px with a dark under-stroke so it reads on sand.
  const dashed=(points:Point[],color:number,width=1.6,alpha=.9,dash=6,gap=4)=>{
   for(const [w,c,a] of [[width+2,INK,alpha*.55],[width,color,alpha]] as const){
    let carry=0;
    for(let i=1;i<points.length;i++){
     const a0=points[i-1],b0=points[i],len=Math.hypot(b0.x-a0.x,b0.y-a0.y)/px;if(!len)continue;let d=-carry;
     while(d<len){const s0=Math.max(0,d),s1=Math.min(len,d+dash);if(s1>s0){g.moveTo(a0.x+(b0.x-a0.x)*s0/len,a0.y+(b0.y-a0.y)*s0/len).lineTo(a0.x+(b0.x-a0.x)*s1/len,a0.y+(b0.y-a0.y)*s1/len)}d+=dash+gap}
     carry=d-len;
    }
    g.stroke({color:c,width:w*px,alpha:a,cap:'round'});
   }
  };
  const ring=(center:Point,radius:number,color:number,width=1.5,alpha=1)=>line(tacticalCircle(center,radius).map(project),color,width,alpha,true);
  const cross=(p:Point,color:number,size=6)=>{line([{x:p.x-size*px,y:p.y},{x:p.x+size*px,y:p.y}],color);line([{x:p.x,y:p.y-size*px},{x:p.x,y:p.y+size*px}],color)};
  const diamond=(p:Point,color:number,size=7)=>line([{x:p.x,y:p.y-size*px},{x:p.x+size*px,y:p.y},{x:p.x,y:p.y+size*px},{x:p.x-size*px,y:p.y}],color,1.6,1,true);
  for(const zone of model.zones){
   const tint=team(zone.owner);ring(zone.position,zone.area.radius,tint,zone.phase==='preparing'?1.4:2,.85);
   const p=project(zone.position);if(zone.phase==='preparing')diamond(p,tint,7);else{g.circle(p.x,p.y,5*px).stroke({color:tint,width:2*px});cross(p,tint,9)}
  }
  const blocked=new Set(model.actors.filter(actor=>actor.state==='blocked').map(actor=>actor.entity));
  for(const item of model.selected){
   if(model.selected.length===1)for(const range of selectionRange(item,rangeMode)){
    const tint=range.kind==='minimum'?0xce9672:range.kind==='detection'?0xb8aa7b:0xaebd80;
    line(range.points.map(project),tint,range.kind==='minimum'?1.2:1,.5,true);this.stats.rangeRings++;
    const key=`range:${item.entity}:${range.kind}`,node=this.label(this.orderLabels,key,range.caption,10),p=project(item.position);
    usedOrder.add(key);node.root.scale.set(px);node.text.style.fill=tint;node.back.clear().rect(-node.text.width/2-4,-1,node.text.width+8,14).fill({color:INK,alpha:.9});
    orderMeasurements.push({key,point:{x:p.x*zoom,y:p.y*zoom+45},width:node.text.width+8,height:14});
   }
   const defense=item.ranges?.interception;
   if(defense){
    // This ring protects impact points. It never reveals terrain occupants or
    // suggests that ordinary aircraft/projectiles crossing it are intercepted.
    const color=defense.active?ORDER:0xa99f87;
    ring(item.position,defense.radius,color,defense.ready?1.5:1,defense.active?.65:.35);this.stats.coverageRings++;
    const key=`coverage:${item.entity}`,node=this.label(this.orderLabels,key,`${defense.radius/1000}t MISSILE COVERAGE${defense.active?'':' · INACTIVE'}`,10),p=project(item.position);
    usedOrder.add(key);node.root.scale.set(px);node.text.style.fill=color;node.back.clear().rect(-node.text.width/2-4,-1,node.text.width+8,14).fill({color:INK,alpha:.86});
    orderMeasurements.push({key,point:{x:p.x*zoom,y:p.y*zoom+22},width:node.text.width+8,height:14});
    for(const assignment of defense.assignments){
     const p=project(assignment.impact),key=`assignment:${item.entity}:${assignment.projectile}`,node=this.label(this.orderLabels,key,`ASSIGNED #${assignment.projectile}`,10);
     usedOrder.add(key);node.root.scale.set(px);node.text.style.fill=ORDER;node.back.clear().rect(-node.text.width/2-4,-1,node.text.width+8,14).fill({color:INK,alpha:.86});
     orderMeasurements.push({key,point:{x:p.x*zoom,y:p.y*zoom+30},width:node.text.width+8,height:14});diamond(p,ORDER,5);this.stats.assignments++;
    }
   }
   let start:Point|undefined=project(item.position);
   for(const order of item.orders){
    const p=order.position?project(order.position):undefined;
    if(p){
     const tint=orderColor(order.kind);
     if(start)dashed([start,p],tint,2,.9);
     if(order.index===0&&blocked.has(item.entity)){line([{x:p.x-7*px,y:p.y-7*px},{x:p.x+7*px,y:p.y+7*px}],WARNING,2);line([{x:p.x+7*px,y:p.y-7*px},{x:p.x-7*px,y:p.y+7*px}],WARNING,2)}
     if(order.area?.kind==='circle')ring(order.position!,order.area.radius,tint,1.2,.6);
     // Waypoint pip: small dark-ringed dot in the order colour.
     g.circle(p.x,p.y,3.4*px).fill({color:INK,alpha:.75});g.circle(p.x,p.y,2.2*px).fill({color:tint});
     // Group orders to one point share one label (e.g. three tanks attacking one target).
     const spot=`${order.kind}:${order.index}:${order.target??''}:${Math.round(order.position!.x/500)}:${Math.round(order.position!.y/500)}`;if(labelSpots.has(spot)){this.stats.orderMarkers++;start=p;continue}labelSpots.add(spot);
     const key=`order:${item.entity}:${order.index}`,node=this.label(this.orderLabels,key,`${order.index+1} ${orderSymbol(order)}`,10);usedOrder.add(key);node.root.scale.set(px);node.text.style.fill=tint;node.back.clear().roundRect(-node.text.width/2-4,-1,node.text.width+8,14,2).fill({color:INK,alpha:.88}).stroke({color:tint,width:1});orderMeasurements.push({key,point:{x:p.x*zoom,y:p.y*zoom},width:node.text.width+8,height:14});
     this.stats.orderMarkers++;start=p;
    }else start=undefined;
    if(order.patrol?.points.length){dashed([...order.patrol.points,order.patrol.points[0]].map(project),orderColor('patrol'),1.3,.6);start=undefined}
   }
   if(item.rally){
    // Rally: dashed route from the producer to an owner-colour pennant.
    const p=project(item.rally),flag=team(this.perspective??0);dashed([project(item.position),p],ORDER_COLORS.move,1.4,.8);
    g.ellipse(p.x,p.y,7*px,3.5*px).fill({color:INK,alpha:.45});
    g.moveTo(p.x,p.y).lineTo(p.x,p.y-22*px).stroke({width:3.6*px,color:INK,alpha:.8});g.moveTo(p.x,p.y).lineTo(p.x,p.y-22*px).stroke({width:1.8*px,color:0xe8dcb8});
    g.poly([p.x,p.y-22*px,p.x+14*px,p.y-18*px,p.x,p.y-13*px]).fill({color:flag}).stroke({width:1.2*px,color:INK});this.stats.orderMarkers++;
   }
  }
  const orderPositions=layoutTacticalLabels(orderMeasurements,3);
  for(const item of orderMeasurements){const at=orderPositions.get(item.key)!,node=this.orderLabels.get(item.key)!;node.root.position.set(at.x*px,at.y*px);line([{x:item.point.x*px,y:item.point.y*px},{x:at.x*px,y:(at.y+14)*px}],Number(node.text.style.fill)||ORDER,.8,.6)}
  for(const projectile of model.projectiles){
   if(!projectile.bodyPosition)continue;const p=project(projectile.bodyPosition);this.stats.projectileBodies++;
   if(projectile.bodyEffect?.includes('missile'))diamond({x:p.x,y:p.y-8*px},0xf0d9ad,2.5);else g.circle(p.x,p.y-7*px,1.7*px).fill({color:0xf0d9ad});
  }
  for(const warning of model.warnings){
   const p=project(warning.position);
   if(warning.area.kind==='circle')ring(warning.position,warning.area.radius,WARNING,2);
   if(warning.kind==='transfer'){diamond(p,WARNING,9);g.circle(p.x,p.y,3*px).fill({color:WARNING})}
   else if(warning.kind==='raid'){diamond(p,WARNING,9);for(const exit of warning.exits){const ep=project(exit);line([p,ep],WARNING,1,.65);g.rect(ep.x-5*px,ep.y-5*px,10*px,10*px).stroke({color:WARNING,width:2*px});cross(ep,WARNING,3)}}
   else{cross(p,WARNING,8);g.circle(p.x,p.y,12*px).stroke({color:WARNING,width:1.3*px})}
   // A small team accent identifies ownership without changing the universal
   // blast-warning hue (friendly splash can still hurt owned units).
   g.circle(p.x+13*px,p.y+11*px,2.5*px).fill({color:team(warning.owner)});
  }
  for(const ping of this.pings.values){const p=project(ping.position!);diamond(p,team(ping.owner),12);cross(p,team(ping.owner),5)}
  const labels=tacticalLabels(model),measurements=labels.map(label=>{const node=this.label(this.labels,label.key,label.text,12);usedLabels.add(label.key);const p=project(label.point);return {key:label.key,point:{x:p.x*zoom,y:p.y*zoom},width:node.text.width+14,height:node.text.height+5}}),placements=layoutTacticalLabels(measurements);
  for(const label of labels){const node=this.labels.get(label.key)!,at=placements.get(label.key)!,p=project(label.point),tint=label.kind==='warning'?WARNING:team(label.owner);node.root.scale.set(px);node.root.position.set(at.x*px,at.y*px);node.back.clear().roundRect(-node.text.width/2-7,-2,node.text.width+14,node.text.height+5,3).fill({color:INK,alpha:.94}).stroke({color:tint,width:.8});line([{x:p.x,y:p.y-14*px},{x:at.x*px,y:(at.y+node.text.height+3)*px}],tint,.7,.6)}
  this.trim(this.labels,usedLabels);this.trim(this.orderLabels,usedOrder);this.stats.labels=this.labels.size;
 }
 drawMinimap(ctx:CanvasRenderingContext2D,model:TacticalPresentation,project:(p:Point)=>Point,team:(owner:number)=>number){
  drawTacticalMinimap(ctx,model,project,team,this.activePings);
 }
 dispose(){this.pings.clear();this.labels.clear();this.orderLabels.clear();this.last=undefined;this.stats={warnings:0,zones:0,labels:0,orderMarkers:0,projectileBodies:0,pings:0,rebuilds:0,coverageRings:0,assignments:0,rangeRings:0};this.root.destroy({children:true})}
}

/** No world entities/target IDs are created for minimap-only pulses. The caller
 * clips to the public map polygon and retains its existing terrain/fog pixels. */
export function drawTacticalMinimap(ctx:CanvasRenderingContext2D,model:TacticalPresentation,project:(p:Point)=>Point,team:(owner:number)=>number,pings:readonly TacticalEventCue[]=[]){
 const css=(c:number)=>`#${c.toString(16).padStart(6,'0')}`;
 const path=(points:Point[],close=false)=>{ctx.beginPath();for(const [i,p] of points.entries())if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);if(close)ctx.closePath()};
 const circle=(p:Point,r:number)=>{ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2)};
 const diamond=(p:Point,size:number)=>path([{x:p.x,y:p.y-size},{x:p.x+size,y:p.y},{x:p.x,y:p.y+size},{x:p.x-size,y:p.y}],true);
 ctx.save();ctx.globalAlpha=.85;ctx.lineWidth=1;
 for(const zone of model.zones){ctx.strokeStyle=css(team(zone.owner));path(tacticalCircle(zone.position,zone.area.radius).map(project),true);ctx.stroke()}
 ctx.globalAlpha=1;ctx.lineWidth=1.4;ctx.strokeStyle=css(WARNING);
 for(const warning of model.warnings){
  const p=project(warning.position);if(warning.area.kind==='circle'){path(tacticalCircle(warning.position,warning.area.radius).map(project),true);ctx.stroke()}
  if(warning.kind==='raid'||warning.kind==='transfer')diamond(p,4);else circle(p,3);ctx.stroke();
  for(const exit of warning.exits){const q=project(exit);ctx.strokeRect(q.x-2,q.y-2,4,4)}
 }
 for(const indicator of model.minimapIndicators){const p=project(indicator.position);ctx.strokeStyle=css(team(indicator.owner));diamond(p,5);ctx.stroke();ctx.fillStyle='#f6deb0';ctx.font='bold 9px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',p.x,p.y)}
 for(const ping of pings){if(!ping.position)continue;const p=project(ping.position);ctx.strokeStyle=css(team(ping.owner));diamond(p,6);ctx.stroke();path([{x:p.x-3,y:p.y},{x:p.x+3,y:p.y}]);ctx.stroke()}
 ctx.restore();
}
