import {useState} from 'react';
import {createPortal} from 'react-dom';
import type {Entity,PlayerSnapshot} from '../runtime';
import type {CatalogIndex} from '../content/catalog';
import {actorStatus} from '../app/actor-status';
import {Modal} from './primitives';
import './actor-status-details.css';

/** Full readout of the same authorized model used by battlefield insignia.
 * The portal avoids clipping by the command tray; it sends no game commands. */
export function ActorStatusDetails({entity,snapshot,catalog}:{entity:Entity;snapshot:PlayerSnapshot;catalog:CatalogIndex}){
 const [open,setOpen]=useState(false),model=actorStatus(entity,snapshot,catalog);
 const state=entity.state.replaceAll('_',' '),name=catalog.name(entity.type),own=entity.owner===snapshot.player;
 return <><button className="unit-state unit-state-inspect" title={`Inspect ${name} status`} onClick={()=>setOpen(true)} aria-haspopup="dialog">{state}{own&&entity.private?.ambushReady?' · AMBUSH READY':''}{entity.deployed?' · DEPLOYED':''}{!entity.enabled?' · DISABLED':''}<span aria-hidden="true"> ›</span></button>
 {open&&createPortal(<Modal title="Unit status" onClose={()=>setOpen(false)}><section className="unit-status-readout" aria-label={`${name} field readout`}><header><span className="eyebrow">FIELD READOUT</span><h3>{name}</h3><p>{state}</p></header>
 {model.ammunition&&<p className="status-magazine"><span>{model.ammunition.label}</span><b>{model.ammunition.current}{model.ammunition.capacity!==undefined?` / ${model.ammunition.capacity}`:''}</b></p>}
 {model.channel&&<div className="status-channel"><p><span>{model.channel.label}</span><b>{model.channel.seconds}s</b></p><progress aria-label={model.channel.label} max={1000} value={model.channel.progress}/></div>}
 {!!model.badges.length&&<ul>{model.badges.map(badge=><li key={badge.id} className={`tone-${badge.tone}`}><span className="status-symbol" aria-hidden="true">{badge.symbol}</span><span>{badge.label}</span>{badge.seconds!==undefined&&<b>{badge.seconds}s</b>}</li>)}</ul>}
 {!model.badges.length&&!model.ammunition&&!model.channel&&<p className="muted">No additional status.</p>}
 </section></Modal>,document.body)}</>;
}
