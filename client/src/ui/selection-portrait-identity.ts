import {physicalArtType} from '../render/art-id';

type SelectedPhysicalIdentity=Parameters<typeof physicalArtType>[0]&{owner:number};
type PublicArtOwner={id:number;faction?:string;color?:number};

/** Match the world body using only its disclosed foundation and current owner.
 * Operating-role labels and commands continue to use the entity's Go type. */
export function selectionPortraitIdentity(entity:SelectedPhysicalIdentity,players:readonly PublicArtOwner[],palette:readonly string[]){
 const owner=players.find(player=>player.id===entity.owner);
 return {type:physicalArtType(entity),faction:owner?.faction,color:palette[Math.max(0,(owner?.color??entity.owner)-1)%palette.length]??'#b9b4a6'};
}
