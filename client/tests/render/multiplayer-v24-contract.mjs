import assert from 'node:assert/strict';
import {ExpansionCommander,distance} from './expansion-commander.mjs';
export const cases=Object.freeze([
 {id:'1h1ai',humans:1,bots:1,mode:'custom',map:'industrial-valley',factions:['US'],rounds:1},
 {id:'1h3ai',humans:1,bots:3,mode:'ffa',map:'industrial-valley',factions:['US'],rounds:1},
 {id:'2h',humans:2,bots:0,mode:'1v1',map:'industrial-valley',factions:['US','IR'],rounds:1},
 {id:'2h2ai',humans:2,bots:2,mode:'custom',teams:true,map:'industrial-valley',factions:['US','IR'],rounds:1},
 {id:'3h',humans:3,bots:0,mode:'ffa',map:'industrial-valley',factions:['US','IR','SY'],rounds:1},
 {id:'4h2v2',humans:4,bots:0,mode:'2v2',teams:true,map:'industrial-valley',factions:['US','IR','SY','SA'],rounds:1},
 {id:'endurance2h',humans:2,bots:0,mode:'1v1',map:'dry-river',factions:['US','SA'],rounds:2,long:true},
]);
export function acceptanceCase(id){const result=cases.find(c=>c.id===id);assert(result,'Choose one explicit accepted configuration; comma-separated auto-launch is not supported');return result}
// The corrected Dry River commander remains unchanged. Only its old two-player
// public-spawn assumption is generalized for the multi-team matrix.
export class MatrixCommander extends ExpansionCommander {
 context(view){
  if(this.map.id==='dry-river'&&view.players.length===2)return super.context(view);
  const own=this.own(view),me=view.players.find(p=>p.id===this.player);assert(me);
  const base=own.find(e=>e.type==='hq')?.position??this.map.spawns[this.player-1].position;
  const enemies=new Set(view.players.filter(p=>p.team!==me.team&&!p.defeated).map(p=>p.id));
  const enemyBases=[...enemies].map(id=>this.map.spawns[id-1]?.position).filter(Boolean).sort((a,b)=>distance(a,base)-distance(b,base)||a.x-b.x||a.y-b.y);
  const enemyBase=enemyBases[0]??base,fields=[...this.map.fields].sort((a,b)=>distance(a.position,base)-distance(b.position,base));
  const primary=fields[0],expansion=fields.find(f=>f.id!==primary.id&&enemyBases.every(p=>distance(f.position,base)<distance(f.position,p)));
  return {own,me,base,seen:view.entities.filter(e=>enemies.has(e.owner)&&e.health>0),primary,expansion,enemyBase,enemyBases,building:(type,complete=true)=>own.filter(e=>e.type===type&&(!complete||e.complete))};
 }
}
export function strictDiagnosticStatus({errors=[],httpErrors=[],requestFailures=[],collectorFaults=[],diagnosticsAgree=true}){
 return errors.length===0&&httpErrors.length===0&&requestFailures.length===0&&collectorFaults.length===0&&diagnosticsAgree?'passed':'failed';
}
