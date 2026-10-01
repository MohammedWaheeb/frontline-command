// Read-only graph/encoded-byte audit. The PNG-header oracle is deliberately not
// a browser decode, GPU residency, live gameplay or visual acceptance test.
import {readFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = path.dirname(client), args = process.argv.slice(2);
const option = name => {const at = args.indexOf(name); if (at < 0 || !args[at + 1]) throw Error(`Missing ${name}`); return path.resolve(args[at + 1]);};
const product = option('--product'), out = option('--out'), hash = value => createHash('sha256').update(value).digest('hex');
if (out.startsWith(product + path.sep) || out === product) throw Error('Evidence must be outside the immutable product.');
await mkdir(out, {recursive: true});
const helperPath = args.includes('--helper') ? option('--helper') : path.join(client, 'src/app/asset-preflight.ts');
await build({entryPoints: [helperPath], outfile: path.join(out, 'helper.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node24'});
const {AssetPreflight, planArtPreparation, verifyArtImages, ASSET_PREFLIGHT_LIMITS} = await import(pathToFileURL(path.join(out, 'helper.mjs')));
const indexPath = path.join(product, 'art/index.json'), indexBytes = await readFile(indexPath), index = JSON.parse(indexBytes);
const buildPath = path.join(path.dirname(product), 'build.json'), buildBytes = await readFile(buildPath), receipt = JSON.parse(buildBytes);
const expected = new Map(receipt.assets.flatMap(asset => asset.files.map(file => [file.path, file])));
const frozenFiles = new Map(), runs = [];
const local = url => {if (!url.startsWith('/art/') || url.includes('..')) throw Error(`Unsafe URL ${url}`); return path.join(product, url.slice(1));};
for (const scope of ['four-complete-overlay-assets', 'entire-frozen-index-plus-terrain']) for (const scale of ['1x', '2x']) {
 const files = new Map(); let bitmapClose = 0, maximumPNG = 0, maximumJSON = 0;
 const fetcher = async input => {
  const url = String(input), bytes = await readFile(local(url)), item = {url, bytes: bytes.length, sha256: hash(bytes)};
  if (files.has(url)) throw Error(`Duplicate read ${url}`);
  const wanted = expected.get(url); if (wanted && (wanted.bytes !== item.bytes || wanted.sha256 !== item.sha256)) throw Error(`Frozen overlay mismatch ${url}`);
  const before = frozenFiles.get(url); if (before && (before.bytes !== item.bytes || before.sha256 !== item.sha256)) throw Error(`Input changed ${url}`);
  files.set(url, item); frozenFiles.set(url, item);
  if (url.endsWith('.png')) maximumPNG = Math.max(maximumPNG, bytes.length); else maximumJSON = Math.max(maximumJSON, bytes.length);
  return new Response(bytes, {headers: {'content-type': url.endsWith('.png') ? 'image/png' : 'application/json'}});
 };
 const verifier = new AssetPreflight({fetch: fetcher, decode: async blob => {
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString('ascii', 12, 16) !== 'IHDR') throw Error('Invalid PNG header');
  return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), close() {bitmapClose++;}};
 }});
 const ids = scope.startsWith('four') ? receipt.assets.map(asset => asset.id) : Object.keys(index.sprites);
 const plan = await planArtPreparation(index, ids, scale, verifier);
 if (scope.startsWith('entire')) for (const material of index.terrain) plan.images.set(`/art/terrain/${material}.png`, {right: 0, bottom: 0});
 await verifyArtImages(plan, verifier);
 runs.push({scope, scale, assets: ids.length, files: verifier.files, encodedBytes: verifier.bytes, images: plan.images.size, uiPairs: plan.uiPairs.length, bitmapClose, maximumPNG, maximumJSON, filesDetail: [...files.values()]});
}
// Compare the previous declared dependency graph on exactly the same art. It did
// not include dedicated UI images and always loaded both scales at standard.
const oldRuns = [];
for (const scope of ['four-complete-overlay-assets', 'entire-frozen-index-plus-terrain']) for (const scale of ['1x', '2x']) {
 const urls = new Set(), ids = scope.startsWith('four') ? receipt.assets.map(asset => asset.id) : Object.keys(index.sprites);
 for (const id of ids) {
  const relative = index.sprites[id], url = `/art/${relative}`, base = url.slice(0, url.lastIndexOf('/') + 1), meta = JSON.parse(await readFile(local(url))); urls.add(url);
  for (const quality of new Set([scale, '2x'])) for (const names of Object.values(meta.atlases[quality] ?? meta.atlases['1x'])) for (const name of names) {
   const atlasURL = base + name, atlas = JSON.parse(await readFile(local(atlasURL))); urls.add(atlasURL); urls.add(base + atlas.meta.image);
  }
 }
 if (scope.startsWith('entire')) for (const material of index.terrain) urls.add(`/art/terrain/${material}.png`);
 let encodedBytes = 0; for (const url of urls) {const known = frozenFiles.get(url); encodedBytes += known?.bytes ?? (await readFile(local(url))).length;}
 oldRuns.push({scope, scale, files: urls.size, encodedBytes, dedicatedUIIncluded: false, note: 'Unique dependency graph; old duplicate metadata requests are not recounted here.'});
}
if (hash(await readFile(indexPath)) !== hash(indexBytes) || hash(await readFile(buildPath)) !== hash(buildBytes)) throw Error('Frozen receipt/index changed');
const report = {time: new Date().toISOString(), scope: 'Production helper over immutable real metadata and encoded PNG bytes, with PNG-header dimensions replacing browser decode. No browser, renderer, host, GPU or gameplay claim. This partial roster is not the sealed full-roster encoded-budget gate.', product: path.relative(root, product), indexSHA256: hash(indexBytes), buildSHA256: hash(buildBytes), helperSHA256: hash(await readFile(helperPath)), bundledHelperSHA256: hash(await readFile(path.join(out, 'helper.mjs'))), auditSHA256: hash(await readFile(fileURLToPath(import.meta.url))), limits: ASSET_PREFLIGHT_LIMITS, expectedOverlayFileCount: expected.size, checkedOverlayFiles: [...frozenFiles.keys()].filter(url => expected.has(url)).length, oldRuns, runs};
await import('node:fs/promises').then(fs => fs.writeFile(path.join(out, 'audit.json'), JSON.stringify(report, null, 2) + '\n'));
console.log(JSON.stringify({...report, runs: runs.map(({filesDetail, ...row}) => row)}, null, 2));
