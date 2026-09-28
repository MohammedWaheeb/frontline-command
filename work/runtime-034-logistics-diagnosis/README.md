# Exact failed logistics trace — authorized progression diagnosis

Source lock `9fc013a3a9d130b2b345050369b6ee29e05d1df9c220b33519719e4c998b4814`.
Binary `d3227969d1063b8d66f76b6d441c741e6b125e17bfd2e08281d82fa5f1ae6287`.
Run `runs/20260928T211419Z-sy03-logistics-diagnosis/` passed at 21:14:40 UTC,
2026-09-28. One new test file replays the exact accepted commander ledger without
adding or changing a command. All 1,426 batches, tick 22,606 and final hash
`9af7b43aebb54f39f2ca036f7e151f251721ffe0dfb8eea5ff52b896ae6e63b9` match.
Eight authorized owner views at ticks 2k, 4k, 6k, 8k, 10k, 12k, 16k and 20k
are recorded; each read leaves its canonical state hash unchanged.

At tick 2,000 the player has five full-health tanks. By tick 4,000 only the two
western tanks survive, still at full health beside site 1. Several visible US
rifle/AT squads and a tank cross the home approaches. The permanent regional
allocation keeps the western mixed group at its quiet post while the home/east
groups lose their actors. At 6,000 the western tanks remain undamaged; the home
supply and factory are damaged. At 8,000 the home factory is absent. One remaining
western tank is damaged, while its owned repair truck has remained idle at home
through all these views. Later the forward supply is visibly captured by the
opponent. These are permitted observations, not a reconstruction of hidden
attacker targets or orders.

A bounded next commander correction can temporarily recall available regional
forces to visible armed threats near current owned HQ/production buildings, then
resume their normal posts. It must preserve normal commands and the original
mission deadline. This diagnosis proves the failed trace, not mission success.
Build 4.472 seconds; trace 16.895 seconds, shared-host correctness only.
