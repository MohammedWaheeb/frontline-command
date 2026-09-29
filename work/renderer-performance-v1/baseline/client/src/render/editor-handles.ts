import {ArtLibrary,type FrameSet} from './art';
import type {Point} from '../runtime/types';
export type EditorHandleKind='spawn'|'region';
export const EDITOR_HANDLE_ASSETS:Readonly<Record<EditorHandleKind,string>>=Object.freeze({spawn:'prop.spawn_marker_editor',region:'prop.region_marker_editor'});
export interface EditorHandleStatus {ready:EditorHandleKind[];missing:EditorHandleKind[]}
export interface HandleBox {x:number;y:number;width:number;height:number}
/** Fixed CSS size around the existing top-down anchor, never a world footprint. */
export function editorHandleBox(anchor:Point,frame:{width:number;height:number;anchorX:number;anchorY:number},canvasPixelsPerCSSPixel:number,sizeCSS=32):HandleBox{
 if(!Number.isFinite(canvasPixelsPerCSSPixel)||canvasPixelsPerCSSPixel<=0||!Number.isFinite(sizeCSS)||sizeCSS<=0||!Number.isFinite(frame.width)||!Number.isFinite(frame.height)||frame.width<=0||frame.height<=0)throw Error('Invalid editor handle dimensions');
 const width=sizeCSS*canvasPixelsPerCSSPixel,height=width*frame.height/frame.width;
 return {x:anchor.x-width*frame.anchorX,y:anchor.y-height*frame.anchorY,width,height};
}
type HandleArt=Pick<ArtLibrary,'sheet'|'release'>;
/** Owns only the two editor-only sheets. Match scenery cannot request these IDs. */
export class EditorHandles {
 private readonly frames=new Map<EditorHandleKind,FrameSet>();private closed=false;private pending?:Promise<EditorHandleStatus>;
 constructor(private readonly art:HandleArt=new ArtLibrary()){}
 load():Promise<EditorHandleStatus>{
  return this.pending??=(async()=>{
   const kinds=Object.keys(EDITOR_HANDLE_ASSETS) as EditorHandleKind[];
   const result=await Promise.all(kinds.map(async kind=>{
    try{const sheet=await this.art.sheet(EDITOR_HANDLE_ASSETS[kind]);if(!sheet||this.closed)return false;
     // Direction zero is a fixed icon pose; maps have no spawn facing rule.
     sheet.frame('beauty','idle',0,0);await sheet.settle();if(this.closed)return false;
     const frame=sheet.frame('beauty','idle',0,0);if(!frame)return false;this.frames.set(kind,frame);return true;
    }catch{return false}
   }));
   return {ready:kinds.filter((_,i)=>result[i]),missing:kinds.filter((_,i)=>!result[i])};
  })();
 }
 paint(ctx:CanvasRenderingContext2D,kind:EditorHandleKind,anchor:Point,canvasPixelsPerCSSPixel:number):boolean{
  const frame=this.closed?undefined:this.frames.get(kind);if(!frame)return false;
  const source=frame.texture.source.resource as CanvasImageSource,rect=frame.texture.frame;
  const box=editorHandleBox(anchor,{width:rect.width,height:rect.height,anchorX:frame.anchorX,anchorY:frame.anchorY},canvasPixelsPerCSSPixel);
  try{ctx.drawImage(source,rect.x,rect.y,rect.width,rect.height,box.x,box.y,box.width,box.height);return true}catch{return false}
 }
 async dispose(){if(this.closed)return;this.closed=true;this.frames.clear();await this.pending;await this.art.release()}
}
