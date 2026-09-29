import assert from 'node:assert/strict';
export function courseBudgets({overallMinutes,roundMinutes,long=false}={}){
 const toMilliseconds=(value,fallback,label)=>{
  const n=Number(value??fallback);assert(Number.isFinite(n)&&n>0&&Number.isSafeInteger(n*60000),label+' must give positive safe milliseconds');return n*60000;
 };
 return {overallMilliseconds:toMilliseconds(overallMinutes,long?130:60,'Overall budget'),roundMilliseconds:toMilliseconds(roundMinutes,60,'Per-round budget')};
}
export function createInputGuard({verify,expectedSHA256}){
 assert.match(expectedSHA256,/^[a-f0-9]{64}$/);
 return async label=>{const result=await verify();assert.equal(result.receiptSHA256,expectedSHA256,'Prepared receipt changed between lifecycle boundaries');assert.equal(result.productChecked,true);return {label,receiptSHA256:result.receiptSHA256,verified:result.verified,status:'passed'}};
}
