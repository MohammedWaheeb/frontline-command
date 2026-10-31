import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {create} from '@bufbuild/protobuf';
import {MatchStatusSchema} from '../../src/protocol/frontline_pb';
import type {NetworkState,NetworkController} from '../../src/app/network-controller';
import {Observable} from '../../src/app/store';
import {networkPresenceChanges} from '../../src/app/battle-alerts';
import {sharedPausePresentation,NetworkBattleStatus} from '../../src/ui/network/NetworkBattleStatus';
import {HomeMenu} from '../../src/ui/menu/HomeMenu';
import {LobbyScreen} from '../../src/ui/network/LobbyScreen';
import {NetworkMatchPanel} from '../../src/ui/network/MatchPanel';

const slot={player:1,name:'Alex',profile:'self',faction:'US',team:1,color:1,ready:true,assets_ready:true},peer={...slot,player:2,name:'Blake',profile:'other',team:2};
function state(){return {host:'http://127.0.0.1:8080',connection:'connected',tick:200,account:{phase:'signed-in',profile:{id:'self',name:'Alex'}},lobby:{id:'lobby',name:'Live operation',revision:1,host:'self',match_id:'match',mode:'custom',map_id:'copper-junction',slots:[slot,peer],pause_enabled:true},lobbyState:'active',status:create(MatchStatusSchema,{pauseEnabled:true,teammates:[{player:1,connected:true},{player:2,connected:true}]}),maps:[{id:'copper-junction',title:'Copper Junction',players:2}],invites:[],chat:[]} as unknown as NetworkState}
const status=(connected:boolean)=>create(MatchStatusSchema,{teammates:[{player:1,connected:true},{player:2,connected}]});

test('R1-01: presence transitions announce disconnect/reconnect once and never announce initial connected peers or self',()=>{
 const slots=[slot,peer];assert.deepEqual(networkPresenceChanges(undefined,status(true),slots,1),[]);
 assert.deepEqual(networkPresenceChanges(status(true),status(false),slots,1),['Commander Blake disconnected.']);
 assert.deepEqual(networkPresenceChanges(status(false),status(false),slots,1),[]);
 assert.deepEqual(networkPresenceChanges(status(false),status(true),slots,1),['Commander Blake reconnected.']);
 assert.deepEqual(networkPresenceChanges(status(true),status(false),slots,2),[]);
 const waiting=status(false);waiting.waitingForPlayers=true;assert.deepEqual(networkPresenceChanges(status(true),waiting,slots,1),[]);
 const named=[slot,{...peer,name:'Commander-B'}];assert.deepEqual(networkPresenceChanges(status(true),status(false),named,1),['Commander-B disconnected.']);
});
test('R1-01: Home and the live lobby expose Rejoin operation for a remembered commander',()=>{
 const network=state(),controller={state:new Observable(network)} as NetworkController;
 const app={state:new Observable({page:'command'}),network:controller,lastSkirmish:()=>undefined} as any;
 const home=renderToStaticMarkup(createElement(HomeMenu,{app}));assert.match(home,/aria-label="Rejoin operation"/);assert.match(home,/Live operation/);assert.doesNotMatch(home,/aria-label="Set up skirmish"/);
 const lobby=renderToStaticMarkup(createElement(LobbyScreen,{state:network,controller,palette:'standard' as never}));assert.match(lobby,/>Rejoin operation<\/button>/);
});
test('R1-03: pending unanimous pause is visible to requester and peer; authoritative paused state replaces the vote prompt',()=>{
 const value=state();value.status!.pauseVotes=[2];
 assert.equal(sharedPausePresentation(value)?.pending,true);assert.equal(sharedPausePresentation(value)?.canVote,true);assert.match(sharedPausePresentation(value)!.text,/Blake.*Every active human commander.*automatically/);
 const controller={state:new Observable(value)} as NetworkController;
 let html=renderToStaticMarkup(createElement(NetworkBattleStatus,{controller,online:true}));assert.match(html,/Shared pause requested/);assert.match(html,/>Agree to pause<\/button>/);
 value.status!.pauseVotes=[1];html=renderToStaticMarkup(createElement(NetworkBattleStatus,{controller,online:true}));assert.match(html,/Pause vote submitted/);assert.match(html,/>Withdraw pause vote<\/button>/);assert.doesNotMatch(html,/>Agree to pause/);
 value.status!.pauseVotes=[1,2];value.status!.paused=true;html=renderToStaticMarkup(createElement(NetworkBattleStatus,{controller,online:true}));assert.match(html,/>PAUSED<\/strong>/);assert.match(html,/paused for every commander/);assert.match(html,/>Resume operation<\/button>/);
 value.lobby!.mode='coop';value.status!.paused=false;assert.match(sharedPausePresentation(value)!.text,/Every connected, active human commander/);
});
test('R1-03: stale, eliminated, completed and disabled pause states cannot offer agreement',()=>{
 for(const patch of [{connection:'reconnecting'},{eliminated:true},{lobbyState:'completed'},{lobbyUnavailable:true}]){const value={...state(),...patch} as NetworkState;assert.equal(sharedPausePresentation(value),undefined)}
 const value=state();value.status!.pauseEnabled=false;assert.equal(sharedPausePresentation(value),undefined);
 value.status!.pauseEnabled=true;value.status!.waitingForPlayers=true;assert.equal(sharedPausePresentation(value)?.canVote,false);
});
test('R1-04: results display the incoming rematch invitation without leaving the debrief',()=>{
 const value=state();value.lobbyState='completed';value.result={committed:true,outcome:{finished:true}} as any;
 value.invites=[{id:'invite',lobby_id:'new',lobby_name:'Rematch operation',sender_name:'Blake',rematch:true,previous_match_id:'match'}] as any;
 const html=renderToStaticMarkup(createElement(NetworkMatchPanel,{controller:{state:new Observable(value)} as NetworkController}));assert.match(html,/Lobby invitations/);assert.match(html,/Rematch operation/);assert.match(html,/>Accept invitation<\/button>/);assert.doesNotMatch(html,/<button[^>]*disabled=""[^>]*>Accept invitation/);
});
test('R1-02/R1-05: full lobby explains capacity; expired lobby has only a return action and no retry/chat/readiness controls',()=>{
 const value=state();value.lobbyState='forming';delete value.lobby!.match_id;const controller={state:new Observable(value),inviteString:()=> 'fixture-invite',inviteText:()=> 'fixture-invite'} as NetworkController;
 let html=renderToStaticMarkup(createElement(LobbyScreen,{controller,state:value,palette:'standard' as never}));assert.match(html,/No open slot on this battlefield/);assert.doesNotMatch(html,/aria-label="Add AI commander"/);
 value.lobbyClosed=true;value.lobbyUnavailable=true;html=renderToStaticMarkup(createElement(LobbyScreen,{controller,state:value,palette:'standard' as never}));assert.match(html,/Lobby closed/);assert.match(html,/>Return to multiplayer<\/button>/);assert.doesNotMatch(html,/Retry host|Chat message|Ready to deploy/);
});

// Invoke actual JSX handlers against hook peers; no browser or React DOM emulation.
const require=createRequire(import.meta.url),jsx=pathToFileURL(require.resolve('react/jsx-runtime')).href;
const bundle=await build({stdin:{contents:`export {NetworkBattleStatus} from './src/ui/network/NetworkBattleStatus';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',target:'node24',loader:{'.css':'empty'},plugins:[{name:'net3-hooks',setup(builder){
 builder.onResolve({filter:/^react\/jsx-runtime$/},()=>({path:jsx,external:true}));
 builder.onResolve({filter:/^react$/},()=>({path:'react',namespace:'peer'}));
 builder.onLoad({filter:/.*/,namespace:'peer'},()=>({contents:`export const useEffect=()=>{},useState=init=>[typeof init==='function'?init():init,()=>{}],useSyncExternalStore=(_,get)=>get();`,loader:'js'}));
}}]});
const component=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
function nodes(node:any):any[]{return Array.isArray(node)?node.flatMap(nodes):node?.props?[node,...nodes(node.props.children)]:[]}
test('R1-03: HUD Agree, Withdraw and Resume handlers send the intended control and stay clickable in the feed',()=>{
 const value=state();value.status!.pauseVotes=[2];const calls:boolean[]=[];
 const controller={state:new Observable(value),pause:(paused:boolean)=>{calls.push(paused)}} as unknown as NetworkController;
 const click=(label:string)=>{const tree=component.NetworkBattleStatus({controller,online:true}),button=nodes(tree).find(node=>node.type==='button'&&node.props.children===label);assert.ok(button);assert.equal(button.props.disabled,false);button.props.onClick()};
 click('Agree to pause');value.status!.pauseVotes=[1];click('Withdraw pause vote');value.status!.paused=true;click('Resume operation');assert.deepEqual(calls,[true,false,false]);
 const css=readFileSync('src/ui/network/network-battle-status.css','utf8');assert.match(css,/\.network-pause-notice\{[^}]*pointer-events:auto/);
 assert.match(readFileSync('src/ui/hud/AlertFeed.tsx','utf8'),/<NetworkBattleStatus controller=\{view\.app\.network\}/);
});
