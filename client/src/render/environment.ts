import {Container,Graphics,Sprite} from 'pixi.js';
import type {GameMap,PlayerSnapshot,Rect} from '../runtime';
import type {ArtLibrary,SpriteSheet,SpriteMeta} from './art';
import type {MapEnvironment} from '../content/environment';
import {TerrainSurface} from './terrain-surface';
import {EnvironmentKnowledge,type EnvironmentItem} from './environment-state';

class EnvironmentVisual {
 readonly root=new Container();readonly ready:Promise<void>;private shadow=new Sprite();private beauty=new Sprite();private flag=new Graphics();private unknown=new Graphics();private sheet?:SpriteSheet;private disposed=false;
 constructor(public item:EnvironmentItem,art:ArtLibrary){
  this.root.addChild(this.shadow,this.beauty,this.flag,this.unknown);this.shadow.alpha=.46;
  this.ready=art.sheet(item.asset).then(sheet=>{if(!this.disposed)this.sheet=sheet});
 }
 get missing(){return !this.sheet}
 render(surface:TerrainSurface,team:(owner:number)=>number,view?:Rect){
  const item=this.item,p=surface.projectGround(item.position),meta=this.sheet?.meta as (SpriteMeta&{footprint_mt?:[number,number]})|undefined,foot=meta?.footprint_tiles?.map(n=>n*1000)??meta?.footprint_mt;this.root.position.set(p.x,p.y);this.root.zIndex=item.position.x+item.position.y+(foot?(foot[0]+foot[1])/2:0)+(item.kind==='field'?.02:item.kind==='station'?.03:0);const canvas=meta?.frame_size_2x??[600,600],anchor=meta?.anchor_2x??[300,500];this.root.visible=item.visible&&(!view||p.x-anchor[0]/2+canvas[0]/2>=view.left&&p.x-anchor[0]/2<=view.right&&p.y-anchor[1]/2+canvas[1]/2>=view.top&&p.y-anchor[1]/2<=view.bottom);if(!this.root.visible)return;
  this.root.alpha=item.remembered?.35:1;const state=this.sheet?.states.get(item.state)??this.sheet?.states.get('idle');
  for(const [layer,sprite] of [['shadow',this.shadow],['beauty',this.beauty]] as const){
   const frame=item.state!=='unknown'&&state?this.sheet?.frame(layer,state.name,item.direction??0,0):undefined;
   if(frame){sprite.visible=true;sprite.texture=frame.texture;sprite.anchor.set(frame.anchorX,frame.anchorY);sprite.scale.set(this.sheet!.pixelScale)}else sprite.visible=false;
  }
  this.unknown.clear();if(item.state==='unknown'||this.missing&&item.kind==='field')this.unknown.poly([-12,0,0,-6,12,0,0,6]).stroke({width:1,color:0xc3b27a,alpha:.8});
  this.flag.clear();if(item.kind==='station'&&item.owner!==undefined){
   const hardpoint=this.sheet?.meta.hardpoints_2x_rel_anchor?.owner_flag?.['idle/d00_f00'],x=(hardpoint?.[0]??0)/2,y=(hardpoint?.[1]??-50)/2;
   // Ownership is separate from the neutral sprite and only comes from a
   // disclosed Station record. Unknown and remembered ownership never updates.
   this.flag.moveTo(x,y+10).lineTo(x,y-8).stroke({width:1.5,color:0xdbd0a5});this.flag.poly([x,y-8,x+12,y-4,x,y]).fill({color:item.owner?team(item.owner):0xb7b1a0}).stroke({width:1,color:0x24231b});
  }
 }
 dispose(){this.disposed=true;this.root.destroy({children:true})}
}
/** Resource/station/debris scene. These are visual nodes, never simulated actors. */
export class EnvironmentRenderer {
 private knowledge:EnvironmentKnowledge;private nodes=new Map<string,EnvironmentVisual>();
 constructor(map:GameMap,private readonly art:ArtLibrary,private readonly scene:Container,private surface:TerrainSurface,environment?:MapEnvironment){this.knowledge=new EnvironmentKnowledge(map,environment)}
 get missingArt(){return [...this.nodes.values()].filter(node=>node.missing).map(node=>node.item.asset)}
 get count(){return this.nodes.size}
 setSurface(surface:TerrainSurface){this.surface=surface}
 sync(snapshot:PlayerSnapshot){
  const items=this.knowledge.sync(snapshot),live=new Set(items.map(item=>item.key));
  for(const [key,node] of this.nodes)if(!live.has(key)){node.dispose();this.nodes.delete(key)}
  for(const item of items){let node=this.nodes.get(item.key);if(!node){node=new EnvironmentVisual(item,this.art);this.nodes.set(item.key,node);this.scene.addChild(node.root)}else node.item=item}
 }
 async ready(){await Promise.all([...this.nodes.values()].map(node=>node.ready))}
 render(team:(owner:number)=>number,view?:Rect){for(const node of this.nodes.values())node.render(this.surface,team,view)}
 dispose(){for(const node of this.nodes.values())node.dispose();this.nodes.clear();this.knowledge.clear()}
}
