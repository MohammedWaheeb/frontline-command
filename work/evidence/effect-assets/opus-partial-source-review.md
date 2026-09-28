# Claude partial FX source review — 2026-09-28

Read-only review of the five files in `work/art/effects-opus-v1/src`, against
`client/src/content/effect-assets.mjs`, `docs/effect-assets.md` and the actual
`CombatEffects` frame selection. No source was edited; no generator module was
imported, frame rendered, pack created or browser launched. Python AST parsing
of all five files succeeded. This establishes syntax only, not dependency or
execution success, visual quality, accessibility approval or 132-effect coverage.

## Concrete findings

1. **The claimed equal variant durations are not equal.**
   `fam_explosion.py:59–70` computes rates using the requested visible-frame
   count, but `fxkit.py:350–356` appends an additional transparent frame.
   Downsampling and integer FPS rounding add another discrepancy. The actual
   renderer uses `floor(elapsedTicks * fps / 20)` and clamps to the final frame;
   it does not rescale animation time to the cue duration.

   | Effect | Standard frames/FPS | Low frames/FPS | Settled frames/FPS |
   |---|---:|---:|---:|
   | Small / either splash | 12/20 = 0.600 s | 7/10 = 0.700 s | 7/11 = 0.636 s |
   | Vehicle light | 21/20 = 1.050 s | 11/10 = 1.100 s | 7/6 = 1.167 s |
   | Vehicle heavy | 31/20 = 1.550 s | 16/10 = 1.600 s | 7/4 = 1.750 s |
   | Aircraft | 27/20 = 1.350 s | 14/10 = 1.400 s | 7/5 = 1.400 s |
   | Building small | 31/15 = 2.067 s | 16/8 = 2.000 s | 7/3 = 2.333 s |
   | Building large | 37/12 = 3.083 s | 19/6 = 3.167 s | 7/2 = 3.500 s |

   These are complete clip durations including the transparent terminal frame,
   not claims about the exact last visible pixel. Several generated endpoints
   are already blank. Fix or explicitly document timing from the final sampled
   frames and their real 20 Hz cue lifetime; test standard and accessibility
   variants at that clock. Do not lengthen authoritative warning deadlines to
   accommodate art.

2. **The small soft clip does not sample its advertised gradual ignition.**
   The first nonzero sample of the 11-frame small clip is `t=0.1`.
   With `life=0.55`, local fire time is `0.1818…`, beyond the soft onset end
   `0.18` in `detonation.py:165–180`. Thus the first sampled flame has onset 1
   and full authored alpha, following an empty first frame. The two 11-frame
   splash clips use life 0.5, so their first sample is even later at 0.2.
   Their softer palette still differs from standard, but the source's gradual
   onset claim is false for these samples. Sample the intended ramp rather
   than trusting its continuous formula. White removal alone does not certify
   reduced flashing. Frame-seeded flame topology also changes at each sampled
   frame (`detonation.py:168`), requiring actual temporal review.

3. **The existing preview does all eight effects before filtering.**
   `preview.py:19–21` calls eager `fam_explosion.effects()` and only then checks
   the requested ID substring. A request for `small` also renders every large
   multi-burst frame and all accessibility variants. This is a concrete
   iteration-cost trap. Filter specifications before building, or yield one
   selected effect at a time when the isolated packer is implemented.

## Incomplete integration and bounded risks

- Only the eight explosion definitions exist here. There is no pack serializer,
  atlas writer, `effect.json`, `fx/index.json`, byte/hash descriptor, page-bound
  checker or edge-touch assertion in these five files. The comment at
  `fam_explosion.py:20–21` promises a future packer; it is not an implemented
  check. This is expected partial-work status, not 132 complete assets.
- Do not directly serialize the `Effect` dataclass. Its `intent`, `wiring` and
  `notes` are useful provenance, but the runtime rejects unknown metadata keys.
  Emit only `format,id,resolution,pages,clips,variants`; keep provenance in the
  manifest/Markdown. Serialize a `None` terminal as an actual valid transparent
  frame/page region, not `null`.
- Current frame origins are consistent: `Canvas` takes world pixels and applies
  `resolution * supersampling` once; `Frame.ox/oy` are multiplied by resolution
  once (`fxkit.py:106–118,343–356`). Crop origins must subtract the exact crop
  left/top in atlas pixels. The runtime then normalizes by frame width/height
  and scales by `1/resolution`. Preserve this chain. The introductory sentence
  claiming primitive inputs are output atlas pixels contradicts the actual
  world-coordinate implementation and should be corrected before reuse.
- The runtime bounds crop origins to `[-w,2w]` and `[-h,2h]`. Tightly cropped
  drifting smoke can leave the world anchor outside that range; a future
  packer must validate it and keep sufficient transparent padding if needed,
  rather than silently shifting the origin. This is a required check, not an
  observed rejection: no frames were generated in this review.
- Large dust canvases need real edge checks. Dust lobe centers move toward the
  configured skirt radius, then each lobe adds up to roughly `0.42 * 1.2`
  times that radius before polygon jitter/outline (`detonation.py:91–119`).
  Consequently a comment saying the skirt stops at `spec.dust` understates
  possible painted extent. The central building-large burst has scale 1.25
  and dust 86: a conservative horizontal bound exceeds its 130-pixel canvas
  half-width. Actual deterministic angles and alpha may reduce that bound;
  clipping has **not** been pixel-proven. Edge assertions and native review
  must settle it, including all reduced variants.
- `Spec.fall` currently reaches `pass` (`detonation.py:175–176`). No supplied
  effect sets a nonzero fall, so this is a dormant unsupported parameter, not
  a defect in the eight present definitions. Do not advertise that parameter
  as implemented when expanding the set.
- The contact-sheet helper composes straight RGBA onto an RGB background with
  an alpha mask; this is consistent. It is a review surface, not the actual
  renderer. Its cell sizing assumes the current uncropped common origins;
  future variable crops need a union of origin-relative extents to avoid
  clipping the contact sheet itself.

## Compositing and resource review

The canvas stores premultiplied RGBA. `paint` computes ordinary source-over,
`fade` scales both premultiplied color and alpha, and `image` averages those
values before unpremultiplication. I found no source-level double-alpha or
black-fringe bug in that chain. Repeated translucent shade passes can yield
more total opacity than a single layer at the supplied alpha, so visual fade
shape still needs review; that is not evidence of incorrect compositing.

At the largest current 260×230, resolution-1, SS-4 canvas, the float32 RGBA
buffer alone is **14.60 MiB**. Each paint operates over the entire canvas and
allocates full-size multiplication/addition intermediates (`fxkit.py:158–161`).
Many smoke lobes, dust lobes and debris trails each perform several such paints.
The same canvas at resolution 2 costs four times as much. This is a build-time
memory-bandwidth risk, not a measured runtime/browser regression. The largest
effect's 84 unique uncropped output images retain about **19.16 MiB** at
resolution 1; low frames are references, not duplicate images. Keep generation
serial and bounded, measure before scaling to 132 effects, and consider
region-local painting or reusable working arrays if necessary.

The pack must separately obey the actual runtime's eight-page / 2048² /
8 MiB-per-PNG limits and 32 MiB residency reservation budget. Retaining
uncropped canvases is not a valid substitute for a verified bounded pack.

## Source identity

| File | SHA-256 |
|---|---|
| `contacts.py` | `a2bdd90f5c4aee61a4ab0b056682451ee3dac60d64afc2623c72cbf1603a47c5` |
| `detonation.py` | `189ed7007d4e9601693397bc891c2559d1c93cfbd45d6c80c17959252dce07f4` |
| `fam_explosion.py` | `78f5025a67187b967295bf9c060d9e6e38d59b934e3fcd1665f6911ab742d175` |
| `fxkit.py` | `22b48ca1d5ac68a4429ed1b7a6ef254a24d3e2c4c2c27ccf1b406aa8a90eed49` |
| `preview.py` | `6f29f5d757799258b9e2d0a8a4993671b094a8dcfb5ff83a4d0db37044570eaf` |

Recommended next gate after the quiet window: one selected small explosion,
all five variants, exact contract serialization and terminal/origin/edge checks;
then one large multi-burst effect for memory and clipping evidence. Review
native frames and animation before extrapolating to the remaining 124 IDs.
