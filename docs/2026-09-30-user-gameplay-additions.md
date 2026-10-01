# User gameplay additions — 30 September 2026

This addendum records later user requests. Preserve the original handoff and game-design sources. These changes are authorized for implementation; they are not claims of completed or balanced gameplay.

## Starting money

Provide presets and an editable whole-credit amount for solo custom matches and private, unrated custom LAN lobbies. Every human and AI player starts with the same selected amount. Accept integer amounts from 1 through 1,000,000 credits; reject invalid input. The default is 6,000 credits.

Public configuration and lobby values are whole credits; Go converts once to fixed-point Money. Default values preserve standard-v2 behavior and canonical serialization. Nondefault custom matches use custom-v1. Campaign, tutorial, practice, ranked and resumed matches retain their prescribed budgets. The host owns LAN rule changes; readiness must reset when rules change. Saves, replays, rematches and displayed lobby rules must retain the selected amount without paying it again on restore.

## Faction colours

Give the four factions distinct military paint colours consistently across world actors, selection portraits, player setup and minimap. Preserve player-slot differentiation, especially when several players choose the same faction. Retain accessible ally/enemy symbols and the existing colour-vision option. Public owner identity determines colour; inspecting a foreign or captured actor must not use the viewer's faction. Unknown and neutral owners must have explicit safe presentation. The command interface keeps the approved charcoal, olive, brass and amber direction.

## Iran ballistic missiles

Present the existing stable IR.launcher as a Ballistic missile launcher. Keep its approved cost, tier, setup, two-charge storage, paid volleys, earned sight requirement, warnings and interception counterplay. This is the existing tactical missile layer, distinct from rocket artillery and the strategic Saturation Salvo.

## Shahed attack drone

Add a distinct stable IR.shahed unit while preserving the four existing reusable Iranian drones. Initial game values: 400 credits, 18-second production at a drone hub, tier 2, 140 HP, one Supply, 4.5 tiles per second and one terminal ground impact with 220 base damage and 1.2-tile splash. Apply the ordinary airground armour multipliers. These are game values awaiting actual gameplay and human balance review.

The drone is a physical air actor vulnerable to ordinary AA and fighters during approach. Commitment requires an earned visible legal ground target or point; it then approaches the fixed point and is consumed exactly once on impact. It cannot chase hidden actors, teleport damage, fire a second payload, rearm or repeat sorties after commitment. Return and Recall are available before commitment. The assigned hub slot remains occupied until terminal removal; hub loss clears stale ownership without changing the committed strike point. Supply, service ownership, paid provenance and commitment must survive saves/replays and be cleaned up exactly once after impact, destruction or endurance expiry.

The requested addition raises the original strict roster to 76 units, including 20 Iranian units, and 29 weapons. Presentation coverage becomes 163 IDs. Existing uniqueness, numeric validation, counterplay, deterministic simulation and complete-roster acceptance remain required.
