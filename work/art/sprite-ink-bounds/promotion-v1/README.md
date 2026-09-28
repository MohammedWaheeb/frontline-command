# Exact sprite ink metadata promotion

Root authorized this bounded migration after its terrain/body/shadow pixel and culling checks. Global game performance and final art acceptance remain separate. This change does not certify the full game.

Installed the exact reviewed packer18a933faed0eb64a273ec273428047942fbb4b95f6a97d66a3d45375a366848a and metadata helpercda9670317a57b3d0693777978fa049b6e2ef035c120f5c1920aa0b8de05048e. The helper measures frame-local final PNG alpha≥1. Beauty/team share their union; each shadow/independent layer uses its own coverage. Empty frames have null bounds. Existing frame rectangles, anchors, source dimensions, scale and model geometry are unchanged.

## Verification

- 18 pipeline unit tests pass, covering ink metadata, premultiplied resizing and shadow normalization.
- Full source preflights pass for59 building IDs,27 ground IDs,11 staged aircraft IDs and all24 infantry specs.
- 67 existing shipping exports and two independent stage-v2 aircraft exports contain834 atlas descriptors with50646 independently recomputed bounds.
- All834 packed PNG hashes and25323 raw PNG hashes remain exact. All prior descriptor/sidecar fields remain identical, except the sidecar content hash correctly accounts for the new metadata.
- Every asset publishes through an atomic whole-directory exchange after full private validation. A disposable directory test first proves the host's exchange behavior; snapshots wait for the completion signal. The previous entire export remains at its recorded prepared path after the swap.
- Original stage-v1 remains byte-identical across all3794 baseline files. Stage-v2 is an independent copy and still uses original aircraft sourcedca923; no service geometry or96-frame replacement is smuggled into this metadata amendment.

## Evidence

`tool-amendment.json` records archived tools/production locks and exact changes. `before/` preserves prior files. `prepared.json` records prepublication input/output hashes. `published.json` records the complete successful migration, exact target list and raw preservation. `raw-before.json` holds the original raw hash inventory. `tool-tests.log`, `preflights.log`, `infantry-full-preflight.log` and `stage-preservation.log` record checks. The migration script is the sibling `promote-metadata-only.py`; it changes only JSON metadata, validates old content hashes and independently recomputes all bounds.

`future-pilot-lock-amendment.json` changes only tool/helper dependency hashes for the unexecuted SY/SA battery and producer pilots. Already-rendered pilot/source locks remain historical and untouched. No manifest, audio, source model, UI image, raw frame or PNG pixel is edited by this migration.

Root and the browser integration worker received publication-complete/copy-clear at14:26UTC. Subsequent Blender work is isolated under work and does not rewrite served exports during their snapshot.

After publication, normal asset integrity checks also passed for the US rig, IR battery and staged US fighter, each11 checks/zero failures. Root's post-publication full14 renderer regression passed, including five disposals with no retained resources and save/context-loss recovery from tick100 to120. This is bounded renderer/metadata integration evidence; it does not close global performance or full art acceptance.

A subsequent narrow safety amendment fixes the active aircraft driver, which previously hardcoded stage-v1 even after the lock selected stage-v2. It now reads the validated active lock and explicitly rejects original stage-v1, including a symlink alias. The old driver/lock and exact diff hashes are preserved in `stage-driver-amendment/`; only that driver hash changes in the lock. Four disposable-fixture guard tests, syntax validation, current preflight and a zero-asset/no-render driver run pass. No job ever ran against the mismatched old driver, and original stage-v1 remains intact.
