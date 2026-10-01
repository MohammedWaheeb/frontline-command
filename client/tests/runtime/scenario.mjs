// Synthetic test geometry only, never a shipping map or mission.
export const map={id:'runtime-fixture',title:'Runtime integration fixture',author:'automated test',version:'1',format_version:1,ruleset:'standard-v2',width:64,height:64,tiles:Array.from({length:4096},()=>({terrain:'open',height:0})),spawns:[{position:{x:8000,y:8000},team:1},{position:{x:56000,y:56000},team:2}],fields:[{id:1,position:{x:14000,y:8000},credits:36000000},{id:2,position:{x:49000,y:56000},credits:36000000}],stations:[{id:3,position:{x:32000,y:24000}}],shipment:{x:32000,y:32000},required_packs:['2.0.0']};
export const scenario={config:{map,seed:42,skip_countdown:true,players:[{id:1,name:'Alpha',faction:'US',team:1},{id:2,name:'Bravo',faction:'IR',team:2,ai:'normal'}]},script:[
 {op:'checkpoint',label:'start'},
 {op:'submit',player:1,batch:{sequence:1,orders:[{kind:'move',entities:[2],position:{x:16000,y:12000}}]}},
 {op:'step',n:37},{op:'checkpoint',label:'moving'},
 {op:'submit',player:1,batch:{sequence:2,orders:[{kind:'stop',entities:[4]}]}},
 {op:'save_restore'},
 // Loading resumes above the engine's accepted sequence (1).
 {op:'submit',player:1,batch:{sequence:2,orders:[{kind:'stop',entities:[2]}]}},
 {op:'step',n:200},{op:'step',n:200},{op:'step',n:200},{op:'step',n:200},
 {op:'checkpoint',label:'economy'},{op:'view',player:1,label:'final'}]};
