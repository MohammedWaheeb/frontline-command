// V8-only diagnostic: source is unchanged; weak references observe construction
// Maps, with explicit GC and a task boundary before every observation.
import assert from 'node:assert/strict';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const arg = name => {const i = process.argv.indexOf(name); if (i < 0 || !process.argv[i + 1]) throw Error(`Missing ${name}`); return path.resolve(process.argv[i + 1]);};
if (typeof globalThis.gc !== 'function') throw Error('Run with --expose-gc');
const inputs = arg('--inputs'), output = arg('--out'), nativeMap = globalThis.Map, results = [];
globalThis.document = {createElement() {return {width: 0, height: 0, getContext() {return {createImageData(w, h) {return {data: new Uint8ClampedArray(w * h * 4)};}, putImageData() {}, fillRect() {}};}};}};
const turn = () => new Promise(resolve => setImmediate(resolve));
async function collect() {await turn(); for (let i = 0; i < 3; i++) {globalThis.gc(); await turn();}}
function createScene(m) {
 const map = {width: 16, height: 16, tiles: Array.from({length: 256}, () => ({terrain: 'open', height: 0}))}, baker = new m.TerrainBaker(map, {}), surface = new m.TerrainSurface(map);
 return {baker, fragments: baker.surfaceFragments(0, 0, m.TestTexture.WHITE, surface)};
}
function classify(records) {
 for (const row of records) {
  const map = row.ref.deref(), first = map?.entries().next().value;
  row.kind = typeof first?.[0] === 'number' && typeof first?.[1] === 'number' ? 'tile-slot-map' : typeof first?.[0] === 'string' && first[0].includes(',') && typeof first?.[1] === 'number' ? 'point-map' : Array.isArray(first?.[1]) ? 'fragment-groups' : 'other';
  row.entries = map?.size ?? 0;
 }
}
function count(records) {
 const live = {}; let entries = 0;
 for (const row of records) if (row.ref.deref()) {live[row.kind] = (live[row.kind] ?? 0) + 1; if (['tile-slot-map','point-map'].includes(row.kind)) entries += row.entries;}
 return {live, entries};
}
function exercise(held) {for (const fragment of held.fragments) fragment.setFog(Array(256).fill(true), Array(256).fill(true)); assert.ok(held.fragments.every(f => !f.fog.visible));}
function dispose(held, m) {for (const fragment of held.fragments) fragment.dispose(); held.baker.disposeSurfaceResources(); m.resetTest();}
for (const kind of ['v2', 'v3']) {
 const m = await import(pathToFileURL(path.join(inputs, kind + '.mjs'))), records = [];
 globalThis.Map = new Proxy(nativeMap, {construct(target, args) {const map = Reflect.construct(target, args); records.push({ref: new WeakRef(map)}); return map;}});
 let held;
 try {
  held = createScene(m); classify(records);
 } finally {globalThis.Map = nativeMap;}
 await collect();
 const live = count(records);
 // Exercise retained closures after collection so this is not a dead-scene test.
 exercise(held);
 const fragments = held.fragments.length;
 dispose(held, m); held = undefined;
 await collect();
 const afterDispose = count(records);
 results.push({kind, fragments, allocated: records.reduce((sum, row) => {sum[row.kind] = (sum[row.kind] ?? 0) + 1; return sum;}, {}), retainedEntriesWhileLive: live.entries, liveAfterGC: live.live, liveAfterDisposeGC: afterDispose.live});
}
const report = {scope: 'Node/V8 weak-reference observation over unchanged compiled source; explicit GC, one16x16 public chunk. Heap-engine diagnostic, not browser/GPU measurement or proof for every JS engine.', results};
await writeFile(output, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
