import type {AssetGeneration, AssetGenerationIdentity, AssetLease} from './asset-generation';

/** One consumer operation owns its temporary decoded images. Every metadata
 * and image read stays bound to the same generation, including across awaits. */
export interface AssetReadScope {
 readonly identity: AssetGenerationIdentity;
 readonly signal: AbortSignal;
 assertCurrent(): void;
 json<T = unknown>(path: string): Promise<T>;
 image(path: string): Promise<HTMLImageElement>;
 release(): void;
}

export function assetReadScope(generation: AssetGeneration, signal?: AbortSignal): AssetReadScope {
 const lifetime = new AbortController();
 const active = AbortSignal.any([lifetime.signal, ...(signal ? [signal] : [])]);
 const documents = new Map<string, Promise<unknown>>();
 type ImageEntry = {pending?: Promise<HTMLImageElement>; image?: HTMLImageElement; lease?: AssetLease};
 const images = new Map<string, ImageEntry>();
 const assertCurrent = () => {
  active.throwIfAborted();
  if (generation.statistics.disposed) throw new DOMException('The asset generation was replaced.', 'AbortError');
 };
 const clearImage = (entry: ImageEntry) => {
  if (entry.image) {
   entry.image.onload = entry.image.onerror = null;
   entry.image.src = '';
   entry.image = undefined;
  }
  entry.lease?.release();
  entry.lease = undefined;
 };
 const release = () => {
  if (!lifetime.signal.aborted) lifetime.abort();
  for (const entry of images.values()) clearImage(entry);
  images.clear();
  documents.clear();
  active.removeEventListener('abort', release);
 };
 active.addEventListener('abort', release, {once: true});
 if (active.aborted) release();

 const json = <T = unknown>(path: string): Promise<T> => {
  // Keep errors asynchronous, like the underlying generation reader.
  const read = async () => {
   assertCurrent();
   let pending = documents.get(path);
   if (!pending) {
    pending = generation.json(path, active).then(value => {assertCurrent(); return value;});
    documents.set(path, pending);
   }
   const value = await pending;
   assertCurrent();
   return value as T;
  };
  return read();
 };
 const image = async (path: string): Promise<HTMLImageElement> => {
  assertCurrent();
  const retained = images.get(path);
  if (retained) return retained.pending!;
  const entry: ImageEntry = {};
  images.set(path, entry);
  entry.pending = (async () => {
   try {
    entry.lease = await generation.lease(path, active);
    assertCurrent();
    const node = entry.image = new Image();
    return await new Promise<HTMLImageElement>((resolve, reject) => {
     const clean = () => {node.onload = node.onerror = null; active.removeEventListener('abort', cancel);};
     const cancel = () => {clean(); reject(active.reason);};
     node.onload = () => {clean(); try {assertCurrent(); resolve(node);} catch (error) {reject(error);}};
     node.onerror = () => {clean(); reject(new Error('The verified asset image could not be decoded.'));};
     active.addEventListener('abort', cancel, {once: true});
     // No await between the liveness check and the listener/source assignment.
     node.src = entry.lease!.url;
    });
   } catch (error) {
    clearImage(entry);
    throw error;
   }
  })();
  return entry.pending;
 };
 return Object.freeze({identity: generation.identity, signal: active, assertCurrent, json, image, release});
}
