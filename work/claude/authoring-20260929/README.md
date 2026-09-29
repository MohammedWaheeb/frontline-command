# 29 September exact-model review and source revisions

Claude access recovered after the scheduled reset and AC power returned. All four fresh reviews and the first four source-authoring requests completed using **exactly `claude-opus-5-5`**, with fallback disabled. The actual assistant and usage model fields, terminal status, exit codes and immutable-input hashes are checked in each model audit. This is not a render or product acceptance claim.

The completed requests cover the presentation, headquarters silhouettes, launcher charge states, and infantry/team-mask consistency. The review reports are under `work/claude/29sept-*`; their source candidates remain private:

- `work/claude/presentation-polish-v1`: four production-file changes plus CPU tests. Both TypeScript checks pass. Corrected preparation supplies all external fixture inputs; 482 of 483 tests pass, with one authored test confusing remembered and unknown fog. A reachable mission-caption overlap also requires correction. A separately frozen v2 request addresses those issues. The original report's strike-caption overlap was refined by independent review: ordinary strike review clears targeting first, so that particular new overlap has not been demonstrated.
- `work/art/hq-role-candidate-v1`: separate SY signals compound and SA command keep, gated to headquarters; source checks precede evaluated parity, clipping, pilot and full render acceptance.
- `work/art/ground-launcher-charge-contract-v1/sa-empty-candidate-v2`: open-top empty canister shell; complete state parity and readable native pilots remain required.
- `work/art/us-rifle-style-candidate-v1`: maps the old US rifle to the existing consistent infantry roster model, preserving its pose count, unit footprint and squad configuration. New exports and UI masks remain required.

The exact first-eight request logs are preserved losslessly in `completed-first-eight.tar.gz`, alongside the first presentation delta and original before files. `completed-first-eight-files.json` records every archived byte count and SHA-256. Existing raw logs remain on disk. The dispatcher does not permit Bash, other agents, model fallback or live product changes for these authoring requests. Root and the validation agents run the checks independently.

No candidate here has been promoted on the strength of a Claude completion message. No deployment occurred.
