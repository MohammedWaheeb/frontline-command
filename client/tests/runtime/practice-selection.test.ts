import test from 'node:test';
import assert from 'node:assert/strict';
import {reconciledMapID} from '../../src/ui/practice-selection';
const maps=[{id:'dry-river'},{id:'relay-heights'}];
test('practice map selection reconciles against the loaded index',()=>{
 // The panel can mount before the index arrives, leaving no stored choice.
 assert.equal(reconciledMapID(maps,''),'dry-river');
 assert.equal(reconciledMapID(maps,'relay-heights'),'relay-heights');
 // A choice from a previous index that no longer exists falls back too.
 assert.equal(reconciledMapID(maps,'removed-map'),'dry-river');
 assert.equal(reconciledMapID([],'dry-river'),'');
});
