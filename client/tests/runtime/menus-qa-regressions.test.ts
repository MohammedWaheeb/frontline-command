import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CoopMissionCopy} from '../../src/ui/network/CoopLanding';
import {observeMoreBelow,ScrollContinuation} from '../../src/ui/HelpPanel';
import {CommanderProgressView} from '../../src/ui/CommanderProgress';
import {commanderOverview} from '../../src/runtime/commander-progress';
import {decodeContentIndex} from '../../src/runtime/content-library';
import {SkirmishScreen} from '../../src/ui/menu/skirmish/SkirmishScreen';
import {skirmishPreset} from '../../src/app/skirmish-setup';
import {Observable} from '../../src/app/store';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import type {Application} from '../../src/app/application';

const css=readFileSync(resolve('src/styles/records.css'),'utf8');
const networkCSS=readFileSync(resolve('src/ui/network/network.css'),'utf8');
function declarations(source:string,selector:string){return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(match=>match[1].trim()===selector).map(match=>match[2]).join(';')}

test('C1-03: rendered duel pickers offer all four map starts and keep remembered start four selected',()=>{
 const index=decodeContentIndex(new Uint8Array(readFileSync(resolve('tests/runtime/fixtures/commander/index.json'))));
 const setup=skirmishPreset('1v1','industrial-valley');setup.slots[0].spawn=4;
 const app={state:new Observable({index,settings:DEFAULT_SETTINGS}),lastSkirmish:()=>setup} as unknown as Application;
 const html=renderToStaticMarkup(createElement(SkirmishScreen,{app}));
 const pickers=[...html.matchAll(/<select\b[^>]*aria-label="Commander \d start position"[^>]*>(.*?)<\/select>/g)];
 assert.equal(pickers.length,2);
 for(const picker of pickers)for(let start=0;start<=4;start++)assert.ok(picker[1].includes(`value="${start}"`));
 assert.match(pickers[0][1],/<option value="4" selected="">4<\/option>/);
});

test('V01: practice preview uses containment so square map extents survive the landscape well',()=>{
 const image=declarations(css,'.rec-map-art img');
 assert.match(image,/object-fit:contain/);assert.doesNotMatch(image,/object-fit:cover/);
 assert.match(image,/min-height:0/);assert.match(declarations(css,'.rec-map-art'),/min-height:0/);
 // Each curated map uses the same contained preview, rather than a per-map crop.
 const practice=readFileSync(resolve('src/ui/Practice.tsx'),'utf8');
 assert.match(practice,/maps\.map\(value=>/);assert.match(practice,/className="rec-map-art"/);
});

test('V02: both authored co-op briefings have complete synopses and native keyboard disclosures with all rules',()=>{
 for(const id of ['convoy-union','twin-outposts']){
  const mission=JSON.parse(readFileSync(resolve('..','content/missions',`${id}.json`),'utf8'));
  const html=renderToStaticMarkup(createElement(CoopMissionCopy,{mission}));
  const firstSentence=mission.briefing.match(/^.*?[.!?](?:\s|$)/)[0].trim();
  assert.ok(html.includes(`<p>${firstSentence}</p><details`));
  assert.ok(html.includes('<summary>Mission details</summary>'));
  const details=html.slice(html.indexOf('<details'));
  assert.ok(details.includes(mission.briefing));assert.ok(details.includes(mission.rules_notice));
 }
 assert.doesNotMatch(declarations(networkCSS,'.mp-mission-copy p'),/line-clamp|overflow:hidden/);
});

test('V04: badge criteria render as full wrapping text without a line clamp',()=>{
 const index=decodeContentIndex(new Uint8Array(readFileSync(resolve('tests/runtime/fixtures/commander/index.json'))));
 const overview=commanderOverview(index),selected=overview.factions.find(value=>value.faction==='US')!;
 const html=renderToStaticMarkup(createElement(CommanderProgressView,{overview,faction:'US',difficulty:'normal',onFaction(){},onDifficulty(){},onChallenge(){}}));
 for(const badge of selected.badges.filter(value=>!value.mission))assert.ok(html.includes(`<p>${badge.description}</p>`),badge.title);
 const criteria=declarations(css,'.commander-record .rec-badge p');
 assert.doesNotMatch(criteria,/line-clamp|overflow:hidden/);assert.match(criteria,/overflow-wrap:anywhere/);
});

test('V05: more-below tracking hides at the end, updates after layout/content resizes and cleans up',()=>{
 const original=globalThis.ResizeObserver,changes:boolean[]=[],observed:unknown[]=[];
 let resize:()=>void=()=>{},disconnected=false;
 class Observer{constructor(callback:()=>void){resize=callback}observe(node:unknown){observed.push(node)}disconnect(){disconnected=true}}
 globalThis.ResizeObserver=Observer as unknown as typeof ResizeObserver;
 const listeners=new Map<string,()=>void>(),child={};
 const node={scrollHeight:900,clientHeight:400,scrollTop:0,children:[child],addEventListener(name:string,callback:()=>void){listeners.set(name,callback)},removeEventListener(name:string,callback:()=>void){assert.equal(listeners.get(name),callback);listeners.delete(name)}};
 try{
  const stop=observeMoreBelow(node as unknown as HTMLElement,value=>changes.push(value));
  assert.equal(changes.at(-1),true);assert.deepEqual(observed,[node,child]);
  node.scrollTop=499.5;listeners.get('scroll')!();assert.equal(changes.at(-1),false,'fractional end offsets do not leave a stale cue');
  node.scrollTop=0;listeners.get('scroll')!();assert.equal(changes.at(-1),true);
  node.clientHeight=950;resize();assert.equal(changes.at(-1),false,'content now fits');
  node.scrollHeight=1200;resize();assert.equal(changes.at(-1),true,'expanded content needs scrolling');
  stop();assert.ok(disconnected);assert.equal(listeners.size,0);
 }finally{globalThis.ResizeObserver=original}
 const html=renderToStaticMarkup(createElement(ScrollContinuation,{children:createElement('div',null,'Reference')}));
 assert.ok(html.includes('More below ↓'));assert.ok(html.includes('aria-hidden="true" tabindex="-1"'));
 assert.match(declarations(css,'.rec-scroll-cue[data-more=false]'),/visibility:hidden/);
 assert.match(declarations(css,'.rec-scroll-frame'),/overflow:hidden/,'the frame cannot introduce another scrollbar');
});
