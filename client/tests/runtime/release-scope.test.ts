import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {DEFAULT_BATTLEFIELD_IDS,defaultBattlefields,isDefaultBattlefield,releasePage} from '../../src/app/release-scope';
import type {Page} from '../../src/app/application';

const pages:Page[]=['command','skirmish','campaign','tutorials','saves','settings','network','coop','replays','content','practice','help','editor','mastery'];

test('releasePage no longer hides campaign, editor or mastery (2026-10-20 scope update)',()=>{
 for(const page of pages)assert.equal(releasePage(page),page,`page ${page} must stay reachable`);
});

test('main menu offers and the menu screen router renders campaign, editor and mastery',()=>{
 // The former App.tsx menu table and page switch now live in src/ui/menu (revamp-00 split).
 const model=readFileSync(path.resolve(process.cwd(),'src/ui/menu/menu-model.ts'),'utf8');
 const router=readFileSync(path.resolve(process.cwd(),'src/ui/menu/screen-router.tsx'),'utf8');
 // Revamp: entries also carry a visible title and an IA group (play / learn / records / utility).
 const menuEntries=[...model.matchAll(/\{page:'([a-z]+)',label:'([^']+)',title:'([^']+)',icon:'(i-[a-z-]+)',group:'(play|learn|records|utility)'\}/g)];
 const menuPages=menuEntries.map(match=>match[1]);
 // Every routed page except the command-center home needs a menu entry, or
 // releasePage reachability is meaningless (the pre-fix campaign/editor/mastery gap).
 for(const page of pages.filter(page=>page!=='command'))assert(menuPages.includes(page),`main menu is missing ${page}`);
 assert.equal(new Set(menuPages).size,menuPages.length,'menu pages must be unique');
 // Campaign renders the non-tutorial journey; tutorials keep tutorial mode.
 assert(router.includes("state.page==='campaign'?<CampaignScreen app={app} tutorial={false}/>"),'campaign page must render CampaignScreen with tutorial={false}');
 assert(router.includes("state.page==='tutorials'?<CampaignScreen app={app} tutorial/>"),'tutorials page must render CampaignScreen in tutorial mode');
 assert(router.includes("state.page==='editor'?<EditorPanel app={app}/>"),'editor page must render EditorPanel');
 assert(router.includes("state.page==='mastery'?<CommanderProgressPanel app={app}/>"),'mastery page must render CommanderProgressPanel');
 assert(router.includes("import {EditorPanel} from '../EditorPanel';"),'screen router must import EditorPanel');
});

test('revamped home groups every page and keeps the accessible names browser tests click',()=>{
 const model=readFileSync(path.resolve(process.cwd(),'src/ui/menu/menu-model.ts'),'utf8');
 const entries=new Map([...model.matchAll(/\{page:'([a-z]+)',label:'([^']+)',title:'([^']+)',icon:'(i-[a-z-]+)',group:'([a-z]+)'\}/g)].map(match=>[match[1],{label:match[2],title:match[3],group:match[5]}]));
 const groups:Record<string,string[]>={play:['skirmish','campaign','network','coop'],learn:['tutorials','practice'],records:['saves','replays','mastery'],utility:['settings','help','editor','content']};
 for(const [group,members] of Object.entries(groups))for(const page of members)assert.equal(entries.get(page)?.group,group,`${page} belongs to ${group}`);
 // Label in name (WCAG 2.5.3): every entry's accessible name is its visible title (the 2026-10-31 rename
 // retired the legacy names Load operation, Replay archive, Editor and Installed content).
 const expected:Record<string,string>={saves:'Saves',replays:'Replays',editor:'Map editor',content:'Content & storage',network:'Multiplayer',skirmish:'Skirmish',settings:'Options',tutorials:'Field training',practice:'Practice range',mastery:'Command record',campaign:'Campaign',coop:'Co-op',help:'Help'};
 for(const [page,title] of Object.entries(expected)){assert.equal(entries.get(page)?.title,title,`${page} visible title`);assert.equal(entries.get(page)?.label,title,`${page} accessible name matches its visible title`)}
 const home=readFileSync(path.resolve(process.cwd(),'src/ui/menu/HomeMenu.tsx'),'utf8');
 assert(home.includes('aria-label="Main menu"'),'home keeps nav "Main menu"');
 assert(home.includes('aria-label="Set up skirmish"'),'M1-12: first-battle hero names the setup action');
 assert(home.includes("groupEntries('play').filter(entry=>latest||entry.page!=='skirmish')"),'M1-12: hide the duplicate setup row while the hero opens setup');
 assert(home.includes('app.quickSkirmish()'),'Quick skirmish launches the remembered setup in one click');
 const first=readFileSync(path.resolve(process.cwd(),'src/ui/menu/FirstRun.tsx'),'utf8');
 for(const name of ['Welcome, commander','Interface scale','Enable game sound','Explore game modes','Begin field training'])assert(first.includes(name),`first run keeps ${name}`);
 // Cascade order: tokens → game.css → menu.css → every lane sheet, all before any component import,
 // so revamp sheets win ties with game.css without :root specificity hacks.
 const app=readFileSync(path.resolve(process.cwd(),'src/ui/App.tsx'),'utf8');
 const at=(spec:string)=>app.indexOf(`import '${spec}';`);
 const order=['../design/tokens.css','../styles/game.css','../styles/menu.css','../styles/records.css','../styles/hud.css','../styles/hud-tray.css','./network/network.css','../styles/skirmish.css'];
 for(const spec of order)assert(at(spec)>=0,`App imports ${spec}`);
 for(let index=1;index<order.length;index++)assert(at(order[index-1])<at(order[index]),`${order[index-1]} loads before ${order[index]}`);
 const firstComponent=app.search(/^import [{A-Za-z]/m);
 assert(firstComponent<0||at('../styles/skirmish.css')<firstComponent,'stylesheets are imported before any component module');
});

test('six default battlefields: original three plus Relay Heights, Dry River, Border Depots',()=>{
 assert.deepEqual([...DEFAULT_BATTLEFIELD_IDS],['copper-junction','industrial-valley','port-outskirts','relay-heights','dry-river','border-depots']);
 for(const id of DEFAULT_BATTLEFIELD_IDS)assert.equal(isDefaultBattlefield(id),true,id);
 // Co-op scenario layouts and campaign layouts stay out of the skirmish defaults.
 for(const id of ['convoy-union','twin-outposts','us-01-first-foothold-layout','missing-map'])assert.equal(isDefaultBattlefield(id),false,id);
});

test('every default battlefield exists in the shipped content index as a multiplayer map',()=>{
 const root=path.resolve(process.cwd(),'..');
 const index=JSON.parse(readFileSync(path.join(root,'content/index.json'),'utf8')) as {maps:Array<{id:string;players?:number}>};
 for(const id of DEFAULT_BATTLEFIELD_IDS){
  const entry=index.maps.find(map=>map.id===id);
  assert(entry,`content index is missing default battlefield ${id}`);
  assert((entry.players??0)>=2,`${id} must support at least two commanders`);
 }
});

test('defaultBattlefields keeps curated order, skips missing maps and excludes non-defaults',()=>{
 const maps=[{id:'border-depots'},{id:'twin-outposts'},{id:'copper-junction'},{id:'dry-river'},{id:'industrial-valley'}];
 assert.deepEqual(defaultBattlefields(maps).map(map=>map.id),['copper-junction','industrial-valley','dry-river','border-depots']);
 assert.deepEqual(defaultBattlefields([]),[]);
});
