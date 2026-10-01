# Transparent surfaces and ownership paint

Non-team surfaces with fractional alpha must attenuate ownership paint rather than erase it. The original opaque Holdout path incorrectly cut holes through paint beneath translucent rotor and propeller discs.

Opaque assets still use the original render function unchanged. A visible translucent non-team surface selects a two-pass team mask: the original shaded white paint supplies RGB, and a separate linear emission coverage render supplies alpha using the material's actual opacity. White marks team surfaces, black marks plain surfaces, and transparent shaders carry the original fractional coverage. Denoising and display dither are disabled only for that mathematical coverage pass. `team_mask_png.py` preserves the original shaded RGB bytes and ancillary PNG chunks while replacing alpha.

The wrapper restores materials, object visibility, camera flags, scene/view settings and temporary files in `finally`; an injected failure after coverage rendering verifies that restoration. Unsupported linked alpha and mixed opaque/translucent meshes fail explicitly. The current linked-alpha scorch decals appear only in beauty/shadow-only wreck states and therefore do not enter this mask path.

Validation is recorded under `work/art/rotor-team-mask-v3`: four PNG tests, all28 original definitions AST-identical,25 stacked-opacity/state-restoration controls, actual rotorcraft/portrait native review and fresh unchanged-source comparisons. Earlier mixed-Holdout and raised-ray-budget candidates failed and remain preserved. Strict independent-render byte comparisons still fail; repeated unchanged candidate renders reproduce the observed one-level GPU quantization. The bounded production acceptance does not establish a universal pixel tolerance or claim byte-identical new renders.

New transparent poses render their complete beauty/team/shadow set. Accepted pilot images may be reused only after an evaluated pose audit proves the helper takes its original opaque path, with identical source/spec/camera/lights/layer contracts and copied SHA-exact PNGs. UI is rendered again. Whole exports still require normal integrity, source/reset/bounds, editable blend, hardpoints and native review; the helper acceptance does not certify complete aircraft art or runtime lifecycle quality.

The additional coverage pass affects approximately2,880 new rotorcraft poses plus relevant UI. Legacy IR strike contains an alpha0.16 pusher-prop disc and is also a translucent case; its incomplete service lifecycle remains a separate task.
