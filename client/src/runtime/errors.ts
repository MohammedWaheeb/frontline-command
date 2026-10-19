export interface RuntimeFailure {code:string;message:string;recoverable:boolean;found?:unknown;expected?:unknown}
export class RuntimeError extends Error implements RuntimeFailure {
 constructor(public code:string,message:string,public recoverable=true,public details?:unknown){super(message);this.name='RuntimeError'}
 static from(value:unknown):RuntimeError {
  if(value instanceof RuntimeError)return value;
  if(value && typeof value==='object' && 'code' in value && 'message' in value){
   const v=value as RuntimeFailure;return new RuntimeError(String(v.code),String(v.message),v.recoverable!==false,value);
  }
  return new RuntimeError('runtime_failed',value instanceof Error?value.message:String(value),false);
 }
}
export const failure=(code:string,message:string,recoverable=true):never=>{throw new RuntimeError(code,message,recoverable)};
/**
 * Player-facing presentation of any failure (design 22.4: never expose raw
 * technical errors as the only explanation). Curated RuntimeError/server
 * failures keep their authored text; anything else is classified into an
 * actionable message without leaking engine or browser internals.
 */
export function presentableFailure(value:unknown):{code:string;message:string;recoverable:boolean}{
 const known=RuntimeError.from(value);
 if(known.code!=='runtime_failed')return {code:known.code,message:known.message,recoverable:known.recoverable};
 const name=value instanceof Error?value.name:'',raw=value instanceof Error?value.message:String(value);
 if(name==='AbortError')return {code:'canceled',message:'The operation was canceled before it finished. Nothing was changed.',recoverable:true};
 if(name==='QuotaExceededError'||/quota/i.test(raw))return {code:'storage_full',message:'This browser profile is out of storage space. Delete old saves or free space, then try again.',recoverable:true};
 if(/failed to fetch|load failed|network ?error|connection (refused|reset|closed)/i.test(raw))return {code:'connection_failed',message:'The game could not reach the local host. Check that Frontline Command is still running, then try again.',recoverable:true};
 if(value instanceof SyntaxError||name==='SyntaxError')return {code:'invalid_data',message:'Stored or received data could not be read. Your existing saves and installed files are preserved.',recoverable:true};
 return {code:'unexpected_error',message:'Something interrupted that operation. Your saves and installed files are preserved — try again, and note the reference code if it repeats.',recoverable:true};
}
