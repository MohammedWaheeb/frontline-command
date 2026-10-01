import {LocalAPI,type Profile,type SaveSummary,type RemoteSettings,type RemoteCampaignProgress} from '../../src/runtime/api';
import {LocalCredentialVault,LocalProfileSession} from '../../src/runtime/account';
import {RuntimeError} from '../../src/runtime/errors';
import type {SaveData} from '../../src/runtime/types';
export const metadata={simulation:'test',protocol:1,content_hash:'fixture',map_version:'1',ruleset:'scenario-v2',seed:1};
export function fixtureSave(tick=100):SaveData{
 const state={metadata,tick,players:[{id:1,controller:'human'},{id:2,controller:'ai'}],mission:{definition:{id:'synthetic-mission',version:'1'},difficulty:'normal',checkpoint:'opening',checkpoint_tick:0,objectives:[{id:'synthetic-objective',complete:tick>200,progress:tick}]}};
 const data=new TextEncoder().encode('{"version":1,"sha256":"fixture","state":'+JSON.stringify(state).replace(/}$/,',"rng":18446744073709551615}')+'}');return {data,tick,metadata,hash:'fixture',local_players:[1]};
}
export async function inspectFixture(data:Uint8Array){const value=JSON.parse(new TextDecoder().decode(data));if(value.version!==1)throw new RuntimeError('save_incompatible','Fixture version is unsupported.');return {metadata:value.state.metadata,tick:value.state.tick}}
export class FakeLocalHost{
 profiles=new Map<string,Profile>();saves=new Map<string,SaveSummary&{data:Uint8Array}>();preferences=new Map<string,RemoteSettings>();campaigns=new Map<string,RemoteCampaignProgress>();downloads:string[]=[];writes=0;offline=false;
 beforeWrite?:()=>void|Promise<void>;afterWrite?:()=>void|Promise<void>;
 readonly origin='http://127.0.0.1:9999';
 fetch=async(input:string|URL|Request,init:RequestInit={}):Promise<Response>=>{
  if(this.offline)throw new TypeError('network unavailable');if(init.signal?.aborted)throw new DOMException('canceled','AbortError');const url=new URL(String(input)),method=init.method??'GET',path=url.pathname.replace('/api/v1',''),token=new Headers(init.headers).get('Authorization')?.replace('Bearer ','')??'';const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}}),fail=(code:string,status:number)=>json({code,message:code},status);
  if(path==='/profiles'&&method==='POST'){const n=this.profiles.size+1,profile:Profile={id:`profile-${n}`,name:JSON.parse(String(init.body)).name,created:1000,local:true},token=n.toString(16).padStart(64,'0');this.profiles.set(token,profile);return json({profile,token},201)}
  const profile=this.profiles.get(token);if(!profile)return fail('authentication_required',401);if(path==='/profiles/me')return json(profile);
  if(path==='/saves'&&method==='GET')return json([...this.saves.values()].filter(save=>save.owner===profile.id).map(({data,...summary})=>({...summary,bytes:data.length})));
  if(path==='/progress/campaign'){
   if(method==='GET')return json(this.campaigns.get(profile.id)??{revision:0,updated:0,data:{version:1,results:[],missions:{}}});const body=JSON.parse(String(init.body));await this.beforeWrite?.();const current=this.campaigns.get(profile.id);if(body.expected_revision!==(current?.revision??0))return fail('progress_conflict',409);const saved={revision:(current?.revision??0)+1,updated:2000+this.writes,data:body.data};this.campaigns.set(profile.id,saved);this.writes++;await this.afterWrite?.();return json(saved);
  }
  if(path==='/settings'){
   const current=this.preferences.get(profile.id)??{revision:0,data:{}};if(method==='GET')return json(current);const body=JSON.parse(String(init.body));await this.beforeWrite?.();if(body.expected_revision!==(this.preferences.get(profile.id)?.revision??0))return fail('settings_conflict',409);const saved={revision:current.revision+1,data:body.data};this.preferences.set(profile.id,saved);this.writes++;await this.afterWrite?.();return json(saved);
  }
  const match=path.match(/^\/saves\/([^/]+)(\/download)?$/);if(match){const id=decodeURIComponent(match[1]),key=`${profile.id}:${id}`,current=this.saves.get(key);if(method==='GET'&&match[2]){if(!current)return fail('save_missing',404);this.downloads.push(id);return new Response(current.data.slice().buffer,{headers:{'X-Save-Revision':String(current.revision)}})}
   if(method==='PUT'){const raw=String(init.body),body=JSON.parse(raw);await this.beforeWrite?.();const actual=this.saves.get(key);if((actual?.revision??0)!==body.expected_revision)return fail('save_conflict',409);const data=new TextEncoder().encode(raw.slice(raw.indexOf('"data":')+7,-1)),saved={id,owner:profile.id,name:body.name,revision:(actual?.revision??0)+1,updated:2000+this.writes,data};this.saves.set(key,saved);this.writes++;await this.afterWrite?.();const {data:ignored,...summary}=saved;return json(summary)}
  }
  return fail('missing',404);
 };
 async account(database:string){const vault=new LocalCredentialVault(database),account=new LocalProfileSession({baseURL:this.origin,credentials:vault,makeAPI:(base,token)=>new LocalAPI(base,token)});await account.create('Commander');return {account,vault}}
 seed(owner:string,id:string,save:SaveData,name='Host save',revision=1){this.saves.set(`${owner}:${id}`,{id,owner,name,revision,updated:1000,data:save.data.slice()})}
}
