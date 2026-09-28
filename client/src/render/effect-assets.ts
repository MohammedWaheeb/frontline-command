import {ImageSource,Rectangle,Texture} from 'pixi.js';
import {EffectAssetLibrary,type EffectLibraryOptions,type EffectSheet as RuntimeEffectSheet} from '../runtime/effect-library';
export type {EffectVariant,EffectClip,EffectDescriptor} from '../content/effect-assets.mjs';
export type {EffectFrame} from '../runtime/effect-library';
export type EffectSheet=RuntimeEffectSheet<Texture>;
export type EffectTextureSheet=EffectSheet;
/** Match-owned, verified FX pages. No Pixi global Assets cache or actor eviction. */
export class EffectLibrary extends EffectAssetLibrary<Texture> {
 constructor(options:Omit<EffectLibraryOptions<Texture>,'textures'>={}){
  super({...options,textures:{
   async load(bytes,width,height,signal){
    const bitmap=await createImageBitmap(new Blob([bytes.slice().buffer],{type:'image/png'}));
    if(signal.aborted){bitmap.close();throw new DOMException('Effect loading canceled.','AbortError')}
    if(bitmap.width!==width||bitmap.height!==height){bitmap.close();throw Error('Effect image dimensions do not match.');}
    const texture=new Texture({source:new ImageSource({resource:bitmap,resolution:1})});
    return {value:texture,width:bitmap.width,height:bitmap.height,dispose(){texture.destroy(true);bitmap.close()}};
   },
   crop(texture,frame){return new Texture({source:texture.source,frame:new Rectangle(frame.x,frame.y,frame.w,frame.h)})},
   destroyFrame(texture){texture.destroy(false)},
  }});
 }
}
