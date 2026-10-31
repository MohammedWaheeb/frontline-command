// Lobby (Lane E): per-slot table, battlefield with start markers, rules, chat, ready/start bar,
// deploy countdown and the completed-match results/rematch state. Every write goes through the
// existing NetworkController guards; the Go host remains the authority for admission and rules.
import {useEffect,useRef,useState} from 'react';
import {canRejoinOperation,lobbyAIBlockReason,networkErrorMessage,type NetworkController,type NetworkLobby,type NetworkLobbySlot,type NetworkState} from '../../app/network-controller';
import {hasStandardLobbyStartingCredits,lobbyStartingMoneySummary} from '../../app/starting-money';
import {FACTIONS,formatClock} from '../../content/labels';
import type {Difficulty,Faction} from '../../runtime/types';
import type {TeamPaletteScheme} from '../../design/team-colors';
import {Emblem} from '../primitives';
import {KitIcon as Icon} from '../menu/kit/icon';
import {LobbyStartingMoney} from './LobbyStartingMoney';
import {LobbyMap} from './LobbyMap';
import {ChatPanel,NetworkMatchPanel} from './MatchPanel';
import {Invitations,RemovedBanner} from './MultiplayerLanding';
import {AI_HELP,InviteCode,Readiness,colorCss,difficulties,factions,lobbyBattlefields,lobbyCapacity,modeLabel,title} from './kit';
import {SlotCell,SlotNumber,SlotRow,SlotTable,type SlotColumn} from '../menu/kit/SlotTable';
import {Select} from '../menu/kit/Field';
import {ColorSwatchPicker} from '../menu/kit/ColorSwatchPicker';
import {FooterActionBar} from '../menu/kit/screen';

type Common={controller:NetworkController;state:NetworkState;palette:TeamPaletteScheme};
type Change={faction?:Faction;team?:number;color?:number;difficulty?:Difficulty};

function RowMenu({controller,state,slot,host,forming,own}:{controller:NetworkController;state:NetworkState;slot:NetworkLobbySlot;host:boolean;forming:boolean;own:boolean}){
 const canRemove=host&&forming&&!own&&!slot.script,social=!!slot.profile&&!own;if(!canRemove&&!social)return null;
 const busy=!!state.busy;
 return <details className="mp-row-menu"><summary aria-label={`Commander ${slot.player} options`} title="Commander options"><span aria-hidden="true">⋯</span></summary><div className="mp-menu" role="group" aria-label={`${slot.name} options`}>
  {social&&<><button disabled={busy} onClick={()=>void controller.social(slot.profile!,'request')}>Request friendship</button><button disabled={busy} onClick={()=>void controller.social(slot.profile!,'mute')}>Mute commander</button><button disabled={busy} onClick={()=>void controller.social(slot.profile!,'block')}>Block commander</button></>}
  {canRemove&&<button className="danger network-remove" disabled={busy} onClick={()=>void controller.removeSlot(slot.player)} aria-label={`Remove commander ${slot.player}`}>Remove from lobby</button>}
 </div></details>;
}

const factionOptions=(random:boolean)=>[...(random?[{value:'random',label:'Random faction'}]:[]),...factions.map(value=>({value:value as string,label:FACTIONS[value].name}))];
const teamOptions=(auto:boolean)=>[...(auto?[{value:'0',label:'Auto'}]:[]),...[1,2,3,4].map(team=>({value:String(team),label:`Team ${team}`}))];
const difficultyOptions=(suffix:string)=>difficulties.map(value=>({value:value as string,label:`${title(value)}${suffix}`}));

function SlotRowView({controller,state,lobby,slot,host,own,forming,palette,spawns,spawnEditable,showStart,outcome}:Common&{lobby:NetworkLobby;slot:NetworkLobbySlot;host:boolean;own:boolean;forming:boolean;spawns:number;spawnEditable:boolean;showStart:boolean;outcome?:string}){
 const busy=!!state.busy,editable=forming&&(own||host&&!!slot.ai)&&!slot.script,locked=!!lobby.scenario_id;
 const change=(value:Change)=>slot.ai?controller.changeAI(slot.player,value):controller.changeLobby(value);
 const others=lobby.slots.filter(row=>row.player!==slot.player),takenSpawns=new Set(others.map(row=>row.spawn));
 const teamLocked=!editable||locked||lobby.mode==='ffa'||lobby.mode==='1v1'||busy;
 return <SlotRow teamColor={colorCss(slot.color,palette)} self={own} className={`network-commander mp-slot ${own?'own':''}`}>
  <SlotCell align="center" header><SlotNumber value={slot.player}/></SlotCell>
  <SlotCell className="network-commander-name mp-slot-who"><Emblem faction={slot.faction}/><span className="mp-who"><strong>{slot.name}{own&&<span className="mp-you">You</span>}{slot.profile===lobby.host&&<span className="mp-host-tag">Host</span>}</strong>
   {slot.ai&&!slot.script&&editable?<Select density="sm" aria-label={`Commander ${slot.player} difficulty`} title={AI_HELP} value={slot.ai} disabled={busy} onChange={value=>void change({difficulty:value as Difficulty})} options={difficultyOptions(' AI')}/>
   :<small>{slot.script?'Scenario opponent':slot.ai?`${title(slot.ai)} AI`:'Human commander'}</small>}</span></SlotCell>
  <SlotCell><Select density="sm" aria-label={`Commander ${slot.player} faction`} value={slot.faction} disabled={!editable||locked||busy} onChange={value=>void change({faction:value as Faction})} options={factionOptions(false)}/></SlotCell>
  <SlotCell><Select density="sm" aria-label={`Commander ${slot.player} team`} value={String(slot.team)} disabled={teamLocked} onChange={value=>void change({team:Number(value)})} options={teamOptions(false)}/></SlotCell>
  <SlotCell align="center"><ColorSwatchPicker variant="popover" label={`Commander ${slot.player} color`} value={slot.color} palette={palette} taken={others.map(row=>row.color)} disabled={!editable||busy} onChange={color=>void change({color})}/></SlotCell>
  <SlotCell optional={!showStart}>{slot.spawn!==undefined&&spawns>0?<Select density="sm" aria-label={`Commander ${slot.player} start`} value={String(slot.spawn)} disabled={!editable||!spawnEditable||busy} onChange={value=>void controller.changeSpawn(Number(value),slot.player)} options={[...(slot.spawn===0?[{value:'0',label:'Auto'}]:[]),...Array.from({length:spawns},(_,index)=>({value:String(index+1),label:String(index+1),disabled:takenSpawns.has(index+1)}))]} title={slot.spawn?`Start position ${slot.spawn}`:'A free start is chosen at launch'}/>:<span className="mp-static">Auto</span>}</SlotCell>
  <SlotCell>{outcome?<span className="mp-outcome" data-outcome={outcome}>{outcome==='won'?<><Icon id="i-trophy"/>Won</>:outcome==='lost'?'Lost':'Draw'}</span>:<Readiness ready={slot.ready} assets={slot.assets_ready}/>}</SlotCell>
  <SlotCell align="center"><RowMenu controller={controller} state={state} slot={slot} host={host} forming={forming} own={own}/></SlotCell>
 </SlotRow>;
}

function AddAIRow({controller,state,lobby,player,showStart}:{controller:NetworkController;state:NetworkState;lobby:NetworkLobby;player:number;showStart:boolean}){
 const [difficulty,setDifficulty]=useState<Difficulty>('normal'),[faction,setFaction]=useState<Faction|'random'>('random'),[team,setTeam]=useState(0);
 const scenario=!!lobby.scenario_id,submit=()=>void controller.addAI({difficulty,...(scenario?{}:{faction,...(team&&lobby.mode!=='ffa'?{team}:{})})});
 return <SlotRow state="open" className="network-ai-add mp-slot mp-slot-add">
  <SlotCell align="center" header><SlotNumber value={player}/></SlotCell>
  <SlotCell className="mp-slot-who"><span className="mp-open-mark" aria-hidden="true">+</span><Select density="sm" aria-label="Add AI difficulty" title={AI_HELP} value={difficulty} onChange={value=>setDifficulty(value as Difficulty)} options={difficultyOptions(' AI')}/></SlotCell>
  <SlotCell><Select density="sm" aria-label="Add AI faction" disabled={scenario} value={faction} onChange={value=>setFaction(value as Faction|'random')} options={factionOptions(true)}/></SlotCell>
  <SlotCell>{!scenario&&lobby.mode!=='ffa'?<Select density="sm" aria-label="Add AI team" value={String(team)} onChange={value=>setTeam(Number(value))} options={teamOptions(true)}/>:<span className="mp-static">{lobby.mode==='ffa'?'Own':'Fixed'}</span>}</SlotCell>
  <SlotCell align="center"><span className="mp-static">Auto</span></SlotCell>
  <SlotCell optional={!showStart}><span className="mp-static">Auto</span></SlotCell>
  <SlotCell className="mp-add-cell"><button type="button" className="mp-add" aria-label="Add AI commander" disabled={!!state.busy} onClick={submit}><Icon id="i-users"/>Add AI</button></SlotCell>
  <SlotCell/>
 </SlotRow>;
}

function LobbySlots({controller,state,palette,completed}:Common&{completed:boolean}){
 const lobby=state.lobby!,profile=state.account?.profile?.id,host=lobby.host===profile,forming=state.lobbyState==='forming';
 const map=state.maps.find(value=>value.id===lobby.map_id),capacity=lobbyCapacity(lobby.mode,map?.players,lobby.slots.length),spawns=map?.players??capacity;
 const spawnEditable=!lobby.scenario_id&&!lobby.rated,showStart=lobby.slots.some(slot=>slot.spawn!==undefined);
 const open=forming&&!lobby.scenario_id?Math.max(0,capacity-lobby.slots.length):0,canAdd=forming&&host&&lobby.slots.length<4&&!lobby.rated;
 const winning=state.result?.outcome?.winningTeam,draw=state.result?.outcome?.draw,outcome=(slot:NetworkLobbySlot)=>!completed||!state.result||state.result.void?undefined:draw?'draw':slot.team===winning?'won':'lost';
 const s=(px:number)=>`calc(${px}px * var(--fc-ui-scale))`;
 const columns:SlotColumn[]=[
  {id:'n',label:'#',width:s(38),align:'center'},
  {id:'who',label:'Commander',width:'minmax(0,1.5fr)'},
  {id:'faction',label:'Faction',width:'minmax(0,1.2fr)'},
  {id:'team',label:'Team',width:s(86)},
  {id:'color',label:'Color',width:s(60),align:'center'},
  {id:'start',label:'Start',width:s(66),optional:!showStart},
  {id:'status',label:completed?'Result':'Status',width:s(92)},
  {id:'more',label:'Options',srOnly:true,width:s(36),align:'center'},
 ];
 return <SlotTable label="Lobby commanders" columns={columns} className={`network-roster mp-slots ${showStart?'':'mp-no-start'}`}>
  {lobby.slots.map(slot=><SlotRowView key={slot.player} controller={controller} state={state} palette={palette} lobby={lobby} slot={slot} host={host} own={slot.profile===profile} forming={forming} spawns={spawns} spawnEditable={spawnEditable} showStart={showStart} outcome={outcome(slot)}/>)}
  {Array.from({length:open},(_,index)=>{const player=lobby.slots.length+index+1;return canAdd&&index===0?<AddAIRow key="add" controller={controller} state={state} lobby={lobby} player={player} showStart={showStart}/>
   :<SlotRow key={player} state="open" className="mp-slot mp-slot-open"><SlotCell align="center" header><SlotNumber value={player}/></SlotCell><SlotCell className="mp-slot-who mp-open-copy"><span className="mp-open-mark" aria-hidden="true">·</span>Open · waiting for a commander</SlotCell></SlotRow>})}
 </SlotTable>;
}

function RulesPanel({controller,state}:{controller:NetworkController;state:NetworkState}){
 const lobby=state.lobby!,host=lobby.host===state.account?.profile?.id,forming=state.lobbyState==='forming',busy=!!state.busy;
 if(forming&&host)return <section className="network-host-controls mp-rules" aria-label="Lobby rules">
  {!lobby.scenario_id&&<label>Battlefield<select aria-label="Change lobby battlefield" disabled={busy} value={lobby.map_id} onChange={event=>void controller.changeLobby({map_id:event.target.value})}>{lobbyBattlefields(state.maps,lobby.mode,lobby.slots.length).map(map=><option key={map.id} value={map.id}>{map.title}</option>)}</select></label>}
  <div className="mp-rule-checks">
   {(lobby.mode==='custom'||lobby.mode==='coop')&&<label className="network-check mp-check"><input type="checkbox" disabled={busy} checked={lobby.pause_enabled} onChange={event=>void controller.changeLobby({pause_enabled:event.target.checked})}/><span>Shared pause</span></label>}
   {!lobby.scenario_id&&<label className="network-check mp-check"><input type="checkbox" disabled={busy||lobby.private&&!hasStandardLobbyStartingCredits(lobby)} checked={lobby.private} onChange={event=>{const current=controller.state.get(),active=current.lobby;if(current.busy||!active||active.id!==lobby.id||active.revision!==lobby.revision||current.lobbyState!=='forming'||active.host!==current.account?.profile?.id||!event.target.checked&&!hasStandardLobbyStartingCredits(active))return;void controller.changeLobby({private:event.target.checked,live_observers:event.target.checked&&active.live_observers})}}/><span>Private lobby</span></label>}
   {lobby.private&&<label className="network-check mp-check"><input type="checkbox" disabled={busy} checked={lobby.live_observers} onChange={event=>void controller.changeLobby({live_observers:event.target.checked})}/><span>Allow live observers</span></label>}
  </div>
  <details className="mp-details mp-credits"><summary>Starting credits · {lobbyStartingMoneySummary(lobby)}</summary><LobbyStartingMoney key={lobby.id+':'+lobby.revision} controller={controller} lobby={lobby} busy={busy}/></details>
 </section>;
 return <dl className="mp-rules mp-rules-summary" aria-label="Lobby rules">
  <div><dt>Credits</dt><dd>{lobbyStartingMoneySummary(lobby)}</dd></div>
  <div><dt>Access</dt><dd>{lobby.private?'Private · invite code':'Public'}</dd></div>
  <div><dt>Pause</dt><dd>{lobby.pause_enabled?'Shared pause on':'No pausing'}</dd></div>
  <div><dt>Observers</dt><dd>{lobby.live_observers?'Live':'2-minute delay'}</dd></div>
  {lobby.rated&&<div><dt>Ladder</dt><dd>Rated on this host</dd></div>}
 </dl>;
}

/** Cosmetic 3-2-1 on start, or the host's real connection barrier when it reports one. */
function DeployCountdown({state}:{state:NetworkState}){
 const lobby=state.lobby,matchID=lobby?.match_id,active=state.lobbyState==='active',seen=useRef(matchID),[started,setStarted]=useState<number>(),[barrier,setBarrier]=useState<{ms:number;at:number}>(),[now,setNow]=useState(()=>performance.now());
 useEffect(()=>{if(matchID&&!seen.current&&active)setStarted(performance.now());seen.current=matchID},[matchID,active]);
 useEffect(()=>{setBarrier(state.startRemainingMs!==undefined&&active?{ms:state.startRemainingMs,at:performance.now()}:undefined)},[state.startRemainingMs,active]);
 const running=!!barrier||started!==undefined&&now-started<3200;
 useEffect(()=>{if(!running)return;const timer=setInterval(()=>setNow(performance.now()),200);return()=>clearInterval(timer)},[running]);
 if(!running)return null;
 const value=barrier?Math.max(0,Math.ceil((barrier.ms-(now-barrier.at))/1000)):Math.max(1,3-Math.floor((now-started!)/1000));
 return <div className="mp-countdown" role="status" aria-live="polite"><span className="mp-countdown-label">Deploying</span><strong key={value}>{value}</strong><span className="mp-countdown-copy">{barrier?'Waiting for every commander to connect':'Loading the battlefield'}</span></div>;
}

function ResultHeader({state}:{state:NetworkState}){
 const lobby=state.lobby!,result=state.result,own=lobby.slots.find(slot=>slot.profile===state.account?.profile?.id),outcome=result?.outcome;
 const headline=!result?'Operation complete':result.void?'Operation voided':outcome?.draw?'Draw':outcome?.winningTeam?own?(outcome.winningTeam===own.team?'Victory':'Defeat'):`Team ${outcome.winningTeam} wins`:'Operation complete';
 const tone=headline==='Victory'?'victory':headline==='Defeat'?'defeat':'neutral';
 const reason=outcome?.reason==='players_missing'?networkErrorMessage('players_missing'):outcome?.reason?title(outcome.reason.replaceAll('_',' ')):'';
 return <section className="network-result mp-result" data-tone={tone} aria-label="Operation result"><Icon id={tone==='victory'?'i-trophy':'i-flag-checker'}/><div><strong>{headline}</strong><p>{[reason,outcome?`Game time ${formatClock(outcome.tick)}`:'',result&&!result.committed?'Waiting for the host to confirm':''].filter(Boolean).join(' · ')||'Loading the recorded result…'}</p></div></section>;
}

export function LobbyScreen({controller,state,palette}:Common){
 const lobby=state.lobby!,profile=state.account?.profile?.id,me=lobby.slots.find(slot=>slot.profile===profile),host=lobby.host===profile,forming=state.lobbyState==='forming',completed=state.lobbyState==='completed';
 const aiBlocked=lobbyAIBlockReason(state);
 const busy=!!state.busy,mapTitle=state.maps.find(map=>map.id===lobby.map_id)?.title??lobby.map_id;
 const ready=lobby.slots.filter(slot=>slot.ready&&slot.assets_ready),waiting=lobby.slots.filter(slot=>!slot.ready),loading=lobby.slots.filter(slot=>slot.ready&&!slot.assets_ready);
 const blocker=waiting.length?`Waiting for ${waiting.map(slot=>slot.profile===profile?'you':slot.name).join(', ')}`:loading.length?`${loading.map(slot=>slot.name).join(', ')} ${loading.length===1?'is':'are'} loading art`:'All commanders ready';
 const allReady=lobby.slots.every(slot=>slot.ready&&slot.assets_ready),spawnEditable=!!me&&forming&&!lobby.scenario_id&&!lobby.rated&&me.spawn!==undefined;
 const stateLabel=forming?'Forming':completed?'Completed':'In progress';
 if(state.lobbyClosed)return <section className="mp-banner" role="status"><div className="mp-banner-copy"><h3>Lobby closed</h3><p>This lobby has expired or was closed by its host. Return to multiplayer to host or join another operation.</p><button type="button" disabled={busy} onClick={()=>void controller.leaveLobby()}>Return to multiplayer</button></div></section>;
 return <div className="mp-lobby" data-state={state.lobbyState}>
  <header className="network-lobby-heading mp-lobby-head">
   <div className="mp-lobby-title"><span className="mp-eyebrow"><span className="mp-tag" data-tone={forming?'ok':completed?undefined:'live'}>{stateLabel}</span>{modeLabel(lobby.mode)} · {mapTitle}</span><h3>{lobby.name}</h3>{lobby.resume_tick!==undefined&&<small>Shared checkpoint at {formatClock(lobby.resume_tick)}</small>}</div>
   {forming&&<InviteCode controller={controller} state={state}/>}
  </header>
  <RemovedBanner state={state}/>
  {canRejoinOperation(state)&&<p className="network-warning" role="status">Your commander belongs to this live operation. <button disabled={busy} onClick={()=>void controller.joinMatch()}>Rejoin operation</button></p>}
  {forming&&state.hostOffline&&<p className="network-warning" role="status">The lobby host is disconnected. Waiting for them to return; this lobby expires after two minutes without the host.</p>}
  {completed&&<><ResultHeader state={state}/><Invitations controller={controller} state={state}/></>}
  <div className="mp-lobby-body">
   <div className="mp-lobby-main">
    <LobbySlots controller={controller} state={state} palette={palette} completed={completed}/>
    {forming&&<p className="mp-slot-hint">{host?(aiBlocked?`${aiBlocked} `:'Add AI in an open slot, or share the invite code. '):''}Changing a commander, team or the battlefield clears readiness.</p>}
    {state.lobbyState!=='forming'&&<NetworkMatchPanel controller={controller} embedded lobbyView={completed}/>}
    <ChatPanel controller={controller}/>
   </div>
   <aside className="mp-lobby-side" aria-label="Battlefield and rules">
    <LobbyMap controller={controller} mapId={lobby.map_id} slots={lobby.slots} palette={palette} onClaim={spawnEditable&&!busy?spawn=>void controller.changeSpawn(spawn):undefined}/>
    <DeployCountdown state={state}/>
    <RulesPanel controller={controller} state={state}/>
   </aside>
  </div>
  {forming?<FooterActionBar className="network-launch-line mp-actionbar" backLabel="Leave lobby" backDisabled={busy} onBack={()=>void controller.leaveLobby()}
    summary={<span className="mp-actionbar-status"><strong>{ready.length} / {lobby.slots.length} ready</strong><small>{blocker}</small></span>}
    disabledReason={host?<span className="mp-actionbar-status"><strong>{ready.length} / {lobby.slots.length} ready</strong><small>{blocker}</small></span>:undefined}
    secondary={host&&me?<button type="button" className={`fcm-btn fcm-btn--secondary fcm-btn--md mp-ready-toggle ${me.ready?'is-ready':''}`} aria-pressed={me.ready} disabled={busy} onClick={()=>void controller.ready(!me.ready)}><Icon id={me.ready?'i-check':'i-clock'}/><span className="fcm-btn-label">{me.ready?'Not ready':'Ready to deploy'}</span></button>:undefined}
    primary={host?{label:'Start operation',icon:'i-play',disabled:busy||!allReady,onClick:()=>void controller.start(),title:allReady?'Start the operation for every commander':blocker}
     :me?{label:me.ready?'Not ready':'Ready to deploy',icon:me.ready?'i-close':'i-check',variant:me.ready?'secondary':'primary',disabled:busy,onClick:()=>void controller.ready(!me.ready)}:undefined}/>
  :completed?<FooterActionBar className="network-launch-line mp-actionbar" backLabel="Close completed lobby" backDisabled={busy} onBack={()=>void controller.leaveLobby()}
    summary={<span className="mp-actionbar-status"><strong>Operation completed</strong><small>{state.lobbyUnavailable?'This lobby has closed on the host.':'A rematch invites the same commanders to a new lobby.'}</small></span>}
    actions={[{label:'View operation result',disabled:busy,onClick:()=>void controller.joinMatch()},{label:'Save match replay',icon:'i-replay',disabled:busy||!!state.result?.void,onClick:()=>void controller.saveReplay()}]}
    primary={state.lobbyUnavailable?undefined:{label:'Create rematch lobby',icon:'i-refresh',disabled:busy,onClick:()=>void controller.rematch()}}/>
  :<FooterActionBar className="network-launch-line mp-actionbar" back={false}
    summary={<span className="mp-actionbar-status"><strong>Operation in progress</strong><small>Press Reconnect to operation to enter the battle.</small></span>}
    primary={{label:'Reconnect to operation',icon:'i-play',disabled:busy,onClick:()=>void controller.joinMatch()}}/>}
 </div>;
}
