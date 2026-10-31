import {NetworkBattleStatus} from '../network/NetworkBattleStatus';
import {createPortal} from 'react-dom';
import type {BattleStatusAlert} from '../../app/battle-alerts';
import type {AlertStyle} from '../../content/labels';
import {Icon} from '../primitives';
import {shortcutBadgeLabel} from '../shortcut-presentation';
import {DiagnosticsOverlay} from './DiagnosticsOverlay';
import {DefeatWarning} from '../DefeatWarning';
import type {BattleView} from './battle-view';

type Priority=AlertStyle['priority'];
interface FeedRow {id:string;text:string;priority:Priority;icon:string;tick:number;position?:{x:number;y:number};count:number}
/** Presentation lifetime per severity, in simulation ticks (20/s): info 8 s,
 * success 10 s, warning 15 s, critical 25 s (design-audit-hud §2.7). */
const LIFETIME:Record<Priority,number>={info:160,success:200,warning:300,critical:500};
const RANK:Record<Priority,number>={critical:3,warning:2,success:1,info:0};
const STATUS_ICON:Record<BattleStatusAlert['kind'],string>={idle_hauler:'i-hauler',idle_production:'i-building',low_power:'i-power',base_under_attack:'i-alert',unit_lost:'i-alert'};
const MAX_ROWS=4;

/** Pointer-transparent alert feed, top-left of the world. Rows are clickable
 * (jump to the location); the container never captures drags. The newest
 * row with a location carries the bound "Centre latest alert" keycap (Space). */
export function AlertFeed({view}:{view:BattleView}){
 const {alertsHost,state,control,battle,recent,snapshot}=view;
 if(!alertsHost)return null;
 const now=snapshot?.tick??0,rows:FeedRow[]=[];
 const add=(row:Omit<FeedRow,'count'>)=>{if(now-row.tick>LIFETIME[row.priority]||row.tick>now)return;const same=rows.find(value=>value.text===row.text);if(same){same.count++;if(row.tick>same.tick){same.tick=row.tick;same.position=row.position??same.position;same.id=row.id}return}rows.push({...row,count:1})};
 for(const {event,style} of recent)add({id:`e${event.id}`,text:style.text,priority:style.priority,icon:style.icon,tick:event.tick,position:style.actionable&&event.position?{x:event.position.x,y:event.position.y}:undefined});
 for(const alert of battle.statusAlerts)add({id:`s${alert.id}`,text:alert.text,priority:alert.priority,icon:STATUS_ICON[alert.kind]??'i-alert',tick:alert.tick,position:alert.position});
 const visible=rows.sort((a,b)=>b.tick-a.tick||RANK[b.priority]-RANK[a.priority]).slice(0,MAX_ROWS);
 const latest=visible.filter(row=>row.position).sort((a,b)=>b.tick-a.tick)[0],jump=state.settings.bindings.keys.center_alert?.[0];
 return <>{createPortal(<div className="battle-alerts hud-feed" aria-live="polite" aria-label="Battle alerts"><NetworkBattleStatus controller={view.app.network} online={state.session.kind==='online'}/><DefeatWarning snapshot={snapshot} variant="feed"/>{visible.map(row=>{
   const body=<><Icon id={row.icon}/><span className="alert-text">{row.text}{row.count>1&&<b className="alert-count"> ×{row.count}</b>}</span><small className="alert-age">{Math.max(0,Math.floor((now-row.tick)/20))}s</small>{row===latest&&jump&&<kbd aria-hidden="true">{shortcutBadgeLabel(jump)}</kbd>}</>;
   return row.position?<button key={row.id} type="button" className={`battle-alert ${row.priority}`} data-actionable="" aria-label={`${row.text}${row.count>1?` ×${row.count}`:''}. Centre camera`} onClick={()=>control.renderer?.center(row.position!)}>{body}</button>:<div key={row.id} className={`battle-alert ${row.priority}`}>{body}</div>;
  })}</div>,alertsHost)}
  <DiagnosticsOverlay view={view}/></>;
}
