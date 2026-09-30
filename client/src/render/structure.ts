// Procedural stand-in for structures whose authored sprite does not exist yet.
// It is drawn from the entity's *retained* physical footprint so collision,
// selection and art always agree (docs/capture-and-footprints.md). It is
// reported as missing art in docs/frontend-status.md, never as finished art.
import {Graphics} from 'pixi.js';
import {HALF_H,HALF_W} from './iso';

const ROLE_HEIGHT:Record<string,number>={hq:34,power:22,supply:18,barracks:20,factory:26,radar:18,tech:28,depot:14,outpost:16,bunker:10,turret:12,aa_post:12,abm:16,strategic:30,airfield:8,drone_hub:14,workshop_air:14,safehouse:16,barrier:8,light_prop:6,heavy_prop:14,garrison:22};
const shade=(c:number,k:number)=>{const r=Math.min(255,((c>>16)&255)*k)|0,g=Math.min(255,((c>>8)&255)*k)|0,b=Math.min(255,(c&255)*k)|0;return (r<<16)|(g<<8)|b};
function corner(x:number,y:number){return {x:(x-y)*HALF_W,y:(x+y)*HALF_H}}

/** Draws at the building centre (0,0). width/height in tiles; progress 0–1000. */
export function drawStructure(g:Graphics,o:{width:number;height:number;role:string;paint:number;team:number;progress:number;complete:boolean;health:number;enabled:boolean;memory?:boolean}){
 g.clear();
 const w=o.width/2,h=o.height/2;
 const a=corner(-w,-h),b=corner(w,-h),c=corner(w,h),d=corner(-w,h);
 // Concrete apron with a darker lip.
 g.poly([a.x,a.y,b.x,b.y,c.x,c.y,d.x,d.y]).fill({color:0x5d5a52}).stroke({width:1.5,color:0x2a2722,alpha:0.9});
 const inset=0.35,ia=corner(-w+inset,-h+inset),ib=corner(w-inset,-h+inset),ic=corner(w-inset,h-inset),id=corner(-w+inset,h-inset);
 const full=ROLE_HEIGHT[o.role]??18,frac=o.complete?1:Math.max(0.08,o.progress/1000),H=full*frac;
 const paint=o.paint,top=shade(paint,1.18),left=shade(paint,0.72),right=shade(paint,0.92);
 if(!o.complete&&o.progress<=0){
  // Foundation: pegged outline only.
  g.poly([ia.x,ia.y,ib.x,ib.y,ic.x,ic.y,id.x,id.y]).stroke({width:1.5,color:0xd0ae66,alpha:0.8});
  return;
 }
 // A field barricade is a low supported wall, not a roofed facility. Keep
 // every piece within the retained physical footprint and reuse public state.
 if(o.role==='barrier'){
  const length=Math.max(0.12,w-0.22),thickness=Math.min(0.16,h*0.45);
  const wa=corner(-length,-thickness),wb=corner(length,-thickness),wc=corner(length,thickness),wd=corner(-length,thickness);
  // Two seated stabilizing feet are visible below the long front face.
  for(const x of [-length*0.62,length*0.62]){
   const fa=corner(x-0.12,-h+0.08),fb=corner(x+0.12,-h+0.08),fc=corner(x+0.12,h-0.08),fd=corner(x-0.12,h-0.08);
   g.poly([fa.x,fa.y,fb.x,fb.y,fc.x,fc.y,fd.x,fd.y]).fill({color:shade(paint,0.55)}).stroke({width:1,color:0x23211d});
  }
  g.poly([wb.x,wb.y,wc.x,wc.y,wc.x,wc.y-H,wb.x,wb.y-H]).fill({color:right});
  g.poly([wd.x,wd.y,wc.x,wc.y,wc.x,wc.y-H,wd.x,wd.y-H]).fill({color:left});
  const cap=[wa.x,wa.y-H,wb.x,wb.y-H,wc.x,wc.y-H,wd.x,wd.y-H];
  g.poly(cap).fill({color:top}).stroke({width:1,color:shade(paint,1.4)});
  // Ownership paint is supported on the wall, including unfinished sections.
  const band=Math.min(2,H*0.38);
  g.poly([wd.x,wd.y-H+band,wc.x,wc.y-H+band,wc.x,wc.y-H+band*2,wd.x,wd.y-H+band*2]).fill({color:o.team,alpha:0.95});
  // Cross bracing makes the obstacle role legible without a factory roof cue.
  g.moveTo(wd.x,wd.y).lineTo(wc.x,wc.y-H).moveTo(wc.x,wc.y).lineTo(wd.x,wd.y-H).stroke({width:1.5,color:0x23211d});
  if(!o.enabled&&o.complete)g.poly(cap).fill({color:0x000000,alpha:0.35});
  if(o.health<350&&o.complete){
   const mx=(wd.x+wc.x)/2,my=(wd.y+wc.y)/2;
   g.moveTo(mx-3,my-H).lineTo(mx+1,my-H*0.35).lineTo(mx-2,my).stroke({width:1.5,color:0x27241f});
  }
  if(o.memory)g.alpha=0.55;
  return;
 }
 // Two visible walls (+x face and +y face), then roof.
 g.poly([ib.x,ib.y,ic.x,ic.y,ic.x,ic.y-H,ib.x,ib.y-H]).fill({color:right});
 g.poly([id.x,id.y,ic.x,ic.y,ic.x,ic.y-H,id.x,id.y-H]).fill({color:left});
 g.poly([ia.x,ia.y-H,ib.x,ib.y-H,ic.x,ic.y-H,id.x,id.y-H]).fill({color:top}).stroke({width:1,color:shade(paint,1.4),alpha:0.6});
 // Team-colour band along the top of both walls.
 if(H>6){
  const band=Math.min(4,H*0.18);
  g.poly([ib.x,ib.y-H+band,ic.x,ic.y-H+band,ic.x,ic.y-H+band*2,ib.x,ib.y-H+band*2]).fill({color:o.team,alpha:0.95});
  g.poly([id.x,id.y-H+band,ic.x,ic.y-H+band,ic.x,ic.y-H+band*2,id.x,id.y-H+band*2]).fill({color:shade(o.team,0.8),alpha:0.95});
 }
 // Wall panel seams for material depth.
 for(let i=1;i<o.height*2;i++){const t=i/(o.height*2),x=id.x+(ic.x-id.x)*t,y=id.y+(ic.y-id.y)*t;g.moveTo(x,y).lineTo(x,y-H)}
 for(let i=1;i<o.width*2;i++){const t=i/(o.width*2),x=ib.x+(ic.x-ib.x)*t,y=ib.y+(ic.y-ib.y)*t;g.moveTo(x,y).lineTo(x,y-H)}
 g.stroke({width:0.6,color:0x000000,alpha:0.25});
 // Roof detail by role: stacks, dishes, pads.
 const cx=(ia.x+ic.x)/2,cy=(ia.y+ic.y)/2-H;
 if(o.complete){
  if(o.role==='power'){g.rect(cx-5,cy-16,5,16).fill({color:0x3a3731});g.rect(cx+3,cy-12,5,12).fill({color:0x3a3731})}
  else if(o.role==='radar'){g.ellipse(cx,cy-10,9,5).fill({color:0x8a8273}).stroke({width:1,color:0x2e2b25});g.moveTo(cx,cy).lineTo(cx,cy-10).stroke({width:2,color:0x2e2b25})}
  else if(o.role==='airfield'||o.role==='drone_hub'||o.role==='workshop_air'){g.ellipse(cx,cy,10,5).stroke({width:1.5,color:0xd0ae66,alpha:0.8})}
  else if(o.role==='turret'||o.role==='abm'){g.circle(cx,cy-3,6).fill({color:shade(paint,0.6)});g.moveTo(cx,cy-3).lineTo(cx+12,cy-8).stroke({width:3,color:0x23211d})}
  else if(o.role==='aa_post'){
   g.circle(cx,cy-3,6).fill({color:shade(paint,0.6)});
   g.moveTo(cx-3,cy-3).lineTo(cx+3,cy-17).moveTo(cx+3,cy-2).lineTo(cx+9,cy-16).stroke({width:3,color:0x23211d});
   g.rect(cx-12,cy-11,3,10).fill({color:0x2e2b25});g.ellipse(cx-10.5,cy-11,4,2).fill({color:0x8a8273});
  }
  else if(o.role==='outpost'){
   g.rect(cx-6,cy-8,12,8).fill({color:shade(paint,0.72)}).stroke({width:1,color:0x23211d});
   g.moveTo(cx+5,cy-8).lineTo(cx+5,cy-16).stroke({width:2,color:0x2e2b25});g.ellipse(cx+5,cy-16,4,1.5).fill({color:0x8a8273});
  }
  else if(o.role==='safehouse'){
   g.rect(cx-8,cy-5,16,10).fill({color:0x2a2722});g.moveTo(cx-13,cy+8).lineTo(cx-4,cy+8).lineTo(cx-4,cy+2).lineTo(cx+2,cy+2).stroke({width:2,color:0xd0ae66});
  }
  else if(o.role==='strategic'){g.ellipse(cx,cy,12,6).fill({color:0x23211d}).stroke({width:1.5,color:0xe2a232,alpha:0.7})}
  else if(o.role==='factory'){g.rect(cx-10,cy-8,20,8).fill({color:shade(paint,0.8)})}
 }else{
  // Scaffold ticks while under construction.
  for(const p of [ia,ib,ic,id]){g.moveTo(p.x,p.y).lineTo(p.x,p.y-full)}
  g.stroke({width:1,color:0xa8843f,alpha:0.85});
 }
 if(!o.enabled&&o.complete){g.poly([ia.x,ia.y-H,ib.x,ib.y-H,ic.x,ic.y-H,id.x,id.y-H]).fill({color:0x000000,alpha:0.35})}
 if(o.health<350&&o.complete){g.circle(cx+4,cy-4,3).fill({color:0x1a1206,alpha:0.7})}
 if(o.memory){g.alpha=0.55}
}
export const structureHeight=(role:string)=>ROLE_HEIGHT[role]??18;
