import type {Entity,Point} from '../runtime/types';
export interface ShahedStatus {committed:boolean;label:string;description:string;impact?:Point}
/** Commitment and its canonical move point are disclosed only to this owner.
 * Never derive them from ammunition, actor position, targets or flight art. */
export function shahedStatus(entity:Entity,viewer:number):ShahedStatus|undefined{
 if(entity.type!=='IR.shahed'||entity.owner!==viewer||entity.health<=0||entity.state==='destroyed')return;
 const own=entity.private;if(!own)return;
 if(!own.shahedCommitted)return {committed:false,label:'Uncommitted payload',description:'One-way ground impact. Return and Recall are available before commitment.'};
 const order=own.orders.length===1?own.orders[0]:undefined,point=order?.position;
 const impact=order?.kind==='move'&&!order.queued&&!order.target&&point&&Number.isSafeInteger(point.x)&&Number.isSafeInteger(point.y)&&point.x>=0&&point.y>=0?{x:point.x,y:point.y}:undefined;
 return {committed:true,label:'One-way impact committed',description:'The ground point is fixed. Orders are locked: no Return, Recall, rebase, rearm or repeat attack. The drone is consumed on impact.',...impact?{impact}:{}};
}
