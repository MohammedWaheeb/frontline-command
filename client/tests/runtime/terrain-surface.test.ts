import test from 'node:test';
import assert from 'node:assert/strict';
import {TerrainSurface,projectSurfaceVertex,surfaceFogOpacity,type SurfaceTriangle} from '../../src/render/terrain-surface';
import {toScreen} from '../../src/render/iso';
const map=(width=8,height=8)=>({width,height,tiles:Array.from({length:width*height},()=>({terrain:'open',height:0}))});
const near=(actual:number,expected:number,message='')=>assert(Math.abs(actual-expected)<1e-5,`${message}: ${actual} != ${expected}`);
const vertex=(surface:TerrainSurface,tile:number,x:number,y:number)=>surface.topTriangles(tile).flatMap(t=>t.vertices).find(v=>v.x===x&&v.y===y)!;

test('flat surface preserves the original isometric projection and exact roundtrips, including partial chunks',()=>{
 const m=map(19,17),before=structuredClone(m),surface=new TerrainSurface(m);
 for(let y=75;y<m.height*1000;y+=537)for(let x=125;x<m.width*1000;x+=643){
  const p={x,y},screen=surface.projectGround(p),hit=surface.pickSurface(screen)!;
  assert.deepEqual(screen,toScreen(x,y));near(hit.point.x,x);near(hit.point.y,y);near(hit.point.height,0);
 }
 assert.deepEqual(m,before);assert.deepEqual(surface.projectedBounds(),{left:-17*32,top:0,right:19*32,bottom:(19+17)*16});
 assert.equal([...surface.triangles()].filter(t=>t.kind==='face').length,0);
 assert.equal(surface.pickSurface({x:20000,y:-20000}),undefined);
});

test('all passable road/open/ramp height joins share exact geometry and are traversable in all four directions',()=>{
 for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const m=map();for(let y=0;y<8;y++)for(let x=0;x<8;x++){const ahead=dx?x*dx:y*dy;const limit=dx<0||dy<0?-3:4;m.tiles[y*8+x]={terrain:x%2?'road':'open',height:ahead>=limit?2:0}}
  const surface=new TerrainSurface(m);assert.equal([...surface.triangles()].filter(t=>t.kind==='face'&&t.neighbor!==undefined).length,0);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
   const tile=y*8+x;
   if(x<7)for(const yy of [y*1000,(y+1)*1000])near(vertex(surface,tile,(x+1)*1000,yy).height,vertex(surface,tile+1,(x+1)*1000,yy).height);
   if(y<7)for(const xx of [x*1000,(x+1)*1000])near(vertex(surface,tile,xx,(y+1)*1000).height,vertex(surface,tile+8,xx,(y+1)*1000).height);
  }
  // A moving center never jumps at the shared border, even when no tile says ramp.
  for(let k=0;k<8;k++){const a=dx?{x:4000-.001,y:k*1000+500}:{x:k*1000+500,y:4000-.001},b=dx?{...a,x:4000+.001}:{...a,y:4000+.001};assert(Math.abs(surface.sampleGround(a)-surface.sampleGround(b))<.00001)}
  near(surface.sampleGround({x:500,y:500}),m.tiles[0].height);
 }
});

test('disconnected diagonal walkable sectors do not average across impassable tiles',()=>{
 const m=map(2,2);m.tiles=[{terrain:'open',height:4},{terrain:'cliff',height:2},{terrain:'blocked',height:1},{terrain:'road',height:0}];
 const surface=new TerrainSurface(m);
 near(vertex(surface,0,1000,1000).height,4);near(vertex(surface,3,1000,1000).height,0);
 near(vertex(surface,1,1000,1000).height,2);near(vertex(surface,2,1000,1000).height,1);
 const faces=[...surface.triangles()].filter(t=>t.kind==='face');assert(faces.length>0);assert.equal(new Set(faces.map(t=>t.id)).size,faces.length);
 assert(faces.every(t=>t.blockedTile!==undefined));
});

test('raised plateau centers and conservative map bounds include the full four-level lift',()=>{
 const m=map(4,4);m.tiles.forEach(t=>t.height=4);const surface=new TerrainSurface(m);
 assert.deepEqual(surface.projectGround({x:500,y:500}),{x:0,y:16-40});
 assert.deepEqual(surface.projectedBounds(),{left:-128,top:-40,right:128,bottom:128});
 for(const p of [{x:100,y:100},{x:1700,y:1200},{x:3200,y:3500}]){const hit=surface.pickSurface(surface.projectGround(p))!;near(hit.point.x,p.x);near(hit.point.y,p.y);near(hit.point.height,4)}
 const zero=map(2,2);zero.tiles[0].terrain='cliff';assert.equal([...new TerrainSurface(zero).triangles()].filter(t=>t.kind==='face').length,0);
});

test('face picking selects the actual near cliff surface and returns its blocked owner rather than lower ground',()=>{
 const m=map(4,4);m.tiles[1*4+1]={terrain:'cliff',height:4};const surface=new TerrainSurface(m);
 const face=surface.edgeFaces(5).find(t=>t.frontFacing&&t.neighbor===6)!;assert(face);
 const p=projectSurfaceVertex({x:2000,y:1600,height:2});const hit=surface.pickSurface(p)!;
 assert.equal(hit.triangle.kind,'face');assert.equal(hit.triangle.blockedTile,5);near(hit.point.x,2000);near(hit.point.y,1600);near(hit.point.height,2);assert.deepEqual(hit.commandPoint,{x:1500,y:1500});
 // Highest ray intersection wins if lower terrain has the same screen coordinate.
 const top=surface.pickSurface(surface.projectGround({x:1500,y:1500}))!;assert.equal(top.triangle.tile,5);near(top.point.height,4);
});

test('arbitrary valid height maps have exact projected intersections and no duplicate edge ownership',()=>{
 const m=map(19,17);for(let i=0;i<m.tiles.length;i++)m.tiles[i]={terrain:i%11===0?'cliff':i%7===0?'ramp':'road',height:(i*13+Math.floor(i/19)*7)%5};
 const surface=new TerrainSurface(m),all=[...surface.triangles()];assert.equal(new Set(all.map(t=>t.id)).size,all.length);
 for(let i=0;i<all.length;i+=17){const triangle=all[i];if(!triangle.frontFacing)continue;const v=triangle.vertices,p={x:v[0].x*.2+v[1].x*.3+v[2].x*.5,y:v[0].y*.2+v[1].y*.3+v[2].y*.5,height:v[0].height*.2+v[1].height*.3+v[2].height*.5};
  if(triangle.kind==='top')near(surface.sampleGround(p),p.height,'Actor anchor agrees with mesh triangle');
  const screen=projectSurfaceVertex(p),hit=surface.pickSurface(screen)!;assert(hit);const round=projectSurfaceVertex(hit.point);near(round.x,screen.x);near(round.y,screen.y);assert(hit.point.x+hit.point.y>=p.x+p.y-1e-5);
 }
});

test('fog geometry always uses conservative owner disclosure and does not mutate visible arrays',()=>{
 const m=map(2,2);m.tiles[0]={terrain:'cliff',height:2};const surface=new TerrainSurface(m),top=surface.topTriangles(0)[0],face=surface.edgeFaces(0).find(t=>t.neighbor===1)!;
 const visible=[true,false,false,false],explored=[true,true,false,false],before=structuredClone({visible,explored});
 assert.equal(surfaceFogOpacity(top,visible,explored),0);assert.equal(surfaceFogOpacity(face,visible,explored),175);
 explored[1]=false;assert.equal(surfaceFogOpacity(face,visible,explored),255);explored[1]=true;
 assert.deepEqual({visible,explored},before);assert.equal(surfaceFogOpacity(top,[],[]),255);
});

test('mixed-height structure support has an exact clipped perimeter and never mutates terrain or invents placement validity',()=>{
 const m=map(4,4);for(let y=0;y<4;y++)for(let x=0;x<4;x++)m.tiles[y*4+x].height=x<2?2:3;
 const surface=new TerrainSurface(m),before=structuredClone(m),foot=surface.footprintSurface({x:2000,y:1500},2,1);
 near(foot.height,3);assert(foot.boundary.length>=6);assert(foot.boundary.every(p=>p.x===1000||p.x===3000||p.y===1000||p.y===2000));assert(foot.boundary.some(p=>p.height===2));assert(foot.top.every(p=>p.height===3));assert.deepEqual(m,before);
 const small=surface.footprintSurface({x:1700,y:1500},.1,.1);assert(small.height>2&&small.height<2.5,'Clipping cannot include higher vertices outside the footprint');
});

test('surface is an immutable public-map snapshot and rejects unsupported heights',()=>{
 const m=map(),surface=new TerrainSurface(m);m.tiles[0].height=4;near(surface.sampleGround({x:500,y:500}),0);near(new TerrainSurface(m).sampleGround({x:500,y:500}),4);
 m.tiles[0].height=5;assert.throws(()=>new TerrainSurface(m),/height/);assert.throws(()=>new TerrainSurface({...m,width:0}),/dimensions/);
});
