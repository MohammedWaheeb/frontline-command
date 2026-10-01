/** Pure inverses for already-disclosed row-major masks; no protocol or renderer imports. */
export const MAX_FOG_TILES=65536;
export type FogCodecErrorCode='cardinality';
export class FogCodecError extends Error{
 constructor(readonly code:FogCodecErrorCode){super(`Invalid fog mask ${code}`);this.name='FogCodecError'}
}
function byteCount(tiles:number):number{
 if(!Number.isInteger(tiles)||tiles<1||tiles>MAX_FOG_TILES)throw new FogCodecError('cardinality');
 return Math.ceil(tiles/8);
}
/** Tile i occupies bit i%8 in byte i/8. Padding is zero. */
export function packFogMask(mask:readonly boolean[],tiles:number):Uint8Array{
 const n=byteCount(tiles);
 if(mask.length!==tiles)throw new FogCodecError('cardinality');
 const out=new Uint8Array(n);
 for(let i=0;i<tiles;i++){
  if(typeof mask[i]!=='boolean')throw new FogCodecError('cardinality');
  if(mask[i])out[i>>>3]|=1<<(i&7);
 }
 return out;
}
/** Copy exact-cardinality bytes and clear only unused high tail bits. */
export function normalizeFogMask(packed:Uint8Array,tiles:number):Uint8Array{
 const n=byteCount(tiles);
 if(!(packed instanceof Uint8Array)||packed.length!==n)throw new FogCodecError('cardinality');
 const out=new Uint8Array(packed);
 if(tiles%8)out[n-1]&=(1<<(tiles%8))-1;
 return out;
}
/** Exactly tiles booleans; never infer visibility or union with exploration. */
export function unpackFogMask(packed:Uint8Array,tiles:number):boolean[]{
 const canonical=normalizeFogMask(packed,tiles),out=new Array<boolean>(tiles);
 for(let i=0;i<tiles;i++)out[i]=(canonical[i>>>3]&(1<<(i&7)))!==0;
 return out;
}

/** Structural wire boundary; generated protocol objects satisfy this interface. */
export interface FogMaskSnapshot{
 explored:boolean[];visible:boolean[];exploredBits:Uint8Array;visibleBits:Uint8Array;fogTiles:number;
}
/** Restore exact public planes before validation/presentation. Never mutate received
 * protocol objects, infer exploration, union prior vision, or retain compact bytes.
 * Legacy frames have fogTiles=0 and empty bitsets. Mixed encodings are rejected. */
export function decodeSnapshotFog<T extends FogMaskSnapshot>(snapshot:T):T{
 if(snapshot.fogTiles===0){
  if(snapshot.exploredBits.length||snapshot.visibleBits.length)throw new FogCodecError('cardinality');
  return {...snapshot};
 }
 if(snapshot.explored.length||snapshot.visible.length)throw new FogCodecError('cardinality');
 const explored=unpackFogMask(snapshot.exploredBits,snapshot.fogTiles);
 // Wire encoders must be canonical: nonzero padding is malformed, even though
 // the standalone normalization utility can safely discard it.
 if(snapshot.fogTiles%8){
  const forbidden=255^((1<<(snapshot.fogTiles%8))-1);
  if((snapshot.exploredBits.at(-1)!&forbidden)||(snapshot.visibleBits.at(-1)!&forbidden))throw new FogCodecError('cardinality');
 }
 const visible=unpackFogMask(snapshot.visibleBits,snapshot.fogTiles);
 return {...snapshot,explored,visible,fogTiles:0,exploredBits:new Uint8Array(0),visibleBits:new Uint8Array(0)};
}
