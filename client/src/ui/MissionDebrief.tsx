import type {PlayerSnapshot} from '../runtime/types';

/** Final public objective flags only; this recap never awards or decides results. */
export function MissionDebrief({snapshot}:{snapshot?:Pick<PlayerSnapshot,'mission'|'outcome'>}){
 const mission=snapshot?.outcome?.finished?snapshot.mission:undefined;
 if(!mission)return null;
 return <section aria-label="Mission objective results"><h3>Mission objectives</h3><p>{mission.title}</p><ul className="briefing-objectives">{mission.objectives.map(objective=>{
  const category=objective.failure?'Failure condition':objective.optional?'Optional objective':'Required objective';
  const status=objective.failure?objective.complete?'Failed':'Not triggered':objective.complete?'Completed':'Not completed';
  return <li key={objective.id}><span>{objective.text}<small>{category} · {status}</small></span></li>;
 })}</ul></section>;
}
