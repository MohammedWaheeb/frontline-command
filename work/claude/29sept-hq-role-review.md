# HQ role review — US / IR / SY / SA (29 Sept, claude-opus-5-5, read-only)

Scope: this is a proposal and review only. It does not authorize authoring and it does not certify final art. I inspected the nine locked images: the four-role comparison at 1x and exact 2x, SY poses 01–03, the SY UI contact, IR poses-02, the US UI contact and SA poses-02. I also read the shared HQ branch (`building_roster.py:359-389`, f69 source in the SY handoff stage), the state posing (`building_common.py:123-163`) and the US `build_hq` height and critical-hide sets. Nothing was rendered, run or modified.

## Verdicts at normal 1x

| Faction | Command/recovery anchor at 1x | Identity beyond palette | Verdict |
|---|---|---|---|
| US | Yes. The glazed tower (cab top about 2.1, rig height 2.5), lattice mast, helipad, vehicle bay and sandbag line fill the 4×4 pad. It is still the tallest and busiest silhouette at the smallest build icon. | Yes: air-control tower plus helipad. | **PASS** |
| IR | Yes. The ribbed command drum with glazing, team band and cap tops out near 1.8, the dish raises the rig to about 2.67, and the garage annex fills the east side. The drum stays the dominant mass in every pose on poses-02. | Yes: tapered IR shell, ribbed drum and dish. | **PASS** (bounded correction confirmed from pixels) |
| SY | No. The solid mass stops at about 1.45. The watch room is 0.55×0.60 and reads as a roof pod or chimney. Only the thin mast and paddle reach 2.3, and at 1x they read as a sign rather than as mass. The command house covers about ⅓ of the pad. West, east and rear are bare concrete. In the four-role row it reads as a workshop or barn, with the same vocabulary as the SY repair shed, so it can be mistaken for another SY building. | Partial. The corrugated ribs, roof patch and brick patches clearly read as improvised. That is material identity, not command identity. | **HOLD** |
| SA | No. It is a flat plain box with a squat gold octagonal cab whose solid top is about 1.6. The pad is also about ⅓ covered. At 1x the buttresses are almost invisible. The sunshade reads as a single line. | Weak. The gold octagonal cab carries almost all of it, which is mostly palette. The paddle on top is the same shared `mast()` radar paddle as SY, so the two tops are near-identical at 1x. | **HOLD** |

Root cause, from the pixels and the source together: the SY and SA branches reuse the outpost-scale recipe. Both use the shared 2.5×2.1 `command_house`, one small roof element and the default `mast()` paddle. The pad is 4×4, so most of it stays empty. IR passed because it added a second full-height mass (the drum) and an annex that fills the pad. US passed because it has a tall tower plus pad-filling ground features. The problem is not overall scale or the tip height.

## State readability: real defects vs. modest but functional motion

- **Functional, keep as is (SY/SA):** foundation, the 8 construction frames (the scaffold, crane and staged cut read well), the 8 idle frames of paddle rotation, lowpower (dimmed lamps), disabled (dark paddle and lamp), the 6 produce frames, damaged (roof slab and vents removed, heavy grime), and the generic rubble field. The idle and produce motion is modest, a single paddle, but it is readable. Do not add motion for its own sake.
- **Real defect, SA critical:** only the paddle rotor disappears. The cab, glass and gold cap stay intact, so at 1x critical looks like damaged plus darkness. It does not meet the existing "critical must visibly lose a roof/tower element" rule.
- **Marginal, SY critical:** the roof slab goes but the ribs remain, and the watch room survives. It passes the rule, but the loss is small because the element is small.
- **Not a defect:** produce vs. idle look nearly identical on the HQ. That is acceptable because an HQ has no production doorway animation requirement beyond clearance.
- **No blanket rerender:** nothing here justifies re-rendering the other 57 buildings. The defect is confined to two HQ branches.

## Smallest corrections that fix identity (proposal only)

Hard constraints for both corrections:

- Keep the 4×4 footprint, `pad`, world scale and ground anchor.
- Keep the `command_house` block and `command_entry` door exactly as they are.
- Keep the front door apron clear: no new geometry in x ∈ [−0.35, 0.55], y < −1.0.
- Keep the lamps at (±1.84, −1.85) and the crate at (1.3, −1.4).
- No whole-model scale-up and no US-style glazed control tower.
- The new solid top should reach about 1.9–2.1. The rig `height` must stay ≤ 2.67 (IR's accepted value) so the already-proven atlas cell does not clip.
- All new geometry goes in `structure`, so construction slicing, rubble hiding and the construction cut work unchanged.

### SY — "improvised signals compound"

1. **Replace the small `watch_room` with a stacked command post** at the rear-west corner of the house, around (−0.95, 0.50):
   - A roughly 0.85×0.80 brick-and-render block about 0.95 above the main roof, built through `block()` so it keeps SY ribs, patches and brick.
   - A sandbag parapet ring on top, using the bunker's sandbag vocabulary.
   - This is SY's first second-storey mass. It reads as an occupied command floor, not a pod.
2. **Add a guyed yagi/radio mast in the SY producer vocabulary** (`sy_radio_mast`, crossbar and elements, static) on a low lean-to radio shack on the bare east strip, around x ≈ 1.55, y ∈ [−0.3, 1.2], height about 0.5, with a canvas awning over its west face. The awning stays clear of the door lane. This gives SY a second vertical that differs from SA's.
3. Keep the existing rotating `mast()` paddle on the new post so the idle and produce motion and their timing do not change.
4. **Damage and critical consequences:**
   - Damaged: the awning and parapet sandbags are added to `detachable`.
   - Critical: the upper storey's roof and the yagi mast are added to `critical_hide`, alongside the rotor that is already there.
   - No new broken-only meshes.
   - Result: critical visibly loses the top storey's cap and the comms mast.
   - Rubble is unchanged.

### SA — "buttressed command keep"

1. **Raise the octagonal cab onto a stepped, buttressed octagonal plinth** at the same (−0.4, 0.2):
   - An 8-sided plinth about 0.56 wide and 0.45 tall, with four slim buttress fins. This follows the SA producer tower and battery perimeter vocabulary.
   - The existing cab, glass and gold cap sit on top, so the gold crown ends at about 2.0.
2. **Replace the paddle on the SA HQ with a rotor built locally in the branch.** It carries a tilted phased-array face, using the `sa_roof_array` and `sa_array_face` vocabulary with the `lens` material. It gets the same spinner registration and `critical_hide`. **Do not edit the shared `mast()`.** The rotation keeps the same frame count.
3. **Add a low buttressed flat-roof wing on the east strip**, around x ∈ [1.15, 1.9], y ∈ [−0.6, 1.3], height about 0.55, with a thick canopy lip matching the SA producer bays. It fills the empty pad like IR's annex, but uses SA massing instead.
4. **Damage and critical consequences:**
   - Damaged: the wing canopy is added to `detachable`.
   - Critical: the cab cap, gold crown and array rotor are added to `critical_hide`. The plinth and cab shaft stay.
   - Result: critical visibly loses the command crown, which fixes the SA critical defect.
   - Rubble is unchanged.

Neither correction adds gameplay, hardpoints, doors, production behavior, real insignia or new mechanics.

## Future ownership and parity scope

- **Source owner:** the edit goes only in `Architect.make()`, in the `role in ('hq','outpost')` branch of `building_roster.py`, and only inside the `faction=='SY'` and `faction=='SA'` arms.
  - **Required:** gate every new line with `and not small`. Today's SY and SA arms also run for outposts (the SY watch room already does), so an ungated edit would silently change `building.SY.outpost` and `building.SA.outpost`.
  - IR, US (`us_buildings.py`), the outposts, every other role, `mast()`, `block()`, `building_common.py`, specs, the manifest and gameplay must all stay untouched.
- **Parity proof before any render:** the source diff must be confined to those gated lines. The object/mesh dump for `building.SY.outpost`, `building.SA.outpost` and `building.IR.hq` must be identical before and after. This settles the fact that the shared file's hash changes without re-rendering any of the other 59 buildings.
- **Rerender scope after real geometry and native proof:**
  - `building.SY.hq` and `building.SA.hq`: all 8 construction frames (the cut follows `rig.height`), idle, lowpower, disabled, damaged, critical and produce, plus the 20 UI checks and the four-role comparison.
  - Foundation and rubble should come out byte-identical; verify that rather than assume it.
  - Re-run the 28 pose, 24 integrity and 20 UI checks for those two buildings only.
- **Preserve:** the current SY and SA HQ exports stay as the mechanical baseline. US and IR evidence, the failed-contact record and all original sources stay as they are. Acceptance of the SY and SA identity gates needs a new 1x four-role comparison after the change. This review does not grant it.
