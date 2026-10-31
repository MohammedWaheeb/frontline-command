/** Reconcile a stored map choice against the loaded content index: keep a
 * still-valid choice, otherwise fall back to the first available map. */
export function reconciledMapID(maps:readonly {id:string}[],selected:string):string{
 return maps.some(map=>map.id===selected)?selected:maps[0]?.id??'';
}
