// Revamped skirmish setup (beta UI revamp, Lane C). One screen, no page scroll at 1280×720:
// battlefield column (interactive map + picker) beside the commander table, quick setups and
// rules; START BATTLE lives in the shell's fixed footer (accessible name "Start battle").
import {useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import type {Application} from '../../../app/application';
import {useObservable} from '../../../app/store';
import {defaultBattlefields} from '../../../app/release-scope';
import {writeSkirmishMemory} from '../../../app/menu-memory';
import {STANDARD_STARTING_CREDITS} from '../../../app/starting-money';
import type {SkirmishFaction,SkirmishPreset,SkirmishSetup,SkirmishSlot} from '../../../app/skirmish-setup';
import type {LibraryMap} from '../../../runtime/content-library';
import type {Difficulty} from '../../../runtime/types';
import {FACTIONS} from '../../../content/labels';
import {Emblem} from '../../primitives';
import {MapSurface,type MapSpawnMarker} from '../../network/map-preview';
import {Button,ColorSwatchPicker,EmptyState,FooterActionBar,KitIcon,MapThumb,MapThumbStrip,Select,SlotCell,SlotRow,SlotTable,type SlotColumn} from '../kit';
import {useMapGeometry,mapFacts} from './use-map-geometry';
import {CREDIT_CHOICES,DIFFICULTIES,DIFFICULTY_COPY,SKIRMISH_FACTIONS,addAI,applyPreset,colorCSS,colorName,compass,creditsLabel,factionName,fitToMap,initialSetup,inkOn,matchFormat,parseCreditsDraft,removeSlot,setColor,setSpawn,setupProblem,slotLabel,updateSlot,type PaletteScheme} from './skirmish-model';
import '../../../styles/skirmish.css';

const thumbURL=(id:string)=>`/art/maps/${id.replace(/-/g,'_')}/preview-256.png`;
const PRESETS:ReadonlyArray<{id:SkirmishPreset;label:string;hint:string;players:number}>=[
 {id:'1v1',label:'1 v 1',hint:'You against one AI commander',players:2},
 {id:'2v2',label:'2 v 2 · AI ally',hint:'You and an allied AI against two AI commanders',players:4},
 {id:'ffa',label:'Free-for-all',hint:'Four commanders, every one for themselves',players:4},
];

/** Measured width and usable height of the screen; layout steps and the map size follow --fc-ui-scale. */
function useScreenMetrics(ready:boolean){
 const root=useRef<HTMLDivElement>(null),[metrics,setMetrics]=useState({width:1200,height:640});
 useLayoutEffect(()=>{
  const node=root.current;if(!node)return;
  const measure=()=>{
   let parent=node.parentElement;while(parent&&!/(auto|scroll)/.test(getComputedStyle(parent).overflowY))parent=parent.parentElement;
   const top=node.getBoundingClientRect().top+(parent?.scrollTop??0),bottom=parent?parent.getBoundingClientRect().bottom-parseFloat(getComputedStyle(parent).paddingBottom||'0'):window.innerHeight;
   setMetrics(current=>{const next={width:node.clientWidth,height:Math.max(240,Math.round(Math.min(window.innerHeight,bottom)-top))};return current.width===next.width&&current.height===next.height?current:next});
  };
  measure();const observer=new ResizeObserver(measure);observer.observe(node);if(node.parentElement)observer.observe(node.parentElement);window.addEventListener('resize',measure);
  return()=>{observer.disconnect();window.removeEventListener('resize',measure)};
 },[ready]);
 return {root,...metrics};
}
/** Three zones when wide (picker · map · commanders), two when medium, stacked when narrow. */
function screenLayout(width:number,height:number,s:number){
 const gap=18*s;
 if(width>=(196+340+600)*s+gap*2){const map=Math.max(300*s,Math.min(height-104*s,width-216*s-600*s-gap*2,760*s));return {layout:'wide' as const,map}}
 if(width>=(280+560)*s+gap){const map=Math.max(240*s,Math.min(height-120*s,width-560*s-gap,600*s));return {layout:'split' as const,map}}
 return {layout:'stack' as const,map:Math.min(180*s,width*0.4)};
}

function FactionMark({faction}:{faction:SkirmishFaction}){
 return faction==='random'?<span className="sk-emblem sk-emblem--random" aria-hidden="true">?</span>:<span className="sk-emblem" aria-hidden="true"><Emblem faction={faction}/></span>;
}

export function SkirmishScreen({app}:{app:Application}){
 const state=useObservable(app.state),maps=useMemo(()=>defaultBattlefields(state.index?.maps??[]) as LibraryMap[],[state.index]);
 const palette:PaletteScheme=state.settings.palette==='cvd_safe'?'cvd_safe':'standard',scale=state.settings.uiScale||1;
 const [setup,setSetup]=useState<SkirmishSetup|undefined>(()=>initialSetup(app.lastSkirmish(),maps));
 useEffect(()=>{if(!setup&&maps.length)setSetup(initialSetup(app.lastSkirmish(),maps))},[maps,setup,app]);
 const initialCustom=!!setup&&!(CREDIT_CHOICES as readonly number[]).includes(setup.startingCredits);
 const [customCredits,setCustomCredits]=useState(initialCustom),[creditsDraft,setCreditsDraft]=useState(String(setup?.startingCredits??STANDARD_STARTING_CREDITS));
 const [active,setActive]=useState(1),[notice,setNotice]=useState(''),[failedThumbs,setFailedThumbs]=useState<ReadonlySet<string>>(new Set());
 const entry=maps.find(map=>map.id===setup?.mapID)??maps[0],geometry=useMapGeometry(entry?.url),map=geometry.map;
 const credits=customCredits?parseCreditsDraft(creditsDraft):setup?.startingCredits;
 const problem=setupProblem(setup,credits,entry?.players);
 const {root,width,height}=useScreenMetrics(!!setup&&maps.length>0),{layout,map:mapSize}=screenLayout(width,height,scale),short=layout!=='stack'&&height<(430+(setup?.slots.length??2)*52)*scale;

 // Thumbnails are optional art: probe once and fall back to monograms when missing.
 useEffect(()=>{let live=true;for(const map of maps){const image=new Image();image.onerror=()=>{if(live)setFailedThumbs(current=>new Set(current).add(map.id))};image.src=thumbURL(map.id)}return()=>{live=false}},[maps]);
 // Remember the table as it is edited (validated by the client-logic mirror), not only on launch.
 useEffect(()=>{if(!setup||credits===undefined||problem)return;const timer=window.setTimeout(()=>writeSkirmishMemory({...setup,startingCredits:credits}),250);return()=>window.clearTimeout(timer)},[setup,credits,problem]);
 useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(''),6000);return()=>window.clearTimeout(timer)},[notice]);
 useEffect(()=>{if(setup&&!setup.slots.some(slot=>slot.id===active))setActive(1)},[setup,active]);

 if(!maps.length||!setup||!entry)return <EmptyState icon="i-map" title="No battlefields installed" action={<Button icon="i-refresh" onClick={()=>void app.task('Reading content index…',()=>app.reloadContent())}>Retry content</Button>}>The installed content index lists no skirmish battlefields.</EmptyState>;

 const busy=!!state.busy,slots=setup.slots,players=Math.min(entry.players,4),starts=map?.spawns.length??entry.players;
 const edit=(next:SkirmishSetup)=>setSetup(next);
 const chooseMap=(id:string)=>{const target=maps.find(map=>map.id===id);if(!target||target.id===setup.mapID)return;const fitted=fitToMap(setup,target.id,target.players);if(fitted.removed)setNotice(`${target.title} holds ${target.players} commanders · removed ${fitted.removed} AI ${fitted.removed>1?'commanders':'commander'}.`);edit(fitted.setup)};
 const cycleMap=(step:number)=>{const index=maps.findIndex(map=>map.id===entry.id);chooseMap(maps[(index+step+maps.length)%maps.length].id)};
 const preset=(id:SkirmishPreset)=>{const spawnTeams=map?.spawns.map(spawn=>spawn.team);edit(applyPreset(setup,id,spawnTeams));setActive(1)};
 const matches=(id:SkirmishPreset)=>{const teams=slots.map(slot=>slot.team).join(',');return id==='1v1'?slots.length===2&&new Set(slots.map(slot=>slot.team)).size===2:id==='2v2'?slots.length===4&&teams===`${slots[0].team},${slots[0].team},${slots[2].team},${slots[2].team}`&&slots[0].team!==slots[2].team:slots.length===4&&new Set(slots.map(slot=>slot.team===0?`n${slot.id}`:slot.team)).size===4};
 const activeSlot=slots.find(slot=>slot.id===active)??slots[0];
 const who=(slot:SkirmishSlot)=>slot.id===1?'you':`${slotLabel(slot)} (commander ${slot.id})`,whom=(slot:SkirmishSlot)=>slot.id===1?'yourself':who(slot);

 const markers:MapSpawnMarker[]|undefined=map?.spawns.map((spawn,index)=>{
  const number=index+1,holder=slots.find(slot=>slot.spawn===number),where=compass(spawn.position.x,spawn.position.y,map.width,map.height);
  if(holder){const css=colorCSS(palette,holder.color);return {state:'claimed',text:holder.id===1?'★':String(holder.id),color:css,ink:inkOn(css),current:holder.id===activeSlot.id,label:`Start ${number}, ${where}: ${who(holder)}${holder.id===activeSlot.id?' · click to set Automatic':` · click to move ${whom(activeSlot)} here`}`}}
  return {state:'open',text:String(number),current:false,pulse:activeSlot.spawn===0,label:`Start ${number}, ${where}: open · click to place ${whom(activeSlot)}`};
 });
 const automatic=slots.filter(slot=>slot.spawn===0).length;
 const facts=map?mapFacts(map):undefined;
 const mapLabel=`${entry.title} map preview, ${map?.spawns.length??entry.players} starting positions`+(map?'. '+slots.map(slot=>{const spawn=slot.spawn&&map.spawns[slot.spawn-1];return `${slot.id===1?'You':slotLabel(slot)}: ${spawn?`start ${slot.spawn}, ${compass(spawn.position.x,spawn.position.y,map.width,map.height)}`:'automatic start'}`}).join('; '):'');

 const columns:SlotColumn[]=[
  {id:'n',label:'#',width:'calc(38px * var(--fc-ui-scale))',align:'center'},
  {id:'who',label:'Commander',width:'minmax(calc(118px * var(--fc-ui-scale)),1fr)'},
  {id:'faction',label:'Faction',width:'minmax(calc(158px * var(--fc-ui-scale)),1.35fr)'},
  {id:'team',label:'Team',width:'calc(64px * var(--fc-ui-scale))'},
  {id:'color',label:'Color',width:'calc(60px * var(--fc-ui-scale))',align:'center'},
  {id:'start',label:'Start',width:'calc(78px * var(--fc-ui-scale))'},
  {id:'x',label:'Remove',width:'calc(34px * var(--fc-ui-scale))',srOnly:true,align:'center'},
 ];
 const taken=(slot:SkirmishSlot)=>slots.filter(other=>other.id!==slot.id).map(other=>other.color);

 const table=<SlotTable label="Commanders" columns={columns} className="sk-slots">
  {slots.map(slot=>{const css=colorCSS(palette,slot.color),you=slot.id===1,current=slot.id===activeSlot.id;
   return <SlotRow key={slot.id} teamColor={css} self={you} selected={current} className="sk-slot" onFocusRow={()=>setActive(slot.id)}>
    <SlotCell align="center" header><button type="button" className={`sk-slot-pick${current?' is-current':''}`} aria-pressed={current} aria-label={`Place ${whom(slot)} on the map`} title="Select, then click a start on the map" onClick={()=>setActive(slot.id)}><span>{you?'★':slot.id}</span></button></SlotCell>
    <SlotCell>{you?<span className="sk-you"><strong>You</strong><small>{slot.name}</small></span>:<Select<Difficulty> density="sm" aria-label={`Commander ${slot.id} difficulty`} value={slot.difficulty??'normal'} disabled={busy} onChange={value=>edit(updateSlot(setup,slot.id,{difficulty:value}))} options={DIFFICULTIES.map(value=>({value,label:`AI · ${DIFFICULTY_COPY[value].label}`}))}/>}</SlotCell>
    <SlotCell><span className="sk-faction"><FactionMark faction={slot.faction}/><Select<SkirmishFaction> density="sm" aria-label={`Commander ${slot.id} faction`} value={slot.faction} disabled={busy} onChange={value=>edit(updateSlot(setup,slot.id,{faction:value}))} options={[{value:'random' as SkirmishFaction,label:'Random'},...SKIRMISH_FACTIONS.map(value=>({value:value as SkirmishFaction,label:FACTIONS[value].name}))]}/></span></SlotCell>
    <SlotCell><Select density="sm" aria-label={`Commander ${slot.id} team`} value={String(slot.team)} disabled={busy} onChange={value=>edit(updateSlot(setup,slot.id,{team:Number(value)}))} options={[{value:'0',label:'—'},...[1,2,3,4].map(team=>({value:String(team),label:String(team)}))]} title={slot.team===0?'No team: fights everyone':`Team ${slot.team}`}/></SlotCell>
    <SlotCell align="center" className="sk-cell-color"><span className="sk-color"><ColorSwatchPicker variant="popover" label={`Commander ${slot.id} color`} value={slot.color} palette={palette} taken={taken(slot)} disabled={busy} onChange={color=>edit(setColor(setup,slot.id,color))}/></span></SlotCell>
    <SlotCell><Select density="sm" aria-label={`Commander ${slot.id} start position`} value={String(slot.spawn)} disabled={busy} onChange={value=>edit(setSpawn(setup,slot.id,Number(value),false,starts))} options={[{value:'0',label:'Auto'},...Array.from({length:starts},(_,index)=>({value:String(index+1),label:String(index+1)}))]} title={slot.spawn===0?'Automatic: a free start is drawn at launch':`Start position ${slot.spawn}`}/></SlotCell>
    <SlotCell align="center">{!you&&slots.length>2?<button type="button" className="sk-remove" aria-label={`Remove ${slotLabel(slot)} (commander ${slot.id})`} title="Remove commander" disabled={busy} onClick={()=>edit(removeSlot(setup,slot.id))}><KitIcon id="i-close"/></button>:null}</SlotCell>
   </SlotRow>})}
  {slots.length<players?<div role="row" className="sk-add-row"><div role="cell" className="sk-add-cell"><button type="button" className="sk-add" disabled={busy} onClick={()=>{const next=addAI(setup,players);edit(next);setActive(next.slots.length)}}><KitIcon id="i-users"/><span>Add AI commander</span><small>{slots.length} of {players}</small></button></div></div>:null}
 </SlotTable>;

 const detail=activeSlot.difficulty
  ?<><FactionMark faction={activeSlot.faction}/><p><strong>{DIFFICULTY_COPY[activeSlot.difficulty].label} AI</strong> {DIFFICULTY_COPY[activeSlot.difficulty].description}</p></>
  :<><FactionMark faction={activeSlot.faction}/><p><strong>{factionName(activeSlot.faction)}</strong> {activeSlot.faction==='random'?'A faction is drawn when the battle starts.':FACTIONS[activeSlot.faction].doctrine+'.'}</p></>;

 // Line-up: who fights whom, grouped by team (No team = a side of one). Shape + text, not colour alone.
 const sidesList=(()=>{const groups:{key:string;title:string;members:SkirmishSlot[]}[]=[];for(const slot of slots){const key=slot.team===0?`solo-${slot.id}`:`team-${slot.team}`;let group=groups.find(item=>item.key===key);if(!group){group={key,title:slot.team===0?'No team':`Team ${slot.team}`,members:[]};groups.push(group)}group.members.push(slot)}return groups})();
 const lineup=<section className="sk-lineup" aria-label="Line-up">
  {sidesList.map((side,index)=><div key={side.key} className="sk-lineup-group">
   {index>0&&<span className="sk-vs" aria-hidden="true">VS</span>}
   <div className={`sk-side${side.members.some(slot=>slot.id===1)?' is-own':''}`} aria-label={`${side.title}: ${side.members.map(slot=>`${slot.id===1?'You':slotLabel(slot)}, ${factionName(slot.faction)}, ${colorName(palette,slot.color)}`).join('; ')}`} role="group">
    <span className="sk-side-title">{side.title}{side.members.some(slot=>slot.id===1)?<em>Your side</em>:null}</span>
    {side.members.map(slot=>{const css=colorCSS(palette,slot.color);return <span key={slot.id} className="sk-side-member"><i className="sk-chip" style={{background:css,color:inkOn(css)}} aria-hidden="true">{slot.id===1?'★':slot.id}</i><FactionMark faction={slot.faction}/><span className="sk-side-name">{slot.id===1?'You':slotLabel(slot)}</span><small>{slot.faction==='random'?'Random':FACTIONS[slot.faction].short}</small></span>})}
   </div>
  </div>)}
 </section>;

 const creditsValue=customCredits?'custom':String(setup.startingCredits);
 const rules=<div className="sk-rules">
  <div className="sk-rule">
   <label className="sk-rule-label" htmlFor="sk-credits">Starting credits</label>
   <Select id="sk-credits" density="sm" aria-label="Starting credits" value={creditsValue} disabled={busy} onChange={value=>{if(value==='custom'){setCustomCredits(true);setCreditsDraft(String(setup.startingCredits))}else{setCustomCredits(false);edit({...setup,startingCredits:Number(value)})}}} options={[...CREDIT_CHOICES.map(value=>({value:String(value),label:creditsLabel(value)})),{value:'custom',label:'Custom…'}]}/>
   {customCredits&&<input className="sk-credits-input" aria-label="Custom starting credits" inputMode="numeric" value={creditsDraft} disabled={busy} aria-invalid={credits===undefined||undefined} aria-describedby="sk-credits-note" onChange={event=>{setCreditsDraft(event.target.value);const value=parseCreditsDraft(event.target.value);if(value!==undefined)setSetup(current=>current&&{...current,startingCredits:value})}}/>}
  </div>
  <p id="sk-credits-note" className={`sk-rule-note${credits===undefined?' is-error':''}`}>{credits===undefined?'Enter 1 to 1,000,000 whole credits.':credits===STANDARD_STARTING_CREDITS?'Standard rules · every commander starts equal.':'Custom credits · results are unranked.'}</p>
 </div>;

 const summary=<span className="sk-summary"><b>{entry.title}</b><span>{matchFormat(slots)}</span><span>{credits!==undefined?`${credits.toLocaleString('en-US')} credits`:'—'}</span><span>{credits===STANDARD_STARTING_CREDITS?'Standard rules':'Custom · unranked'}</span></span>;

 return <div ref={root} className={`sk-screen sk-layout-${layout}`} data-layout={layout} style={{'--sk-map':`${Math.round(mapSize)}px`} as CSSProperties}>
  <div className="sk-body">
   <nav className="sk-picker" aria-label="Battlefields">
    <span className="sk-eyebrow sk-picker-head">Battlefields<b>{maps.length}</b></span>
     <MapThumbStrip label="Choose battlefield" className="sk-thumbs">
     {maps.map(map=><MapThumb key={map.id} label={`${map.title}, ${map.players} players`} selected={map.id===entry.id} disabled={busy} onSelect={()=>chooseMap(map.id)} image={failedThumbs.has(map.id)?undefined:thumbURL(map.id)} caption={<><span>{map.title}</span><b>{map.players} players</b></>}><span className="sk-thumb-mono">{map.title.split(' ').map(word=>word[0]).join('')}</span></MapThumb>)}
     </MapThumbStrip>
   </nav>
   <section className="sk-map" aria-label="Battlefield map">
    <div className="sk-map-head">
     <button type="button" className="sk-cycle" aria-label="Previous battlefield" disabled={busy} onClick={()=>cycleMap(-1)}><KitIcon id="i-chevron-left"/></button>
     <label className="sk-map-select"><span className="sk-eyebrow">Battlefield</span><select aria-label="Battlefield" value={entry.id} disabled={busy} onChange={event=>chooseMap(event.target.value)}>{maps.map(map=><option key={map.id} value={map.id}>{map.title}</option>)}</select></label>
     <button type="button" className="sk-cycle" aria-label="Next battlefield" disabled={busy} onClick={()=>cycleMap(1)}><KitIcon id="i-chevron-right"/></button>
    </div>
    <div className="sk-map-stage">
     <MapSurface className="sk-map-surface" map={map} markers={markers} onSpawn={busy?undefined:spawn=>edit(setSpawn(setup,activeSlot.id,spawn,true,starts))} label={mapLabel} status={geometry.error?'Preview unavailable · the battle still loads normally':undefined}/>
     <p className="sk-map-hint" aria-live="polite"><KitIcon id="i-spawn"/>{activeSlot.spawn?<span><strong>{activeSlot.id===1?'You start':`${slotLabel(activeSlot)} starts`}</strong> at <b>{activeSlot.spawn}</b>. Click another start to move{activeSlot.id===1?'':' it'}.</span>:<span>Click a start to place <strong>{activeSlot.id===1?'yourself':slotLabel(activeSlot)}</strong>{automatic>1?' · or leave it on Auto':''}.</span>}</p>
    </div>
    <ul className="sk-facts" aria-label="Battlefield facts">
     {facts?<><li>{facts.size}</li><li><i className="sk-key sk-key--field" aria-hidden="true"/>{facts.fields} supply fields</li>{facts.stations>0&&<li><i className="sk-key sk-key--station" aria-hidden="true"/>{facts.stations} stations</li>}<li><i className="sk-key sk-key--shipment" aria-hidden="true"/>Shipment</li>{facts.tags.map(tag=><li key={tag}>{tag}</li>)}</>:null}
    </ul>
   </section>
   <section className="sk-command" aria-label="Commanders and rules">
    <header className="sk-section-head">
     <h3>Commanders</h3>
     <div className="sk-presets" role="group" aria-label="Quick setup">
      <span className="sk-eyebrow">Quick setup</span>
      {PRESETS.map(item=>{const unavailable=players<item.players;return <button key={item.id} type="button" className={`sk-preset${matches(item.id)?' is-match':''}`} aria-pressed={matches(item.id)} aria-describedby={unavailable?'sk-preset-note':undefined} disabled={busy||unavailable} title={unavailable?`${item.hint}. Needs a 4-player battlefield.`:item.hint} onClick={()=>preset(item.id)}>{item.label}</button>})}
     </div>
    </header>
    {players<4&&<p id="sk-preset-note" className="sk-rule-note">2 v 2 and Free-for-all need a 4-player battlefield. Choose one from Battlefields to use these setups.</p>}
    {notice&&<p className="sk-notice" role="status"><KitIcon id="i-info"/>{notice}</p>}
    {table}
    <div className="sk-detail" aria-live="polite">{detail}</div>
    {!short&&lineup}
    <header className="sk-section-head sk-section-head--rules"><h3>Rules</h3></header>
    {rules}
    <p className="sk-practice"><span>Training alone?</span><button type="button" className="sk-link" onClick={()=>app.patch({page:'practice'})}>Open the Practice range<KitIcon id="i-chevron-right"/></button></p>
   </section>
  </div>
  <FooterActionBar className="sk-footer" summary={summary} disabledReason={busy?undefined:problem} onBack={()=>app.patch({page:'command'})}
   primary={{label:'Start battle',icon:'i-attack',disabled:busy||!!problem,busy:busy&&state.session.phase==='loading',onClick:()=>{if(!problem&&credits!==undefined)void app.launchSkirmish({...setup,startingCredits:credits})}}}/>
 </div>;
}
