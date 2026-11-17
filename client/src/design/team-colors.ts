import {tokens} from './tokens';

export type TeamPaletteScheme='standard'|'cvd_safe';
export type PublicColorFaction='US'|'IR'|'SY'|'SA';
export interface PublicColorOwner {readonly id:number;readonly faction?:string;readonly color?:number}
export interface OwnerTeamColor {readonly css:string;readonly tint:number;readonly slot:number|null;readonly faction:PublicColorFaction|undefined}

// Chosen public slots stay 1..8. The team-mask colour is the chosen slot's hue
// (tokens.color.team.standard / cvd_safe), distinct across all eight slots, so
// two players of one faction can never share a near-identical shade. Faction
// identity stays in each sprite's painted beauty layer.
//
// Former faction shade rows, kept for reference (UI swatches may still want a
// faction-flavoured accent); they are no longer used for owner identity.
export const FACTION_SHADE_ROWS={
 US:['#60849E','#A9CAD8','#3F617C','#8194A4','#397C96','#C8DFE4','#586A78','#82B4B8'],
 IR:['#4D805E','#87B66D','#3A6B45','#7B8650','#3D8A80','#B0D0A1','#535F3D','#76A794'],
 SY:['#AF624B','#D88964','#984739','#9C7959','#733D45','#E3B093','#81534C','#BC8640'],
 SA:['#BAA166','#D1BC75','#896F39','#C7A24F','#9C861D','#E6D5A6','#998C62','#BCB29B'],
} as const;

function publicFaction(value:string|undefined):PublicColorFaction|undefined{
 return value==='US'||value==='IR'||value==='SY'||value==='SA'?value:undefined;
}
function color(css:string,slot:number|null,faction:PublicColorFaction|undefined):OwnerTeamColor{
 return {css,tint:Number.parseInt(css.slice(1),16),slot,faction};
}

/** One viewer-independent CSS/Pixi result from disclosed public owner fields.
 * Neutral or invalid/missing public colour never invents a slot from owner ID.
 * Presence/visibility and public ally/enemy/team labels remain the caller's job. */
export function ownerTeamColor(owner:number,players:readonly PublicColorOwner[],scheme:TeamPaletteScheme):OwnerTeamColor{
 const neutral=tokens.color.team.relation.neutral;
 if(owner===0)return color(neutral,null,undefined);
 const player=players.find(player=>player.id===owner),slot=player?.color;
 if(typeof slot!=='number'||!Number.isInteger(slot)||slot<1||slot>8)return color(neutral,null,undefined);
 const faction=publicFaction(player?.faction),palette=scheme==='cvd_safe'?tokens.color.team.cvd_safe:tokens.color.team.standard;
 const css=palette[slot-1]??neutral;
 return color(css,slot,faction);
}
