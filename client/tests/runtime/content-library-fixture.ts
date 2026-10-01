import {sha256Hex} from '../../src/runtime/crypto';
import {ContentLibrary,type ContentIndex,type LibraryValidator} from '../../src/runtime/content-library';
import type {GameMap} from '../../src/runtime/types';
export const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
/** Synthetic metadata/transport fixture. Real terrain validation belongs to Go and is exercised separately. */
export async function contentFixture(){
 const map:GameMap={id:'layout',version:'1',title:'Library fixture',author:'test',format_version:1,ruleset:'standard-v2',width:1,height:1,tiles:[{terrain:'open'}],spawns:[{position:{x:0,y:0}},{position:{x:1000,y:0}}],shipment:{x:0,y:0},fields:[],required_packs:['base']};
 const definition={id:'us-one',version:'1',title:'First Foothold',map_id:map.id,mode:'campaign',faction:'US',difficulty:[{id:'easy'},{id:'normal'},{id:'hard'}]};
 const mapSource=encode(map),missionSource=encode(definition);
 const index:ContentIndex={format_version:1,version:'2.0.0',packs:[{id:'base',version:'2.0.0',manifest_url:'/assets/packs/base.json'}],maps:[{id:map.id,title:map.title,author:map.author,version:map.version,url:'/content/maps/layout.json',sha256:await sha256Hex(mapSource),bytes:mapSource.length,players:2,kind:'scenario',required_packs:['base']}],missions:[{id:definition.id,title:definition.title,version:definition.version,url:'/content/missions/us-one.json',sha256:await sha256Hex(missionSource),bytes:missionSource.length,map_id:'layout',mode:'campaign',faction:'US',order:1,required_packs:['base']}]};
 const files=new Map<string,Uint8Array>([['/content/index.json',encode(index)],['/content/maps/layout.json',mapSource],['/content/missions/us-one.json',missionSource]]),calls:Array<{kind:string;data:Uint8Array[]}>=[];
 const validator:LibraryValidator={content:async()=>({units:{example:{cost:1000}}}),validateMap:async(data)=>{calls.push({kind:'map',data:[data.slice()]});return JSON.parse(new TextDecoder().decode(data))},validateMission:async(map,mission)=>{calls.push({kind:'mission',data:[map.slice(),mission.slice()]});return JSON.parse(new TextDecoder().decode(mission))}};
 const fetcher:typeof fetch=async(input)=>{const path=new URL(String(input)).pathname,data=files.get(path);return data?new Response(data.slice(),{status:200}):new Response('',{status:404})};
 const library=new ContentLibrary({baseURL:'http://127.0.0.1:8080',validator,fetch:fetcher});library.useIndex(encode(index));
 return {map,definition,mapSource,missionSource,index,files,calls,validator,fetcher,library};
}
