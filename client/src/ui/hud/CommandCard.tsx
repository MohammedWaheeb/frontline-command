import type {KeyChord} from '../../runtime/keybindings';
import {COMMANDS,ABILITIES,STRATEGIC,credits} from '../../content/labels';
import {repairCommandHint} from '../../content/unit-guidance';
import {abilityIcon,operationIcon} from '../../content/icons';
import {shortcutAriaList} from '../shortcut-presentation';
import {sidebarQueueIntent} from '../sidebar-queue-intent';
import {SelectionSettingControl,ObserveSettingControl} from '../PlayerControls';
import {CardKey,EmptySocket} from './CardKey';
import {selectionCoverage,type CardSlot} from './tray-command-slots';
import type {BattleView} from './battle-view';

export {orderCommands} from './tray-command-slots';
/** Combat orders that read as odd on an unarmed selection: shown at reduced weight, never hidden (Go decides). */
const COMBAT=new Set(['attack_move','attack','force_fire','guard','aggressive','escort','patrol']);
const QUEUEABLE=new Set(['stop','hold','return']);
/** Short cost tab text ('1.2k') so the tab never collides with the keycap; the tooltip carries the exact figure. */
const compactCredits=(milli:number)=>{const value=milli/1000;return value>=1000?`${Number((value/1000).toFixed(1))}k`:String(value)};

/** Positional 4×3 command card (design-audit-hud §2.6/§3.3). In replays the same
 * element hosts the replay console. */
export function CommandCard({view}:{view:BattleView}){
 const {state,control,battle,replay,setCommandCue,commandGridRef,snapshot,catalog,faction,selected,readOnly,abilities}=view;
 if(replay)return <div ref={commandGridRef} className="command-grid replay-command-grid" role="group" aria-label="Replay console"/>;
 const {entries,pages,page,current}=control.commandCard();
 const busy=battle.pending||!!snapshot?.countdown,bindings=state.settings.bindings.keys;
 const unarmed=selected.length>0&&selected.every(entity=>!catalog.units.get(entity.type)?.weapon);
 const capable=(kind:string,type?:string)=>selectionCoverage(snapshot,battle.ids,battle.affordances,kind,type);
 const render=(slot:CardSlot,index:number)=>{
  const positional=bindings[`card_slot_${index+1}`],bound=(direct?:readonly KeyChord[])=>[...(positional??[]),...(direct??[])];
  if(slot.kind==='empty')return <EmptySocket key={slot.key}/>;
  if(slot.kind==='page')return <CardKey key={slot.key} className="card-page" icon={slot.label==='More'?'i-chevron-right':'i-chevron-left'} label={slot.label} tip={{title:slot.label==='More'?'More commands':'Back to main commands',hint:`Page ${slot.target+1} of ${pages.length}`}} keycap={positional?.[0]} ariaShortcuts={shortcutAriaList(positional)} disabled={readOnly||busy} onClick={()=>control.commandPage(slot.target)}/>;
  if(slot.kind==='setting')return <SelectionSettingControl key={slot.key} kind={slot.command} snapshot={snapshot} ids={battle.ids} advice={battle.affordances} disabled={readOnly||busy} bindings={bound(bindings[slot.command])} onCommand={index=>void control.command(slot.command,undefined,undefined,false,index)}/>;
  if(slot.kind==='observe')return <ObserveSettingControl key={slot.key} snapshot={snapshot} ids={battle.ids} advice={battle.affordances} disabled={readOnly||busy} bindings={bound(bindings[`ability_${abilities.indexOf('observe')+1}`])} onCommand={index=>void control.command('ability','observe',undefined,false,index)}/>;
  if(slot.kind==='rebase')return <CardKey key={slot.key} icon="i-aircraft" label="Rebase" keycap={bound(bindings.rebase)[0]} ariaShortcuts={shortcutAriaList(bound(bindings.rebase))} disabled={readOnly||busy} active={battle.target?.label==='Rebase'} tip={{title:'Rebase',hint:'Pick an owned airfield or drone service building with a free slot. Immediate; cannot be queued.'}} onClick={()=>void control.command('rebase')}/>;
  if(slot.kind==='barricade')return <CardKey key={slot.key} icon="i-building" label="Field barricade" cost="150" keycap={positional?.[0]} ariaShortcuts={shortcutAriaList(positional)} disabled={readOnly||busy} active={battle.target?.kind==='build'&&battle.target.type==='barrier'} tip={{title:'Field barricade',cost:'150 credits',hint:'Needs an active barracks. Place within 3 tiles of a selected rig or engineer, in sight.',detail:[capable('build','barrier')??'']}} onClick={()=>void control.command('build','barrier')}/>;
  if(slot.kind==='ability'){
   const type=slot.ability,strategic=type==='strategic',label=strategic?STRATEGIC[faction].label:ABILITIES[type]?.label??type,binding=bound(bindings[`ability_${abilities.indexOf(type)+1}`]);
   return <CardKey key={slot.key} className="ability-key" icon={strategic?operationIcon(faction):abilityIcon(type)} label={label} cost={strategic?compactCredits(STRATEGIC[faction].activationCost):undefined} keycap={binding?.[0]} ariaShortcuts={shortcutAriaList(binding)} disabled={readOnly||busy} active={battle.target?.kind==='ability'&&battle.target.type===type} tip={{title:label,cost:strategic?`${credits(STRATEGIC[faction].activationCost)} credits · full site charge`:undefined,hint:strategic?STRATEGIC[faction].hint:ABILITIES[type]?.hint,detail:[capable('ability',type)??'']}} onClick={()=>void control.command('ability',type)}/>;
  }
  const kind=slot.command,label=COMMANDS[kind],binding=bound(label.shortcut?bindings[label.shortcut]:undefined);
  return <CardKey key={slot.key} icon={label.icon} label={label.label} keycap={binding?.[0]} ariaShortcuts={busy?undefined:shortcutAriaList(binding)} disabled={readOnly||busy} active={battle.target?.kind===kind} quiet={unarmed&&COMBAT.has(kind)}
   tip={{title:label.label,hint:kind==='repair'?repairCommandHint(catalog,selected.map(entity=>entity.type)):label.hint,detail:[capable(kind)??'',QUEUEABLE.has(kind)?`${state.settings.bindings.modifiers.queue[0].toUpperCase()+state.settings.bindings.modifiers.queue.slice(1)}-click queues after current orders.`:'']}}
   onClick={event=>void control.command(kind,undefined,undefined,sidebarQueueIntent(kind,event,state.settings.bindings,control.modifiers.context))}/>;
 };
 return <><div ref={commandGridRef} className="command-grid" role="group" aria-label="Command card" data-hud="card" data-empty={selected.length?undefined:''} data-page={pages.length>1?`${page+1}/${pages.length}`:undefined} aria-busy={selected.length>0&&!entries.length||undefined}>{selected.length?current.map(render):null}</div>
  <div ref={setCommandCue} className="command-overflow" aria-hidden="true"><span className="more-above"/><span className="more-below"/></div></>;
}
