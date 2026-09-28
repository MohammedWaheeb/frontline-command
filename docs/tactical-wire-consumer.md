# Optional tactical disclosure consumption

This follow-up consumes the root's optional Go projectile/operation fields without replacing the shared protocol or runtime. It closes the radius/body ambiguity in the [0.3.3 renderer acceptance](tactical-overlay-acceptance.md) once the compatible generated protocol and runtime are promoted together.

| Field | Consumer behavior |
|---|---|
| Projectile `splash` present | The instance's real radius takes precedence over catalog defaults, including synthetic Saturation/Skybreaker IDs. Zero means single-target; invalid negative/nonfinite values remain unknown and never invent an area. Circle descriptors use `source:'snapshot-splash'`. |
| Projectile `positionVisible === true` | Draw the actual disclosed body, including a legitimate final position equal to impact. |
| Projectile `positionVisible === false` | Withhold the body even if its coordinates differ from impact or it is not a warning projectile. No route/origin is inferred. |
| Projectile visibility field absent | Preserve the old conservative position/impact equality fallback. Missing presence is not silently treated as explicit false or true. |
| Skybreaker/second-volley warning `splash` | Use the real blast field. Second volley still denotes pending launch, not impact. |
| Raid/transfer warnings | Remain destination/exit markers. Even malformed extra splash metadata cannot turn them into blast areas. |

Missing old fields still produce explicit gaps and point-only strategic warnings. Old ordinary catalog radii remain supported. The owner-only Skybreaker approach preview is separate from public warning disclosure: accepted-operation snapshots do not reveal enemy approach routes.

The production change is confined to `client/src/app/tactical-presentation.ts`. It does not change actor status, Go simulation, visibility, assets, protocol generation, terrain or gameplay. Root's actor-status lane separately consumes active effects and own emergency-takeoff deadlines.

## Validation

Two new tests cover instance precedence, optional presence, explicit hidden/visible bodies, legitimate coincident positions, older fallback, operation kinds, zero splash and invalid values. Both project typechecks and **270 runtime tests** pass.

The existing tactical browser runner now optionally accepts isolated runtime/protocol paths. It reads the alternate generated file through an esbuild alias and resolves its existing protobuf dependency from the installed client packages. It never copies those candidate files into shared source/runtime. Candidate evidence goes into a different directory, preserving the original 0.3.3 source-specific captures.

```sh
FRONTLINE_TACTICAL_EVIDENCE=work/evidence/tactical-wire-consumer \
FRONTLINE_TACTICAL_RUNTIME=work/tactical-wire-candidate/runtime \
FRONTLINE_TACTICAL_PROTOCOL=work/tactical-wire-candidate/source/client/src/protocol/frontline_pb.ts \
FRONTLINE_TACTICAL_EXPECT_EXTENSIONS=1 \
node client/tests/render/tactical-browser.mjs
```

Both actual headed Chromium courses passed: the isolated candidate with its matching generated protocol, and the older shared 0.3.3 runtime/protocol. Native captures were inspected for the six Saturation circles, three Skybreaker circles and hidden-launcher control. Pause, exact restore/replay hashes, replay rewind, reduced effects, zones, raid/transfer exits, minimap-only endgame alerts and complete disposal also passed. Both runs had zero browser errors. See the source-specific [acceptance record](../work/evidence/tactical-wire-consumer/acceptance.md).

The candidate and older runtime produce the same recorded simulation hashes. The older runtime retains explicit point-only strategic warnings because it has no radius field; it does not borrow the candidate's values. The candidate must still be promoted together with its generated protocol/server/WASM. This acceptance does not claim those files are already shipping.

This remains a bounded tactical information layer. It does not complete the 132-effect manifest, exact selected coverage, impact-outcome classification or authored particle effects.
