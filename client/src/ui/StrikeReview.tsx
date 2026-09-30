import {useLayoutEffect,useRef} from 'react';
import type {BattleController} from '../app/battle-controller';
import type {StrikeReviewState} from '../app/strike-review';
import {reason} from '../content/labels';
import {resolveShortcut} from '../runtime';
import './strike-review.css';
const estimate=(at:number,observed:number)=>`${((at-observed)/20).toFixed(1)}s`;
export function StrikeReview({review,control,tick,escapeKey,escapeShortcut}:{review:StrikeReviewState;control:BattleController;tick:number;escapeKey?:string;escapeShortcut?:string}){
 const age=review.observedTick===undefined?0:Math.max(0,tick-review.observedTick),card=useRef<HTMLElement>(null);
 // Opening, and growing from loading to ready, scrolls the card into its column
 // without taking focus: the key handler below stops every key, so focus here
 // would silently suspend game hotkeys. `nearest` aligns a card taller than the
 // column by its top edge; the sticky decision row then holds the column bottom.
 useLayoutEffect(()=>{card.current?.scrollIntoView({block:'nearest',inline:'nearest'})},[review.phase]);
 return <section ref={card} className="strike-review console" aria-label="Skybreaker strike review" aria-busy={review.phase==='loading'} onKeyDown={event=>{event.stopPropagation();const focus=event.target instanceof HTMLElement?event.target:null,intent=resolveShortcut(event.nativeEvent,control.app.state.get().settings.bindings,{tagName:focus?.tagName,role:focus?.getAttribute('role')??undefined,isContentEditable:focus?.isContentEditable});if(intent?.action==='escape'){event.preventDefault();control.cancel()}}}><header><span>STRATEGIC OPERATIONS</span><h2>Review Skybreaker</h2><p>{['West','East','North','South'][review.edge]} approach · Three impact points</p></header>
 {review.phase==='loading'?<p role="status">Preparing approach routes…</p>:review.phase==='unavailable'?<p role="alert">{reason(review.message,review.message)}</p>:<><p className="strike-review-note">Estimated timing from the reviewed game state. Aircraft may be delayed or lost; confirmation rechecks current conditions.</p><table><thead><tr><th>Target</th><th>Entry</th><th>Release</th><th>Impact</th></tr></thead><tbody>{review.plan!.routes.map((route,index)=><tr key={index}><th>{index+1}</th><td>{estimate(route.entry_at,review.observedTick!)}</td><td>{estimate(route.release_at,review.observedTick!)}</td><td>{estimate(route.impact_at,review.observedTick!)}</td></tr>)}</tbody></table><p className="strike-review-note">Squares mark entry. Triangles mark release. Circles show the reviewed blast areas. These are approach intentions, not live aircraft positions.</p><small>Review age: {(age/20).toFixed(1)}s · No strike has been ordered.</small></>}
 <div className="button-row"><button className="primary" disabled={review.phase!=='ready'} onClick={()=>void control.confirmStrike()}>Confirm strike</button><button onClick={()=>control.retargetStrike()}>Retarget</button><button aria-keyshortcuts={escapeShortcut} onClick={()=>control.cancel()}>Cancel{escapeKey&&<kbd aria-hidden="true">{escapeKey}</kbd>}</button></div></section>;
}
