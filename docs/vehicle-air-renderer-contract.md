# Vehicle and aircraft presentation integration contract

This is a handoff for existing Go-authorized snapshot fields, not new gameplay.
The source candidates are frozen in the two roster source locks. They are not
shipping sprites yet. Keep the separately validated hull/turret ground-shadow
layering. Do not switch any legacy sample to a new model implicitly.

## Ground source plates

All 27 new ground models use 16 hull/body headings. The 17 turreted variants use
32 turret headings for `aim` (1 frame, static) and `fire` (3 frames, 15 fps,
one-shot). `turret_pivot_mt` is signed simulation XY; turret height is already
rendered. Live hull plates contain no turret or turret shadow. Turret plates
include their independent shadow. Wrecks are whole assemblies and hide the
live turret. APC `doors_open` and SA tank hull-down plates remain hull-only.

| Applicable IDs | Source state and timing | Permitted trigger |
|---|---|---|
| all four new launchers | `deploy`: 10 frames, progress-driven; `pack`: reversed deploy | public `state=deploying/packing`, `progress`; never wait for art before accepting Go movement |
| all four new launchers | `ready_empty`, `ready`: one static frame; IR also `ready_two_charges` | `deployed` plus **owner-private** `charges` 0/1/2; no private data means generic deployed equipment, never inferred count |
| all four launchers | `launch` / `fire`: 4 frames at 12 fps; IR `volley`: 6 frames at 12 fps | authorized `weapon_fired` event; feedback never adds damage/projectiles |
| US/IR/SY/SA APC | `doors_open`: 4 frames at 10 fps | public loading/unloading/board state or authorized accepted transport channel; part is hull |
| SA.tank | `hulldown`: 6 progress-driven frames; `hulldown_idle`: one; `deploy` alias and reversed `pack` | public deploying/packing/progress/deployed; part is hull |
| SA.repair | `deploy`: 8 progress-driven frames; `deployed_work`: 6 at 8 fps; reverse `pack` | actual deployed/service channel; do not use the single-target `work_repair` pose for deployed two-arm service |
| SY.repair | `work_salvage`: 6 at 8 fps | actual salvage channel; no income inference |

Base deployment/packing durations are engine rules and can change with upgrades.
Spec `sim_seconds` documents the base alias only; renderer progress comes from
Go and cannot force those timings. IR artillery's authored rack deployment is
presentation equipment preparation; its ordinary weapon rules stay unchanged.

## Aircraft source plates

All eleven use 16 headings. Their role IDs and provenance are listed in
`docs/aircraft-art.md`. All are authored near ground height and have
`air.rendered_at_ground=true`, `cruise_altitude_mt=1400` as a cosmetic scale hint.
The renderer supplies altitude exactly once; the shadow remains on terrain.

| Family | State timing |
|---|---|
| US/SA fighter and strike | fly/bank_left/bank_right/empty: 2 frames at 20 fps; fire: 2 at 10; parked: 1; takeoff/landing: 6 at 10; damaged: 1; crash: 4 at 10 |
| US/SA gunship | hover/move/damaged/empty: 4 at 24; fire: 3 at 12; parked: 2 at 6; takeoff/landing: 6 at 10; crash: 6 at 10 |
| US.airlift | same rotor timings with no fire/empty; hover_low_board: 4 at 24; work_load/work_unload/doors_open alias that state |
| IR.fighter / IR.gunship | fly/bank_left/bank_right/empty: 3 at 24; parked: 1; launch/recover: 4 at 10; damaged: 1; crash: 4 at 10; fire: 2 at 8 |
| IR.isr / SY.scout_drone | same drone base, no fire/empty; IR.isr orbit: 3 at 24 |
| every new aircraft | rearm: 6 at 8, looping service access presentation; does not define service duration |

Go `EntityView` publishes `landed`, `state`, `facing`, `health`, `enabled` and
`progress`. It publishes `EntityPrivate.ammo`, `service_work`, `home`, `orders`
and other exact values **only for the owner**. In generated TypeScript these
are `entity.private.ammo`, `serviceWork`, `home`, and `orders`.

- Prefer `rearm` while public state is `servicing` and the aircraft is landed;
  `parked` after actual service ends. Never start a reload timer or refill ammo
  in the renderer. `aircraft_serviced` is owner-scoped feedback, not a public
  observation of an opponent's readiness. Service mesh cycles are cosmetic.
- A permitted landed→airborne transition can play takeoff/launch and smoothly
  raise the sprite. Airborne→landed can play landing/recover. The Go state has
  already changed; this must not postpone orders, damage, landing, or departure.
  Initial snapshot/resume should render the correct stable state without a
  fictitious takeoff. `taking_off` exists for emergency departure; normal
  departure need not keep that state for an animation interval.
- Use sustained `empty` only with own `private.ammo===0` on an armed aircraft.
  For enemy/allied actors without private ammo, use neutral flight equipment.
  A visible firing event may play the short fire animation; do not infer the
  remaining magazine. Two modeled payload rails are silhouette cues, not exact
  per-type ammo counts. Unarmed drones/airlift never select fire or empty.
- Derive bank direction from already authorized heading changes; orbit from an
  owner-private actual orbit order if available. Do not reveal hidden intent.
- Board/unload comes from a permitted real transport state. `US.airlift` low
  hover opens side doors and rear ramp; it never teleports passenger art early.
- For destroyed airborne actors, the crash sequence should descend its
  presentation offset to the terrain, rather than retain the cruise offset
  throughout. This is bounded cosmetic interpolation over an actual destruction;
  it adds neither a live actor nor a blocking wreck. Reset on replacement/replay
  seek. Reduced motion must retain readable destroyed/landed/deployed states.

Existing `actorSpriteState` at handoff does not route these extra service,
transition, empty, or double-charge states. The coordinator owns those hooks and
must test actual Go state transitions, owner/enemy privacy, replay seek, reduced
motion, and correctly layered shadows after approved sprites exist. Native
source validation and the browser performance diagnosis do not prove this UI
integration is complete.
