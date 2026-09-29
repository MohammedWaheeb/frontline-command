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
