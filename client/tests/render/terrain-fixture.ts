import {TerrainBaker,CHUNK} from '../../src/render/terrain';
import {ArtLibrary} from '../../src/render/art';
import {HALF_W,HALF_H} from '../../src/render/iso';
import type {GameMap} from '../../src/runtime';
import {Application,Container,Rectangle} from 'pixi.js';
const art=new ArtLibrary();await art.init();
const app=new Application();await app.init({canvas:document.getElementById('terrain') as HTMLCanvasElement,width:1600,height:900,background:'#14130f',preference:'webgl',antialias:true});app.stop();
const world=new Container();app.stage.addChild(world);
function dispose(){for(const mesh of world.removeChildren() as ReturnType<TerrainBaker['mesh']>[]){mesh.geometry.destroy();mesh.destroy({texture:true,textureSource:true})}}
async function show(id:string,terrain:string){
 dispose();
 const map=await (await fetch(`/maps/${id}.json`)).json() as GameMap;
 const tiles=map.tiles.flatMap((t,i)=>t.terrain===terrain?[i]:[]);if(!tiles.length)throw Error(`No ${terrain} in ${id}`);
 // Choose the nearest example to the public map centre, never a private state.
 const index=tiles.sort((a,b)=>Math.hypot(a%map.width-map.width/2,Math.floor(a/map.width)-map.height/2)-Math.hypot(b%map.width-map.width/2,Math.floor(b/map.width)-map.height/2))[0];
 const x=index%map.width,y=Math.floor(index/map.width),baker=new TerrainBaker(map,art);await baker.load();
 const chunks=[];for(let cy=Math.max(0,Math.floor(y/CHUNK)-2);cy<Math.min(baker.chunksY,Math.floor(y/CHUNK)+3);cy++)for(let cx=Math.max(0,Math.floor(x/CHUNK)-2);cx<Math.min(baker.chunksX,Math.floor(x/CHUNK)+3);cx++){
  const texture=baker.bake(cx,cy);chunks.push(baker.mesh(cx,cy,texture));
 }
 const draw=(reverse:boolean,zoom:number)=>{world.removeChildren();world.addChild(...(reverse?[...chunks].reverse():chunks));world.scale.set(zoom);world.position.set(800-(x-y)*HALF_W*zoom,450-(x+y)*HALF_H*zoom);app.render();return app.renderer.extract.pixels({target:app.stage,frame:new Rectangle(0,0,1600,900)}).pixels};
 const drawOrder=[];for(const zoom of [.45,1,1.8]){const normal=draw(false,zoom),reverse=draw(true,zoom);let changed=0,maxDelta=0;for(let i=0;i<normal.length;i++){const delta=Math.abs(normal[i]-reverse[i]);if(delta>1)changed++;maxDelta=Math.max(maxDelta,delta)}drawOrder.push({zoom,changedChannelsOverOne:changed,maxDelta})}
 draw(false,1);
 return {id,terrain,focus:{x,y},chunkCount:chunks.length,drawOrder};
}
Object.assign(window,{qa:{show,dispose}});document.body.dataset.ready='true';
