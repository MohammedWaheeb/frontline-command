import test from 'node:test';
import assert from 'node:assert/strict';
import {FogField,FOG_EXPLORED,FOG_UNEXPLORED,FOG_TEXELS} from '../../src/render/fog-field';

const masks=(w:number,h:number,visible:(x:number,y:number)=>boolean,explored:(x:number,y:number)=>boolean=visible)=>{
 const v:boolean[]=[],e:boolean[]=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++){v.push(visible(x,y));e.push(visible(x,y)||explored(x,y))}return {v,e};
};
const lcg=(seed:number)=>()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;

test('fully visible ground is exactly clear and needs no fog geometry',()=>{
 const f=new FogField(12,10),{v,e}=masks(12,10,()=>true);
 assert.equal(f.update(v,e),true);
 assert(f.alpha.every(a=>a===0));assert(f.tileMax.every(a=>a===0));
 assert.equal(f.update(v,e),false,'no change, no upload');
});

test('a straight fog edge is feathered over about 1.5 tiles instead of a tile staircase',()=>{
 const w=16,h=8,f=new FogField(w,h),{v,e}=masks(w,h,x=>x<8,()=>true);f.update(v,e);
 const row=3*FOG_TEXELS,at=(tx:number)=>f.alpha[row*f.texWidth+tx];
 // Deep inside each side the target values hold exactly.
 assert.equal(at(4),0);assert.equal(at(28),FOG_EXPLORED);
 // Monotonic ramp across the boundary (texel 16 is the first explored texel).
 for(let x=10;x<22;x++)assert(at(x)<=at(x+1),`ramp not monotonic at ${x}`);
 const partial=[...Array(f.texWidth).keys()].filter(x=>at(x)>0&&at(x)<FOG_EXPLORED);
 assert(partial.length>=4&&partial.length<=7,`soft band ${partial.length} texels`);
 // Visible tiles one tile in from the edge stay mostly lit (gameplay stays readable).
 assert(f.sample(6500,3500)<FOG_EXPLORED*.12,'tile centre next to the edge');
 assert(f.sample(5500,3500)===0);
});

test('shroud is dark but not a void: mottled around the unexplored level, explored is lighter',()=>{
 const w=40,h=40,f=new FogField(w,h),{v,e}=masks(w,h,()=>false,x=>x<20);f.update(v,e);
 const unexplored:number[]=[];for(let y=8;y<70;y++)for(let x=50;x<72;x++)unexplored.push(f.alpha[y*f.texWidth+x]);
 const min=Math.min(...unexplored),max=Math.max(...unexplored);
 assert(min>=FOG_UNEXPLORED-16&&max<=FOG_UNEXPLORED+16,`${min}..${max}`);assert(max-min>=6,'cloud mottle present');
 assert(max<250,'never fully opaque: terrain silhouettes remain');
 assert.equal(f.alpha[20*f.texWidth+10],FOG_EXPLORED);
});

test('incremental updates match a fresh full computation and never mutate inputs',()=>{
 const w=24,h=20,rand=lcg(11),incremental=new FogField(w,h);
 let last={v:[] as boolean[],e:[] as boolean[]};
 for(let round=0;round<8;round++){
  const cx=rand()*w,cy=rand()*h,r=2+rand()*6;
  const explored=last.e.length?last.e:Array(w*h).fill(false);
  const {v,e}=masks(w,h,(x,y)=>Math.hypot(x-cx,y-cy)<r,(x,y)=>explored[y*w+x]);
  const frozen=JSON.stringify({v,e});incremental.update(v,e);assert.equal(JSON.stringify({v,e}),frozen);
  const fresh=new FogField(w,h);fresh.update(v,e);
  assert.deepEqual([...incremental.alpha],[...fresh.alpha],`round ${round} alpha`);
  assert.deepEqual([...incremental.tileMax],[...fresh.tileMax],`round ${round} tileMax`);
  last={v,e};
 }
});

test('dirty rectangle covers only the changed tiles plus the blur radius',()=>{
 const w=64,h=64,f=new FogField(w,h),all=masks(w,h,()=>false);f.update(all.v,all.e);
 const one=masks(w,h,(x,y)=>x===30&&y===31);assert.equal(f.update(one.v,one.e),true);
 const d=f.dirty!;assert(d.x1-d.x0<=FOG_TEXELS+6&&d.y1-d.y0<=FOG_TEXELS+6,JSON.stringify(d));
 assert(d.x0<=60&&d.x1>=61&&d.y0<=62&&d.y1>=63);
});

test('tileMax is zero only where every sample a tile can take is clear',()=>{
 const w=12,h=12,f=new FogField(w,h),{v,e}=masks(w,h,(x,y)=>x>=2&&x<=9&&y>=2&&y<=9);f.update(v,e);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let max=0;for(let ty=y*2-1;ty<=y*2+2;ty++)for(let tx=x*2-1;tx<=x*2+2;tx++)if(tx>=0&&ty>=0&&tx<f.texWidth&&ty<f.texHeight)max=Math.max(max,f.alpha[ty*f.texWidth+tx]);
  assert.equal(f.tileMax[y*w+x],max);
 }
 assert.equal(f.tileMax[6*w+6],0);assert(f.tileMax[2*w+2]>0,'edge tile still carries feathered fog');
});
