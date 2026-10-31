import {useState,type CSSProperties} from 'react';
import type {Application} from '../app/application';
import {useObservable} from '../app/store';
import {ownerTeamColor} from '../design/team-colors';
import {credits,formatClock} from '../content/labels';
import {Icon} from './primitives';
import {Segmented} from './menu/kit/Segmented';
import {Button} from './menu/kit/Button';
import '../styles/records.css';

type Metric='income'|'spent'|'supply'|'stations';
const METRICS:ReadonlyArray<{value:Metric;label:string}>=[{value:'income',label:'Income'},{value:'spent',label:'Spent'},{value:'supply',label:'Supply'},{value:'stations',label:'Stations'}];
/** Line patterns so each commander's series is distinct without relying on color. */
const DASH=['','8 5','2 4','12 4 2 4'];
const axis=(value:number)=>value>0&&value<10&&!Number.isInteger(value)?value.toFixed(1):Math.round(value).toLocaleString('en-US');
const sentence=(text:string)=>text?text[0].toUpperCase()+text.slice(1):text;
const sum=(entries:ReadonlyArray<{count:number}>|undefined)=>entries?.reduce((total,entry)=>total+entry.count,0)??0;

/** Post-match battle report: head-to-head numbers, the economy chart and the event timeline. Read-only recap. */
export function DebriefStats({app}:{app:Application}){
 const state=useObservable(app.state),[metric,setMetric]=useState<Metric>('income'),[events,setEvents]=useState(false),snapshot=state.snapshot,debrief=snapshot?.debrief;if(!snapshot?.outcome?.finished||!debrief)return null;
 const palette=state.settings.palette,color=(player:number)=>ownerTeamColor(player,snapshot.players,palette).css;
 const series=debrief.players.map(player=>({player,points:player.metrics?.timeline??[]})),max=Math.max(metric==='income'||metric==='spent'?1000:1,...series.flatMap(series=>series.points.map(point=>Number(point[metric])))),ticks=Math.max(1,snapshot.tick),money=metric==='income'||metric==='spent';
 const rows:ReadonlyArray<{label:string;icon:string;value:(player:NonNullable<typeof debrief>['players'][number])=>number;format?:(value:number)=>string;lowerIsBetter?:boolean}>=[
  {label:'Units produced',icon:'i-units',value:player=>sum(player.metrics?.unitsProduced)},
  {label:'Structures built',icon:'i-building',value:player=>sum(player.metrics?.buildingsConstructed)},
  {label:'Units lost',icon:'i-close',value:player=>player.metrics?.unitsLost??0,lowerIsBetter:true},
  {label:'Structures lost',icon:'i-alert',value:player=>player.metrics?.buildingsLost??0,lowerIsBetter:true},
  {label:'Tiles explored',icon:'i-eye',value:player=>player.exploredTiles},
  {label:'Station control',icon:'i-flag-checker',value:player=>player.metrics?.stationControlTicks??0,format:formatClock},
  {label:'Repair spending',icon:'i-wrench',value:player=>Number((player.metrics?.repairSpent??0n)/1000n),format:value=>value.toLocaleString('en-US')},
  {label:'Missile spending',icon:'i-missile',value:player=>Number((player.metrics?.missileSpent??0n)/1000n),format:value=>value.toLocaleString('en-US')},
  {label:'Interceptors fired',icon:'i-intercept',value:player=>player.metrics?.interceptorsFired??0},
 ];
 return <div className="debrief-details rec-debrief">
  <section className="rec-debrief-block" aria-labelledby="rec-debrief-versus"><h3 id="rec-debrief-versus" className="rec-section-title"><Icon id="i-grid"/>Battle report</h3>
   <div className="rec-versus-scroll"><table className="rec-versus"><thead><tr><th scope="col"><span className="sr-only">Measure</span></th>{debrief.players.map((player,index)=><th scope="col" key={player.player} style={{'--team':color(player.player)} as CSSProperties} data-own={player.player===snapshot.player||undefined}><span className="rec-versus-swatch" data-pattern={index%4} aria-hidden="true"/>{player.name}{player.player===snapshot.player&&<small>You</small>}</th>)}</tr></thead>
    <tbody>{rows.map(row=>{const values=debrief.players.map(row.value),best=row.lowerIsBetter?Math.min(...values):Math.max(...values),top=Math.max(1,...values);return <tr key={row.label}><th scope="row"><span className="rec-versus-label"><Icon id={row.icon}/>{row.label}</span></th>{values.map((value,index)=><td key={debrief.players[index].player} data-best={values.length>1&&value===best&&values.some(other=>other!==value)||undefined}><span className="rec-versus-value">{row.format?row.format(value):value.toLocaleString('en-US')}</span><span className="rec-versus-bar" aria-hidden="true"><i style={{width:`${value/top*100}%`,background:color(debrief.players[index].player)}}/></span></td>)}</tr>})}</tbody></table></div>
  </section>
  <section className="rec-debrief-block" aria-labelledby="rec-debrief-chart"><div className="rec-debrief-chart-head"><h3 id="rec-debrief-chart" className="rec-section-title"><Icon id="i-credits"/>Economy over time</h3><Segmented label="Chart measure" size="sm" value={metric} options={METRICS} onChange={setMetric}/></div>
   <figure className="debrief-chart rec-chart"><svg viewBox="0 0 700 200" role="img" aria-label={`Recorded ${metric} over match time`}><path d="M45 10V175H690" fill="none" stroke="#5a5349"/>{[0,.5,1].map(fraction=><g key={fraction}><path d={`M45 ${175-fraction*160}H690`} stroke="rgba(255,238,205,.08)"/><text x="39" y={179-fraction*160} textAnchor="end">{axis(max*fraction/(money?1000:1))}</text></g>)}{series.map(({player,points},index)=><polyline key={player.player} fill="none" stroke={color(player.player)} strokeWidth={player.player===snapshot.player?3:2} strokeDasharray={DASH[index%4]||undefined} strokeLinejoin="round" points={points.map(point=>`${45+point.tick/ticks*645},${175-Number(point[metric])/max*160}`).join(' ')}/>)}<text x="45" y="194">00:00</text><text x="690" y="194" textAnchor="end">{formatClock(ticks)}</text></svg>
    <figcaption>{debrief.players.map((player,index)=><span key={player.player}><svg width="26" height="8" aria-hidden="true"><line x1="1" y1="4" x2="25" y2="4" stroke={color(player.player)} strokeWidth="3" strokeDasharray={DASH[index%4]||undefined}/></svg>{player.name}</span>)}<small>Recorded samples{money?' in credits':''}; points between samples are joined for readability.</small></figcaption></figure>
  </section>
  <details className="rec-details rec-debrief-production"><summary>Production, service & losses</summary><div className="debrief-metrics">{debrief.players.map(player=><section key={player.player} style={{'--team':color(player.player)} as CSSProperties}><h4>{player.name}</h4><p><b>Produced</b> {player.metrics?.unitsProduced.map(entry=>`${entry.count} ${state.catalog?.name(entry.type)??entry.type}`).join(', ')||'none'}</p><p><b>Constructed</b> {player.metrics?.buildingsConstructed.map(entry=>`${entry.count} ${state.catalog?.name(entry.type)??entry.type}`).join(', ')||'none'}</p><p><b>Spending</b> repairs {credits(player.metrics?.repairSpent??0n)} · missiles {credits(player.metrics?.missileSpent??0n)}</p></section>)}</div></details>
  <div className="rec-debrief-timeline"><Button size="sm" variant="ghost" icon="i-clock" aria-expanded={events} onClick={()=>setEvents(!events)}>{events?'Hide':'Show'} operation timeline</Button>
   {events&&<div className="debrief-event-list rec-event-list">{debrief.events.map((event,index)=><p key={index}><time>{formatClock(event.tick)}</time><strong style={{color:event.player?color(event.player):undefined}}>{debrief.players.find(player=>player.player===event.player)?.name??'Operation'}</strong><span>{sentence(event.text||`${event.kind.replaceAll('_',' ')}${event.type?` · ${state.catalog?.name(event.type)??event.type}`:''}`)}</span></p>)}{!!debrief.omittedEvents&&<p className="rec-muted">{debrief.omittedEvents} earlier events are omitted from this summary. The replay keeps the full command record.</p>}</div>}
  </div>
 </div>;
}
