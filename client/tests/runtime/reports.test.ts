import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalAPI} from '../../src/runtime/api';

test('reports send participant context only and propagate quota without retrying',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async(input,init)=>{calls++;assert.equal(String(input),'http://127.0.0.1:8080/api/v1/reports');assert.equal(init?.method,'POST');assert.deepEqual(init?.headers,{Authorization:'Bearer own-profile','Content-Type':'application/json'});assert.deepEqual(JSON.parse(String(init?.body)),{match_id:'match-one',tick:120,reason:'Event context'});return Response.json({code:'report_rate_exceeded',message:'Report limit reached.'},{status:429})};
  await assert.rejects(new LocalAPI('http://127.0.0.1:8080','own-profile').reportMatch('match-one',120,'Event context'),{code:'report_rate_exceeded',status:429});assert.equal(calls,1);
 }finally{globalThis.fetch=original}
});
test('own report paging encodes cursors and history retains the exact result payload',async()=>{
 const original=globalThis.fetch,paths:string[]=[];
 try{
  globalThis.fetch=async(input,init)=>{const url=new URL(String(input));paths.push(url.pathname);assert.deepEqual(init?.headers,{Authorization:'Bearer participant'});if(url.pathname.endsWith('/reports')){assert.equal(url.searchParams.get('before'),'cursor / value');assert.equal(url.searchParams.get('status'),'reviewed');assert.equal(url.searchParams.get('limit'),'7');return Response.json({reports:[],next_cursor:''})}return Response.json([{id:'own-match',created:1,void:false,payload:'eyJ0aWNrIjoxMjB9'}])};
  const api=new LocalAPI('http://localhost','participant');assert.deepEqual(await api.reports({status:'reviewed',before:'cursor / value',limit:7}),{reports:[],next_cursor:''});const history=await api.history();assert.equal(history[0].payload,'eyJ0aWNrIjoxMjB9');assert.deepEqual(paths,['/api/v1/reports','/api/v1/history']);
 }finally{globalThis.fetch=original}
});
