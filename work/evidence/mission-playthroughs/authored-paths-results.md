# Additional authored-path evidence

Clean dedicated run: **14 paths PASS, 41.194 seconds**. This consists of 12
loss routes proving 11 distinct mission/failure predicates and two additional
optional victories, all on normal difficulty. These do not change the separate
102 main-completion matrix. Timing includes local work and is not a performance
benchmark. The compact log is `runs/frontline-authored-paths-clean14.log`.

Every loss record matches the clean log's mission, predicate, tick, midpoint,
and final hash. The named failure flag is true, the outcome is `mission_failed`,
and no submitted order is surrender. Ordinary sales are listed explicitly.
Every case's test also requires save/replay/restart hash equality.

| Mission | Failure predicate | Route | Failure tick | Save tick | Final state hash |
|---|---|---|---:|---:|---|
| convoy-union | convoy-1-lost | loss-convoy-one | 4209 | 991 | `e086ff70640fe6737e947bf12710545ec5b70a14146da2257677bb885848c917` |
| ir-02-eyes-above | launchers-lost | loss-launchers-lost | 2414 | 251 | `09d11cea204a06d0e50201681420a9051c59781bfdab5eeec2cf77e67553c117` |
| ir-03-beyond-the-basin | field-empty | loss-field-empty | 3941 | 501 | `5d8e6f4b3334f70ca37be3b82bfafe3ed2dcdc8575f97ef66e766d7f9df415b3` |
| ir-04-hold-the-network | network-destroyed | sale-network-destroyed | 307 | 126 | `0c7bf027122d383de7f0837988a579a871d7f52f90d1a2f163a0d91fd84c688f` |
| sa-04-intercept-window | defended-assets-lost | loss-defended-assets-lost | 1964 | 301 | `03eb9b246c4a6b67c21553bab7101915c10a4a0223edc802cd3a1c7dab9311f1` |
| sa-04-intercept-window | defended-assets-lost | sale-defended-assets-lost | 201 | 126 | `ae9c3b4e68ef9d7a5b2bb175cb25bbf88e696607dc8cae3aa3afeeed1a29b0b4` |
| sy-01-workshop-foothold | lost-recovery-rig | loss-lost-recovery-rig | 1545 | 522 | `e732f6f6d436d87e20a598e528c5ac941f87ad7cfc86eb2944cf02f358153bd6` |
| tutorial-3-read-the-counter | transport-team-lost | loss-transport-team-lost | 1064 | 251 | `51276f566a93e16c72e258b6b131dc3565caf83ab0108322b54ab25030d43e0a` |
| twin-outposts | western-hq-lost | sale-western-hq-lost | 201 | 126 | `9eb401261106e2a75ef687129d776c7942da28b6b4fc087eccbe3f44d5570277` |
| us-02-open-corridor | convoy-lost | loss-convoy-lost | 2128 | 251 | `5664ea7c2329217029152236acfdab14c169905942824fc0840e89c21f8fb64f` |
| us-03-relay-ridge | relay-destroyed | loss-relay-destroyed | 690 | 211 | `0b4159fbbe07fe128cdba5d7e4e7211ad005b768e5243f63bd0f8d8cd9207d4d` |
| us-04-broken-umbrella | airfields-lost | sale-airfields-lost | 307 | 126 | `d1acd86dcba0ab0b045b4b31fab7c20843487daa96878e252873ffee9486253b` |

| Extra optional victory | Award | Victory tick | Save tick | Final state hash |
|---|---|---:|---:|---|
| us-03-relay-ridge | scout-preserved | 6119 | 1331 | `69db04bd89e94f162e1fd3cdce266d7877a14804f014499af97eeea42f352733` |
| ir-03-beyond-the-basin | two-stations | 1708 | 593 | `3fbe816f7d8996f6ca1db0e7ce9725d2da84d48087b72a13715e4abf9e38fcb7` |

Test-driver SHA-256: `994c65dac321d937f3571585e2f89d8f8cf1d8e0d1d267ce3468bde392ed862f`. This identifies the driver source, not an immutable release binary.
