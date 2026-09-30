import {RuntimeError} from '../runtime/errors';
import {commanderChallengeGoal,type CommanderChallenge,type CommanderOverview} from '../runtime/commander-progress';
import type {CampaignJourney} from '../runtime/campaign-journey';
import type {Difficulty,LoadedMission,OfflineConfig} from '../runtime';

export interface CommanderChallengeFocus {id:string;mission:string;version:string;mapId:string;objectiveID:string;title:string;goal:string}
export interface PreparedCommanderChallenge {content:LoadedMission;config:OfflineConfig;difficulty:Difficulty;challenge:CommanderChallengeFocus}

/** A focused attempt uses the existing validated scenario and ordinary orders.
 * This does not add practice administration, change rules or create rewards. */
export async function prepareCommanderChallenge(campaign:Pick<CampaignJourney,'prepareSolo'>,overview:CommanderOverview,id:string,difficulty:Difficulty,seed:number):Promise<PreparedCommanderChallenge>{
 const challenge:CommanderChallenge|undefined=overview.challenges.find(value=>value.id===id);
 if(!challenge)throw new RuntimeError('challenge_missing','This field exercise is not available in the installed content.');
 if(!challenge.unlocked)throw new RuntimeError('challenge_locked','Complete the listed campaign operation to unlock this field exercise.');
 const prepared=await campaign.prepareSolo(challenge.mission,difficulty,seed);
 const checked=commanderChallengeGoal(challenge,prepared.content);
 if(!checked.objectiveID)throw new RuntimeError('challenge_unavailable','This operation does not declare a supported optional exercise goal.');
 return {...prepared,difficulty,challenge:{id:checked.id,mission:prepared.content.entry.id,version:prepared.content.entry.version,mapId:prepared.content.map.id,objectiveID:checked.objectiveID,title:checked.title,goal:checked.description}};
}
