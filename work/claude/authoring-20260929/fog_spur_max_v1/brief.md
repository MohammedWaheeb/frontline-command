# Bounded fog-spur source authoring

Use exactly claude-opus-5-5, no fallback. Read AGENTS.md. User authorizes Codex and Claude graphics work; this private source assignment is independent of other artists. No Bash, browser, Blender, tasks/subagents, deployment or live-file edits.

Your prior integration review P4 proposed a minimum-corner fill. The actual counterexample in work/renderer-performance-browser-v1/prepared/fog-proposal-counterexample.json disproves its vertex and even strictly interior sample nondecrease. Preserve that result.

Author one private candidate based byte-for-byte on work/renderer-performance-v1/combined-candidate/client/src/render/terrain.ts except this bounded fog change: for a currently visible TOP tile, if all four tile-corner alphas are positive and at least one in-map cardinal neighbor is visible, fill that tile's four fan triangles with the MAXIMUM corner alpha (175 or255), not the minimum. Keep solitary visible tiles' existing capped center and all other triangles unchanged. The purpose is to remove the detached bright center without reducing any CPU vertex. Do not change mesh geometry, depth/order, material, UV ramp, shader, actor behavior, public masks, minimap optimization or terrain-admission methods.

Avoid a large new typed array for neighbor slots if the existing topology already lists all cardinal dependencies; immutable width/height scalar metadata and bounded direct public-mask reads are acceptable if memoization coverage is proven. No hidden entities/state.

Only write:
- work/claude/fog-spur-max-v1/candidate-terrain.ts
- work/claude/fog-spur-max-v1/fog-spur.test.ts
- work/claude/29sept-fog-spur-max-v1-authoring.md

Tests should cover all19683 3x3 public masks (center-visible relevant subset), unchanged solitary sightings, remembered/unknown/face vertices exactly unchanged, no visible vertex decreases, complete shared-fragment/cardinal dependency coverage at edges and chunk seams, disk radii2..14 without connected no-clear-corner bright centers, and in-place mask shrink/regrow. Existing straight-edge coplanarity/interior-clear cases must remain unchanged. Source tests will be run by root; do not claim tests pass. Relative imports may target the exact frozen render dependencies; root may create disposable type-check support.

Read native fog images from the prior review as useful. Explain that MAX fill proves CPU vertex nondecrease only, not non-centroid GPU interpolation at antialiased boundaries. Do not claim v4/v5 pixel monotonicity or waive historical failures. Root will run strict original privacy-floor, protected-triangle equality, native actual visible-unit/spur/seam and disposal tests. No appearance/privacy test is earned by authoring.

Report exact scope, CPU reasoning, expected memory cost, any remaining dark-patch/visibility tradeoff, and all unrun gates.
