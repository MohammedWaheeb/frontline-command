# Tactical-launcher charge artwork review (read-only)

Reviewer: Claude, `claude-opus-5-5` (fallback disabled; actual model to be confirmed by the dispatcher audit). Date: 2026-09-29.
This review covers only which charges are shown, plus the proposed SA empty-canister correction. Chassis style, full export, Go runtime/event timing, ownership, replay and save state, and faction style are **out of scope**. Nothing here comes from contact images. No source, spec, asset, manifest, renderer or evidence file was edited. Blender, the browser, tests, rendering and other agents were not used.

## Inputs read

- `ground-launcher-charge-contract-v1/README.md`, `candidate-v1/source-lock.json` (candidate model `fdff1a61…ac66`, 1,344 added / 168 pilot poses), `candidate-v1/proof-v2.json` (`failures: 0`), `candidate-v1/pilot-review.md`.
- `sa-empty-proposal-v1/README.md`, `sa-empty-proposal-v1/pixel-diagnosis.json`.
- Read-only check of the diagnosed SA geometry in `candidate-v1/candidate-vehicle_roster.py:464-468`, done to size the correction.
- The six native 1× pages listed below, viewed at native size.

I did not inspect any US page, IR move/damaged/deploy pages, the SY page 02 (`d11_f09`, `d15_*`), SA idle/deploy/damaged pages, the IR `ready`/`ready_two_charges`/`ready_empty` references, or any 2× page. The verdicts are bounded to what I actually saw.

## Visual findings by page

### 1. `unit.IR.launcher/contacts/idle_charges_0-01@1x.png` — 2 vs 0

- All four diagonals (d03, d07, d11, d15): the bright silver twin tubes are gone from the bed. The dark cradle/rail line stays visible at d11 and d15. At d03 and d07 the bed reads as flat olive. The difference between 0 and 2 charges is immediate at native size.
- The cab, yellow roof, antenna, six wheels, stabiliser legs and bed edge are all present in every cell. I saw no lost body parts, clipping or leftover missile shadow. The shadow outline matches the generic cell, because the missile shadows fell mostly inside the truck shadow already.
- **No new defect.**

### 2. `unit.IR.launcher/contacts/idle_charges_1-01@1x.png` — 2 vs 1

- d03 and d11: one silver tube plus a visibly empty dark rail beside it. You can read 1 vs 2 here.
- d07 and d15 (near side-on): the two tubes overlap in depth in the generic cell, so going to one tube only makes the silver band about 1–2 px thinner. **1 vs 2 is subtle in these two headings.** This is a limit of the frozen geometry and camera, not a new defect. 0 vs any charges stays unambiguous in all headings, and that is the distinction that matters for play.
- The remaining tube is on the upper/near side of the silhouette at d07/d15 rather than hidden behind the empty rail, so group0 stays visible. No body loss or shadow artifacts.
- **No new defect. Limitation noted:** d07/d15 rows, `idle` vs `idle_charges_1`.

### 3–4. `unit.IR.launcher/contacts/fire_charges_1-01@1x.png` and `-02@1x.png` — first-shot departure

- **f02 and f03 in all four diagonals** (d03, d07, d11, d15): generic `fire` leaves a dark empty erector. `fire_charges_1` keeps one silver missile with a red tip on the raised erector. This is exactly the post-shot 1-charge picture the next one-charge `ready` should continue. The earlier bug (empty rack flashing before `ready`) is visibly fixed.
- **f00 and f01**: the departing missile and its plume are offset sideways by the group0/group1 rail spacing. The retained missile sits parallel next to it, so at d03 and d11 you see two tips close together in f00/f01. Because the retained missile stays on the rail while the other climbs, this reads as one missile leaving, not a two-missile salvo. It is only a 2-frame window on the canonical 4-frame clock, so I accept it.
- The plume in `fire_charges_1` is shifted to the group1 rail (clearest at d11 f00 and d03 f00). That is correct, not a defect.
- Clean in every cell: chassis, legs, erector angle, headlights, frame timing (plume/smoke phase per frame matches generic), no clipping between the departing and retained missiles, and no leftover shadow from the departed missile in f02/f03.
- I did not inspect whether f03 matches the one-charge `ready` f0 frame for frame. Root/parent should check that pair once (`fire_charges_1/dNN_f03` → `ready/dNN_f00`, four diagonals).
- **No new defect.** The correct remaining missile (group0) is kept.

### 5. `unit.SY.launcher/contacts/deploy_charges_0-01@1x.png` — empty through deployment

- d03 f05/f09, d07 f05/f09 and d11 f05: the empty erector shows two bare dark rails, and the red missile tip is gone. That lost tip is the strongest cue. Clearly readable while the erector is partly raised (f05) and fully raised (f09).
- **Lowest contrast:** d03 f00 and d11 f00, the stowed position seen end-on. The SY missile is dark and so are the rails, so the only cue is the thinner rails against the missile's thicker body. Still readable at native size, but marginal. It is the same kind of limitation as IR d07/d15: the frozen dark SY palette, not a new defect.
- Erector angle and timing match generic frame for frame. Cab, wheels and outriggers are identical. I saw no clipping between the empty cradle and the deck, and no leftover missile shadow (the f09 shadows differ only by the missing missile).
- **No new defect** on this page. Page 02 (d11 f09, d15) not inspected.

### 6. `unit.SA.launcher/contacts/move_charges_0-01@1x.png` — confirmed failure

- All eight pairs (d03, d07, d11, d15 × f00, f02): `move` and `move_charges_0` **look the same** at native size. The top face and long side of the tan canister cover about 90% of what you see of the payload. The removed 0.02 BU end cap is under ~1 px and only faces two of the four diagonals anyway.
- This agrees with `pixel-diagnosis.json`: 805–1,234 changed pixels at 2× on ~8–9k covered pixels, and most of that is noise (d11 has only 18 pixels with a change greater than 8). I agree the FAIL stands and no pixel-difference threshold should replace it.
- Chassis, band and motion are unchanged. The body motion is modest, as in the original; that belongs to the frozen chassis, not this defect.

## Verdict for charge correspondence only

| Launcher | Verdict | Basis |
|---|---|---|
| IR | **Bounded pass** | 0/1/2 correct. First shot keeps group0. 1 vs 2 subtle at d07/d15 (frozen geometry). f03→`ready` continuity still to be spot-checked. |
| SY | **Bounded pass** (inspected tuples only) | Empty rails readable while deploying. Stowed end-on d03/d11 f00 is marginal but readable. Page 02 not seen by me. |
| US | **Not reviewed here** | Relies on the parent's `pilot-review.md` pass. |
| SA | **Fail** | 0 vs 1 not distinguishable. Needs the real open-shell correction and a native repeat. |

**Overall: conditional pass for the four-launcher charge contract.** It depends on (a) SA passing a v2 native repeat and (b) the parent/root spot-checking IR `fire_charges_1` f03 → one-charge `ready` f0. Full export, sparse-overlay use, Go event timing, ownership, replay/save and faction style stay separate gates. None of them is implied by this review.

## SA empty-canister correction: recommendation

### Geometry facts that shape the fix

From `candidate-vehicle_roster.py:465-467` with `cradle_len = 1.10`:
- `canister_0` is a solid box 1.045 × 0.16 × 0.16 BU, running from local X 0.0275 to 1.0725. X is measured from the erector pivot, and the muzzle end is at high X.
- `canister_team_0` is a **solid** 0.08 × 0.17 × 0.17 block at X 0.84–0.92. It is not a hollow ring.
- `canister_cap_0` (X 1.0725–1.0925) is the only payload object.

At native 1× the SA truck is about 50 px/BU. So the canister top is about 8 px wide in plan (about 3–4 px tall on screen at the diagonals), and any change confined to the end face is under 4 px and visible from only half the headings. **The readable surface is the top face.** Any correction that only opens the end face (the "even smaller open-cap" option) will fail the same way the current candidate did. I recommend against piloting it.

### Recommended smallest real solution: fixed open-top U-shell, no hinged lid in the first candidate

In the SA empty states only (`idle/move/damaged/deploy_charges_0`, `pack_charges_0` alias, and the exception `ready_empty`), hide `canister_0` and show one hidden-by-default named kit:

1. **Shell, open at the top and the muzzle end:** named floor, left and right side walls and a closed rear (pivot-end) wall, all exactly inside the original 1.045 × 0.16 × 0.16 outer size. Keep the outer faces coplanar with the old box.
   - Walls and floor **≥ 0.025–0.03 BU** thick, so about 1 px of paint-coloured rim survives on each side of the slot at 1×. A 0.02 BU wall falls below a pixel and the slot edges will blur.
   - Outer surfaces use the original `paint`. Inner faces and floor use a neutral dark matte (dark grey-brown, **not** pure black, team colour or emissive). Pure black risks reading as a sprite hole against terrain shadow.
2. **Band stays exactly as it is.** Because it is solid, it naturally plugs the channel at X 0.84–0.92 and reads as a strap/bulkhead across the open top. That leaves a dark slot about 0.81 BU long behind it (≈ 78% of the canister length, the dominant surface in every diagonal) and a short open section at the muzzle. No change to the team surface is needed or wanted.
3. **Omit the hinged inspection lid in the first candidate.** Reasons:
   - A lid hinged along its long edge and raised 60° adds about 0.14 BU of height. It also stands over half the opening from the hinge side, so the cavity would be hidden in the two headings where the viewer looks at the lid's back. That is exactly the heading-specific occlusion the brief asks us to avoid.
   - The lid adds a new shadow feature and new clearance, canvas and hardpoint risks.
   - The open U-shell alone casts essentially the same shadow outline as the solid box, so ghost-shadow risk is almost zero.
   - Only add the lid as a separate v3 if the parent's native repeat finds the open slot too weak. Even then, keep it within the proposal's limits (X clear of 0.84–0.92, Y within ±0.08).
4. Everything else stays exact: chassis, erector, buttresses, cradle, pivot, hardpoints, camera, anchor, clocks, and all US/IR/SY data.

A dark decal or colour change on a solid face does not meet the requirement. The cavity must be real geometry, so its inner walls shade differently at each heading and the raised erector (f05/f09, `ready_empty`) shows actual depth from the rear diagonals.

### The `ready_empty` exception

- **Required, and I endorse it** as the only change to an existing SA pose. Without it, `deploy_charges_0` f09 (open) → `ready_empty` (closed solid box) would visibly re-seal the empty canister at the end of deployment. The later `pack_charges_0` would then open it again.
- Privacy is unchanged: `ready_empty` is already chosen only for the owner's permitted 0-charge snapshot.
- Needs its own before/after record, kept separate from the 8,080-pose exact proof, as the proposal says.
- **Known discontinuity to inspect, not to fix by widening scope:** the unchanged generic SA last-shot `fire` ends on the closed box (cap hidden), then goes to the new open `ready_empty`. Opening right after a launch is physically plausible, but it is a visible pop. Recommend adding one reference pair per diagonal, `fire/dNN_f03` → `ready_empty/dNN_f00`, to the 32-pose native repeat. Do **not** change generic `fire`: it is the shared baseline for foreign viewers and outside this exception.

### Native repeat checks (additions to the proposal's 32-pose plan)

- Loaded/empty pairs at d03/d07/d11/d15 for `move` f00/f02, `deploy` f00/f05/f09, `damaged`, `idle` and `ready_empty` f0. Also the `fire` f03 → `ready_empty` f0 pop check above.
- Pass condition: the dark top slot is visible in **all four** diagonals at 1× without zooming. For `damaged_charges_0`, check that damage smoke/fire does not cover the slot every frame. If it does, that is an unchanged damage-animation limitation, not a cavity failure, but it must be recorded.
- Evaluated-mesh clearance between the shell and the cradle/buttresses when fully raised and during `pack`. The 16-heading bounds/reset proof stays mandatory.

## New defects vs unchanged limitations

- **New defects found:** SA empty-state unreadability only, which was already recorded. None in the inspected IR or SY cells: no clipping, leftover shadows, lost body parts or heading-specific occlusion introduced.
- **Unchanged limitations, not charge defects:** IR 1 vs 2 is subtle at d07/d15 because the tubes overlap in depth. SY's dark missile against dark rails gives low contrast when stowed end-on (d03/d11 f00). Body motion and damage animation are modest as in the original, and the chassis style is frozen.

No source authoring is requested or authorised by this review. The SA v2 candidate needs separate assignment by the parent.
