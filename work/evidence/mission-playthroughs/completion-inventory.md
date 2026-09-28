# Native mission completion evidence inventory

All **102 distinct combinations** passed the complete native
completion/save/replay/restart/failure assertions in five disjoint clean runs:
core57, capture9, defense12, assault18 and co-op6. Their successful logs are in
`runs/`; the five log records match each JSON completion tick, save tick and
final state hash exactly, without duplicate cases. This is within-build
simulation acceptance, not full product UI or release certification.

A failure diagnostic alongside an entry is a separate failed tactical attempt.
No practice state edits, fabricated completion, or driver resource grants occur.
Scenario-authored grants still obey the authored Go rules. The four-faction
Tutorial 5 variants count separately. The paid-replacement IR01 regression is
extra evidence and is excluded from the 102-case total. Optional awards below
are observed outcomes, not a claim every bonus is tested.

| Mission | Faction | Difficulty | Victory tick | Save tick | Earned optional IDs |
|---|---|---|---:|---:|---|
| convoy-union | US | easy | 10375 | 3788 | all-convoy-trucks |
| convoy-union | US | normal | 10085 | 3765 | all-convoy-trucks |
| convoy-union | US | hard | 10568 | 4164 | all-convoy-trucks |
| ir-01-forward-signal | IR | easy | 2019 | 1114 | recon-survives |
| ir-01-forward-signal | IR | normal | 2019 | 1114 | recon-survives |
| ir-01-forward-signal | IR | hard | 2019 | 1114 | recon-survives |
| ir-02-eyes-above | IR | easy | 2909 | 1265 | recover-drones |
| ir-02-eyes-above | IR | normal | 3043 | 1265 | recover-drones |
| ir-02-eyes-above | IR | hard | 2979 | 1265 | recover-drones |
| ir-03-beyond-the-basin | IR | easy | 745 | 601 | — |
| ir-03-beyond-the-basin | IR | normal | 745 | 601 | — |
| ir-03-beyond-the-basin | IR | hard | 745 | 601 | — |
| ir-04-hold-the-network | IR | easy | 14501 | 7305 | no-emergency-loss |
| ir-04-hold-the-network | IR | normal | 14501 | 7300 | no-emergency-loss |
| ir-04-hold-the-network | IR | hard | 14501 | 7303 | no-emergency-loss |
| ir-05-the-second-volley | IR | easy | 4418 | 1505 | — |
| ir-05-the-second-volley | IR | normal | 4784 | 1505 | — |
| ir-05-the-second-volley | IR | hard | 14628 | 1505 | — |
| ir-06-iron-signal | IR | easy | 5668 | 1500 | — |
| ir-06-iron-signal | IR | normal | 6083 | 1500 | — |
| ir-06-iron-signal | IR | hard | 7812 | 1500 | — |
| sa-01-arrival-point | SA | easy | 2246 | 1115 | apcs-preserved |
| sa-01-arrival-point | SA | normal | 2019 | 1114 | apcs-preserved |
| sa-01-arrival-point | SA | hard | 2019 | 1114 | apcs-preserved |
| sa-02-moving-shield | SA | easy | 2210 | 883 | repair-budget |
| sa-02-moving-shield | SA | normal | 2210 | 883 | repair-budget |
| sa-02-moving-shield | SA | hard | 2337 | 883 | repair-budget |
| sa-03-distant-depots | SA | easy | 1513 | 602 | — |
| sa-03-distant-depots | SA | normal | 2502 | 602 | — |
| sa-03-distant-depots | SA | hard | 2080 | 602 | — |
| sa-04-intercept-window | SA | easy | 12100 | 6107 | — |
| sa-04-intercept-window | SA | normal | 12100 | 6104 | — |
| sa-04-intercept-window | SA | hard | 12100 | 6100 | clean-interception |
| sa-05-three-positions | SA | easy | 6242 | 1143 | service-preserved |
| sa-05-three-positions | SA | normal | 7141 | 1143 | service-preserved |
| sa-05-three-positions | SA | hard | 7122 | 1143 | service-preserved |
| sa-06-shieldline | SA | easy | 10587 | 1509 | — |
| sa-06-shieldline | SA | normal | 19270 | 1503 | connected-routes |
| sa-06-shieldline | SA | hard | 24231 | 1503 | connected-routes |
| sy-01-workshop-foothold | SY | easy | 6364 | 433 | — |
| sy-01-workshop-foothold | SY | normal | 6373 | 443 | — |
| sy-01-workshop-foothold | SY | hard | 6063 | 445 | — |
| sy-02-supply-trail | SY | easy | 2256 | 893 | — |
| sy-02-supply-trail | SY | normal | 2256 | 893 | — |
| sy-02-supply-trail | SY | hard | 2206 | 893 | — |
| sy-03-three-crossings | SY | easy | 4875 | 602 | scout-mark |
| sy-03-three-crossings | SY | normal | 4875 | 602 | scout-mark |
| sy-03-three-crossings | SY | hard | 17243 | 603 | scout-mark |
| sy-04-open-doors | SY | easy | 12100 | 6103 | evacuation |
| sy-04-open-doors | SY | normal | 12100 | 6103 | evacuation |
| sy-04-open-doors | SY | hard | 12100 | 6103 | evacuation |
| sy-05-relay-break | SY | easy | 6419 | 1141 | — |
| sy-05-relay-break | SY | normal | 6520 | 1141 | — |
| sy-05-relay-break | SY | hard | 8344 | 1144 | — |
| sy-06-open-road | SY | easy | 11618 | 1505 | no-lost-raid |
| sy-06-open-road | SY | normal | 15523 | 1505 | no-lost-raid |
| sy-06-open-road | SY | hard | 10322 | 1505 | no-lost-raid |
| tutorial-1-give-an-order | US | easy | 351 | 111 | original-team |
| tutorial-1-give-an-order | US | normal | 351 | 111 | original-team |
| tutorial-1-give-an-order | US | hard | 351 | 111 | original-team |
| tutorial-2-operate-a-base | US | easy | 8894 | 912 | hauler-protected |
| tutorial-2-operate-a-base | US | normal | 8894 | 912 | hauler-protected |
| tutorial-2-operate-a-base | US | hard | 8894 | 912 | hauler-protected |
| tutorial-3-read-the-counter | US | easy | 1576 | 331 | apc-survives |
| tutorial-3-read-the-counter | US | normal | 1576 | 331 | apc-survives |
| tutorial-3-read-the-counter | US | hard | 1576 | 331 | apc-survives |
| tutorial-4-defend-the-sky | US | easy | 1065 | 642 | wing-safe |
| tutorial-4-defend-the-sky | US | normal | 1065 | 642 | wing-safe |
| tutorial-4-defend-the-sky | US | hard | 1065 | 642 | wing-safe |
| tutorial-5-command-a-match | IR | easy | 6832 | 1904 | command-intact |
| tutorial-5-command-a-match | IR | normal | 7047 | 1904 | command-intact |
| tutorial-5-command-a-match | IR | hard | 6203 | 1904 | command-intact |
| tutorial-5-command-a-match | SA | easy | 7792 | 1903 | command-intact |
| tutorial-5-command-a-match | SA | normal | 7666 | 1903 | command-intact |
| tutorial-5-command-a-match | SA | hard | 8154 | 1903 | command-intact |
| tutorial-5-command-a-match | SY | easy | 8079 | 1903 | command-intact |
| tutorial-5-command-a-match | SY | normal | 10288 | 1903 | command-intact |
| tutorial-5-command-a-match | SY | hard | 8335 | 1904 | command-intact |
| tutorial-5-command-a-match | US | easy | 6613 | 1904 | command-intact |
| tutorial-5-command-a-match | US | normal | 6645 | 1903 | command-intact |
| tutorial-5-command-a-match | US | hard | 7504 | 1903 | command-intact |
| twin-outposts | US | easy | 5108 | 996 | original-hqs |
| twin-outposts | US | normal | 4983 | 996 | original-hqs |
| twin-outposts | US | hard | 4829 | 996 | original-hqs |
| us-01-first-foothold | US | easy | 2481 | 1575 | engineering-rescue |
| us-01-first-foothold | US | normal | 2481 | 1575 | engineering-rescue |
| us-01-first-foothold | US | hard | 2481 | 1575 | engineering-rescue |
| us-02-open-corridor | US | easy | 2218 | 903 | all-trucks |
| us-02-open-corridor | US | normal | 2346 | 903 | all-trucks |
| us-02-open-corridor | US | hard | 2221 | 903 | all-trucks |
| us-03-relay-ridge | US | easy | 6010 | 1212 | — |
| us-03-relay-ridge | US | normal | 6118 | 1330 | — |
| us-03-relay-ridge | US | hard | 6118 | 1330 | — |
| us-04-broken-umbrella | US | easy | 14500 | 7304 | — |
| us-04-broken-umbrella | US | normal | 14500 | 7308 | — |
| us-04-broken-umbrella | US | hard | 14500 | 7300 | — |
| us-05-split-front | US | easy | 2531 | 1505 | no-transport-loss |
| us-05-split-front | US | normal | 2563 | 1505 | no-transport-loss |
| us-05-split-front | US | hard | 3012 | 1505 | no-transport-loss |
| us-06-clear-horizon | US | easy | 7763 | 1501 | site-before-launch |
| us-06-clear-horizon | US | normal | 10274 | 1501 | site-before-launch |
| us-06-clear-horizon | US | hard | 27091 | 1502 | site-before-launch |
