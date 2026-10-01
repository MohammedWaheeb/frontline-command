import type {CommandRequest} from '../runtime/command-intent';
import type {OrderPreview,Point,SkybreakerPlan} from '../runtime/types';
export interface StrikeReviewState {phase:'loading'|'ready'|'unavailable';edge:number;targets:Point[];observedTick?:number;plan?:SkybreakerPlan;message?:string}
/** A single-use review of immutable intent, guarded across asynchronous advice,
 * session/selection changes and cancellation. It never issues a command. */
export class SkybreakerReview {
 private next=0;private entry?:{id:number;request:CommandRequest;isCurrent:()=>boolean;state:StrikeReviewState};
 get state():StrikeReviewState|undefined{if(this.entry&&!this.entry.isCurrent())this.clear();return this.entry?.state}
 begin(request:CommandRequest,isCurrent:()=>boolean):number{
  const id=++this.next,copy=structuredClone(request);
  this.entry={id,request:copy,isCurrent,state:{phase:'loading',edge:copy.index??0,targets:copy.points?.map(p=>({...p}))??[]}};return id;
 }
 complete(id:number,preview:OrderPreview):StrikeReviewState|undefined{
  if(!this.state||this.entry?.id!==id)return undefined;
  const plan=preview.plans?.find(plan=>plan.order_index===0),result=preview.results[0];
  this.entry.state=!result?.accepted?{...this.entry.state,phase:'unavailable',message:result?.code??'Operation preview unavailable.'}:!plan?{...this.entry.state,phase:'unavailable',message:'This runtime cannot show the approach route. Update the host and client before confirming Skybreaker.'}:{...this.entry.state,phase:'ready',observedTick:preview.tick,plan:structuredClone(plan)};
  return this.state;
 }
 fail(id:number,message:string){if(this.state&&this.entry?.id===id)this.entry.state={...this.entry.state,phase:'unavailable',message};return this.state}
 consume():CommandRequest|undefined{if(this.state?.phase!=='ready')return undefined;const request=structuredClone(this.entry!.request);this.clear();return request}
 clear(){this.entry=undefined}
}
