// Shared native/browser acceptance policy. The untouched authored mission owns
// initial assets; every subsequent change is an ordinary Go command or tick.
export async function aircraftServiceCourse(driver,{map,mission,onStage=async()=>{}}){
 const check=(condition,message)=>{if(!condition)throw Error(message)};
 const view=()=>driver.current,own=type=>view().entities.filter(e=>e.owner===1&&e.type===type&&e.health>0),at=id=>view().entities.find(e=>e.id===id&&e.owner===1&&e.health>0);
 const origin=index=>view().entities.find(e=>e.owner===1&&e.private?.missionOrigin===`initial:${index}`);
 const config={map,mission,difficulty:'normal',seed:941};
 const stages=[];
 async function stage(name,ids,extra={}){const result={name,tick:view().tick,ids,...extra};stages.push(result);await onStage(result,view())}
 async function until(label,predicate,max=1200){for(let elapsed=0;elapsed<max&&!predicate();elapsed+=5)await driver.step(5);check(predicate(),`${label} exceeded its ${max}-tick bound at ${view().tick}`)}
 async function prepare(label){await driver.create(config);await driver.step(100);const home=origin(9),backup=origin(36),fighter=origin(40);check(home&&backup&&fighter,'Original US04 service actors missing');await driver.orders([{kind:'return',entities:[fighter.id]}]);await until('original fighter service admission',()=>at(fighter.id)?.landed&&at(fighter.id)?.private?.serviceWork>0);await stage(label,[fighter.id,home.id,backup.id]);return {home:home.id,backup:backup.id,fighter:fighter.id}}

 const a=await prepare('a-original-service');
 await driver.orders([{kind:'train',entities:[a.backup],type:'US.fighter'}]);
 const job=at(a.backup).private.jobs[0];check(job?.started&&Number(job.paid)>0&&job.service===a.home,'Paid job did not reserve original service home');
 await stage('a-paid-reservation',[a.fighter,a.backup,a.home],{paidJob:{...job}});
 await driver.orders([{kind:'power',entities:[a.home],index:0}]);
 await driver.step(1);
 const heldService=at(a.fighter).private.serviceWork,heldJob=at(a.backup).private.jobs[0].work;
 check(!at(a.home).enabled&&at(a.fighter).landed&&heldService>0,'Original home did not pause landed service');
 check(at(a.backup).enabled&&at(a.backup).state==='service_full','Active producer did not disclose unavailable reserved home');
 await driver.step(40);
 check(at(a.fighter).private.serviceWork===heldService&&at(a.backup).private.jobs[0].work===heldJob,'Inactive reserved home advanced service/production');
 await stage('a-disabled-home',[a.fighter,a.backup,a.home],{heldService,heldJob});
 await driver.orders([{kind:'power',entities:[a.home],index:1},...own('power').map(e=>({kind:'power',entities:[e.id],index:0}))]);
 check(view().economy.powerDemand>view().economy.powerCapacity,'Power toggles did not create actual low power');
 const lowBefore=at(a.fighter).private.serviceWork;await driver.step(20);
 check(at(a.fighter).private.serviceWork===lowBefore+20,'Low-power service did not advance at actual half rate');
 await stage('a-low-power-active-service',[a.fighter,a.home],{serviceWorkBefore:lowBefore,serviceWorkAfter:at(a.fighter).private.serviceWork});
 await driver.orders(own('power').map(e=>({kind:'power',entities:[e.id],index:1})));
 const initialFighters=new Set(own('US.fighter').map(e=>e.id));
 await until('paid fighter completion',()=>own('US.fighter').some(e=>!initialFighters.has(e.id)),1500);
 const paid=own('US.fighter').find(e=>!initialFighters.has(e.id));check(paid.private.home===a.home,'Paid fighter lost its real reservation');
 await stage('a-paid-fighter-ready',[paid.id,a.backup,a.home],{paidMilli:Number(job.paid)});
 // This is a real outward move with an explicit later Return. No artificial
 // snapshot orders are supplied to the presentation layer.
 const destination={x:at(a.home).position.x+14000,y:at(a.home).position.y};
 await driver.orders([{kind:'move',entities:[paid.id],position:destination},{kind:'return',entities:[paid.id],queued:true}]);
 check(!at(paid.id).landed&&at(paid.id).private.orders[0]?.kind==='move'&&at(paid.id).private.orders[1]?.kind==='return','Expected real outbound move and queued Return');
 await stage('a-outbound-queued-return',[paid.id]);
 await until('active Return head',()=>!at(paid.id).landed&&at(paid.id).private.orders[0]?.kind==='return',1200);
 await stage('a-active-return',[paid.id]);
 await until('paid fighter service admission',()=>at(paid.id).landed&&at(paid.id).private.serviceWork>0,1200);
 await stage('a-paid-fighter-service',[paid.id,a.home]);
 await driver.orders([{kind:'sell',entities:[a.home]}]);
 await until('original field sale with reassignment',()=>!at(a.home)&&at(paid.id)?.private?.home===a.backup,150);
 check(at(paid.id).private.emergencyTakeoffUntil>view().tick,'Reassigned grounded aircraft missed emergency takeoff window');
 check(view().events.some(e=>e.kind==='service_lost'&&e.entity===paid.id),'Reassignment source-loss event missing');
 await stage('a-reassigned-service-loss',[paid.id,a.backup],{events:view().events.filter(e=>e.kind==='service_lost')});
 await until('replacement service admission',()=>at(paid.id)?.landed&&at(paid.id)?.private?.serviceWork>0&&at(paid.id)?.private?.home===a.backup,1500);
 await stage('a-replacement-service',[paid.id,a.backup]);
 await driver.finishCase('a');

 const b=await prepare('b-original-service');
 await driver.orders([{kind:'power',entities:[b.backup],index:0}]);
 await driver.orders([{kind:'sell',entities:[b.home]}]);
 await until('original field sale without an available replacement',()=>!at(b.home)&&at(b.fighter)?.private?.home===0,150);
 check(at(b.fighter).landed&&at(b.fighter).private.emergencyTakeoffUntil>view().tick,'No-home grounded emergency state missing');
 check(view().events.some(e=>e.kind==='service_lost'&&e.entity===b.fighter),'No-home source-loss event missing');
 await stage('b-no-home-grounded',[b.fighter,b.backup],{events:view().events.filter(e=>e.kind==='service_lost')});
 await until('emergency takeoff',()=>!at(b.fighter).landed,50);
 check(at(b.fighter).private.home===0&&at(b.fighter).private.endurance<=1200,'Actual no-home endurance cap missing');
 await stage('b-no-home-airborne',[b.fighter],{endurance:at(b.fighter).private.endurance});
 await driver.orders([{kind:'power',entities:[b.backup],index:1}]);await driver.step(1);
 check(at(b.fighter).private.home===b.backup,'New active capacity did not admit unassigned aircraft');
 await stage('b-home-recovered',[b.fighter,b.backup]);
 await driver.finishCase('b');
 return {stages,scope:'Untouched authored US04 starts. Ordinary paid job, Return, power, sell and Go ticks only; not a mission win or paid opening.'};
}
