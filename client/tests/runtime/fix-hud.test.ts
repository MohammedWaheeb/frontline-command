import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {minimapCursorMove,minimapFogBrightness,minimapLayout,minimapProject,MinimapTerrainRaster} from '../../src/render/minimap';
import {DeploymentCountdown} from '../../src/ui/hud/DeploymentCountdown';

const read=(file:string)=>readFileSync(path.resolve(file),'utf8'),css=read('src/styles/hud.css');
const rule=(selector:string)=>{const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const body=css.match(new RegExp(escaped+'\\{([^}]+)\\}'))?.[1];assert.ok(body,selector);return body};

test('C1-04: minimap consumes its setting and stays inside the sidebar and 720p budget',()=>{
 const frame=rule('.minimap-frame');assert.match(frame,/--hud-minimap-scale:clamp\(\.8,var\(--ui-minimap-scale,1\),1\.4\)/);
 assert.match(frame,/width:min\(calc\(var\(--sb-inner\) - 6px \* var\(--fc-ui-scale\)\),calc\(180px \* var\(--hud-k\) \* var\(--fc-ui-scale\) \* var\(--hud-minimap-scale\)\),32vh\)/);
 assert.match(frame,/box-sizing:border-box/);assert.doesNotMatch(css,/minimap-frame canvas\{max-height:/);
 for(const [w,h,base,k] of [[1024,768,224,1],[1280,720,224,1],[1600,900,272,1.214]])for(const ui of [.85,1,1.25,1.5]){
  const sidebar=Math.min(w*.3,base*ui),inner=sidebar-3-16*k*ui,available=inner-6*ui;
  const size=(setting:number)=>Math.min(available,180*k*ui*Math.max(.8,Math.min(1.4,setting)),h*.32);
  assert.ok(size(.8)<size(1.4),`${w}x${h} at ${ui}: slider must change geometry`);
  assert.ok(size(1.4)<=available&&size(1.4)/2<=h*.16,'preserve space for production');
  for(const setting of [.8,1,1.4]){const width=size(setting)-4*k*ui,height=width/2,b=minimapLayout(128,96,width,height);assert.ok(b.x>=5.99&&b.y>=5.99);assert.ok(b.x+b.width<=width-5.99&&b.y+b.height<=height-5.99)}
 }
});

test('V03/V06: critical type resolves to at least 12px at scale 1 and lock leaves the portrait clear',()=>{
 for(const selector of ['[data-hud] kbd','.sidebar-utilities kbd','.production-tabs .tab-key','.cameo-price','.production-cameo .cameo-key']){
  const font=rule(selector).match(/(?:font|font-size):[^;]*calc\((\d+)px \* var\(--hud-tk\) \* var\(--fc-ui-scale\)\)/);assert.ok(font,selector);assert.ok(Number(font[1])>=12,selector);
 }
 assert.match(css,/font:700 calc\(12px \* var\(--hud-tk\) \* var\(--fc-ui-scale\)\)\/1\.2 var\(--fc-font-label\)/);
 assert.match(css,/inset:auto auto calc\(16px \* var\(--hud-tk\) \* var\(--fc-ui-scale\)\) 2px;transform:none/);
 assert.match(css,/grayscale\(\.7\) brightness\(\.88\) contrast\(\.95\)/);
 assert.match(css,/rgba\(0,0,0,\.10\) 0 2px,transparent 2px 12px/);
 assert.match(css,/\.production-cameo\[data-state=locked\] \.disabled-reason\{inset:auto auto 2px 2px;padding:2px;max-width:none/);
 assert.match(rule('.production-cameo[data-state=locked] .disabled-reason .icon'),/display:block/);
 assert.match(rule('.production-cameo[data-state=locked] .disabled-reason[data-tag]::after'),/content:none/);
});

test('C1-09: objective pulse requires OS normal motion and no in-game reduction',()=>{
 const animation=css.match(/@media \(prefers-reduced-motion:([^)]*)\)\{([^{}]+)\{animation:hud-beckon[^}]+\}\}/);assert.ok(animation);
 assert.equal(animation[1],'no-preference');assert.match(animation[2],/:root:not\(\[data-reduced-motion=true\]\)/);
 const enabled=(osReduced:boolean,gameReduced:boolean)=>!osReduced&&!gameReduced;
 assert.equal(enabled(false,true),false);assert.equal(enabled(true,false),false);assert.equal(enabled(false,false),true);
});

test('V07: shroud terrain is brighter but remains distinct from memory and sight',()=>{
 assert.equal(minimapFogBrightness(0,0,0),1);assert.equal(minimapFogBrightness(1,0,0),.55);
 const shroud=[0,1,2,3].map(x=>minimapFogBrightness(2,x,0));assert.deepEqual(shroud,[.28,.36,.36,.36]);assert.ok(Math.max(...shroud)<minimapFogBrightness(1,0,0));
});

test('V07: raster changes terrain pixels only and never reads actor data',()=>{
 const original=globalThis.document;let pixels:Uint8ClampedArray|undefined;
 const context={createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:(image:{data:Uint8ClampedArray})=>{pixels=image.data.slice()}};
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context})} as unknown as Document;
 try{
  const map={width:4,height:1,tiles:Array.from({length:4},()=>({terrain:'open',height:0})),get entities(){return assert.fail('terrain raster must not inspect actors')}};
  const raster=new MinimapTerrainRaster(()=>[100,100,100]);raster.paint(map as never,[false,false,true,false],[false,true,true,false]);
  assert.deepEqual([...pixels!],[28,28,28,255,55,55,55,255,100,100,100,255,36,36,36,255]);raster.dispose();
 }finally{globalThis.document=original}
});

test('C1-08: arrow cursor follows screen directions and clamps to map extents',()=>{
 for(const [w,h] of [[128,128],[128,64],[64,128]]){
  const center={x:w*500,y:h*500},box=minimapLayout(w,h,300,150),start=minimapProject(box,center);
  for(const key of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown']){
   const point=minimapCursorMove(w,h,center,key)!,screen=minimapProject(box,point);
   if(key==='ArrowLeft')assert.ok(screen.x<start.x);if(key==='ArrowRight')assert.ok(screen.x>start.x);if(key==='ArrowUp')assert.ok(screen.y<start.y);if(key==='ArrowDown')assert.ok(screen.y>start.y);
   let edge=point;for(let i=0;i<100;i++)edge=minimapCursorMove(w,h,edge,key)!;assert.ok(edge.x>=0&&edge.x<w*1000&&edge.y>=0&&edge.y<h*1000);
  }
  assert.equal(minimapCursorMove(w,h,center,'KeyA'),undefined);
 }
});

// Real JSX and event callbacks, with explicit recording hook peers. This is not
// React DOM/browser emulation: CSS layout, focus dispatch and AT remain QA work.
const bundle=await build({stdin:{contents:`export {CommandSidebar,TacticalMinimap} from './src/ui/hud/CommandSidebar';export {EconomyPopover} from './src/ui/hud/EconomyPopover';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',target:'node24',packages:'external',plugins:[{name:'hud-hook-peers',setup(builder){
 builder.onResolve({filter:/^react\/jsx-runtime$/},()=>({path:pathToFileURL(createRequire(import.meta.url).resolve('react/jsx-runtime')).href,external:true}));
 builder.onResolve({filter:/^react$/},()=>({path:'react',namespace:'peer'}));
 builder.onResolve({filter:/\/(primitives|ProductionPanel|CameoTooltip)$/},args=>({path:args.path,namespace:'peer'}));
 builder.onLoad({filter:/.*/,namespace:'peer'},({path:file})=>({contents:file==='react'?`export const useId=()=> 'hud-test',useState=(...args)=>globalThis.__hudHooks.state(...args),useRef=(value)=>globalThis.__hudHooks.ref(value),useEffect=(effect)=>globalThis.__hudHooks.effect(effect);`:/primitives$/.test(file)?`export const Icon=()=>null,Emblem=()=>null;`:/ProductionPanel$/.test(file)?`export const ProductionPanel=()=>null;`:`export const useSidebarTooltip=()=>({tip:undefined,trigger:()=>({}),hide:()=>{}}),SidebarTooltip=()=>null,KeyTipBody=()=>null;`,loader:'js'}));
}}]});
const components=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
function hooks(){const effects:Array<()=>unknown>=[],values:any[]=[];let index=0;const api={effect(effect:()=>unknown){effects.push(effect)},state(initial:any){const i=index++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],(value:any)=>{values[i]=typeof value==='function'?value(values[i]):value}]},ref(value:any){const i=index++;return values[i]??=( {current:value})}};return {effects:()=>effects.splice(0).map(effect=>effect()),render(component:any,props:any){index=0;(globalThis as any).__hudHooks=api;return component(props)}}}
function elements(node:any):any[]{if(Array.isArray(node))return node.flatMap(elements);if(!node||typeof node!=='object'||!node.props)return [];return [node,...elements(node.props.children)]}
const find=(node:any,predicate:(element:any)=>boolean)=>{const match=elements(node).find(predicate);assert.ok(match);return match};
function event(key:string){return {key,prevented:false,stopped:false,preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true}}}
const view=()=>({state:{session:{kind:'solo',map:{width:128,height:96}},paused:true,settings:{bindings:{keys:{}}}},sceneLoading:false,app:{patch(){}},battle:{ids:[],affordances:{player_commands:['repair_reserve']}},catalog:{units:new Map(),buildings:new Map()},faction:'US',control:{renderer:{center(_point:unknown){}}},minimap:{current:null},commandKinds:[]});

test('C1-07: Close, Apply and Enter dismiss and return focus; reserve shortcut explicitly opens',()=>{
 const h=hooks(),v=view(),render=()=>h.render(components.CommandSidebar,{view:v});let tree=render(),focused=0;
 const credit=()=>find(tree,node=>node.props.className==='hud-credits');credit().props.ref.current={focus(){focused++}};
 credit().props.onClick();tree=render();assert.equal(credit().props['aria-expanded'],true);
 const p=hooks(),panel=()=>p.render(components.EconomyPopover,find(tree,node=>node.type===components.EconomyPopover).props);
 let section=panel();find(section,node=>node.props['aria-label']==='Close economy panel').props.onClick();tree=render();assert.equal(focused,1);assert.equal(credit().props['aria-expanded'],false);
 section=panel();assert.equal(section.props['aria-hidden'],true);for(const node of elements(section).filter(node=>node.type==='input'||node.type==='button'))assert.equal(node.props.tabIndex,-1);
 find(section,node=>node.props['data-repair-reserve']!==undefined).props.onFocus();tree=render();assert.equal(credit().props['aria-expanded'],true);
 let applied=0;(v.control as any).command=()=>{applied++};section=panel();const input=find(section,node=>node.type==='input'),enter=event('Enter');input.props.onKeyDown(enter);tree=render();assert.equal(applied,1);assert.equal(focused,2);assert.equal(enter.prevented,true);assert.equal(credit().props['aria-expanded'],false);
 credit().props.onClick();tree=render();section=panel();find(section,node=>node.type==='button'&&node.props.children==='Apply').props.onClick();tree=render();assert.equal(applied,2);assert.equal(focused,3);assert.equal(credit().props['aria-expanded'],false);
 credit().props.onClick();tree=render();section=panel();const esc=event('Escape');section.props.onKeyDown(esc);assert.equal(esc.stopped,true);assert.equal(esc.prevented,true);assert.equal(focused,4);
 assert.match(rule('.hud-economy[data-open]'),/opacity:1;pointer-events:auto/);assert.doesNotMatch(css,/\.hud-economy[^{}]*:focus-within/);
});

test('C1-07: invalid or unavailable reserve cannot apply via Enter',()=>{
 for(const available of [true,false]){
  const h=hooks();let applied=0,closed=0;const props={open:true,onOpen(){},onClose(){closed++},onApply(){applied++},disabled:false,available};
  let tree=h.render(components.EconomyPopover,props);if(available){find(tree,node=>node.type==='input').props.onChange({target:{value:'invalid'}});tree=h.render(components.EconomyPopover,props)}
  find(tree,node=>node.type==='input').props.onKeyDown(event('Enter'));assert.equal(applied,0);assert.equal(closed,0);
 }
});

test('C1-08: actual minimap handlers own keys, preserve Tab and centre the chosen cursor',()=>{
 const h=hooks(),v=view(),centres:unknown[]=[];v.control.renderer.center=point=>{centres.push(point)};
 const render=()=>h.render(components.TacticalMinimap,{view:v});let tree=render();const canvas=()=>find(tree,node=>node.type==='canvas');
 assert.equal(canvas().props.tabIndex,0);assert.match(canvas().props.title,/Arrow keys/);assert.match(rule('.minimap-frame canvas:focus-visible'),/outline:2px solid var\(--hud-amber-hi\)/);
 canvas().props.onFocus();tree=render();const arrow=event('ArrowRight');canvas().props.onKeyDown(arrow);tree=render();assert.ok(arrow.stopped&&arrow.prevented);assert.equal(centres.length,0);assert.ok(elements(tree).some(node=>node.props.className==='minimap-cursor'));
 const target=minimapCursorMove(128,96,{x:64000,y:48000},'ArrowRight');for(const key of ['Enter',' ']){const press=event(key);canvas().props.onKeyDown(press);assert.ok(press.prevented&&press.stopped)}assert.deepEqual(centres,[target,target]);
 for(const key of ['Tab','a','F1','Escape']){const press=event(key);canvas().props.onKeyDown(press);assert.equal(press.stopped,true);assert.equal(press.prevented,false);canvas().props.onKeyUp(press);assert.equal(press.stopped,true)}assert.equal(centres.length,2);
 canvas().props.onBlur();tree=render();assert.ok(!elements(tree).some(node=>node.props.className==='minimap-cursor'));
});

test('C1-08: cursor projection follows resized canvas and the observer disconnects',()=>{
 const original=globalThis.ResizeObserver;let callback=()=>{},observed:unknown,disconnected=false;
 globalThis.ResizeObserver=class {constructor(resize:()=>void){callback=resize}observe(node:unknown){observed=node}disconnect(){disconnected=true}} as unknown as typeof ResizeObserver;
 try{
  const h=hooks(),v=view(),canvas={clientWidth:176,clientHeight:88,offsetLeft:2,offsetTop:2};(v.minimap as any).current=canvas;
  let tree=h.render(components.TacticalMinimap,{view:v});const cleanup=h.effects()[0] as ()=>void;assert.equal(observed,canvas);callback();find(tree,node=>node.type==='canvas').props.onFocus();tree=h.render(components.TacticalMinimap,{view:v});
  let marker=find(tree,node=>node.props.className==='minimap-cursor');assert.equal(marker.props.style.left,'90px');assert.equal(marker.props.style.top,'46px');
  canvas.clientWidth=220;canvas.clientHeight=110;callback();tree=h.render(components.TacticalMinimap,{view:v});marker=find(tree,node=>node.props.className==='minimap-cursor');assert.equal(marker.props.style.left,'112px');assert.equal(marker.props.style.top,'57px');cleanup();assert.equal(disconnected,true);
 }finally{globalThis.ResizeObserver=original}
});

test('V08: readiness has one preparation message, then deployment, then no overlay',()=>{
 const html=(loading:boolean,countdown:number)=>renderToStaticMarkup(createElement(DeploymentCountdown,{view:{sceneLoading:loading,snapshot:{countdown}} as never}));
 assert.match(html(true,100),/Preparing battlefield/);assert.match(html(true,100),/deployment begins when ready/);assert.doesNotMatch(html(true,100),/role="timer"/);
 assert.match(html(false,100),/Deployment in 5 seconds/);assert.doesNotMatch(html(false,100),/Preparing|Loading art/);assert.equal(html(false,0),'');assert.doesNotMatch(html(true,0),/deployment begins/);
 assert.doesNotMatch(read('src/ui/hud/BattleScreen.tsx'),/className="scene-loading"/);
 const h=hooks(),v=view();v.sceneLoading=true;const tree=h.render(components.CommandSidebar,{view:v});assert.ok(!elements(tree).some(node=>node.type?.name==='BattlefieldStatus'));
});
