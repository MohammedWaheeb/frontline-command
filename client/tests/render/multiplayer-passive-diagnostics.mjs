// Passive per-page CDP/PW reporting only. No native fetch wrapper, body read,
// cancellation classification or suppression. Static full URLs retain identity;
// API paths omit query strings so credentials/invite values cannot enter logs.
export async function installMultiplayerDiagnostics(page,stamp=()=>({})){
 const session=await page.context().newCDPSession(page),info=await session.send('Target.getTargetInfo');
 if(info.targetInfo.type!=='page')throw Error('Expected page target');
 const requests=new Map(),failures=[],faults=[];let order=0;
 const clean=value=>{const u=new URL(value);return /^\/(art|assets|runtime|content)\//.test(u.pathname)?u.href:u.origin+u.pathname};
 session.on('Network.requestWillBeSent',e=>{order++;if(requests.size>=100000){faults.push('Request trace limit exceeded');return}requests.set(e.requestId,{id:info.targetInfo.targetId+':'+e.requestId,url:clean(e.request.url),method:e.request.method,type:e.type,frameId:e.frameId,loaderId:e.loaderId,startedOrder:order,...stamp()})});
 session.on('Network.responseReceived',e=>{order++;Object.assign(requests.get(e.requestId)??{},{status:e.response.status,responseOrder:order,fromServiceWorker:e.response.fromServiceWorker})});
 session.on('Network.loadingFailed',e=>{order++;failures.push({...requests.get(e.requestId),id:info.targetInfo.targetId+':'+e.requestId,message:e.errorText,canceled:e.canceled,failureOrder:order,...stamp()})});
 session.on('Network.loadingFinished',e=>{order++;Object.assign(requests.get(e.requestId)??{},{finishedOrder:order})});
 await session.send('Network.enable');const playwright=[];
 page.on('requestfailed',request=>playwright.push({url:clean(request.url()),message:request.failure()?.errorText,...stamp()}));
 const counts=values=>{const m=new Map();for(const v of values){const k=JSON.stringify([v.url,v.message]);m.set(k,(m.get(k)??0)+1)}return [...m].sort()};
 return {snapshot:()=>({targetId:info.targetInfo.targetId,failures:[...failures],playwright:[...playwright],faults:[...faults],diagnosticsAgree:JSON.stringify(counts(failures))===JSON.stringify(counts(playwright)),requests:requests.size,comparison:'URL/error multiset agreement corroborates raw counts only; it does not prove native body EOF or pair a failure with an application cancellation.',meaning:'Raw diagnostics only. Prior native streaming reproduction is context, not an attribution or whitelist for these requests.'})};
}
