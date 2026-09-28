# Factory infantry screen — preserved real defeat

Source `86c16554bb6b50d9a58395f267fd629509f291f806295f5e107e0a0634cca064`;
binary `120dae611a571b0ec65f2f0137dd5e7e7f328c4b91ef5939877d2db3b6e25c36`.
Factory captured at 3393, second relay at 7032; relay destruction causes real
mission failure at 7411. Factory remains owned at 63 health. Exact final owner
view/save/ledger and unchanged source/binary verification are retained.

The rifle Guard screen used L1 normalization, so its diagonal offset is shorter
than three Euclidean tiles. The visible AT at (59092,86999) is 8.95 tiles from
factory (50500,89500), but about 6.6 from that screen anchor: outside Guard's
six-tile leash. Armor still anchors directly at the building and also cannot
engage visible long-range ground attackers. A separate test-only successor uses
an ordinary three-tile Euclidean screen toward a current visible ground threat
for armed defenders, with focused geometry checks. No simulation, mission,
resource, cost, capture threshold or wait-budget change. Shared-host correctness.
