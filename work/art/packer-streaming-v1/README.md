# Isolated streaming sprite packer

The candidate changes only two storage/read sites in `pack_sprites.py`: the bounds pass retains source paths instead of every normalized float32 array, and the atlas pass decodes each source frame into the current page. Crop/anchor calculation, iteration, normalization, sampling, page layout, PNG optimization, metadata and content hashing remain unchanged. `candidate.diff` shows the full change. No live or frozen production helper was edited.

Exact file comparison passes for **376 outputs**: nine files for completed fuel tanks,109 for the complete544-pose IR launcher,193 for the complete656-pose US airlift, plus65 outputs from a forced multi-page synthetic fixture. Both1×/2× PNG pixels and their compressed bytes, every descriptor, sidecar, hardpoint, ink bound and content hash are identical. The fixture covers an empty team frame, omitted wreck team layer, partial/low alpha and colored team input. Existing full exports already supply larger real multi-page cases. `verify.py` checks complete output closure and hashes; `result.json` pins the receipts.

The actual candidate processes peaked at about472MiB for the IR launcher and351MiB for airlift. These are their measured process peaks while Blender was active, not a quiet timing comparison or an all-assets memory guarantee. Shared-host wall times were42.2s and62.0s; no speedup is claimed. The optimization trades a second read/normalization pass for eliminating the whole-roster float cache. The currently rendering gunship's old packer has a calculated7.67GiB float-image cache before page/filter overhead; that number is an allocation inventory, not measured total RSS. Current gunship tools and execution remain unchanged.

## Proposed promotion boundary

After parent source/equivalence review, keep the current gunship on its frozen stage through packing and checks. Do not amend its existing stage or shared handoff lock. Do not repack historical assets: their bytes would not change.

For the next three approved charge exports, create a fresh sibling production stage from the prepared stage, preserving the original stage, sources, raw reuse and locks. Change only the pack helper and its explicit tool provenance/hash; maintain exact model/spec/raw/helper identity otherwise. Run ordinary per-asset checks and native review. For later aircraft, use a new production-family directory/stage rather than rewriting the shared current-v2 lock referenced by completed handoffs. Live remaining ground/building locks, if later amended, must preserve their before copies and truthful tool lineage; every previously frozen handoff remains untouched.

No renderer, gameplay, model, UI or art manifest change is part of this optimization. Source images must remain complete and immutable during packing, as the serial production driver already enforces. Final visual and runtime acceptance remain separate.

## Accepted new stages

Parent reviewed the exact diff and376-file closure. Launcher `production-v2` and separate `aircraft-final-production-v3` now carry the accepted helper hash with old sources/locks preserved. The current gunship finished on its original helper; read-only2-second sampling measured a maximum8,693,760,000bytes RSS for that process. Sampling may miss a brief higher peak, and this is not a paired speed comparison. It confirms the practical need for the bounded memory change without altering that asset’s provenance. Full per-asset checks and native review still apply.
