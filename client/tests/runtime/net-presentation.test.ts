import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MultiplayerLanding,IdentityBar} from '../../src/ui/network/MultiplayerLanding';
import {Observable} from '../../src/app/store';
import type {NetworkController,NetworkState} from '../../src/app/network-controller';
const css=readFileSync('src/ui/network/network.css','utf8'),lobby=readFileSync('src/ui/network/LobbyScreen.tsx','utf8');
const rule=(selector:string)=>{const value=css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]+)\\}'))?.[1];assert.ok(value,selector);return value};
test('M3-04: deploy countdown occupies the map/rules column in normal flow, with bounded type',()=>{
 const body=rule('.mp-countdown');assert.doesNotMatch(body,/(?:position:(?:fixed|absolute)|inset:|z-index:)/);assert.match(body,/display:grid/);
 assert.match(rule('.mp-countdown strong'),/calc\(44px \* var\(--mp-s\)\)/);
 const aside=lobby.slice(lobby.indexOf('<aside className="mp-lobby-side"'),lobby.indexOf('</aside>'));assert.match(aside,/<LobbyMap[^]*<DeployCountdown state=\{state\}\/>(?:[^]*)<RulesPanel/);
 assert.equal((lobby.match(/<DeployCountdown state=/g)??[]).length,1);
});
test('M3-02/M3-03: lobby explains the manual fallback and host absence',()=>{
 assert.match(lobby,/Press Reconnect to operation to enter the battle\./);assert.match(lobby,/forming&&state\.hostOffline&&<p[^>]*role="status"/);assert.match(lobby,/The lobby host is disconnected/);
});
test('M3-10: restore-token button retains its label and has at least 24px in both dimensions',()=>{
 const body=rule('.mp-link');assert.match(body,/min-height:24px!important/);assert.match(body,/min-width:24px!important/);assert.doesNotMatch(body,/min-height:0/);
 const state={connected:true} as NetworkState,html=renderToStaticMarkup(createElement(IdentityBar,{controller:{} as NetworkController,state,draft:{name:'',setName(){},remember:true},onAdvanced(){}}));
 assert.match(html,/<button[^>]*class="text-button mp-link"[^>]*>Restore an existing token<\/button>/);
});
test('M3-12: full browse rows say Full, available rows retain Join, and active rows say In progress',()=>{
 const slot={player:1,name:'Commander',profile:'host',faction:'US',team:1,color:1,ready:false,assets_ready:false};
 const base={id:'full',revision:1,name:'Full game',map_id:'copper-junction',host:'host',mode:'1v1',private:false,slots:[slot,{...slot,player:2}]};
 const state={connected:true,account:{profile:{id:'guest',name:'Guest'}},maps:[{id:'copper-junction',title:'Copper Junction',players:2}],lobbies:[base,{...base,id:'open',name:'Open game',slots:[slot]},{...base,id:'active',name:'Active game',match_id:'match'}],invites:[],history:[]} as unknown as NetworkState;
 const controller={state:new Observable(state)} as NetworkController,html=renderToStaticMarkup(createElement(MultiplayerLanding,{controller,state,draft:{name:'',setName(){},remember:true},onHost(){},onAdvanced(){}}));
 const rows=html.split('role="listitem"').slice(1);assert.equal(rows.length,3);assert.match(rows[0],/>Full<\/span>/);assert.doesNotMatch(rows[0],/aria-label="Join operation"/);assert.match(rows[1],/aria-label="Join operation"/);assert.doesNotMatch(rows[1],/>Full<\/span>/);assert.match(rows[2],/>In progress<\/span>/);assert.doesNotMatch(rows[2],/aria-label="Join operation"/);
});
