// Component acceptance, not live gameplay: exact previously earned snapshots
// and result, plus an explicitly synthetic stale connected MatchStatus frame.
import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {create} from '@bufbuild/protobuf';
import {MatchStatusSchema} from '../../src/protocol/frontline_pb';
import {Observable} from '../../src/app/store';
import {BattlefieldStatus} from '../../src/ui/BattlefieldStatus';
import {NetworkMatchPanel} from '../../src/ui/network';
import {Emblem} from '../../src/ui/primitives';
import {formatClock} from '../../src/content/labels';
import type {NetworkController,NetworkState} from '../../src/app/network-controller';
import type {PlayerSnapshot,MatchResult} from '../../src/runtime/types';
import type {Lobby} from '../../src/runtime/api';
import type {SessionKind} from '../../src/runtime/session';
import '../../src/design/tokens.css';
import '../../src/styles/game.css';

interface Input{frozen:PlayerSnapshot;finished:PlayerSnapshot;result:MatchResult;lobby:Lobby}
let input:Input;
function View(){
 const [mode,setMode]=useState<'eliminated'|'result'|'finished'|'observer'|'replay'|'paused'>('eliminated'),[menu,setMenu]=useState(false);
 const snapshot=mode==='finished'?input.finished:input.frozen,kind:SessionKind=mode==='observer'?'observer':mode==='replay'?'replay':'online',paused=mode==='paused';
 const [controller]=useState(()=>({state:new Observable<NetworkState>({host:location.origin,connected:true,maps:[],missions:[],lobbies:[],ownMaps:[],mapReports:[],chat:[],history:[],relations:[],invites:[],saves:[],reports:[],rankedMaps:[],connection:'closed',tick:input.frozen.tick,lobby:input.lobby,lobbyState:'active',eliminated:true,status:create(MatchStatusSchema,{paused:true,teammates:[{player:1,connected:true}],pauseVotes:[1]})})} as NetworkController));
 function choose(next:typeof mode){setMode(next);controller.state.update(state=>({...state,result:next==='result'||next==='finished'?input.result:undefined,lobbyState:next==='result'||next==='finished'?'completed':'active',eliminated:next!=='finished',tick:next==='finished'?input.finished.tick:input.frozen.tick,connection:next==='finished'?'connected':'closed'}))}
 return <main className="battlefield-screen"><section style={{padding:24,width:'calc(100vw - var(--fc-hud-sidebar-w) - 24px)',height:'100vh',overflow:'auto'}}><h1>Session status acceptance</h1><p>Exact earned four-player snapshots and result. This is a presentation fixture, not a live battle. Its old connected status is deliberately synthetic.</p><p data-snapshot-tick>Unchanged snapshot: tick {snapshot.tick}</p><div className="button-row">{(['eliminated','result','finished','observer','replay','paused'] as const).map(value=><button key={value} onClick={()=>choose(value)}>{value}</button>)}</div><button onClick={()=>setMenu(!menu)}>Toggle operation menu</button>{menu&&<section className="console" role="dialog" aria-label="Network operation" style={{marginTop:20,padding:20}}><NetworkMatchPanel controller={controller}/></section>}</section><aside className="command-sidebar console" aria-label="Command sidebar"><header className="sidebar-identity"><Emblem faction="US"/><div><strong>US COMMAND</strong><small>{formatClock(snapshot.tick)}</small></div><BattlefieldStatus kind={kind} paused={paused} snapshot={snapshot}/></header></aside></main>;
}
Object.defineProperty(window,'sessionStatusFixture',{value:{start(value:Input){input=structuredClone(value);createRoot(document.getElementById('root')!).render(<View/>)},frozen(){return JSON.stringify(input.frozen)}}});
