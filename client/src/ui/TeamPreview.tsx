import type {TeamPaletteScheme} from '../design/team-colors';
import {teamColorLabel,type PublicTeamOwner} from './team-color-presentation';
import './team-preview.css';

/** A text-labelled swatch; owner/faction/team/slot remain readable without hue. */
export function TeamSlotPreview({owner,players,viewer,palette}:{owner:number;players:readonly PublicTeamOwner[];viewer?:number;palette:TeamPaletteScheme}){
 const {paint,relation,label}=teamColorLabel(owner,players,viewer,palette);
 return <span className="team-slot-preview" data-relation={relation}><i className="team-color-swatch" aria-hidden="true" style={{backgroundColor:paint.css}}/><span>{label}</span></span>;
}

export function TeamPreview({players,viewer,palette}:{players:readonly PublicTeamOwner[];viewer?:number;palette:TeamPaletteScheme}){
 return <section className="team-preview" aria-label="Commander color preview"><h4>Commander colors</h4><ul>{players.map(player=><li key={player.id}><TeamSlotPreview owner={player.id} players={players} viewer={viewer} palette={palette}/></li>)}</ul></section>;
}
