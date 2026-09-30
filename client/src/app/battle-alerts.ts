import type {Event} from '../protocol/frontline_pb';
import {EVENT_ALERTS,formatClock,type AlertStyle} from '../content/labels';

export interface BattleAlert {event:Event;style:AlertStyle;timestamp:string}
const priority:Record<AlertStyle['priority'],number>={critical:2,warning:1,info:0,success:0};
/** The operation clock and event id provide recency without adding an alert lifetime. */
function newer(left:Event,right:Event){return left.tick-right.tick||left.id-right.id}

/** One classification for visual alerts and Space. The bounded visual list favors
 * severity; Space retains the latest actionable location, irrespective of severity. */
export function selectBattleAlerts(events:readonly Event[]):{visible:BattleAlert[];latestActionable?:BattleAlert}{
 const alerts:BattleAlert[]=[];let latestActionable:BattleAlert|undefined;
 for(const event of events){
  const style=EVENT_ALERTS[event.kind]?.(event.value,event.text);if(!style)continue;
  const alert={event,style,timestamp:formatClock(event.tick)};alerts.push(alert);
  if(style.actionable&&event.position&&(!latestActionable||newer(event,latestActionable.event)>=0))latestActionable=alert;
 }
 return {visible:alerts.sort((left,right)=>priority[right.style.priority]-priority[left.style.priority]||newer(right.event,left.event)).slice(0,3),latestActionable};
}
