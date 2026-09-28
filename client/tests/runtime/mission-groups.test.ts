import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,EntitySchema} from '../../src/protocol/frontline_pb';
import {missionGroups,readMissionGroupLabels} from '../../src/app/mission-groups';
const frame=()=>create(PlayerSnapshotSchema,{player:1,players:[{id:1,faction:'US'},{id:2,faction:'IR'}],mission:{id:'lesson',version:'1'}});
const presentation={mission_id:'lesson',mission_version:'1',actor_groups:[{origin:'initial:2',text:'Starting convoy'}],tutorial_factions:[{faction:'US',actor_groups:[{origin:'initial:255',text:'Recovery team'}]},{faction:'IR',actor_groups:[{origin:'initial:2',text:'Different faction'}]}]};
test('original-force labels merge only selected faction and reject ambiguous or incompatible metadata',()=>{
 assert.deepEqual(readMissionGroupLabels(presentation,frame()),[{origin:'initial:2',text:'Starting convoy'},{origin:'initial:255',text:'Recovery team'}]);
 assert.deepEqual(readMissionGroupLabels({mission_id:'lesson',mission_version:'1'},frame()),[]);
 assert.throws(()=>readMissionGroupLabels({...presentation,mission_version:'2'},frame()),/match/);
 assert.throws(()=>readMissionGroupLabels({...presentation,tutorial_factions:[presentation.tutorial_factions[0],presentation.tutorial_factions[0]]},frame()),/ambiguous/);
 assert.throws(()=>readMissionGroupLabels({...presentation,tutorial_factions:[{faction:'US',actor_groups:presentation.actor_groups}]},frame()),/malformed/);
 for(const origin of ['initial:256','initial:01','initial:-1','enemy:2','initial:2\n'])assert.throws(()=>readMissionGroupLabels({...presentation,actor_groups:[{origin,text:'Convoy'}]},frame()));
 for(const text of ['', ' ', 'x'.repeat(121),'Convoy\nattack'])assert.throws(()=>readMissionGroupLabels({...presentation,actor_groups:[{origin:'initial:3',text}]},frame()));
 assert.throws(()=>readMissionGroupLabels({...presentation,actor_groups:Array(257).fill(presentation.actor_groups[0])},frame()));
});
test('marked forces contain only living currently-owned originals; carried members are counted without selecting their carrier',()=>{
 const snapshot=frame(),entity=(id:number,owner:number,origin:string,hp=10n,container=0)=>create(EntitySchema,{id,owner,type:'US.rifle',private:{hp,missionOrigin:origin,container}});
 snapshot.entities=[entity(8,1,'initial:2'),entity(3,1,'initial:2'),entity(9,1,'initial:2',10n,55),entity(55,1,''),entity(6,2,'initial:2'),entity(7,1,'initial:2',0n),entity(12,1,''),entity(11,1,'initial:4')];
 const labels=readMissionGroupLabels(presentation,snapshot);
 assert.deepEqual(missionGroups(labels,snapshot),[{origin:'initial:2',text:'Starting convoy',ids:[3,8],aboard:1}]);
 snapshot.entities=snapshot.entities.filter(e=>![3,8].includes(e.id));
 assert.deepEqual(missionGroups(labels,snapshot),[{origin:'initial:2',text:'Starting convoy',ids:[],aboard:1}]);
 snapshot.entities=[];assert.deepEqual(missionGroups(labels,snapshot),[]);
});
