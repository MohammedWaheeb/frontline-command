/** Display conversions only. Combat calculations stay in Go. */
export function milliUnits(value:bigint|number):number {
 if(typeof value==='number'){if(!Number.isSafeInteger(value))throw new RangeError('Unsafe fixed-point value');return value/1000}
 const whole=value/1000n,remainder=value%1000n;
 if(whole>BigInt(Number.MAX_SAFE_INTEGER)||whole<BigInt(Number.MIN_SAFE_INTEGER))throw new RangeError('Fixed-point display value is too large');
 return Number(whole)+Number(remainder)/1000;
}
export function ticksToSeconds(ticks:number){return ticks/20}
export function sequenceAfter(local:number,accepted=0):number {
 const next=Math.max(local,accepted)+1;
 if(!Number.isSafeInteger(next)||next<1||next>0xffffffff)throw new RangeError('Command sequence exhausted');return next;
}
