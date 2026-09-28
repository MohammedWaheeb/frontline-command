# Single-premultiplication export correction

Actual native prop review found pale fringes in packed1× output. The previous
helper manually premultiplied RGBA, resized it through Pillow's RGBA path
(which premultiplies internally), then divided by alpha again. A constant
RGB[96,128,160] region acquired mean partial-edge RGB[196,252,255]. The palm's
515 partial-edge pixels brightened by about52 RGB levels.

The corrected helper filters four independent float channels containing
premultiplied RGB and alpha, then unpremultiplies once. Alpha overshoot remains
unclamped for division so constant colors do not brighten at opaque Lanczos
edges. The final straight-alpha bytes are clamped/rounded; zero-alpha pixels
have zero RGB. This changes1× derivatives, not source geometry or2× exports.

Seven focused export tests cover constant colors at partial/opaque edges, hidden
transparent RGB, single alpha filtering, opaque/odd-size output, composition
and beauty/team/shadow contracts. The explicit impulse test covers negative Lanczos lobes and opaque-edge
overshoot. Four existing shadow cleanup regressions also pass (11 total). Reproduce with:

```sh
work/art/.venv/bin/python -m unittest discover -s assets/pipeline/tools -p 'test_*.py' -v
work/art/.venv/bin/python work/art/alpha-resize-audit/prove.py
work/art/.venv/bin/python work/art/alpha-resize-audit/check-actual.py
```

`before-pack_sprites.py` is the exact old helper, SHA36d48d…71d5 (reconstructed
from the recorded function after the untracked file could not be retrieved
from Git, then verified against the pre-existing frozen SHA). `helper.diff`
shows the sole shared-code change. `result.json` preserves the original defect
measurement; `actual-result.json` covers actual palm, US rig and US rifle
beauty/team/shadow layers. Native/diagnostic comparisons are adjacent. The
historical shipping exports were not changed by those isolated proofs.

Five active future-production locks have only the packer SHA refreshed, with
exact originals in `lock-before/` and field-level records in `lock-refresh.json`.
Completed airlift aperture request/baseline locks stay untouched. Repacked prop
results record immutable raw PNG/hardpoint, editableblend and2× atlas hashes.
Earlier prop contacts remain in `production-contacts-before-alpha/`; all 136 corrected
packed native poses have been inspected, closing the prop export hold.

`historical-repack-inventory.json` enumerates every remaining sprite atlas set,
UI1× image with its existing2× source, and any other paired derivative. Broad
historical repacking was approved after parent review of the helper/evidence.
The corrected inventory contains 31 sprite sets and 76 affected UI derivatives.
Five chrome derivatives use direct Pillow resizing without manual premultiplication
and remain unchanged. The in-progress historical run records its own immutable
proof and native rereview separately. No raw source or Blender rerender is needed.
