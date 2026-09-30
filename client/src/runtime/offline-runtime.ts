import type {AssetGeneration} from './asset-generation';
import {RuntimeError} from './errors';
import type {RuntimeVersion} from './types';

export interface OfflineRuntimeIdentity {
 readonly generation:string;
 readonly version:Readonly<RuntimeVersion>;
 readonly wasmSHA256:string;
}
const fields=['adapter','simulation','protocol','go','content_hash'] as const;
/** The expected engine is selected by the verified index/manifest, before any
 * runtime URL can independently fall back to a different completed pack. */
export async function captureOfflineRuntime(generation:AssetGeneration,signal?:AbortSignal):Promise<OfflineRuntimeIdentity>{
 const version=await generation.json<RuntimeVersion>('/runtime/version.json',signal);
 if(!version||typeof version!=='object'||typeof version.adapter!=='string'||!version.adapter||typeof version.simulation!=='string'||!version.simulation||typeof version.go!=='string'||!version.go||!Number.isSafeInteger(version.protocol)||version.protocol<1||typeof version.content_hash!=='string'||!/^[a-f0-9]{64}$/.test(version.content_hash))throw new RuntimeError('runtime_manifest_invalid','The selected pack has invalid runtime version metadata. Reinstall its matching game package.');
 const wasm=generation.descriptor('/runtime/frontline.wasm');
 if(wasm.bytes<1)throw new RuntimeError('runtime_manifest_invalid','The selected pack does not contain a usable Go engine. Reinstall its matching game package.');
 return Object.freeze({generation:generation.identity.key,version:Object.freeze(Object.fromEntries(fields.map(field=>[field,version[field]])) as unknown as RuntimeVersion),wasmSHA256:wasm.sha256});
}
/** The digest comes from the buffer that Worker.init actually instantiated.
 * Refetching after startup could validate B while an A engine is running. */
export function assertOfflineRuntime(actual:RuntimeVersion,expected:OfflineRuntimeIdentity):void{
 if(!actual||fields.some(field=>actual[field]!==expected.version[field]))throw new RuntimeError('runtime_incompatible','The offline engine differs from the selected game package. Reconnect to its matching local host, reinstall the pack, and reload before playing or importing.');
 if(actual.wasm_sha256!==expected.wasmSHA256)throw new RuntimeError('runtime_integrity','The offline engine bytes differ from the selected game package. Reinstall the matching pack and reload before playing or importing.');
}
