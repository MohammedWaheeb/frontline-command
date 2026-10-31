import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Menu revamp (design-audit-menus X6 / §5.8.9): every menu and kit font must follow the
// interface scale (85%–150%). menu.css may only size text with type tokens
// (var(--fc-type-*), generated as calc(px * var(--fc-ui-scale))) or calc(px * scale).
const here=path.dirname(fileURLToPath(import.meta.url));
const read=(file:string)=>readFileSync(path.join(here,'..',file),'utf8');
const css=read('src/styles/menu.css');
const tokens=read('src/design/tokens.css');

type Rule={selectors:string[];declarations:Array<[string,string]>};
const rules:Rule[]=[];
for(const match of css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)){
 const selectors=match[1]!.split(',').map(selector=>selector.trim().replace(/\s+/g,' '));
 const declarations=match[2]!.split(';').map(part=>/^\s*([a-z-]+)\s*:\s*([\s\S]+?)\s*$/.exec(part)).filter((m):m is RegExpExecArray=>!!m).map(m=>[m[1]!,m[2]!] as [string,string]);
 rules.push({selectors,declarations});
}
const scaled=(value:string)=>/var\(--fc-type-[a-z-]+-(size|line)\)/.test(value)||/var\(--fcm-s\)|var\(--fc-ui-scale\)/.test(value);
function fontOf(selector:string){
 let found:string|undefined;
 for(const rule of rules)if(rule.selectors.includes(selector))for(const [property,value] of rule.declarations)if(property==='font'||property==='font-size')found=value;
 return found;
}

test('menu.css aliases --fcm-s to the interface scale',()=>{
 assert.match(css,/--fcm-s:var\(--fc-ui-scale,1\)/);
 for(const name of ['--fcm-hit','--fcm-hit-sm','--fcm-hit-lg','--fcm-topbar-h','--fcm-footer-h','--fcm-utility-h']){
  const value=new RegExp(`${name}:([^;]+);`).exec(css)?.[1];
  assert(value&&scaled(value),`${name} must scale with the interface scale, got ${value}`);
 }
});

test('no menu font size is a raw pixel value',()=>{
 const offenders:string[]=[];
 for(const rule of rules)for(const [property,value] of rule.declarations){
  if(property!=='font'&&property!=='font-size')continue;
  if(/\d(px|pt|rem|em)\b/.test(value.replace(/\d*\.?\d+em\)/g,''))&&!scaled(value))offenders.push(`${rule.selectors.join(',')} { ${property}: ${value} }`);
 }
 assert.deepEqual(offenders,[],`unscaled menu fonts:\n${offenders.join('\n')}`);
});

test('key menu text selectors resolve to scaled fonts',()=>{
 const selectors=['.fcm-btn','.fcm-row-title','.fcm-row-state','.fcm-group-label','.fcm-screen-title','.fcm-section-title','.fcm-field .fcm-field-label','.fcm-hint','.fcm-footer-summary','.fcm-slot-th','.fcm-wordmark','.fcm-hero-title','.fcm-hero-meta','.fcm-shell .fcm-section-tab','.fcm-shell .fcm-utility .fcm-util','.fcm-tabs .fcm-tab','.fcm-seg .fcm-seg-option','.fcm-chip','.fcm-map-title','.fcm-infotip-bubble'];
 for(const selector of selectors){const font=fontOf(selector);assert(font,`${selector} has no font rule`);assert(scaled(font!),`${selector} font must scale: ${font}`)}
});

test('menu type tokens are generated as scaled calc() values',()=>{
 for(const name of ['wordmark','menu','group','cta','label','body-sm','caption']){
  assert.match(tokens,new RegExp(`--fc-type-${name}-size: calc\\(\\d+px \\* var\\(--fc-ui-scale\\)\\);`),`--fc-type-${name}-size`);
 }
});

test('the menu sizes no text below 12px at scale 1',()=>{
 for(const rule of rules)for(const [property,value] of rule.declarations){
  if(property!=='font'&&property!=='font-size')continue;
  const px=/calc\((\d+(?:\.\d+)?)px \* var\(--fcm-s\)\)/.exec(value);
  // 11px is allowed only for map-thumbnail captions (supplementary to the title tooltip + facts line).
  if(px&&Number(px[1])<12)assert(rule.selectors.every(selector=>selector.includes('thumb-caption')),`${rule.selectors.join(',')} uses ${px[1]}px`);
 }
});
