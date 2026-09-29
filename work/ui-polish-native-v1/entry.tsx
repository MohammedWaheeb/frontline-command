// Test-only entry. UI data stress is separate from engine/gameplay acceptance.
import {createRoot} from 'react-dom/client';
import {create} from '@bufbuild/protobuf';
import {Application} from 'frozen/app/application';
import {App} from 'frozen/ui/App';
import {BattleController} from 'frozen/app/battle-controller';
import {OfflineTransport} from 'frozen/runtime';
import {art} from 'frozen/render/art';
import {EventSchema,MissionProgressSchema,ObjectiveProgressSchema} from 'frozen/protocol/frontline_pb';
import 'frozen/design/tokens.css';
import 'frozen/styles/game.css';

const app=new Application(),root=createRoot(document.getElementById('root')!);
let control:BattleController|undefined,mounted=false,baseline:ReturnType<typeof app.state.get>|undefined,transport:OfflineTransport|undefined,current:OfflineTransport['current'],beforeHash:string|undefined,captionNode:Element|null=null;
const originalMount=BattleController.prototype.mount;
// Capture the actual instance, preserving original arguments, result and errors.
BattleController.prototype.mount=async function(host){control=this;mounted=false;await originalMount.call(this,host);mounted=true};
const check=(value:unknown,message:string)=>{if(!value)throw Error(message)};
const settle=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
const json=(value:unknown)=>JSON.stringify(value,(_k,v)=>typeof v==='bigint'?v.toString():v);
let currentJSON='',synthetic=false,sendCalls=0,originalSend:OfflineTransport['sendOrders']|undefined;
async function unchanged(){check(transport&&beforeHash,'No paused proof boundary');check(transport!.current===current,'Transport snapshot object was replaced');check(json(transport!.current)===currentJSON,'Authorized transport snapshot changed');const hash=await transport!.hash();check(hash===beforeHash,'Go hash changed during display-only stress');return {hash,tick:current?.tick,sendCalls,synthetic}}
function stableCaption(){const now=document.querySelector('.audio-captions');if(!captionNode)captionNode=now;check(captionNode&&captionNode===now&&captionNode.isConnected,'Caption node remounted or disappeared');return true}
function camera(){return structuredClone((control?.renderer as unknown as {camera?:{x:number;y:number;zoom:number}})?.camera)}
function captions(){app.audio.state.update(state=>({...state,captions:[1,2,3].map(id=>({id:100000+id,priority:100-id,expires:performance.now()+600000,text:`DISPLAY STRESS ${id}: Return service is delayed while the requested landing area remains occupied. Preserve the route, check the service building, and wait for the next available slot. This long caption tests readable wrapping and complete text access.`}))}))}
async function restore(){if(!baseline)return;control?.cancel();app.patch({snapshot:baseline.snapshot});app.audio.clearCaptions();synthetic=false;await settle();stableCaption();return unchanged()}
async function selectionLabel(type:string){
 await restore();const state=control!.state.get(),view=structuredClone(baseline!.snapshot!),rig=view.entities.find(e=>e.owner===view.player&&baseline!.catalog!.units.get(e.type)?.role==='rig');check(rig,'Fixture needs actual owned rig');check(baseline!.catalog!.units.has(type),'Unknown catalog type');
 // Display-only identity/affordance stress. No transport or renderer frame is
 // fabricated; these labels do not claim paid production or command legality.
 rig!.type=type;app.patch({snapshot:view});
 const affordances=structuredClone(state.affordances);check(affordances,'Actual affordances unavailable');
 check(affordances!.entities.length>0,'Actual selected-entity affordance required');
 for(const row of affordances!.entities)row.commands=['aggressive','escort','force_fire','hold','stop','attack','attack_move','move','guard','patrol','resume'];
 control!.state.update(s=>({...s,ids:[rig!.id],affordances}));synthetic=true;await settle();stableCaption();return {type,label:baseline!.catalog!.name(type),proof:await unchanged(),scope:'Display-only catalog-name and provided-command layout; not unit creation or gameplay admission'};
}
const api={
 selectionLabel,
 labelTypes(){const ids=[...baseline!.catalog!.units.keys()];return ['US.rig','US.artillery',...ids.sort((a,b)=>baseline!.catalog!.name(b).length-baseline!.catalog!.name(a).length||a.localeCompare(b)).slice(0,1)]},
 ready:()=>({booting:app.state.get().booting,firstRun:app.state.get().firstRun,mounted,session:app.sessions.state,loading:!!document.querySelector('.scene-loading'),error:app.state.get().error}),
 stableCaption,
 async begin(scale:number){check(mounted&&control?.renderer,'Actual renderer not ready');await app.sessions.pause();await settle();check(app.state.get().paused,'Actual engine did not pause');check(app.sessions.transport instanceof OfflineTransport,'Actual offline transport required');transport=app.sessions.transport as OfflineTransport;baseline=app.state.get();current=transport.current;check(current,'Missing authorized snapshot');currentJSON=json(current);beforeHash=await transport.hash();originalSend=transport.sendOrders;transport.sendOrders=function(orders){sendCalls++;return originalSend!.call(this,orders)};app.setSettings({...app.state.get().settings,uiScale:scale},false);await settle();stableCaption();const rig=current!.entities.find(e=>e.owner===current!.player&&baseline!.catalog?.units.get(e.type)?.role==='rig');check(rig,'No actual owned rig');control!.select([rig!.id]);await control!.refresh();await settle();return {proof:await unchanged(),rig:rig!.id,source:'Actual ordinary skirmish; paused before any display fixture'}},
 async target(){check(!synthetic,'Restore real display before starting ordinary target');const until=performance.now()+5000;while(!control!.state.get().production.some(p=>p.kind==='build'&&p.available)&&performance.now()<until)await settle();const choice=control!.state.get().production.find(p=>p.kind==='build'&&p.available);check(choice,'No actual available building choice');await control!.command('build',choice!.type,choice!.producer);await settle();check(control!.state.get().target?.kind==='build','Ordinary target not active');stableCaption();return {type:choice!.type,proof:await unchanged()}},
 async stress(){check(baseline?.snapshot&&control!.state.get().target,'Ordinary target required');const view=structuredClone(baseline!.snapshot!);view.events=['under_attack','missile_warning','player_defeated'].map((kind,i)=>create(EventSchema,{id:900001+i,tick:view.tick,kind,owner:view.player,value:0n,text:'DISPLAY STRESS: A very long visible operations notice requires complete wrapping and must remain reachable beside the rest of the command information.'}));view.mission=create(MissionProgressSchema,{id:'display-stress-only',version:'1',title:'DISPLAY STRESS — extended mission objective briefing',difficulty:'normal',objectives:Array.from({length:12},(_,i)=>create(ObjectiveProgressSchema,{id:`display-${i}`,text:`Objective ${i+1}: Secure the marked approach and preserve the transport corridor while the allied convoy crosses the operational boundary. This extended instruction must remain fully accessible through ordinary scrolling.`,required:1}))});app.patch({snapshot:view});captions();synthetic=true;await settle();stableCaption();return {proof:await unchanged(),camera:camera()}},
 async review(){check(synthetic,'Display stress required');control!.cancel();const p=current!.entities.find(e=>e.owner===current!.player&&e.position)?.position;check(p,'No owned displayed location');const at=current!.tick;control!.state.update(state=>({...state,target:undefined,pending:false,strikeReview:{phase:'ready',edge:0,observedTick:at,targets:[p!,p!,p!],plan:{order_index:0,kind:'skybreaker',edge:0,routes:[0,1,2].map(i=>({entry:{...p!},drop:{...p!},impact:{...p!},entry_at:at+1+i,release_at:at+101+i,impact_at:at+102+i,splash:1000}))}}}));await settle();check(!document.querySelector('.targeting-hint'),'Ordinary cancel did not clear target before display review');stableCaption();return {proof:await unchanged(),scope:'Synthetic display-only review; no Go plan claimed and Confirm is never clicked'}},
 async cancel(){control!.cancel();await settle();check(!control!.state.get().strikeReview&&!control!.state.get().target,'Cancel failed');stableCaption();return unchanged()},
 async scale(value:number){app.setSettings({...app.state.get().settings,uiScale:value},false);await settle();stableCaption()},
 observe:()=>({camera:camera(),captionStable:stableCaption(),tick:transport?.current?.tick,sendCalls,synthetic,art:art.statistics,frameSubscribers:app.frames.size}),
 restore,
 async menu(){await restore();if(transport&&originalSend)transport.sendOrders=originalSend;await app.leave();await app.releaseBattlefieldArt();await settle();stableCaption();return {captionStable:true,transportPresent:!!app.sessions.transport,frames:app.frames.size,art:art.statistics}},
 async dispose(){if(baseline&&app.sessions.transport)await restore();if(transport&&originalSend)transport.sendOrders=originalSend;root.unmount();app.dispose();await app.releaseBattlefieldArt();await art.dispose();BattleController.prototype.mount=originalMount;return {captionDisconnected:!captionNode?.isConnected,canvases:document.querySelectorAll('canvas').length,frames:app.frames.size,art:art.statistics,audio:app.audio.statistics,sendCalls}},
};
Object.defineProperty(window,'presentationStress',{value:api});root.render(<App app={app}/>);void app.boot();
