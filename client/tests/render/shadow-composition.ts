import {Application,Container,Rectangle,type Sprite} from 'pixi.js';
import type {Entity} from '../../src/runtime';
import type {CatalogIndex} from '../../src/content/catalog';
import {ActorVisual} from '../../src/render/actors';
import {SpriteSheet,type ArtLibrary,type SpriteMeta} from '../../src/render/art';

/** Actual isolated Blender pilot plates, used without publishing unfinished art.
 * Pixel differences must land on the ground, never the opaque building facade. */
export async function checkShadowComposition(catalog:CatalogIndex,source:Entity){
 const width=384,height=300,origin={x:192,y:226};
 const states=[{name:'idle',part:'building',directions:1,frames:1,fps:0,loop:true},{name:'aim',part:'turret',directions:32,frames:1,fps:0,loop:true}];
 const meta:SpriteMeta={id:'building.US.gun_turret',frame_size_2x:[512,480],anchor_2x:[224,324],layers:['beauty','team','shadow'],atlases:{'1x':{},'2x':{}},states};
 const pages=states.flatMap(state=>meta.layers.map(layer=>({url:`/pilot/building.US.gun_turret/${layer}/${state.name}/d${state.name==='aim'?'08':'00'}_f00.png`,layer,descriptors:{[`${state.name}/d${state.name==='aim'?'08':'00'}_f00`]:{frame:{x:0,y:0,w:512,h:480},sourceSize:{w:512,h:480},anchor:{x:224/512,y:324/480}}},frames:new Map(),lastUsed:0,bytes:0,generation:0})));
 const sheet=new SpriteSheet(meta.id,meta,'2x',pages);
 const testArt={resolve:()=>({id:meta.id,standIn:false}),sheet:async()=>sheet} as unknown as ArtLibrary;
 const entity={...source,type:'turret',state:'idle',health:1000,progress:1000,complete:true,enabled:true,position:{...source.position!,x:0,y:0},facing:0,turretFacing:90000,footprintWidth:2,footprintHeight:2};
 const actor=new ActorVisual(entity,catalog,testArt,'US');await actor.ready;
 const app=new Application();await app.init({width,height,resolution:1,background:0x8b8069,antialias:false,autoStart:false});
 const panel=document.createElement('div');panel.id='shadow-evidence';panel.style.cssText='position:fixed;left:12px;top:12px;z-index:100;background:#8b8069;color:#181713;padding:8px;font:14px sans-serif';panel.append('Actual ActorVisual — independent turret shadow');panel.append(app.canvas);document.body.append(panel);
 app.stage.addChild(actor.root);
 const paint=()=>{actor.render(0,0xe5b54f,false,'selected',true);actor.root.position.set(origin.x,origin.y);app.render()};
 paint();await sheet.settle();paint();
 const internals=actor as unknown as {groundShadows:Container;parts:Array<{root:Container;shadowRoot:Container}>;turret:{root:Container;shadowRoot:Container;shadow:Sprite}};
 const pixels=()=>app.renderer.extract.pixels({target:app.stage,frame:new Rectangle(0,0,width,height),clearColor:0x8b8069}).pixels;
 const withShadow=Uint8Array.from(pixels());internals.turret.shadowRoot.visible=false;app.render();const withoutShadow=pixels();
 const mask=document.createElement('canvas');mask.width=width;mask.height=height;const context=mask.getContext('2d')!;
 const body=new Image();body.src='/pilot/building.US.gun_turret/beauty/idle/d00_f00.png';await body.decode();
 context.drawImage(body,origin.x-112,origin.y-162,256,240);const coverage=context.getImageData(0,0,width,height).data;
 let groundPixelsChanged=0,opaqueBodyChanged=0,opaqueBodyPixels=0;
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  const index=(y*width+x)*4;const opaque=[index,index-4,index+4,index-width*4,index+width*4].every(i=>coverage[i+3]===255);
  if(opaque)opaqueBodyPixels++;
  if(withShadow[index]!==withoutShadow[index]||withShadow[index+1]!==withoutShadow[index+1]||withShadow[index+2]!==withoutShadow[index+2]||withShadow[index+3]!==withoutShadow[index+3]){if(opaque)opaqueBodyChanged++;else groundPixelsChanged++}
 }
 // Building damage plates include the assembled weapon, so both independent
 // live weapon and its shadow must disappear together in that state.
 actor.update({...entity,health:400},0);paint();const damagedHidden=!internals.turret.root.visible&&!internals.turret.shadowRoot.visible;
 actor.update(entity,0);paint();const healthyVisible=internals.turret.root.visible&&internals.turret.shadowRoot.visible;
 const result={groundPixelsChanged,opaqueBodyChanged,opaqueBodyPixels,damagedHidden,healthyVisible,loadedPages:sheet.statistics.residentPages,shadowVisible:internals.turret.shadow.visible};
 return {result,dispose:async()=>{actor.dispose();await sheet.dispose();app.destroy(true,{children:true});panel.remove()}};
}
