// Isolated acceptance entry. Unchanged product UI; only normal authenticated
// command APIs and this browser's authorized view are exposed to the driver.
import {createRoot} from 'react-dom/client';
import {Application} from '../../src/app/application';
import {App} from '../../src/ui/App';
import type {OrderIntent} from '../../src/runtime/types';
import '../../src/design/tokens.css';
import '../../src/styles/game.css';
const app=new Application();
const receipts=new Map<string,unknown>();
app.sessions.subscribe(event=>{
 if(event.type!=='runtime')return;
 if(event.event.type==='order-result'){const r=event.event.result;receipts.set(`${r.sequence}:${r.index}`,r)}
 if(event.event.type==='snapshot')for(const r of event.event.snapshot.results)receipts.set(`${r.sequence}:${r.index}`,r);
});
const json=(value:unknown)=>JSON.stringify(value,(_key,item)=>typeof item==='bigint'?item.toString():item);
const api={
 view:()=>json(app.sessions.transport?.current),
 info:()=>json({session:app.sessions.state,assets:app.state.get().assetStatus,result:app.network.state.get().result,lobby:app.network.state.get().lobby}),
 catalog:()=>json(app.state.get().catalog?.raw),
 advice:async(entities:number[],orders:OrderIntent[]=[],independent=false)=>app.commandAdvice().request(entities,orders,{independent}),
 send:async(orders:OrderIntent[])=>{if(!app.sessions.transport||app.sessions.state.kind!=='online')throw Error('Live participant required');return app.sessions.transport.sendOrders(orders)},
 receipts:()=>json([...receipts.values()]),
 replay:async()=>{const list=await app.store.listReplays();if(!list.length)return;const file=await app.store.getReplay(list[0]!.id);return file?{id:file.id,sha256:file.sha256,data:Array.from(file.data)}:undefined},
};
Object.defineProperty(window,'multiplayerCombat',{value:api});
createRoot(document.getElementById('root')!).render(<App app={app}/>);
void app.boot();
