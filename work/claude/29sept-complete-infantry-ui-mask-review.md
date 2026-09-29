# Complete infantry and private UI-mask review (29 Sept 2026)

Reviewer: Claude (`claude-opus-5-5`, fallback disabled). This was a read-only review. I did not launch Blender, a browser, the game host, tests, image generation, subagents or another Claude process. I did not edit any source, spec, model, asset, manifest or earlier report. This file is my only output.

Authorship is kept separate. The original US rifle (`assets/pipeline/blender/models/infantry.py`) is Claude source. The shared newer roster anatomy (`infantry_roster.py`) is Codex source, written during the user-authorized quota fallback, as its docstring says. This review, and any future adaptation built on it, is new Claude work and should be credited separately.

## Inputs

These are the nine images from the lock `work/claude/29sept-complete-infantry-ui-mask-review-lock.json`. All nine loaded, so none are missing. I opened no other images.

1. `work/art/infantry-runtime-handoffs-v1/full-roster-review-v1/roles-and-factions@1x.png`
2. `work/art/infantry-runtime-handoffs-v1/full-roster-review-v1/roles-and-factions@2x.png` (the viewer showed it about 5% smaller, 2100→2000 px wide)
3. `work/art/legacy-us-rifle-ui-v1/contacts/unit.US.rifle/packed-contact-unit.US.rifle@1x.png`
4. `work/art/infantry-runtime-handoffs-v1/historical/unit.US.elite/contacts/unit.US.elite/packed-contact-unit.US.elite@1x.png`
5. `work/art/infantry-runtime-handoffs-v1/historical/unit.US.medic/contacts/unit.US.medic/packed-contact-unit.US.medic@1x.png`
6. `work/art/ui-team-normalization-audit-v1/browser-v2/US.rifle-native-comparison.png`
7. `work/art/ui-team-normalization-audit-v1/browser-v2/US.at-native-comparison.png`
8. `work/art/ui-team-normalization-audit-v1/browser-v2/IR.recon-native-comparison.png`
9. `work/art/ui-team-normalization-audit-v1/browser-v2/SA.medic-native-comparison.png`

Text context I read:
- `work/art/us-rifle-style-mapping-v1/README.md` and `source-map.json`
- `infantry.py`, in full
- `infantry_roster.py`: the `Soldier` class, `body`, `firearm`, `equipment` and `build` (lines 1–262)
- the first entries of `complete-handoff-index.json`
- `browser-v2/result.json`
- the `normalized-roster-v2/result.json` receipt, searched for key fields
- the relevant lines of `06-rts-reference-study.md`

I did not compute hashes myself. Byte-exactness rests on the lock and the Codex receipts.

**`normalized-roster-v2/result.json` receipt, summarized:**
- **Coverage:** 34 handoffs and 136 candidate files.
- **Unchanged masks:** every file has `alpha_changed_pixels: 0`, `coverage_changed_pixels: 0` and `non_gray_pixels: 0`. I searched for non-zero values of all three fields and found none.
- **Result:** `failures: []` and `protected_original_files_exact: 1340`.

**`browser-v2/result.json`:**
- **Result:** 32 cases, `status: passed`, `errors: []`, with 0 alpha changes and 0 outside-mask changes in every case.
- **Size of change:** the largest RGB change is 7–13 for luminance-only and 43–49 for normalized.

## Q1 — Role and faction readability at normal world scale

**Decision: the 24 newer exports are accepted for role readability at world scale. No re-render is requested. The only role-level outlier is the original US rifle. Faction separation is P2 polish.**

- **Roles that read at 1x (image 1):**
  - Recon: the antenna breaks the head line in every faction.
  - Anti-tank: the large tube and launcher mouth sit at the shoulder.
  - Engineer: dark boxy pack.
  - Medic: pale `aid` pack and case.
  - I agree with the parent's findings on these four. The SY portable AA is also distinct from SY AT: the tube is thinner and longer, with a battery.
- **Faction by uniform value (1x):** SY (brown) and SA (pale tan/grey) separate clearly. US and IR are the closest pair: both are olive with similar value. At 1x the only differences are IR's round helmet with collar, bedroll and jacket skirt, which are 1–2 px cues. At 2x (image 2) IR is visibly greener and the jacket skirt shows. This matches the brief: subtle at 1x, visible at 2x.
- **P2 (faction):** US and IR are hard to tell apart at 1x on neutral ground. This is not blocking, because team colour, selection and HUD carry ownership, and faction mixing between allies is an edge case. If it is tuned later, the smallest lever is one value/hue shift in `UNIFORMS['IR']` (for example, a greener or darker cloth). That would need its own isolated IR re-render. I am not requesting one now.
- **Original US rifle outlier (images 1–3):** it is visibly thinner. It has no plates, pouches, knee pads or haversack straps, and a plainer rifle. Most noticeably, its whole `chest_rig` and `helmet` use the `team` material (`infantry.py:31,35`). The newer roster uses small team accents: `helmet_team_crown`, `chest_team_marker` and sleeve bands. So at 1x the old rifle is the most team-coloured figure in the matrix and the least equipped. It reads as a different art family.
  - **Smallest useful alignment direction:** move `unit.US.rifle` alone onto the existing roster anatomy (see Q2). Do not restyle the others toward it.

## Q2 — Source mapping for aligning the original US rifle

**Decision: the proposed starting point is correct. Re-source only `unit.US.rifle` through the existing `infantry_roster.build('US', {'role':'rifle'})` branch.**

What the code gives:
- **The branch is sound.** In `infantry_roster.py:243-261` the US/rifle branch builds:
  - the US plate carrier, low-profile helmet with team crown, three mag pouches and knee pads (lines 107–115);
  - the standard carbine, with no elite `compact_optic` or `barrel_shroud` (lines 168–183);
  - the rifle `field_haversack` (lines 234–236).
- **No stray role gear.** The branch adds no antenna, binoculars, sabotage case or mission pack. It needs no roster source change and leaves the other 24 untouched.
- **Scale matches.** The two models are close: pelvis height .28 vs .26 and head/helmet radius .035/.046 vs .034/.043. So no model-scale factor is needed, and none should be added.
- **Contract matches.** Per `source-map.json`, both use the same six states and frame/fps/loop values, 200 poses, a 350 mt radius and the same four squad offsets. Only canvas and anchor differ: 152×120 @ (60,76) vs 192×160 @ (84,108).

Recommended future scope (to be written by Claude; this review does not author it):
1. **One new isolated spec** under a new `work/art/us-rifle-style-candidate-v1/` path.
   - It keeps ID `unit.US.rifle`, role, states, fps, pose keys, footprint, squad offsets and hardpoint names (`muzzle`, `healthbar`).
   - It points the model at `infantry_roster` with `faction: US`, `params.role: rifle`.
   - It adopts the family canvas and anchor 192×160 @ (84,108), since the other 24 already run on that metadata. It leaves camera, ortho scale and world scale unchanged.
   - No edits to `infantry.py`, `infantry_roster.py`, any live spec or the other 24 specs. The live `unit.US.rifle` spec and pixels stay as they are until promotion.
   - If the pilot shows that the pipeline cannot route this through a spec alone, stop and bring a minimal wrapper module under the new path back for review. Do not modify the roster module.
2. **Gates before a native pilot** (the checks already listed in `source-map.json`):
   - bounds, reverse reset and hardpoints for all 200 poses;
   - parity checks showing the geometry, poses and materials of the other 24 roles are byte-identical.
3. **Native pilot** (with Codex's Blender queue), a small set only:
   - old vs candidate idle, move, fire, cover and death for d01 and one diagonal, at 1x and 2x on the world background;
   - portrait and build cameo in two team colours;
   - context row: US AT, recon and elite plus the IR, SY and SA rifles.
   - **Measure:** projected ground origin, meaning the feet sit on the same world point after the anchor change; the standing pixel height (expected within about ±1 px at 1x); and the healthbar hardpoint.
4. **Explicit trade-off to check in the pilot:** the candidate has much less team-coloured area than the original. It matches the family, but team ownership of the US rifle squad at 1x will read weaker than today. Accept this only if the matrix shows it reads like the other US roles. Do not enlarge team accents for this one unit alone.

## Q3 — Elite/rifle and medic-case distinctions

**Decision: both are P2 polish, not a release-blocking ambiguity. No follow-up now. I propose one optional, narrow elite cue for later.**

- **Elite vs rifle (images 1, 2, 4):**
  - **What distinguishes it:** the elite has `compact_mission_pack`, shoulder guards, knee pads, a barrel shroud and a compact optic, all in the darker `armor` material.
  - **At 1x:** the distinction is mostly a darker, bulkier torso value. The optic and shroud are sub-pixel, and the carry pose is the same as the rifle.
  - **At 2x:** shoulder guards and the mission pack are visible.
  - **In motion:** the elite contact sheet shows it has its own `work_sabotage` state, which separates it in play. Idle/move/fire silhouettes are close to the rifle's in every direction.
  - This is not blocking, because production cameos, selection and HUD identify the unit.
  - **P2, optional:** if a silhouette cue is wanted later, the smallest one sits above the shoulder line, which is what reads at 1x. For example, enlarge `folded_optics_mount` (line 209) into a helmet-mounted optic, applied in all four factions' elite. It would be a separate isolated elite-only spec/source candidate with its own pilot.
- **Medic (images 1, 2, 5, 9):**
  - The pale `aid` backpack and case read as the lightest mass in US, IR and SY rows, and in every direction and phase of the medic contact sheet (idle, move, cover, death, `work_heal`).
  - The case is held low and sometimes hidden by the body in back-facing directions. The backpack carries the read there, so that is acceptable.
  - **P2:** in SA, uniform `#B2A286` vs aid `#C8C4AD` gives the lowest contrast of the four. The SA medic still separates from the SA engineer (dark pack) at 1x, but more weakly.
  - No change is required. If tuned later, darken only the SA medic pack flap or satchel flap, not the shared `aid` material.
  - Do not add a red-cross emblem. It is a protected emblem, and team-coloured bands are the correct stylized route.

## Q4 — UI mask derivatives

**Decision: the derivative-only normalized candidate (2x world normalization, then the approved premultiplied 1x downsample) is appropriate to put forward to the separate publication step. It does not flatten shading or noticeably overemphasize accents.**

Evidence from images 6–9 and the receipts:
- **Shading is kept.** Helmet domes still show a highlight-to-shadow gradient. The US rifle chest panel, SA medic case band and shoulder band still show face-to-face value steps. Measured changes stay confined to the mask (0 alpha changes, 0 outside-mask changes, 0 coverage changes, grey-only masks).
- **Colour gets closer to the battlefield sprites.** Raw masks make `#d54435` look dull brick and `#287bd1` look slate-blue on dark accents. Normalized is closer to the requested team colour and to the battlefield normalization. The biggest gain is the old US rifle helmet and chest in both colours. The small accents on US AT (helmet, launcher sleeve) and IR recon (helmet, sleeve, radio panel) become readable at the 1x build size.
- **No overemphasis seen.** On SA medic, the case band and shoulder band get brighter without glowing or losing their edges against the grey pack. The largest team area (old US rifle chest plus helmet) is brighter but still shaded, not a flat block.
- **Luminance-only adds little.** It is almost identical to raw (≤13 RGB), so it is not worth promoting separately.

Conditions and limits:
- **Only two team colours were checked**, a mid blue and a mid red, on four infantry roles. Before publication, run one bounded static check with the lightest and darkest team colours the game uses (for example yellow/white-ish and a dark colour), on these four roles plus one vehicle cameo. It should confirm there is no clipping or banding at the 98th-percentile stretch.
- **The US rifle's normalized UI images depend on the rifle decision.** If the Q2 candidate is promoted, its UI derivatives must be regenerated from the new source. Until then, the current normalized US rifle images are a valid interim baseline.
- **Coverage is partial.** I viewed only the four infantry comparisons. The other 30 handoffs' derivatives (aircraft, tanks, ABM, strike and the rest of the infantry) are covered only by the numeric receipt, not by visual review.

## Findings

- **P1: none.** No release-blocking role ambiguity or mask defect was found in the reviewed images.
- **P2-a:** the original US rifle is materially thinner and simpler than the roster, and uses large team-material areas. Fix: the isolated re-source in Q2.
- **P2-b:** US and IR uniforms are hard to tell apart at 1x. Optional future `UNIFORMS['IR']` shift.
- **P2-c:** at 1x the elite differs from the rifle mainly by value. Optional elite silhouette cue above the shoulder line.
- **P2-d:** the SA medic's pale pack contrasts weakly with the pale SA uniform. Optional SA-only flap darkening.
- **P2-e:** normalized UI masks are checked in two team colours only. Add an extreme-colour static check before publication.

## Smallest proposed follow-up

1. Author one isolated `unit.US.rifle` candidate spec on the `infantry_roster` US/rifle branch, with the family canvas and anchor and no source edits. Then check parity and gates, then run the small native pilot described in Q2. Claude authors it; Codex runs the Blender queue.
2. Run a separate extreme-team-colour static check on the normalized UI candidate. Then take it to the separate approved publication step.
3. Park P2-b, P2-c and P2-d as optional polish, each as its own isolated candidate if taken up.

## Not reviewed and not claimed

- The actual running game: HUD, sidebar or selection context, lighting over real terrain, zoom levels and fog.
- Animation timing and motion quality. I only saw static contact frames, and only for three IDs.
- Contact sheets for the other 22 infantry IDs, and every raw frame.
- Normalized UI derivatives for the 30 handoffs outside the four inspected roles.
- Team colours other than `#287bd1` and `#d54435`.
- Team/private-ammo behaviour, gameplay, multiplayer, performance and release readiness.

The full roster, the UI candidate and the US rifle alignment are **not** finished or accepted for release by this review.
