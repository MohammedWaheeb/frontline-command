// Assignment 04 visual review: drives the real product (Vite dev on 5173,
// actual Go/WASM worker) and captures screens for inspection. Not a release test.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const require=createRequire(path.join(root,'client/package.json'));
const {chromium}=require('playwright-core');
const url=process.env.FRONTLINE_UI_URL??'http://127.0.0.1:5173';
const tag=process.argv[2]??'baseline';
const out=path.join(root,'work/evidence/visual-review',tag);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const errors=[],failed=[],log={url,tag,date:new Date().toISOString(),browser:browser.version(),shots:[],steps:{}};
const page=await browser.newPage({viewport:{width:1600,height:900}});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
page.on('response',r=>{if(r.status()>=400)failed.push(`${r.status()} ${r.url()}`)});
const shot=async(name,opts={})=>{const file=path.join(out,name+'.png');await page.screenshot({path:file,...opts});log.shots.push(name)};
const crop=async(name,selector)=>{const el=page.locator(selector).first();if(await el.count())await el.screenshot({path:path.join(out,name+'.png')}),log.shots.push(name)};
try{
 await page.goto(url);
 const explore=page.getByRole('button',{name:'Explore game modes'});
 if(await explore.waitFor({timeout:20000}).then(()=>true,()=>false)){await shot('01-first-run-1600');await explore.click()}
 await page.waitForTimeout(800);await shot('02-menu-1600');
 await page.getByRole('button',{name:'Deploy to skirmish'}).click();await page.waitForTimeout(600);await shot('03-skirmish-1600');
 await page.getByRole('button',{name:'Deploy forces'}).click();
 await page.waitForTimeout(400);await shot('04-loading-1600');
 await page.locator('.battlefield-canvas canvas').waitFor({timeout:40000});
 await page.waitForTimeout(700);await shot('05-countdown-1600');
 await page.locator('.countdown').waitFor({state:'hidden',timeout:20000});
 await page.waitForTimeout(500);await shot('06-battle-1600');
 await crop('06a-sidebar-1600','.command-sidebar');await crop('06b-tray-1600','.selection-tray');await crop('06c-shoulder-1600','.resource-shoulder');
 const build=page.getByRole('button',{name:'Build',exact:true});
 if(await build.count()){await build.click();await page.waitForTimeout(500);await crop('07-build-tab','.command-sidebar');
  const power=page.locator('.production-cameo').filter({hasText:'Power station'}).first();
  if(await power.count()){await power.click();await page.mouse.move(560,560);await page.waitForTimeout(500);await shot('08-placement-1600');await page.mouse.click(560,560);await page.waitForTimeout(1500);log.steps.power='placed'}
 }
 const hq=page.getByRole('button',{name:'HQ',exact:true});
 if(await hq.count()){await hq.click();await page.waitForTimeout(500);const rig=page.locator('.production-cameo').first();await rig.click().catch(()=>{});await page.waitForTimeout(800);await shot('09-hq-queue-1600');await crop('09a-sidebar-queue','.command-sidebar');await crop('09b-tray-hq','.selection-tray')}
 await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(500);await shot('10-battle-1280');await crop('10a-sidebar-1280','.command-sidebar');await crop('10b-tray-1280','.selection-tray');
 await page.getByRole('button',{name:'Open pause menu'}).click();await page.waitForTimeout(400);await shot('11-pause-1280');
 const options=page.getByRole('button',{name:'Options',exact:true});
 if(await options.count()){await options.click();await page.waitForTimeout(400);await shot('12-options-1280');
  const scale=page.getByLabel('Interface scale',{exact:true});if(await scale.count()){await scale.selectOption('1.5');await page.waitForTimeout(400);await shot('13-options-150-1280')}
  await page.keyboard.press('Escape');await page.waitForTimeout(300);
 }
 await page.keyboard.press('Escape').catch(()=>{});await page.waitForTimeout(500);await shot('14-battle-150-1280');
 await page.setViewportSize({width:1600,height:900});await page.waitForTimeout(500);await shot('15-battle-150-1600');
}catch(error){log.error=String(error.stack??error);await shot('failure').catch(()=>{});process.exitCode=1}
finally{log.errors=errors;log.failed=failed;await writeFile(path.join(out,'log.json'),JSON.stringify(log,null,2));await browser.close();console.log(JSON.stringify(log,null,1))}
