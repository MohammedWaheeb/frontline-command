import type {Lobby,LobbyRules} from '../runtime/api';
import type {OfflineConfig} from '../runtime/types';

/** Public setup/adapter amounts are WHOLE credits. Go alone converts to milliunits. */
export const STANDARD_STARTING_CREDITS=6000;
export const MIN_STARTING_CREDITS=1;
export const MAX_STARTING_CREDITS=1000000;
export const STARTING_CREDIT_PRESETS=[6000,10000,25000,50000] as const;
export type StartingCreditsResult={valid:true;credits:number}|{valid:false;message:string};
const amountMessage='Enter a whole number from 1 to 1,000,000 credits.';

export function parseStartingCredits(raw:string):StartingCreditsResult {
 const text=raw.trim();
 if(!/^[0-9]+$/.test(text))return {valid:false,message:amountMessage};
 const credits=Number(text);
 if(!Number.isSafeInteger(credits)||credits<MIN_STARTING_CREDITS||credits>MAX_STARTING_CREDITS)return {valid:false,message:amountMessage};
 return {valid:true,credits};
}
export function requireStartingCredits(credits:number):number {
 if(!Number.isSafeInteger(credits)||credits<MIN_STARTING_CREDITS||credits>MAX_STARTING_CREDITS)throw new Error(amountMessage);
 return credits;
}
export function formatStartingCredits(credits:number):string{return credits.toLocaleString('en-US')}

/** Only ordinary local Skirmish uses this; prescribed modes omit the field. */
export function skirmishStartingMoney(credits:number):Pick<OfflineConfig,'ruleset'|'starting_credits'> {
 credits=requireStartingCredits(credits);
 return credits===STANDARD_STARTING_CREDITS?{ruleset:'standard-v2'}:{ruleset:'custom-v1',starting_credits:credits};
}
/** PATCH sends the complete fixed-rule object in public WHOLE-credit units. */
export function startingMoneyRules(credits:number):LobbyRules {
 credits=requireStartingCredits(credits);
 return {ruleset:credits===STANDARD_STARTING_CREDITS?'standard-v2':'custom-v1',speed:1,starting_credits:credits,supply_cap:100,fog:true,strategic_operations:true};
}
export function hasPrescribedStartingMoney(lobby:Lobby):boolean {
 return !!lobby.scenario_id||!!lobby.scenario_rules||lobby.resume_tick!==undefined;
}
/** Missing legacy Rules may display standard funds; they never unlock an editor. */
export function confirmedLobbyStartingCredits(lobby:Lobby):number|undefined {
 if(!lobby.rules)return STANDARD_STARTING_CREDITS;
 const credits=lobby.rules.starting_credits;
 return Number.isSafeInteger(credits)&&credits>=MIN_STARTING_CREDITS&&credits<=MAX_STARTING_CREDITS?credits:undefined;
}
function canonicalLobbyRules(lobby:Lobby):boolean {
 const rules=lobby.rules,credits=confirmedLobbyStartingCredits(lobby);
 return !!rules&&credits!==undefined&&rules.ruleset===(credits===STANDARD_STARTING_CREDITS?'standard-v2':'custom-v1')&&rules.speed===1&&rules.supply_cap===100&&rules.fog===true&&rules.strategic_operations===true;
}
export function hasStandardLobbyStartingCredits(lobby:Lobby):boolean {
 return canonicalLobbyRules(lobby)&&lobby.rules?.starting_credits===STANDARD_STARTING_CREDITS;
}
export function lobbyStartingMoneyLock(lobby:Lobby):string|undefined {
 if(lobby.resume_tick!==undefined||lobby.scenario_rules?.resumed)return 'This checkpoint keeps its saved opening budget.';
 if(lobby.scenario_id||lobby.scenario_rules)return 'This scenario keeps its prescribed starting budget.';
 if(lobby.rated)return 'Ranked operations use the standard 6,000 credits per commander.';
 if(lobby.mode!=='custom')return 'Standard battle formats use 6,000 credits per commander. Custom funds require a private Custom operation.';
 if(!lobby.private)return 'Public operations use 6,000 credits per commander. Custom funds require a private Custom operation.';
 if(!canonicalLobbyRules(lobby))return 'Wait for confirmed host rules before changing starting credits.';
 return undefined;
}
export function lobbyStartingMoneySummary(lobby:Lobby):string {
 if(lobby.scenario_rules)return lobby.scenario_rules.rules_notice;
 if(lobby.scenario_id)return 'Scenario rules · prescribed starting budget';
 if(lobby.resume_tick!==undefined)return 'Saved checkpoint · opening budget preserved';
 const credits=confirmedLobbyStartingCredits(lobby);
 if(credits===undefined)return 'Starting credits unavailable · refresh host rules';
 return (credits===STANDARD_STARTING_CREDITS?'Standard v2':'Custom v1')+' · '+formatStartingCredits(credits)+' starting credits each · 100 Supply · normal speed';
}
