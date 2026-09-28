# Environment prop source handoff

This document records the original source handoff. All 21 previously missing
manifest prop IDs now have original procedural model sources and specifications.
The subsequent completed render/native review is recorded in
`work/art/environment-roster/production-summary.md`; the bounded live renderer
integration and remaining map-placement work are documented in
`docs/environment-renderer-integration.md`. The source-stage evidence below is
historical and does not itself certify game placement. Codex authored
them during the explicit Claude quota takeover, using Claude Code
`claude-opus-5-5`'s fclib and geometry recording contracts. No external meshes,
textures, logos or real-world insignia were used.

The five existing samples—supply field, sandbags, rocks, rubble cover and shrub—
and their shared `props.py` source were preserved byte-for-byte. Hash guards
are in `work/art/environment-roster/prop-source-lock.json`. Existing terrain,
maps, missions, renderer, shared helpers and manifests were not edited.

## Exact source inventory

| Family | New prop IDs | Required presentation |
|---|---|---|
| Resource landmarks | supply_station_neutral, central_shipment_site | Neutral kiosk/handoff yard; open marked receiving apron |
| Vegetation | palm, forest_edge_scrub | Open crown/trunk silhouette; broad low cover patch |
| Industrial dressing | fence_chainlink, concrete_barrier, container_stack, fuel_tanks, power_pylon | Open diamond fence, low barrier, ribbed container mass, horizontal tanks and open lattice |
| Enterable structures | warehouse_garrisonable, ruined_house_garrisonable | Open entrance and exactly two capacity plaques; intact/damaged/destroyed |
| Sealed structure | decor_building_nongarrison | Crossed shutter, no entry/capacity hint; intact/damaged/destroyed required by inventory |
| Traversal and wreck | bridge_permanent, wreck_decor_vehicle | Permanent deck module with rail variants; unselectable burned vehicle scenery |
| Named destructibles | destructible_wall_hp_light, destructible_wall_hp_heavy | Distinct light screen/heavy concrete mass; intact/damaged/destroyed |
| Objective candidates | relay_objective, command_relay_objective, depot_objective | Cabinet/dish relay, larger command enclosure, stores/loading canopy |
| Editor-only | spawn_marker_editor, region_marker_editor | Flat heading arrow and region corners; no shadow or live actor |

Every prop has four orthogonal headings. Required manifest states are preserved.
Bridge adds `deck`, `edge_left` and `edge_right` to the fully railed `idle` module,
so wide crossings need not acquire internal rails across legal lanes. Left/right
mean local Blender Y negative/positive before rotation, not screen left/right.
Actual tile adjacency determines placement and orientation.

Five three-state props have `idle→intact`, `wreck→destroyed` and
`rubble→destroyed` aliases. Destruction removes every upright intact mesh and
leaves a shallow debris plate; it does not create new collision. The pre-ruined
house's starting state is still `intact` gameplay, with an already broken roof.
No prop carries a team-color material. Ownership flags, labels and capacity
badges belong to authorized renderer data, not invented asset-side state.

## Gameplay constraints and renderer handoff

Actual Go object classes are defined in `pkg/content/objects.go`:

| Go object class | Canonical proposed skin | Footprint / HP / capacity |
|---|---|---|
| map.light_prop | prop.destructible_wall_hp_light | 1×1 / 150 / no passengers |
| map.heavy_prop | prop.destructible_wall_hp_heavy | 2×2 / 600 / no passengers |
| map.garrison | prop.warehouse_garrisonable | 3×3 / 900 / two squads |

The ruined house is an alternate **garrison** skin only if the renderer has an
explicit public styling choice. It is not a second gameplay class. The source
specs carry `gameplay_binding` documentation for those four candidates. The
shared packer does not publish that extra field: coordinator integration must
make an explicit reviewed mapping. No Go rules are derived from art metadata.

Important: those objects block ground movement, but **object class alone does
not block sight**. Go line-of-sight uses cliff terrain and designated
`sight_blocker` tiles. All authored heavy-object centers inspected at handoff
had that flag false. Keep this rule: heavy shapes communicate mass/collision;
tall opaque screens must not be added to otherwise clear sight paths. Art never
grants cover, concealment, detection, income or a secondary fuel explosion.
Forest-edge dressing belongs on actual cover terrain. Plain vegetation and
fence/barrier decoration must not suggest a hidden cover bonus or close an
actually traversable mandatory route.

Destruction changes the original Go footprint to rubble and clears its sight
blocker. Render persistent debris only after the selected player's authorized
`snapshot.rubble` disclosure, preserving fog memory and replay reset behavior.
A generic missing actor is not proof of destruction. Use actual authorized
health/state for damaged plates; hide entry/capacity overlays after destruction.

The station is a real `ObjectiveStation`, not a production building or new
collider. Bind it only to a disclosed `snapshot.stations` record and retain the
owner flag separately. The shipment apron may sit at the public map shipment
location, but its cargo must come from actual Go `shipment_arrived` / resource
field data. Current renderer code creates supply-field visuals from initial
`map.fields`; dynamic shipment fields also need creation from permitted snapshot
fields, rather than a fabricated cargo timer. Empty apron art must not claim a
shipment is already available.

Relay/command/depot candidates cannot silently replace an authored mission's
actual target type, HP or footprint. No private mission tag may select or reveal
an enemy objective. These IDs need a reviewed public placement contract before
use. Pylons do not invent a power network; fuel tanks do not explode for damage;
decorative wrecks do not grant salvage. Editor markers stay in editor workflows.

## Source-stage evidence and original render gate

The full Blender-free audit passes 21 props / 136 source poses and 136 reverse
comparisons, finite transforms, unique mesh names, valid hardpoints and
conservative camera/shadow bounds. Seven focused semantic tests pass, covering
exact missing roster, immutable legacy samples, permitted Go bindings,
enterable/sealed structures, complete destruction, permanent bridge rail
variants, editor-only marks and the absence of team/faction state.

```sh
work/art/.venv/bin/python work/art/environment-roster/generate-specs.py --check
work/art/.venv/bin/python work/art/environment-roster/test-prop-source.py
work/art/.venv/bin/python work/art/environment-roster/check-prop-source.py
```

`prop-source-check.json`, `prop-semantic-tests.log` and
`prop-source-previews/native-overview.jpg` record these checks. The native
overview and state-variant contacts were inspected. They are flat primitive
design previews, with no Cycles material/bevel/AO or final alpha assurance.

`work/claude/05-next-render-request.md` requests six representative families,
60 selected poses. Only the sole Blender worker may render them after root
approval. Actual pixel integrity and native art review remain pending, followed
by all 21 finished sprite sets and real 1600×900 / 1280×720 map views: base,
resource expansion, industrial district, cover, crossing and combat. This lane
does not complete remaining terrain surfaces, loading/briefing illustrations,
map dressing or the full game presentation.
