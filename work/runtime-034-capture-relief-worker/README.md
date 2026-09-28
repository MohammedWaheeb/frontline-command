# Mid-capture repairer relief — reaches objective, lacks firing unit

Source `31f251c054bb7ef8bdeac86ed2fd82630d76a708645ec04e9fe276d85aafdfa2`;
binary `f743dd4a00a1c7f1b73b1b715d090fddc65450c52cd354151eecc3033ef68581`.
Existing safe current-view repairer selection is reused inside capture replacement.
It legally reassigns engineers2186,86,45 at8782,9803,10108 after prior workers
are lost. At11188 engineer45 is alive/full health near the visible third radar76,
which remains hostile at374health. Factory79 remains owned/full health, first
relay full and second388. The quarter-health firing wait expires nonterminally:
no free tank remains. Healthy AT977 still guards the quiet full first relay;
the only other tank has8health. Actual support/capture rules allow ordinary AT
fire against the radar, but the commander hardcodes tank-only replacement.

Next scoped policy can reassign a current healthy AT from a quiet intact own
site, respecting its real attack preview. AT cannot force-fire (only shell/cannon
may do so); the firing stop must use an ordinary rear Move instead. Existing
2400 firing wait, actual damage/capture thresholds and all mission rules stay.
Exact failed source/binary/state/view/ledger preserved; no completed route claim.
