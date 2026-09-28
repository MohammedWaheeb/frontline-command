export type EffectVariant='standard'|'low'|'reducedMotion'|'reducedFlashing'|'reduced';
export interface EffectDescriptor {readonly url:string;readonly sha256:string;readonly bytes:number}
export interface EffectIndex {readonly format:1;readonly effects:Readonly<Record<string,EffectDescriptor>>}
export interface EffectPage {readonly file:string;readonly sha256:string;readonly bytes:number;readonly width:number;readonly height:number}
export interface EffectAtlasFrame {readonly page:number;readonly x:number;readonly y:number;readonly w:number;readonly h:number;readonly origin:readonly [number,number]}
export interface EffectClip {readonly fps:number;readonly loop:boolean;readonly frames:readonly EffectAtlasFrame[]}
export interface EffectMetadata {readonly format:1;readonly id:string;readonly resolution:1|2;readonly pages:readonly EffectPage[];readonly clips:Readonly<Record<string,EffectClip>>;readonly variants:Readonly<Record<EffectVariant,string>>}
export const EFFECT_LIMITS:Readonly<{indexBytes:number;metadataBytes:number;pageBytes:number;effects:number;pages:number;dimension:number;clips:number;frames:number}>;
export const EFFECT_VARIANTS:readonly EffectVariant[];
export function effectID(value:unknown):value is string;
export function effectPath(value:unknown):value is string;
export function effectDescriptor(value:unknown,kind?:'index'|'metadata'):EffectDescriptor;
export function decodeEffectIndex(bytes:Uint8Array):EffectIndex;
export function decodeEffectMetadata(bytes:Uint8Array,expectedID:string):EffectMetadata;
export function inspectEffectPNG(bytes:Uint8Array):{width:number;height:number;channels:number;compressed:Uint8Array[]};
