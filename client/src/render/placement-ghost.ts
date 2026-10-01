import {Container,Graphics,Sprite,Texture} from 'pixi.js';
import type {ArtLibrary,SpriteSheet,SpriteState} from './art';
import type {CatalogBuilding} from '../content/catalog';
import type {Point} from '../runtime/types';
import {authoredArtId} from './art-id';
import {TerrainSurface,projectSurfaceVertex} from './terrain-surface';
import {drawStructure} from './structure';
import {toScreen} from './iso';

/** A static proposal, deliberately outside actors, picking and Go state. No
 * idle animation, shadow, occupancy, health, selection or event is created. */
export class PlacementGhost {
 readonly root=new Container();private readonly fallback=new Graphics();
 private readonly sprites=[new Sprite(),new Sprite(),new Sprite(),new Sprite()];
 private sheet?:SpriteSheet;private key='';private generation=0;private closed=false;
 private pending:Promise<void>=Promise.resolve();
 constructor(private readonly art:ArtLibrary){this.root.eventMode='none';this.root.visible=false;this.root.addChild(this.fallback,...this.sprites)}
 private hideSprites(){for(const sprite of this.sprites){sprite.visible=false;sprite.texture=Texture.EMPTY}}
 clear(){if(this.key){this.generation++;this.key='';this.sheet=undefined}this.hideSprites();this.fallback.clear();this.root.visible=false}
 draw(building:CatalogBuilding,faction:string|undefined,position:Point,valid:boolean|undefined,surface:TerrainSurface){
  if(this.closed)return;const key=`${building.id}|${faction??''}`;
  if(this.key!==key){
   this.key=key;this.sheet=undefined;this.hideSprites();const generation=++this.generation,id=authoredArtId(building.id,faction);
   this.pending=(id?this.art.sheet(id):Promise.resolve(undefined)).then(sheet=>{if(!this.closed&&this.generation===generation)this.sheet=sheet});
  }
  const tint=valid===false?0xda967b:valid?0xc4d69d:0xdac48d;
  const support=surface.footprintSurface(position,building.width,building.height),point=projectSurfaceVertex({...position,height:support.height});
  this.root.position.set(point.x,point.y);this.root.alpha=.36;this.root.visible=true;this.hideSprites();
  const sheet=this.sheet;let hasBeauty=false;
  if(sheet){
   const states: Array<SpriteState|undefined>=[sheet.states.get('idle'),sheet.states.get('aim')];
   for(const [part,state] of states.entries())if(state){
    const pivot=part?sheet.meta.turret_pivot_mt??[0,0]:[0,0],offset=toScreen(pivot[0],pivot[1]);
    for(const [layer,name] of ['beauty','team'].entries()){
     const frame=sheet.frame(name,state.name,0,0),sprite=this.sprites[part*2+layer];if(!frame)continue;
     sprite.texture=frame.texture;sprite.anchor.set(frame.anchorX,frame.anchorY);sprite.scale.set(sheet.pixelScale);sprite.position.set(offset.x,offset.y);sprite.tint=tint;sprite.visible=true;if(part===0&&name==='beauty')hasBeauty=true;
    }
   }
  }
  this.fallback.clear();
  // Pages decode independently. Never float team paint over a procedural
  // stand-in, or expose a turret mask before its matching beauty page.
  if(!hasBeauty){this.hideSprites();drawStructure(this.fallback,{width:building.width,height:building.height,role:building.role,paint:0x7d7963,team:tint,progress:1000,complete:true,health:1000,enabled:true})}
  else if(!this.sprites[2].visible)this.sprites[3].visible=false;
 }
 async settle(){await this.pending}
 dispose(){this.closed=true;this.generation++;this.sheet=undefined;this.root.destroy({children:true})}
}
