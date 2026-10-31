// Mechanical split of the former App.tsx (revamp-00). Keep CSS classes, DOM and accessible names stable.
import type {RangeMode} from '../../render/range-geometry';
import {ownerTeamColor} from '../../design/team-colors';
import {selectionPortraitColor} from '../team-color-presentation';
import {useCallback,useEffect,useId,useMemo,useRef,useState} from 'react';
import type {Application} from '../../app/application';
import {useObservable} from '../../app/store';
import {BattleController} from '../../app/battle-controller';
import {selectBattleAlerts} from '../../app/battle-alerts';
import {COMMANDS,reason} from '../../content/labels';
import {tabFor,type ProductionTab} from '../../content/catalog';
import {productionOrder} from '../../content/production-order';
import {productionSources,productionCategories} from '../../app/production-focus';
import type {Faction} from '../../runtime';
import {shortcutBadgeLabel,shortcutAriaList} from '../shortcut-presentation';
import {useScrollOverflow,hiddenKeys} from './use-scroll-overflow';
import {orderCommands} from './CommandCard';
export type BattleScreenProps={app:Application;alertsHost:HTMLDivElement|null;ordersHost:HTMLDivElement|null;targetHost:HTMLDivElement|null};
/** All battle-screen state, controller wiring, effects and derived values, moved verbatim from the former
 * App.tsx Battlefield body (hook order unchanged). Region components read what they need from the view. */
export function useBattleView({app,alertsHost,ordersHost,targetHost}:BattleScreenProps){
 const state=useObservable(app.state),[surrender,setSurrender]=useState(false),[entryEdge,setEntryEdge]=useState(false),[practice,setPractice]=useState(false),[pause,setPause]=useState(false),[settings,setSettings]=useState(false),[chatTeamOnly,setChatTeamOnly]=useState(false),[debrief,setDebrief]=useState(false),[sceneLoading,setSceneLoading]=useState(true),[rangeMode,setRangeMode]=useState<RangeMode>('off'),host=useRef<HTMLDivElement>(null);
 const control=useMemo(()=>new BattleController(app,()=>{setPause(true);if(!['online','observer'].includes(app.sessions.state.kind??''))void control.pause().catch(error=>app.error(error))},()=>setEntryEdge(true),teamOnly=>setChatTeamOnly(teamOnly)),[app,state.session.id]);
 const battle=useObservable(control.state),minimap=useRef<HTMLCanvasElement>(null),[tab,setTab]=useState<ProductionTab>('structures'),[replayHost,setReplayHost]=useState<HTMLDivElement|null>(null),productionId=useId();
 const replay=state.session.kind==='replay',[commandGrid,setCommandGrid]=useState<HTMLDivElement|null>(null),[commandCue,setCommandCue]=useState<HTMLDivElement|null>(null);
 const commandGridRef=useCallback((node:HTMLDivElement|null)=>{setCommandGrid(node);setReplayHost(replay?node:null)},[replay]);
 useScrollOverflow(replay?null:commandGrid,commandCue,hiddenKeys);
 useEffect(()=>{let canceled=false;setSceneLoading(true);if(host.current)void control.mount(host.current).catch(error=>app.error(error)).finally(()=>{if(!canceled)setSceneLoading(false)});return()=>{canceled=true;control.dispose()}},[control,app]);
 useEffect(()=>{control.renderer?.updateSettings(state.settings)},[control,state.settings,sceneLoading]);
 useEffect(()=>{control.renderer?.setRangeMode(rangeMode)},[control,rangeMode,sceneLoading]);
 // The renderer repaints its attached minimap from its own ticker when snapshots, overlays or the camera change; disposal detaches it.
 useEffect(()=>{const canvas=minimap.current;if(sceneLoading||!canvas)return;return control.renderer?.attachMinimap(canvas)},[control,sceneLoading]);
 useEffect(()=>{if(state.snapshot?.outcome?.finished)setDebrief(true)},[state.snapshot?.outcome?.finished]);
 const snapshot=state.snapshot,economy=snapshot?.economy,catalog=state.catalog!,player=snapshot?.players.find(player=>player.id===snapshot.player),faction=(player?.faction??'US') as Faction;
 const teamColor=ownerTeamColor(snapshot?.player??0,snapshot?.players??[],state.settings.palette).css;
 const selected=snapshot?.entities.filter(entity=>battle.ids.includes(entity.id))??[],first=selected[0];
 const selectedPortrait=first?selectionPortraitColor(first,snapshot?.players??[],state.settings.palette):undefined;
 const readOnly=['replay','observer'].includes(state.session.kind??'')||!!snapshot?.outcome?.finished||!!player?.defeated;
 const sources=snapshot?productionSources(snapshot,catalog):[],producer=sources.find(entity=>entity.id===battle.productionSource);
 const choices=productionOrder(battle.production.filter(choice=>tabFor(catalog,choice.type)===tab),catalog),availableTabs=[...new Set(sources.flatMap(entity=>productionCategories(entity,catalog,faction)))],sourceTabs=[...new Set(battle.production.map(choice=>tabFor(catalog,choice.type)))];
 // Facility/category changes choose a compatible initial tab; an explicit empty-category choice stays selected.
 useEffect(()=>{if(sourceTabs.length)setTab(current=>sourceTabs.includes(current)?current:sourceTabs[0])},[sourceTabs.join(','),battle.productionSource]);
 const chooseProductionTab=(category:ProductionTab)=>{setTab(category);control.productionCategory(category)};
 // Tab hotkeys (client-logic-2 production_* bindings) are handled by the controller, which publishes productionTab. Mirror it into the sidebar.
 const controllerTab=battle.productionTab;
 useEffect(()=>{if(controllerTab)setTab(controllerTab)},[controllerTab]);
 const commandKinds=orderCommands([...new Set(battle.affordances?.entities.flatMap(entity=>entity.commands)??[])].filter(kind=>COMMANDS[kind]));
 const abilities=[...new Set(battle.affordances?.entities.flatMap(entity=>entity.abilities)??[])];
 const fieldBarricade=battle.affordances?.entities.some(entity=>entity.builds.includes('barrier'))&&catalog.buildings.has('barrier');
 const {visible:recent}=selectBattleAlerts(snapshot?.events??[]);
 // Placement preview is advisory: a clear preview still says the host confirms on execution.
 const placement=battle.target?.kind==='build'?battle.placementReason:undefined,hintVerdict=battle.target?.kind!=='build'?'target':!placement?'choose':placement===reason('ok')?'clear':placement===reason('indeterminate')?'pending':'blocked';
 const hintReason=battle.target?.kind==='build'?(hintVerdict==='clear'?'Site clear · click to place.':placement??'Choose a visible site.'):battle.target?.label==='Rebase'?'Choose your service base · Immediate order':'Choose a target';
 const escapeBindings=state.settings.bindings.keys.escape,escapeKey=escapeBindings?.[0]?shortcutBadgeLabel(escapeBindings[0]):undefined,escapeShortcut=shortcutAriaList(escapeBindings);
 // Sidebar additions (hud-sidebar lane): opening guidance and the owner economy model, both from client-api contract selectors.
 const openingObjective=snapshot&&!readOnly?control.openingObjective():undefined,economyStatus=snapshot?control.economyStatus():undefined;
 const openPause=()=>{setPause(true);if(!['online','observer'].includes(app.sessions.state.kind??''))void control.pause().catch(error=>app.error(error))};
 const surrenderCountdown='Resume operation and finish the readiness countdown before surrendering.',surrenderPending='Wait for the current command check to finish before surrendering.',surrenderUnavailable=snapshot?.countdown?surrenderCountdown:battle.pending?surrenderPending:undefined;
 const confirmSurrender=()=>{const session=app.sessions.state;if(session.id!==state.session.id||!['solo','practice'].includes(session.kind??''))return;const current=app.sessions.transport?.current,pending=control.state.get().pending;if(!current||current.countdown||pending){app.patch({notice:current?.countdown?surrenderCountdown:pending?surrenderPending:'The operation is not ready to receive surrender orders.'});return}setSurrender(false);setPause(false);void control.execute({kind:'surrender',entities:[]}).then(()=>control.resume()).catch(error=>app.error(error))};
 return {app,alertsHost,ordersHost,targetHost,state,surrender,setSurrender,entryEdge,setEntryEdge,practice,setPractice,pause,setPause,settings,setSettings,chatTeamOnly,setChatTeamOnly,debrief,setDebrief,sceneLoading,setSceneLoading,rangeMode,setRangeMode,host,control,battle,minimap,tab,setTab,replayHost,setReplayHost,productionId,replay,commandGrid,setCommandGrid,commandCue,setCommandCue,commandGridRef,snapshot,economy,catalog,player,faction,teamColor,selected,first,selectedPortrait,readOnly,sources,producer,choices,availableTabs,sourceTabs,chooseProductionTab,commandKinds,abilities,fieldBarricade,recent,placement,hintVerdict,hintReason,escapeBindings,escapeKey,escapeShortcut,openPause,openingObjective,economyStatus,surrenderCountdown,surrenderPending,surrenderUnavailable,confirmSurrender};
}
export type BattleView=ReturnType<typeof useBattleView>;
