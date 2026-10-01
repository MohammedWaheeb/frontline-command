import {OfflineTransport} from '../../src/runtime/offline';
import type {GameMap,OrderIntent} from '../../src/runtime/types';
const map:GameMap={id:'skybreaker-review-course',title:'Synthetic Skybreaker review course',author:'test',version:'1',format_version:1,ruleset:'standard-v2',width:64,height:64,tiles:Array.from({length:4096},()=>({terrain:'open',height:0})),spawns:[{position:{x:8000,y:8000}},{position:{x:56000,y:56000}}],shipment:{x:45000,y:36000},fields:[{id:1,position:{x:14000,y:8000},credits:36000000},{id:2,position:{x:49000,y:56000},credits:36000000}],required_packs:['2.0.0']};
const runtime=new OfflineTransport();await runtime.ready;
async function command(order:OrderIntent){const p=await runtime.previewOrders([order]);if(!p.results[0]?.accepted)throw Error(JSON.stringify(p));await runtime.sendOrders([order]);await runtime.step(2)}
Object.assign(window,{strikeSetup:async()=>{
 await runtime.create({map,ruleset:'practice-v1',players:[{id:1,name:'Review commander',faction:'US',team:1,controller:'human'},{id:2,name:'Hidden opponent',faction:'IR',team:2,controller:'human'}],seed:4201,skip_countdown:true});
 await command({kind:'practice_resources',target:1,index:100000});
 for(const x of [5000,10000,15000,20000,25000,30000])await command({kind:'practice_spawn',type:'power',target:1,index:1,position:{x,y:44000}});
 for(const [type,x,y] of [['barracks',22000,8000],['factory',24000,14000],['radar',29000,8000],['tech',33000,14000],['strategic',42000,14000],['US.recon',32500,28500]] as const)await command({kind:'practice_spawn',type,target:1,index:1,position:{x,y}});
 for(let n=0;n<250&&runtime.current!.players[0].strategicProgress<1000;n++)await runtime.step(20);
 if(runtime.current!.players[0].strategicProgress!==1000)throw Error('Strategic charge did not complete');
 const save=await runtime.save(),replay=await runtime.exportReplay(),site=runtime.current!.entities.find(e=>e.owner===1&&e.type==='strategic')!,result={map,site:{id:site.id,position:site.position},tick:save.tick,hash:save.hash,version:runtime.version,commands:Array.from(replay),save:JSON.stringify({format:'frontline-local-save',version:1,id:'skybreaker-review-course',name:'Skybreaker review practice course',local_players:save.local_players,hash:save.hash,engine:new TextDecoder().decode(save.data)})};runtime.dispose();return result;
}});document.body.dataset.ready='true';
