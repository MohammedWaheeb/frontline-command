import type {Entity, PlayerSnapshot, Point} from './types';

export interface Rect {left:number;top:number;right:number;bottom:number}
export type EntityBounds=(entity:Entity)=>Rect|undefined;
export type SelectableFilter=(entity:Entity)=>boolean;
export type SelectionMode='replace'|'add'|'subtract'|'toggle';
export interface SelectionToken {readonly scope:string;readonly player:number;readonly revision:number;readonly ids:readonly number[]}
export interface GroupRecall {ids:number[];center?:Point}

const uintID=(id:number)=>Number.isSafeInteger(id)&&id>0&&id<=0xffffffff;
function ordered(ids:Iterable<number>):number[]{return [...new Set(ids)].filter(uintID).sort((a,b)=>a-b)}
function validPoint(point:Point|undefined):point is Point{return !!point&&Number.isFinite(point.x)&&Number.isFinite(point.y)}
function aliveOwned(entity:Entity, player:number){
 return uintID(player)&&entity.owner===player&&uintID(entity.id)&&(entity.private?entity.private.hp>0n:entity.health>0);
}

/** Current server-authorized entities only. Remembered structures are never targets. */
export function currentVisibleEntity(snapshot:PlayerSnapshot,id:number):Entity|undefined{
 return uintID(id)?snapshot.entities.find(entity=>entity.id===id):undefined;
}

/** Extra restrictions such as scripted support aircraft come from supplied Go/catalog data. */
export function selectableOwnEntities(snapshot:PlayerSnapshot,allowed:SelectableFilter=()=>true):Entity[]{
 return snapshot.entities.filter(entity=>aliveOwned(entity,snapshot.player)&&!entity.private?.container&&validPoint(entity.position)&&allowed(entity));
}

function normalizeRect(rect:Rect):Rect {
 if(!Object.values(rect).every(Number.isFinite))throw new RangeError('Selection bounds must be finite');
 return {left:Math.min(rect.left,rect.right),right:Math.max(rect.left,rect.right),top:Math.min(rect.top,rect.bottom),bottom:Math.max(rect.top,rect.bottom)};
}
function intersects(a:Rect,b:Rect){return a.left<=b.right&&a.right>=b.left&&a.top<=b.bottom&&a.bottom>=b.top}
function sameIDs(a:readonly number[],b:readonly number[]){return a.length===b.length&&a.every((id,index)=>id===b[index])}
export function sameSelection(a:SelectionToken,b:SelectionToken):boolean{
 return a.scope===b.scope&&a.player===b.player&&a.revision===b.revision&&sameIDs(a.ids,b.ids);
}

/** Pure local selection. Reconcile on every authorized snapshot and every session switch. */
export class BattlefieldSelection {
 private scope='';
 private player=0;
 private revision=0;
 private selected:number[]=[];
 private selectable=new Map<number,Entity>();
 private groups=new Map<number,number[]>();
 private lastRecall:{group:number;at:number}|undefined;
 constructor(readonly doubleTapMs=350){if(!Number.isFinite(doubleTapMs)||doubleTapMs<0||doubleTapMs>2000)throw new RangeError('Invalid double-tap interval')}

 get ids():number[]{return [...this.selected]}
 get token():SelectionToken{return {scope:this.scope,player:this.player,revision:this.revision,ids:this.ids}}
 group(group:number):number[]{this.checkGroup(group);return [...(this.groups.get(group)??[])]}

 reconcile(snapshot:PlayerSnapshot,scope:string,allowed:SelectableFilter=()=>true):void{
  if(!scope||scope.length>256)throw new RangeError('A bounded session scope is required');
  if(scope!==this.scope||snapshot.player!==this.player){
   this.scope=scope;this.player=snapshot.player;this.selected=[];this.groups.clear();this.lastRecall=undefined;this.revision++;
  }
  this.selectable=new Map(selectableOwnEntities(snapshot,allowed).map(entity=>[entity.id,entity]));
  // Embarked units remain in groups so disembarkation restores useful membership.
  // Removed, captured, dead, and explicitly noncontrollable units are pruned.
  const alive=new Set(snapshot.entities.filter(entity=>aliveOwned(entity,this.player)&&allowed(entity)).map(entity=>entity.id));
  for(const [group,ids] of this.groups)this.groups.set(group,ids.filter(id=>alive.has(id)));
  this.apply(this.selected,'replace');
 }

 apply(ids:Iterable<number>,mode:SelectionMode='replace'):number[]{
  const next=new Set(this.selected), valid=ordered(ids).filter(id=>this.selectable.has(id));
  if(mode==='replace')next.clear();
  for(const id of valid){
   if(mode==='subtract'||mode==='toggle'&&next.has(id))next.delete(id);else next.add(id);
  }
  const result=ordered(next).filter(id=>this.selectable.has(id));
  if(!sameIDs(this.selected,result)){this.selected=result;this.revision++;this.lastRecall=undefined}
  return this.ids;
 }

 click(id:number|undefined,shift=false):number[]{return this.apply(id===undefined?[]:[id],shift?'toggle':'replace')}
 clear():void{this.apply([])}

 box(rect:Rect,bounds:EntityBounds,shift=false):number[]{
  const area=normalizeRect(rect), ids:number[]=[];
  for(const entity of this.selectable.values()){
   const projected=bounds(entity);
   if(projected&&intersects(area,normalizeRect(projected)))ids.push(entity.id);
  }
  // Shift-box removes an entirely selected box, otherwise adds its members.
  const mode:SelectionMode=shift?(ids.length>0&&ids.every(id=>this.selected.includes(id))?'subtract':'add'):'replace';
  return this.apply(ids,mode);
 }

 sameTypeOnScreen(id:number,viewport:Rect,bounds:EntityBounds,shift=false):number[]{
  const source=this.selectable.get(id);
  if(!source)return this.ids;
  const area=normalizeRect(viewport),ids:number[]=[];
  for(const entity of this.selectable.values()){
   const projected=bounds(entity);
   if(entity.type===source.type&&projected&&intersects(area,normalizeRect(projected)))ids.push(entity.id);
  }
  return this.apply(ids,shift?'add':'replace');
 }

 subgroups():Array<{type:string;ids:number[]}>{
  const groups=new Map<string,number[]>();
  for(const id of this.selected){const entity=this.selectable.get(id);if(entity){const ids=groups.get(entity.type)??[];ids.push(id);groups.set(entity.type,ids)}}
  return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([type,ids])=>({type,ids:[...ids]}));
 }

 storeGroup(group:number,append=false):void{
  this.checkGroup(group);
  this.groups.set(group,ordered(append?[...(this.groups.get(group)??[]),...this.selected]:this.selected));
  this.lastRecall=undefined;
 }

 recallGroup(group:number,atMs:number,add=false):GroupRecall{
  this.checkGroup(group);
  if(!Number.isFinite(atMs)||atMs<0)throw new RangeError('Recall needs a monotonic timestamp');
  const double=this.doubleTapMs>0&&!!this.lastRecall&&this.lastRecall.group===group&&atMs>=this.lastRecall.at&&atMs-this.lastRecall.at<=this.doubleTapMs;
  this.apply(this.groups.get(group)??[],add?'add':'replace');
  this.lastRecall={group,at:atMs};
  return {ids:this.ids,...double?{center:this.center()}: {}};
 }

 center():Point|undefined{
  const points:Point[]=[];
  for(const id of this.selected){const point=this.selectable.get(id)?.position;if(validPoint(point))points.push(point)}
  if(points.length===0)return undefined;
  return {x:(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2,y:(Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2};
 }
 private checkGroup(group:number){if(!Number.isInteger(group)||group<1||group>9)throw new RangeError('Control groups are 1–9')}
}

export type EscapeIntent='cancel-targeting'|'cancel-drag'|'close-modal'|'open-pause'|'none';
export function escapeIntent(state:{targeting:boolean;dragging?:boolean;modal?:boolean;textEntry?:boolean}):EscapeIntent{
 if(state.textEntry)return 'none';
 if(state.targeting)return 'cancel-targeting';
 if(state.dragging)return 'cancel-drag';
 if(state.modal)return 'close-modal';
 return 'open-pause';
}
export interface ActionableAlert {id:string;tick:number;actionable:boolean;position?:Point;dismissed?:boolean}
export function latestAlertCenter(alerts:readonly ActionableAlert[]):{id:string;position:Point}|undefined{
 let latest:ActionableAlert|undefined;
 for(const alert of alerts)if(alert.actionable&&!alert.dismissed&&validPoint(alert.position)&&Number.isFinite(alert.tick)&&(!latest||alert.tick>=latest.tick))latest=alert;
 return latest?.position?{id:latest.id,position:{...latest.position}}:undefined;
}
