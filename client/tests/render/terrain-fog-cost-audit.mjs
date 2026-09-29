import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';

const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), root = path.dirname(client);
const at = process.argv.indexOf('--out'); if (at < 0 || !process.argv[at + 1]) throw Error('Pass a fresh --out directory');
const out = path.resolve(process.argv[at + 1]); await mkdir(out, {recursive: true});
const sources = {v2: 'work/terrain-polish-v2/source/client/src/render/terrain.ts', v3: 'work/terrain-polish-v3/source/client/src/render/terrain.ts'};
const expected = {v2: '968299e854349a7463f00d6b4cf7676b2cb035d2b4a3fbd46b62c50207980876', v3: 'f25faee16c90a801cb6153213106a54a89fa169a1481646e2824cb612ce734cd'};
const hash = value => createHash('sha256').update(value).digest('hex'), freeze = {}, modules = {}, cases = [], timings = [];
const dependencies = path.join(root, 'work/terrain-polish-review/inputs-v2');
for (const file of ['iso.ts', 'terrain-materials.ts', 'terrain-surface.ts']) freeze[file] = hash(await readFile(path.join(dependencies, file)));
freeze.live = hash(await readFile(path.join(client, 'src/render/terrain.ts'))); assert.equal(freeze.live, expected.v2);
for (const [kind, relative] of Object.entries(sources)) {
 const bytes = await readFile(path.join(root, relative)); freeze[kind] = hash(bytes); assert.equal(freeze[kind], expected[kind]);
 await build({stdin: {contents: bytes.toString() + '\nexport {TerrainSurface}; export {state as testState,Texture as TestTexture,reset as resetTest} from "pixi.js";', loader: 'ts', resolveDir: dependencies, sourcefile: kind + '-terrain.ts'}, outfile: path.join(out, kind + '.mjs'), bundle: true, format: 'esm', platform: 'node', plugins: [{name: 'observe-geometry-without-gpu', setup(build) {build.onResolve({filter: /^pixi\.js$/}, () => ({path: path.join(client, 'tests/render/terrain-fog-cost-pixi.mjs')}));}}]});
 modules[kind] = await import(pathToFileURL(path.join(out, kind + '.mjs')));
}
globalThis.document = {createElement(name) {assert.equal(name, 'canvas'); return {width: 0, height: 0, getContext() {return {createImageData(w, h) {return {data: new Uint8ClampedArray(w * h * 4)};}, putImageData() {}, fillRect() {}};}};}};
const bytesEqual = (a, b, label) => assert.ok(Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength)), label);
function map(width, height = width, terrain = 'flat') {
 return {width, height, tiles: Array.from({length: width * height}, (_, i) => {
  const x = i % width, y = Math.floor(i / width);
  if (terrain === 'flat') return {height: 0, terrain: 'open'};
  if (terrain === 'raised') return {height: (x * 3 + y * 2) % 5, terrain: (x + y) % 3 === 0 ? 'cliff' : (x + y) % 7 === 0 ? 'water' : 'ramp'};
  return {height: x >= 15 && x <= 22 && y >= 9 && y <= 24 ? 3 : (x === 16 || y === 16 ? (x + y) % 5 : 0), terrain: x === 16 || y === 16 ? 'cliff' : x === 0 || y === height - 1 ? 'blocked' : 'open'};
 })};
}
function scene(kind, publicMap, chunks, capture = true) {
 const m = modules[kind]; m.resetTest(capture); const baker = new m.TerrainBaker(publicMap, {}), surface = new m.TerrainSurface(publicMap), fragments = [];
 const cells = chunks ?? Array.from({length: Math.ceil(publicMap.width / 16) * Math.ceil(publicMap.height / 16)}, (_, i) => [i % Math.ceil(publicMap.width / 16), Math.floor(i / Math.ceil(publicMap.width / 16))]);
 for (const [x, y] of cells) fragments.push(...baker.surfaceFragments(x, y, m.TestTexture.WHITE, surface));
 return {kind, map: publicMap, baker, surface, fragments, triangles: fragments.reduce((n, f) => n + f.triangles.length, 0)};
}
function dispose(s) {
 const owned = [...new Set(s.fragments.flatMap(f => [f.mesh.texture, f.fog.texture]))].filter(t => t !== modules[s.kind].TestTexture.WHITE);
 for (const f of s.fragments) f.dispose(); s.baker.disposeSurfaceResources();
 assert.ok(s.fragments.every(f => f.mesh.destroyed && f.fog.destroyed && f.mesh.geometry.destroyed && f.fog.geometry.destroyed)); assert.ok(owned.every(t => t.destroyed));
 s.fragments = []; modules[s.kind].resetTest();
}
function compare(a, b, geometry = false) {
 assert.equal(a.fragments.length, b.fragments.length); let bytes = 0;
 for (let i = 0; i < a.fragments.length; i++) {
  const x = a.fragments[i], y = b.fragments[i];
  assert.equal(x.fog.visible, y.fog.visible); assert.equal(x.mesh.visible, y.mesh.visible);
  bytesEqual(x.fog.geometry.uvs, y.fog.geometry.uvs, `fog floats fragment ${i}`); bytes += x.fog.geometry.uvs.byteLength;
  bytesEqual(x.fog.geometry.attributes.aUV.buffer.uploaded, y.fog.geometry.attributes.aUV.buffer.uploaded, `uploaded fog floats fragment ${i}`);
  if (geometry) {
   assert.deepEqual(x.triangles, y.triangles); assert.deepEqual(x.bounds, y.bounds); assert.equal(x.depth, y.depth); assert.deepEqual([x.mesh.position.x,x.mesh.position.y], [y.mesh.position.x,y.mesh.position.y]);
   assert.equal(x.mesh.zIndex, y.mesh.zIndex); assert.equal(x.fog.zIndex, y.fog.zIndex); assert.equal(x.mesh.tint, y.mesh.tint);
   for (const mesh of ['mesh', 'fog']) for (const attribute of ['positions', 'indices']) bytesEqual(x[mesh].geometry[attribute], y[mesh].geometry[attribute], `${mesh} ${attribute}`);
   bytesEqual(x.mesh.geometry.uvs, y.mesh.geometry.uvs, 'ground UVs');
  }
 }
 return bytes;
}
const set = (s, visible, explored) => {for (const f of s.fragments) f.setFog(visible, explored);};
const uploads = s => s.fragments.reduce((n, f) => n + f.fog.geometry.attributes.aUV.buffer.updates, 0);
function step(a, b, visible, explored, stable = false) {
 const beforeA = uploads(a), beforeB = uploads(b); set(a, visible, explored); set(b, visible, explored); const compared = compare(a, b);
 assert.equal(uploads(a) - beforeA, a.fragments.length);
 if (stable) assert.equal(uploads(b), beforeB, 'unchanged opacities must skip every v3 upload');
 return compared;
}
function run(name, fn) {const start = performance.now(), details = fn(); cases.push({name, passed: true, milliseconds: performance.now() - start, ...details}); console.log('PASS', name);}

try {
 run('all per-tile boolean combinations on flat, raised/cliff and asymmetric edges', () => {
  let states = 0, comparedBytes = 0;
  for (const [w, h, shape] of [[1, 1, 'flat'], [1, 3, 'raised'], [3, 1, 'raised'], [2, 2, 'flat'], [2, 2, 'raised']]) {
   const publicMap = map(w, h, shape), a = scene('v2', publicMap), b = scene('v3', publicMap); compare(a, b, true);
   const visible = [], explored = [];
   for (let bits = 0; bits < 4 ** (w * h); bits++) {
    let state = bits; for (let i = 0; i < w * h; i++) {visible[i] = (state & 1) !== 0; explored[i] = (state & 2) !== 0; state = Math.floor(state / 4);}
    comparedBytes += step(a, b, visible, explored); states++;
    comparedBytes += step(a, b, visible, explored, true); states++;
   }
   dispose(a); dispose(b);
  }
  return {states, comparedBytes};
 });
 run('chunk boundaries, perspectives, in-place mutation, sparse/missing vectors, hide/update/show, rewind', () => {
  const publicMap = map(35, 35, 'chunk'), a = scene('v2', publicMap), b = scene('v3', publicMap); compare(a, b, true);
  const visible = [], explored = []; let comparedBytes = 0, states = 0, seed = 741852;
  for (let n = 0; n < 160; n++) {
   visible.length = publicMap.tiles.length; explored.length = publicMap.tiles.length;
   for (let i = 0; i < visible.length; i++) {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; visible[i] = n % 7 === 0 || (seed & 7) === 1; explored[i] = n % 7 === 1 || !!(seed & 8);}
   if (n % 13 === 0) {visible.length = 0; explored.length = 0;}
   if (n % 17 === 0) {visible.length = 18; explored.length = 32; delete visible[2]; delete explored[5];}
   const hidden = n % 3 === 0; for (const s of [a, b]) for (let i = 0; i < s.fragments.length; i++) s.fragments[i].setVisible(!hidden || i % 2 === 0);
   comparedBytes += step(a, b, visible, explored); states++;
   // A fresh perspective array with identical values must not cause an upload.
   comparedBytes += step(a, b, [...visible], [...explored], true); states++;
   for (const s of [a, b]) for (const f of s.fragments) f.setVisible(true); compare(a, b);
  }
  const clear = Array(publicMap.tiles.length).fill(true); step(a, b, clear, [], false);
  step(a, b, clear, Array(publicMap.tiles.length).fill(true), true); // Same effective opacity, different explored values.
  step(a, b, [], []); step(a, b, [], [], true); // Rewind/unknown and unchanged hidden frontier.
  const result = {states: states + 4, fragments: a.fragments.length, triangles: a.triangles, comparedBytes}; dispose(a); dispose(b); return result;
 });
 run('every single dependency tile change including vertex-only neighbors reaches its fragment', () => {
  const publicMap = map(18, 18, 'raised'), a = scene('v2', publicMap, [[0, 0]]), b = scene('v3', publicMap, [[0, 0]]), visible = Array(324).fill(true), explored = Array(324).fill(true);
  compare(a, b, true); step(a, b, visible, explored); let comparisons = 0;
  for (let tile = 0; tile < 324; tile++) {
   visible[tile] = false; step(a, b, visible, explored); comparisons++;
   explored[tile] = false; step(a, b, visible, explored); comparisons++;
   visible[tile] = true; explored[tile] = true; step(a, b, visible, explored); comparisons++;
  }
  dispose(a); dispose(b); return {comparisons, includesOutsideChunkTiles: true};
 });
 run('only current public opacity elements are read; missing-array API rejection stays unchanged', () => {
  const publicMap = map(3, 3, 'raised'); Object.defineProperty(publicMap, 'entities', {get() {throw Error('Private data read');}});
  const a = scene('v2', publicMap), b = scene('v3', publicMap); const accessed = new Set();
  const view = new Proxy(Array(9).fill(false), {get(target, key) {assert.match(String(key), /^\d+$/); assert.ok(Number(key) >= 0 && Number(key) < 9); accessed.add(Number(key)); return target[key];}});
  step(a, b, view, view); step(a, b, view, view, true);
  for (const s of [a, b]) assert.throws(() => set(s, undefined, undefined), TypeError);
  dispose(a); dispose(b); return {accessed: [...accessed].sort()};
 });
 run('disposed geometry rebuilds have independent initial fog state across map dimensions and revisions', () => {
  const signatures = [];
  for (const [w, h, shape] of [[17, 18, 'flat'], [17, 18, 'raised'], [18, 17, 'chunk'], [1, 1, 'raised']]) {
   const publicMap = map(w, h, shape), a = scene('v2', publicMap), b = scene('v3', publicMap); compare(a, b, true);
   assert.ok(b.fragments.every(f => f.fog.visible)); assert.equal(uploads(b), b.fragments.length);
   step(a, b, Array(w * h).fill(true), []); step(a, b, [], []);
   signatures.push({width: w, height: h, shape, fragments: b.fragments.length, triangles: b.triangles}); dispose(a); dispose(b);
  }
  return {signatures};
 });
 run('unchanged hidden fragments restore visibility without an upload; external visibility edits are corrected', () => {
  const publicMap = map(17, 17, 'raised'), a = scene('v2', publicMap), b = scene('v3', publicMap);
  for (const s of [a, b]) for (const f of s.fragments) f.setVisible(false);
  step(a, b, [], [], true); for (const s of [a, b]) for (const f of s.fragments) {f.fog.visible = true;}
  step(a, b, [], [], true); assert.ok(b.fragments.every(f => !f.fog.visible));
  for (const s of [a, b]) for (const f of s.fragments) f.setVisible(true); compare(a, b); assert.ok(b.fragments.every(f => f.fog.visible));
  dispose(a); dispose(b); return {};
 });
 // Timing is a single-process JS diagnostic with observed upload calls only.
 // No GPU work, browser schedule, wall-clock gameplay, or reference-device gate.
 const publicMap = map(256), chunks = []; for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) chunks.push([x, y]);
 for (const kind of ['v2', 'v3']) {
  const allocated = {}, constructors = {};
  for (const name of ['Int32Array', 'Uint16Array', 'Uint32Array', 'Uint8Array', 'Float32Array']) {
   constructors[name] = globalThis[name]; globalThis[name] = new Proxy(constructors[name], {construct(target, args) {const value = Reflect.construct(target, args); allocated[name] = (allocated[name] ?? 0) + value.byteLength; return value;}});
  }
  let s; const startBuild = performance.now();
  try {s = scene(kind, publicMap, chunks, false);} finally {for (const [name, constructor] of Object.entries(constructors)) globalThis[name] = constructor;}
  const buildMS = performance.now() - startBuild;
  const visible = Array(65536).fill(true), explored = Array(65536).fill(true); for (let i = 0; i < s.fragments.length; i++) s.fragments[i].setVisible(i % 2 === 0);
  for (const mode of ['unchanged-clear', 'frontier-change', 'full-change']) {
   const samples = [], uploadCounts = [];
   for (let n = 0; n < 12; n++) {
    for (let i = 0; i < 65536; i++) {const x = i % 256; visible[i] = mode === 'unchanged-clear' || (mode === 'full-change' ? n % 2 === 0 : x < 128 + n % 2); explored[i] = mode !== 'full-change' || n % 2 === 0;}
    const before = uploads(s), start = performance.now(); set(s, visible, explored); const ms = performance.now() - start;
    if (n >= 4) {samples.push(ms); uploadCounts.push(uploads(s) - before);}
   }
   const sorted = [...samples].sort((a, b) => a - b);
   timings.push({kind, mode, chunks: chunks.length, fragments: s.fragments.length, triangles: s.triangles, hidden: s.fragments.filter(f => !f.mesh.visible).length, samples, medianMS: sorted[4], uploadCounts, buildMS, allocatedTypedArrayBytes: allocated});
   if (kind === 'v3' && mode === 'unchanged-clear') assert.ok(uploadCounts.every(n => n === 0));
  }
  dispose(s);
 }
 for (const [kind, relative] of Object.entries(sources)) assert.equal(hash(await readFile(path.join(root, relative))), expected[kind]);
 assert.equal(hash(await readFile(path.join(client, 'src/render/terrain.ts'))), freeze.live);
 const rows = (await readFile(path.join(root, 'work/claude/terrain-cost-20260929T082806Z.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
 const models = [...new Set(rows.filter(row => row.type === 'assistant').map(row => row.message?.model))], result = rows.find(row => row.type === 'result');
 assert.deepEqual(models, ['claude-opus-5-5']); assert.deepEqual(Object.keys(result.modelUsage), ['claude-opus-5-5']); assert.equal(result.is_error, false); assert.equal(result.terminal_reason, 'completed');
 const report = {passed: true, scope: 'Actual v2/v3 TerrainBaker with immutable public surface dependencies and non-rendering Pixi buffer adapter. Exact CPU Float32/upload bytes only; no GPU/browser/pixel/performance promotion.', sourceLocks: freeze, candidate: expected.v3, modelAudit: {returnedAssistantModels: models, modelUsage: Object.keys(result.modelUsage), terminalReason: result.terminal_reason, isError: result.is_error, subagents: result.subagent_stats}, cases, timings, helperSHA256: hash(await readFile(fileURLToPath(import.meta.url))), adapterSHA256: hash(await readFile(path.join(client, 'tests/render/terrain-fog-cost-pixi.mjs')))};
 await writeFile(path.join(out, 'audit.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({passed: true, cases: cases.length, timings: timings.map(({samples, ...row}) => row)}, null, 2));
} catch (error) {await writeFile(path.join(out, 'failure.json'), JSON.stringify({passed: false, stack: error.stack, sourceLocks: freeze, cases, timings}, null, 2) + '\n'); throw error;}
