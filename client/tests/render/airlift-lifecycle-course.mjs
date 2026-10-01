// Shared acceptance commander over the current owner-authorized view. Every
// state transition is produced by ordinary Go orders/ticks on original US04.
export async function airliftLifecycleCourse(driver,{map,mission,onStage=async()=>{}}){
 const check=(v,message)=>{if(!v)throw Error(message)},view=()=>driver.current;
 const own=type=>view().entities.filter(e=>e.owner===1&&e.type===type&&e.health>0),at=id=>view().entities.find(e=>e.id===id&&e.owner===1&&e.health>0);
 const stages=[];let craft,passengers;
 async function stage(name,ids,extra={}){const value={name,tick:view().tick,ids,...extra};stages.push(value);await onStage(value,view())}
 async function until(label,predicate,max=1500){for(let elapsed=0;elapsed<max&&!predicate();elapsed+=5)await driver.step(5);check(predicate(),`${label} exceeded ${max} ticks at ${view().tick}`)}
 await driver.create({map,mission,difficulty:'normal',seed:941});await driver.step(100);
 const producer=own('US.airfield').find(e=>e.private?.missionOrigin==='initial:9'),backup=own('US.airfield').find(e=>e.private?.missionOrigin==='initial:36');check(producer&&backup,'Authored original and backup service homes missing');
 const existing=new Set(own('US.airlift').map(e=>e.id));
 await driver.orders([{kind:'train',entities:[producer.id],type:'US.airlift'}]);
 const job=at(producer.id).private.jobs.find(j=>j.type==='US.airlift');check(job?.started&&Number(job.paid)===900000,'Airlift did not incur its actual paid production cost');
 await stage('paid-airlift-job',[producer.id],{paidMilli:Number(job.paid),serviceHome:job.service});
 await until('paid airlift completion',()=>own('US.airlift').some(e=>!existing.has(e.id)),1500);craft=own('US.airlift').find(e=>!existing.has(e.id));check(craft.private.home>0,'Paid airlift has no service reservation');
 await stage('paid-airlift-ready',[craft.id,producer.id],{home:craft.private.home});
 // Production has already placed this new, fully serviced aircraft on a legal
 // owned pad. Return while full/landed does not invent another rearm cycle.
 check(at(craft.id).landed&&at(craft.id).private.serviceWork===0&&at(craft.id).private.endurance===2400,'Paid airlift did not start at its actual ready service pad');
 await stage('parked-ready',[craft.id,at(craft.id).private.home]);
 passengers=own('US.rifle').filter(e=>!e.private.container).sort((a,b)=>{const p=at(craft.id).position;return (a.position.x-p.x)**2+(a.position.y-p.y)**2-((b.position.x-p.x)**2+(b.position.y-p.y)**2)||a.id-b.id}).slice(0,2).map(e=>({id:e.id,health:e.health}));check(passengers.length===2,'Two original owned rifle squads required');
 const ids=()=>[craft.id,...passengers.map(p=>p.id)];
 async function board(prefix){
  await driver.orders([{kind:'board',entities:passengers.map(p=>p.id),target:craft.id}]);
  await until(prefix+' boarding channel',()=>passengers.some(p=>at(p.id)?.state==='board'&&at(p.id).channelUntil>view().tick),1600);
  check(at(craft.id).landed,'Service-pad boarding unexpectedly departed');
  await stage(prefix+'-boarding',ids(),{pad:at(craft.id).position});
  await until(prefix+' boarding completion',()=>at(craft.id)?.private.passengers.length===2&&passengers.every(p=>at(p.id)?.private.container===craft.id),300);
  await stage(prefix+'-loaded',ids());
 }
 async function unload(prefix,requireLanded){
  await driver.orders([{kind:'unload',entities:[craft.id]}]);
  await until(prefix+' unload channel',()=>at(craft.id)?.state==='unload'&&at(craft.id).channelUntil>view().tick,300);
  check(at(craft.id).landed===requireLanded,'Unload changed the actual landed/airborne state');
  await stage(prefix+'-unloading',ids());
  await until(prefix+' healthy exits',()=>at(craft.id)?.private.passengers.length===0&&passengers.every(p=>at(p.id)?.private.container===0),300);
  check(passengers.every(p=>at(p.id).health===p.health),'Transport course did not preserve healthy passengers');
  await stage(prefix+'-unloaded',ids(),{exits:passengers.map(p=>({id:p.id,position:at(p.id).position}))});
 }
 await board('pad');await unload('pad',true);await board('second-pad');
 const destination={x:backup.position.x+7000,y:backup.position.y+6000};
 await driver.orders([{kind:'move',entities:[craft.id],position:destination}]);check(!at(craft.id).landed,'Ordinary departure did not take off');
 await stage('loaded-departure',ids(),{destination});
 await until('loaded flight reaches public destination',()=>at(craft.id)?.private.orders.length===0&&Math.abs(at(craft.id).position.x-destination.x)<=500&&Math.abs(at(craft.id).position.y-destination.y)<=500,1500);
 check(at(craft.id).private.passengers.length===2,'Flight lost its loaded squads');await stage('loaded-hover',ids());
 await unload('field',false);
 await driver.orders([{kind:'return',entities:[craft.id]}]);check(at(craft.id).private.orders[0]?.kind==='return'&&!at(craft.id).landed,'Ordinary Return did not become active');
 await stage('return-active',[craft.id,at(craft.id).private.home]);
 await until('return service admission',()=>at(craft.id)?.landed&&at(craft.id).private.serviceWork>0,1500);
 await stage('return-pad-service',[craft.id,at(craft.id).private.home]);
 await until('return service completion',()=>at(craft.id)?.landed&&at(craft.id).private.serviceWork===0,1000);
 check(at(craft.id).private.endurance===2400&&view().events.some(e=>e.kind==='aircraft_serviced'&&e.entity===craft.id),'Return did not complete real service/endurance restoration');
 await stage('return-serviced',[craft.id,at(craft.id).private.home],{passengers:passengers.map(p=>({id:p.id,container:at(p.id)?.private.container,health:at(p.id)?.health}))});
 await driver.finishCase('airlift');return {stages,scope:'Original US04 Normal. One paid airlift, original rifle squads, ordinary boarding/unloading/move/Return and actual service only. Not a mission win, crash/damage or all-art eligibility claim.'};
}
