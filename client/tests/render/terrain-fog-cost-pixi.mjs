// Non-rendering test adapter: observes actual TerrainBaker geometry and uploads.
// It deliberately makes no assertion about Pixi, GPU pixels, or GPU timing.
export const state = {capture: true, buffers: [], meshes: [], textures: []};
class TestBuffer {
 constructor(data) {this.data = data; this.updates = 0; this.uploaded = data.slice(); state.buffers.push(this);}
 update() {this.updates++; if (state.capture) this.uploaded = this.data.slice();}
}
export class MeshGeometry {
 constructor({positions, uvs, indices}) {this.positions = positions; this.uvs = uvs; this.indices = indices; this.attributes = {aUV: {buffer: new TestBuffer(uvs)}};}
 destroy() {this.destroyed = true;}
}
export class Texture {
 constructor(width = 1, height = 1) {this.width = width; this.height = height; this.source = {}; state.textures.push(this);}
 static from(image) {return new Texture(image.width, image.height);}
 destroy() {this.destroyed = true;}
}
Texture.WHITE = new Texture();
export class Mesh {
 constructor({texture, geometry}) {
  this.texture = texture; this.geometry = geometry; this.visible = true;
  this.position = {x: 0, y: 0, set(x, y) {this.x = x; this.y = y;}, copyFrom(p) {this.x = p.x; this.y = p.y;}};
  state.meshes.push(this);
 }
 destroy() {this.destroyed = true;}
}
export function reset(capture = true) {state.capture = capture; state.buffers = []; state.meshes = []; state.textures = [];}
