// Acceptance-only policy. All legality, prices, damage, paths and outcomes stay
// in Go. This module sees one authorized view and the public map/catalog only.
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const orders=e=>e.private?.orders??[],jobs=e=>e.private?.jobs??[];
const samePoint=(a,b)=>a&&b&&distance(a,b)<1500;
export function strategicReserve(catalog,intent){return intent?catalog.buildings.find(b=>b.id===intent.type)?.cost??0:0}
// Public roster eligibility only. Go remains the final capture authority.
export function captureStationOwnerAllowed(view,player,owner){
 const me=view.players.find(p=>p.id===player);if(!me||me.defeated||owner===player)return false;
 if(owner===0)return true;
 const other=view.players.find(p=>p.id===owner);
 return !!other&&!other.defeated&&other.team!==me.team;
}
export class ExpansionCommander {
 constructor({player,map,catalog,view,send,advice,record=()=>{}}){
  Object.assign(this,{player,map,catalog,view,send,advice,record});this.units=new Map(catalog.units.map(x=>[x.id,x]));this.buildings=new Map(catalog.buildings.map(x=>[x.id,x]));
  this.failed=new Map();this.last=new Map();this.recovering=new Set();this.scouted=new Set();this.routes=new Map();this.searches=new Map();this.lastBuild=-1000;this.lastResearch=-1000;this.initial=false;
 }
 role(e){return this.units.get(e.type)?.role??this.buildings.get(e.type)?.role}
 known(view,p){return !!view.visible[Math.floor(p.y/1000)*this.map.width+Math.floor(p.x/1000)]}
 own(view){return view.entities.filter(e=>e.owner===this.player&&e.health>0&&!e.private?.container)}
 async issue(orders,note){
  if(!orders.length)return [];const view=this.view(),owned=new Set(this.own(view).map(e=>e.id));
  const valid=orders.filter(o=>!o.entities?.some(id=>!owned.has(id)));
  if(valid.length!==orders.length)this.record({kind:'stale-intention',tick:view.tick,note,orders:orders.filter(o=>!valid.includes(o))});
  if(!valid.length)return [];const receipts=await this.send(valid,note);this.record({kind:'orders',tick:this.view().tick,note,orders:valid,receipts});return receipts??[];
 }
 // Avoid resetting an ongoing route/channel simply because another decision
 // cycle elapsed. Cooldowns here bound command traffic, never delay an attack.
 async command(entity,order,note){
  // Earlier awaited receipts may have advanced the real simulation. Never
  // command a unit already absent/dead in the latest authorized owner view.
  entity=this.view().entities.find(e=>e.id===entity.id&&e.owner===this.player&&e.health>0&&!e.private?.container);if(!entity)return;
  if(entity.channel)return;
  const v=this.view(),now=orders(entity)[0],last=this.last.get(entity.id),signature=JSON.stringify(order);
  if(entity.state!=='blocked'&&now?.kind===order.kind&&(order.target?now.target===order.target:samePoint(now.position,order.position)))return;
  if(last?.signature===signature&&v.tick-last.tick<80)return;
  const [r]=await this.issue([{...order,entities:[entity.id]}],note);this.last.set(entity.id,{signature,tick:v.tick});return r;
 }
 context(view){
  const own=this.own(view),me=view.players.find(p=>p.id===this.player),base=own.find(e=>e.type==='hq')?.position??this.map.spawns[this.player-1].position;
  const enemies=new Set(view.players.filter(p=>p.team!==me.team&&!p.defeated).map(p=>p.id));
  const seen=view.entities.filter(e=>enemies.has(e.owner)&&e.health>0),fields=[...this.map.fields].sort((a,b)=>distance(a.position,base)-distance(b.position,base));
  const primary=fields[0],expansion=fields.find(f=>f.id!==primary.id&&distance(f.position,base)<distance(f.position,this.map.spawns[me.id===1?1:0].position));
  return {own,me,base,seen,primary,expansion,enemyBase:this.map.spawns[me.id===1?1:0].position,building:(type,complete=true)=>own.filter(e=>e.type===type&&(!complete||e.complete))};
 }
 construction(view,c){
  const has=type=>c.building(type,false).length>0;
  if(!has('hq'))return {type:'hq',center:c.base};
  if(!has('power'))return {type:'power',center:c.base};
  if(!has('supply'))return {type:'supply',center:c.primary.position};
  if(!has('barracks'))return {type:'barracks',center:c.base};
  if(view.economy.powerCapacity-view.economy.powerDemand<35)return {type:'power',center:c.base};
  if(!has('factory'))return {type:'factory',center:c.base};
  const homeThreat=c.seen.some(e=>this.units.get(e.type)?.weapon&&distance(e.position,c.base)<18000);
  if(homeThreat&&!has('turret'))return {type:'turret',center:this.toward(c.base,c.enemyBase,6500)};
  if(!has('radar'))return {type:'radar',center:c.base};
  const field=view.fields.find(f=>f.id===c.primary.id),safeExpansion=c.expansion&&this.known(view,c.expansion.position)&&!c.seen.some(e=>this.units.get(e.type)?.weapon&&distance(e.position,c.expansion.position)<14000);
  const depleted=field&&Number(field.remaining??field.credits)<24000000;
  if(safeExpansion&&(depleted||Number(view.economy.credits)>=3800000)){
   const outpost=c.building('outpost',false).find(e=>distance(e.position,c.expansion.position)<13000);
   if(!outpost)return {type:'outpost',center:this.toward(c.expansion.position,c.base,6500)};
   if(outpost.complete&&!c.building('supply',false).some(e=>distance(e.position,c.expansion.position)<13000))return {type:'supply',center:c.expansion.position};
  }
  if(!has('depot')&&c.own.some(e=>['light','heavy'].includes(this.units.get(e.type)?.armor)&&e.health<800))return {type:'depot',center:c.base};
  if(c.building('supply').length>=2&&c.building('factory',false).length<2)return {type:'factory',center:c.base};
  if(!has('tech')&&c.building('factory').length&&c.own.filter(e=>this.units.get(e.type)?.weapon).length>=10)return {type:'tech',center:c.base};
 }
 toward(from,to,n){const d=distance(from,to)||1;return {x:Math.round(from.x+(to.x-from.x)*n/d),y:Math.round(from.y+(to.y-from.y)*n/d)}}
 async construct(intent,rig,view){
  if(view.tick-this.lastBuild<60)return;this.lastBuild=view.tick;
  const positions=[];
  for(let radius=3500;radius<=12500;radius+=1500)for(const [x,y] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]]){
   const position={x:Math.floor((intent.center.x+x*radius)/1000)*1000+500,y:Math.floor((intent.center.y+y*radius)/1000)*1000+500};
   if(position.x<3000||position.y<3000||position.x>this.map.width*1000-3000||position.y>this.map.height*1000-3000||!this.known(view,position))continue;
   const key=`${intent.type}:${position.x}:${position.y}`;if(view.tick-(this.failed.get(key)??-10000)>=600)positions.push(position);
  }
  // A preference for roomy known bases, not a duplicate legality validator.
  // Leave walking space between owned permanent structures instead of filling
  // every nearest cell around the HQ. Go still validates every chosen site.
  const rule=this.buildings.get(intent.type),ownStructures=this.own(view).filter(e=>this.buildings.has(e.type));
  const roomy=positions.filter(p=>ownStructures.every(e=>{const b=this.buildings.get(e.type);return Math.abs(p.x-e.position.x)>(rule.width+b.width)*500+2200||Math.abs(p.y-e.position.y)>(rule.height+b.height)*500+2200}));
  if(roomy.length)positions.splice(0,positions.length,...roomy);
  // Prefer every never-tried candidate before returning to an old refusal.
  // Merely expiring a short cooldown can otherwise cycle the nearest occupied
  // eight cells forever, starving a legal wider site and HQ recovery.
  positions.sort((a,b)=>(this.failed.get(`${intent.type}:${a.x}:${a.y}`)??-1)-(this.failed.get(`${intent.type}:${b.x}:${b.y}`)??-1)||distance(a,intent.center)-distance(b,intent.center));
  if(!positions.length){await this.command(rig,{kind:'move',position:intent.center},'Move builder to publicly scouted expansion');return}
  // Advisory placement is deliberately indeterminate. Real submission supplies
  // exact overlap/path rejection; rejected candidates are logged and rotated.
  const choices=positions.slice(0,24).map(position=>({kind:'build',entities:[rig.id],type:intent.type,position}));
  const preview=await this.advice([],choices,false);if(!preview)return;
  const index=preview.results.findIndex(r=>r.accepted);if(index<0)return;
  const choice=choices[index],[result]=await this.issue([choice],'Paid '+intent.type+' construction');
  if(!result?.accepted)this.failed.set(`${intent.type}:${choice.position.x}:${choice.position.y}`,view.tick);
 }
 async logistics(view,c){
  const workers=c.own.filter(e=>this.role(e)==='engineer'),damaged=c.own.filter(e=>this.buildings.has(e.type)&&e.complete&&e.health<900).sort((a,b)=>a.health-b.health);
  for(const worker of workers){
   const target=damaged.find(e=>distance(e.position,worker.position)<20000);
   if(target){await this.command(worker,{kind:'repair',target:target.id},'Paid repair of owned structure');continue}
   const current=this.view();
   const station=current.stations.filter(s=>captureStationOwnerAllowed(current,this.player,s.owner)&&this.known(current,s.position)&&!c.seen.some(e=>this.units.get(e.type)?.weapon&&distance(e.position,s.position)<12000)).sort((a,b)=>distance(a.position,worker.position)-distance(b.position,worker.position))[0];
   if(station)await this.command(worker,{kind:'capture',target:station.id},'Capture currently visible supply station');
  }
  const supplies=c.building('supply'),haulers=c.own.filter(e=>this.role(e)==='hauler');
  for(const hauler of haulers){
   if(orders(hauler).length||Number(hauler.private?.cargo)>0)continue;
   const fields=view.fields.filter(f=>Number(f.remaining??f.credits)>0&&supplies.some(s=>distance(s.position,f.position)<14000)).sort((a,b)=>distance(a.position,hauler.position)-distance(b.position,hauler.position));
   if(fields[0])await this.command(hauler,{kind:'gather',target:fields[0].id},'Assign idle hauler to disclosed resource field');
  }
 }
 async scouting(view,c){
  const scouts=c.own.filter(e=>this.role(e)==='recon');
  const destinations=[c.expansion?.position,...this.map.stations.map(s=>s.position),...this.map.fields.map(f=>f.position),c.enemyBase].filter(Boolean);
  for(const p of destinations)if(this.known(view,p))this.scouted.add(`${p.x}:${p.y}`);
  for(const [index,scout] of scouts.entries()){
   const threat=c.seen.find(e=>this.units.get(e.type)?.weapon&&distance(e.position,scout.position)<7000);
   if(threat){await this.command(scout,{kind:'move',position:this.toward(scout.position,c.base,9000)},'Preserve threatened scout');continue}
   // Keep actual sight for the forward builder; historical exploration alone
   // cannot authorize a new outpost. The second scout continues reconnaissance.
   if(index===0&&c.expansion&&!c.building('outpost').some(e=>distance(e.position,c.expansion.position)<13000)){await this.command(scout,{kind:'guard',position:c.expansion.position},'Maintain real expansion sight for builder');continue}
   const next=destinations.find(p=>!this.scouted.has(`${p.x}:${p.y}`));
   if(next)await this.command(scout,{kind:'move',position:next},'Scout public expansion and crossing approaches');
  }
 }
 async combat(view,c){
  const army=c.own.filter(e=>this.units.get(e.type)?.weapon&&!['recon','aa','fighter'].includes(this.role(e)));
  const supports=c.own.filter(e=>['medic','repair'].includes(this.role(e)));
  const active=[];
  for(const e of army){
   if(e.health<350)this.recovering.add(e.id);
   if(e.health>=850)this.recovering.delete(e.id);
   const support=supports.filter(s=>this.role(s)===(this.units.get(e.type).armor==='infantry'?'medic':'repair')).sort((a,b)=>distance(a.position,e.position)-distance(b.position,e.position))[0];
   if(this.recovering.has(e.id)&&support){await this.command(e,{kind:'move',position:this.toward(c.base,c.enemyBase,4000)},'Withdraw damaged survivor to paid support');continue}
   active.push(e);
  }
  const threat=c.seen.filter(e=>this.units.get(e.type)?.weapon&&[c.base,...c.building('outpost').map(x=>x.position)].some(p=>distance(p,e.position)<17000)).sort((a,b)=>distance(a.position,c.base)-distance(b.position,c.base))[0];
  const targets=c.seen.filter(e=>this.buildings.get(e.type)?.qualifying||this.role(e)==='rig');
  const target=targets.sort((a,b)=>distance(a.position,c.base)-distance(b.position,c.base))[0];
  const supply=active.reduce((sum,e)=>sum+this.units.get(e.type).supply,0);
  // Attack readiness is composition-based. The clock is never read to prevent
  // or release an assault; an exposed qualifying target overrides the threshold.
  const advance=supply>=12||!!threat||!!target;
  const destination=threat?.position??target?.position??this.searchDestination(view,c,active);
  const leader=active.filter(e=>!['artillery','launcher'].includes(this.role(e))).sort((a,b)=>distance(a.position,destination)-distance(b.position,destination))[0];
  for(const support of supports){
   const injured=army.filter(e=>e.health<850&&this.role(support)===(this.units.get(e.type).armor==='infantry'?'medic':'repair')).sort((a,b)=>a.health-b.health)[0];
   if(injured)await this.command(support,{kind:'repair',target:injured.id},'Ordinary healing/paid mechanical recovery');
   else if(leader)await this.command(support,{kind:'guard',target:leader.id},'Support advancing combat group');
  }
  for(const unit of active){
   if(!advance){await this.command(unit,{kind:'guard',position:this.toward(c.base,c.enemyBase,11000)},'Secure staging approach while producing combined arms');continue}
   const route=threat?undefined:this.crossingWaypoint(unit,destination,view.tick);
   if(route)await this.command(unit,{kind:'attack_move',position:route},'Use public crossing / recover blocked attack route');
   else if(target&&!threat&&this.known(view,target.position))await this.command(unit,{kind:'attack',target:target.id},'Attack disclosed qualifying asset without waiting');
   else await this.command(unit,{kind:'attack_move',position:destination},threat?'Defend threatened economy':'Apply continuous ordinary pressure');
  }
  for(const aa of c.own.filter(e=>this.role(e)==='aa'))if(leader)await this.command(aa,{kind:'guard',target:leader.id},'Escort combined arms against disclosed air');
 }
 searchDestination(view,c,army){
  // A stale memory is a place to scout, never a live attack target. Actual
  // minimap-only endgame indicators are likewise movement information only.
  const enemyIDs=new Set(view.players.filter(p=>p.team!==c.me.team&&!p.defeated).map(p=>p.id));
  const remembered=(view.memory??[]).filter(e=>enemyIDs.has(e.owner)&&this.buildings.get(e.type)?.qualifying).map(e=>e.position);
  const points=[...remembered,...(view.indicators??[]).filter(e=>enemyIDs.has(e.owner)).map(e=>e.position),c.enemyBase,...this.map.fields.map(f=>f.position)].filter(p=>p&&distance(p,c.base)>20000);
  const candidates=[...new Map(points.map(p=>[`${p.x}:${p.y}`,p])).values()];
  for(const p of candidates)if(this.known(view,p)&&army.some(e=>distance(e.position,p)<4500))this.searches.set(`${p.x}:${p.y}`,view.tick);
  const unvisited=candidates.find(p=>!this.searches.has(`${p.x}:${p.y}`));
  if(unvisited)return unvisited;
  // A finite list of bases/fields misses legal buildings beyond their sight
  // stops. Inspect public fog frontiers too; no hidden actor position is read.
  // Keep a chosen destination until it is actually seen, avoiding order churn.
  if(this.frontierSearch){
   const blocked=army.length>0&&army.every(e=>e.state==='blocked');
   if(!this.known(view,this.frontierSearch)&&!blocked)return this.frontierSearch;
   this.searches.set(`${this.frontierSearch.x}:${this.frontierSearch.y}`,view.tick);this.frontierSearch=undefined;
  }
  const frontiers=[];
  for(let y=4;y<this.map.height;y+=8)for(let x=4;x<this.map.width;x+=8){
   const index=y*this.map.width+x,tile=this.map.tiles[index],p={x:x*1000+500,y:y*1000+500};
   if(!tile||['blocked','cliff'].includes(tile.terrain)||this.known(view,p))continue;
   frontiers.push({p,explored:!!view.explored?.[index],visited:this.searches.get(`${p.x}:${p.y}`)??-1});
  }
  const reference=army.length?{x:army.reduce((n,e)=>n+e.position.x,0)/army.length,y:army.reduce((n,e)=>n+e.position.y,0)/army.length}:c.enemyBase;
  frontiers.sort((a,b)=>Number(a.explored)-Number(b.explored)||a.visited-b.visited||distance(a.p,reference)-distance(b.p,reference)||a.p.y-b.p.y||a.p.x-b.p.x);
  if(frontiers.length){this.frontierSearch=frontiers[0].p;return this.frontierSearch}
  return candidates.sort((a,b)=>(this.searches.get(`${a.x}:${a.y}`)??-1)-(this.searches.get(`${b.x}:${b.y}`)??-1))[0]??c.enemyBase;
 }
 crossingWaypoint(unit,destination,tick){
  if(this.map.id!=='dry-river'||distance(unit.position,destination)<18000)return;
  // These are public road-center approaches read from this unchanged authored
  // map, not a pathfinding substitute. Normal attack_move validates and travels.
  const middle=this.map.width*500,fromLeft=this.player===1;
  if(fromLeft?unit.position.x>80500:unit.position.x<47500)return;
  let route=this.routes.get(unit.id);if(!route){route={lane:Math.floor(unit.id/4)%3,stage:0,lastBlocked:-1000};this.routes.set(unit.id,route)}
  if(unit.state==='blocked'&&tick-route.lastBlocked>=160){route.lane=(route.lane+1)%3;route.stage=0;route.lastBlocked=tick}
  const y=[27500,64500,101500][route.lane],entry={x:fromLeft?47500:80500,y},exit={x:fromLeft?80500:47500,y};
  if(distance(unit.position,exit)<4500)route.stage=2;
  if(route.stage===2)return;
  if(distance(unit.position,entry)<4500)route.stage=1;
  // A late reinforcement already on the bridge need not walk backward.
  if(fromLeft?unit.position.x>middle:unit.position.x<middle)route.stage=1;
  return route.stage===0?entry:exit;
 }
 async economy(view,c){
  const intent=this.construction(view,c),funds=Number(view.economy.credits),pending=c.own.some(e=>this.buildings.has(e.type)&&!e.complete);
  const rigs=c.own.filter(e=>this.role(e)==='rig'),rig=rigs.find(e=>!orders(e).length||orders(e)[0].kind==='move');
  if(!rigs.length){
   const hq=c.building('hq')[0],producer=hq??c.building('factory')[0];
   // Actual prerequisite_lost feedback can leave a paid ordinary job ahead of
   // emergency recovery forever. Use normal cancel/refund, one head at a time;
   // never cancel an existing emergency rig or a productive/disabled queue.
   if(!hq&&producer?.enabled&&producer.state==='prerequisite_lost'&&jobs(producer).length&&!jobs(producer)[0].emergency){
    await this.issue([{kind:'cancel',entities:[producer.id],index:0}],'Cancel prerequisite-blocked ordinary job for emergency recovery');return;
   }
   if(producer&&!jobs(producer).length){const preview=await this.advice([], [{kind:'train',entities:[producer.id],type:c.me.faction+'.rig'}]);if(preview?.results[0]?.accepted)await this.issue([{kind:'train',entities:[producer.id],type:c.me.faction+'.rig'}],'Ordinary replacement or emergency rig')}return;
  }
  if(rig&&pending){const foundation=c.own.find(e=>this.buildings.has(e.type)&&!e.complete&&!rigs.some(r=>orders(r).some(o=>o.kind==='build'&&samePoint(o.position,e.position))));if(foundation)await this.command(rig,{kind:'resume',target:foundation.id},'Resume surviving owned foundation')}
  if(rig&&!pending&&intent&&funds>=strategicReserve(this.catalog,intent)){await this.construct(intent,rig,view);return}
  // Correct the rush driver's1500 reserve for an1800 factory. Exact prices are
  // read from the catalog; reserve is spent on its stated goal as soon as legal.
  const reserve=pending?0:strategicReserve(this.catalog,intent);let budget=funds-reserve;
  const planned=new Map();for(const e of c.own){planned.set(e.type,(planned.get(e.type)??0)+1);for(const j of jobs(e))planned.set(j.type,(planned.get(j.type)??0)+1)}
  const count=role=>planned.get(c.me.faction+'.'+role)??0;
  const queue=[];
  const factoryRole=()=>count('repair')<1?'repair':count('tank')<2?'tank':view.economy.tier>=2&&count('artillery')<Math.max(2,Math.floor(count('tank')/2))?'artillery':c.seen.some(e=>this.units.get(e.type)?.armor==='air')&&count('aa')<2?'aa':'tank';
  const producers=c.own.filter(e=>this.buildings.has(e.type)&&e.complete&&e.enabled&&!jobs(e).length).sort((a,b)=>(a.type==='supply'?0:a.type==='factory'?1:2)-(b.type==='supply'?0:b.type==='factory'?1:2));
  for(const producer of producers){
   let role;
   if(producer.type==='supply'&&count('hauler')<c.building('supply').length*2)role='hauler';
   if(producer.type==='barracks')role=count('recon')<1?'recon':count('rifle')<3?'rifle':count('engineer')<1?'engineer':count('medic')<1?'medic':count('recon')<2?'recon':count('rifle')<4?'rifle':count('at')<3?'at':count('rifle')<7?'rifle':undefined;
   if(producer.type==='factory')role=factoryRole();
   const u=this.units.get(c.me.faction+'.'+role);if(!u||budget<u.cost||view.economy.supply+view.economy.reservedSupply+queue.reduce((sum,o)=>sum+(this.units.get(o.type)?.supply??0),0)+u.supply>96)continue;
   if(producer.type==='barracks'&&count('rifle')>=3&&producers.some(p=>p.type==='factory')&&!queue.some(o=>c.own.find(e=>e.id===o.entities[0])?.type==='factory')&&budget-u.cost<(this.units.get(c.me.faction+'.'+factoryRole())?.cost??0))continue;
   queue.push({kind:'train',entities:[producer.id],type:u.id});planned.set(u.id,(planned.get(u.id)??0)+1);budget-=u.cost;
  }
  if(queue.length){const preview=await this.advice([],queue);const permitted=queue.filter((_o,i)=>preview?.results[i]?.accepted);if(permitted.length)await this.issue(permitted,'Paid combined-arms and logistics production')}
  if(view.tick-this.lastResearch>100){const producer=c.building('radar')[0],upgrade=this.catalog.upgrades.find(x=>x.id==='weapons_training');if(producer&&!jobs(producer).length&&!view.economy.upgrades.includes(upgrade.id)&&budget>=upgrade.cost){this.lastResearch=view.tick;await this.issue([{kind:'research',entities:[producer.id],type:upgrade.id}],'Paid weapons research')}}
 }
 async step(){
  let view=this.view();if(!view||view.countdown||view.outcome?.finished||view.players.find(p=>p.id===this.player)?.defeated)return;
  if(!this.initial){this.initial=true;await this.issue([{kind:'repair_reserve',index:300}],'Reserve300credits for player-controlled repair spending')}
  for(const method of ['logistics','scouting','combat','economy']){view=this.view();if(view.outcome?.finished||view.players.find(p=>p.id===this.player)?.defeated)return;await this[method](view,this.context(view))}
 }
}
