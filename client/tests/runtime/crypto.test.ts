import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {sha256Hex,sha256Fallback,randomUUID} from '../../src/runtime/crypto';
const bytes=(text:string)=>new TextEncoder().encode(text);
test('SHA-256 fallback matches published empty, abc, multiblock and million-a vectors',async()=>{
 const vectors=[['','e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],['abc','ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq','248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],['a'.repeat(1000000),'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0']];
 for(const [input,expected] of vectors){assert.equal(await sha256Fallback(bytes(input)),expected);assert.equal(await sha256Hex(bytes(input)),expected)}
});
test('SHA-256 handles every padding boundary, sliced views, high bytes, and arbitrary binary blocks',async()=>{
 for(const size of [1,2,54,55,56,57,63,64,65,119,120,127,128,129,255,256,257,1024,262144,262145,1048577]){const value=randomBytes(size+11).subarray(7,7+size);assert.equal(await sha256Fallback(value),createHash('sha256').update(value).digest('hex'),`size ${size}`)}
});
test('fallback snapshots input and yields during large-file hashing without accepting later mutations',async()=>{
 const value=new Uint8Array(2*1024*1024).fill(199),expected=createHash('sha256').update(value).digest('hex');let yielded=false;setTimeout(()=>{yielded=true},0);const digest=sha256Fallback(value);value.fill(0);assert.equal(await digest,expected);assert.equal(yielded,true);
});
test('insecure-origin capability fallback uses CSPRNG UUIDv4 and never weak randomness',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto')!,source=globalThis.crypto;
 try{
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:source.getRandomValues.bind(source)}});
  const ids=new Set(Array.from({length:100},()=>randomUUID()));assert.equal(ids.size,100);for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.equal(await sha256Hex(bytes('abc')),createHash('sha256').update('abc').digest('hex'));
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{digest:async()=>{throw new Error('Native hashing unavailable')}}}});assert.equal(await sha256Hex(bytes('abc')),createHash('sha256').update('abc').digest('hex'));
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:undefined});assert.throws(()=>randomUUID(),{code:'secure_random_unavailable'});assert.equal(await sha256Hex(bytes('')),createHash('sha256').digest('hex'));
 }finally{Object.defineProperty(globalThis,'crypto',descriptor)}
});
