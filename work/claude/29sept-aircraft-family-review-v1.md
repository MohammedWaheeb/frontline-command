# Aircraft family native review — available7-v1

Reviewer: Claude, exact model `claude-opus-5-5`. Read-only visual review, 29 September 2026.

## Coverage limit

I inspected `work/art/aircraft-family-native-review-v1/available7-v1/family-0{1,2,3}@{1x,2x}.png`
against `result.json` and the README. The sheet covers seven completed exports (US fighter, gunship and airlift; IR fighter, strike, gunship and ISR). It shows heading 3 only: loaded flight, empty flight or parked, and service frame 3.
The sheet composites everything at ground level on a flat tan field. It does not show flight altitude, terrain, other headings, animation, selection rings, the HUD or the real renderer. Five aircraft are absent: US.strike, SA.fighter, SA.strike, SA.gunship and SY.scout_drone. Nothing below means the aircraft roster or the game is accepted.

## Per-family observations

**US.fighter (family-01, row 1).** This is the strongest silhouette in the set: a swept delta with canted twin amber tails and a dark gunmetal body. It reads as a jet interceptor at 1x. The service cart is light grey/white, sits off the nose and is obvious at both scales. At 1x, loaded and empty flight look the same. At 2x the underwing stores differ by a few pixels at most, and I could not reliably tell the two apart.

**US.gunship (family-01, row 2).** The translucent main-rotor disc, stub wings with amber tips, tail fin and narrow nose clearly separate it from the fighter and the airlift. It reads as an attack helicopter. The service cart matches the fighter's and reads clearly. Loaded and empty are practically the same at 1x and 2x.

**US.airlift (family-01, row 3).** A bulky tandem-rotor hull, clearly separate from the gunship by mass and rotor layout. States separate well: hover has rotor discs and no gear, parked has stopped blades and gear down, and service adds a dark cart by the nose. The amber stripe along the hull reads at 1x.

**IR.fighter (family-02, row 1).** An olive tailless delta with one fin and a dorsal intake. It is clearly a different design school from the US fighter and still reads as a fast air-to-air craft. The dark gunmetal service rig on a boom reads at 2x and is just readable at 1x. Loaded and empty cannot be told apart.

**IR.strike (family-02, row 2).** A light twin-boom propeller drone with amber wingtip patches. The prop cross makes it read as a drone rather than a jet, which fits the design's cheap strike drone (750 credits). It is the smallest airframe on the sheet, slightly smaller than the IR fighter and clearly smaller than the unarmed ISR. The service cart and hose read at 2x and are marginal at 1x. Loaded and empty cannot be told apart.

**IR.gunship (family-02, row 3).** A twin ducted-fan loiter craft with a small cyan thruster glow. It is the most distinctive IR silhouette and nothing else in either faction looks like it. The service rig sits between the fans and reads at 2x. At 1x it partly merges with the left fan. Loaded and empty cannot be told apart. The cyan is a small emissive effect, not UI chrome, so it does not conflict with the no-blue-chrome rule.

**IR.isr (family-03).** A long straight wing with a slim fuselage and a V-tail. It reads well as a high-endurance survey drone and clearly differs from the IR strike drone. Its states do not separate (Finding 1).

**Family coherence.** All seven share one key light, one shadow direction, one level of low-poly faceting, matte panel shading and amber team patches. They look like one classic RTS roster, closer to Generals than to photorealism. Factions split cleanly: US is cool gunmetal with larger, heavier airframes; IR is olive with lighter, drone-like, mostly smaller airframes. Scale is consistent within each faction. The team amber reads on every craft at 1x, but the IR fighter and ISR patches are small, so tint identification depends on the patch plus the runtime selection and ownership indicators.

## Prioritized findings

1. **Medium — needs a source-art fix: IR.isr service is indistinguishable from parked and flight.**
   Images: `family-03@1x.png` and `@2x.png`, all three cells. The only difference in `rearm/d03_f03` from `parked/d03_f00` is a light speck of about 1–2 px near the nose (1x). The flight and parked cells differ only by small landing gear.
   The other six aircraft all show an external service cart or rig, so ISR is the one family member whose service state has no visible cue. On a crowded drone hub, a player cannot tell by eye whether a survey drone is being serviced or just parked. The owner HUD service indicator helps once the unit is selected, but not for the pad-level read the rest of the family already gives.
   ISR is unarmed, so adding a service prop has no effect on payload or ammo semantics. It also reveals nothing an enemy could not already infer from the drone sitting on a pad.

2. **Low — HUD carries it, no source fix: loaded and empty flight are practically the same for all four armed craft.**
   Images: `family-01` rows 1–2 and `family-02` rows 1–3, columns 1 vs 2, at both scales. I would not call payload readable at 1x, and even at 2x I could not reliably find the difference.
   Empty-state art is selected only for the owner. Making the empty state strongly visible would risk implying information enemies should not have. An accurate owner-side ammo or "returning to rearm" status in the selection tray and unit pips therefore plausibly carries this state, and I do not request a source change.
   Condition: that HUD status must actually exist and be verified in a real gameplay capture. These sheets cannot show that.

3. **Low — note only: IR.strike is the smallest airframe on the sheet, including against the unarmed ISR.**
   Image: `family-02@1x.png` row 2 vs `family-03@1x.png`. This matches its low cost and drone role, and the twin-boom prop silhouette still reads. It is not a blocker. Check whether it stays pickable at real flight altitude and zoom in the next renderer capture before considering any change.

4. **Informational — service cart value contrast differs by faction.** The US carts are light grey/white and are the brightest objects in their cells. The IR rigs are dark gunmetal. This reads as faction flavor and is acceptable. For future carts, keep the US cart from outshining the amber team patches.

I saw no family-level blocker to coherence, silhouette or role separation in these samples, within the coverage limit above. Finding 1 is the only source-art fix I consider warranted.

## Next bounded authoring slice (for Finding 1 only)

- **Asset/state:** `unit.IR.isr`, `rearm` state, all headings and frames of that state only.
- **Change:** add a small ground service prop, reusing the dark gunmetal IR service rig design from IR.fighter/IR.strike `rearm`. Use a low cart plus a boom or umbilical to the fuselage underside behind the nose, placed off the port wing root so it doesn't hide the wing silhouette. The prop should occupy about 12–18 px at 1x, comparable to the IR strike cart.
- **Preserve:** the airframe pixels, team patch placement and anchor in every `rearm` frame. Leave all `fly` and `parked` frames byte-identical, and keep the handoff tuple layout. Do not add anything to any armed aircraft's empty state.
- **Comparison:** reuse the same native compositor with no resampling. Make one row with `unit.IR.isr parked/d03_f00`, `unit.IR.isr rearm/d03_f03` (new) and `unit.IR.strike rearm/d03_f03` (reference) at 1x and 2x, plus one extra heading (for example d07) of ISR parked vs rearm, to check that the prop doesn't clip or merge with the wing. Write it to a fresh output directory and leave `available7-v1` unchanged.
- **Pass criterion:** at 1x, ISR parked and ISR service are clearly different by eye with no zoom, and the prop matches the IR rig style.
