// Public owned-actor labels authored by Codex during authorized quota takeover.
// Tags are authoring inputs only. Output contains canonical Initial origins,
// which the Go filtered view exposes only while the actor is currently owned.
const groups = {
 'tutorial-1-give-an-order': [['starting-rifles','Order drill rifle squads']],
 'tutorial-2-operate-a-base': [['home-hq','Original command center'],['home-rig','Original construction rig'],['home-haulers','Original supply trucks'],['home-factory','Original factory']],
 'tutorial-3-read-the-counter': [['starting-rifles','Infantry cover team'],['starting-at','Anti-armor team'],['starting-recon','Detection team'],['training-apc','Training transport'],['transport-team','Boarding team']],
 'tutorial-4-defend-the-sky': [['training-aircraft','Service exercise strike aircraft'],['training-fighter','Air-defense exercise fighter'],['training-battery','Missile exercise battery'],['starting-rifles','Warning and evasion team']],
 'us-01-first-foothold': [['ranger-west','Recovered western Rangers'],['ranger-east','Recovered eastern Rangers'],['intact-rig','Recovered engineering rig']],
 'us-02-open-corridor': [['convoy','Marked supply convoy'],['escort-gunship','Convoy escort gunship']],
 'us-03-relay-ridge': [['starting-recon','Original reconnaissance team']],
 'us-04-broken-umbrella': [['home-service','Original airfield'],['backup-airfield','Backup airfield'],['wing-one','Original strike wing one'],['wing-two','Original strike wing two'],['escort-fighter','Wing escort fighter']],
 'us-05-split-front': [['airlift','Assault airlift']],
 'ir-01-forward-signal': [['starting-recon','Original forward observer']],
 'ir-02-eyes-above': [['launch-convoy','Marked launcher convoy'],['survey-one','Original Survey Drone one'],['survey-two','Original Survey Drone two']],
 'ir-04-hold-the-network': [['home-service','Main drone service hub'],['network-two','Western network hub'],['network-three','Eastern network radar'],['survey-one','Original network Survey Drone'],['network-strike','Network strike drone']],
 'ir-05-the-second-volley': [['volley-launchers','Assigned missile launchers']],
 'ir-06-iron-signal': [['observer-west','Original western observer'],['observer-east','Original eastern observer']],
 'sy-01-workshop-foothold': [['recovered-rig','Recovered construction rig'],['mechanics-west','Recovered western mechanic team'],['mechanics-east','Recovered eastern mechanic team']],
 'sy-02-supply-trail': [['trail-trucks','Marked supply convoy']],
 'sy-03-three-crossings': [['concealed-scout','Original concealment scout']],
 'sy-04-open-doors': [['home-factory','Original workshop'],['safehouse-front','Forward safehouse'],['safehouse-rear','Rear safehouse'],['evacuation-team','Marked evacuation team']],
 'sa-01-arrival-point': [['original-apcs','Original transport pair']],
 'sa-02-moving-shield': [['shield-convoy','Marked supply convoy']],
 'sa-04-intercept-window': [['outpost-west','Western defended outpost'],['outpost-east','Eastern defended outpost'],['fixed-battery','Fixed missile battery'],['mobile-aegis','Assigned mobile interceptor']],
 'sa-05-three-positions': [['starting-repair','Original repair vehicle']],
 'convoy-union': [['west-hq','Original western command center'],['east-hq','Original eastern command center']],
 'twin-outposts': [['west-hq','Original western command center'],['east-hq','Original eastern command center']],
};

// Mirrors the content schema's effective Initial ordering, not gameplay rules.
export function effectiveTutorialMission(mission, faction) {
 const variant=mission.tutorial_variants?.find(value=>value.faction===faction);
 if(!variant)throw new Error(`${mission.id}: unknown tutorial faction ${faction}`);
 const humanIDs=new Set(mission.players.filter(player=>player.controller==='human').map(player=>player.id));
 return {...mission, ...variant, faction, initial:[...mission.initial.filter(actor=>!humanIDs.has(actor.owner)),...variant.initial]};
}

export function resolveActorGroups(mission, declarations) {
 if(!Array.isArray(declarations)||declarations.length>256)throw new Error(`${mission.id}: invalid actor label list`);
 const humanTeams=new Set(mission.players.filter(player=>player.controller==='human').map(player=>player.team));
 const recovered=new Set(mission.triggers.flatMap(trigger=>trigger.actions).filter(action=>action.kind==='recover_tag').map(action=>action.tag));
 const origins=new Set();
 return declarations.map(([tag,text])=>{
  const index=mission.initial.findIndex(actor=>actor.tag===tag);
  if(index<0)throw new Error(`${mission.id}: actor label ${tag} is not an Initial actor`);
  const actor=mission.initial[index];
  if(mission.initial.some(other=>other.tag===tag&&other.type!==actor.type))throw new Error(`${mission.id}: ambiguous actor label ${tag}`);
  const owner=mission.players.find(player=>player.id===actor.owner);
  if(!owner||!humanTeams.has(owner.team)||(owner.controller!=='human'&&!recovered.has(tag)))throw new Error(`${mission.id}: actor label ${tag} is not owned or recoverable`);
  const origin=`initial:${index}`;
  if(origins.has(origin))throw new Error(`${mission.id}: duplicate actor origin ${origin}`);
  if(typeof text!=='string'||!text.trim()||text.length>120)throw new Error(`${mission.id}: invalid actor label ${tag}`);
  origins.add(origin);
  return {origin,text};
 });
}

export function publicMissionActors(mission) {
 return resolveActorGroups(mission,groups[mission.id]??[]);
}

export function publicTutorialFactionActors(mission,faction) {
 const declarations=mission.id==='tutorial-5-command-a-match'&&faction==='IR'
  ? [['tutorial-survey','Faction ability Survey Drone']] : [];
 return resolveActorGroups(effectiveTutorialMission(mission,faction),declarations);
}

// Checks emitted metadata without trusting the author's tag-to-origin mapping.
export function checkActorGroups(mission, records) {
 if(!Array.isArray(records)||records.length>256)throw new Error(`${mission.id}: invalid actor group array`);
 const declarations=records.map(record=>{
  if(!record||Object.keys(record).some(key=>!['origin','text'].includes(key))||!/^initial:(0|[1-9][0-9]*)$/.test(record.origin))throw new Error(`${mission.id}: invalid actor origin record`);
  const actor=mission.initial[Number(record.origin.slice(8))];
  if(!actor)throw new Error(`${mission.id}: actor origin outside Initial`);
  return [actor.tag,record.text];
 });
 const canonical=resolveActorGroups(mission,declarations);
 for(let i=0;i<records.length;i++)if(records[i].origin!==canonical[i].origin)throw new Error(`${mission.id}: noncanonical actor origin ${records[i].origin}`);
 return canonical.length;
}
