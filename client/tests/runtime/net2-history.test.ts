import test from 'node:test';
import assert from 'node:assert/strict';
import {Application,bindMenuHistory,type ApplicationState,type Page} from '../../src/app/application';
import {Observable} from '../../src/app/store';

/** Explicit same-document History peer; traversing the external entry records an escape. */
function browser(initial?:unknown){
 const url='http://127.0.0.1:8111/play?invite=KEEP#offline',entries=[{state:null as unknown,url:'about:blank'},{state:initial??{other:'preserved'},url}],listeners=new Set<(event:PopStateEvent)=>void>();
 let position=1,escaped=0;
 const history={get state(){return entries[position].state},replaceState(state:unknown,_title:string,next?:string|URL|null){entries[position]={state,url:next?String(next):entries[position].url}},pushState(state:unknown,_title:string,next?:string|URL|null){entries.splice(position+1);entries.push({state,url:next?String(next):entries[position].url});position++}};
 const host={history,addEventListener(_type:string,listener:(event:PopStateEvent)=>void){listeners.add(listener)},removeEventListener(_type:string,listener:(event:PopStateEvent)=>void){listeners.delete(listener)}} as unknown as Parameters<typeof bindMenuHistory>[1];
 return {host,entries,listeners,get escaped(){return escaped},get length(){return entries.length},get position(){return position},get url(){return entries[position].url},go(delta:number){const target=position+delta;if(target<0||target>=entries.length)return;position=target;if(entries[position].url==='about:blank'){escaped++;return}for(const listener of [...listeners])listener({state:entries[position].state} as PopStateEvent)}};
}
function fixture(page:Page='command'){
 const app=Object.create(Application.prototype) as Application;
 Object.assign(app,{state:new Observable({page,booting:false,firstRun:false,paused:false,session:{phase:'menu'}} as ApplicationState)});
 return app;
}
test('M1-03: actual page patches push once, Back/Forward restore menus, repeated Home Back stays in-document',()=>{
 const app=fixture(),tab=browser(),close=bindMenuHistory(app,tab.host,()=>false),url=tab.url;
 assert.equal(tab.length,3);assert.equal((tab.host.history.state as any).other,'preserved');
 app.patch({page:'skirmish'});app.patch({page:'help',notice:'Fresh notice'});const length=tab.length;
 app.patch({page:'help',paused:true});assert.equal(tab.length,length);
 tab.go(-1);assert.equal(app.state.get().page,'skirmish');assert.equal(app.state.get().notice,undefined);assert.equal(tab.length,length);
 tab.go(1);assert.equal(app.state.get().page,'help');assert.equal(tab.length,length);
 tab.go(-1);tab.go(-1);assert.equal(app.state.get().page,'command');
 for(let i=0;i<12;i++){tab.go(-1);assert.equal(app.state.get().page,'command');assert.equal(tab.url,url)}
 assert.equal(tab.escaped,0);assert.ok(tab.entries.slice(1).every(entry=>entry.url===url));
 close();assert.equal(tab.listeners.size,0);const count=tab.length;app.patch({page:'saves'});assert.equal(tab.length,count);
});
test('M1-03: every top-level page is restored from history without URL paths or duplicate entries after remount/reload',()=>{
 const app=fixture(),tab=browser();let close=bindMenuHistory(app,tab.host,()=>false);
 const pages:Page[]=['skirmish','campaign','tutorials','saves','settings','network','coop','replays','content','practice','help','editor','mastery'];
 for(const page of pages){app.patch({page});assert.equal((tab.host.history.state as any).frontlineMenu.page,page)}
 const count=tab.length;close();const reloaded=fixture();close=bindMenuHistory(reloaded,tab.host,()=>false);
 assert.equal(reloaded.state.get().page,'mastery');assert.equal(tab.length,count);
 tab.go(-1);assert.equal(reloaded.state.get().page,'editor');close();
 const floor=browser({frontlineMenu:{version:1,page:'command',floor:true}}),home=fixture();const finish=bindMenuHistory(home,floor.host,()=>false);floor.go(-1);assert.equal(floor.escaped,0);assert.equal(home.state.get().page,'command');finish();
 const invalid=browser({frontlineMenu:{version:1,page:'not-a-page'}});const stop=bindMenuHistory(fixture(),invalid.host,()=>false);assert.equal((invalid.host.history.state as any).frontlineMenu.page,'command');stop();
});
test('M1-03: Back is inert through live/online/replay/loading sessions, global dialogs, local modals and preparation',()=>{
 const blockers:Partial<ApplicationState>[]=[
  {session:{phase:'active',id:'solo',kind:'solo'}},{session:{phase:'active',id:'online',kind:'online'}},{session:{phase:'active',id:'replay',kind:'replay'}},
  {session:{phase:'loading'}},{booting:true},{busy:'Preparing…'},{assetProgress:'Loading…'},{firstRun:true},{error:{code:'save_corrupt',message:'Unreadable save.'}},
  {briefing:{} as NonNullable<ApplicationState['briefing']>},
 ];
 for(const blocker of blockers){
  const app=fixture(),tab=browser(),close=bindMenuHistory(app,tab.host,()=>false);app.patch({page:'help',...blocker,notice:'Keep me'});const state=app.state.get();
  for(let i=0;i<4;i++){tab.go(-1);assert.equal(app.state.get(),state);assert.equal(tab.escaped,0);assert.equal((tab.host.history.state as any).frontlineMenu.page,'help')}
  close();
 }
 const app=fixture(),tab=browser();let modal=true;const close=bindMenuHistory(app,tab.host,()=>modal);app.patch({page:'settings'});tab.go(-1);assert.equal(app.state.get().page,'settings');modal=false;tab.go(-1);assert.equal(app.state.get().page,'command');assert.equal(tab.escaped,0);close();
});
