# Terrain v2 bounded acceptance

29 September 2026. Claude Code CLI, audited exact `claude-opus-5-5`, authored v1 and the isolated v2 correction. Root copied v2 byte-for-byte into `client/src/render/terrain.ts` after independent source review, semantic TypeScript and three browser GPU courses. `promotion.json` records the exact old/new hashes, reports and source boundaries. No gameplay visibility or map geometry changed.

## Retained failure and correction

Original `chromium-01` fails: 112 mixed-boundary pixels drop from alpha175 to174 at zoom0.45. Actual fragment precision is23bits; the demonstrated cause is MSAA interpolation outside a partially covered triangle, not a demonstrated low-precision device. `MSAA-FINDING.md` retains the exact negative barycentrics. No tolerance was added.

V2 keeps explored/unknown triangles constant at their original base opacity and feathers only into visible ground. The remembered/unknown boundary deliberately retains its stepped outline. The macro texture opacity changes from0.65 to0.35. The authored source, tradeoff and exact model audit are retained in `../terrain-polish-v2/HANDOFF.md` and `../claude/terrain-msaa-20260929T080251Z.model-audit.json`.

## Verified scope

`v2-chromium-02`, `v2-firefox-01` and `v2-webkit-01` each pass96 actual GPU alpha comparisons over identical flat/raised/cliff geometry, three zooms, two subpixel positions and repeated visibility modes. No pixel becomes lighter, unknown pixels stay opaque, clear interiors stay clear, and geometry/bounds/picker results remain identical. In-place vector mutation, missing vectors and hidden fragment updates pass. Page/console/HTTP/request diagnostics are zero and all owned textures, meshes and canvases dispose. Inputs remain byte-exact. These synthetic public-geometry cases do not prove every hardware renderer or authored gameplay journey.

Root separately viewed the actual textured macro baseline/candidate images and fog boundary pair from `v2-chromium-02`: the sand has less mottling, visible edges feather inward, and fogged space remains dark. This is representative visual acceptance, not exhaustive art approval. Pixel opacity comparisons use fog alone and never rely on macro-induced brightness changes.

Semantic application TypeScript passes on the exact frozen v22 client with only the candidate terrain substituted (`v2-typecheck-02`). The first typecheck setup followed a dependency symlink and failed before copying the candidate; its subsequent baseline-only tsc exit0 is explicitly not candidate evidence. `v2-typecheck/FAILED-SETUP.md` preserves that mistake.

## Cost remains a final workload gate

The first v2 Chromium course tested CPU work only with unknown resident chunks because its x16 boundary missed the centred camera. That limitation is preserved. The expanded course explicitly verifies resident visible counts for unknown, fully clear and centred-frontier modes, at36 and196 chunks, including hidden resident fragments.

At196 fully clear chunks/200,704triangles, candidate median `setFog` time is14.9ms in Chromium,27ms in Firefox and23ms in WebKit on this shared M4. These are diagnostics under simultaneous production work, not quiet performance qualification. V2 still visits all resident triangles and does three incident-tile probes for every visible triangle. Final combined-art frame-budget and reference-device tests remain mandatory; no FPS or total GPU-memory claim is made.

Use the recorded driver with explicit `--inputs work/terrain-polish-review/inputs-v2 --candidate-sha 968299e854349a7463f00d6b4cf7676b2cb035d2b4a3fbd46b62c50207980876`, a frozen product and a fresh output directory. Original v1 inputs and every failed run remain intact.
