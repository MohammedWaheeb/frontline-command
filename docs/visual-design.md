# Visual design system and art integration contract

Owner: Claude Code (`claude-opus-5-5`), assignment 01. Status: **tokens v2 and the
sprite/manifest contract below are stable for integration**. Art coverage is
partial and tracked in `assets/manifest/summary.md`; see "What exists" at the end.

## 1. Direction (2026-09-28 correction)

The earlier blue dashboard concept is withdrawn. Frontline Command is a stylized,
classic C&C-inspired RTS with an original **military command console**:

- **Shell materials:** charcoal and warm gunmetal plate with machined bevels,
  recessed wells, seams and occasional bolts. Wear is restrained and stays quiet
  behind labels.
- **Accents:** olive paint, aged brass bezels, restrained amber for active and
  progress states. Red is only for real danger (damage, missile impact, defeat).
- **No blue/cyan chrome**, neon glows, gradient wallpaper, floating analytics
  cards, pill buttons or giant marketing headings. Blue appears only as a
  tactical team colour or inside artwork.
- **Battlefield dominant:** at least 70 % of the frame at 1600×900 and
  1280×720. One connected right-hand command column (credits, minimap, utility
  buttons, category tabs, illustrated cameo grid, continuous power gauge, queue,
  strategic charge) plus a shaped selection tray at the bottom. A short
  resource "shoulder" joins the column along the top edge. There is no
  full-width web header.
- **Art does the work:** production buttons are illustrated cameos rendered from
  the real unit and building models, not text cards. Portraits come from the same
  models. Faction identity comes from silhouettes, paint and original insignia.

References studied (not shipped, never traced): `work/claude/06-rts-reference-study.md`
and the local study copies in `work/art/references/`. The comparison ledger is
in `work/claude/01-report.md`.

## 2. Tokens

Single source: `client/src/design/tokens.json`. Generated outputs (do not edit):
`client/src/design/tokens.css` (custom properties, `@font-face`, `.fc-t-*` type
classes) and `client/src/design/tokens.ts` (typed `tokens` object). Rebuild with
`node client/scripts/build-tokens.mjs`.

| Group | Key tokens | Use |
|---|---|---|
| Surfaces | `--fc-color-surface-0…4`, `-well`, `-scrim` | Warm charcoal layers; `well` for recessed displays |
| Metal | `--fc-color-metal-dark/base/light/edge/bevel-hi/bevel-lo/seam` | Console plate, bevels, seams |
| Accents | `--fc-color-olive-*`, `--fc-color-brass-*`, `--fc-color-amber-*` | Paint, bezels, active/progress |
| Text | `--fc-color-text-1/2/3/disabled/inverse/stencil` | Warm off-white hierarchy |
| Status | `--fc-color-status-ok/info/warn/danger/critical` (+ `_dim`) | Always paired with a symbol and text |
| LED | `--fc-color-led-on/green/red/off/glass` | Readouts, power gauge |
| Resources | `--fc-color-resource-credits/power/power-low/power-critical/supply/energy/income` | Distinct values, each with its own icon |
| Team | `--fc-color-team-standard-0…7`, `data-palette="cvd"` swaps to the colour-vision-safe set; `relation-*` for self/ally/enemy mode | World only |
| World | `--fc-color-world-*` | Selection, orders, placement, ranges, missile warning, fog |
| Type | `--fc-type-<role>-size/-line`, classes `.fc-t-<role>` | Roles below |
| Layout | `--fc-hud-*` (switch to the `hud_1600` set at ≥1500×840), `--fc-ui-scale` | Every HUD metric multiplies by UI scale |
| Motion | `--fc-dur-*`, `--fc-ease-*`; `data-reduced-motion` or the OS setting collapses them | Opacity/colour only when reduced |
| Materials | `--fc-material-console-plate/well/button/cameo-frame/brass-bezel/noise` and `-slice` | 9-slice raster chrome (section 4) |

### Typography

All fonts are OFL-1.1, bundled in `assets/fonts/` with licence text; no CDN.

| Role | Font | Size/line at scale 1 | Use |
|---|---|---|---|
| `display` | Big Shoulders Stencil Display 800 | 52/52 upper | Menu titles, victory/defeat |
| `title` | Big Shoulders Stencil Display 700 | 32/34 upper | Screen titles |
| `heading` | Barlow Condensed 700 | 20/24 upper | Section headings |
| `panel` | Barlow Condensed 700 | 14/16 upper, 0.12em | Console plate labels |
| `label` | Barlow Condensed 600 | 13/16 upper | Field labels, tabs |
| `cameo` | Barlow Condensed 700 | 13/14 | Cameo names |
| `body` / `body_sm` | Barlow 500 | 15/21, 13/18 | Tooltips, briefings |
| `caption` | Barlow 600 | 12/15 | Timestamps, sub-lines (minimum text size) |
| `readout` | Share Tech Mono | 22/24 | Credits and clock LED readouts |
| `numeric` | Share Tech Mono | 15/17 | Costs, HP, timers |
| `hotkey` | Share Tech Mono | 11/12 | Key caps |
| `subtitle` | Barlow 600 | 20/28 (scales to 1.6×) | Captions/subtitles |

No text below 12 px at UI scale 1.0. Everything scales with `--fc-ui-scale`
(0.85–1.5). The subtitle scale is separate (1.0–1.6).

## 3. Components and states (for the React product)

| Component | Anatomy | States |
|---|---|---|
| `CommandColumn` | Brass-bezel credits readout, minimap well, utility row (repair, sell, power toggle, beacon), category tabs, cameo grid with continuous power gauge, queue strip, strategic charge foot | Collapsed-to-icons at scale ≥1.35 if height is short; never overlays a legal target |
| `ResourceShoulder` | Power, Army Supply (used + reserved/cap), Command Energy, clock, objectives, menu, latency | Low power: amber meter + power icon + "LOW POWER" text |
| `ProductionCameo` | Illustrated cameo, name plate, cost, hotkey cap, queue count, progress wipe | `available, hover, pressed, focus, queued, building, paused_low_power, paused_prerequisite, unaffordable, locked_tier, cap_reached, no_service_slot, producer_disabled, queue_full, ready_to_place`. Each non-available state shows a **text reason**, never colour alone |
| `QueueStrip` | Active slot with progress, five unpaid waiting slots | Paid/unpaid is labelled |
| `PowerGauge` | Vertical LED column, demand marker | Normal, low, critical |
| `SelectionTray` | Illustrated portrait, name/role/counter line, unit plates with HP/ammo/veterancy, subgroup tabs, stats | Single, multi, mixed (subgroup tabs), transport contents |
| `CommandGrid` | 5×3 tactile buttons with key caps; abilities show energy cost and cooldown sweep | `normal, hover, pressed, active, focus_visible, disabled` (+ tooltip reason) |
| `AlertPlate` | Symbol, message, sub-line, timestamp; click centres the camera without losing selection | `critical, warning, info, ack`. Repeats at one location bundle for 6 s |
| `Caption` | Speaker tag + line | Never hidden by effects; scale 1.0–1.6 |
| `WarningBanner` | Symbol, title, cause, ETA | Missile impact, strategic launch, defeat countdown |
| `Tooltip` | Role and counter first, then numbers, then the failure reason | — |
| Menus | Console plate panels over key art | Buttons, segmented controls, sliders, toggles, key-bind rows, all with visible focus |

**Focus:** a 2 px `--fc-color-focus-ring` outline, 2 px offset and a
`--fc-color-focus-halo` glow, visible in every menu. Text entry disables
battlefield shortcuts. **Hit targets:** at least 28 px × UI scale. **Colour
independence:** warnings, low power, ambush-ready, lost service and deployed
states each carry a symbol and text.

Icons: `assets/ui/icons/fc-icons.svg`, a 24-unit grid with 1.75 stroke and
`currentColor`. Filled glyphs are reserved for status. Faction insignia and the
game mark: `assets/ui/emblems/fc-emblems.svg` (`em-US`, `em-IR`, `em-SY`,
`em-SA`, `fc-mark`). All are original geometric designs with no real national,
military or extremist symbols.

## 4. Chrome materials

Generated by `assets/pipeline/ui/gen_chrome.py` into `assets/build/ui/chrome/`
(`@2x` plus `@1x`; metadata in `chrome.json`):

| File | 9-slice (2x px) | Use |
|---|---|---|
| `console_plate` | 36 | Command column, tray, menu panels |
| `well` | 16 | Recessed minimap/readout/cameo wells |
| `button` | 12, 5 stacked 64×64 states: normal, hover, pressed, disabled, active | Tactile buttons |
| `cameo_frame` | 10 | Cameo border (transparent centre) |
| `brass_bezel` | 20 | Credits readout, emblem, strategic charge |
| `metal_noise` | 256 tile | Overlay at 10–18 % |

## 5. Battlefield sprite contract (renderer)

Full details and commands are in [asset-pipeline.md](asset-pipeline.md). The
essentials:

- **Projection:** 2:1 dimetric. Screen `sx = (x − y) · 32`, `sy = (x + y) · 16`
  at 1×, with x, y in tiles (`millitiles / 1000`). Art is authored at 2×
  (`@2x` atlases, 128×64 per tile); `@1x` atlases are derived.
- **Heading index** `d` of `N` means sim heading `2π·d/N`, measured from +x toward
  +y. `d = 0` faces screen lower-right. Vehicles use 16 hull headings and 32
  turret headings; infantry 8; aircraft 16.
- **Per asset:** `assets/build/sprites/<id>/<id>.sprite.json` (schema
  `fc-sprite/1`) lists the frame size, `anchor_2x` (sim position at ground),
  states (directions, frames, fps, loop, `progress_driven`), aliases (for
  example `sell` = `construct` reversed, `pack` = `deploy` reversed),
  overlays, footprint, `turret_pivot_mt`, squad member offsets, air data and
  per-frame `hardpoints_2x_rel_anchor` (muzzle, health bar, launch). Atlases are
  PixiJS 8 spritesheet JSON with frame names `<state>/dDD_fFF`.
- **Layers and draw order:** (1) `shadow`: black with alpha, drawn on the ground
  layer at 0.46 opacity; aircraft shadows are displaced by altitude along the
  sun vector (`asset-pipeline.md` §Air). (2) `beauty`: normal blend, depth-sorted
  by `x + y`. (3) `team`: grayscale shading, drawn over beauty with
  `tint = player colour`. The turret is drawn after the hull at
  `anchor + project(rotate(turret_pivot_mt, hullHeading))`.
- **Progress-driven states** (`construct`, `deploy`, `charging`, …) choose the
  frame from authoritative progress: `frame = min(N − 1, floor(progress · N))`.
  Animation never decides gameplay.
- Wrecks and rubble have no team layer. Scorch decals are part of their beauty frames.
- **Reference compositor:** `assets/pipeline/tools/compose_scene.py` implements
  exactly this contract. The concept screenshots are rendered with it from the
  packed atlases.

## 6. Manifest contract

`assets/manifest/asset-manifest.json` (schema `fc-asset-manifest/1`), generated
from the design document by `assets/pipeline/manifest/gen_manifest.py`. Each
entry has `id, category, faction, name, source, license, editable_origin,
output, spec (states/frames/directions/sizes), status, blocker`. Status is
computed from files on disk. `sample` is a rendered first-pass production
candidate awaiting art approval; `final` is only used for licensed fonts. The
product must treat anything not `sample`/`final` as missing art and must not
present a code placeholder as finished art. The integrity report is
`work/art/check-report.md`.

## 7. What exists (keep current)

See `work/claude/01-report.md` for the exact rendered inventory, check results
and remaining gaps. The concept screens are in `work/art/concepts/`, with
screenshots in `work/art/concepts/screenshots/`.
