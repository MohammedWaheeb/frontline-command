// Session05 console review (Claude, claude-opus-5-5). Drives the real product at
// FRONTLINE_UI_URL with installed playwright-core and writes a new evidence
// directory; it never edits source, runtime, manifest or earlier captures.
// Key art is exercised without packaging: the browser route adds `keyArt` to
// /art/index.json and serves the preserved candidate copy from this directory.
//   node work/claude/05-current-ui/capture-console.mjs <tag> [--no-keyart]
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const require=createRequire(path.join(root,'client/package.json'));
const {chromium}=require('playwright-core');
const url=process.env.FRONTLINE_UI_URL??'http://127.0.0.1:5173';
const tag=process.argv[2]??new Date().toISOString().replace(/[:.]/g,'-');
const keyArt=!process.argv.includes('--no-keyart');
const out=path.join(root,'work/evidence/console-review-05',tag);await mkdir(out,{recursive:true});
const image=await readFile(path.join(here,'keyart/main_menu-column-02.png'));
const log={url,tag,keyArt,date:new Date().toISOString(),steps:[],errors:[],failed:[],reach:{}};
const browser=await chromium.launch({headless:true});log.browser=browser.version();

async function session(name,{width,height},fn,{missingImage=false}={}){
 const context=await browser.newContext({viewport:{width,height}});const page=await context.newPage();
 page.on('pageerror',e=>log.errors.push(`${name}: ${e.message}`));
 page.on('console',m=>{if(m.type()==='error')log.errors.push(`${name}: console ${m.text()}`)});
 page.on('response',r=>{if(r.status()>=400)log.failed.push(`${name}: ${r.status()} ${r.url()}`)});
 if(keyArt){
  await page.route('**/art/index.json',async route=>{const response=await route.fetch();const json=await response.json();await route.fulfill({response,json:{...json,keyArt:'ui/keyart/main_menu.png'}})});
  await page.route('**/art/ui/keyart/main_menu.png',route=>missingImage?route.fulfill({status:404,body:'injected missing key art'}):route.fulfill({status:200,contentType:'image/png',body:image}));
 }
 const shot=async(file,opts={})=>{await page.screenshot({path:path.join(out,file+'.png'),...opts});log.steps.push(`${name}/${file}`)};
 const crop=async(file,selector)=>{const el=page.locator(selector).first();if(await el.count()){await el.screenshot({path:path.join(out,file+'.png')});log.steps.push(`${name}/${file}`)}};
 const step=async(label,body)=>{try{await body()}catch(error){log.steps.push(`${name}/${label}: FAILED ${String(error.message??error).split('\n')[0]}`);await shot(`${label}-failure`).catch(()=>{})}};
 try{await page.goto(url);const explore=page.getByRole('button',{name:'Explore game modes'});if(await explore.waitFor({timeout:15000}).then(()=>true,()=>false))await explore.click();
  await page.getByRole('button',{name:'Deploy to skirmish'}).waitFor({timeout:20000});
  if(keyArt&&!missingImage)await page.locator('.menu-keyart img').evaluate(img=>img.complete||new Promise(ok=>img.addEventListener('load',ok,{once:true}))).catch(()=>{});
  await page.waitForTimeout(900);await fn({page,shot,crop,step})}
 finally{await context.close()}
}
const scale=async(page,value)=>{await page.getByRole('button',{name:'Options',exact:true}).first().click();await page.getByLabel('Interface scale',{exact:true}).selectOption(value);await page.keyboard.press('Escape').catch(()=>{});await page.waitForTimeout(400)};
const layout=page=>page.evaluate(()=>{const box=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}};return {keyArt:document.querySelector('.menu-keyart')?.getAttribute('data-key-art')??null,canvas:!!document.querySelector('canvas.menu-diorama'),img:box('.menu-keyart img'),headline:box('.welcome h2'),copy:box('.welcome p'),deploy:box('.deploy-button'),nav:box('.command-nav')}});

try{
 for(const [w,h] of [[1600,900],[1280,720]])await session(`menu-${w}`,{width:w,height:h},async({page,shot,step})=>{
  log.reach[`menu-${w}`]=await layout(page);await shot(`menu-${w}`);
  await step('skirmish',async()=>{await page.getByRole('button',{name:'Deploy to skirmish'}).click();await page.waitForTimeout(500);await shot(`skirmish-${w}`)});
  await step('keyboard',async()=>{const seen=[];for(let i=0;i<30;i++){await page.keyboard.press('Tab');seen.push(await page.evaluate(()=>{const a=document.activeElement;return a?`${a.tagName}:${(a.getAttribute('aria-label')??a.textContent??'').trim().slice(0,32)}`:''}))}log.reach[`tab-${w}`]=seen;await shot(`keyboard-focus-${w}`)});
 });
 await session('menu-1280-150',{width:1280,height:720},async({page,shot,step})=>{
  await step('scale',()=>scale(page,'1.5'));await page.getByRole('button',{name:'Command center'}).first().click().catch(()=>{});await page.waitForTimeout(500);
  log.reach['menu-1280-150']=await layout(page);await shot('menu-1280-150');
  await step('help-by-scroll',async()=>{const help=page.getByRole('button',{name:'Help'}).first();await help.scrollIntoViewIfNeeded();log.reach.helpVisible150=await help.isVisible();await shot('menu-1280-150-scrolled')});
  await step('skirmish-150',async()=>{await page.getByRole('button',{name:'Skirmish'}).first().click();await page.waitForTimeout(500);await shot('skirmish-1280-150')});
 });
 if(keyArt)await session('missing-image',{width:1280,height:720},async({page,shot})=>{await page.waitForTimeout(1500);log.reach.missingImage=await layout(page);await shot('missing-image-fallback')},{missingImage:true});

 await session('battle',{width:1600,height:900},async({page,shot,crop,step})=>{
  await page.getByRole('button',{name:'Deploy to skirmish'}).click();await page.waitForTimeout(400);
  await page.getByRole('button',{name:'Deploy forces'}).click();
  await page.locator('.battlefield-canvas canvas').waitFor({timeout:60000});await page.locator('.countdown').waitFor({state:'hidden',timeout:30000}).catch(()=>{});await page.waitForTimeout(800);
  await shot('battle-1600');await crop('sidebar-1600','.command-sidebar');await crop('tray-empty-1600','.selection-tray');
  await step('production',async()=>{const cameo=page.locator('.production-cameo:not([disabled])').first();if(await cameo.count()){await cameo.click();await page.waitForTimeout(1200);await crop('sidebar-queue-1600','.command-sidebar')}});
  await step('select-hq',async()=>{await page.getByRole('button',{name:'Select production facility'}).click();await page.waitForTimeout(600);await crop('tray-selected-1600','.selection-tray');
   const inspect=page.locator('.unit-state-inspect').first();if(await inspect.count()){await inspect.click();await page.waitForTimeout(400);await shot('unit-status-1600');await page.keyboard.press('Escape')}});
  await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(600);await shot('battle-1280');await crop('sidebar-1280','.command-sidebar');await crop('tray-1280','.selection-tray');
  await step('pause',async()=>{await page.getByRole('button',{name:'Open pause menu'}).click();await page.waitForTimeout(400);await shot('pause-1280')});
  await step('options',async()=>{await page.getByRole('button',{name:'Options',exact:true}).click();await page.waitForTimeout(400);await shot('options-1280');await page.getByLabel('Interface scale',{exact:true}).selectOption('1.5');await page.waitForTimeout(400);await shot('options-1280-150');await page.keyboard.press('Escape');await page.waitForTimeout(300)});
  await step('archive-replay',async()=>{await page.getByRole('button',{name:'Archive replay'}).click();await page.waitForTimeout(1500)});
  await page.keyboard.press('Escape').catch(()=>{});await page.waitForTimeout(600);await shot('battle-1280-150');await crop('tray-1280-150','.selection-tray');await crop('sidebar-1280-150','.command-sidebar');
  await step('replay',async()=>{await page.getByRole('button',{name:'Open pause menu'}).click();await page.getByRole('button',{name:'Return to command center'}).click();await page.waitForTimeout(800);
   await page.getByRole('button',{name:'Replay archive'}).first().click();await page.waitForTimeout(600);await shot('replay-archive-1280-150');
   await page.getByRole('button',{name:'Watch'}).first().click();await page.locator('.replay-controls').waitFor({timeout:60000});await page.waitForTimeout(1200);await shot('replay-1280-150');await crop('replay-well-1280-150','.selection-tray');
   await page.setViewportSize({width:1600,height:900});await page.waitForTimeout(600);await shot('replay-1600-150')});
 });
 await session('lan',{width:1600,height:900},async({page,shot,step})=>{await step('lobby',async()=>{await page.getByRole('button',{name:'Multiplayer'}).first().click();await page.waitForTimeout(1500);await shot('lan-1600');await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(500);await shot('lan-1280')})});
}catch(error){log.fatal=String(error.stack??error);process.exitCode=1}
finally{await browser.close();await writeFile(path.join(out,'log.json'),JSON.stringify(log,null,2));console.log(JSON.stringify({out,steps:log.steps.length,errors:log.errors.length,failed:log.failed,fatal:log.fatal??null},null,1))}
