import type {CatalogIndex} from '../content/catalog';
import type {PlayerSnapshot} from '../runtime';

export type CombatArmor='infantry'|'light'|'heavy'|'structure'|'air';
export interface CombatFacts {
 metadata:'absent'|'invalid'|'known';weapon?:string;weaponKind?:string;
 hit:boolean;targetArmor?:CombatArmor;coverMitigated:boolean;target?:number;
}
type CombatEvent=PlayerSnapshot['events'][number];
const ARMOR=new Set<string>(['infantry','light','heavy','structure','air']);
const special=(id:string)=>id==='SATURATION'||id==='SKYBREAKER';

/** Shared visual/audio facts from the current authorized wire only. In particular,
 * absence is not a miss, false is not a no-cover verdict, and an actor's current
 * equipment never substitutes for the weapon captured when its round was fired. */
export function combatFacts(event:CombatEvent,snapshot:PlayerSnapshot,catalog:CatalogIndex):CombatFacts {
 const raw=(event as CombatEvent&{combat?:unknown}).combat;
 const out:CombatFacts={metadata:raw===undefined||raw===null?'absent':'invalid',hit:false,coverMitigated:false};
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!['weapon_fired','impact'].includes(event.kind))return out;
 const c=raw as Record<string,unknown>;
 if(typeof c.weapon!=='string')return out;
 const weapon=catalog.weapons.get(c.weapon);if(!weapon&&!special(c.weapon))return out;
 out.metadata='known';out.weapon=c.weapon;out.weaponKind=special(c.weapon)?'strategic':weapon?.kind;
 if(event.kind!=='impact'||c.outcome!=='hit'||typeof c.targetArmor!=='string'||!ARMOR.has(c.targetArmor)||!Number.isInteger(event.entity)||event.entity<=0)return out;
 // Go never publishes victims of area impacts. Do not manufacture this identity
 // from a malformed extension or a catalog lookup of a previously seen target.
 if(special(c.weapon)||weapon?.kind==='tactical'||typeof weapon?.splash==='number'&&weapon.splash>0)return out;
 const target=snapshot.entities.find(entity=>entity.id===event.entity);
 if(!target||target.state==='destroyed'||target.health<=0||target.private?.container)return out;
 out.hit=true;out.target=target.id;out.targetArmor=c.targetArmor as CombatArmor;
 out.coverMitigated=c.coverMitigated===true&&c.targetArmor==='infantry'&&['small','auto'].includes(weapon?.kind??'');
 return out;
}
