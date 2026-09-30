/** Small pixel symbols retain public relationship without depending on hue.
 * Ownership/faction paint remains the separate ownerTeamColor contract. */
export type MinimapOwnerRelation='self'|'ally'|'enemy'|'neutral'|'unknown';
export interface MinimapPublicOwner {readonly id:number;readonly team?:number}

/** Build once per minimap draw from public id/team fields. Same faction is never
 * an alliance; missing perspectives or invalid teams remain explicitly unknown. */
export function minimapOwnerRelations(players:readonly MinimapPublicOwner[],viewer:number|undefined):ReadonlyMap<number,MinimapOwnerRelation>{
 const relations=new Map<number,MinimapOwnerRelation>([[0,'neutral']]);
 const self=players.find(player=>player.id===viewer),selfTeam=self?.team;
 for(const player of players){
  if(player.id===0)continue;
  if(!self){relations.set(player.id,'unknown');continue}
  if(player.id===viewer){relations.set(player.id,'self');continue}
  const team=player.team;
  relations.set(player.id,typeof team==='number'&&typeof selfTeam==='number'&&Number.isSafeInteger(team)&&Number.isSafeInteger(selfTeam)&&team>0&&selfTeam>0?(team===selfTeam?'ally':'enemy'):'unknown');
 }
 return relations;
}

type PixelRect=readonly [x:number,y:number,width:number,height:number];
const SYMBOLS:Readonly<Record<3|4,Readonly<Record<MinimapOwnerRelation,readonly PixelRect[]>>>>={
 3:{
  self:[[0,0,3,3]],
  ally:[[1,0,1,3],[0,1,3,1]],
  enemy:[[0,0,1,1],[2,0,1,1],[1,1,1,1],[0,2,1,1],[2,2,1,1]],
  neutral:[[0,0,3,1],[0,2,3,1],[0,1,1,1],[2,1,1,1]],
  unknown:[[1,0,1,1],[0,1,3,2]],
 },
 4:{
  self:[[0,0,4,4]],
  ally:[[1,0,2,4],[0,1,4,2]],
  enemy:[[0,0,1,1],[3,0,1,1],[1,1,2,2],[0,3,1,1],[3,3,1,1]],
  neutral:[[0,0,4,1],[0,3,4,1],[0,1,1,2],[3,1,1,2]],
  unknown:[[1,0,2,2],[0,2,4,2]],
 },
};

/** Use whole CSS pixels even at device ratio1: three for a unit and four for a
 * building. At most five fillRect calls; no paths, decoding or per-actor arrays.
 * The caller supplies existing owner paint and clips the minimap as before. */
export function drawMinimapOwnerSymbol(ctx:Pick<CanvasRenderingContext2D,'fillRect'>,point:Readonly<{x:number;y:number}>,size:3|4,relation:MinimapOwnerRelation):void{
 const left=Math.round(point.x-size/2),top=Math.round(point.y-size/2);
 for(const [x,y,width,height] of SYMBOLS[size][relation])ctx.fillRect(left+x,top+y,width,height);
}
