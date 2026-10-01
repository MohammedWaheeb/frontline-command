# Combat audio consumes authorized simulation feedback

`client/src/audio/combat-sound.ts` selects existing sound IDs from the shared `combatFacts` contract. `AudioDirector` consumes that descriptor, retains its normal mixing/cooldowns, and baselines feedback on restore, reconnect, seek and perspective changes. This is an audio-selection correction, not new sound asset production or complete presentation acceptance.

## Event mapping

| Authorized input | Audio behavior |
| --- | --- |
| `weapon_fired` with a known `combat.weapon` | Use the actual round's `sfx.weapon.<weapon>` even if the source converted, died or disappeared. Synthetic `SATURATION`/`SKYBREAKER` have no invented per-weapon sound ID. |
| Direct `impact` with a positive current authorized hit | Use resolution-time `targetArmor`: infantry → ground; light/air → light metal; heavy → heavy metal; structure → structure. Air shares the existing light-metal clip; no dedicated air impact is claimed. |
| Area, redacted, unknown or malformed impact metadata | Generic ground impact only. A currently visible or previously seen target never supplies missing outcome/material when metadata is present. |
| Entirely absent combat metadata | Retain older-runtime sound behavior, using only the current or immediately previous permitted snapshot. This compatibility path is approximate and is never allowed to override present metadata. |
| Explicit `missile_intercepted` | Existing interception sound. Its owner is the attacking missile owner; no defender or launch-path pairing is inferred. |
| Explicit `decoy_triggered` | Caption “Decoy defeated an incoming shot.” No interception sound or fabricated decoy clip. |

Cover mitigation does not invent another sound or damage value. Omitted outcome is not miss, blocked shot, decoy or failed interception. Distinct authorized impact/interception/decoy events remain distinct; no unavailable projectile identity is guessed to combine them. Repeated event IDs are consumed once, including duplicate copies in one snapshot. Future-tick events cannot play early or advance the baseline past themselves.

The fixed interceptor battery and mobile Aegis depletion warning now checks an owned entity's `private.charges` transition from positive to zero. Their ordinary `ammo` is not the interceptor magazine. Foreign counts, initial/recovered baselines and unchanged zero counts do not generate this warning.

## Validation and limits

The eight focused tests use the real catalog with synthetic authorized snapshots and a recording mixer. They verify source conversion/disappearance, invalid weapon metadata, all five resolution armor classes, landed aircraft, hidden/area outcomes, absent-only fallback, decoy/intercept separation, duplicate/future event handling, discontinuity and owned fixed/mobile charge depletion. Repeated `connected` reports from observer polling now preserve history; a genuine reconnection still establishes a fresh baseline and announces once. Full runtime and application type checks and the full runtime test suite are recorded in `work/evidence/combat-audio/acceptance.md`.

An isolated combined 0.3.4 native/js-WASM course now captures 14 actual Go view pairs, encodes both through the real snapshot/protobuf adapter, and consumes the identical bytes through the audio facts, selector and director. It also preserves 21 hash-checked restorable saves for a separate browser course. These are seeded mechanics fixtures; only the ordinary covered-hit case proves a submitted attack order, and none is campaign completion evidence. See `work/combat-audio/README.md` for provenance, exceptional fixture setup and exact paths.

These checks establish selection and event consumption; they do not establish audible mix quality, voice priority under battlefield load, speaker/headphone quality or complete audio assets. Shared shipping 0.3.3 does not contain the new combat extension; it uses the compatibility path until the separately reviewed runtime promotion. No shared Go/protocol/runtime, audio file, asset manifest or mixer changed in this slice.
