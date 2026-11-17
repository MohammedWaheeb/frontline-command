import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SHORTCUT_DEFINITIONS,defaultBindings} from '../../src/runtime/keybindings';
import {HomeMenu} from '../../src/ui/menu/HomeMenu';
import {EditorPanel} from '../../src/ui/EditorPanel';
import {Observable} from '../../src/app/store';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import {decodeContentIndex} from '../../src/runtime/content-library';
import {skirmishPreset} from '../../src/app/skirmish-setup';
import type {Application} from '../../src/app/application';

const read=(file:string)=>readFileSync(resolve(file),'utf8');
const hud=read('src/styles/hud.css'),menu=read('src/styles/menu.css');
const rule=(css:string,selector:string)=>{const match=[...css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(match=>match[1].trim()===selector);assert.ok(match,selector);return match[2]};
const sidebar='.battlefield-screen[data-hud] .command-sidebar[data-hud]';
const index=decodeContentIndex(new Uint8Array(readFileSync(resolve('tests/runtime/fixtures/commander/index.json'))));
function application(){return {state:new Observable({index,settings:DEFAULT_SETTINGS,session:{}}),network:{state:new Observable({})},lastSkirmish:()=>skirmishPreset('1v1','copper-junction'),editor:{state:new Observable({drafts:[]})}} as unknown as Application}

test('V03 remainder: denominators, tier glyph, NEXT and tab badges use scaled 12px type within existing strips',()=>{
 for(const selector of ['.hud-status small','.hud-objective-go small','.production-tabs .tab-count']){
  const body=rule(hud,`${sidebar} ${selector}`),font=body.match(/(?:font|font-size):[^;]*calc\((\d+)px \* var\(--hud-tk\) \* var\(--fc-ui-scale\)\)/);
  assert.ok(font,selector);assert.equal(Number(font[1]),12,selector);
 }
 // Preserve the previously verified 720p row allocations; no strip gets taller.
 for(const [selector,height] of [['.hud-status',20],['.hud-objective',28],['.production-tabs',40]] as const){
  assert.ok(rule(hud,`${sidebar} ${selector}`).includes(`height:calc(${height}px * var(--hud-rk) * var(--fc-ui-scale))`));
  assert.ok(12<height);
 }
 assert.match(rule(hud,':root:has(.battlefield-screen[data-hud])'),/--hud-k:1;--hud-tk:1;/);
 const status=read('src/ui/hud/CommandSidebar.tsx');
 assert.match(status,/<small>\/\{power.capacity\}<\/small>/);assert.match(status,/<small>\/\{supplyCap\}<\/small>/);assert.match(status,/<small>T<\/small>/);
});

test('R2-01: Home retains the full quick setup and lets its state wrap without ellipsis',()=>{
 const html=renderToStaticMarkup(createElement(HomeMenu,{app:application()}));
 const quick=html.match(/<button\b[^>]*aria-label="Quick skirmish"[^>]*>.*?<\/button>/)?.[0];assert.ok(quick);
 assert.match(quick,/Start now · Copper Junction · 1v1 · Normal AI/);
 const state=rule(menu,'.fcm-row-state');
 assert.match(state,/white-space:normal/);assert.match(state,/overflow-wrap:anywhere/);
 assert.doesNotMatch(state,/overflow:hidden|text-overflow:ellipsis|line-clamp/);
 const row=rule(menu,'.fcm-shell .fcm-row');
 assert.match(row,/min-height:var\(--fcm-row-h/);assert.doesNotMatch(row,/(?:^|;)height:/,'wrapping may grow the row');
});

test('R2-02: all remappable actions have player-language labels and contextual actions retain IDs/defaults',()=>{
 for(const action of SHORTCUT_DEFINITIONS){assert.match(action.label,/^[A-Z]/,action.id);assert.doesNotMatch(action.label,/_/,action.id);assert.notEqual(action.label,action.id)}
 const labels={build:'Build',resume:'Resume build',train:'Train unit',research:'Research',cancel_production:'Cancel production',sell:'Sell',power:'Toggle power',gather:'Gather supplies',salvage:'Salvage',repeat_sortie:'Repeat sortie',repair_reserve:'Repair reserve',surrender_vote:'Vote to surrender',surrender_cancel:'Cancel surrender vote',convoy_hold:'Hold convoy',convoy_advance:'Advance convoy',ping:'Ping'};
 for(const [id,label] of Object.entries(labels)){
  const action=SHORTCUT_DEFINITIONS.find(action=>action.id===id);assert.ok(action,id);assert.equal(action.label,label);assert.equal(action.category,'orders');assert.deepEqual(action.defaults,[]);
  for(const layout of ['frontline','classic','grid'] as const)assert.deepEqual(defaultBindings('standard',layout).keys[id],[],`${id}/${layout}`);
 }
});

test('R2-03: editor draft placeholder has reserved width and compact toolbar may wrap around it',()=>{
 for(const editing of [false,true])for(const saved of [false,true]){
  const app=application(),drafts=saved?[{id:'draft-1',title:'Copper Junction — custom'}]:[];
  const snapshot=editing?{documentId:'doc',dirty:true,map:{title:'Copper Junction — custom',width:64,height:64,spawns:[],fields:[],tiles:[],shipment:{x:0,y:0}}}:undefined;
  app.editor.state.set({drafts,snapshot} as never);
  const html=renderToStaticMarkup(createElement(EditorPanel,{app}));
  const select=html.match(/<select\b[^>]*aria-label="Editor draft"[^>]*>.*?<\/select>/)?.[0];assert.ok(select);
  assert.match(select,/style="min-width:8em"/);assert.ok(select.includes(`<option value="" selected="">${saved?'Choose…':'No drafts'}</option>`));
  assert.equal(select.includes('disabled=""'),!saved);if(saved)assert.match(select,/<option value="draft-1">Copper Junction — custom<\/option>/);
  assert.match(html,/class="rec-editor-card" style="flex-wrap:wrap"/);
  if(editing)assert.match(html,/rec-editor-launch is-compact/);
 }
});
