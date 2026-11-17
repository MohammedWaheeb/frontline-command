// Retired by the hud-sidebar revamp (beta 2026-10-31). Credits, income, power,
// supply, energy, tier and the pause button now live in the command sidebar
// header (CommandSidebar.tsx). The floating resource shoulder duplicated them
// and covered the world. Kept as an empty export for frozen recovery builds.
import type {BattleView} from './battle-view';
export function TopBar(_props:{view:BattleView}){return null}
