import test from 'node:test';
import assert from 'node:assert/strict';
import {RuntimeError,presentableFailure} from '../../src/runtime/errors';

test('curated runtime failures keep their authored message and code',()=>{
 const presented=presentableFailure(new RuntimeError('content_busy','Return to the command menu first.'));
 assert.deepEqual(presented,{code:'content_busy',message:'Return to the command menu first.',recoverable:true});
});

test('unknown errors never expose raw technical text',()=>{
 const presented=presentableFailure(new Error('Uncaught TypeError: Cannot read properties of undefined (reading \'x\') at foo.js:1:99'));
 assert.equal(presented.code,'unexpected_error');
 assert.ok(!presented.message.includes('TypeError'));
 assert.ok(!presented.message.includes('foo.js'));
 assert.match(presented.message,/preserved/);
});

test('network, quota, abort and parse failures map to actionable text',()=>{
 assert.equal(presentableFailure(new TypeError('Failed to fetch')).code,'connection_failed');
 const quota=new Error('quota');quota.name='QuotaExceededError';
 assert.equal(presentableFailure(quota).code,'storage_full');
 const abort=new Error('aborted');abort.name='AbortError';
 assert.equal(presentableFailure(abort).code,'canceled');
 assert.equal(presentableFailure(new SyntaxError('Unexpected token < in JSON')).code,'invalid_data');
 for(const value of [new TypeError('Load failed'),quota,abort]){
  const presented=presentableFailure(value);
  assert.ok(presented.message.length>20&&!presented.message.includes('Error:'));
 }
});

test('plain server failure objects pass through with their code',()=>{
 const presented=presentableFailure({code:'save_conflict',message:'The save changed; reload before retrying.'});
 assert.equal(presented.code,'save_conflict');
 assert.equal(presented.message,'The save changed; reload before retrying.');
});
