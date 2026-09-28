// Isolated acceptance entry: unchanged App, actual Go saves and normal runtime
// calls. The harness pauses after mount and exposes camera/selection controls.
import {createRoot} from 'react-dom/client';
import {Application} from '../../src/app/application';
import {BattleController} from '../../src/app/battle-controller';
import {App} from '../../src/ui/App';
import {OfflineTransport} from '../../src/runtime/offline';
import {ownerRanges} from '../../src/app/owner-ranges';
import '../../src/design/tokens.css';
import '../../src/styles/game.css';
const app=new Application();
let battle:BattleController|undefined;
const mount=BattleController.prototype.mount;
BattleController.prototype.mount=async function(host){await mount.call(this,host);battle=this;await app.sessions.pause()};
const runtime=()=>{const value=app.sessions.transport;if(!(value instanceof OfflineTransport))throw Error('Offline operation required');return value};
const settle=async()=>{await battle?.renderer?.whenAssetsReady();await new Promise(resolve=>setTimeout(resolve,180))};
const json=(value:unknown)=>JSON.stringify(value,(_key,item)=>typeof item==='bigint'?item.toString():item);
const api={
 ready:()=>!!battle?.renderer,
 view:()=>json(runtime().current),
 async load(data:number[],player=1){await app.sessions.pause();await new Promise(resolve=>setTimeout(resolve,120));await runtime().load(new Uint8Array(data),[1,2]);if(player!==1)await runtime().setPerspective(player);await settle();return this.inspect()},
 async focus(id:number){const entity=runtime().current?.entities.find(entity=>entity.id===id);if(!entity?.position||!battle?.renderer)throw Error('Visible entity required');battle.select([id]);battle.renderer.center(entity.position);await settle();return this.inspect()},
 inspect(){const frame=runtime().current!;return {tick:frame.tick,player:frame.player,selection:battle?.state.get().ids,diagnostics:battle?.renderer?.tacticalDiagnostics,entities:frame.entities.map(entity=>({id:entity.id,owner:entity.owner,type:entity.type,position:entity.position,ranges:ownerRanges(entity,frame)})),error:app.state.get().error}},
 async step(ticks:number){for(let left=ticks;left>0;left-=Math.min(100,left))await runtime().step(Math.min(100,left));await settle();return this.inspect()},
 async saveRoundtrip(){const saved=await runtime().save(),before=this.inspect();await runtime().load(saved.data,saved.local_players);await settle();return {before,after:this.inspect(),savedHash:saved.hash,hash:await runtime().hash()}},
 async replayRoundtrip(ticks:number){const start=runtime().current!.tick;await this.step(ticks);const target=runtime().current!.tick,hash=await runtime().hash(),data=await runtime().exportReplay();await runtime().loadReplay(data);await runtime().seekReplay(target);await settle();const result={start,target,hash,replayHash:await runtime().hash(),atEnd:this.inspect()};await runtime().seekReplay(start);await settle();return {...result,atStart:this.inspect()}},
 async settings(scale:number,reduced=false){app.setSettings({...app.state.get().settings,uiScale:scale,reducedMotion:reduced,reducedFlashing:reduced,screenShake:0},false);await settle()},
 async dispose(){app.dispose();await new Promise(resolve=>setTimeout(resolve,150));return {canvases:document.querySelectorAll('.battlefield-canvas canvas').length}},
};
Object.defineProperty(window,'ownerRangesQA',{value:api});
createRoot(document.getElementById('root')!).render(<App app={app}/>);
void app.boot();
