import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {commandCardPages,currentCommandCard,commandCardEntries,selectionCoverage,CARD_SLOTS,type CardEntry} from '../../src/ui/hud/tray-command-slots';
import {isOrderAcknowledgement} from '../../src/ui/hud/notice-filter';
import {DefeatWarning} from '../../src/ui/DefeatWarning';
import {CommandCard} from '../../src/ui/hud/CommandCard';
import {defaultBindings} from '../../src/runtime/keybindings';
import {COMMANDS,ABILITIES,STRATEGIC} from '../../src/content/labels';
import {executionCountFeedback} from '../../src/app/player-controls';

const cmd=(command:string):CardEntry=>({key:`cmd:${command}`,kind:'command',command});
const keyAt=(slots:ReturnType<typeof commandCardPages>['pages'][number],index:number)=>slots[index].kind==='command'?(slots[index] as {command:string}).command:slots[index].kind;

test('unit card keeps core orders in fixed sockets across selections',()=>{
 const tank=commandCardPages([cmd('move'),cmd('attack_move'),cmd('stop'),cmd('hold'),cmd('guard'),cmd('patrol'),cmd('force_fire'),cmd('aggressive')]);
 const infantry=commandCardPages([cmd('stop'),cmd('move'),cmd('hold'),cmd('attack_move'),cmd('capture')]);
 assert.equal(tank.layout,'unit');assert.equal(infantry.layout,'unit');
 for(const [index,kind] of ['attack_move','move','stop','hold'].entries()){assert.equal(keyAt(tank.pages[0],index),kind);assert.equal(keyAt(infantry.pages[0],index),kind)}
 assert.equal(keyAt(infantry.pages[0],4),'empty','missing Guard leaves an empty socket');
 assert.equal(keyAt(infantry.pages[0],8),'capture','contextual orders start on row three');
 assert.equal(tank.pages[0].length,CARD_SLOTS);
});

test('building card puts rally, power, repair and sell on row one',()=>{
 const card=commandCardPages([cmd('sell'),{key:'set:power',kind:'setting',command:'power'},cmd('rally')]);
 assert.equal(card.layout,'building');
 assert.equal(keyAt(card.pages[0],0),'rally');assert.equal(card.pages[0][1].kind,'setting');assert.equal(keyAt(card.pages[0],2),'empty');assert.equal(keyAt(card.pages[0],3),'sell');
});

test('overflow pages through More and Back without losing an entry',()=>{
 const abilities=Array.from({length:13},(_,index):CardEntry=>({key:`ab:${index}`,kind:'ability',ability:`a${index}`}));
 const card=commandCardPages([cmd('move'),cmd('stop'),...abilities]);
 assert.ok(card.pages.length>1);
 const placed=card.pages.flat().filter(slot=>slot.kind==='ability').length;assert.equal(placed,13);
 assert.ok(card.pages[0].some(slot=>slot.kind==='page'&&slot.label==='More'));
 assert.ok(card.pages.at(-1)!.some(slot=>slot.kind==='page'&&slot.label==='Back'&&slot.target===0));
 for(const page of card.pages)assert.equal(page.length,CARD_SLOTS);
});

test('strategic operation is the last ability in the card',()=>{
 const card=commandCardPages([cmd('move'),{key:'ab:strategic',kind:'ability',ability:'strategic'},{key:'ab:recon_sweep',kind:'ability',ability:'recon_sweep'}]);
 const order=card.pages[0].filter(slot=>slot.kind==='ability').map(slot=>(slot as {ability:string}).ability);
 assert.deepEqual(order,['recon_sweep','strategic']);
});

test('coverage copy is silent when everyone can act and never says "capable unit"',()=>{
 const snapshot={player:1,entities:[{id:1,owner:1,private:{}},{id:2,owner:1,private:{}}]};
 const advice={player:1,entities:[{id:1,commands:['move','capture'],abilities:[],builds:[]},{id:2,commands:['move'],abilities:[],builds:[]}]};
 assert.equal(selectionCoverage(snapshot,[1,2],advice,'move'),undefined);
 assert.equal(selectionCoverage(snapshot,[1,2],advice,'capture'),'1 of 2 selected can do this; the rest keep their orders.');
 assert.equal(selectionCoverage(snapshot,[1],advice,'capture'),undefined);
});

test('routine order acknowledgements are recognised; failures are not',()=>{
 assert.equal(isOrderAcknowledgement(executionCountFeedback({accepted:true,appliedCount:1})),true);
 assert.equal(isOrderAcknowledgement(executionCountFeedback({accepted:true,appliedCount:3})),true);
 assert.equal(isOrderAcknowledgement('Order accepted. Awaiting execution.'),true);
 assert.equal(isOrderAcknowledgement('Order sent. 2 unsupported selected units keep their current orders.'),false);
 assert.equal(isOrderAcknowledgement('No selected units support this action. Their current orders are unchanged.'),false);
 assert.equal(isOrderAcknowledgement(undefined),false);
});

test('pinned defeat row keeps the timer role, accessible label and countdown',()=>{
 const snapshot={player:1,tick:100,players:[{id:1,name:'Me',defeated:false,team:1,defeatAt:560},{id:2,name:'Rival',defeated:false,team:2,defeatAt:300}]} as never;
 const html=renderToStaticMarkup(createElement(DefeatWarning,{snapshot,variant:'feed'}));
 assert.match(html,/data-pinned=""/);assert.match(html,/aria-label="Commander defeat countdowns"/);
 assert.match(html,/role="timer" aria-label="Seconds until defeat">23s</);assert.match(html,/Rival <b>10s<\/b>/);
 assert.match(html,/class="defeat-warning battle-alert critical own"/);
 assert.equal(renderToStaticMarkup(createElement(DefeatWarning,{snapshot:{player:1,tick:100,players:[{id:1,name:'Me',defeated:false,team:1,defeatAt:0}]} as never,variant:'feed'})),'');
});

test('rendered command card labels and positional keycaps follow every current page',()=>{
 const commands=['move','attack_move','stop','hold','guard','patrol','force_fire','aggressive','return','deploy','pack','capture','board','unload','repair','gather','salvage','repeat_sortie','rally','power','sell'];
 const abilities=['observe','recon_sweep','strategic'],bindings=defaultBindings('standard','grid');
 for(const kinds of [['move','stop'],['rally','power','repair','sell'],commands]){
  const entries=commandCardEntries(kinds,kinds===commands?abilities:[],kinds===commands),card=commandCardPages(entries);
  const snapshot={player:1,entities:[{id:1,owner:1,type:'test',enabled:true,private:{repeatSortie:true}}]};
  const advice={player:1,entities:[{id:1,commands:kinds,abilities,builds:['barrier']}]};
  for(let page=0;page<card.pages.length;page++){
   const current=currentCommandCard(entries,page),view={control:{commandCard:()=>current},state:{settings:{bindings}},battle:{ids:[1],pending:false,affordances:advice},catalog:{units:new Map([['test',{weapon:'gun'}]])},snapshot,faction:'US',selected:snapshot.entities,readOnly:false,abilities} as any;
   const html=renderToStaticMarkup(createElement(CommandCard,{view}));
   const rendered=html.match(/<button\b[\s\S]*?<\/button>|<span class="card-socket"[^>]*><\/span>/g)??[];
   assert.equal(rendered.length,12);
   for(const [index,slot] of current.current.entries()){
    const socket=rendered[index];
    if(slot.kind==='empty'){assert.match(socket,/card-socket/);continue}
    const key='QWERASDFZXCV'[index];assert.match(socket,new RegExp(`aria-keyshortcuts="${key}(?:[ "]|$)`));assert.match(socket,new RegExp(`<kbd[^>]*>${key}</kbd>`));
    const label=slot.kind==='page'?slot.label:slot.kind==='setting'?(slot.command==='power'?'Power':'Repeat sortie'):slot.kind==='observe'?'Recon Observe':slot.kind==='rebase'?'Rebase':slot.kind==='barricade'?'Field barricade':slot.kind==='ability'?(slot.ability==='strategic'?STRATEGIC.US.label:ABILITIES[slot.ability]?.label??slot.ability):COMMANDS[slot.command].label;
    assert.ok(socket.includes(label),`socket ${index+1} page ${page+1} contains ${label}`);
   }
  }
 }
});
