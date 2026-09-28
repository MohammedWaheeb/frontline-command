// Reusable terrain motifs. All coordinates are tile coordinates.
export function woods(m, x0, y0, x1, y1, seed, density = 0.6, scale = 5, sym = true) {
  m.patches(x0, y0, x1, y1, {scale, threshold: density, seed, spec: {terrain: 'cover', notOn: ['road', 'water', 'cliff', 'blocked', 'ramp']}}, sym);
}
export function rubble(m, x0, y0, x1, y1, seed, density = 0.64, scale = 4, sym = true) {
  m.patches(x0, y0, x1, y1, {scale, threshold: density, seed, spec: {terrain: 'rubble', notOn: ['road', 'water', 'cliff', 'blocked', 'ramp']}}, sym);
}
// Impassable rock outcrop: cliff rim, blocked core, optional noisy edge.
export function outcrop(m, cx, cy, rx, ry, height = 2, sym = true) {
  m.ellipse(cx, cy, rx, ry, {terrain: 'cliff', height}, sym);
  if (rx > 3 && ry > 3) m.ellipse(cx, cy, rx - 2, ry - 2, {terrain: 'blocked', height: height + 1}, sym);
}
// Ridge line of cliffs along a polyline.
export function ridge(m, points, width = 3, height = 2, sym = true) {
  m.stroke(points, width, {terrain: 'cliff', height}, sym);
}
export function road(m, points, width = 3, mandatory = false, sym = true) {
  m.stroke(points, width, {terrain: 'road', ...(mandatory ? {mandatory: true} : {})}, sym);
}
export function river(m, points, width = 5, sym = true) {
  m.stroke(points, width, {terrain: 'water', height: 0}, sym);
}
// Ravine: cliff banks with an impassable bed.
export function ravine(m, points, width = 9, sym = true) {
  m.stroke(points, width, {terrain: 'cliff', height: 0}, sym);
  m.stroke(points, Math.max(1, width - 4), {terrain: 'blocked', height: 0}, sym);
}
// Crossing: a road (bridge) or rubble ford painted across water/ravine; mandatory.
export function crossing(m, points, width = 4, ford = false, sym = true) {
  m.stroke(points, width, {terrain: ford ? 'rubble' : 'road', height: 0, mandatory: true}, sym);
}
// Town block: street grid, rubble lots, garrisonable buildings and props.
export function town(m, x0, y0, x1, y1, seed, {street = 9, garrisons = true, halls = false, sym = true} = {}) {
  for (let x = x0; x <= x1; x += street) m.rect(x, y0, x + 1, y1, {terrain: 'road', notOn: ['water', 'cliff', 'blocked']}, sym);
  for (let y = y0; y <= y1; y += street) m.rect(x0, y, x1, y + 1, {terrain: 'road', notOn: ['water', 'cliff', 'blocked']}, sym);
  rubble(m, x0, y0, x1, y1, seed, 0.66, 3, sym);
  let k = 0;
  for (let y = y0 + 3; y + 3 <= y1; y += street) for (let x = x0 + 3; x + 3 <= x1; x += street) {
    k++;
    if (halls && k % 3 === 0) { m.rect(x, y, x + 3, y + 2, {terrain: 'blocked', height: 1, sight: true}, sym); continue; }
    if (garrisons && k % 2 === 1) m.object('garrison', x, y, sym);
    else m.object('heavy_prop', x + 1, y, sym);
    m.object('light_prop', x + 4, y + 4, sym);
  }
}
// Base terrace: flattened area of given terrain (e.g. road aprons).
export function pad(m, cx, cy, r, sym = true) { m.disc(cx, cy, r, {terrain: 'open', notOn: ['road']}, sym); }
// Circle road helper
export function ringRoad(m, cx, cy, r, width = 3, sym = false, spec = {terrain: 'road'}) {
  const pts = [];
  for (let a = 0; a <= 64; a++) pts.push([cx + r * Math.cos(a / 64 * 2 * Math.PI), cy + r * Math.sin(a / 64 * 2 * Math.PI)]);
  m.stroke(pts, width, spec, sym);
}
