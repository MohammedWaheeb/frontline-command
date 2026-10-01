// Test-only prefix for a frozen worker. Measures the real exported Go calls;
// it does not alter arguments, results, ticks, orders or the simulation clock.
(() => {
 let api;let totals={};const send=globalThis.postMessage.bind(globalThis);
 Object.defineProperty(globalThis,'__frontlineGo',{configurable:true,get:()=>api,set:value=>{
  api=value;for(const name of Object.keys(api)){const call=api[name];if(typeof call!=='function')continue;api[name]=function(...args){const at=performance.now();try{return call.apply(this,args)}finally{const elapsed=performance.now()-at;const row=totals[name]??={count:0,total:0,max:0};row.count++;row.total+=elapsed;row.max=Math.max(row.max,elapsed)}}}
 }});
 globalThis.postMessage=function(message,transfer){if(message?.id&&message.ok)send({event:'qa-go-call-timing',totals});return send(message,transfer)};
})();
