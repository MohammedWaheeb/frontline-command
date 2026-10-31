# Frontline Command project site

A static, dependency-free website that presents the game and invites contributors.
It is deployed to Cloudflare Pages at https://frontline-command.pages.dev
(project `frontline-command`). Redeploy after edits with:

```sh
npx wrangler pages deploy site --project-name frontline-command --branch main --commit-dirty=true
```

The game itself remains local-only; the site links visitors to the source
repository with build-from-source steps.

| Page | Purpose |
|---|---|
| `index.html` | Landing page: pitch, battle HUD tour, menus, factions, design rules, honest beta status, install |
| `factions.html` | Doctrine, trade-offs, mechanics, abilities and full rosters for all four factions |
| `mechanics.html` | Economy, construction, orders, combat, fog, air, missiles, abilities, repair, veterancy, victory |
| `modes.html` | Campaign, tutorials, six skirmish battlefields, co-op, multiplayer, map editor, accessibility |
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

Requires Node 18+ and `cwebp`. The script regenerates, from repository sources:

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
- Motion is limited to the hero entrance and headline decode, scroll reveals,
  the HUD tour focus and the faction spotlight. All of it is disabled under
  `prefers-reduced-motion`.
- Scope and figures follow the 31 October 2026 closed beta
  (`docs/beta-readiness-2026-10-31.md`): four campaigns, five tutorials, six
  skirmish battlefields, practice, both co-op scenarios, 1-4 commanders and the
  map editor. Unit and weapon counts render live from `data/rules.js`.
- Screenshots show the beta interface. Sources are kept in
  `work/site-2026-10-31/captures/`; `stage-battle.mjs` there re-stages the
  practice-range fight used for the battle HUD capture.
- Full rebuilds (`node site/scripts/build.mjs`) take unit and building renders
  from `assets/build/frames` when present, otherwise from the packed sprite
  atlases in `assets/build/sprites`. `node site/scripts/build.mjs --pages` only
  re-injects the icon sprite, nav and footer.

## React islands

The home page enhances a few sections with React and three
[React Bits](https://reactbits.dev) components (MIT + Commons Clause, vendored in
`app/src/reactbits/` with their license): DecryptedText on the hero headline,
CountUp on verified totals and SpotlightCard on the faction cells, plus an
interactive tour of the battle HUD. Every island reads its content from static
markup that already works without JavaScript. Rebuild after editing `app/src/`:

```sh
npm --prefix site/app ci
npm --prefix site/app run build
```

This writes `js/islands.js` and `css/islands.css`; the deployed site stays static.
