"""Layered detonation painter shared by explosions and large impacts.

A detonation is authored as separately timed masses rather than a single disc:
ignition flash → angular flame tongues → shock/dust skirt → debris arcs →
rising cel-shaded smoke → scorch settle. Each explosion ID configures its own
shape language (column, wide collapse, airborne breakup) through `Spec`.
Timing `t` runs 0..1 over the visible frames; the packer appends a transparent
terminal frame so a clamped non-looping clip never freezes a burning frame.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field

from fxkit import (AMBER, DUST_0, DUST_1, DUST_2, DUST_3, EMBER, HEAT_RAMP, INK, INK_WARM, ORANGE, PALE, RED,
                   SMOKE_0, SMOKE_1, SMOKE_2, SMOKE_3, SMOKE_4, SOFT_HEAT_RAMP, WHITE_HOT, YELLOW, Canvas,
                   Lobe, cel_cluster, ease_in, ease_io, ease_out, flame, ground_ring, mix, shard, star_pts,
                   streak, window, blob_pts)


@dataclass
class Burst:
    delay: float        # t at which this sub-burst ignites
    x: float
    y: float
    scale: float = 1.0


@dataclass
class Spec:
    R: float = 12                 # peak fireball radius (world px)
    rise: float = 10              # fireball rise
    life: float = 0.45            # portion of t the fire lasts
    tongues: int = 7
    up: float = 0.7               # vertical stretch of tongues
    squash: float = 0.85
    dust: float = 0.0             # ground dust skirt radius (half-width px), 0 = none (airborne)
    dust_lobes: int = 10
    dust_shades: tuple = (DUST_0, DUST_1, DUST_2, DUST_3)
    smoke: int = 6                # smoke lobe count
    smoke_r: float = 7
    smoke_rise: float = 18
    smoke_spread: float = 8
    smoke_delay: float = 0.12
    smoke_shades: tuple = (SMOKE_1, SMOKE_2, SMOKE_3, SMOKE_4)
    column: float = 0.0           # 0 = puffy cluster; >0 stacks lobes into a column of this height
    debris: int = 0
    debris_kind: str = "metal"    # metal | masonry | dirt | aircraft | girder
    debris_speed: float = 22
    debris_heavy: int = 0         # large chunks with smoke trails
    shock: float = 0.0            # shockwave ring max radius (0 = none)
    scorch: float = 0.0
    bursts: list = field(default_factory=lambda: [Burst(0, 0, 0, 1)])
    airborne: bool = False
    fall: float = 0.0             # airborne: burning main body falls this far
    rays: int = 8                 # ignition rays
    ray_len: float = 1.6


def _heat_ramp(soft):
    return SOFT_HEAT_RAMP if soft else HEAT_RAMP


def paint(cv: Canvas, t: float, spec: Spec, seed: str, mode: str = "std"):
    """mode: std | soft (reduced flashing: no white core, gradual onset, no rays/shock flash)."""
    soft = mode == "soft"
    rng0 = random.Random(seed)
    # Pre-roll deterministic layouts (independent of t so frames are coherent).
    smoke_layout = []
    for b_i, b in enumerate(spec.bursts):
        for k in range(max(1, int(round(spec.smoke * b.scale)))):
            a = rng0.uniform(-math.pi, 0) if not spec.airborne else rng0.uniform(-math.pi, math.pi)
            d = rng0.uniform(0.2, 1.0)
            smoke_layout.append(dict(b=b, a=a, d=d, r=spec.smoke_r * b.scale * rng0.uniform(0.7, 1.15),
                                     delay=b.delay + spec.smoke_delay + rng0.uniform(0, 0.14),
                                     h=rng0.uniform(0.0, 1.0), seed=rng0.randrange(1 << 30),
                                     rise=rng0.uniform(0.7, 1.2)))
    debris_layout = []
    for b in spec.bursts:
        for k in range(int(round((spec.debris + spec.debris_heavy) * b.scale))):
            heavy = k < spec.debris_heavy
            ang = rng0.uniform(-math.pi * 0.92, -math.pi * 0.08)
            sp = spec.debris_speed * b.scale * rng0.uniform(0.55, 1.05) * (0.8 if heavy else 1)
            debris_layout.append(dict(b=b, vx=math.cos(ang) * sp * 1.25, vy=math.sin(ang) * sp * (1.3 if heavy else 1),
                                      size=(rng0.uniform(2.2, 3.4) if heavy else rng0.uniform(0.9, 1.9)) * max(b.scale, .7),
                                      spin=rng0.uniform(-9, 9), rot=rng0.uniform(0, 6.28), heavy=heavy,
                                      seed=rng0.randrange(1 << 30)))
    dust_layout = []
    for b in spec.bursts:
        for k in range(spec.dust_lobes if spec.dust else 0):
            a = (k + rng0.uniform(-0.3, 0.3)) / spec.dust_lobes * math.tau
            dust_layout.append(dict(b=b, a=a, r=rng0.uniform(0.28, 0.42), seed=rng0.randrange(1 << 30),
                                    lag=rng0.uniform(0, 0.06)))

    ink = INK_WARM
    # ---------------------------------------------------------------- scorch
    if spec.scorch and not spec.airborne:
        s_a = window(t, 0.08, 0.3) * (1 - window(t, 0.8, 1.0))
        for b in spec.bursts:
            if t > b.delay:
                m = cv.poly(blob_pts(b.x, b.y, spec.scorch * b.scale, random.Random(seed + "sc"), n=14, jitter=0.2, squash=0.5))
                cv.paint(m, (28, 22, 16), 0.55 * s_a)

    # ---------------------------------------------------------------- dust skirt (back half)
    def dust_pass(front):
        for dl in dust_layout:
            b = dl["b"]
            lt = (t - b.delay - dl["lag"]) / max(1e-3, 0.62)
            if lt <= 0 or lt >= 1:
                continue
            spread = spec.dust * b.scale * (0.35 + 0.65 * ease_out(lt))
            x = b.x + math.cos(dl["a"]) * spread
            y = b.y + math.sin(dl["a"]) * spread * 0.5
            if (math.sin(dl["a"]) > 0) != front:
                continue
            r = spec.dust * b.scale * dl["r"] * (0.5 + 0.7 * ease_out(lt))
            alpha = (1 - ease_in(window(lt, 0.45, 1.0)))
            cel_cluster(cv, [Lobe(x, y - r * 0.45, r, dl["seed"])], spec.dust_shades, alpha, outline=0.8, squash=0.72, ink=ink)

    dust_pass(False)

    # ---------------------------------------------------------------- shockwave
    if spec.shock and not soft:
        for b in spec.bursts:
            lt = (t - b.delay) / 0.22
            if 0 < lt < 1:
                rx = spec.shock * b.scale * ease_out(lt)
                ground_ring(cv, b.x, b.y, rx, max(1.0, 2.2 * (1 - lt)), PALE, 0.75 * (1 - lt))

    # ---------------------------------------------------------------- smoke (behind fire for rising body)
    def smoke_pass(layer):
        lobes_by_alpha = {}
        for s in smoke_layout:
            b = s["b"]
            lt = (t - s["delay"]) / max(1e-3, 1 - s["delay"])
            if lt <= 0:
                continue
            grow = ease_out(min(lt * 1.6, 1))
            if spec.column:
                x = b.x + math.cos(s["a"]) * spec.smoke_spread * 0.35 * s["d"] * b.scale
                y = b.y - spec.column * b.scale * (0.25 + 0.75 * s["h"]) * ease_out(lt) - spec.smoke_rise * 0.2 * lt
            else:
                x = b.x + math.cos(s["a"]) * spec.smoke_spread * s["d"] * b.scale * (0.5 + 0.5 * grow)
                y = b.y + math.sin(s["a"]) * spec.smoke_spread * 0.55 * s["d"] * b.scale - spec.smoke_rise * s["rise"] * b.scale * ease_out(lt) - spec.R * 0.3 * b.scale
            if spec.airborne:
                y = b.y + math.sin(s["a"]) * spec.smoke_spread * s["d"] * 0.6 * grow - spec.smoke_rise * 0.4 * lt * s["rise"]
            behind = s["h"] > 0.45
            if behind != (layer == "back"):
                continue
            r = s["r"] * (0.45 + 0.75 * grow) * (1 + 0.25 * lt)
            alpha = 1 - ease_in(window(lt, 0.55, 1.0))
            heat = max(0.0, 1 - lt * 2.6) * (0.6 if soft else 1.0)
            shades = tuple(mix(c, ORANGE if i == 0 else AMBER, heat * (0.55 if i == 0 else 0.35)) for i, c in enumerate(spec.smoke_shades))
            key = (round(alpha, 2), shades)
            lobes_by_alpha.setdefault(key, []).append(Lobe(x, y, r, s["seed"]))
        for (alpha, shades), lobes in sorted(lobes_by_alpha.items(), key=lambda kv: -kv[0][0]):
            cel_cluster(cv, lobes, shades, alpha, outline=0.9, ink=ink)

    smoke_pass("back")

    # ---------------------------------------------------------------- fire
    ramp = _heat_ramp(soft)
    for bi, b in enumerate(spec.bursts):
        lt = (t - b.delay) / max(1e-3, spec.life)
        if lt <= 0 or lt >= 1:
            continue
        rng = random.Random(f"{seed}:rays:{bi}")
        # ignition ramps fast (0→1 in 12% of fire life); soft mode ramps gently.
        onset = ease_io(window(lt, 0, 0.65)) if soft else ease_out(window(lt, 0, 0.1))
        decay = 1 - ease_in(window(lt, 0.45, 1.0))
        R = spec.R * b.scale * (0.45 + 0.75 * onset) * (0.6 + 0.4 * decay)
        cy = b.y - spec.rise * b.scale * ease_out(lt) - R * 0.35
        cx = b.x
        if spec.fall:
            raise ValueError("fall is not implemented; use explicit falling debris")
        # heat cools: drop hottest layers progressively
        hot = 5 - int(min(4, lt * 5.2)) if not soft else 4 - int(min(3, lt * 4))
        levels = (1.0, 0.8, 0.62, 0.44, 0.24)[:max(1, hot)]
        alpha = 0.85 * onset if soft else 1.0
        # ignition rays (anticipation → hit) only in standard mode and first frames
        if not soft and lt < 0.22 and spec.rays:
            ra = 1 - lt / 0.22
            for k in range(spec.rays):
                a = k / spec.rays * math.tau + rng.uniform(-0.2, 0.2)
                L = R * spec.ray_len * (0.8 + 0.5 * rng.random()) * (0.6 + 0.6 * (1 - ra))
                streak(cv, cx + math.cos(a) * L, cy + math.sin(a) * L * 0.8, cx, cy, max(1.2, R * 0.28), YELLOW, 0.95 * ra)
        flame(cv, cx, cy, R, random.Random(f"{seed}:fire:{bi}"), n=spec.tongues, ramp=ramp, alpha=alpha * decay ** 0.3, up=spec.up,
              squash=spec.squash, levels=levels)
        if not soft and lt < 0.12:
            # white-hot ignition core
            cr = R * 0.55 * (1 - lt / 0.12 * 0.5)
            cv.paint(cv.poly(star_pts(cx, cy, cr, cr * 0.6, 6, rng.uniform(0, 1))), WHITE_HOT, 1.0)

    # ---------------------------------------------------------------- debris
    g = 2.2 * spec.debris_speed
    for d in debris_layout:
        b = d["b"]
        lt = (t - b.delay) / 0.75
        if lt <= 0 or lt >= 1:
            continue
        tt = lt * 1.2
        x = b.x + d["vx"] * tt
        y = b.y - spec.R * 0.3 * b.scale + d["vy"] * tt + 0.5 * g * tt * tt
        ground = b.y + (d["vx"] * tt) * 0.05 + 2
        if not spec.airborne and y > ground:
            y = ground
        alpha = 1 - ease_in(window(lt, 0.7, 1.0))
        kind = spec.debris_kind
        col = {"metal": (74, 72, 62), "masonry": (150, 136, 112), "dirt": DUST_0, "aircraft": (96, 98, 88),
               "girder": (60, 52, 42)}[kind]
        if d["heavy"]:
            # trailing smoke puffs behind heavy chunks
            for j in range(1, 4):
                pt = tt - j * 0.07
                if pt <= 0:
                    continue
                px = b.x + d["vx"] * pt
                py = b.y - spec.R * 0.3 * b.scale + d["vy"] * pt + 0.5 * g * pt * pt
                cel_cluster(cv, [Lobe(px, py, d["size"] * (0.7 + 0.25 * j), d["seed"] + j)], (SMOKE_0, SMOKE_1, SMOKE_2),
                            alpha * (1 - j * 0.25), outline=0.5, ink=ink)
            if lt < 0.6 and not soft:
                cv.paint(cv.ellipse(x, y, d["size"] * 0.9, d["size"] * 0.9), ORANGE, 0.8 * (1 - lt / 0.6))
        if kind == "girder" and d["heavy"]:
            a = d["rot"] + d["spin"] * tt
            L = d["size"] * 2.6
            streak(cv, x - math.cos(a) * L, y - math.sin(a) * L, x + math.cos(a) * L, y + math.sin(a) * L, 2.2, INK, alpha, taper=False)
            streak(cv, x - math.cos(a) * L, y - math.sin(a) * L, x + math.cos(a) * L, y + math.sin(a) * L, 1.2, col, alpha, taper=False)
        else:
            shard(cv, x, y, d["size"], d["rot"] + d["spin"] * tt, col, alpha, ink=INK, rng=random.Random(d["seed"]))
            if kind in ("metal", "aircraft") and lt < 0.35 and not soft:
                cv.paint(cv.ellipse(x, y, d["size"] * 0.5, d["size"] * 0.5), YELLOW, 0.9 * (1 - lt / 0.35))

    smoke_pass("front")
    dust_pass(True)
