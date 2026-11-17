/** Routine order acknowledgements that the HUD no longer toasts (research B5,
 * design-audit-hud H14). Failures, partial results and every other notice still
 * show. Matching is on the exact controller copy from app/player-controls
 * (`executionCountFeedback`) and app/battle-controller ("Order accepted."). */
const ACK=[/^Order applied to \d+ capable units?\.$/,/^Order accepted\. Awaiting execution\.$/];
export function isOrderAcknowledgement(notice:string|undefined):boolean{return !!notice&&ACK.some(pattern=>pattern.test(notice))}
