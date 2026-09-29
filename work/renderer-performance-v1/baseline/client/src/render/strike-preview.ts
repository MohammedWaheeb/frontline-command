import {Container,Graphics,Text} from 'pixi.js';
import type {Point,SkybreakerPlan} from '../runtime/types';
import type {TerrainSurface} from './terrain-surface';
import {tacticalCircle,layoutTacticalLabels} from './tactical-geometry';
const BRASS=0xe1c784,INK=0x14170f;
/** Owner-only advisory routes. Lines are the Go-provided approach, not hidden
 * aircraft positions, AA coverage, or guaranteed movement/impact outcomes. */
export class StrikePreviewOverlay {
 readonly root=new Container();private readonly graphics=new Graphics();private texts:Text[]=[];
 private plan?:SkybreakerPlan;private drawn?:SkybreakerPlan;private surface?:TerrainSurface;private zoom=0;
 constructor(){this.root.eventMode='none';this.root.addChild(this.graphics)}
 set(plan:SkybreakerPlan|undefined){this.plan=plan?structuredClone(plan):undefined;this.drawn=undefined;if(!plan){this.graphics.clear();this.clearLabels()}}
 get routes(){return this.plan?.routes.length??0}
 private clearLabels(){for(const label of this.texts)label.destroy();this.texts=[]}
 draw(surface:TerrainSurface,zoom:number){
  if(this.drawn===this.plan&&this.surface===surface&&this.zoom===zoom)return;
  this.drawn=this.plan;this.surface=surface;this.zoom=zoom;this.graphics.clear();this.clearLabels();if(!this.plan)return;
  const labels:Array<{node:Text;point:Point}>=[];
  const g=this.graphics,px=1/zoom,project=(point:Point)=>surface.projectGround(point);
  const line=(points:Point[],alpha=1)=>{if(!points.length)return;g.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))g.lineTo(p.x,p.y);g.stroke({color:BRASS,width:1.8*px,alpha})};
  const label=(p:Point,text:string)=>{const node=new Text({text,style:{fontFamily:'Arial, sans-serif',fontSize:11,fontWeight:'600',fill:BRASS,stroke:{color:INK,width:3}}});node.anchor.set(.5,0);node.scale.set(px);node.position.set(p.x,p.y-9*px);this.texts.push(node);labels.push({node,point:p});this.root.addChild(node)};
  for(const [index,route] of this.plan.routes.entries()){
   const entry=project(route.entry),drop=project(route.drop),impact=project(route.impact);line([entry,drop],.9);
   const length=Math.hypot(drop.x-entry.x,drop.y-entry.y);if(length>0){const x=(drop.x-entry.x)/length,y=(drop.y-entry.y)/length,tip={x:entry.x+(drop.x-entry.x)*.65,y:entry.y+(drop.y-entry.y)*.65};line([{x:tip.x-11*x*px-5*y*px,y:tip.y-11*y*px+5*x*px},tip,{x:tip.x-11*x*px+5*y*px,y:tip.y-11*y*px-5*x*px}])}
   g.rect(entry.x-4*px,entry.y-4*px,8*px,8*px).fill({color:INK,alpha:.8}).stroke({color:BRASS,width:1.8*px});label(entry,`Entry ${index+1}`);
   line([{x:drop.x,y:drop.y-6*px},{x:drop.x+6*px,y:drop.y+5*px},{x:drop.x-6*px,y:drop.y+5*px},{x:drop.x,y:drop.y-6*px}]);label(drop,`Release ${index+1}`);
   // The faint assignment tether is not a simulated bomb trajectory.
   line([drop,impact],.3);const ring=tacticalCircle(route.impact,route.splash).map(project);line([...ring,ring[0]],.65);
   line([{x:impact.x-7*px,y:impact.y},{x:impact.x+7*px,y:impact.y}]);line([{x:impact.x,y:impact.y-7*px},{x:impact.x,y:impact.y+7*px}]);label({x:impact.x,y:impact.y+28*px},`Target ${index+1}`);
  }
  const positions=layoutTacticalLabels(labels.map(({node,point},i)=>({key:String(i),point:{x:point.x*zoom,y:point.y*zoom},width:node.width*zoom+6,height:node.height*zoom+4})),10);
  for(const [i,{node,point}] of labels.entries()){const at=positions.get(String(i))!;node.position.set(at.x*px,at.y*px);line([point,{x:at.x*px,y:at.y*px+node.height}],.4)}
 }
 drawMinimap(ctx:CanvasRenderingContext2D,project:(point:Point)=>Point){
  if(!this.plan)return;ctx.save();ctx.strokeStyle='#e1c784';ctx.fillStyle='#e1c784';ctx.lineWidth=1;
  for(const route of this.plan.routes){const entry=project(route.entry),drop=project(route.drop),impact=project(route.impact);ctx.beginPath();ctx.moveTo(entry.x,entry.y);ctx.lineTo(drop.x,drop.y);ctx.stroke();ctx.strokeRect(entry.x-2,entry.y-2,4,4);ctx.beginPath();ctx.arc(impact.x,impact.y,3,0,Math.PI*2);ctx.stroke()}
  ctx.restore();
 }
 dispose(){this.plan=undefined;this.drawn=undefined;this.clearLabels();this.root.destroy({children:true})}
}
