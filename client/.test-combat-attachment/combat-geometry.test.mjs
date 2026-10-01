// tests/runtime/combat-geometry.test.ts
import test from "node:test";
import assert from "node:assert/strict";

// src/render/iso.ts
var HALF_W = 32;
var HALF_H = 16;
function toScreen(xMt, yMt) {
  const x = xMt / 1e3, y = yMt / 1e3;
  return { x: (x - y) * HALF_W, y: (x + y) * HALF_H };
}

// src/render/combat-geometry.ts
function muzzleRotation(direction, directions) {
  if (!Number.isInteger(direction) || !Number.isInteger(directions) || directions < 2 || direction < 0 || direction >= directions) return;
  const a = direction / directions * Math.PI * 2, p = toScreen(Math.cos(a), Math.sin(a));
  return Math.atan2(p.y, p.x);
}
function projectileRotation(samples, map, visible) {
  const last = samples.at(-1);
  if (!last) return;
  for (let i = samples.length - 2; i >= 0; i--) {
    const previous = samples[i];
    if (previous.tick >= last.tick || !visibleTrace(previous.position, last.position, map, visible)) return;
    const d = toScreen(last.position.x - previous.position.x, last.position.y - previous.position.y);
    if (d.x !== 0 || d.y !== 0) return Math.atan2(d.y, d.x);
  }
}
function combatEffectVariant(settings) {
  return settings.reducedMotion && settings.reducedFlashing ? "reduced" : settings.reducedMotion ? "reducedMotion" : settings.reducedFlashing ? "reducedFlashing" : settings.artQuality === "standard" ? "low" : "standard";
}
function visibleTrace(a, b, map, visible) {
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return false;
  const known = (x2, y2) => x2 >= 0 && y2 >= 0 && x2 < map.width && y2 < map.height && !!visible[y2 * map.width + x2];
  let x = Math.floor(a.x / 1e3), y = Math.floor(a.y / 1e3);
  const endX = Math.floor(b.x / 1e3), endY = Math.floor(b.y / 1e3);
  if (!known(x, y) || !known(endX, endY)) return false;
  const dx = b.x - a.x, dy = b.y - a.y, sx = Math.sign(dx), sy = Math.sign(dy), stepX = dx === 0 ? Infinity : 1e3 / Math.abs(dx), stepY = dy === 0 ? Infinity : 1e3 / Math.abs(dy);
  let tx = dx === 0 ? Infinity : ((x + (sx > 0 ? 1 : 0)) * 1e3 - a.x) / dx, ty = dy === 0 ? Infinity : ((y + (sy > 0 ? 1 : 0)) * 1e3 - a.y) / dy;
  for (let n = 0; n <= map.width + map.height + 2; n++) {
    if (x === endX && y === endY) return true;
    if (tx < ty) {
      x += sx;
      tx += stepX;
    } else if (ty < tx) {
      y += sy;
      ty += stepY;
    } else {
      if (!known(x + sx, y) || !known(x, y + sy)) return false;
      x += sx;
      y += sy;
      tx += stepX;
      ty += stepY;
    }
    if (!known(x, y)) return false;
  }
  return false;
}

// tests/runtime/combat-geometry.test.ts
test("trace may not bridge a hidden pocket or extrapolate off the known map", () => {
  const map = { width: 8, height: 2 }, visible = Array(16).fill(true);
  assert.equal(visibleTrace({ x: 500, y: 500 }, { x: 7500, y: 500 }, map, visible), true);
  visible[4] = false;
  assert.equal(visibleTrace({ x: 500, y: 500 }, { x: 7500, y: 500 }, map, visible), false);
  assert.equal(visibleTrace({ x: -1, y: 1500 }, { x: 1500, y: 1500 }, map, visible), false);
  assert.equal(visibleTrace({ x: 500, y: 1500 }, { x: 8500, y: 1500 }, map, visible), false);
  assert.equal(visibleTrace({ x: 500, y: 1500 }, { x: 500, y: 1500 }, map, visible), true);
  const diagonal = Array(9).fill(true);
  diagonal[1] = false;
  assert.equal(visibleTrace({ x: 1, y: 0 }, { x: 2e3, y: 2e3 }, { width: 3, height: 3 }, diagonal), false);
  assert.equal(visibleTrace({ x: 0, y: 0 }, { x: 2e3, y: 2e3 }, { width: 3, height: 3 }, diagonal), false);
  assert.equal(visibleTrace({ x: 0, y: 0 }, { x: Infinity, y: 2e3 }, { width: 3, height: 3 }, diagonal), false);
});
test("accessibility variants take priority over decorative quality", () => {
  const settings = { artQuality: "standard", reducedMotion: false, reducedFlashing: false };
  assert.equal(combatEffectVariant(settings), "low");
  assert.equal(combatEffectVariant({ ...settings, artQuality: "high" }), "standard");
  assert.equal(combatEffectVariant({ ...settings, reducedMotion: true }), "reducedMotion");
  assert.equal(combatEffectVariant({ ...settings, reducedFlashing: true }), "reducedFlashing");
  assert.equal(combatEffectVariant({ ...settings, reducedMotion: true, reducedFlashing: true }), "reduced");
});
test("axial flash direction follows dimetric displayed headings, including independent turret directions", () => {
  const degrees = (n) => n * 180 / Math.PI;
  assert.ok(Math.abs(degrees(muzzleRotation(0, 16)) - 26.565051177) < 1e-8);
  assert.ok(Math.abs(degrees(muzzleRotation(4, 16)) - 153.434948823) < 1e-8);
  assert.equal(degrees(muzzleRotation(6, 16)), 180);
  assert.ok(Math.abs(degrees(muzzleRotation(8, 16)) + 153.434948823) < 1e-8);
  assert.ok(Math.abs(degrees(muzzleRotation(12, 16)) + 26.565051177) < 1e-8);
  for (const [d, n] of [[0, 1], [-1, 16], [16, 16], [NaN, 16], [1.5, 16], [1, 2.5]]) assert.equal(muzzleRotation(d, n), void 0);
});
test("projectile direction needs real successive movement and never a guessed first sample or target", () => {
  const map = { width: 8, height: 2 }, visible = Array(16).fill(true), a = { tick: 1, position: { x: 500, y: 500 } }, b = { tick: 2, position: { x: 1500, y: 500 } }, still = { ...b, tick: 3 };
  assert.equal(projectileRotation([], map, visible), void 0);
  assert.equal(projectileRotation([a], map, visible), void 0);
  assert.equal(projectileRotation([a, { ...a, tick: 2 }], map, visible), void 0);
  assert.equal(projectileRotation([a, { ...b, tick: 1 }], map, visible), void 0);
  assert.equal(projectileRotation([b, a], map, visible), void 0);
  assert.ok(Math.abs(projectileRotation([a, b], map, visible) - Math.atan2(16, 32)) < 1e-12);
  assert.equal(projectileRotation([a, b, still], map, visible), projectileRotation([a, b], map, visible));
  const hidden = [...visible];
  hidden[1] = false;
  assert.equal(projectileRotation([a, { tick: 2, position: { x: 2500, y: 500 } }], map, hidden), void 0);
  assert.equal(projectileRotation([a, { tick: 2, position: { x: NaN, y: 500 } }], map, visible), void 0);
});
