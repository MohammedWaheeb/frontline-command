import test from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{streamingSHA256}from'./streaming-sha256.mjs';
const expected=bytes=>createHash('sha256').update(bytes).digest('hex');
test('SHA-256 known vectors and every padding boundary with fragmented views',()=>{
 for(const n of [0,1,3,55,56,57,63,64,65,119,120,127,128,129,255,256,257,1024,65535,65536,65537,1000000]){
  const b=new Uint8Array(n+6);for(let i=0;i<b.length;i++)b[i]=(i*73+i*i)%256;const v=b.subarray(3,3+n);
  for(const size of [1,7,64,65,1023,65536]){const h=streamingSHA256();for(let i=0;i<v.length;i+=size)h.update(v.subarray(i,i+size));assert.equal(h.hex(),expected(v),`${n}/${size}`);assert.equal(h.storageBytes,608)}
 }
 assert.equal(streamingSHA256().hex(),'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');const abc=streamingSHA256();abc.update(new TextEncoder().encode('abc'));assert.equal(abc.hex(),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('incremental hashing retains no input reference, has fixed storage and forbids reuse after finalization',()=>{const b=new Uint8Array(1<<20).fill(37),h=streamingSHA256(),oracle=createHash('sha256');for(let i=0;i<64;i++){h.update(b);oracle.update(b)}b.fill(0);assert.equal(h.hex(),oracle.digest('hex'));assert.equal(h.storageBytes,608);assert.throws(()=>h.hex());assert.throws(()=>h.update(b))});
