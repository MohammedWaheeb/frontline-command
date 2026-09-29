# Post-quota presentation validation

Claude's four completed reviews and four source revisions are preserved in `5a28fab`. Its next request stopped at the session limit before making edits. The actual reset is **29 September 19:30 UTC /22:30 Qatar**. The user authorized Codex to continue after Claude hits limits. The following limited fallback changes are authored by Codex, not Claude; a fresh Claude review remains due.

The immutable candidates remain preserved. The exact v5 delta was subsequently integrated into the live development client; see `work/presentation-fallback-integration-v1/README.md`. No deployment or finished-game acceptance is implied.

## Preserved candidates

1. `work/presentation-fallback-v1` keeps the exact Claude fog/label/command/cameo work and accepted current audio/loader logic. It corrects the remembered-versus-unknown test expectation and adds a stable information column with portal hosts. The audio-caption component remains mounted across menu, session and targeting changes. All 483 runtime tests and both TypeScript checks passed. Independent review caught an accidentally omitted CSS tail, conditional caption flow, React-versus-DOM portal event ancestry, and inherited alert selectors. This candidate is rejected for integration.
2. `v2` restores the exact 3,237-byte unrelated Claude CSS tail. The original v1 remains untouched.
3. `v3` keeps captions in the column throughout active play and adds a native capture listener for scroll-navigation keys from portaled children, with matching cleanup. All 483 tests and both TypeScript checks pass again. No game rules or hidden-world reads change.
4. `v4` preserves authored alert and target-button styles under the new host. Only CSS differs from v3; TypeScript/test source hashes are identical. Actual Firefox 156.0.1 passes **20 checks**, including real Go solo creation, paid production, movement, saved preferences, exact export/import/load, read-only replay seeking, cleanup, and exact1280×720/150% UI. All144 input pins remain unchanged; observed page/RPC/console/HTTP errors are zero. Native screenshots show Move, Attack-Move, Stop and Hold above the fold, the MORE cue, and an intact SKYBREAKER word. Root then found captions overlapping the resource shoulder at150%. Thus functional success does not constitute visual acceptance.
5. `v5` changes only the column's top boundary to reserve the resource-shoulder height. The focused native overlap/keyboard/caption-lifetime stress course subsequently passed24 functional checks; its strict result remains failed on103 unclassified aborts. See `work/evidence/presentation-ui-stress/README.md`. Its source and build are frozen separately from v4.

The v4 full-App build receipt is `1cf3bf90c23c806f246b441d734332ef50b99d1dc7f42f26af8b0e4752b7ca44`. It keeps4,815 art/runtime/content/font descriptors unchanged from the incomplete v25+36 base. Go0.3.4 is unchanged. No complete roster, long match, full audio, physical LAN or release claim follows from this course.

## Fog distinction

Exact Claude terrain `6820e55a…3788` passes 96 raster comparisons against the original constant-fog privacy floor `52d20cd0…ad69`, retaining opaque unknown pixels and clear visible interiors. The separate comparison against the current feathered renderer `65421e5e…c656` fails strict monotonicity: its48 computed flat cases include decreases up to3 alpha bytes. The initial failure is preserved unchanged.

Einstein's independent three-source derivative additionally compares all96 flat/raised cases and192 protected remembered/unknown triangle-class images. The protected classes are pixel-exact and every candidate pixel stays at or above the original privacy floor. The current-renderer comparison still fails, with raised cases reaching13 alpha bytes; no blanket small-tolerance waiver is justified. See `work/evidence/presentation-privacy-review` for exact triplets, scope and cleanup proof.

Root's actual-App review still sees isolated tiny fog diamonds at the opening visibility corners. This remains a visual review item for Claude, independent of privacy acceptance. Native last-seen readability, maximum-content overlap, final art and complete-game acceptance are not yet earned.

## Reproducibility

`through-v5-source-evidence.tar.gz` losslessly preserves all five exact source trees, source/build/test receipts, v4 browser text/data evidence, and Claude's quota-failed follow-up. `through-v5-files.json` records each original path, byte count and SHA-256; every archive entry was read back and verified. Native v4 screenshots remain beside their run and the key captures are committed directly. Earlier snapshots and logs are never overwritten or relabeled.

The separate `root-fog-source-evidence.tar.gz` preserves both original root fog drivers, both exact source-input sets, their failed/passed receipts and native screenshots, with all entries verified against `root-fog-files.json`. It includes the failed48-flat-case current-baseline run and the separate96-case original privacy-floor pass, without reclassifying either result. Generated browser bundles are omitted; their source fixtures and bundle metadata remain.
