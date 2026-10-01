import {ownerTeamColor,type PublicColorOwner,type TeamPaletteScheme} from '../design/team-colors';
import {selectionPortraitIdentity} from './selection-portrait-identity';

export type PublicTeamOwner=PublicColorOwner&{name?:string;team?:number};
export type PublicTeamRelation='self'|'ally'|'enemy'|'neutral'|'unknown';
type PortraitEntity=Parameters<typeof selectionPortraitIdentity>[0];

/** Ownership relation is public team identity, independent of faction or paint. */
export function publicTeamRelation(owner:number,players:readonly PublicTeamOwner[],viewer:number|undefined):PublicTeamRelation{
 if(owner===0)return 'neutral';
 const target=players.find(player=>player.id===owner),self=players.find(player=>player.id===viewer);
 if(!target||!self)return 'unknown';
 if(owner===viewer)return 'self';
 const targetTeam=target.team,selfTeam=self.team;
 if(typeof targetTeam!=='number'||typeof selfTeam!=='number'||!Number.isSafeInteger(targetTeam)||!Number.isSafeInteger(selfTeam)||targetTeam<=0||selfTeam<=0)return 'unknown';
 return targetTeam===selfTeam?'ally':'enemy';
}

/** Retain the separately reviewed physical/current-owner identity. Only the
 * team-mask colour comes from the one shared faction/slot palette helper. */
export function selectionPortraitColor(entity:PortraitEntity,players:readonly PublicTeamOwner[],scheme:TeamPaletteScheme){
 const identity=selectionPortraitIdentity(entity,players,[]);
 return {...identity,color:ownerTeamColor(entity.owner,players,scheme).css};
}

/** Preview the exact public faction/slot/team recipe used by solo Skirmish.
 * These rows describe the setup; they never create actors or runtime state. */
export function skirmishPreviewPlayers(faction:string,count:number,teams:boolean,factionOrder:readonly string[],difficulty:string):PublicTeamOwner[]{
 return [{id:1,name:'Commander',faction,team:1,color:1},...Array.from({length:count},(_,index)=>{
  const opponentFaction=factionOrder[(factionOrder.indexOf(faction)+index+1)%4];
  return {id:index+2,name:`${difficulty} ${opponentFaction}`,faction:opponentFaction,
   team:teams&&count===3?(index===0?1:2):index+2,color:index+2};
 })];
}

/** Text exposes identity and relation without making colour carry that meaning. */
export function teamColorLabel(owner:number,players:readonly PublicTeamOwner[],viewer:number|undefined,scheme:TeamPaletteScheme){
 const player=players.find(row=>row.id===owner),paint=ownerTeamColor(owner,players,scheme),relation=publicTeamRelation(owner,players,viewer);
 const name=player?.name?.trim()||(owner===0?'Neutral':'Unknown commander');
 const faction=player?.faction||'Faction unassigned';
 const teamValue=player?.team,team=typeof teamValue==='number'&&Number.isSafeInteger(teamValue)&&teamValue>0?`Team ${teamValue}`:'Team unassigned';
 const slot=paint.slot===null?'Color unassigned':`Color slot ${paint.slot}`;
 const relationLabel={self:'Your command',ally:'Allied command',enemy:'Opposing command',neutral:'Neutral',unknown:'Unknown relation'}[relation];
 return {paint,relation,label:`${name} · ${faction} · ${team} · ${slot} · ${relationLabel}`};
}
