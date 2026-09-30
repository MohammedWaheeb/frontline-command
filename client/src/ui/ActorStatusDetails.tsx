import {useState} from 'react';
import {createPortal} from 'react-dom';
import type {Entity,PlayerSnapshot} from '../runtime';
import type {CatalogIndex} from '../content/catalog';
import {actorStatus} from '../app/actor-status';
import {unitGuidance} from '../content/unit-guidance';
import {Modal} from './primitives';
import './actor-status-details.css';

/** Full readout of the same authorized model used by battlefield insignia.
 * The portal avoids clipping by the command tray; it sends no game commands. */
export function ActorStatusDetails({entity,snapshot,catalog}:{entity:Entity;snapshot:PlayerSnapshot;catalog:CatalogIndex}){
 const [open,setOpen]=useState(false),model=actorStatus(entity,snapshot,catalog),guide=unitGuidance(catalog,entity.type);
 const state=entity.state.replaceAll('_',' '),name=catalog.name(entity.type),own=entity.owner===snapshot.player;
 return <><button className="unit-state unit-state-inspect" title={`Inspect ${name} status`} onClick={event=>{event.currentTarget.focus();setOpen(true)}} aria-haspopup="dialog">{state}{model.shahed?.committed?' · IMPACT LOCKED':''}{own&&entity.private?.ambushReady?' · AMBUSH READY':''}{entity.deployed?' · DEPLOYED':''}{!entity.enabled?' · DISABLED':''}<span aria-hidden="true"> ›</span></button>
 {open&&createPortal(<Modal title="Unit status" onClose={()=>setOpen(false)}><section className="unit-status-readout" aria-label={`${name} field readout`}><header><span className="eyebrow">FIELD READOUT</span><h3>{name}</h3><p>{state}</p></header>
 {guide&&<section aria-label="Unit role and counters" className="status-role"><h4>Role</h4><p>{guide.role}</p><h4>Targets</h4><p>{guide.targets}</p><h4>Counters</h4><p>{guide.counters}</p></section>}
 {model.shahed&&<section aria-label="One-way drone commitment" data-shahed-committed={model.shahed.committed}><h4>{model.shahed.label}</h4><p>{model.shahed.description}</p>{model.shahed.impact&&<p><span>Fixed ground impact point</span><b>{model.shahed.impact.x/1000}, {model.shahed.impact.y/1000} tiles</b></p>}</section>}
 {model.ammunition&&<p className="status-magazine"><span>{model.ammunition.label}</span><b>{model.ammunition.current}{model.ammunition.capacity!==undefined?` / ${model.ammunition.capacity}`:''}</b></p>}
 {model.ranges?.interception&&<section aria-label="Missile defense status" className="status-defense"><h4>Missile defense</h4><p><span>Protected impact radius</span><b>{model.ranges.interception.radius/1000} tiles</b></p><p><span>Defense</span><b>{!model.ranges.interception.active?'Inactive':model.ranges.interception.ready?'Ready':(entity.private?.charges??0)===0?'Empty magazine':'Firing interval'}</b></p><p><span>Next interceptor</span><b>{model.ranges.interception.nextChargeTicks!==undefined?`${(model.ranges.interception.nextChargeTicks/20).toFixed(1)}s`:(entity.private?.charges??0)>=model.ranges.interception.capacity?'Magazine full':'Recharge paused'}</b></p>{model.ranges.interception.nextChargeTicks!==undefined&&<><progress aria-label="Interceptor recharge" max={model.ranges.interception.rechargeRequired} value={Math.min(entity.private?.chargeWork??0,model.ranges.interception.rechargeRequired)}/><small>Time at the current recharge rate.</small></>}{model.ranges.interception.active&&(entity.private?.charges??0)>0&&model.ranges.interception.fireReadyAt>snapshot.tick&&<p><span>Can fire again</span><b>{((model.ranges.interception.fireReadyAt-snapshot.tick)/20).toFixed(1)}s</b></p>}<h4>Assignments</h4>{model.ranges.interception.assignments.length?<ul>{model.ranges.interception.assignments.map(assignment=><li key={assignment.projectile}><span>Missile #{assignment.projectile} · impact {Math.floor(assignment.impact.x/1000)}, {Math.floor(assignment.impact.y/1000)}</span><b>{((assignment.interceptAt-snapshot.tick)/20).toFixed(1)}s</b></li>)}</ul>:<p className="muted">No interceptor in flight.</p>}<small>Coverage protects impact points. It does not stop ordinary aircraft, bullets or bombs.</small></section>}
 {model.ranges&&<section aria-label="Observation and construction ranges" className="status-ranges"><h4>Field ranges</h4><p><span>Sight distance</span><b>{model.ranges.sightRadius/1000} tiles</b></p><p><span>Concealment detection</span><b>{model.ranges.detectionRadius/1000} tiles</b></p>{model.ranges.buildRadius>0&&<p><span>Build anchor radius</span><b>{model.ranges.buildRadius/1000} tiles</b></p>}<small>{model.ranges.airborneSight?'Airborne sight.':'Terrain can obstruct ground sight and detection.'}</small></section>}
 {model.channel&&<div className="status-channel"><p><span>{model.channel.label}</span><b>{model.channel.seconds}s</b></p><progress aria-label={model.channel.label} max={1000} value={model.channel.progress}/></div>}
 {!!model.badges.length&&<ul>{model.badges.map(badge=><li key={badge.id} className={`tone-${badge.tone}`}><span className="status-symbol" aria-hidden="true">{badge.symbol}</span><span>{badge.label}</span>{badge.seconds!==undefined&&<b>{badge.seconds}s</b>}</li>)}</ul>}
 {!model.badges.length&&!model.ammunition&&!model.channel&&!model.ranges&&!model.shahed&&<p className="muted">No additional status.</p>}
 </section></Modal>,document.body)}</>;
}
