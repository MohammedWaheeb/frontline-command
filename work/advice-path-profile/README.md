# Exact multiplayer advice-path profile

Prepared test-only successor to frozen `work/navigation-lookup-candidate/source`:
356 original files must match source-lock SHA-256
`c7e0d79d1770491cc867037b7c0c69b31ce16738885022130dc3fea59c37d122`.
Only `pkg/sim/advice_path_profile_test.go` is added. No shipping source, protocol,
version, mission, deadline, save or command authority is changed.

Inputs are byte-for-byte copies of the actual three-human match's midpoint at
8037 and final16074, with exact original paths/digests in `input-lock.json`.
The midpoint has55 actors and all three humans active; the final has43 actors,
two defeated players and a finished match. Final-state errors are measured as
terminal errors; no player is reactivated to manufacture a valid batch.

The new test checks full-save versus compact-advice output for actual recorded
batches that are still valid at the midpoint, owned affordances, normal contextual
move candidates derived only from current own positions, and the32-candidate
request bound. It preserves every source save/hash/authorized view and verifies
foreign selections never expose affordances. Candidate32 is explicitly a bounded
repeated normal-move probe, not32 historical player commands.

Stages: SaveForAdvice, full/advice Restore, map validation, state validation,
visibility, owned affordances, actual valid recorded sequential batches, one/32
contextual candidates, and owned stop validation on a detached clone. No tick is
advanced. The detached stop probe separates execution checks from Restore;
repeated spending commands would change clone state and are not used for it.

Execution was held until the separate four-human product match and its replay
audit closed. Measurements are shared-host diagnostics, not quiet reference
performance or a justification to remove validation/privacy rules. The completed shared-host observations and limitations are documented in
`docs/advice-path-performance.md`; the initial invalid test assumption remains
preserved as a separate failed run.

## Original combined runtime comparison

`advice-path-source-comparison.json` confirms the exact older combined0.3.4
source and navigation successor share byte-identical advice capture, sequential
preview, independent candidates, affordances, production advice, Restore/map/state
validation, server advice handler and match actor. They are not different advice
algorithms. The newer server snapshot codec is a direct explicit protobuf mapper;
the older active product still marshals JSON and reparses it with protojson.

The two-second HTTP context includes actor scheduling/waiting, capture, detached
work and ambient allocator/GC contention. These microbenchmarks isolate particular
work; they cannot establish where a past live timeout spent its time, reproduce
concurrent host pressure, or prove a deadline is too short. No clone redesign or
weaker validation is authorized by source inspection alone.
