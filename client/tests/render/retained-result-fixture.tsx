// Explicit retained-client fixture: original public lobby and own frozen view,
// real authenticated restarted Go host; no simulator or invented live snapshot.
import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {NetworkController} from '../../src/app/network-controller';
import {LocalProfileSession,LocalCredentialVault} from '../../src/runtime/account';
import {LocalStore} from '../../src/runtime/storage';
import {OfflineTransport} from '../../src/runtime/offline';
import {NetworkMatchPanel} from '../../src/ui/network';
import {RecordedResultCue} from '../../src/ui/network/recorded-results';
import {useObservable} from '../../src/app/store';
import type {Lobby} from '../../src/runtime/api';
import type {SessionState} from '../../src/runtime/session';
import type {ContentLibrary} from '../../src/runtime/content-library';
import '../../src/design/tokens.css';
import '../../src/styles/game.css';
let controller:NetworkController,validator:OfflineTransport,store:LocalStore,frozen:string,vault:LocalCredentialVault;
function View(){const [menu,setMenu]=useState(false),state=useObservable(controller.state);return <main className="battlefield-screen"><div style={{padding:24,maxWidth:650}}><h1>Retained-client recovery fixture</h1><p>Original public lobby and own frozen view from the earned three-human match. Real host history and replay requests. No new live battlefield or simulation.</p><p data-frozen-tick>Frozen own view: tick {JSON.parse(frozen).tick}</p><p data-result-state>{state.result?.committed?'Recorded result recovered':'Waiting for ordinary host poll'}</p>{state.pollError&&<p role="status">{state.pollError}</p>}</div><RecordedResultCue controller={controller} kind="online" liveFinished={false} onOpen={()=>setMenu(true)}/>{menu&&<section className="console" role="dialog" aria-label="Network operation" style={{position:'absolute',top:160,left:24,width:650,padding:20}}><NetworkMatchPanel controller={controller}/><button onClick={()=>setMenu(false)}>Return to frozen view</button></section>}</main>}
Object.defineProperty(window,'retainedResult',{value:{
 async start(input:{host:string;token:string;lobby:Lobby;frozen:unknown}){
  frozen=JSON.stringify(input.frozen);validator=new OfflineTransport();await validator.ready;store=new LocalStore('retained-result-files',data=>validator.inspect(data),data=>validator.inspectReplay(data));vault=new LocalCredentialVault('retained-result-auth');
  const sessionState:SessionState={phase:'menu'};controller=new NetworkController({library:{} as ContentLibrary,store,validator,sessions:{state:sessionState,transport:undefined,subscribe:()=>()=>false,pause:async()=>{},resume:async()=>{}},joinOnline:async()=>{throw Error('A recovered recorded result must not open a live transport')},prepareAssets:async()=>{},notice:()=>{},makeAccount:baseURL=>new LocalProfileSession({baseURL,credentials:vault}),references:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},pollMs:2000});
  if(!await controller.connect(input.host)||!await controller.restoreProfile(input.token,false))throw Error('Private fixture sign-in failed');input.token='';sessionState.phase='active';sessionState.kind='online';
  controller.state.update(state=>({...state,lobby:input.lobby,lobbyState:'active',eliminated:true,connection:'closed',tick:JSON.parse(frozen).tick}));createRoot(document.getElementById('root')!).render(<View/>);
 },
 inspect(){const s=controller.state.get();return {tick:JSON.parse(frozen).tick,frozen,result:s.result,lobbyUnavailable:s.lobbyUnavailable,lobbyState:s.lobbyState,connection:s.connection,error:s.error,pollError:s.pollError}},
 async replay(){const item=(await store.listReplays())[0];if(!item)return;const replay=await store.getReplay(item.id);return replay?{sha256:replay.sha256,bytes:replay.data.length}:undefined},
 async dispose(){controller.dispose();validator.dispose();await store.close();await vault.close()},
}});
