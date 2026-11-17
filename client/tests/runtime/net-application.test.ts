import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Application,ContentBusyLabels} from '../../src/app/application';
import {Observable} from '../../src/app/store';
import type {ContentLoadEvent} from '../../src/runtime/content-library';
const event=(id:string,stage:ContentLoadEvent['stage']):ContentLoadEvent=>({kind:'map',id,stage});
function fixture(){const app=Object.create(Application.prototype) as any;app.busyLabels=new ContentBusyLabels();app.state=new Observable({page:'command',session:{phase:'menu'}});return app}
test('M3-01: non-task library loads clear on ready/error, retain another pending load and ignore unrelated completions',()=>{
 assert.match(readFileSync('src/app/application.ts','utf8'),/onLoad:event=>this\.patch\(\{busy:this\.busyLabels\.load\(event\)\}\)/);
 const labels=new ContentBusyLabels();assert.equal(labels.load(event('copper-junction','fetching')),'Fetching copper-junction…');
 assert.equal(labels.load(event('copper-junction','validating')),'Validating copper-junction…');assert.equal(labels.load(event('other','ready')),'Validating copper-junction…');
 assert.equal(labels.load(event('copper-junction','ready')),undefined);
 labels.load(event('copper-junction','fetching'));labels.load(event('industrial-valley','validating'));
 assert.equal(labels.load(event('industrial-valley','error')),'Fetching copper-junction…');assert.equal(labels.load(event('copper-junction','error')),undefined);
});
test('M3-01: actual nested tasks retain their labels through library ready/error and restore pending background work',async()=>{
 const app=fixture(),load=(id:string,stage:ContentLoadEvent['stage'])=>app.patch({busy:app.busyLabels.load(event(id,stage))});
 load('background','fetching');await app.task('Starting operation…',async()=>{
  load('map','validating');assert.equal(app.state.get().busy,'Starting operation…');
  await app.task('Nested preflight…',async()=>{load('map','ready');assert.equal(app.state.get().busy,'Nested preflight…')});
  assert.equal(app.state.get().busy,'Starting operation…');load('optional','fetching');load('optional','error');assert.equal(app.state.get().busy,'Starting operation…');
 });assert.equal(app.state.get().busy,'Fetching background…');load('background','ready');assert.equal(app.state.get().busy,undefined);
 await app.task('Failure…',async()=>{load('map','fetching');load('map','error');throw new Error('Expected failure')});assert.equal(app.state.get().busy,undefined);assert.ok(app.state.get().error);
});
test('M3-07: page/session boundaries discard stale notices while ordinary updates and intentional new notices survive',()=>{
 const app=fixture();app.patch({notice:'Select units first.'});app.patch({page:'command'});assert.equal(app.state.get().notice,'Select units first.');
 app.patch({page:'saves'});assert.equal(app.state.get().notice,undefined);app.patch({notice:'Replay archived.'});app.patch({session:{id:'next',kind:'solo',phase:'active'}});assert.equal(app.state.get().notice,undefined);
 app.patch({notice:'Old battle notice'});app.patch({session:{id:'next',kind:'solo',phase:'active'}});assert.equal(app.state.get().notice,'Old battle notice');app.patch({session:{phase:'menu'}});assert.equal(app.state.get().notice,undefined);
 app.patch({page:'command',notice:'A checkpoint could not be updated.'});assert.equal(app.state.get().notice,'A checkpoint could not be updated.');
});
