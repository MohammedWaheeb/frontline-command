import assert from 'node:assert/strict';
// Observe each missing human once; an eliminated human remains an explicit
// failed requirement, but cannot prevent later survivors being exercised.
export async function reconnectCycle({frames,record,reconnect,now=()=>new Date().toISOString()}){
 const attempts=record.reconnectAttempts??=[];
 for(let index=0;index<frames.length;index++){
  const player=index+1;if(attempts.some(x=>x.player===player))continue;
  const view=frames[index].snapshot;if(!view)continue;
  const attempt={player,started:now(),observedTick:view.tick,status:'started'};attempts.push(attempt);
  if(view.players.find(p=>p.id===player)?.defeated||view.outcome?.finished){attempt.status='failed-inactive-before-reconnect';attempt.completed=now();continue}
  try{attempt.status=await reconnect(index)?'passed':'failed-inactive-during-reconnect';attempt.completed=now();return attempt}
  catch(error){attempt.status='failed-reconnect-error';attempt.completed=now();attempt.error=String(error);throw error}
 }
}
// Expiry is driven by a timer independently of the combat loop's pending await.
// Cleanup rejection is captured, not turned into a successful cancellation.
export function courseWatchdog(milliseconds,onExpire,{set=setTimeout,clear=clearTimeout}={}){
 assert(Number.isFinite(milliseconds)&&milliseconds>0);assert.equal(typeof onExpire,'function');
 let expired=false,stopped=false,error,resolve;const settled=new Promise(r=>resolve=r);
 const timer=set(()=>{if(stopped)return;stopped=true;expired=true;void Promise.resolve().then(onExpire).then(resolve,e=>{error=e;resolve()})},milliseconds);
 return {get expired(){return expired},get error(){return error},settled,cancel(){if(!stopped){stopped=true;clear(timer);resolve()}}};
}
export function onceAsync(action){let pending;return ()=>pending??=Promise.resolve().then(action)}
