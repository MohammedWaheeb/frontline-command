/** Presentation policy for an optional advisor. Never submits or retries orders. */
export type AdviceFeedback={kind:'ignore'}|{kind:'temporary';message:string}|{kind:'error'};
export function adviceFeedback(error:unknown,phase:'background'|'command'):AdviceFeedback{
 if(!error||typeof error!=='object')return {kind:'error'};
 const {code,recoverable}=error as {code?:unknown;recoverable?:unknown};
 if(recoverable===false||typeof code!=='string')return {kind:'error'};
 if(phase==='background'&&['advice_pending','targeting_changed','player_inactive'].includes(code))return {kind:'ignore'};
 if(!['advice_timeout','advice_busy','advice_rate_exceeded','advice_unavailable'].includes(code))return {kind:'error'};
 return {kind:'temporary',message:phase==='background'?'Command options are temporarily unavailable. Retrying…':'Order not sent: command options are temporarily unavailable. Try again.'};
}
