// Deterministic map-layout builder for Frontline Command authored content.
// Coordinates passed to painting helpers are integer TILE coordinates; entity
// positions are emitted in millitiles as required by pkg/content/map.go.
import zlib from 'node:zlib';

// Claude claude-opus-5-5 authored the original helper. Codex is authoring the
// shipped layouts during the user's explicitly authorized quota takeover.
export const AUTHOR = 'Frontline Command: Codex layouts; Claude Opus 5.5 authoring helpers';
export const PACK = '2.0.0';
const OBJECT_SIZE = {light_prop: 1, heavy_prop: 2, garrison: 3};

// Integer hash noise so every rebuild produces byte-identical layouts.
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function smooth(x, y, scale, seed) {
  const gx = Math.floor(x / scale), gy = Math.floor(y / scale);
  const fx = (x / scale) - gx, fy = (y / scale) - gy;
  const a = hash2(gx, gy, seed), b = hash2(gx + 1, gy, seed), c = hash2(gx, gy + 1, seed), d = hash2(gx + 1, gy + 1, seed);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export class MapBuilder {
  constructor({id, title, width, height, symmetry = 'none', base = 'open', baseHeight = 0, version = '1'}) {
    Object.assign(this, {id, title, width, height, symmetry, version});
    this.tiles = Array.from({length: width * height}, () => ({terrain: base, height: baseHeight}));
    this.spawns = []; this.fields = []; this.stations = []; this.regions = []; this.objects = [];
    this.shipment = null; this.nextResource = 1; this.nextObject = 1; this.labels = [];
    if (symmetry === 'rot90' && width !== height) throw new Error(`${id}: rot90 symmetry needs a square map`);
  }
  // Tile transforms for the declared symmetry. The identity is always first.
  tileTransforms() {
    const W = this.width, H = this.height;
    const t = [(x, y) => [x, y]];
    if (this.symmetry === 'rot180') t.push((x, y) => [W - 1 - x, H - 1 - y]);
    if (this.symmetry === 'mirrorX') t.push((x, y) => [W - 1 - x, y]);
    if (this.symmetry === 'rot90') t.push((x, y) => [W - 1 - y, x], (x, y) => [W - 1 - x, H - 1 - y], (x, y) => [y, H - 1 - x]);
    return t;
  }
  pointTransforms() {
    const W = this.width * 1000, H = this.height * 1000;
    const t = [(p) => ({x: p.x, y: p.y})];
    if (this.symmetry === 'rot180') t.push((p) => ({x: W - p.x, y: H - p.y}));
    if (this.symmetry === 'mirrorX') t.push((p) => ({x: W - p.x, y: p.y}));
    if (this.symmetry === 'rot90') t.push((p) => ({x: W - p.y, y: p.x}), (p) => ({x: W - p.x, y: H - p.y}), (p) => ({x: p.y, y: H - p.x}));
    return t;
  }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }
  tile(x, y) { return this.tiles[y * this.width + x]; }
  // Paint one source tile through every symmetric transform.
  set(x, y, spec, sym = true) {
    const list = sym ? this.tileTransforms() : [(a, b) => [a, b]];
    for (const tf of list) {
      const [tx, ty] = tf(x, y);
      if (!this.inside(tx, ty)) continue;
      const t = this.tile(tx, ty);
      if (spec.onlyOn && !spec.onlyOn.includes(t.terrain)) continue;
      if (spec.notOn && spec.notOn.includes(t.terrain)) continue;
      if (spec.terrain !== undefined) t.terrain = spec.terrain;
      if (spec.height !== undefined) t.height = spec.height;
      if (spec.sight !== undefined) { if (spec.sight) t.sight_blocker = true; else delete t.sight_blocker; }
      if (spec.mandatory !== undefined) { if (spec.mandatory) t.mandatory = true; else delete t.mandatory; }
      if (t.mandatory && ['water', 'cliff', 'blocked'].includes(t.terrain)) delete t.mandatory;
    }
  }
  rect(x0, y0, x1, y1, spec, sym = true) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, spec, sym);
    return this;
  }
  disc(cx, cy, r, spec, sym = true) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, spec, sym);
    }
    return this;
  }
  ellipse(cx, cy, rx, ry, spec, sym = true) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.set(x, y, spec, sym);
    }
    return this;
  }
  // Thick polyline with a round brush; width is the full stroke width in tiles.
  stroke(points, width, spec, sym = true) {
    const r = width / 2;
    for (let i = 0; i + 1 < points.length; i++) {
      const [ax, ay] = points[i], [bx, by] = points[i + 1];
      const len = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
      for (let s = 0; s <= len; s++) this.disc(ax + (bx - ax) * s / len, ay + (by - ay) * s / len, r, spec, sym);
    }
    return this;
  }
  // Organic patches (cover woods, rubble fields, broken ground) from value noise.
  patches(x0, y0, x1, y1, {scale = 6, threshold = 0.62, seed = 1, spec}, sym = true) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (smooth(x, y, scale, seed) > threshold) this.set(x, y, spec, sym);
    }
    return this;
  }
  // Raised block bounded by a one-tile cliff ring. Ramps replace ring tiles.
  plateau(x0, y0, x1, y1, height, ramps = [], sym = true) {
    this.rect(x0, y0, x1, y1, {terrain: 'cliff', height});
    this.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, {terrain: 'open', height});
    for (const r of ramps) this.ramp(r, height, sym);
    return this;
  }
  // A ramp is a rectangle of ramp tiles (usually 4+ tiles wide) cut through cliffs.
  ramp({x0, y0, x1, y1, mandatory = true}, height = 1, sym = true) {
    this.rect(x0, y0, x1, y1, {terrain: 'ramp', height: Math.max(0, height - 1), mandatory}, sym);
    return this;
  }
  // Symmetric spawns: teams[i] is the lobby team hint for the i-th transform.
  spawn(x, y, teams = []) {
    this.pointTransforms().forEach((tf, i) => this.spawns.push({position: tf({x: x * 1000 + 500, y: y * 1000 + 500}), team: teams[i] ?? 0}));
    return this;
  }
  spawnAt(x, y, team = 0) { this.spawns.push({position: {x: x * 1000 + 500, y: y * 1000 + 500}, team}); return this; }
  field(x, y, credits, sym = true, label) {
    const list = sym ? this.pointTransforms() : [(p) => p];
    for (const tf of list) {
      const f = {id: this.nextResource++, position: tf({x: x * 1000 + 500, y: y * 1000 + 500}), credits};
      this.fields.push(f); if (label) this.labels.push({kind: 'field', id: f.id, label, position: f.position});
    }
    return this;
  }
  station(x, y, sym = true, label) {
    const list = sym ? this.pointTransforms() : [(p) => p];
    for (const tf of list) {
      const s = {id: this.nextResource++, position: tf({x: x * 1000 + 500, y: y * 1000 + 500})};
      this.stations.push(s); if (label) this.labels.push({kind: 'station', id: s.id, label, position: s.position});
    }
    return this;
  }
  // Regions use inclusive tile rectangles and are never symmetrized implicitly.
  region(id, x0, y0, x1, y1, label) {
    this.regions.push({id, min: {x: x0 * 1000, y: y0 * 1000}, max: {x: x1 * 1000 + 999, y: y1 * 1000 + 999}});
    if (label) this.labels.push({kind: 'region', id, label, position: {x: Math.round((x0 + x1 + 1) * 500), y: Math.round((y0 + y1 + 1) * 500)}});
    return this;
  }
  // Object centre from its top-left tile; footprints stay tile-aligned.
  object(cls, x, y, sym = true) {
    const size = OBJECT_SIZE[cls];
    const list = sym ? this.pointTransforms() : [(p) => p];
    for (const tf of list) {
      const c = tf({x: x * 1000 + size * 500, y: y * 1000 + size * 500});
      this.objects.push({id: this.nextObject++, class: cls, position: c});
    }
    return this;
  }
  label(text, x, y) { this.labels.push({kind: 'landmark', label: text, position: {x: x * 1000 + 500, y: y * 1000 + 500}}); return this; }
  setShipment(x, y) { this.shipment = {x: x * 1000 + 500, y: y * 1000 + 500}; return this; }

  // Remove objects that collide with impassable/mandatory tiles, resources,
  // spawns, shipment or earlier objects, so authoring stays declarative.
  pruneObjects() {
    const taken = new Set();
    const reserved = (tx, ty) => {
      for (const s of this.spawns) if (Math.abs(Math.floor(s.position.x / 1000) - tx) <= 4 && Math.abs(Math.floor(s.position.y / 1000) - ty) <= 4) return true;
      for (const p of [...this.fields, ...this.stations].map((r) => r.position).concat(this.shipment ? [this.shipment] : [])) {
        if (Math.abs(Math.floor(p.x / 1000) - tx) <= 2 && Math.abs(Math.floor(p.y / 1000) - ty) <= 2) return true;
      }
      return false;
    };
    this.objects = this.objects.filter((o) => {
      const size = OBJECT_SIZE[o.class];
      const left = (o.position.x - size * 500) / 1000, top = (o.position.y - size * 500) / 1000;
      const cells = [];
      for (let y = top; y < top + size; y++) for (let x = left; x < left + size; x++) {
        if (!this.inside(x, y)) return false;
        const t = this.tile(x, y);
        if (['water', 'cliff', 'blocked'].includes(t.terrain) || t.mandatory || taken.has(y * this.width + x) || reserved(x, y)) return false;
        cells.push(y * this.width + x);
      }
      cells.forEach((c) => taken.add(c));
      return true;
    });
    this.objects.forEach((o, i) => { o.id = i + 1; });
  }
  // Clear a 9×9 base pad around every spawn: passable, non-mandatory, flat.
  clearSpawns(radius = 5, terrain = 'open') {
    for (const s of this.spawns) {
      const cx = Math.floor(s.position.x / 1000), cy = Math.floor(s.position.y / 1000);
      const h = this.tile(cx, cy).height;
      for (let y = cy - radius; y <= cy + radius; y++) for (let x = cx - radius; x <= cx + radius; x++) {
        if (!this.inside(x, y)) continue;
        const t = this.tile(x, y);
        t.terrain = terrain; t.height = h; delete t.mandatory; delete t.sight_blocker;
      }
    }
  }
  clearAround(points, radius = 1) {
    for (const p of points) {
      const cx = Math.floor(p.x / 1000), cy = Math.floor(p.y / 1000);
      for (let y = cy - radius; y <= cy + radius; y++) for (let x = cx - radius; x <= cx + radius; x++) {
        if (!this.inside(x, y)) continue;
        const t = this.tile(x, y);
        if (!['open', 'road', 'ramp'].includes(t.terrain)) t.terrain = 'open';
        delete t.mandatory;
      }
    }
  }
  toJSON() {
    this.clearSpawns();
    this.clearAround([...this.fields, ...this.stations].map((r) => r.position).concat(this.shipment ? [this.shipment] : []));
    this.pruneObjects();
    const tiles = this.tiles.map((t) => {
      const o = {terrain: t.terrain, height: t.height};
      if (t.sight_blocker) o.sight_blocker = true;
      if (t.mandatory) o.mandatory = true;
      return o;
    });
    const out = {
      id: this.id, title: this.title, author: AUTHOR, version: this.version, format_version: 1, ruleset: 'standard-v2',
      width: this.width, height: this.height, tiles, spawns: this.spawns, fields: this.fields, stations: this.stations,
      shipment: this.shipment, regions: this.regions, objects: this.objects, required_packs: [PACK],
    };
    return out;
  }
}

// Passability helpers shared by measurement and previews.
export const passable = (t) => !['water', 'cliff', 'blocked'].includes(t.terrain);

// 8-connected Dijkstra over tiles with vehicle clearance (tiles whose 3×3
// neighbourhood is passable) and terrain cost; returns distance in tiles.
export function routeDistance(map, from, to, {clearance = 1} = {}) {
  const W = map.width, H = map.height, T = map.tiles;
  const blockedObj = new Set();
  for (const o of map.objects || []) {
    const size = OBJECT_SIZE[o.class];
    const left = (o.position.x - size * 500) / 1000, top = (o.position.y - size * 500) / 1000;
    for (let y = top; y < top + size; y++) for (let x = left; x < left + size; x++) blockedObj.add(y * W + x);
  }
  const ok = (x, y) => {
    for (let dy = -clearance + 1; dy < clearance; dy++) for (let dx = -clearance + 1; dx < clearance; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) return false;
      const i = ny * W + nx;
      if (!passable(T[i]) || blockedObj.has(i)) return false;
    }
    return true;
  };
  const sx = Math.floor(from.x / 1000), sy = Math.floor(from.y / 1000), gx = Math.floor(to.x / 1000), gy = Math.floor(to.y / 1000);
  const dist = new Float64Array(W * H).fill(Infinity);
  // Binary heap
  const heap = [];
  const push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  dist[sy * W + sx] = 0; push(0, sy * W + sx);
  const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    const x = i % W, y = (i - x) / W;
    if (x === gx && y === gy) return d;
    for (const [dx, dy, c] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      const end = nx === gx && ny === gy;
      if (!end && !ok(nx, ny)) continue;
      if (dx && dy && (!passable(T[y * W + nx]) || !passable(T[ny * W + x]))) continue;
      const slow = ['cover', 'rubble'].includes(T[j].terrain) ? 1.25 : 1;
      const nd = d + c * slow;
      if (nd < dist[j]) { dist[j] = nd; push(nd, j); }
    }
  }
  return Infinity;
}

// Minimal PNG writer for review previews (RGB, filter 0).
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function previewPNG(map, scale = 4, overlay = {}) {
  const W = map.width * scale, H = map.height * scale;
  const px = Buffer.alloc(W * H * 3);
  const palette = {open: [150, 138, 104], road: [110, 100, 86], cover: [86, 104, 58], rubble: [120, 108, 96], water: [52, 84, 96], cliff: [58, 50, 44], blocked: [30, 28, 26], ramp: [170, 150, 110]};
  const put = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; };
  for (let ty = 0; ty < map.height; ty++) for (let tx = 0; tx < map.width; tx++) {
    const t = map.tiles[ty * map.width + tx];
    let c = palette[t.terrain].slice();
    const lift = t.height * 14; c = c.map((v) => Math.min(255, v + lift));
    if (t.sight_blocker) c = c.map((v) => v * 0.8);
    for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
      let cc = c;
      if (t.mandatory && (x + y) % 4 === 0) cc = [200, 170, 60];
      put(tx * scale + x, ty * scale + y, cc);
    }
  }
  const box = (p, r, c) => { const cx = Math.round(p.x / 1000 * scale), cy = Math.round(p.y / 1000 * scale); for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) put(cx + x, cy + y, c); };
  const frame = (r, c) => { const x0 = Math.round(r.min.x / 1000 * scale), y0 = Math.round(r.min.y / 1000 * scale), x1 = Math.round(r.max.x / 1000 * scale), y1 = Math.round(r.max.y / 1000 * scale); for (let x = x0; x <= x1; x++) { put(x, y0, c); put(x, y1, c); } for (let y = y0; y <= y1; y++) { put(x0, y, c); put(x1, y, c); } };
  for (const r of map.regions || []) frame(r, [230, 220, 200]);
  for (const o of map.objects || []) box(o.position, Math.max(1, (OBJECT_SIZE[o.class] * scale) / 2 - 1), o.class === 'garrison' ? [90, 70, 60] : [70, 60, 50]);
  for (const f of map.fields) box(f.position, scale + 1, f.credits >= 36000000 ? [240, 190, 40] : [210, 150, 40]);
  for (const s of map.stations) box(s.position, scale, [220, 120, 40]);
  if (map.shipment) box(map.shipment, scale, [240, 240, 240]);
  const teamColors = [[200, 60, 50], [60, 120, 200], [80, 170, 80], [200, 170, 60]];
  map.spawns.forEach((s, i) => box(s.position, scale * 2, teamColors[i % 4]));
  for (const m of overlay.markers || []) box(m.position, Math.max(1, scale - 1), m.color || [255, 255, 255]);
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, {level: 9})), chunk('IEND', Buffer.alloc(0))]);
}
