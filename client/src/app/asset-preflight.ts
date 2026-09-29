import type {ArtIndex, SpriteMeta} from '../render/art';
import {artUIKeys} from '../content/art-ui';

// Sealed roster: 14,222 sprite files + 22 terrain images + 136 × 4 UI images.
// This bounds encoded verification, not GPU residency or completed-art coverage.
export const ASSET_PREFLIGHT_LIMITS = Object.freeze({files: 16_384, json: 8 * 1024 * 1024, image: 64 * 1024 * 1024, total: 2 * 1024 * 1024 * 1024});
export const safeAssetPath = (path: unknown): path is string => typeof path === 'string' && path.length > 0 && path.length < 240 && !path.startsWith('/') && !path.includes('..') && !/[\\?#%]/.test(path) && /^[A-Za-z0-9_./@-]+$/.test(path);
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
type Dimensions = {width: number; height: number};
interface PreflightOptions {
 signal?: AbortSignal;
 fetch?: typeof fetch;
 decode?: (blob: Blob) => Promise<Dimensions & {close(): void}>;
 /** Dependency injection for deterministic deadline tests; production uses 15s. */
 scheduleTimeout?: (callback: () => void, milliseconds: number) => () => void;
 /** Tests may tighten, never increase, the production bounds. */
 limits?: Partial<Record<keyof typeof ASSET_PREFLIGHT_LIMITS, number>>;
}

/** One launch's verification cache. It retains metadata/dimensions, never image blobs. */
export class AssetPreflight {
 private readonly entries = new Map<string, {kind: 'json' | 'image'; value: Promise<any>}>();
 private readonly complete = new Set<string>();
 private totalBytes = 0;
 private readonly limits;
 constructor(private readonly options: PreflightOptions = {}) {
  this.limits = {...ASSET_PREFLIGHT_LIMITS, ...options.limits};
  for (const key of Object.keys(ASSET_PREFLIGHT_LIMITS) as (keyof typeof ASSET_PREFLIGHT_LIMITS)[]) {
   if (!Number.isSafeInteger(this.limits[key]) || this.limits[key] <= 0 || this.limits[key] > ASSET_PREFLIGHT_LIMITS[key]) throw Error('Invalid battlefield verification limit.');
  }
 }
 get files() { return this.complete.size; }
 get bytes() { return this.totalBytes; }
 checkCanceled() { this.options.signal?.throwIfAborted(); }
 private cached<T>(url: string, kind: 'json' | 'image', load: () => Promise<T>): Promise<T> {
  this.checkCanceled();
  if (!url.startsWith('/art/') || !safeAssetPath(url.slice(5))) throw Error(`Invalid battlefield asset URL: ${url}`);
  const prior = this.entries.get(url);
  if (prior) {
   if (prior.kind !== kind) throw Error(`Conflicting battlefield asset types: ${url}`);
   return prior.value;
  }
  if (this.entries.size >= this.limits.files) throw Error('The battlefield asset list exceeds its supported size.');
  const value = Promise.resolve().then(load);
  this.entries.set(url, {kind, value});
  return value;
 }
 private async read(url: string, limit: number): Promise<Blob> {
  this.checkCanceled();
  const controller = new AbortController(), parent = this.options.signal;
  const abort = () => controller.abort(parent?.reason);
  parent?.addEventListener('abort', abort, {once: true});
  const stopDeadline = (this.options.scheduleTimeout ?? ((callback, milliseconds) => {
   const timer = setTimeout(callback, milliseconds); return () => clearTimeout(timer);
  }))(() => controller.abort(new DOMException('Battlefield asset download timed out.', 'TimeoutError')), 15_000);
  let stopped = false;
  const finishDownload = () => {if (!stopped) {stopped = true; stopDeadline(); parent?.removeEventListener('abort', abort);}};
  let body: ReadableStream<Uint8Array> | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
   controller.signal.throwIfAborted();
   const response = await (this.options.fetch ?? globalThis.fetch)(url, {cache: 'force-cache', credentials: 'same-origin', redirect: 'error', signal: controller.signal});
   controller.signal.throwIfAborted();
   body = response.body;
   if (!response.ok || !body) throw Error(`Battlefield asset failed to load: ${url}`);
   reader = body.getReader();
   const chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
   for (;;) {
    const {done, value} = await reader.read();
    controller.signal.throwIfAborted();
    if (done) {finishDownload(); break;}
    size += value.byteLength; this.totalBytes += value.byteLength;
    if (size > limit || this.totalBytes > this.limits.total) throw Error(`Battlefield asset exceeds its supported size: ${url}`);
    chunks.push(value.slice());
   }
   if (!size) throw Error(`Battlefield asset is empty: ${url}`);
   return new Blob(chunks, {type: response.headers.get('content-type') ?? ''});
  } catch (error) {
   const cause = controller.signal.aborted ? controller.signal.reason : error;
   finishDownload();
   // A failed/oversized stream must stop, but cancellation never replaces its cause.
   if (reader) await reader.cancel(cause).catch(() => {});
   else if (body) await body.cancel(cause).catch(() => {});
   throw cause;
  } finally {
   // Never abort a completed native response later, during unrelated UI work.
   finishDownload(); reader?.releaseLock();
  }
 }
 json(url: string): Promise<unknown> {
  return this.cached(url, 'json', async () => {
   const blob = await this.read(url, this.limits.json); this.checkCanceled();
   let value: unknown;
   try { value = JSON.parse(await blob.text()); } catch { throw Error(`Battlefield asset metadata is invalid: ${url}`); }
   this.checkCanceled(); this.complete.add(url); return value;
  });
 }
 image(url: string): Promise<Dimensions> {
  return this.cached(url, 'image', async () => {
   const blob = await this.read(url, this.limits.image); this.checkCanceled();
   let bitmap: Awaited<ReturnType<NonNullable<PreflightOptions['decode']>>> | undefined;
   try {
    bitmap = await (this.options.decode ?? createImageBitmap)(blob); this.checkCanceled();
    if (!Number.isSafeInteger(bitmap.width) || !Number.isSafeInteger(bitmap.height) || bitmap.width <= 0 || bitmap.height <= 0) throw Error('Invalid image dimensions.');
    const result = {width: bitmap.width, height: bitmap.height}; this.complete.add(url); return result;
   } catch (error) {
    this.checkCanceled();
    if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) throw error;
    throw Error(`Battlefield image could not be decoded: ${url}`, {cause: error});
   } finally { bitmap?.close(); }
  });
 }
}

interface ImageRequirement {width?: number; height?: number; right: number; bottom: number}
export interface ArtPreparationPlan {
 images: Map<string, ImageRequirement>;
 uiPairs: [string, string][];
}

/** Enumerate the actual world quality, explicit UI, and conservative cameo fallback. */
export async function planArtPreparation(index: ArtIndex, sheetIds: Iterable<string>, scale: '1x' | '2x', verifier: AssetPreflight, onProgress?: (label: string) => void): Promise<ArtPreparationPlan> {
 const images = new Map<string, ImageRequirement>(), uiPairs: [string, string][] = [], sheets = [...new Set(sheetIds)];
 const image = (url: string, next: ImageRequirement = {right: 0, bottom: 0}) => {
  const previous = images.get(url);
  if (previous && ((previous.width !== undefined && next.width !== undefined && previous.width !== next.width) || (previous.height !== undefined && next.height !== undefined && previous.height !== next.height))) throw Error(`Conflicting battlefield atlas dimensions: ${url}`);
  images.set(url, {width: next.width ?? previous?.width, height: next.height ?? previous?.height, right: Math.max(next.right, previous?.right ?? 0), bottom: Math.max(next.bottom, previous?.bottom ?? 0)});
 };
 const atlas = async (base: string, name: unknown, id: string) => {
  if (!safeAssetPath(name)) throw Error(`Invalid battlefield atlas path: ${id}`);
  const data = await verifier.json(base + name);
  if (!record(data) || !record(data.meta) || !safeAssetPath(data.meta.image) || !record(data.frames) || !Object.keys(data.frames).length) throw Error(`Invalid battlefield atlas image: ${id}`);
  const bounds: ImageRequirement = {right: 0, bottom: 0};
  if (data.meta.size !== undefined) {
   const size = data.meta.size;
   if (!record(size) || !Number.isSafeInteger(size.w) || !Number.isSafeInteger(size.h) || size.w <= 0 || size.h <= 0) throw Error(`Invalid battlefield atlas dimensions: ${id}`);
   bounds.width = size.w; bounds.height = size.h;
  }
  for (const item of Object.values(data.frames)) {
   const frame = record(item) ? item.frame : undefined;
   if (!record(frame) || !['x', 'y', 'w', 'h'].every(key => Number.isSafeInteger(frame[key])) || frame.x < 0 || frame.y < 0 || frame.w <= 0 || frame.h <= 0) throw Error(`Invalid battlefield atlas frame: ${id}`);
   bounds.right = Math.max(bounds.right, frame.x + frame.w); bounds.bottom = Math.max(bounds.bottom, frame.y + frame.h);
  }
  image(base + data.meta.image, bounds);
 };
 let model = 0;
 for (const id of sheets) {
  verifier.checkCanceled(); onProgress?.(`Preparing model files ${++model} / ${sheets.length}`);
  const path = index.sprites[id];
  if (!safeAssetPath(path)) throw Error(`Invalid battlefield asset path: ${id}`);
  const base = `/art/${path.slice(0, path.lastIndexOf('/') + 1)}`, meta = await verifier.json(`/art/${path}`) as SpriteMeta;
  if (!record(meta) || !record(meta.atlases)) throw Error(`Missing battlefield atlas: ${id}`);
  const loadLayers = async (layers: unknown, onlyCameo = false) => {
   if (!record(layers) || !Object.keys(layers).length || Object.keys(layers).length > 16) throw Error(`Missing battlefield atlas: ${id}`);
   for (const [layer, names] of Object.entries(layers)) {
    if (onlyCameo && layer !== 'beauty' && layer !== 'team') continue;
    if (!Array.isArray(names) || names.length > 256 || (layer === 'beauty' && !names.length)) throw Error(`Invalid battlefield atlas: ${id}`);
    for (const name of names) await atlas(base, name, id);
   }
   if (onlyCameo && !Array.isArray(layers.beauty)) throw Error(`Missing battlefield cameo atlas: ${id}`);
  };
  await loadLayers(meta.atlases[scale] ?? meta.atlases['1x']);
  const {portrait, build} = artUIKeys(index, id);
  for (const [kind, key] of [['portraits', portrait], ['icons/build', build]] as const) {
   if (!key) continue;
   const pair = ['beauty', 'team'].map(layer => `/art/ui/${kind}/${key}@2x.${layer}.png`) as [string, string];
   pair.forEach(url => image(url)); uiPairs.push(pair);
  }
  // A build cameo falls back to the portrait. Without a portrait, selection can
  // request any authored state/direction: retain all 2x beauty/team pages only.
  if (!portrait) await loadLayers(meta.atlases['2x'], true);
 }
 return {images, uiPairs};
}

/** Decode one image at a time, release immediately, then check atlas/UI integrity. */
export async function verifyArtImages(plan: ArtPreparationPlan, verifier: AssetPreflight, onProgress?: (label: string) => void): Promise<void> {
 const dimensions = new Map<string, Dimensions>(); let complete = 0;
 onProgress?.(`Preparing battlefield images 0 / ${plan.images.size}`);
 for (const [url, required] of plan.images) {
  const size = await verifier.image(url);
  if ((required.width !== undefined && required.width !== size.width) || (required.height !== undefined && required.height !== size.height) || required.right > size.width || required.bottom > size.height) throw Error(`Battlefield atlas image dimensions do not match: ${url}`);
  dimensions.set(url, size); onProgress?.(`Preparing battlefield images ${++complete} / ${plan.images.size}`);
 }
 for (const [beauty, team] of plan.uiPairs) {
  const a = dimensions.get(beauty), b = dimensions.get(team);
  if (!a || !b || a.width !== b.width || a.height !== b.height) throw Error(`Battlefield illustration layers do not match: ${beauty}`);
 }
 verifier.checkCanceled();
}
