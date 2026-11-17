/** Full art stays available to source development; portable builds ship 1x. */
declare const __FC_ART_PROFILE__:'full'|'standard';
export const BUILD_ART_PROFILE=typeof __FC_ART_PROFILE__==='undefined'?'full':__FC_ART_PROFILE__;
export const ART_QUALITY_OPTIONS:ReadonlyArray<{value:'auto'|'standard'|'high';label:string}>=BUILD_ART_PROFILE==='standard'
 ?[{value:'auto',label:'Automatic (recommended)'},{value:'standard',label:'Standard · lower memory'}]
 :[{value:'auto',label:'Automatic (recommended)'},{value:'standard',label:'Standard · lower memory'},{value:'high',label:'High · sharper unit art'}];
export function qualityForBuild(quality:'auto'|'standard'|'high',profile:'full'|'standard'=BUILD_ART_PROFILE){
 return profile==='standard'&&quality==='high'?'standard':quality;
}
