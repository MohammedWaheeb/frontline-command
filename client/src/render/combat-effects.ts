import {Container,Graphics,Sprite,Text} from 'pixi.js';
import type {CatalogIndex} from '../content/catalog';
import type {Settings} from '../app/settings';
import type {GameMap,PlayerSnapshot,Point} from '../runtime';
import {CombatTimeline} from '../app/combat-presentation';
import type {TacticalProjectile} from '../app/tactical-presentation';
import {EffectLibrary,type EffectDescriptor,type EffectTextureSheet,type EffectVariant} from './effect-assets';
import type {TerrainSurface} from './terrain-surface';
import {combatEffectVariant,visibleTrace} from './combat-geometry';

const BRASS=0xe7bd72,PALE=0xf4ddb0,OLIVE=0xc5d59b,INK=0x171910;
const DECORATIVE_NODES=192;
interface Decoration {sprite:Sprite;sheet:EffectTextureSheet;variant:EffectVariant;frame:number}
interface Label {text:Text;back:Graphics}

/** Authoritative event cosmetics below tactical warnings. Asset decoration has a
 * separate bounded pool; confirmed outcome symbols are never budget-culled. */
export class CombatEffects {
 readonly root=new Container();private decoration=new Container();private marks=new Graphics();private labels=new Map<string,Label>();
 private history=new CombatTimeline();private library:EffectLibrary;private sheets=new Map<string,EffectTextureSheet|undefined>();private requested=new Set<string>();
 private sprites=new Map<string,Decoration>();private elevations=new Map<string,number>();private closed=false;private baseline=true;private snapshot?:PlayerSnapshot;
 private missing=new Set<string>();private drawKey='';private revision=0;
 private stats={cues:0,drawnCues:0,confirmedHits:0,cover:0,intercepted:0,decoys:0,trails:0,decorations:0,labels:0};
 constructor(private catalog:CatalogIndex,private map:Pick<GameMap,'width'|'height'>,onError?:(error:Error)=>void){
  this.root.eventMode='none';this.root.addChild(this.decoration,this.marks);this.library=new EffectLibrary({onError});
 }
 async init(descriptor?:EffectDescriptor){await this.library.init(descriptor)}
 get diagnostics(){return {...this.stats,...this.library.statistics,missing:[...this.missing].sort()}}
 get cues(){return this.history.values}
 reset(){this.baseline=true;this.history.reset();this.elevations.clear();this.clearSprites();this.marks.clear();this.clearLabels();this.drawKey='';this.stats={cues:0,drawnCues:0,confirmedHits:0,cover:0,intercepted:0,decoys:0,trails:0,decorations:0,labels:0}}
 sync(snapshot:PlayerSnapshot,bodies:readonly TacticalProjectile[],replace=false){
  this.history.sync(snapshot,this.catalog,bodies,replace||this.baseline);this.baseline=false;this.snapshot=snapshot;this.revision++;
  const keys=new Set(this.history.values.map(c=>c.key));for(const key of this.elevations.keys())if(!keys.has(key))this.elevations.delete(key);
 }
 private request(id:string){
  if(this.requested.has(id)||this.closed)return;this.requested.add(id);
  if(!this.library.has(id)){this.missing.add(id);return}
  void this.library.load(id).then(sheet=>{if(this.closed)return;this.sheets.set(id,sheet);if(!sheet)this.missing.add(id);this.revision++});
 }
 private clearSprites(){for(const {sprite} of this.sprites.values())sprite.destroy();this.sprites.clear()}
 private clearLabels(){for(const {text,back} of this.labels.values()){text.destroy();back.destroy()}this.labels.clear()}
 private label(key:string,text:string,p:Point,px:number,used:Set<string>){
  let label=this.labels.get(key);if(!label){const back=new Graphics(),value=new Text({text,style:{fontFamily:'Arial, sans-serif',fontSize:9,fontWeight:'700',fill:PALE}});value.anchor.set(.5,0);label={text:value,back};this.labels.set(key,label);this.root.addChild(back,value)}
  used.add(key);label.text.position.set(p.x,p.y+10*px);label.text.scale.set(px);
  label.back.clear().rect(p.x-(label.text.width+6*px)/2,p.y+9*px,label.text.width+6*px,13*px).fill({color:INK,alpha:.92});
 }
 draw(surface:TerrainSurface,zoom:number,settings:Settings,viewport:{left:number;right:number;top:number;bottom:number},altitude:(id:number)=>number|undefined){
  const snapshot=this.snapshot;if(!snapshot||this.closed)return;
  const variant=combatEffectVariant(settings),key=`${this.revision}:${snapshot.tick}:${zoom}:${variant}:${viewport.left}:${viewport.top}:${viewport.right}:${viewport.bottom}`;
  // Pending pages may resolve without a new snapshot. Frame() triggers loading;
  // a ready-page count participates in the key, and settle() invalidates it.
  const cacheKey=key+':'+this.library.statistics.residentPages;if(cacheKey===this.drawKey)return;this.drawKey=cacheKey;
  const g=this.marks.clear(),px=1/zoom,usedSprites=new Set<string>(),usedLabels=new Set<string>();let decorative=0;
  this.stats={cues:this.history.values.length,drawnCues:0,confirmedHits:0,cover:0,intercepted:0,decoys:0,trails:0,decorations:0,labels:0};
  const line=(points:Point[],color=BRASS,width=1.4,alpha=1,close=false)=>{if(!points.length)return;g.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))g.lineTo(p.x,p.y);if(close)g.closePath();g.stroke({color,width:width*px,alpha})};
  const inView=(p:Point)=>p.x>=viewport.left-96&&p.x<=viewport.right+96&&p.y>=viewport.top-96&&p.y<=viewport.bottom+96;
  const sprite=(id:string,nodeKey:string,p:Point,elapsed:number)=>{
   if(decorative>=DECORATIVE_NODES)return false;this.request(id);const sheet=this.sheets.get(id),clip=sheet?.clip(variant);if(!sheet||!clip)return false;
   const raw=Math.floor(elapsed*clip.fps/20),index=clip.loop?raw%clip.frames.length:Math.min(raw,clip.frames.length-1),frame=sheet.frame(variant,index);if(!frame)return false;
   let node=this.sprites.get(nodeKey);if(!node){node={sprite:new Sprite(frame.texture),sheet,variant,frame:index};this.sprites.set(nodeKey,node);this.decoration.addChild(node.sprite)}
   node.sprite.texture=frame.texture;node.sprite.anchor.set(frame.anchorX,frame.anchorY);node.sprite.scale.set(frame.pixelScale);node.sprite.position.set(p.x,p.y);node.variant=variant;node.sheet=sheet;node.frame=index;usedSprites.add(nodeKey);decorative++;return true;
  };
  for(const trace of this.history.projectiles){
   const samples=trace.samples;if(!samples.length)continue;
   if(!settings.reducedMotion)for(let i=1;i<samples.length;i++){
    if(!visibleTrace(samples[i-1].position,samples[i].position,this.map,snapshot.visible))continue;
    const a=surface.projectGround(samples[i-1].position),b=surface.projectGround(samples[i].position);if(!inView(a)&&!inView(b))continue;
    // Ground projection is explicitly cosmetic: no projectile height/arc is on
    // the wire, and no target endpoint or future position is invented.
    line([{x:a.x,y:a.y-7*px},{x:b.x,y:b.y-7*px}],PALE,1,.32);this.stats.trails++;
   }
   const last=samples.at(-1)!,p=surface.projectGround(last.position);if(inView(p)&&trace.effect)sprite(trace.effect,`projectile:${trace.id}`,{x:p.x,y:p.y-7*px},snapshot.tick-samples[0].tick);
  }
  for(const cue of this.history.values){
   const ground=surface.projectGround(cue.position);
   if(!this.elevations.has(cue.key))this.elevations.set(cue.key,cue.anchor===undefined?0:altitude(cue.anchor)??0);
   const p={x:ground.x,y:ground.y-this.elevations.get(cue.key)!};if(!inView(p))continue;this.stats.drawnCues++;
   const elapsed=snapshot.tick-cue.tick;let decorated=false;
   for(const [i,effect] of cue.effects.entries())decorated=sprite(effect,`${cue.key}:${i}`,p,elapsed)||decorated;
   if(cue.kind==='hit'){
    this.stats.confirmedHits++;const s=cue.armor==='structure'?7:cue.armor==='heavy'?6:5;
    line([{x:p.x-s*px,y:p.y-4*px},{x:p.x-2*px,y:p.y},{x:p.x-s*px,y:p.y+4*px}],PALE,1.6);
    line([{x:p.x+s*px,y:p.y-4*px},{x:p.x+2*px,y:p.y},{x:p.x+s*px,y:p.y+4*px}],PALE,1.6);
    if(cue.armor==='heavy'||cue.armor==='structure')g.rect(p.x-8*px,p.y-7*px,16*px,14*px).stroke({color:BRASS,width:px,alpha:.75});
    if(cue.armor==='air')line([{x:p.x-6*px,y:p.y-7*px},{x:p.x,y:p.y-11*px},{x:p.x+6*px,y:p.y-7*px}],OLIVE);
   }else if(cue.kind==='intercepted'){
    this.stats.intercepted++;g.circle(p.x,p.y,8*px).stroke({color:BRASS,width:1.8*px});line([{x:p.x-4*px,y:p.y-4*px},{x:p.x+4*px,y:p.y+4*px}],PALE,2);line([{x:p.x+4*px,y:p.y-4*px},{x:p.x-4*px,y:p.y+4*px}],PALE,2);
    this.label(`intercepted:${Math.round(p.x*zoom/24)}:${Math.round(p.y*zoom/24)}`,'INTERCEPTED',p,px,usedLabels);
   }else if(cue.kind==='decoy'){
    this.stats.decoys++;line([{x:p.x-9*px,y:p.y},{x:p.x-4*px,y:p.y-6*px},{x:p.x+1*px,y:p.y},{x:p.x-4*px,y:p.y+6*px}],OLIVE,1.8,1,true);line([{x:p.x+1*px,y:p.y},{x:p.x+6*px,y:p.y-6*px},{x:p.x+11*px,y:p.y},{x:p.x+6*px,y:p.y+6*px}],BRASS,1.8,1,true);
    this.label(`decoy:${Math.round(p.x*zoom/24)}:${Math.round(p.y*zoom/24)}`,'DECOY',p,px,usedLabels);
   }else if(!decorated){
    const s=cue.kind==='destroyed'?11:cue.kind==='interceptor-launch'?8:cue.kind==='muzzle'?3:6;
    g.circle(p.x,p.y,s*px).stroke({color:cue.kind==='muzzle'?PALE:BRASS,width:1.5*px,alpha:.9});
    if(cue.kind==='impact'||cue.kind==='destroyed')line([{x:p.x-s*px,y:p.y+2*px},{x:p.x,y:p.y-s*.7*px},{x:p.x+s*px,y:p.y+2*px}],BRASS,1.3);
   }
   if(cue.cover){this.stats.cover++;line([{x:p.x-5*px,y:p.y-9*px},{x:p.x+5*px,y:p.y-9*px},{x:p.x+4*px,y:p.y-14*px},{x:p.x,y:p.y-17*px},{x:p.x-4*px,y:p.y-14*px}],OLIVE,1.8,1,true)}
  }
  for(const [key,node] of this.sprites)if(!usedSprites.has(key)){node.sprite.destroy();this.sprites.delete(key)}
  for(const [key,node] of this.labels)if(!usedLabels.has(key)){node.text.destroy();node.back.destroy();this.labels.delete(key)}
  this.stats.decorations=this.sprites.size;this.stats.labels=this.labels.size;
 }
 async settle(){await this.library.settle();this.drawKey=''}
 async trim(){for(const node of this.sprites.values())node.sheet.frame(node.variant,node.frame);await this.library.trim()}
 async dispose(){if(this.closed)return;this.closed=true;this.reset();this.snapshot=undefined;this.root.destroy({children:true});await this.library.dispose();this.sheets.clear();this.requested.clear();this.missing.clear()}
}
