import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MissionDisclosurePanel} from '../../src/ui/MissionObjectives';

const data={id:'us-02-open-corridor',version:'1.7-audit',rulesNotice:'Ordinary rules. <script>SECRET</script>',failures:[{id:'lost',text:'Lose <HQ> & command assets.'}]};
test('ready context displays verified identity, renders FAILED and escapes public text',()=>{
 const html=renderToStaticMarkup(createElement(MissionDisclosurePanel,{context:{phase:'ready',data},objectives:[{id:'lost',failure:true,complete:true}],onRetry(){}}));
 assert.match(html,/<summary>Scenario rules &amp; failure conditions<\/summary>/);
 assert.match(html,/<small style="display:block;overflow-wrap:anywhere">Operation us-02-open-corridor · version 1\.7-audit<\/small>/);
 assert.match(html,/<strong>FAILED<\/strong>/);assert.doesNotMatch(html,/i-check|<script>|<HQ>/);
 assert.match(html,/&lt;script&gt;SECRET&lt;\/script&gt;/);assert.match(html,/Lose &lt;HQ&gt; &amp; command assets\./);
 assert.match(html,/overflow-wrap:anywhere/);assert.match(html,/data-mission-context="ready"/);assert.doesNotMatch(html,/<details[^>]*\sopen=/);
});
test('an untriggered failure remains a failure condition when another objective is complete',()=>{
 const html=renderToStaticMarkup(createElement(MissionDisclosurePanel,{context:{phase:'ready',data},objectives:[{id:'won',failure:false,complete:true},{id:'lost',failure:true,complete:false}],onRetry(){}}));
 assert.match(html,/<strong>Failure condition<\/strong>/);assert.doesNotMatch(html,/FAILED|i-check/);
});
test('unavailable mismatch has explicit retry and cannot display stale verified identity or rules',()=>{
 const html=renderToStaticMarkup(createElement(MissionDisclosurePanel,{context:{phase:'unavailable',message:'A matching installed version is unavailable.',data},objectives:[],onRetry(){}}));
 assert.match(html,/role="status"/);assert.match(html,/<button>Retry mission context<\/button>/);assert.match(html,/matching installed version/);assert.doesNotMatch(html,/us-02-open-corridor|1\.7-audit|Operation |Ordinary rules|SECRET|Lose|FAILED/);
});
