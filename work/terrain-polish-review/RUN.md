# Author-only fog validation course

2026-09-29: authored, not bundled, typechecked or browser-run. Root owns execution
in the serial browser lane. The independent Go matrix was not interrupted or
modified. `inputs/lock.json` freezes both exact reviewed TerrainBaker versions
and their three runtime geometry/material helpers. The fixture does not import
the mutable live terrain implementation.

```sh
node client/tests/render/terrain-fog-polish-browser.mjs \
  --product /absolute/frozen/product \
  --out /absolute/new/fog-chromium \
  --engine chromium
```

Repeat serially with new output directories and `--engine firefox`/`webkit`.
Chromium defaults to the installed headed Chromium channel; other engines to
headless. `--headless true|false` is explicit. Playwright is used because the
browser plugin is unavailable. The runner refuses existing evidence directories
and records browser/GPU/fragment-precision, source/bundle hashes and every served
PNG hash. It launches no native host, Go compiler or simulation runtime.

The course compares actual Pixi fog-only RGBA alpha over identical35×35 flat
and raised public geometry, across nine chunks, three zooms and two subpixel
translations. It asserts no candidate pixel alpha below baseline, no formerly
opaque pixel becoming translucent, all-clear transparency, a visible interior
patch, identical geometry/indices/bounds and identical results from the shared
public picker. Reused bitvectors exercise unknown→clear→explored→mixed edges→
mixed corners→missing vectors→clear→edge. Hidden fragments update before being
shown again. Disposal asserts all fragment meshes, baker-owned textures and
canvases are released; rebuilds use fresh bakers.

Macro screenshots are **separate** full-material baseline/candidate views with
fog disabled and actual frozen terrain PNGs. A missing required image fails the
course, even though the normal TerrainBaker has a material fallback. No pixel
luminance inequality or subjective-art pass is inferred from those screenshots.

CPU samples time actual `setFog` across36 retained chunks and196 wanted chunks
derived from the existing256²-map,1600×900,zoom0.45 camera/padding formula. Half
the fragments are hidden while all remain resident, matching the update scope.
Two warmups and five samples per source/scope are recorded. Geometry setup is
outside the measured interval; real terrain textures are unnecessary for fog
updates and are not baked in this course. This is a shared-host diagnostic,
without a performance threshold, full-frame measurement, memory-peak claim or
reference-hardware qualification.

Limits: synthetic geometry is a presentation test, not authored Go gameplay.
The picker comparison proves unchanged shared geometry/picker behavior, not a
new actual pointer course. Anti-aliased edge comparisons may expose a real
precision issue or a fixture extraction issue; retain the first failure and
inspect its exact pixel rather than adding a tolerance silently. No browser
pass is claimed before the recorded runner completes with zero errors.
