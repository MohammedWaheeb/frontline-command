# HQ terminal comparison diagnosis

The original strict rendered-pixel and PNG byte comparisons remain **FAIL**. The candidate model does not satisfy byte-identical rerendering. These failures are not converted into passing checks by a tolerance.

Sixteen independently rendered controls cover both HQs, foundation/rubble, and two unchanged baseline plus two unchanged candidate runs in the same Blender process. All observed nonzero decoded differences have maximum channel delta 1. Every team-layer decoded comparison is exact. PNG metadata changes include render date and timing; consequently equal decoded pixels alone do not establish equal PNG bytes.

The same-process baseline-to-candidate changed-pixel counts fit the measured repeats for each layer. Historical SA rubble beauty differs in24 pixels, while the largest freshly measured repeat differs in20. This is disclosed, not waived or generalized into a per-image allowance. Source proof independently establishes exact visible geometry, transforms, material parameters, shadow membership and pose values for foundation/rubble; the current height-adjusted hardpoints intentionally differ.

The full export therefore uses a separate exact path: copy the two original terminal PNG poses verbatim after verifying historical and candidate camera/anchor/spec, fclib, mask helper, common geometry and renderer configuration hashes. Regenerate current hardpoints for all28 poses. Thirteen accepted nonterminal pilot poses are also copied verbatim; the13 remaining poses are freshly rendered. Full raw/packed/UI checks and native inspection still apply.

The failed first production preparation selected a manifest absent from the historical runtime handoff. No Blender launched. Its script and partial source-only tree remain under `prepare-production-failed-v1.py` and `production-preparation-failed-v1`. The corrected preparation takes an existing immutable stage manifest, proves exact HQ states, and leaves every entry unchanged.

This establishes an auditable export lineage. It does not claim identical rerendering, a universal numerical tolerance, runtime rendering acceptance or complete-game art approval.
