import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {MissionProgressSchema} from '../../src/protocol/frontline_pb';
import {activeMissionMarkers,readMissionMarkers} from '../../src/app/mission-markers';
import type {GameMap} from '../../src/runtime';
const map={width:128,height:128,regions:[{id:'first',min:{x:29000,y:94000},max:{x:36999,y:102999}}]} as GameMap;
const mission=create(MissionProgressSchema,{id:'lesson',version:'1',objectives:[{id:'move'},{id:'loss',failure:true}]});
const presentation={mission_id:'lesson',mission_version:'1',markers:[{id:'move',text:'Movement area',region:'first',objective:'move'}]};
test('authored objective markers resolve public regions and disappear only after authoritative completion',()=>{
 const markers=readMissionMarkers(presentation,map,mission);assert.deepEqual(markers[0].position,{x:32999,y:98499});assert.equal(activeMissionMarkers(markers,mission).length,1);
 const done=structuredClone(mission);done.objectives[0].complete=true;assert.deepEqual(activeMissionMarkers(markers,done),[]);assert.deepEqual(activeMissionMarkers(markers,undefined),[]);
 const plain=readMissionMarkers({...presentation,markers:[{id:'briefed',text:'Briefed location',region:'first'}]},map,mission);assert.equal(activeMissionMarkers(plain,done).length,1);
 markers[0].min.x=0;assert.equal(map.regions![0].min.x,29000);
});
test('mission marker loading rejects wrong versions, duplicate IDs, invalid regions and hidden/failure objectives',()=>{
 assert.throws(()=>readMissionMarkers({...presentation,mission_version:'2'},map,mission),/match/);
 assert.throws(()=>readMissionMarkers({...presentation,markers:[...presentation.markers,...presentation.markers]},map,mission),/malformed/);
 for(const change of [{region:'enemy-secret'},{objective:'unknown'},{objective:'loss'},{text:'x'.repeat(201)}])assert.throws(()=>readMissionMarkers({...presentation,markers:[{...presentation.markers[0],...change}]},map,mission));
 assert.throws(()=>readMissionMarkers(presentation,{...map,regions:[{id:'first',min:{x:0,y:0},max:{x:128000,y:10}}]},mission),/valid map region/);
 assert.throws(()=>readMissionMarkers({...presentation,markers:Array(129).fill({})},map,mission),/malformed/);
});
