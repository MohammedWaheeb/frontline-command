import {RuntimeError} from './errors';

// SHA-256, FIPS 180-4 sections 4.1.2, 4.2.2, 5.1.1 and 6.2.
// Integrity hashing only: this is neither password hashing nor authentication.
const constants=new Uint32Array([
 0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
 0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
 0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
 0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
 0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
 0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
 0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
 0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);
function rotate(value:number,bits:number){return(value>>>bits)|(value<<(32-bits))}
function hex(bytes:Uint8Array){return Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('')}
function copy(data:Uint8Array){if(!(data instanceof Uint8Array))throw new RuntimeError('hash_input','Hash input must be bytes.');return data.slice()}
async function fallback(data:Uint8Array):Promise<string>{
 const state=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),words=new Uint32Array(64);
 const process=(block:Uint8Array,offset:number)=>{
  for(let i=0;i<16;i++){const at=offset+i*4;words[i]=(block[at]<<24)|(block[at+1]<<16)|(block[at+2]<<8)|block[at+3]}
  for(let i=16;i<64;i++){const x=words[i-15],y=words[i-2],s0=rotate(x,7)^rotate(x,18)^(x>>>3),s1=rotate(y,17)^rotate(y,19)^(y>>>10);words[i]=(words[i-16]+s0+words[i-7]+s1)>>>0}
  let [a,b,c,d,e,f,g,h]=state;
  for(let i=0;i<64;i++){
   const sigma1=rotate(e,6)^rotate(e,11)^rotate(e,25),choice=(e&f)^(~e&g),t1=(h+sigma1+choice+constants[i]+words[i])>>>0;
   const sigma0=rotate(a,2)^rotate(a,13)^rotate(a,22),majority=(a&b)^(a&c)^(b&c),t2=(sigma0+majority)>>>0;
   h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
  }
  state[0]=(state[0]+a)>>>0;state[1]=(state[1]+b)>>>0;state[2]=(state[2]+c)>>>0;state[3]=(state[3]+d)>>>0;
  state[4]=(state[4]+e)>>>0;state[5]=(state[5]+f)>>>0;state[6]=(state[6]+g)>>>0;state[7]=(state[7]+h)>>>0;
 };
 const fullLength=data.length-data.length%64;
 for(let offset=0;offset<fullLength;offset+=64){process(data,offset);if(offset>0&&offset%(256*1024)===0)await new Promise<void>(resolve=>setTimeout(resolve,0))}
 // At most two padded blocks; do not allocate another full copy of a large file.
 const remaining=data.length-fullLength,tail=new Uint8Array(remaining<56?64:128);tail.set(data.subarray(fullLength));tail[remaining]=0x80;
 const length=new DataView(tail.buffer);length.setUint32(tail.length-8,Math.floor(data.length/0x20000000),false);length.setUint32(tail.length-4,(data.length*8)>>>0,false);
 for(let offset=0;offset<tail.length;offset+=64)process(tail,offset);
 return Array.from(state,word=>word.toString(16).padStart(8,'0')).join('');
}
/** Independent fallback entry point for conformance tests; snapshots input before yielding. */
export function sha256Fallback(data:Uint8Array):Promise<string>{return fallback(copy(data))}
/** Native where available; ordinary HTTP LAN uses the same SHA-256 via the bounded fallback. */
export async function sha256Hex(data:Uint8Array):Promise<string>{
 const bytes=copy(data),subtle=globalThis.crypto?.subtle;
 if(subtle){try{return hex(new Uint8Array(await subtle.digest('SHA-256',bytes.buffer)))}catch{/* An unavailable native implementation can use the same deterministic hash. */}}
 return fallback(bytes);
}
/** UUIDv4 using only browser CSPRNG entropy. getRandomValues works on ordinary HTTP origins. */
export function randomUUID():string{
 const source=globalThis.crypto;
 if(typeof source?.randomUUID==='function')return source.randomUUID();
 if(typeof source?.getRandomValues!=='function')throw new RuntimeError('secure_random_unavailable','This browser cannot securely create a local file ID. Try a current browser or localhost.');
 const bytes=new Uint8Array(16);source.getRandomValues(bytes);bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
 const value=hex(bytes);return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
}
