import {RuntimeError} from './errors';
import type {OrderIntent,SkybreakerPlan,Point} from './types';
const integer=(value:unknown,max=0xffffffff):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=max;
const point=(value:any):Point|undefined=>value&&integer(value.x,0x7fffffff)&&integer(value.y,0x7fffffff)?{x:value.x,y:value.y}:undefined;
function invalid():never{throw new RuntimeError('invalid_advice','The host returned invalid operation preview information.')}
/** Decode only owner-authorized advisory geometry. No travel-time, clustering,
 * readiness, visibility or gameplay computation belongs in this parser. */
export function parseOperationPlans(value:unknown,orders:readonly OrderIntent[],tick:number,independent=false):SkybreakerPlan[]|undefined{
 if(value===undefined)return undefined;
 if(!integer(tick)||!Array.isArray(value)||value.length>orders.length||independent&&value.length>0)invalid();
 const seen=new Set<number>();
 return value.map((plan:any)=>{
  if(!plan||!integer(plan.order_index)||plan.order_index>=orders.length||seen.has(plan.order_index)||plan.kind!=='skybreaker'||!integer(plan.edge,3)||!Array.isArray(plan.routes)||plan.routes.length!==3)invalid();
  const order=orders[plan.order_index];
  if(order.kind!=='ability'||order.type!=='strategic'||(order.index??0)!==plan.edge||order.points?.length!==3)invalid();
  seen.add(plan.order_index);
  const routes=plan.routes.map((route:any,index:number)=>{
   const entry=point(route?.entry),drop=point(route?.drop),impact=point(route?.impact),target=order.points![index];
   if(!entry||!drop||!impact||impact.x!==target.x||impact.y!==target.y||!integer(route.entry_at)||!integer(route.release_at)||!integer(route.impact_at)||route.entry_at<=tick||route.release_at<route.entry_at||route.impact_at<route.release_at||!integer(route.splash,0x7fffffff))invalid();
   return {entry,drop,impact,entry_at:route.entry_at,release_at:route.release_at,impact_at:route.impact_at,splash:route.splash};
  });
  return {order_index:plan.order_index,kind:'skybreaker',edge:plan.edge,routes};
 });
}
