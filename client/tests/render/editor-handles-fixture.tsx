/** Product editor entry with read-only acceptance probes; authoring stays in the UI. */
import {createRoot} from 'react-dom/client';
import {Application} from '../../src/app/application';
import {App} from '../../src/ui/App';
import {EditorHandles} from '../../src/render/editor-handles';
import {sha256Hex} from '../../src/runtime/crypto';
import '../../src/design/tokens.css';import '../../src/styles/game.css';
const app=new Application(),calls:{kind:string;x:number;y:number;ratio:number;painted:boolean}[]=[],lifecycle={loads:0,disposed:0};
const paint=EditorHandles.prototype.paint,load=EditorHandles.prototype.load,dispose=EditorHandles.prototype.dispose;
EditorHandles.prototype.paint=function(ctx,kind,point,ratio){const painted=paint.call(this,ctx,kind,point,ratio);calls.push({kind,x:point.x,y:point.y,ratio,painted});if(calls.length>200)calls.shift();return painted};
EditorHandles.prototype.load=function(){lifecycle.loads++;return load.call(this)};
EditorHandles.prototype.dispose=async function(){await dispose.call(this);lifecycle.disposed++};
createRoot(document.getElementById('root')!).render(<App app={app}/>);void app.boot();
Object.assign(window,{qa:{async state(){const s=app.editor.state.get(),map=s.snapshot?.map;return {id:s.snapshot?.documentId,revision:s.snapshot?.revision,dirty:s.snapshot?.dirty,storedRevision:s.storedRevision,spawns:map?.spawns,regions:map?.regions,mapHash:map?await sha256Hex(new TextEncoder().encode(JSON.stringify(map))):undefined,width:map?.width,height:map?.height,validation:s.validation,preview:s.preview,previewRequest:s.previewRequest,session:app.sessions.state.kind,testActive:s.testActive,paints:calls.slice(-12),lifecycle:{...lifecycle}}},async dispose(){await app.leave();app.dispose();return {...lifecycle}}}});
