# Environment renderer integration

The renderer now displays actual supply stations, dynamic shipment cargo and
persistent map-object debris using the completed prop sprites. This is a bounded
integration of five new prop IDs, plus the existing supply-field art. It does not
complete all environment placement or the game's remaining visual assets.

## Authorized state and identity

`EnvironmentKnowledge` reads only the current `PlayerSnapshot` and public map.
Its state is presentation memory; it never reads an engine save or simulates an
income, capture, shipment or destruction rule.

| Presentation | Data and binding |
|---|---|
| Supply field | Initial map field plus currently visible snapshot field; `prop.supply_field` uses exact bigint quarter thresholds. An explored but unobserved field has a neutral outline, never assumed full cargo. |
| Supply station | Fixed public position plus disclosed snapshot owner; `prop.supply_station_neutral` and a separate flag at its authored hardpoint. Go allocates runtime station IDs independently of map station IDs, so position keys prevent duplicate unknown/observed nodes. Orders still target the actual Go station ID. |
| Shipment site | Public map shipment location, shown only after exploration; `prop.central_shipment_site` is an empty receiving apron. |
| Shipment cargo | Actual disclosed non-initial Go resource fields. Available cargo uses the existing `high` pile and depletion uses `depleted`; no percentage or timer is invented because initial dynamic capacity is absent from the snapshot. Repeated fields at one site coalesce into one pile, and picking prefers the nonempty field. |
| Light/heavy object | `map.light_prop` / `map.heavy_prop` bind to the corresponding destructible wall sprites. Actual health at or below 50% selects `damaged`; neutral `enabled:false` is not damage. |
| Garrison | Existing `map.garrison` binds to `prop.warehouse_garrisonable`, using the same actual damage state. |
| Permanent debris | Only selected-player `snapshot.rubble` IDs authorize the original public map object's `destroyed` pose. A disappearing actor alone never proves destruction. |

Category-prefixed keys keep field IDs separate from station IDs. Old disclosed
ownership/cargo remains dimmed in explored fog and does not update from hidden
facts. Rewind or a perspective change clears this presentation memory. Unknown
rubble never appears; known rubble persists beyond the short combat effect.
Restoring an older save removes later cargo and wreckage.

All nodes use the shared raised-terrain ground projection and sorted scene.
Sprite footprints are visual depth hints, not collision rules. The prior terrain
rubble update and Go pathing remain unchanged. No object class acquires sight
blocking, cover, a fuel explosion, power networking, salvage or a new objective.
Supply stations remain Go objective records, not invented buildings.

Preflight in `client/src/app/asset-preparation.ts` now requests the real station
asset and checks shipment apron/cargo even when the initial map has no fields.
Disposal releases visual nodes; the shared art-library lifecycle still owns atlas
release. `missingArt` includes unavailable environment sheets.

## Actual browser evidence

Run:

```sh
node client/tests/render/environment-browser.mjs
npm --prefix client run typecheck
npm --prefix client run typecheck:app
npm --prefix client run test:runtime
```

The isolated headed Chromium fixture runs the production renderer and real Go
WASM, with a clearly synthetic map/mission. It uses only validated ordinary
orders and stepping, with no direct state mutation:

| Check | Observed result |
|---|---|
| Engineer captures actual runtime station ID 5 | Owner changes to player 1 at tick 222 and the authored flag follows. |
| Tank destroys light and heavy obstacles | Actual damaged poses observed before destruction; rubble IDs 90 and 91 present at tick 862; sprites remain after the 2.4-second transient-effect lifetime. |
| Hauler exhausts the only supply field | All four initial field states observed: full, high, low, depleted. |
| Go all-fields-depleted shipment timer | A real 6,000,000-unit resource field appears at the shipment site at tick 5110; its actual cargo sprite is created. |
| Move vision away | Disclosed rubble and cargo remain at alpha 0.35 in explored fog. |
| Current save/reload | Exact state hash `1717cf9c48d2cff3d9e93bcf74312960cbd90715a40416f2521be00659d833fa` preserved. |
| Opening rewind | Exact hash `36b399fcfb30ebdc4353a759022a0a40cddf748400eccefec6fb8b3e609e8d1c` restored; future rubble/dynamic fields removed. |
| Disposal | Zero environment nodes, canvases and resident atlas pages. |

Evidence: `work/evidence/environment-integration/browser.json` and the native
1600×900 screenshots in that directory. These pixels were inspected, including
station ownership, both persistent debris piles, shipment cargo and remembered
fog. No browser errors occurred. Both typechecks and all 217 runtime tests passed;
five focused tests cover exact field states, hidden-data refusal, independent
station identity, dynamic-field coalescing, rewind/perspective reset and object
pose semantics.

This capture used simulation **0.3.1**, content hash
`318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612`, and WASM SHA-256
`cafa10367f08dc4e68a75a2e9f4d21587977a776b1e38c744481b31960c8a75c`.
It is recorded evidence for that build, not a claim that older saves load under
later simulation versions. The fixture's supply facility remains the existing
development fallback (`missingArt: ["supply"]`); the environment nodes themselves
use their real authored sheets.

The full environment journey was also rerun successfully on **0.3.2** with
WASM SHA-256 `7b9c04b05eecb3697c386ef4f59944efee78c6f5073e211c96fa4c11c6f355aa`.
That run additionally reveals the visibly empty receiving apron at tick 900
before real shipment cargo appears at tick 5148. Its exact current-save hash
`779ce96c312ad38770c911cf77491694817938c6f594e0d6a2ecbf26dc4aa18f`
and opening hash
`e97e3be0a14966352fcdce72e1c1afb1547e2a32ce8826744cdd4dc881b3a1a3`
both restore exactly. The separate report and inspected empty-apron contact are
in `work/evidence/environment-integration/current-0.3.2/`; the prior capture is
preserved. The existing renderer browser regression also passed all 14 groups
on 0.3.2, including selection, minimap geometry, combat, rewind, aircraft
presentation, graphics-context recovery, repeated disposal and independent
hull/turret ground shadows (`renderer-0.3.2.json`). This is functional evidence,
not a performance measurement.

## Remaining environment work

All 21 new prop assets have separately passed production pixel checks and native
review, recorded in `work/art/environment-roster/production-summary.md`. This
renderer slice binds five of them. The other sixteen require explicit map/editor
placement or a reviewed public styling contract. It does not infer hidden mission
tags, dress every map automatically, or insert visual barriers into legal paths.

A proposed separate public presentation contract is in
`docs/environment-sidecar-proposal.md`. It is not implemented or accepted content.
