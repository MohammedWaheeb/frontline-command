/** Physical export pixels per world pixel. Tier names remain stable for
 * existing packs; source geometry and hardpoints always use logical 2x units. */
export function atlasResolution(meta:{atlas_resolution?:Partial<Record<'1x'|'2x',number>>},tier:'1x'|'2x'):number{
 const value=meta.atlas_resolution?.[tier];
 if(value===undefined)return tier==='2x'?2:1;
 if(!Number.isFinite(value)||value<1||value>2)throw Error('Invalid sprite atlas resolution');
 return value;
}
