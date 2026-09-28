"""fx.explosion.* — eight destruction/burst effects with distinct motion language.

Wired today (CombatEffects): `small` (unknown impact, 12-tick cue; destroyed,
32-tick cue), `blast_radius_2` and `blast_radius_1_5` (splash-weapon impacts that
are not confirmed hits, 12-tick cue). The vehicle/aircraft/building IDs require a
destroyed event plus prior permitted actor class and remain unwired proposals.
No sprite extent declares a gameplay radius: blast skirts stop well inside the
catalog splash so the tactical warning boundary stays authoritative.
"""
from __future__ import annotations

import math
import random

from detonation import Burst, Spec, paint
from fxkit import (AMBER, DUST_0, DUST_1, DUST_2, DUST_3, EMBER, INK_WARM, ISO, ORANGE, RED, SMOKE_0, SMOKE_1,
                   SMOKE_2, SMOKE_3, CONCRETE_0, CONCRETE_1, CONCRETE_2, Clip, Effect, Lobe, cel_cluster,
                   ease_in, ease_out, flame, mix, render_frames, window, blob_pts)

# Frame boxes are generous render canvases; the packer crops tightly and fails if
# any frame touches the canvas edge (no clipped frames).

def _settled(cv, t, spec: Spec, seed, warm):
    """Reduced-motion form: a single settled smoke/ember mass that only fades.
    No expansion, debris or rising motion. warm=False removes the ember glow."""
    rng = random.Random(seed + ":settled")
    a = 1 - ease_in(window(t, 0.35, 1.0))
    on = window(t, 0, 0.25) if not warm else 1.0
    alpha = a * (0.55 + 0.45 * on)
    lobes = []
    for b in spec.bursts:
        for k in range(max(3, spec.smoke // 2)):
            ang = -math.pi + (k + 0.5) / max(3, spec.smoke // 2) * math.pi
            d = spec.smoke_spread * 0.55 * b.scale
            lobes.append(Lobe(b.x + math.cos(ang) * d, b.y - spec.R * 0.55 * b.scale + math.sin(ang) * d * 0.5,
                              spec.smoke_r * 0.95 * b.scale, rng.randrange(1 << 30)))
    if spec.dust:
        for b in spec.bursts:
            for k in range(5):
                ang = (k / 5) * math.tau + 0.3
                d = spec.dust * 0.55 * b.scale
                lobes.append(Lobe(b.x + math.cos(ang) * d, b.y + math.sin(ang) * d * 0.5 - 2, spec.dust * 0.22 * b.scale,
                                  rng.randrange(1 << 30)))
    shades = spec.smoke_shades if not spec.dust else spec.smoke_shades
    cel_cluster(cv, lobes, shades, alpha, outline=0.9, ink=INK_WARM)
    if warm:
        for b in spec.bursts:
            r = spec.R * 0.55 * b.scale
            flame(cv, b.x, b.y - r * 0.4, r, random.Random(seed + str(b.x)), n=spec.tongues, alpha=alpha * 0.9,
                  up=0.35, levels=(1.0, 0.72, 0.46), ramp=[RED, ORANGE, AMBER])
    else:
        for b in spec.bursts:
            r = spec.R * 0.35 * b.scale
            cv.paint(cv.ellipse(b.x, b.y - r * 0.2, r, r * 0.45), EMBER, alpha * 0.8)


def build(eid, box, origin, spec: Spec, frames: int, fps: int, resolution=1, low_step=2, reduced_frames=6,
          wiring="", notes="", ss=4, duration_ticks=None):
    # The actual renderer samples floor(ageTicks * fps / 20). All variants use
    # a 20 Hz timeline with shared repeated frame references, so lower-detail
    # artwork cannot stretch the cue or leave a bright clamped terminal.
    duration_ticks = duration_ticks or round(frames * 20 / fps) + 1
    if duration_ticks < 3:
        raise ValueError("burst duration must include start, content and terminal")
    std = render_frames(box, origin, frames, lambda cv, t, i: paint(cv, t, spec, eid, "std"), resolution, ss)
    soft = render_frames(box, origin, frames, lambda cv, t, i: paint(cv, t, spec, eid, "soft"), resolution, ss)
    rm = render_frames(box, origin, reduced_frames, lambda cv, t, i: _settled(cv, t, spec, eid, True), resolution, ss)
    rd = render_frames(box, origin, reduced_frames, lambda cv, t, i: _settled(cv, t, spec, eid, False), resolution, ss)
    def clock(fs, step=1):
        visible = fs[:-1]
        return [visible[(int(i * (len(visible)-1) / (duration_ticks-2)) // step) * step]
                for i in range(duration_ticks-1)] + [fs[-1]]
    clips = {"burst": Clip(20, False, clock(std)), "low": Clip(20, False, clock(std, low_step)),
             "soft": Clip(20, False, clock(soft)), "settled": Clip(20, False, clock(rm)),
             "settled_dim": Clip(20, False, clock(rd))}
    return Effect(eid, resolution, clips,
                  {"standard": "burst", "low": "low", "reducedMotion": "settled", "reducedFlashing": "soft", "reduced": "settled_dim"},
                  intent={"standard": "coherent flame tongues, separately timed smoke/debris/dust",
                          "low": "held authored frames, on the identical 20 Hz clock",
                          "reducedMotion": "fixed smoke and ember silhouettes; opacity fade only",
                          "reducedFlashing": "no white core/rays/shock ring; sampled eased amber onset",
                          "reduced": "fixed dark smoke and dim ember, opacity fade only"},
                  wiring=wiring, notes=notes)


def effects(keys=None):
    """Filter definitions BEFORE rendering; deterministic ID order, serial work."""
    out = []
    def add(eid, *args, **kwargs):
        if keys is None or eid in keys:
            out.append(build(eid, *args, **kwargs))
    # small: compact unknown-impact/destroyed burst. Must read inside 12 ticks.
    add("fx.explosion.small", (72, 72), (36, 56),
                     Spec(R=11, rise=6, life=0.55, tongues=6, dust=10, dust_lobes=7, smoke=5, smoke_r=5.2,
                          smoke_rise=12, smoke_spread=6, smoke_delay=0.18, debris=5, debris_kind="dirt",
                          debris_speed=20, shock=0, scorch=8, rays=6),
                     11, 20, duration_ticks=12, wiring="WIRED: impact without disclosed hit (12-tick cue); destroyed (32-tick cue)",
                     notes="Neutral burst: not a hit, not a miss. Cue duration 12 ticks; clip is 11 frames + empty.")
    # blast radius 1.5: shell/mortar/rocket splash impact (not confirmed hit)
    add("fx.explosion.blast_radius_1_5", (140, 110), (70, 80),
                     Spec(R=14, rise=10, life=0.5, tongues=8, dust=40, dust_lobes=12, smoke=7, smoke_r=7,
                          smoke_rise=16, smoke_spread=10, smoke_delay=0.08, debris=10, debris_kind="dirt",
                          debris_speed=34, debris_heavy=0, shock=46, scorch=18, rays=8),
                     11, 20, duration_ticks=12, wiring="WIRED: 1500mt-splash impact without disclosed hit (12-tick cue)",
                     notes="Dust centers reach 40 px; lobes extend beyond their centers. Tactical warning stays authoritative.")
    add("fx.explosion.blast_radius_2", (180, 136), (90, 100),
                     Spec(R=19, rise=14, life=0.5, tongues=9, dust=56, dust_lobes=14, smoke=9, smoke_r=9,
                          smoke_rise=22, smoke_spread=13, smoke_delay=0.08, debris=14, debris_kind="dirt",
                          debris_speed=40, debris_heavy=2, shock=64, scorch=24, rays=10),
                     11, 20, duration_ticks=12, wiring="WIRED: 2000mt-splash impact without disclosed hit (12-tick cue)",
                     notes="Dust centers reach 56 px; lobes extend beyond their centers. Tactical warning stays authoritative.")
    # vehicle light: sharp pop, tall narrow fireball, panels thrown, thin smoke
    add("fx.explosion.vehicle_light", (96, 104), (48, 84),
                     Spec(R=12, rise=12, life=0.4, tongues=7, up=1.0, dust=16, dust_lobes=8, smoke=6, smoke_r=6,
                          smoke_rise=26, smoke_spread=6, smoke_delay=0.12, debris=8, debris_kind="metal",
                          debris_speed=30, debris_heavy=1, shock=22, scorch=12, rays=8),
                     20, 20, duration_ticks=22, wiring="UNWIRED: needs destroyed + prior permitted light-vehicle actor",
                     notes="Proposed 22-tick cue. Quick pop then thin column; sight loss must never trigger it.")
    # vehicle heavy: two-stage — hull breach then magazine cook-off column with a flung turret-like chunk
    add("fx.explosion.vehicle_heavy", (132, 150), (66, 118),
                     Spec(R=17, rise=20, life=0.42, tongues=9, up=1.25, squash=0.8, dust=24, dust_lobes=10, smoke=10,
                          smoke_r=8, smoke_rise=40, smoke_spread=8, smoke_delay=0.16, column=46, debris=10,
                          debris_kind="metal", debris_speed=36, debris_heavy=2, shock=34, scorch=16, rays=10,
                          bursts=[Burst(0, -4, 1, 0.55), Burst(0.16, 2, -1, 1.0)]),
                     30, 20, duration_ticks=32, wiring="UNWIRED: needs destroyed + prior permitted heavy-vehicle actor",
                     notes="Proposed 32-tick cue. Breach pop, 0.16 later a cook-off column; black oily column smoke.")
    # aircraft: airborne breakup — no ground skirt; fragments fall with smoke trails
    add("fx.explosion.aircraft", (128, 136), (64, 52),
                     Spec(R=13, rise=-6, life=0.45, tongues=8, up=0.3, squash=0.95, dust=0, smoke=7, smoke_r=6,
                          smoke_rise=6, smoke_spread=14, smoke_delay=0.06, debris=6, debris_kind="aircraft",
                          debris_speed=26, debris_heavy=3, shock=0, scorch=0, rays=12, ray_len=2.0, airborne=True),
                     26, 20, duration_ticks=28, wiring="UNWIRED: needs destroyed + prior permitted aircraft actor at its authorized altitude",
                     notes="Origin is the airframe point; burning fragments fall below it. No ground dust or scorch.")
    # building small: collapse — flame bursts then low wide dust wall rolling outward
    add("fx.explosion.building_small", (176, 150), (88, 112),
                     Spec(R=15, rise=10, life=0.4, tongues=8, dust=58, dust_lobes=14,
                          dust_shades=(CONCRETE_0, CONCRETE_1, CONCRETE_2, DUST_3), smoke=8, smoke_r=10,
                          smoke_rise=26, smoke_spread=22, smoke_delay=0.2, debris=12, debris_kind="masonry",
                          debris_speed=30, debris_heavy=1, shock=40, scorch=30, rays=8,
                          bursts=[Burst(0, -10, -2, 0.8), Burst(0.12, 12, 2, 0.9)]),
                     30, 15, duration_ticks=40, wiring="UNWIRED: needs destroyed + prior permitted structure actor (footprint ≤2×2)",
                     notes="Proposed 40-tick cue. Two charges then a concrete-dust collapse wall wider than tall.")
    # building large: three staggered detonations, massive rolling dust wall, dark rising column, girders
    add("fx.explosion.building_large", (372, 302), (186, 202),
                     Spec(R=20, rise=16, life=0.36, tongues=9, up=1.0, dust=86, dust_lobes=18,
                          dust_shades=(CONCRETE_0, CONCRETE_1, CONCRETE_2, DUST_3), smoke=10, smoke_r=13,
                          smoke_rise=44, smoke_spread=26, smoke_delay=0.18, column=70, debris=12,
                          debris_kind="girder", debris_speed=38, debris_heavy=3, shock=70, scorch=44, rays=10,
                          bursts=[Burst(0, -34, 6, 0.8), Burst(0.1, 32, 4, 0.8), Burst(0.2, 0, -4, 1.25)]),
                     36, 12, duration_ticks=60, wiring="UNWIRED: needs destroyed + prior permitted structure actor (footprint ≥3×3)",
                     notes="Proposed 60-tick cue. Left/right charges, then central blast and a column; dust wall rolls.")
    return out
