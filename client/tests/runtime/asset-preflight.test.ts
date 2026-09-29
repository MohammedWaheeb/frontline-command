import test from 'node:test';
import assert from 'node:assert/strict';
import {AssetPreflight, ASSET_PREFLIGHT_LIMITS, planArtPreparation, verifyArtImages, safeAssetPath} from '../../src/app/asset-preflight';
import type {ArtIndex} from '../../src/render/art';

const json = (value: unknown) => new Response(JSON.stringify(value), {headers: {'Content-Type': 'application/json'}});
const atlas = (image: string, width = 4, height = 4) => ({meta: {image, size: {w: width, h: height}}, frames: {'idle/d00_f00': {frame: {x: 0, y: 0, w: width, h: height}}}});
const index = (sprites: Record<string, string>, portraits: string[] = [], buildIcons: string[] = []): ArtIndex => ({format: 1, sprites, portraits, buildIcons, terrain: [], chrome: [], icons: true, emblems: true});
function graph(portraits: string[] = ['US.car'], buildIcons: string[] = ['US.car']) {
 const resources = new Map<string, unknown>();
 const meta = {atlases: {'1x': {beauty: ['beauty-1.json'], team: ['team-1.json'], shadow: ['shadow-1.json']}, '2x': {beauty: ['beauty-2.json'], team: ['team-2.json'], shadow: ['shadow-2.json']}}};
 resources.set('/art/car/sprite.json', meta);
 for (const scale of [1, 2]) for (const layer of ['beauty', 'team', 'shadow']) resources.set(`/art/car/${layer}-${scale}.json`, atlas(`${layer}-${scale}.png`));
 const calls: string[] = [], closed: string[] = [];
 const fetcher: typeof fetch = async input => {
  const url = String(input); calls.push(url);
  return url.endsWith('.png') ? new Response(url) : resources.has(url) ? json(resources.get(url)) : new Response('missing', {status: 404});
 };
 const verifier = new AssetPreflight({fetch: fetcher, decode: async blob => { const url = await blob.text(); return {width: 4, height: 4, close: () => {closed.push(url);}}; }});
 return {resources, calls, closed, verifier, index: index({'unit.US.car': 'car/sprite.json'}, portraits, buildIcons)};
}

test('standard verifies selected world pages plus actual 2x portrait/build pairs, without unused 2x world pages', async () => {
 const g = graph(), progress: string[] = [];
 const plan = await planArtPreparation(g.index, ['unit.US.car', 'unit.US.car'], '1x', g.verifier, label => progress.push(label));
 await verifyArtImages(plan, g.verifier, label => progress.push(label));
 assert.equal(g.calls.length, 11); assert.equal(g.verifier.files, 11); assert.equal(g.closed.length, 7);
 assert.ok(g.calls.includes('/art/ui/portraits/US.car@2x.beauty.png')); assert.ok(g.calls.includes('/art/ui/icons/build/US.car@2x.team.png'));
 assert.ok(!g.calls.some(url => url.includes('-2.'))); assert.equal(progress[0], 'Preparing model files 1 / 1'); assert.equal(progress.at(-1), 'Preparing battlefield images 7 / 7');
});
test('high quality uses 2x world pages; the missing-high fallback matches the renderer', async () => {
 for (const missing of [false, true]) {
  const g = graph(); if (missing) delete (g.resources.get('/art/car/sprite.json') as any).atlases['2x'];
  await verifyArtImages(await planArtPreparation(g.index, ['unit.US.car'], '2x', g.verifier), g.verifier);
  assert.ok(g.calls.includes(`/art/car/shadow-${missing ? 1 : 2}.png`)); assert.ok(!g.calls.includes(`/art/car/beauty-${missing ? 2 : 1}.json`));
 }
});
test('a portrait also satisfies build fallback; missing portrait conservatively verifies every 2x beauty/team page', async () => {
 const portrait = graph(['US.car'], []);
 await verifyArtImages(await planArtPreparation(portrait.index, ['unit.US.car'], '1x', portrait.verifier), portrait.verifier);
 assert.equal(portrait.calls.length, 9); assert.ok(!portrait.calls.some(url => url.includes('icons/build')));
 for (const build of [[], ['US.car']]) {
  const g = graph([], build), meta = g.resources.get('/art/car/sprite.json') as any;
  meta.atlases['2x'].beauty.push('other-state.json'); g.resources.set('/art/car/other-state.json', {meta: {image: 'other-state.png'}, frames: {'landing/d15_f12': {frame: {x: 0, y: 0, w: 4, h: 4}}}});
  await verifyArtImages(await planArtPreparation(g.index, ['unit.US.car'], '1x', g.verifier), g.verifier);
  assert.ok(g.calls.includes('/art/car/other-state.png')); assert.ok(g.calls.includes('/art/car/team-2.png')); assert.ok(!g.calls.includes('/art/car/shadow-2.json'));
  assert.equal(g.calls.filter(url => url.includes('icons/build')).length, build.length ? 2 : 0);
 }
});
test('a high-quality cameo fallback shares already verified metadata and images', async () => {
 const g = graph([], []); await verifyArtImages(await planArtPreparation(g.index, ['unit.US.car'], '2x', g.verifier), g.verifier);
 assert.equal(g.calls.length, 7); assert.equal(new Set(g.calls).size, 7); assert.equal(g.closed.length, 3);
});
test('per-launch concurrent URL dedup counts bytes and decode only once; later launches reverify', async () => {
 let fetches = 0, decodes = 0, closes = 0;
 const options = {fetch: (async () => {fetches++; return new Response('four');}) as typeof fetch, decode: async () => {decodes++; return {width: 2, height: 2, close() {closes++;}};}};
 const v = new AssetPreflight(options); const [a, b] = await Promise.all([v.image('/art/shared.png'), v.image('/art/shared.png')]);
 assert.equal(a, b); assert.equal(v.bytes, 4); assert.equal(v.files, 1); assert.deepEqual([fetches, decodes, closes], [1, 1, 1]);
 await new AssetPreflight(options).image('/art/shared.png'); assert.equal(fetches, 2);
 assert.throws(() => v.json('/art/shared.png'), /Conflicting/);
});
test('image verification is sequential and closes each bitmap before the next decode', async () => {
 const plan = {images: new Map(Array.from({length: 5}, (_, i) => [`/art/${i}.png`, {right: 0, bottom: 0}])), uiPairs: [] as [string, string][]};
 let live = 0, peak = 0, closed = 0;
 const v = new AssetPreflight({fetch: (async () => new Response('png')) as typeof fetch, decode: async () => {live++; peak = Math.max(peak, live); await Promise.resolve(); return {width: 2, height: 2, close() {live--; closed++;}};}});
 await verifyArtImages(plan, v); assert.equal(peak, 1); assert.equal(live, 0); assert.equal(closed, 5);
});

function deadlineHarness(parent?: AbortSignal) {
 let callback: (() => void) | undefined, canceled = 0, requested = 0;
 const signals: AbortSignal[] = [], controller: {stream?: ReadableStreamDefaultController<Uint8Array>} = {};
 const fetcher: typeof fetch = async (_url, init) => {
  requested++; const signal = init!.signal!; signals.push(signal);
  return new Response(new ReadableStream<Uint8Array>({start(stream) {controller.stream = stream; signal.addEventListener('abort', () => stream.error(signal.reason), {once: true});}}));
 };
 const verifier = new AssetPreflight({signal: parent, fetch: fetcher, scheduleTimeout: (next, milliseconds) => {
  assert.equal(milliseconds, 15000); callback = next; return () => {callback = undefined; canceled++;};
 }});
 return {verifier, signals, controller, fire: () => callback?.(), pending: () => !!callback, cleared: () => canceled, requests: () => requested};
}
test('completed native EOF clears its deadline and detaches parent abort while preserving subsequent launch cancellation', async () => {
 const parent = new AbortController(), h = deadlineHarness(parent.signal), job = h.verifier.json('/art/one.json'); await Promise.resolve();
 h.controller.stream!.enqueue(new TextEncoder().encode('{"ok":true}')); h.controller.stream!.close(); assert.deepEqual(await job, {ok: true});
 assert.equal(h.pending(), false); assert.equal(h.cleared(), 1); h.fire(); parent.abort(new DOMException('User left', 'AbortError'));
 assert.equal(h.signals[0].aborted, false, 'finished response is not aborted 15s later or when the caller leaves');
 assert.throws(() => h.verifier.json('/art/two.json'), {name: 'AbortError'}); assert.equal(h.requests(), 1);
});
test('in-flight parent cancellation keeps its exact reason and clears the deadline', async () => {
 const parent = new AbortController(), h = deadlineHarness(parent.signal), job = h.verifier.json('/art/one.json'), reason = new DOMException('User left', 'AbortError');
 await Promise.resolve(); parent.abort(reason); await assert.rejects(job, error => error === reason); assert.equal(h.cleared(), 1); assert.equal(h.verifier.files, 0);
});
test('in-flight 15s deadline remains a real TimeoutError and detaches parent listener', async () => {
 const parent = new AbortController(), h = deadlineHarness(parent.signal), job = h.verifier.json('/art/one.json'); await Promise.resolve(); h.fire();
 await assert.rejects(job, {name: 'TimeoutError'}); assert.equal(h.cleared(), 1); const reason = h.signals[0].reason; parent.abort(); assert.equal(h.signals[0].reason, reason);
});
test('download deadline is cleared at EOF before an asynchronous image decode finishes', async () => {
 let deadline: (() => void) | undefined, native: AbortSignal | undefined, release: (() => void) | undefined, decoding: (() => void) | undefined;
 const started = new Promise<void>(resolve => {decoding = resolve;}), held = new Promise<void>(resolve => {release = resolve;});
 const v = new AssetPreflight({scheduleTimeout: callback => {deadline = callback; return () => {deadline = undefined;};}, fetch: (async (_url, init) => {native = init!.signal!; return new Response('png');}) as typeof fetch, decode: async () => {decoding!(); await held; return {width: 1, height: 1, close() {}};}});
 const job = v.image('/art/slow-decode.png'); await started; assert.equal(deadline, undefined); assert.equal(native?.aborted, false); release!(); await job;
});
test('failure cleanup cannot be replaced by a later timeout or parent abort while reader cancellation settles', async () => {
 const parent = new AbortController(); let deadline: (() => void) | undefined, native: AbortSignal | undefined, release: (() => void) | undefined, canceling: (() => void) | undefined;
 const started = new Promise<void>(resolve => {canceling = resolve;}), held = new Promise<void>(resolve => {release = resolve;});
 const v = new AssetPreflight({signal: parent.signal, limits: {json: 1}, scheduleTimeout: callback => {deadline = callback; return () => {deadline = undefined;};}, fetch: (async (_url, init) => {
  native = init!.signal!; return new Response(new ReadableStream({start(stream) {stream.enqueue(new TextEncoder().encode('12'));}, cancel() {canceling!(); return held;}}));
 }) as typeof fetch});
 const job = v.json('/art/oversize.json'); await started; assert.equal(deadline, undefined); parent.abort(); assert.equal(native?.aborted, false); release!(); await assert.rejects(job, /exceeds/);
});
test('a queued already-canceled call performs no fetch', async () => {
 const parent = new AbortController(), h = deadlineHarness(parent.signal); const job = h.verifier.json('/art/one.json'); parent.abort();
 await assert.rejects(job, {name: 'AbortError'}); assert.equal(h.requests(), 0);
});
test('fetch/header failures and native body errors preserve cause and clean the deadline', async () => {
 for (const kind of ['fetch', 'body']) {
  const reason = Error(kind), parent = new AbortController(); let cleared = 0, signal: AbortSignal | undefined;
  const v = new AssetPreflight({signal: parent.signal, scheduleTimeout: () => () => {cleared++;}, fetch: (async (_url, init) => {
   signal = init!.signal!; if (kind === 'fetch') throw reason;
   return new Response(new ReadableStream({start(stream) {stream.error(reason);}}));
  }) as typeof fetch});
  await assert.rejects(v.json('/art/file.json'), error => error === reason); parent.abort(); assert.equal(cleared, 1); assert.equal(signal?.aborted, false);
 }
});
test('parent cancellation during image decoding closes the bitmap and is never relabeled as a corrupt image', async () => {
 const parent = new AbortController(); let close = 0, native: AbortSignal | undefined;
 const v = new AssetPreflight({signal: parent.signal, fetch: (async (_url, init) => {native = init!.signal!; return new Response('png');}) as typeof fetch, decode: async () => {parent.abort(); return {width: 1, height: 1, close() {close++;}};}});
 await assert.rejects(v.image('/art/a.png'), {name: 'AbortError'}); assert.equal(close, 1); assert.equal(native?.aborted, false); assert.equal(v.files, 0);
});
test('bad HTTP, empty body, malformed JSON and image decode failures remain failures', async () => {
 for (const [response, pattern] of [[new Response('denied', {status: 403}), /failed to load/], [new Response(''), /empty/], [new Response('{bad'), /metadata is invalid/]] as const) {
  const v = new AssetPreflight({fetch: (async () => response) as typeof fetch}); await assert.rejects(v.json('/art/a.json'), pattern); assert.equal(v.files, 0);
 }
 const v = new AssetPreflight({fetch: (async () => new Response('bad png')) as typeof fetch, decode: async () => {throw Error('decoder failed');}});
 await assert.rejects(v.image('/art/a.png'), /could not be decoded/); assert.equal(v.files, 0);
});
test('encoded per-file/total limits still fail, stop the reader, and are counted once', async () => {
 for (const limits of [{json: 3}, {total: 3}]) {
  let canceled = 0;
  const v = new AssetPreflight({limits, fetch: (async () => new Response(new ReadableStream({start(stream) {stream.enqueue(new TextEncoder().encode('1234'));}, cancel() {canceled++;}}))) as typeof fetch});
  await assert.rejects(v.json('/art/large.json'), /exceeds/); assert.equal(canceled, 1); assert.equal(v.files, 0);
 }
 const v = new AssetPreflight({limits: {total: 5}, fetch: (async () => new Response('123')) as typeof fetch});
 assert.equal(await v.json('/art/one.json'), 123); assert.equal(await v.json('/art/one.json'), 123); assert.equal(v.bytes, 3);
 await assert.rejects(v.json('/art/two.json'), /exceeds/);
});
test('the file ceiling is bounded, sealed-roster-derived, and cannot be raised by a caller', async () => {
 assert.equal(ASSET_PREFLIGHT_LIMITS.files, 16384); assert.ok(14222 + 22 + 136 * 4 < ASSET_PREFLIGHT_LIMITS.files);
 assert.equal(ASSET_PREFLIGHT_LIMITS.total, 2 * 1024 ** 3); assert.equal(ASSET_PREFLIGHT_LIMITS.json, 8 * 1024 ** 2); assert.equal(ASSET_PREFLIGHT_LIMITS.image, 64 * 1024 ** 2);
 assert.throws(() => new AssetPreflight({limits: {files: 16385}}), /Invalid/);
 let calls = 0; const v = new AssetPreflight({limits: {files: 2}, fetch: (async () => {calls++; return json({});}) as typeof fetch});
 await v.json('/art/a.json'); await v.json('/art/b.json'); await v.json('/art/a.json'); assert.throws(() => v.json('/art/c.json'), /supported size/); assert.equal(calls, 2);
});
test('a valid 4550-file graph exceeds the old ceiling and verifies within the new bound', async () => {
 const sprites: Record<string, string> = {}, ui: string[] = []; let fetched = 0, decoded = 0;
 for (let i = 0; i < 70; i++) {sprites[`unit.US.test${i}`] = `unit${i}/sprite.json`; ui.push(`US.test${i}`);}
 const v = new AssetPreflight({fetch: (async input => {
  fetched++; const url = String(input);
  if (url.endsWith('/sprite.json')) return json({atlases: {'1x': {beauty: Array.from({length: 30}, (_, i) => `page${i}.json`)}}});
  if (url.endsWith('.json')) return json(atlas(url.split('/').at(-1)!.replace('.json', '.png'), 1, 1));
  return new Response('png');
 }) as typeof fetch, decode: async () => {decoded++; return {width: 1, height: 1, close() {}};}});
 await verifyArtImages(await planArtPreparation(index(sprites, ui, ui), Object.keys(sprites), '1x', v), v);
 assert.equal(v.files, 4550); assert.equal(fetched, 4550); assert.equal(decoded, 2380);
});
test('path traversal, malformed or partial atlases, and conflicting image dimensions are rejected', async () => {
 for (const path of ['../a.json', '/a.json', 'a%2fb', 'a?x', 'a#x', 'a\\b', '']) assert.equal(safeAssetPath(path), false);
 for (const value of [null, {meta: {image: '../bad.png'}, frames: {}}, {meta: {image: 'a.png'}, frames: {}}, {meta: {image: 'a.png'}, frames: {a: {frame: {x: -1, y: 0, w: 1, h: 1}}}}]) {
  const g = graph(); g.resources.set('/art/car/beauty-1.json', value); await assert.rejects(planArtPreparation(g.index, ['unit.US.car'], '1x', g.verifier), /Invalid/);
 }
 const g = graph(); g.resources.set('/art/car/team-1.json', atlas('beauty-1.png', 8, 8)); await assert.rejects(planArtPreparation(g.index, ['unit.US.car'], '1x', g.verifier), /Conflicting/);
});
test('decoded atlas bounds and explicit UI pair dimensions must agree', async () => {
 const g = graph(); g.resources.set('/art/car/beauty-1.json', atlas('beauty-1.png', 8, 8)); await assert.rejects(verifyArtImages(await planArtPreparation(g.index, ['unit.US.car'], '1x', g.verifier), g.verifier), /dimensions do not match/);
 const v = new AssetPreflight({fetch: (async input => new Response(String(input))) as typeof fetch, decode: async blob => ({width: (await blob.text()).includes('team') ? 3 : 4, height: 4, close() {}})});
 const plan = {images: new Map([['/art/beauty.png', {right: 0, bottom: 0}], ['/art/team.png', {right: 0, bottom: 0}]]), uiPairs: [['/art/beauty.png', '/art/team.png']] as [string, string][]};
 await assert.rejects(verifyArtImages(plan, v), /illustration layers do not match/);
});
