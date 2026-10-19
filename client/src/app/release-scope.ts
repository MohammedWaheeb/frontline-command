import type {Page} from './application';

/** Curated battlefields for the local release. Co-op keeps its scenario layouts. */
export const DEFAULT_BATTLEFIELD_IDS = ['copper-junction', 'industrial-valley', 'port-outskirts'] as const;
export function isDefaultBattlefield(id:string):boolean {
 return (DEFAULT_BATTLEFIELD_IDS as readonly string[]).includes(id);
}
export function defaultBattlefields<T extends {id:string}>(maps:readonly T[]):T[] {
 return DEFAULT_BATTLEFIELD_IDS.flatMap(id=>{const map=maps.find(value=>value.id===id);return map?[map]:[]});
}
/** Retain old content and archives while hiding deferred authoring/story screens. */
export function releasePage(page:Page):Page {
 return page==='campaign'||page==='editor'||page==='mastery'?'command':page;
}
