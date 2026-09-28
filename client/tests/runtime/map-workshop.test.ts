import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalAPI} from '../../src/runtime/api';
import {ModerationController} from '../../src/app/moderation-controller';
function json(value:unknown,status=200,headers:Record<string,string>={}){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...headers}})}
test('map context transmits only explicit admission and verifies declared map hash before exposing map',async()=>{
 const old=fetch,requests:string[]=[];globalThis.fetch=(async(input)=>{requests.push(String(input));return json({id:'map',version:'1'},200,{'X-Frontline-Map-Hash':'original-map'})}) as typeof fetch;
 try{const api=new LocalAPI('http://localhost','profile-token');assert.equal((await api.map('map',{lobby_id:'lobby-one'},'original-map')).id,'map');assert.equal(new URL(requests[0]).searchParams.get('lobby_id'),'lobby-one');await assert.rejects(api.map('map',{match_id:'match-one'},'newer-map'),{code:'map_version_mismatch'});assert.equal(new URL(requests[1]).searchParams.get('match_id'),'match-one')}finally{globalThis.fetch=old}
});
test('map moderator submits both displayed revisions and preserves reported evidence when author changes concurrently',async()=>{
 const old=fetch,token='c'.repeat(64),map={id:'custom-one',title:'Original map'},report={id:'report-one',map_id:map.id,map_revision:1,revision:0,decision:'pending',reason:'Unsafe published title',created:1},detail={report,current_map:{...map,revision:4,content_revision:3,owner:'author',owner_name:'Author',published:true,removed:false},reported_map:map,current_map_data:{...map,title:'Current revised title'},reviews:[]};let sent:any,writes=0;
 globalThis.fetch=(async(input,init={})=>{const path=new URL(String(input)).pathname;if(init.method==='POST'){sent=JSON.parse(String(init.body));writes++;return json({code:'review_conflict',message:'Map changed. Reload both revisions.'},409)}return json(path.endsWith('/report-one')?detail:{reports:[],next_cursor:''})}) as typeof fetch;
 const controller=new ModerationController();try{controller.setHost('http://localhost:8080');await controller.unlock(token);await controller.selectMap(report.id);assert.equal(await controller.reviewMap('removed','Reviewed both map revisions.'),false);assert.equal(writes,1);assert.deepEqual(sent,{decision:'removed',note:'Reviewed both map revisions.',expected_revision:0,expected_map_revision:4});assert.equal(controller.state.get().mapDetail?.reported_map.title,'Original map');assert.equal(controller.state.get().mapDetail?.current_map_data.title,'Current revised title');controller.lock();assert.equal(controller.state.get().mapDetail,undefined)}finally{controller.dispose();globalThis.fetch=old}
});
