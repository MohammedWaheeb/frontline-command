import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MenuFocus} from '../../src/ui/menu/menu-focus';
import {SkirmishScreen} from '../../src/ui/menu/skirmish/SkirmishScreen';
import {HomeMenu} from '../../src/ui/menu/HomeMenu';
import {EditorPanel} from '../../src/ui/EditorPanel';
import {Observable} from '../../src/app/store';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import {decodeContentIndex} from '../../src/runtime/content-library';
import {skirmishPreset} from '../../src/app/skirmish-setup';
import type {Application} from '../../src/app/application';

const read=(file:string)=>readFileSync(resolve(file),'utf8');
const index=decodeContentIndex(new Uint8Array(readFileSync(resolve('tests/runtime/fixtures/commander/index.json'))));
const rule=(css:string,selector:string)=>[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(match=>match[1].trim().split(',').includes(selector)).map(match=>match[2]).join(';');
function application(mapID='copper-junction'){
 return {state:new Observable({index,settings:DEFAULT_SETTINGS,session:{}}),network:{state:new Observable({})},lastSkirmish:()=>skirmishPreset('1v1',mapID),campaignFaction:()=> 'US',editor:{state:new Observable({drafts:[]})}} as unknown as Application;
}

test('M1-04: entry focuses heading; Home restores the invoking control across unmounts',()=>{
 const focus=new MenuFocus(),calls:string[]=[];let modal=false;
 const node=(key:string)=>({dataset:{menuFocus:key},focus:()=>calls.push(key)});
 let rows=[node('hero'),node('campaign'),node('settings')];
 const heading={focus:()=>calls.push('heading')};
 const root={ownerDocument:{querySelector:()=>modal?{}:null},contains:(control:unknown)=>rows.includes(control as never),querySelectorAll:()=>rows,querySelector:(selector:string)=>selector.startsWith('h1')?heading:rows[0]} as unknown as HTMLElement;
 focus.enter(root,'command',true);assert.deepEqual(calls,[],'first-run focus stays with onboarding');
 for(const origin of ['hero','campaign','settings']){
  focus.remember(root,{closest:()=>rows.find(row=>row.dataset.menuFocus===origin)} as unknown as HTMLElement);
  focus.enter(root,'skirmish',false);assert.equal(calls.at(-1),'heading');
  const count:number=calls.length;focus.enter(root,'skirmish',false);assert.equal(calls.length,count,'same-screen updates leave controls alone');
  focus.enter(root,'help',false);assert.equal(calls.at(-1),'heading','sibling screens also focus headings');
  rows=rows.map(row=>node(row.dataset.menuFocus));
  focus.enter(root,'command',true);assert.equal(calls.at(-1),origin);
 }
 modal=true;const count:number=calls.length;focus.enter(root,'settings',false);assert.equal(calls.length,count,'open modal keeps focus');
 modal=false;focus.enter(root,'command',true);rows=[node('hero')];focus.enter(root,'help',false);focus.enter(root,'command',true);assert.equal(calls.at(-1),'hero','removed row has a reachable fallback');
 const shell=read('src/ui/menu/MenuShell.tsx');
 assert.match(shell,/useLayoutEffect\(\(\)=>\{if\(shell.current\)focus.current.enter\(shell.current,state.page,home\)\}/);
 assert.match(shell,/onFocusCapture=\{rememberFocus\} onClickCapture=\{rememberFocus\}/);
 assert.equal([...shell.matchAll(/<h1 tabIndex=\{-1\}/g)].length,2);
 assert.match(shell,/event.preventDefault\(\);back\(\)/);assert.match(shell,/const back=useCallback\(\(\)=>app.patch\(\{page:'command'\}\)/);
});

test('M1-05: all six map captions exist and split/stack strips wrap without clipping',()=>{
 const html=renderToStaticMarkup(createElement(SkirmishScreen,{app:application()}));
 for(const map of index.maps.filter(map=>['copper-junction','industrial-valley','port-outskirts','relay-heights','dry-river','border-depots'].includes(map.id)))assert.ok(html.includes(`<span>${map.title}</span>`),map.title);
 const css=read('src/styles/skirmish.css');
 for(const layout of ['split','stack']){
  const caption=rule(css,`.sk-layout-${layout} .sk-thumbs .fcm-map-thumb-caption`);
  assert.match(caption,/display:block/);assert.match(caption,/white-space:normal/);assert.match(caption,/overflow:visible/);assert.match(caption,/overflow-wrap:anywhere/);assert.doesNotMatch(caption,/ellipsis|nowrap|line-clamp/);
 }
 assert.match(rule(css,'.sk-layout-stack .sk-thumbs'),/repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(rule(css,'.sk-layout-stack .sk-thumbs .fcm-map-thumb-art'),/width:calc\(40px/);
});

test('M1-08: unavailable presets reference a visible reason; four-player maps need no warning',()=>{
 for(const mapID of ['copper-junction','industrial-valley']){
  const html=renderToStaticMarkup(createElement(SkirmishScreen,{app:application(mapID)})),capacity=index.maps.find(map=>map.id===mapID)!.players;
  const buttons=[...html.matchAll(/<button[^>]*class="sk-preset[^>]*>.*?<\/button>/g)].map(match=>match[0]);assert.equal(buttons.length,3);
  if(capacity<4){
   assert.ok(html.includes('<p id="sk-preset-note" class="sk-rule-note">2 v 2 and Free-for-all need a 4-player battlefield.'));
   for(const button of buttons.slice(1)){assert.match(button,/disabled=""/);assert.match(button,/aria-describedby="sk-preset-note"/)}
   assert.doesNotMatch(buttons[0],/disabled=""|aria-describedby/);
  }else{assert.doesNotMatch(html,/id="sk-preset-note"/);for(const button of buttons)assert.doesNotMatch(button,/disabled=""|aria-describedby/)}
 }
});

test('M1-11: editor names the current map and displays named tools/terrain with stable IDs',()=>{
 const app=application(),map={title:'Industrial Valley — custom',width:64,height:64,spawns:[],fields:[],tiles:[],shipment:{x:0,y:0}};
 app.editor.state.set({drafts:[],snapshot:{map,documentId:'doc',dirty:true}} as never);
 const html=renderToStaticMarkup(createElement(EditorPanel,{app}));
 assert.ok(html.includes('<h2>Industrial Valley — custom</h2>'));assert.ok(html.includes('Unsaved changes'));
 assert.match(html,/<option value="terrain" selected="">Paint Terrain<\/option>/);assert.match(html,/<option value="spawn">Player Start<\/option>/);assert.match(html,/<option value="open" selected="">Open<\/option>/);
 assert.match(rule(read('src/styles/menu.css'),'.fcm-shell .editor-toolbar .fcm-btn'),/font-size:var\(--fc-type-caption-size\)/);
 assert.match(html,/>Title<input/);assert.match(html,/>ID<input/);assert.match(html,/fcm-btn fcm-btn--primary fcm-btn--sm/);
 map.title='Imported Depot';app.editor.state.set({drafts:[],storedRevision:1,snapshot:{map,documentId:'other',dirty:false}} as never);
 const next=renderToStaticMarkup(createElement(EditorPanel,{app}));assert.ok(next.includes('<h2>Imported Depot</h2>'));assert.ok(next.includes('Draft saved in this browser'));assert.doesNotMatch(next.match(/<header class="fcm-editor-heading">.*?<\/header>/)![0],/Industrial Valley/);
});

// Actual JSX callbacks against recording hook peers, not DOM/browser emulation.
const bundled=await build({stdin:{contents:`export {EditorPanel} from './src/ui/EditorPanel';export {HomeMenu} from './src/ui/menu/HomeMenu';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,loader:{'.css':'empty'},platform:'node',format:'esm',target:'node24',plugins:[{name:'menus2-hooks',setup(builder){
 builder.onResolve({filter:/^(react\/jsx-runtime|react-dom)$/},args=>({path:pathToFileURL(createRequire(import.meta.url).resolve(args.path)).href,external:true}));
 builder.onResolve({filter:/^react$/},()=>({path:'react',namespace:'peer'}));
 builder.onResolve({filter:/\/(app\/store|Archives|primitives|render\/editor-handles)$/},args=>({path:args.path,namespace:'peer'}));
 builder.onLoad({filter:/.*/,namespace:'peer'},({path})=>({contents:path==='react'?`export const useId=()=> 'menus2',useState=(value)=>globalThis.__menus2.state(value),useRef=(value)=>({current:value}),useEffect=()=>{},useLayoutEffect=()=>{},useContext=()=>null,createContext=()=>({}),useSyncExternalStore=(_,get)=>get(),useMemo=(fn)=>fn(),useCallback=(fn)=>fn;`:/app\/store$/.test(path)?`export const useObservable=(state)=>state.get();`:/Archives$/.test(path)?`export const downloadFile=()=>{};`:/editor-handles$/.test(path)?`export class EditorHandles{};`:`export const Icon=()=>null,Emblem=()=>null,Modal=()=>null;`,loader:'js'}));
}}]});
const components=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
function hooks(){let i=0;const values:any[]=[];return {values,render(component:any,props:any){i=0;(globalThis as any).__menus2={state(initial:any){const at=i++;if(!(at in values))values[at]=typeof initial==='function'?initial():initial;return [values[at],(value:any)=>{values[at]=typeof value==='function'?value(values[at]):value}]}};return component(props)}}}
function elements(node:any):any[]{if(Array.isArray(node))return node.flatMap(elements);if(!node||typeof node!=='object'||!node.props)return [];return [node,...elements(node.props.children)]}
const find=(node:any,match:(element:any)=>boolean)=>{const found=elements(node).find(match);assert.ok(found);return found};

test('M1-11: Map Object shows named classes and retains their submitted enum IDs',()=>{
 const h=hooks(),app=application();app.editor.clearPreview=()=>{};
 app.state.set({...app.state.get(),catalog:{objects:new Map([['light_prop',{}],['civilian_building',{}]])}} as never);
 app.editor.state.set({drafts:[],snapshot:{map:{title:'Depot',width:64,height:64,spawns:[]},documentId:'doc',dirty:true}} as never);
 let tree=h.render(components.EditorPanel,{app});find(tree,node=>node.props['aria-label']==='Editor tool').props.onChange({target:{value:'object'}});
 tree=h.render(components.EditorPanel,{app});const options=elements(find(tree,node=>node.props['aria-label']==='Map object class')).filter(node=>node.type==='option');
 assert.deepEqual(options.map(node=>[node.props.value,node.props.children]),[['light_prop','Light Prop'],['civilian_building','Civilian Building']]);
 find(tree,node=>node.props['aria-label']==='Map object class').props.onChange({target:{value:'civilian_building'}});
 tree=h.render(components.EditorPanel,{app});assert.equal(find(tree,node=>node.props['aria-label']==='Map object class').props.value,'civilian_building');
});

test('M1-12: home has one setup route and one instant action; Continue restores the normal setup row',()=>{
 const app=application(),patches:unknown[]=[];let quick=0;app.patch=(patch:any)=>{patches.push(patch)};app.quickSkirmish=async()=>{quick++};
 const html=renderToStaticMarkup(createElement(HomeMenu,{app}));
 assert.ok(html.includes('aria-label="Set up skirmish"'));assert.doesNotMatch(html,/aria-label="Skirmish"/);assert.ok(html.includes('Start now · Copper Junction'));
 const h=hooks();let tree=h.render(components.HomeMenu,{app});
 find(tree,node=>node.props['aria-label']==='Set up skirmish').props.onClick();assert.deepEqual(patches,[{page:'skirmish'}]);
 const row=find(tree,node=>node.props.label==='Quick skirmish');row.props.onSelect();assert.equal(quick,1);assert.match(row.props.state,/^Start now/);
 assert.equal(elements(tree).filter(node=>node.props.entry?.page==='skirmish').length,1);
 h.values[0]={id:'saved',name:'Saved operation',updated:Date.now(),kind:'auto'};tree=h.render(components.HomeMenu,{app});
 assert.ok(find(tree,node=>node.props['aria-label']==='Continue'));
 const setup=elements(tree).find(node=>node.props.entry?.page==='skirmish'&&!node.props.label);assert.ok(setup);setup.props.onSelect();assert.equal(patches.length,2);
 assert.equal(elements(tree).filter(node=>node.props.label==='Quick skirmish').length,1);
});


test('R1-01: Home hook bundle retains the net3 rejoin hero and dispatches joinMatch',()=>{
 const app=application(),h=hooks();let joined=0;app.network.joinMatch=async()=>{joined++};
 app.network.state.set({account:{profile:{id:'self'}},lobbyState:'active',lobby:{id:'live',name:'Live operation',match_id:'match',slots:[{profile:'self'}]}} as never);
 const tree=h.render(components.HomeMenu,{app}),hero=find(tree,node=>node.props['aria-label']==='Rejoin operation');
 assert.equal(hero.props.disabled,false);hero.props.onClick();assert.equal(joined,1);assert.ok(!elements(tree).some(node=>node.props['aria-label']==='Set up skirmish'));
});
