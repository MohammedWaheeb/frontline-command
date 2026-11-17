import type {Page} from './application';

/** Curated battlefields for the local release. Co-op keeps its scenario layouts.
 * Relay Heights, Dry River and Border Depots were promoted on 2026-10-20 (C-4). */
export const DEFAULT_BATTLEFIELD_IDS = ['copper-junction', 'industrial-valley', 'port-outskirts', 'relay-heights', 'dry-river', 'border-depots'] as const;
export function isDefaultBattlefield(id:string):boolean {
 return (DEFAULT_BATTLEFIELD_IDS as readonly string[]).includes(id);
}
export function defaultBattlefields<T extends {id:string}>(maps:readonly T[]):T[] {
 return DEFAULT_BATTLEFIELD_IDS.flatMap(id=>{const map=maps.find(value=>value.id===id);return map?[map]:[]});
}
/** No page is hidden since the 2026-10-20 scope update: campaign, mastery and
 * the map editor are reachable again. Kept as the single routing seam. */
export function releasePage(page:Page):Page {
 return page;
}
