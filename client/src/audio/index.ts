export type AudioBus='voice'|'music'|'effects'|'ui';
export interface AudioVariant {url:string;caption?:string;display_caption?:string;duration:number;bytes:number;sha256:string;mp3_url?:string;mp3_bytes?:number;mp3_sha256?:string}
export interface AudioEntry {bus:AudioBus;priority:number;cooldown_ms:number;loop:boolean;bpm?:number;beats_per_bar?:number;variants:AudioVariant[]}
export interface AudioIndex {format:1;sample_rate:number;entries:Record<string,AudioEntry>}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const finite=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const keys=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).every(key=>allowed.includes(key));
/** Reject remote URLs, traversal, oversized clips and unknown schema before loading. */
export function parseAudioIndex(value:unknown):AudioIndex {
 if(!record(value)||!keys(value,['format','sample_rate','entries'])||value.format!==1||!finite(value.sample_rate,8000,96000)||!record(value.entries)||Object.keys(value.entries).length>4096)throw Error('Invalid audio index.');
 const entries:Record<string,AudioEntry>=Object.create(null);
 for(const [id,raw] of Object.entries(value.entries)){
  if(!/^(vo|sfx|music)\.[a-zA-Z0-9_.-]{1,160}$/.test(id)||!record(raw)||!keys(raw,['bus','priority','cooldown_ms','loop','bpm','beats_per_bar','variants'])||!['voice','music','effects','ui'].includes(String(raw.bus))||!Array.isArray(raw.variants)||!raw.variants.length||raw.variants.length>8||!finite(raw.priority??0,0,100)||!finite(raw.cooldown_ms??0,0,60000)||(raw.loop!==undefined&&typeof raw.loop!=='boolean')||(raw.bpm!==undefined&&!finite(raw.bpm,30,240))||(raw.beats_per_bar!==undefined&&!finite(raw.beats_per_bar,1,16)))throw Error(`Invalid audio entry: ${id}`);
  const variants=raw.variants.map((variant):AudioVariant=>{
   if(!record(variant)||!keys(variant,['url','caption','display_caption','duration','bytes','sha256','mp3_url','mp3_bytes','mp3_sha256'])||typeof variant.url!=='string'||!/^\/art\/audio\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(ogg|mp3|wav)$/.test(variant.url)||variant.url.includes('..')||!finite(variant.duration,.01,raw.bus==='music'?180:90)||!Number.isSafeInteger(variant.bytes)||!finite(variant.bytes,1,16*1024**2)||typeof variant.sha256!=='string'||!/^([a-f0-9]{64})$/.test(variant.sha256)||(variant.caption!==undefined&&(typeof variant.caption!=='string'||variant.caption.length>12000))||(variant.display_caption!==undefined&&(typeof variant.display_caption!=='string'||variant.display_caption.length>12000))||(raw.bus==='voice'&&!variant.caption))throw Error(`Invalid audio variant: ${id}`);
   if(variant.mp3_url!==undefined||variant.mp3_bytes!==undefined||variant.mp3_sha256!==undefined){if(typeof variant.mp3_url!=='string'||!/^\/art\/audio\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.mp3$/.test(variant.mp3_url)||variant.mp3_url.includes('..')||!Number.isSafeInteger(variant.mp3_bytes)||!finite(variant.mp3_bytes,1,16*1024**2)||typeof variant.mp3_sha256!=='string'||!/^([a-f0-9]{64})$/.test(variant.mp3_sha256))throw Error(`Invalid MP3 fallback: ${id}`)}
   return {...variant} as unknown as AudioVariant;
  });
  entries[id]={bus:raw.bus as AudioBus,priority:raw.priority as number??0,cooldown_ms:raw.cooldown_ms as number??0,loop:raw.loop===true,bpm:raw.bpm as number|undefined,beats_per_bar:raw.beats_per_bar as number|undefined,variants};
 }
 return {format:1,sample_rate:value.sample_rate,entries};
}
/** Read decoded HTTP bytes with a hard bound, including absent/misleading length headers. */
export async function boundedAudioBytes(response:Response,max:number):Promise<Uint8Array>{
 if(!response.ok||response.redirected||!response.body)throw Error(`Audio file unavailable (${response.status}).`);
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let length=0;
 try{for(;;){const result=await reader.read();if(result.done)break;length+=result.value.length;if(length>max)throw Error('Audio file exceeds declared size.');parts.push(result.value)}}catch(error){await reader.cancel();throw error}finally{reader.releaseLock()}
 const bytes=new Uint8Array(length);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length}return bytes;
}
/** Presentation wall-clock gate; authoritative game ticks are never modified. */
export class AudioCooldowns {
 private until=new Map<string,number>();
 admit(key:string,now:number,ms:number){if((this.until.get(key)??-Infinity)>now)return false;this.until.set(key,now+ms);if(this.until.size>512)for(const [id,end]of this.until)if(end<=now)this.until.delete(id);if(this.until.size>1024)this.until.delete(this.until.keys().next().value!);return true}
 clear(){this.until.clear()}
}
