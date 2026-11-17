import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Records lane (beta revamp): Campaign, Saves, Replays, Options, Help, Briefing and Debrief text must
// follow the interface scale. records.css sizes fonts only as calc(px * var(--rec-s)) (an alias of
// --fc-ui-scale). SVG chart text is exempt because it already scales with its viewBox.
const here=path.dirname(fileURLToPath(import.meta.url));
const css=readFileSync(path.join(here,'..','src/styles/records.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match=>({selector:match[1]!.trim(),body:match[2]!}));

test('records.css aliases --rec-s to the interface scale',()=>{
 assert.match(css,/--rec-s:var\(--fc-ui-scale,1\)/);
});

test('no records font size is a raw pixel value',()=>{
 const offenders:string[]=[];
 for(const rule of rules){
  if(/\bsvg\b/.test(rule.selector))continue;
  for(const part of rule.body.split(';')){
   const match=/^\s*(font|font-size)\s*:\s*(.+)$/.exec(part);if(!match)continue;
   const value=match[2]!;
   if(/\d+(\.\d+)?px/.test(value)&&!/calc\([^)]*px\s*\*\s*var\(--(rec-s|fc-ui-scale)\)\)/.test(value))offenders.push(`${rule.selector} { ${match[1]}: ${value} }`);
  }
 }
 assert.deepEqual(offenders,[]);
});

test('records text never drops below 12px at 100% scale',()=>{
 const small:string[]=[];
 for(const match of css.matchAll(/calc\((\d+(?:\.\d+)?)px \* var\(--rec-s\)\)/g))if(Number(match[1])<12&&css.slice(Math.max(0,match.index!-40),match.index).match(/font[^;{]*$/))small.push(match[0]);
 assert.deepEqual(small,[]);
});
