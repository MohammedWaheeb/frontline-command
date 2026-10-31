import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as React from 'react';
import {Observable} from '../../src/app/store';
import {sanitizeSettings} from '../../src/app/settings';
import {OfflineTransport} from '../../src/runtime/offline';
import {PauseMenu,OperationLoads} from '../../src/ui/hud/PauseMenu';
import {DebriefModal} from '../../src/ui/hud/DebriefModal';
import {TacticalMinimap} from '../../src/ui/hud/CommandSidebar';
import {QueueJobTip,cancellationRefund,cancellationHint} from '../../src/ui/hud/ProductionPanel';

// Execute the product JSX handlers and hook state without a browser or React DOM.
function component(render:()=>any){
 const values:any[]=[],effects:Array<()=>unknown>=[],internals=(React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;let cursor=0;
 const slot=(initial:()=>any)=>{const i=cursor++;if(!(i in values))values[i]=initial();return i};
 const dispatcher={useState(initial:any){const i=slot(()=>typeof initial==='function'?initial():initial);return [values[i],(value:any)=>{values[i]=typeof value==='function'?value(values[i]):value}]},useRef(initial:any){return values[slot(()=>({current:initial}))]},useId(){return values[slot(()=>`battle-${cursor}`)]},useEffect(effect:()=>unknown){effects.push(effect)},useLayoutEffect(){},useMemo(factory:()=>any){return factory()},useCallback(callback:any){return callback},useSyncExternalStore(_subscribe:any,get:any){return get()}};
 return {effects,render(){cursor=0;const old=internals.H;internals.H=dispatcher;try{return render()}finally{internals.H=old}}};
}
function elements(tree:any):any[]{if(Array.isArray(tree))return tree.flatMap(elements);if(!tree||typeof tree!=='object'||!tree.props)return [];return [tree,...elements(tree.props.children)]}
const find=(tree:any,predicate:(element:any)=>boolean)=>{const match=elements(tree).find(predicate);assert.ok(match,'Expected UI element');return match};
const text=(node:any):string=>Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):typeof node==='string'||typeof node==='number'?String(node):'';
const button=(tree:any,label:string)=>find(tree,node=>node.type==='button'&&text(node)===label);
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
function view(kind='solo'){
 const calls:any[]=[],state={session:{id:'battle-ui',kind,map:{title:'Copper Junction',width:64,height:64}},settings:sanitizeSettings(undefined),snapshot:{tick:400,player:1,players:[],entities:[],outcome:{finished:true,reason:'surrender',winningTeam:2}},speed:1};
 const appState=new Observable(state),app={state:appState,editor:{state:new Observable({testActive:false})},sessions:{state:state.session,transport:undefined as any,flushAutosave:async()=>{calls.push(['flush'])},continueSave:async(id:string)=>{calls.push(['load',id])},playReplay:async(data:Uint8Array)=>{calls.push(['play',data])}},store:{listSaveSummaries:async()=>[{id:'save-1',name:'Operation one',tick:200,metadata:{ruleset:'standard-v1'}}]},restartOperation:async()=>{calls.push(['restart'])},task:async(_label:string,work:()=>Promise<any>)=>work(),error(error:unknown){throw error}};
 const result={app,state,pause:true,setPause(){},setSurrender(){},setSettings(){},control:{closePause:async()=>{},resume:async()=>{},renderer:{center(point:any){calls.push(['center',point])},minimapPoint:()=>({x:12000,y:13000})},minimapOrder:(point:any,button:number,mods:object)=>{calls.push(['order',point,button,mods]);return button===state.settings.bindings.pointer.context}},snapshot:state.snapshot,faction:'US',debrief:true,setDebrief(){},player:{team:1},minimap:{current:{}}};
 return {view:result as any,calls,app,state};
}

test('M2-04: actual minimap mouse handlers preserve camera clicks and suppress the context menu',()=>{
 const h=view(),render=component(()=>TacticalMinimap({view:h.view}));let tree=render.render(),canvas=find(tree,node=>node.type==='canvas');
 const event={button:0,clientX:100,clientY:100,shiftKey:true,ctrlKey:false,altKey:false,metaKey:false};canvas.props.onClick(event);assert.deepEqual(h.calls.at(-1),['center',{x:12000,y:13000}]);
 let prevented=false;canvas.props.onContextMenu({...event,button:2,preventDefault(){prevented=true}});assert.equal(prevented,true);assert.deepEqual(h.calls.at(-1),['order',{x:12000,y:13000},2,{shift:true,ctrl:false,alt:false,meta:false}]);assert.equal(h.calls.filter(call=>call[0]==='center').length,1);
 h.state.settings.bindings.preset='classic';h.state.settings.bindings.pointer.context=0;tree=render.render();canvas=find(tree,node=>node.type==='canvas');canvas.props.onClick(event);assert.equal(h.calls.at(-1)[0],'order');assert.equal(h.calls.filter(call=>call[0]==='center').length,1);
});
test('M2-06: producer hit targets have an unscaled 24px floor at every supported UI tier',()=>{
 const css=readFileSync('src/styles/hud.css','utf8'),rule=css.match(/\.production-source \.hud-step\{([^}]+)\}/)?.[1];assert.ok(rule);assert.match(rule,/min-width:24px;min-height:24px/);assert.match(rule,/flex:0 0 max\(24px,calc\(20px \* var\(--hud-rk\) \* var\(--fc-ui-scale\)\)\)/);assert.match(rule,/height:max\(24px,calc\(18px \* var\(--hud-rk\) \* var\(--fc-ui-scale\)\)\)/);assert.match(css,/\.production-source\{display:flex;min-height:24px;/);
 for(const tier of [1,1.167,1.278])for(const scale of [.85,1,1.25,1.5])assert.ok(Math.max(24,20*tier*scale)>=24&&Math.max(24,18*tier*scale)>=24);
});
test('M2-07: pause opens a nested load picker, reads summaries and invokes the existing loader',async()=>{
 const h=view(),render=component(()=>PauseMenu({view:h.view}));button(render.render(),'Load operation…').props.onClick();const tree=render.render(),picker=find(tree,node=>node.type===OperationLoads),list=component(()=>OperationLoads(picker.props));
 assert.match(text(list.render()),/Reading saved operations/);list.effects[0]();await settle();const loaded=list.render();assert.match(text(loaded),/Loading replaces this operation/);button(loaded,'Operation one · 00:10').props.onClick();await settle();assert.deepEqual(h.calls,[['flush'],['load','save-1']]);button(loaded,'Back to pause menu').props.onClick();assert.equal(elements(render.render()).some(node=>node.type===OperationLoads),false);
 for(const kind of ['online','observer','replay']){const other=view(kind),screen=component(()=>PauseMenu({view:other.view}));assert.equal(elements(screen.render()).some(node=>node.type==='button'&&text(node)==='Load operation…'),false)}
});
test('M2-07: load picker handles empty, unreadable and late listing responses',async()=>{
 const h=view();h.app.store.listSaveSummaries=async()=>[];let list=component(()=>OperationLoads({view:h.view,onClose(){}}));list.render();list.effects[0]();await settle();assert.match(text(list.render()),/No saved operations/);
 h.app.store.listSaveSummaries=async()=>{throw Error('storage')};list=component(()=>OperationLoads({view:h.view,onClose(){}}));list.render();list.effects[0]();await settle();assert.match(text(list.render()),/could not be read/);
 let finish!:(records:any[])=>void;h.app.store.listSaveSummaries=()=>new Promise(resolve=>{finish=resolve});list=component(()=>OperationLoads({view:h.view,onClose(){}}));list.render();const cleanup=list.effects[0]() as ()=>void;cleanup();finish([]);await settle();assert.match(text(list.render()),/Reading saved operations/);
});
test('M2-08: solo Rematch restarts the existing setup and Watch replay uses the active local recording',async()=>{
 const h=view(),runtime=Object.create(OfflineTransport.prototype),data=new Uint8Array([1,2,3]);runtime.exportReplay=async()=>{h.calls.push(['export']);return data};h.app.sessions.transport=runtime;
 const screen=component(()=>DebriefModal({view:h.view})),tree=screen.render();button(tree,'Rematch').props.onClick();await settle();assert.deepEqual(h.calls,[['restart']]);h.calls.length=0;button(tree,'Watch replay').props.onClick();await settle();assert.deepEqual(h.calls,[['flush'],['export'],['play',data]]);
 for(const kind of ['online','observer','replay','practice']){const other=view(kind),page=component(()=>DebriefModal({view:other.view})),buttons=elements(page.render()).filter(node=>node.type==='button').map(text);assert.ok(!buttons.includes('Rematch'));assert.ok(!buttons.includes('Watch replay'))}
});
test('M2-10: cancellation tooltip tracks live work, unpaid jobs and the exact fixed-point refund',()=>{
 const job={started:true,paid:800000n,work:36,required:100};assert.equal(cancellationRefund(job),384000n);assert.equal(cancellationHint(job),'Click to cancel — refunds 75% of the unbuilt part (currently 384 credits).');assert.equal(cancellationRefund({...job,started:false}),0n);assert.equal(cancellationRefund({...job,required:0}),0n);assert.equal(cancellationRefund({...job,paid:1001n,work:1,required:3}),500n);
 const h=view();h.state.snapshot.entities=[{id:1,owner:1,private:{jobs:[{...job,type:'US.rig'}]}}] as any;const props={app:h.app as any,producer:1,index:0,type:'US.rig',readOnly:false},tip=component(()=>QueueJobTip(props));assert.match(tip.render().props.blocked,/384 credits/);
 (h.state.snapshot.entities[0] as any).private.jobs[0].work=80;h.app.state.set({...h.state});assert.match(tip.render().props.blocked,/120 credits/);assert.match(tip.render().props.line,/80%/);
 (h.state.snapshot.entities[0] as any).private.jobs=[];assert.equal(tip.render().props.blocked,undefined);assert.match(tip.render().props.line,/no longer present/);
});
