import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {GlobalError} from '../../src/ui/App';
import {ErrorBanner} from '../../src/ui/network/kit';
import type {NetworkController,NetworkState} from '../../src/app/network-controller';

function disclosure(html:string,code:string){
 const details=[...html.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)].find(match=>match[2].includes(`<code>${code}</code>`));
 assert.ok(details,'support code is inside a native disclosure');assert.doesNotMatch(details[1],/\bopen\b/);assert.match(details[2],/^<summary>Details<\/summary>/);
 assert.ok(html.indexOf(code)>html.indexOf('<summary>Details</summary>'));assert.equal(html.replace(details[0],'' ).includes(code),false,'code never leaks into default copy');
}
test('M1-07: global corrupt-save alert keeps the friendly message and preserves files copy; code is collapsed',()=>{
 const html=renderToStaticMarkup(createElement(GlobalError,{error:{code:'save_corrupt',message:'This file is not a readable local save export.'},onClose(){}}));
 assert.match(html,/role="alertdialog"/);assert.match(html,/Command interrupted/);assert.match(html,/This file is not a readable local save export\./);assert.match(html,/Your existing saves and installed files are preserved\./);assert.match(html,/>Acknowledge<\/button>/);assert.doesNotMatch(html,/Reference:/);disclosure(html,'save_corrupt');
});
test('M1-07: existing network error disclosure remains collapsed with a friendly invite headline and recovery controls',()=>{
 for(const [code,message] of [['invite_invalid','Check the invite your host sent you.'],['host_unreachable','The host could not be reached.']]){
  const html=renderToStaticMarkup(createElement(ErrorBanner,{controller:{} as NetworkController,state:{host:'http://127.0.0.1:8111',error:{code,message}} as NetworkState}));
  assert.match(html,/role="alert"/);assert.ok(html.includes(message));assert.match(html,/Dismiss network error/);disclosure(html,code);
  if(code==='invite_invalid')assert.match(html,/<strong>Check the invite code<\/strong>/);else assert.match(html,/>Retry connection<\/button>/);
 }
});
