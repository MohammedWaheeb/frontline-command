# Gameplay IDs and art bindings

`client/src/render/art-id.ts` maps Go entity identities to the approved art
inventory. This is a presentation mapping only: no rule, footprint, cost,
service capacity or collision property comes from the asset name.

| Go building ID or role | Authored asset suffix |
| --- | --- |
| depot | repair_depot |
| turret | gun_turret |
| abm | interceptor_battery |
| strategic | strategic_site |
| SY.workshop_air | SY.air_workshop |

Other common buildings retain their names and select the owner's faction skin.
Faction-specific producers retain their explicit faction identity. All 75 Go
unit IDs and 61 building/faction variants are checked against the actual
approved manifest, with no duplicate building mapping. Both battlefield actors
and build/selection illustrations use this shared resolver.

Explicit neutral object mappings are `map.light_prop` to
`prop.destructible_wall_hp_light`, `map.heavy_prop` to
`prop.destructible_wall_hp_heavy`, and `map.garrison` to
`prop.warehouse_garrisonable`. No hidden mission tag selects artwork. These
bindings do not add line-of-sight blocking, cover or damage behaviour. Alternate
ruined-house/objective dressing requires a separate public placement contract.

Assets resolve only if present in the loaded art index. Before full production,
missing buildings still use the clearly recorded development structure drawing;
missing unit substitutions retain their stand-in flag. Mapping tests do not
certify missing art or rendered registration. Both TypeScript checks and all
198 then-current runtime tests pass with the explicit bindings.
