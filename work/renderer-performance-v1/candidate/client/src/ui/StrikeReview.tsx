import type {BattleController} from '../app/battle-controller';
import type {StrikeReviewState} from '../app/strike-review';
import {reason} from '../content/labels';
import './strike-review.css';
const estimate=(at:number,observed:number)=>`${((at-observed)/20).toFixed(1)}s`;
export function StrikeReview({review,control,tick}:{review:StrikeReviewState;control:BattleController;tick:number}){
 const age=review.observedTick===undefined?0:Math.max(0,tick-review.observedTick);
 return <section className="strike-review console" aria-label="Skybreaker strike review" aria-busy={review.phase==='loading'} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();control.cancel()}}}><header><span>STRATEGIC OPERATIONS</span><h2>Review Skybreaker</h2><p>{['West','East','North','South'][review.edge]} approach · Three impact points</p></header>
 {review.phase==='loading'?<p role="status">Preparing approach routes…</p>:review.phase==='unavailable'?<p role="alert">{reason(review.message,review.message)}</p>:<><p className="strike-review-note">Estimated timing from the reviewed game state. Aircraft may be delayed or lost; confirmation rechecks current conditions.</p><table><thead><tr><th>Target</th><th>Entry</th><th>Release</th><th>Impact</th></tr></thead><tbody>{review.plan!.routes.map((route,index)=><tr key={index}><th>{index+1}</th><td>{estimate(route.entry_at,review.observedTick!)}</td><td>{estimate(route.release_at,review.observedTick!)}</td><td>{estimate(route.impact_at,review.observedTick!)}</td></tr>)}</tbody></table><p className="strike-review-note">Squares mark entry. Triangles mark release. Circles show the reviewed blast areas. These are approach intentions, not live aircraft positions.</p><small>Review age: {(age/20).toFixed(1)}s · No strike has been ordered.</small></>}
 <div className="button-row"><button className="primary" disabled={review.phase!=='ready'} onClick={()=>void control.confirmStrike()}>Confirm strike</button><button onClick={()=>control.retargetStrike()}>Retarget</button><button onClick={()=>control.cancel()}>Cancel</button></div></section>;
}
