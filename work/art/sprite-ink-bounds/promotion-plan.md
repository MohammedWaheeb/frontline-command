# Proposed metadata promotion boundary

This is a prepared plan, not approval or a performed live change. Root's flat/sub-tile/raised terrain, shadow, three-browser and product gates remain decisive. The original diagnostic overlay, source images and older evidence stay immutable.

## Frozen change

The existing candidate is `candidate/pack_sprites.py` SHA256 `18a933faed0eb64a273ec273428047942fbb4b95f6a97d66a3d45375a366848a`, replacing original `730b7f86232220acf5ed0b6f5858183a0509c8eec9076c63fbd77207fc1a198e`. Add exactly `sprite_ink_bounds.py` SHA256 `cda9670317a57b3d0693777978fa049b6e2ef035c120f5c1920aa0b8de05048e`. The packer diff is one helper import and one call after packed PNGs are written and before atlas bytes are hashed. No source rendering, crop, frame rectangle, anchor, PNG, hardpoint, size, model or simulation changes.

The optional descriptor field is `ink_bounds`, frame-local integer pixels, with `null` for empty. Beauty/team share their alpha-at-least-one union; shadow and other independent layers use their own alpha only. Measure each final scale independently. Descriptor policy identifies the exact version and layers. Content hashes correctly change because JSON metadata changes; PNG bytes do not.

## Lock update order after explicit root acceptance

1. Finish the current whole-asset/pilot operation. Archive exact old live packer, affected production locks and any amended drivers; record old and new SHA pairs and root's accepted renderer evidence. Do not change an active export driver.
2. Install the two exact candidate files and focused tests under pipeline tools. Rerun the seven metadata tests plus existing alpha-resize/shadow tests. Preserve the candidate/evidence copies as immutable history.
3. Amend only `sources` packer SHA and add the helper SHA in `work/art/building-roster/production-lock.json` and `work/art/vehicle-production/production-lock.json`. Record amendment receipt and original lock SHA. No source/spec/model/manifest hash substitution. Run their existing full preflights against every remaining ID.
4. Aircraft stage-v1 is immutable. Copy to stage-v2 at the already-approved service-source promotion boundary; install the metadata helper/packer only into the new stage and update its exact source lock together with a separately described service-source amendment. If metadata is accepted after stage-v2 already exists, first archive that stage's current tool/lock files and amend only the new active stage. Never rewrite stage-v1 or its baseline proof. Existing completed fighter can receive metadata-only JSON backfill in the new stage without rerendering raw pixels. The airlift's 96 rearm render replacement and unchanged-576 raw proof remain independent.
5. Infantry's existing lock currently pins model/specs but not tools. Add the exact packer and helper hashes to its existing `sha256` map after archiving it; the existing runner checks every map entry. Do not alter model or specs. No old completed-job source lock or pilot lock is rewritten. Logistics/props are completed; their source/evidence locks remain historical.
6. New complete exports naturally contain metadata after packing. Run ordinary checks/UI/native review; the metadata does not claim asset visual acceptance.

## Historical outputs

Read-only inventory `promotion-inventory-v1.json` captures 66 shipping sprite sidecars plus two immutable staged exports, 822 atlas descriptors in total, and current lock hashes. It deliberately includes completed legacy assets without claiming their known canvas/state gaps are resolved. Recompute the inventory at the actual promotion boundary because further complete assets may finish.

If root authorizes backfill, prefer annotating copied atlas JSON directly from existing final PNGs, then atomically replace complete per-asset descriptor sets and refresh only `content_sha256` using the packer's existing ordered file-hash rule. Preserve old JSON/hashes; assert PNG SHA, raw SHA and every prior descriptor/sidecar field (except content hash) remain exact. This avoids rerendering or resampling pixels. Protect source-copy windows used by browser builds; do not overlap publishing descriptors with a snapshot copy. Run independent bound recomputation against every frame and representative existing-sprite/checker/renderer tests. No image editing or broad atlas repack is required for this metadata-only migration.

## Existing evidence

Seven focused synthetic tests; nineteen real copied assets with 11,602 assertions; actual four-pose marker before/candidate complete-pack proof with byte-identical PNGs; all prior descriptor fields unchanged; sidecar change limited to truthful content hash. See `proof-lock.json`, `existing-proof.json` and `full-pack-proof.json`. Root independently owns stronger terrain and renderer acceptance. No shipping promotion occurred while preparing this plan.

A further isolated backfill proof is now complete: `prove-backfill.py` annotates the preserved original real marker export, recomputes the existing content hash correctly excluding the sidecar, and produces files byte-for-byte identical to the full candidate packer. Both PNGs remain exact; eight descriptors are annotated; the sidecar changes only its content hash. See `backfill-proof.json`. This validates the historical migration route without rerendering or resampling.
