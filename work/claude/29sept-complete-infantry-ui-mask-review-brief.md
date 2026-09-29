# Frontline Command: completed infantry and private UI-mask review

Use exactly `claude-opus-5-5`, with fallback disabled. This is a fresh, bounded **read-only visual review**. Codex owns the sole Blender queue. Do not launch Blender, browser, game host, tests, image generation, subagents or another Claude process. Do not edit source, specifications, models, assets, manifests, old reports or frozen products.

Your only writable output is:

`work/claude/29sept-complete-infantry-ui-mask-review.md`

The prior `infantry-review084425Z` request hit quota before producing an accepted report. Its incomplete report/log and 22-role matrix remain historical evidence. This review uses the **complete 25-role matrix** below. All24 new infantry exports and original US rifle have full numerical/UI checks and bounded native reviews. That does not equal final visual acceptance. The game is an original stylized classic C&C-inspired RTS, not photorealistic; consult the existing inspected references in `work/claude/06-rts-reference-study.md` without browsing again.

## Questions to resolve

1. Review role and faction readability at normal world scale. Parent found AT launcher, reconnaissance antenna/optics, engineer pack and medic case readable. Palette distinctions are subtle at1x but visible2x. The original US rifle is materially thinner/simpler than the newer roster. Confirm the smallest useful alignment direction. Do not reject or request rerendering all24 unrelated exports without a specific visible defect.
2. Review the source mapping for original US rifle alignment. The already-supported `infantry_roster.build('US', {'role':'rifle'})` branch is the proposed starting point. The existing original and newer family rifle contracts have the same200 pose keys, six canonical states, frame timing,350mt radius and four cosmetic squad offsets. Canvas padding/anchor differ, but world scale and projected ground origin must remain unchanged. This is a proposal only: no new candidate has been written or rendered. Recommend a narrow isolated future source/spec scope and native pilot; do not author it in this review.
3. Assess whether elite/rifle and medic-case distinctions need a concrete follow-up. Distinguish small polish from a release-blocking role ambiguity. The supplementary sprite sheets are for phase/gear context, not permission to broaden this review to every raw frame.
4. Review UI mask derivatives. The actual unmodified game `ArtLibrary.cameo` multiplies mask RGB by team color. A stock Chrome154 static test rendered four representative roles in two colors using raw, luminance-only and the existing battlefield normalization.32 comparisons passed with zero errors, exact output alpha and no outside-mask changes. Parent and Codex observed a subtle hue/brightness improvement, especially the old rifle helmet, without a severe existing readability failure. Is the derivative-only normalized candidate appropriate, or does it flatten shading or overemphasize accents?

The private complete candidate has136 UI team images across exactly34 already-frozen roster handoffs.2x uses the existing battlefield grayscale/98th-percentile normalization;1x uses the approved premultiplied downsample. Every alpha/coverage byte remains unchanged, and all1,340 original source/spec/blend/served files remain SHA-exact. Original beauty and battlefield pixels, the live source and the v24 union are untouched. This is not a new material, model or world-sprite proposal. Broad promotion awaits this review and a separate approved publication step.

## Read only these nine useful images

Paths are relative to the repository. Do not open additional images unless one of these fails to load; report the missing image instead of launching a render.

1. `work/art/infantry-runtime-handoffs-v1/full-roster-review-v1/roles-and-factions@1x.png`
2. `work/art/infantry-runtime-handoffs-v1/full-roster-review-v1/roles-and-factions@2x.png`
3. `work/art/legacy-us-rifle-ui-v1/contacts/unit.US.rifle/packed-contact-unit.US.rifle@1x.png`
4. `work/art/infantry-runtime-handoffs-v1/historical/unit.US.elite/contacts/unit.US.elite/packed-contact-unit.US.elite@1x.png`
5. `work/art/infantry-runtime-handoffs-v1/historical/unit.US.medic/contacts/unit.US.medic/packed-contact-unit.US.medic@1x.png`
6. `work/art/ui-team-normalization-audit-v1/browser-v2/US.rifle-native-comparison.png`
7. `work/art/ui-team-normalization-audit-v1/browser-v2/US.at-native-comparison.png`
8. `work/art/ui-team-normalization-audit-v1/browser-v2/IR.recon-native-comparison.png`
9. `work/art/ui-team-normalization-audit-v1/browser-v2/SA.medic-native-comparison.png`

## Small source/receipt context

- `work/art/us-rifle-style-mapping-v1/README.md` and `source-map.json`
- `assets/pipeline/blender/models/infantry.py` and the US/rifle branches of `infantry_roster.py` (read only)
- `work/art/infantry-runtime-handoffs-v1/complete-handoff-index.json`
- `work/art/ui-team-normalization-audit-v1/browser-v2/result.json`
- `work/art/ui-team-normalization-audit-v1/normalized-roster-v2/result.json` (summarize the receipt; do not dump all hashes)
- `work/claude/29sept-complete-infantry-ui-mask-review-lock.json`

The lock records exact image and relevant source bytes for this review. Preserve authorship distinctions: original US rifle Claude source; shared newer anatomy authored by Codex during the user-authorized quota fallback; future Claude review/adaptation should be credited separately. Do not relabel all art as one author.

## Dedicated report

Write a short Markdown report with exact inspected image paths, a clear bounded decision for each of the four questions, concrete P1/P2 findings only where supported, and the smallest proposed follow-up scope. State what remains unreviewed. Do not call the full roster, actual game, animation timing, team/private-ammo behavior, multiplayer or release finished. Finish after writing this one report.
