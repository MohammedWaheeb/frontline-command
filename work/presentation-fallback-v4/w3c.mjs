import assert from 'node:assert/strict';
export const ELEMENT='element-6066-11e4-a52e-4f735466cecf';
export class WebDriverError extends Error {
 constructor(method,path,status,value){super(`${method} ${path}: ${value?.error??status}: ${value?.message??JSON.stringify(value)}`);this.name='WebDriverError';Object.assign(this,{method,path,status,value})}
}
export class WebDriver {
 constructor(origin,{fetcher=fetch,timeout=90000}={}){const u=new URL(origin);assert(['127.0.0.1','localhost','[::1]'].includes(u.hostname),'Local driver only');this.origin=u.origin;this.fetcher=fetcher;this.timeout=timeout;this.sessionID=undefined;this.capabilities=undefined;this.commands=[]}
 async request(method,path,body){const started=Date.now();const response=await this.fetcher(this.origin+path,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(this.timeout)});let envelope;try{envelope=JSON.parse(await response.text())}catch{throw new WebDriverError(method,path,response.status,{error:'invalid driver JSON'})}this.commands.push({method,path,status:response.status,elapsedMs:Date.now()-started});if(!response.ok||envelope.value?.error)throw new WebDriverError(method,path,response.status,envelope.value);return envelope.value}
 async create(alwaysMatch){const value=await this.request('POST','/session',{capabilities:{alwaysMatch,firstMatch:[{}]}});assert(value.sessionId&&value.capabilities,'Invalid W3C new-session reply');this.sessionID=value.sessionId;this.capabilities=value.capabilities;return value}
 async call(method,path,body){assert(this.sessionID,'No active session');return this.request(method,`/session/${encodeURIComponent(this.sessionID)}${path}`,body)}
 async close(){if(!this.sessionID)return;await this.call('DELETE','');this.sessionID=undefined}
 execute(script,...args){return this.call('POST','/execute/sync',{script,args})}
 navigate(url){return this.call('POST','/url',{url})}
 click(element){return this.call('POST',`/element/${encodeURIComponent(element[ELEMENT])}/click`,{})}
 keys(element,text){return this.call('POST',`/element/${encodeURIComponent(element[ELEMENT])}/value`,{text,value:[...text]})}
 actions(actions){return this.call('POST','/actions',{actions})}
 async pointer(x,y,button=0){assert(Number.isFinite(x)&&Number.isFinite(y));await this.actions([{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:120,origin:'viewport',x:Math.round(x),y:Math.round(y)},{type:'pointerDown',button},{type:'pointerUp',button}]}]);await this.call('DELETE','/actions')}
 screenshot(){return this.call('GET','/screenshot')}
}
export async function until(fn,label,{timeout=30000,interval=150,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){const deadline=Date.now()+timeout;do{const result=await fn();if(result)return result;await sleep(interval)}while(Date.now()<deadline);throw Error(`Timed out: ${label}`)}
// DOM reads locate a unique visible control. Interaction still uses W3C element
// click, key or pointer commands; scripts never click or write form values.
export async function find(wd,selector,{text,scope,visible=true,enabled=false}={}){return wd.execute(`const [selector,text,scope,visible,enabled]=arguments;const norm=s=>(s??'').replace(/\\s+/g,' ').trim().toLowerCase();const parent=scope?document.querySelector(scope):document;if(!parent)return null;const rows=[...parent.querySelectorAll(selector)].filter(n=>(!visible||(n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden'))&&(!enabled||!n.disabled)&&(!text||[n.getAttribute('aria-label'),n.innerText,n.textContent,...[...n.querySelectorAll(':scope > span')].map(s=>s.textContent)].some(v=>norm(v)===norm(text))));if(rows.length>1)throw Error('Ambiguous control '+selector+' '+text+': '+rows.length);return rows[0]??null;`,selector,text??null,scope??null,visible,enabled)}
export async function control(wd,selector,options={}){return until(()=>find(wd,selector,options),`control ${selector} ${options.text??''}`)}
export async function click(wd,selector,options={}){const element=await control(wd,selector,{...options,enabled:true});await wd.execute('arguments[0].scrollIntoView({block:"center",inline:"nearest"});',element);await wd.click(element);return element}
export async function select(wd,selector,value){const element=await control(wd,selector);const option=await wd.execute('return [...arguments[0].options].find(o=>o.value===arguments[1])??null;',element,String(value));assert(option,`No option ${value}`);await wd.execute('arguments[0].scrollIntoView({block:"center"});',element);await wd.click(option);await until(()=>wd.execute('return arguments[0].value===arguments[1];',element,String(value)),`select ${selector}=${value}`)}
