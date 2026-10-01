# Combat vehicle source handoff

The 27 missing ground-combat variants have original editable model sources and
complete production specifications. They are **not rendered or art-approved**.
The 8,080 declared source poses pass Blender-free forward/reverse evaluation,
finite transforms, conservative canvas bounds, hardpoint membership, and separate
hull/turret registration checks. Actual Cycles material/alpha checks, portraits,
cameos, packed atlases and in-game acceptance remain pending.

Claude Code `claude-opus-5-5` authored `vehicle_roster.py`. Codex continued under
the user's explicit quota-takeover authorization, wired the specs and corrected
the source issues below. All geometry is original procedural work; no external
meshes or insignia. Each JSON spec records this mixed provenance accurately.

| Faction | New source variants |
|---|---|
| US | car, apc, artillery, aa, repair, launcher |
| IR | car, apc, tank, artillery, aa, repair, launcher |
| SY | apc, tank, artillery, aa, repair, buggy, launcher |
| SA | car, apc, tank, artillery, aa, repair, launcher |

The accepted `US.tank`, `SY.car`, `SA.mobile_abm`, and `IR.strike` source/spec files
were not edited. Neither infantry nor logistics files were edited. Their hashes
are retained as preservation guards in both new source locks. This lane does
not certify missing states in those legacy samples.

The faction silhouettes retain Claude's angular compact US recon equipment,
cast/slatted Iranian armor, visibly repaired Syrian military equipment, and
heavier pale Saudi wheeled armor and service machinery. The native-size flat
contacts in `work/art/vehicle-roster/source-previews/native-overview.jpg` were
inspected for role differentiation. They are recording-stub geometry previews,
not Cycles renders, final lighting, or a visual release approval.

## Source corrections

- Ground launchers now fire from the deployed erector pose. Iran has distinct
  zero-, one- and two-charge ready plates. Saudi's single-charge canister no
  longer incorrectly presents a second ready missile. Counts may only be selected
  from the owning player's private data; see the renderer contract.
- New independent turrets render their own shadows at turret heading. Hull
  shadows exclude the static turret. Hull-only door/hull-down states avoid a
  duplicate turret. The four accepted legacy behaviors remain unchanged.
- Pivots are explicit simulation XY millitiles; Blender Y is negated. US APC's
  lateral pivot is `[100,-80]`, not `[100,80]`. Height remains baked into the
  turret's authored transform and is not added twice by the renderer.
- Barrel recoil follows the inclined barrel axis. Effects iterate deterministically;
  a duplicate buggy frame/weapon tube name was removed.
- Canvas bounds were enlarged for the real displaced wreck/barrel envelope.
  The smallest conservative source margin is 22.690 px at 2×. This excludes
  Blender bevels, glow and shadow penumbra, so actual clipping tests still apply.
- Pack aliases reverse deployment; Guardian deployment/pack aliases use its
  authored hull-down sequence. These do not create gameplay timing.

## Evidence and reproduction

Run from the repository root with the existing art Python environment:

```sh
work/art/.venv/bin/python work/art/vehicle-roster/generate-specs.py vehicle --check
work/art/.venv/bin/python work/art/vehicle-roster/test-source.py
work/art/.venv/bin/python work/art/vehicle-roster/check-source.py vehicle
```

`source-check.json` records 27 assets / 8,080 forward poses and 8,080 reverse
comparisons, with per-spec/source hashes. `semantic-tests.log` records the focused
roster, radius, faction, transport, magazine, turret, airframe and rotor tests.
`specifications.json` is a source inventory, not a manifest status update.

`work/claude/01-next-render-request.md` reserves six representative ground/air
families. The first proposed insertion is the Guardian tank plus US transport
helicopter. Only the coordinator's single Blender worker may execute them.
`pilot-plan.json` is an exact list of selected render poses; `source-lock.json`
guards source, specs and relevant shared pipeline files. No shipping sprite,
shared manifest, UI, simulation or deployment file was changed by this lane.
