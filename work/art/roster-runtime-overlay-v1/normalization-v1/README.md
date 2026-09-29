# Reviewed UI normalization during private assembly

`../overlay-normalized-v1.mjs` is a new private successor of accepted `../overlay-v3.mjs`. The accepted recipe and all existing products/handoffs are unchanged. This successor is prepared for root review; it is not live publication or a replacement for ordinary final `make build` integration.

The only new transformation is `apply.mjs`: it pins the normalization receipt, requires exact selected handoff path/SHA per reviewed role, matches original mask source/SHA against that handoff, verifies actual original and derivative bytes, and validates the paired beauty. It requires complete four-team-mask coverage (portrait/build × 1x/2x) for every role in that receipt. An extra selected role outside the receipt keeps its original bytes; it is explicitly outside normalization coverage.

All handoff copies happen first. Application is allowed only inside the new overlay's unfinished product, with an incomplete marker and no sealed `build.json`. Every target/beauty is checked before mutation. Only exact team-mask destinations are written, using temporary files and renames. A failed filesystem write leaves an unsealed incomplete directory; this is not a transaction over a served product. Original inputs are rechecked. The successor then verifies **every selected world/beauty/UI output** against either its original handoff descriptor or the exact normalized descriptor, checks normalized output again, and calls the unchanged frozen `writeBasePack`. Build receipts retain both original and final mask hashes/byte counts and identify the derived transformation. No pack version is manually retained.

## Prepared evidence

`checks-01/result.json`: 12 checks pass. Actual current53 receipt `2131210c…c36e6` prepares 212 masks/53 roles against catalog56's 56 exact handoffs. The real old US rifle handoff is rejected. Focused controls also reject a changed same-path handoff SHA, mismatched original descriptor, corrupt candidate, missing or wrong original output, an already sealed product, a late original handoff copy and a mutated prepared plan. A bounded temporary copy applies all 212 real reviewed PNGs; all 212 paired beauty files plus two real world-sidecar controls remain exact. Original/candidate/handoff/accepted-recipe hashes are checked before and after. The temporary successful UI copy is removed after recording its output hashes. Negative receipts and the deliberately corrupted copied PNG remain preserved.

`checks-01/dry-run.log` is the actual full successor `--check` pass: 56 handoffs, 2,980 original files, 539,169,336 original encoded bytes, 16,481 poses plus the 212 guarded mask transformations. Its exact command is `dry-run-command.json`. The base is historical v25 for this **read-only graph validation only**; no product is emitted and no current-source runtime compatibility is inferred. The full copy/pack branch has not been run.

Syntax checks pass for the helper, tests and successor. No browser, host, compiler, rendering, live asset write or full build was used. No new visual approval follows; current53 native/compositing evidence and its separate strict 14-abort failure remain unchanged. Later IR fighter/gunship/ISR and the remaining roster are not covered by current53 normalization.

## Commands

Run focused checks from the repository root with a fresh evidence name:

```sh
node work/art/roster-runtime-overlay-v1/normalization-v1/verify.mjs checks-02
```

The successor retains v3 arguments, adding a mandatory reviewed receipt and its expected hash before the handoffs:

```text
node work/art/roster-runtime-overlay-v1/overlay-normalized-v1.mjs \
  --base-lock <explicit-immutable-base-lock> <new-output-name-or---check> \
  --normalized-masks <reviewed-receipt-path> \
  --normalized-sha256 <reviewed-receipt-sha256> \
  <one-accepted-handoff-per-ID>...
```

Root must review the candidate before a real product is assembled. Future normalization coverage must come from a new immutable reviewed receipt, coordinated with the art owner. Preserve original masks/beauty/world exports, reject mismatches, and regenerate the pack only after the final derived bytes are in place.
