# Main-menu key art review — 28 September, 20:20 UTC

Reviewer: Claude, exact `claude-opus-5-5`. I reviewed the source images at actual
size and root's browser captures in
`work/art/menu-keyart-generated-v1/browser-2026-09-28T15-48-49.957Z/`
(`menu-1600-100`, `menu-1280-100`, `menu-1280-150`, `skirmish-1600`). This is a
candidate decision. It is not final art, and it doesn't complete the menu or the game.

## Decision

- `column-01.png`: **rejected**. The surfaces and lighting are photographic.
- `column-02.png`: **accepted as the shipping menu candidate**. Its current
  integration is **revised**, and a v3 raster is **requested** for one
  composition defect (below).

What works: the hero tank is whole, with its single cannon and both tracks
visible, and no foreground rock covers it. The depth reads cleanly: tank, then
APC and rocket truck, then the hangar and tower base, then mountains, then the
sunset. The finish has broad painted colour planes, olive and mustard armour and
terracotta ground. There is no blue. Silhouettes still read at thumbnail size,
and the palette matches the warm brass console.

## Integration defect (fixed in my boundary)

The browser captures look muddy and zoomed because an old rule written for the
blown-up tank portrait also matched the new `<img>`:
`.command-backdrop img{opacity:.52;filter:sepia(.15) saturate(.6);transform:scale(1.4)}`.
That rule crops the tank's rear and tracks at the right edge, lays the cannon
across the directive copy at 1280, loses the sky and sun, and flattens the
painted colour into brown. The painting is fine; the CSS was wrong.

What I changed (`game.css`, `MenuDiorama.tsx`):

- `.menu-keyart img` overrides the legacy rule: no opacity, filter or zoom.
- The image slides right by `min(10%, 100% − 0.9 × imageWidth)`. Only the dark
  right margin is cropped; the tank's rear, at 88.5% of the image width, stays
  in frame. The left seam is feathered with a CSS mask, not by editing the
  raster.
- Directive copy is limited to three short lines (`max-width:16em`), and
  Deploy is 320px wide at ≤1300px. Predicted at 1280×720: the cannon tip is at
  about x=691, the copy ends at about x=624, Deploy ends at x=688 and the tank's
  front track starts at about x=704. At 1600×900 the cannon tip is at about
  x=864, against the headline's right edge at x=808. **These are geometric
  predictions only.** The capture script's `reach.menu-*` boxes must confirm
  them.
- The image is requested only when `/art/index.json` advertises `keyArt`. If
  it is absent, or the image fails to load, the original canvas diorama renders
  instead, so an unpackaged build makes no request and produces no 404.

## Concrete v3 raster brief (for a later sole-worker export)

1. **Negative space too narrow (primary defect).** The painting keeps only its
   left ~35% dark. The real menu needs about 55%: the nav plate at 4–22% and the
   directive copy at 29–54% of width. At 16:10 (1440×900, 1728×1117 — common
   Mac sizes) the image can't slide right without cutting the tank, so the
   copy covers the tank's front. Keep the same scene, but put the hero tank's
   front at ≥58% of width, facing left toward the menu. Keep the tank ≤34% of
   frame height, its rear at ≤90%, and the rocket truck fully inside the frame.
2. **Insignia ambiguity.** The plain yellow hull triangle reads like the IR
   (Iran) seal. Use a neutral original chevron or number plate, not any
   faction's seal.
3. **World identity.** Add one distant rival silhouette at the horizon line
   (for example an SY technical's dust trail or an IR launcher). Keep it small
   and desaturated, so the scene reads as a contested front and not a single
   army's parade. Don't add foreground obstructions.
4. Keep everything else: painted medium, palette, lighting direction, sky,
   silhouette weights, no text or logos, 1672×941 or larger at 16:9.

Record the exact prompt, the input hash and the output hash in the same way as
`provenance.json`.

## Packaging proposal (root / Mencius)

- Production path: `assets/build/ui/keyart/main_menu.png`, served as
  `/art/ui/keyart/main_menu.png`. `art-plugin.mjs` already serves `ui/` from
  `assets/build`.
- In `artIndex()`, add `keyArt:'ui/keyart/main_menu.png'` only when the file
  exists. In `artFiles()`, include it in the packaged list. The client accepts
  only `ui/…\.(png|webp|jpg)` paths.
- The byte-identical source is in `keyart/main_menu-column-02.png`
  (sha256 `1f3a2ef6…ed00`). Any WebP or size optimization is a packaging step
  and needs its own recorded hash.
