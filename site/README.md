# Frontline Command project site

A static, dependency-free website that presents the game and invites contributors.
It is not deployed; publishing it (for example with GitHub Pages) is a separate,
explicit decision.

| Page | Purpose |
|---|---|
| `index.html` | Landing page: pitch, factions, design principles, honest status, contributor tracks |
| `factions.html` | Doctrine, trade-offs, mechanics, abilities and full rosters for all four factions |
| `mechanics.html` | Economy, construction, orders, combat, fog, air, missiles, abilities, repair, veterancy, victory |
| `modes.html` | Tutorials, four campaigns, co-op, eight launch maps, multiplayer, editor, accessibility |
| `engine.html` | Architecture, determinism, rules-as-data, art pipeline, repository map, verification |
| `contribute.html` | Setup, open work by area, ground rules and production gates |

## Preview

Serve the repository root so repository links (`../docs/...`) resolve:

```sh
python3 -m http.server 8790 --bind 127.0.0.1
# open http://127.0.0.1:8790/site/
```

## Rebuild generated inputs

```sh
node site/scripts/build.mjs
```

Requires Node 18+, `cwebp` and `ffmpeg`. The script regenerates, from repository sources:

- `data/rules.js` from `pkg/content/rules.json` (rosters, weapon, armor and building tables)
- `img/units/*` and `img/buildings/*` from rendered frames in `assets/build/frames`, trimmed,
  with the team-colour layer kept separate so the page tints it with faction paint
- `img/maps/*` tactical thumbnails drawn from each launch map's tile data in `content/maps`
- `img/keyart-*`, `img/shot-*` from the menu key art and recorded in-game screenshots
- the inline icon sprite and the shared nav and footer in every page (`partials/`)

Re-run it after changing rules, art or partials. Units without a finished render show
an "Art wanted" card that links to the contribution page, so art coverage on the site
always matches the repository.

## Configuration

Set `repoUrl` in `js/config.js` once the public repository exists. Links marked
`data-repo` then point at the hosted files; until then they use relative paths.

## Design notes

- Visual language follows the game console: warm charcoal and gunmetal, brass hairlines,
  one amber accent, square corners. Faction paints only identify factions.
- Dark only, because the game's command interface is charcoal by design.
- Fonts are the game's own (Barlow, Big Shoulders Stencil, IBM Plex Mono, SIL OFL),
  self-hosted in `fonts/`. Icons are Phosphor (MIT), vendored in `vendor/phosphor/`.
- Motion is limited to the hero entrance and scroll reveals, and is disabled under
  `prefers-reduced-motion`.
- Figures quoted on the pages (art coverage, campaign courses) come from
  `docs/implementation-status.md` and `docs/release-blockers.md` as of 1 October 2026.
  Update them when those records change.
