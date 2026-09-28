// Actual menu and settings over a local Go host, with an isolated art candidate.
// Browser plugin unavailable in this workspace; use the existing Playwright
// fallback. No combat, simulated wins or shipping art claims are made here.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),require=createRequire(path.join(root,'client/package.json'));
const playwright=await import(require.resolve('playwright-core')),{chromium}=playwright.default??playwright;
const build=path.join(here,'product-preview'),product=path.join(build,'product'),out=path.join(here,'browser-'+new Date().toISOString().replaceAll(':','-'));
await mkdir(out,{recursive:true});
await writeFile(path.join(out,'driver.mjs'),await readFile(fileURLToPath(import.meta.url)));
const report={time:new Date().toISOString(),scope:'Actual frozen product menu, illustrative image only; incomplete game, no simulation/runtime or shipping promotion.',build:JSON.parse(await readFile(path.join(build,'build.json'),'utf8')),checks:[],errors:[],httpErrors:[]};
const child=spawn(path.join(build,'frontline'),['-addr','127.0.0.1:0','-data',path.join(out,'host-data'),'-static',product,'-maps',path.join(product,'content/maps'),'-missions',path.join(product,'content/missions')],{cwd:root,stdio:['ignore','pipe','pipe']});
let log='',browser,page;
try{
 const origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Host startup timed out')),30000);child.stdout.on('data',data=>{log+=data;const m=log.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0])}});child.stderr.on('data',data=>log+=data);child.once('exit',code=>{clearTimeout(timer);reject(Error('Host exit '+code))})});
 browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1600,height:900}});page.setDefaultTimeout(60000);report.browser=browser.version();
 let phase='ordinary';page.on('pageerror',e=>report.errors.push({phase,type:'pageerror',message:e.message}));page.on('console',m=>{if(m.type()==='error')report.errors.push({phase,type:'console',message:m.text()})});page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({phase,path:new URL(r.url()).pathname,status:r.status()})});
 const ready=()=>page.waitForFunction(()=>!document.querySelector('.loading-screen'));
 const capture=async name=>{await page.screenshot({path:path.join(out,name+'.png')});await writeFile(path.join(out,name+'.dom.txt'),await page.locator('body').innerText())};
 await page.goto(origin);await page.getByRole('button',{name:'Explore game modes',exact:true}).click();await ready();
 await page.locator('[data-key-art] img').evaluate(img=>img.decode());assert.equal(await page.locator('[data-key-art] img').evaluate(img=>img.naturalWidth),1672);
 for(const [width,height] of [[1600,900],[1280,720]]){
  await page.setViewportSize({width,height});await page.locator('[data-key-art] img').evaluate(img=>img.decode());await capture(`menu-${width}-100`);
  const menu=page.getByRole('navigation',{name:'Main menu'});assert.equal(await menu.getByRole('button').count(),11);
  const skirmish=menu.getByRole('button',{name:'Skirmish',exact:true});await skirmish.focus();await page.keyboard.press('Enter');await page.getByLabel('Battlefield',{exact:true}).waitFor();assert(await page.getByLabel('Battlefield',{exact:true}).isEnabled());await capture(`skirmish-${width}`);await menu.getByRole('button',{name:'Command center',exact:true}).click();
  report.checks.push({name:'Native menu and keyboard skirmish navigation',width,height});
 }
 const menu=page.getByRole('navigation',{name:'Main menu'});await menu.getByRole('button',{name:'Options',exact:true}).click();await page.getByLabel('Interface scale',{exact:true}).selectOption('1.5');await menu.getByRole('button',{name:'Command center',exact:true}).click();await capture('menu-1280-150');
 const help=menu.getByRole('button',{name:'Help',exact:true});await help.scrollIntoViewIfNeeded();await help.focus();await page.keyboard.press('Enter');await page.locator('.page-panel>header h2').filter({hasText:'Help'}).waitFor();report.checks.push({name:'150 percent menu controls remain reachable by keyboard'});
 await menu.getByRole('button',{name:'Options',exact:true}).click();await page.getByLabel('Interface scale',{exact:true}).selectOption('1');await menu.getByRole('button',{name:'Command center',exact:true}).click();await page.setViewportSize({width:1600,height:900});
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);
 phase='missing-image';await page.route('**/art/ui/main_menu_key_art-column-02.png',r=>r.fulfill({status:404,body:'Deliberate missing image test'}));await page.reload();await ready();await page.locator('canvas.menu-diorama[data-ready="true"]').waitFor({timeout:120000});assert.equal(await page.locator('[data-key-art]').count(),0);await page.getByRole('button',{name:'Deploy to skirmish',exact:true}).click();await page.getByLabel('Battlefield',{exact:true}).waitFor();await capture('missing-image-fallback');
 assert.deepEqual(report.httpErrors,[{phase:'missing-image',path:'/art/ui/main_menu_key_art-column-02.png',status:404}]);assert.equal(report.errors.length,1);assert.equal(report.errors[0].type,'console');assert.match(report.errors[0].message,/404/);report.checks.push({name:'Missing illustration falls back to original diorama; menu stays usable; exact injected404 only'});report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{})}
finally{if(browser)await browser.close();if(child.exitCode===null){const ended=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await ended}await writeFile(path.join(out,'host.log'),log);await writeFile(path.join(out,'browser.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status,out)}
