import type {Graphics} from 'pixi.js';
import {tokens} from '../design/tokens';
import {HALF_H,HALF_W} from './iso';

/** Public relation of an actor's owner to the viewer (never inferred from faction). */
export type ActorRelation='self'|'ally'|'enemy'|'neutral'|'unknown';
const hex=(css:string)=>Number.parseInt(css.replace('#',''),16);
/** Selection colour by relation; enemy marks are also dashed so meaning is not colour-only. */
export const RELATION_MARK:Readonly<Record<ActorRelation,number>>={
 self:hex(tokens.color.world.selection),ally:hex(tokens.color.team.relation.ally),enemy:hex(tokens.color.world.order_attack),
 neutral:hex(tokens.color.team.relation.neutral),unknown:hex(tokens.color.team.relation.neutral),
};
const INK=0x0d0c0a;
export const HEALTH_FILL={high:hex(tokens.color.health.high),mid:hex(tokens.color.health.mid),low:hex(tokens.color.health.low)} as const;
export function healthFill(health:number){return health>600?HEALTH_FILL.high:health>300?HEALTH_FILL.mid:HEALTH_FILL.low}
/** Screen-pixel health bar sizes (scaled by 1/zoom when drawn in world space). */
export function healthBarSize(building:boolean){return building?{width:64,height:6}:{width:36,height:5}}

/** Bars stay near screen size but ease down when zoomed far out, so a 64px
 * bar never dwarfs a distant building (0.75× at minimum zoom, 1.15× max). */
export function healthBarZoomScale(zoom:number){return Number.isFinite(zoom)?Math.max(.75,Math.min(1.15,.55+.45*zoom)):1}
/** Points of an ellipse arc in local px, for solid or dashed strokes. */
function arc(cx:number,cy:number,rx:number,ry:number,a0:number,a1:number,steps:number){
 const out:number[]=[];for(let i=0;i<=steps;i++){const a=a0+(a1-a0)*i/steps;out.push(cx+Math.cos(a)*rx,cy+Math.sin(a)*ry)}return out;
}
function strokeArc(g:Graphics,points:number[],width:number,color:number,alpha=1){
 g.moveTo(points[0],points[1]);for(let i=2;i<points.length;i+=2)g.lineTo(points[i],points[i+1]);g.stroke({width,color,alpha,cap:'round',join:'round'});
}

/** Unit selection ellipse: the back arc is painted under the body (`back`)
 * and the front arc over it (`front`), so the ring wraps the unit like a
 * ground decal yet is never hidden by tall bodies. Dark under-stroke for
 * contrast on sand, relation colour on top; enemy rings are dashed. A small
 * owner-colour diamond sits at the front. `px` converts screen px to local px. */
export function drawUnitRing(back:Graphics,front:Graphics,radius:number,relation:ActorRelation,team:number,px:number,hover=false){
 const rx=radius,ry=radius*.5,color=RELATION_MARK[relation],width=(hover?1.6:2.4)*px,alpha=hover?.8:1;
 const dashed=relation==='enemy',segments=dashed?14:2;
 for(let s=0;s<segments;s++){
  const span=Math.PI*2/segments,a0=s*span,a1=a0+span*(dashed?.6:1),points=arc(0,0,rx,ry,a0,a1,dashed?6:24);
  // Angles in (0, π) are the front (lower) half of the ellipse on screen.
  const target=Math.sin((a0+a1)/2)>0?front:back;
  if(!hover)strokeArc(target,points,width+2.4*px,INK,.72);
  strokeArc(target,points,width,color,alpha);
 }
 if(!hover){const s=3.4*px;front.poly([0,ry-s,s,ry,0,ry+s,-s,ry]).fill({color:team}).stroke({width:1*px,color:INK})}
}

/** Corner brackets on a building's footprint diamond (local px, anchor at the
 * footprint centre): four L-ticks instead of a giant ellipse. */
export function drawFootprintBrackets(g:Graphics,width:number,height:number,relation:ActorRelation,px:number,hover=false){
 const corner=(dx:number,dy:number)=>({x:(dx-dy)*HALF_W,y:(dx+dy)*HALF_H});
 const corners=[corner(-width/2,-height/2),corner(width/2,-height/2),corner(width/2,height/2),corner(-width/2,height/2)];
 const color=RELATION_MARK[relation],stroke=(hover?1.6:2.4)*px,alpha=hover?.8:1,t=.24;
 for(let i=0;i<4;i++){
  const c=corners[i],next=corners[(i+1)%4],prev=corners[(i+3)%4];
  const a={x:c.x+(next.x-c.x)*t,y:c.y+(next.y-c.y)*t},b={x:c.x+(prev.x-c.x)*t,y:c.y+(prev.y-c.y)*t};
  const draw=(w:number,col:number,al:number)=>{g.moveTo(a.x,a.y).lineTo(c.x,c.y).lineTo(b.x,b.y).stroke({width:w,color:col,alpha:al,cap:'round',join:'miter'})};
  if(!hover)draw(stroke+2.4*px,INK,.75);
  if(relation==='enemy'&&!hover){draw(stroke,color,alpha);const m={x:c.x+(next.x-c.x)*t*.5,y:c.y+(next.y-c.y)*t*.5};g.circle(m.x,m.y,1.2*px).fill({color:INK})}
  else draw(stroke,color,alpha);
 }
}

/** Bordered health bar centred at (x,y) local px: dark track, 25 % segment
 * ticks, health-token fill, owner pip on the left and veterancy chevrons on
 * the right. All sizes are screen px multiplied by `px`. */
export function drawHealthBar(g:Graphics,x:number,y:number,health:number,building:boolean,team:number,rank:number,px:number){
 const {width,height}=healthBarSize(building),w=width*px,h=height*px,left=x-w/2,top=y-h/2,fill=Math.max(0,Math.min(1000,health))/1000;
 g.rect(left-1*px,top-1*px,w+2*px,h+2*px).fill({color:INK,alpha:.92});
 g.rect(left,top,w,h).fill({color:0x2a2620,alpha:.95});
 if(fill>0)g.rect(left,top,w*fill,h).fill({color:healthFill(health)});
 g.rect(left,top,w*fill,Math.max(1*px,h*.34)).fill({color:0xffffff,alpha:.18});
 for(let i=1;i<4;i++)g.rect(left+w*i/4-.5*px,top,1*px,h).fill({color:INK,alpha:.7});
 // Owner pip: a small team-colour square butting the bar's left end.
 const pip=h+2*px;g.rect(left-1*px-pip-1*px,top-1*px,pip,pip).fill({color:team}).stroke({width:1*px,color:INK});
 for(let i=0;i<rank;i++){
  const cx=left+w+5*px+i*6*px,cy=y;
  g.poly([cx-3*px,cy+1*px,cx,cy-2.5*px,cx+3*px,cy+1*px,cx+3*px,cy+3*px,cx,cy-.5*px,cx-3*px,cy+3*px]).fill({color:0xe5c57a}).stroke({width:.8*px,color:INK});
 }
}
