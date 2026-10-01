import test from 'node:test';
import assert from 'node:assert/strict';
import {ArtLibrary, type ArtIndex} from '../../src/render/art';
import {artUIKeys} from '../../src/content/art-ui';

const index = (portraits: string[], buildIcons: string[] = []): ArtIndex => ({format: 1, sprites: {}, terrain: [], portraits, buildIcons, chrome: [], icons: true, emblems: true});
function canvasDocument() {
 const context = {drawImage() {}, fillRect() {}, globalCompositeOperation: '', fillStyle: ''};
 return {createElement(name: string) {assert.equal(name, 'canvas'); return {width: 0, height: 0, getContext: () => context, toDataURL: () => 'data:image/png;real-composition-path'};}} as unknown as Document;
}
test('actual cameo consumer uses full advertised building portrait and build keys independently', async () => {
 const prior = globalThis.document; globalThis.document = canvasDocument();
 try {
  for (const purpose of ['portrait', 'build'] as const) {
   const art = new ArtLibrary(), requests: string[] = []; art.index = index(['building.US.barracks'], ['building.US.barracks']);
   art.image = async url => {requests.push(url); return {naturalWidth: 40, naturalHeight: 40} as HTMLImageElement;};
   assert.equal(await art.cameo('building.US.barracks', '#f00', 'idle', 0, purpose), 'data:image/png;real-composition-path');
   const kind = purpose === 'build' ? 'icons/build' : 'portraits';
   assert.deepEqual(requests, ['beauty', 'team'].map(layer => `/art/ui/${kind}/building.US.barracks@2x.${layer}.png`));
  }
 } finally {globalThis.document = prior;}
});

test('actual build cameo falls back to its independently advertised portrait, and units retain legacy keys', async () => {
 const prior = globalThis.document; globalThis.document = canvasDocument();
 try {
  for (const [id, portraits, builds, purpose, wanted] of [
   ['building.US.barracks', ['building.US.barracks'], [], 'build', 'portraits/building.US.barracks'],
   ['building.US.barracks', ['building.US.barracks'], ['US.barracks'], 'build', 'icons/build/US.barracks'],
   ['building.US.barracks', ['US.barracks'], ['building.US.barracks'], 'portrait', 'portraits/US.barracks'],
   ['unit.US.rifle', ['US.rifle'], ['US.rifle'], 'portrait', 'portraits/US.rifle'],
  ] as const) {
   const art = new ArtLibrary(), requests: string[] = []; art.index = index([...portraits], [...builds]);
   art.image = async url => {requests.push(url); return {naturalWidth: 40, naturalHeight: 40} as HTMLImageElement;};
   assert.ok(await art.cameo(id, '#f00', 'idle', 0, purpose));
   assert.deepEqual(requests, ['beauty', 'team'].map(layer => `/art/ui/${wanted}@2x.${layer}.png`));
  }
 } finally {globalThis.document = prior;}
});
test('an advertised illustration load failure retains the existing missing-art result without unadvertised retries', async () => {
 const art = new ArtLibrary(), requests: string[] = []; art.index = index(['building.US.barracks'], ['US.barracks']);
 art.image = async url => {requests.push(url); throw Error('Missing frozen file');};
 assert.equal(await art.cameo('building.US.barracks', '#f00'), undefined);
 assert.deepEqual(requests, ['beauty', 'team'].map(layer => `/art/ui/portraits/building.US.barracks@2x.${layer}.png`));
});

test('resolver prefers exact advertised keys independently and never guesses absent UI', () => {
 assert.deepEqual(artUIKeys(index(['US.rifle', 'unit.US.rifle'], ['US.rifle']), 'unit.US.rifle'), {portrait: 'unit.US.rifle', build: 'US.rifle'});
 assert.deepEqual(artUIKeys(index(['US.barracks'], ['building.US.barracks', 'US.barracks']), 'building.US.barracks'), {portrait: 'US.barracks', build: 'building.US.barracks'});
 assert.deepEqual(artUIKeys(index([], ['building.US.barracks']), 'building.US.barracks'), {portrait: undefined, build: 'building.US.barracks'});
 assert.deepEqual(artUIKeys(index(['US.other']), 'unit.US.rifle'), {portrait: undefined, build: undefined});
});
test('resolver rejects path traversal and URL syntax even when the malformed key is advertised', () => {
 for (const id of ['', 'building../US.hq', 'unit.US/rig', 'unit.US\\rig', 'unit.US%2frig', 'unit.US.rig?x', 'unit.US.rig#x', 'x'.repeat(240)]) {
  assert.throws(() => artUIKeys(index([id], [id]), id), /Invalid battlefield UI asset/);
 }
});
