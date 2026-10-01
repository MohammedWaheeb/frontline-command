"""Original English radio scripts. No borrowed performances or catchphrases."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[3]
FACTIONS = ('US', 'IR', 'SY', 'SA')
ARCHETYPES = {f: ('infantry', 'vehicle_crew', 'pilot' if f in ('US', 'SA') else 'drone_operator') for f in FACTIONS}
VOICES = {
    'US': {'infantry': 'am_michael', 'vehicle_crew': 'am_fenrir', 'pilot': 'af_bella', 'announcer': 'af_heart'},
    'IR': {'infantry': 'am_fenrir', 'vehicle_crew': 'am_michael', 'drone_operator': 'af_heart', 'announcer': 'bm_george'},
    'SY': {'infantry': 'am_puck', 'vehicle_crew': 'bm_george', 'drone_operator': 'af_bella', 'announcer': 'bf_emma'},
    'SA': {'infantry': 'bm_george', 'vehicle_crew': 'am_fenrir', 'pilot': 'am_michael', 'announcer': 'af_bella'},
}
SPEEDS = {'US': 1.06, 'IR': 1.00, 'SY': 1.10, 'SA': 0.98}
# Gentle per-faction radio timbre as bandpass edges (Hz, low/high). US crisp and
# bright, IR calm and warm, SY lean and forward, SA weighty and full. All edges
# stay inside the speech band so factions remain mutually intelligible; the
# quoted role cues (wing/link/route/formation vocabulary) stay in the scripts.
FACTION_EQ = {'US': (150, 7500), 'IR': (120, 6800), 'SY': (200, 7000), 'SA': (100, 6500)}
# Announcer delivery multipliers on top of the base 1.02 announcer pace, so the
# three critical warning reads are distinct: missile warning urgent, base
# attacked firm (default), interceptor depleted flat. Range kept narrow for
# intelligibility under the 6s alert-bundling window.
ANNOUNCER_PACE = {'missile_warning': 1.10, 'base_attacked': 1.00, 'interceptor_depleted': 0.92}
LINES = {
 'US': {
  'move': ('Moving to your mark.', 'Route confirmed. Moving out.', 'Taking the next position.'),
  'attack': ('Target confirmed. Engaging.', 'Weapons ready. Taking the shot.', 'Engaging the marked target.'),
  'stop': ('Holding this position.', 'Order received. Standing by.', 'Stopping here. Watching the approaches.'),
  'unavailable': ('Unable to execute that order.', 'That approach is not available.', 'We need another target.'),
  'under_fire': ('Contact! We are taking fire.', 'Incoming fire on our position.', 'We need support at this position.'),
  'repair': ('Repair team is on the job.', 'Restoring the damaged systems.', 'Maintenance underway. Keep us covered.'),
  'ability_ready': ('Special equipment is ready.', 'Systems checked. Ready on your order.', 'Our support package is available.'),
  'retreat': ('Breaking contact. Pulling back.', 'Returning to a safer position.', 'Falling back. Cover our withdrawal.'),
 },
 'IR': {
  'move': ('Route received. Advancing.', 'Moving into the assigned sector.', 'Link is stable. Changing position.'),
  'attack': ('Target acquired. Begin engagement.', 'Fire solution confirmed.', 'Coordinating fire on the target.'),
  'stop': ('Position locked. Awaiting orders.', 'Halting movement. Holding here.', 'We will secure this location.'),
  'unavailable': ('That order cannot be completed.', 'No valid solution for that target.', 'Current conditions prevent that action.'),
  'under_fire': ('Hostile fire. Our position is exposed.', 'We are under attack. Request support.', 'Incoming rounds. Maintain the link.'),
  'repair': ('Technicians are restoring the equipment.', 'Repairs in progress. Stand by.', 'Bringing the systems back online.'),
  'ability_ready': ('Special systems are available.', 'The support channel is ready.', 'Equipment prepared. Awaiting authorization.'),
  'retreat': ('Disengaging. Returning to cover.', 'Withdrawing to the previous sector.', 'Breaking contact. Preserve the equipment.'),
 },
 'SY': {
  'move': ('We have a route. Moving now.', 'Heading for that position.', 'On our way. Keep the route open.'),
  'attack': ('We see the target. Opening fire.', 'Taking the shot. Cover us.', 'Concentrating fire on that position.'),
  'stop': ('Stopping here. Eyes on the road.', 'We will hold this ground.', 'Understood. Waiting for your signal.'),
  'unavailable': ('We cannot reach that from here.', 'That order will not work here.', 'Find us another way through.'),
  'under_fire': ('We are taking fire! Need cover.', 'They have our position. Send support.', 'Incoming! Keep your heads down.'),
  'repair': ('We can get this running again.', 'Patching the damage. Give us cover.', 'Tools out. Repairs underway.'),
  'ability_ready': ('Our equipment is ready to use.', 'All set. Waiting for your signal.', 'The support team is standing by.'),
  'retreat': ('Pulling back. Watch the rear.', 'Leaving this position. Cover us.', 'Back to cover. Stay together.'),
 },
 'SA': {
  'move': ('Formation moving to your position.', 'Advancing along the assigned route.', 'Moving out. Maintain our spacing.'),
  'attack': ('Engaging the designated target.', 'Weapons aligned. Opening fire.', 'Target confirmed. Coordinated fire.'),
  'stop': ('Formation halted. Holding position.', 'Securing this point. Awaiting orders.', 'Stationary and ready for your command.'),
  'unavailable': ('That command is not available.', 'Unable to engage that target.', 'The requested route is obstructed.'),
  'under_fire': ('Formation under fire. Requesting support.', 'Hostile fire on our position.', 'Contact at our location. Reinforce us.'),
  'repair': ('Service crew is restoring the equipment.', 'Repairs underway. Secure the perimeter.', 'Maintenance has begun. Stand by.'),
  'ability_ready': ('Support systems are ready.', 'Equipment checked. Awaiting your command.', 'Special capability is now available.'),
  'retreat': ('Formation withdrawing in good order.', 'Breaking contact. Return to cover.', 'Pulling back to the support line.'),
 },
}
SELECT = {
 'US': {'infantry': ('Ranger team ready.', 'Squad reporting. What is the assignment?', 'Field team standing by.'), 'vehicle_crew': ('Vehicle crew ready.', 'Engine running. Give us a route.', 'Crew reporting. Systems are green.'), 'pilot': ('Flight crew ready.', 'Cockpit checks complete.', 'Air wing awaiting your orders.')},
 'IR': {'infantry': ('Infantry section reporting.', 'Squad connected. Awaiting orders.', 'Field section ready for assignment.'), 'vehicle_crew': ('Crew linked and ready.', 'Vehicle systems checked.', 'Driver standing by. Send coordinates.'), 'drone_operator': ('Drone link established.', 'Remote station ready.', 'Flight telemetry confirmed. Awaiting tasking.')},
 'SY': {'infantry': ('Our team is ready.', 'We are here. Give us the word.', 'Squad together and standing by.'), 'vehicle_crew': ('Crew aboard. Engine is good.', 'We are ready to roll.', 'Vehicle team here. What is the route?'), 'drone_operator': ('Control link is steady.', 'Drone crew ready for the job.', 'Remote camera checked. Send the route.')},
 'SA': {'infantry': ('Formation ready for orders.', 'Infantry detail reporting.', 'Section checked and standing by.'), 'vehicle_crew': ('Armor crew ready.', 'Vehicle prepared. Awaiting assignment.', 'Support formation reporting.'), 'pilot': ('Flight section reporting.', 'Air crew prepared for tasking.', 'Cockpit ready. Send the flight plan.')},
}
ANNOUNCER = {
 'base_attacked': 'Our base is under attack.',
 'hauler_attacked': 'A supply hauler is under attack.',
 'low_power': 'Power is low. Build or restore power generation.',
 'unit_ready': 'A new unit is ready for orders.',
 'research_complete': 'Research complete. The upgrade is available.',
 'aircraft_returning': 'Aircraft returning for service.',
 'no_landing_slot': 'No landing slot is available.',
 'missile_warning': 'Missile inbound. Clear the marked impact area.',
 'interceptor_depleted': 'Interceptor ammunition is depleted.',
 'safehouse_transfer_canceled': 'Safehouse transfer canceled. Check the exit.',
 'strategic_site_charging': 'The strategic site is charging.',
 'capture_interrupted': 'Capture interrupted. Secure the target.',
 'construction_complete': 'Construction complete.',
 'unit_lost': 'A unit has been lost.',
 'building_lost': 'A building has been destroyed.',
 'building_captured': 'Building captured. Control is transferred.',
 'insufficient_funds': 'Insufficient credits for that order.',
 'cannot_build_here': 'Construction is not possible at that location.',
 'enemy_strategic_ready': 'Enemy strategic capability is ready. Prepare your defenses.',
 'our_strategic_ready': 'Our strategic capability is ready.',
 'objective_updated': 'Mission objectives updated.',
 'mission_accomplished': 'Operation complete. Mission accomplished.',
 'mission_failed': 'The mission has failed. Review the operation and try again.',
 'defeat_countdown': 'Command structures lost. Restore a command structure before the countdown ends.',
 'endgame_reveal': 'Remaining command positions are now revealed.',
 'field_depleted': 'A supply field is depleted. Redirect the haulers.',
 'shipment_arrived': 'Shipment received. Additional credits are available.',
 'reconnecting': 'Connection interrupted. Attempting to reconnect.',
 'teammate_disconnected': 'A teammate has disconnected.',
 'aircraft_lost_emergency': 'An aircraft was lost before it could reach a landing slot.',
}
CRITICAL = {'missile_warning', 'base_attacked', 'defeat_countdown', 'enemy_strategic_ready'}

def voice_jobs():
    jobs = []
    def add(id, path, text, faction, role='announcer', variant=1, priority=50, cooldown=6000, event=None):
        pace = ANNOUNCER_PACE.get(event, 1.0) if role == 'announcer' else 1.0
        jobs.append(dict(id=id, path=path, caption=text, faction=faction, voice=VOICES[faction][role],
                         speed=(SPEEDS[faction] if role!='announcer' else 1.02) * pace,
                         eq=list(FACTION_EQ[faction]), variant=variant,
                         bus='voice', priority=priority, cooldown_ms=cooldown))
    for faction in FACTIONS:
        for archetype in ARCHETYPES[faction]:
            for event, lines in {'select': SELECT[faction][archetype], **LINES[faction]}.items():
                for i, line in enumerate(lines, 1):
                    add(f'vo.unit.{faction}.{archetype}.{event}', f'vo/units/{faction}/{archetype}/{event}_{i}.ogg', line,
                        faction, archetype, i, 10, 2500 if event=='select' else 1000)
        for event, line in ANNOUNCER.items():
            add(f'vo.announcer.{faction}.{event}', f'vo/announcer/{faction}/{event}.ogg', line,
                faction, priority=100 if event in CRITICAL else 50, event=event)
    for file in sorted((ROOT/'content/missions').glob('*.json')):
        mission = json.loads(file.read_text())
        faction = mission.get('faction', 'US')
        if faction not in FACTIONS: faction = 'US'
        for key in ('briefing', 'debrief'):
            if mission.get(key):
                add(f'vo.{key}.{mission["id"]}', f'vo/missions/{mission["id"]}/{key}.ogg', mission[key], faction, priority=40, cooldown=0)
        for trigger in mission.get('triggers', []):
            for index, action in enumerate(trigger.get('actions', [])):
                if action.get('kind')=='warning' and action.get('text'):
                    # The visible caption includes the radio role; speak the actual message.
                    text = action['text']
                    spoken = text.split(': ', 1)[-1]
                    add(f'vo.warning.{mission["id"]}.{trigger["id"]}.{index}',
                        f'vo/missions/{mission["id"]}/{trigger["id"]}-{index}.ogg', spoken, faction)
                    jobs[-1]['display_caption'] = text
        for variant in mission.get('tutorial_variants', []):
            faction = variant['faction']
            if variant.get('briefing'):
                add(f'vo.briefing.{mission["id"]}.{faction}', f'vo/missions/{mission["id"]}/{faction}/briefing.ogg',
                    variant['briefing'], faction, priority=40, cooldown=0)
            for trigger in variant.get('triggers', []):
                for index, action in enumerate(trigger.get('actions', [])):
                    if action.get('kind')=='warning' and action.get('text'):
                        text=action['text']
                        add(f'vo.warning.{mission["id"]}.{faction}.{trigger["id"]}.{index}',
                            f'vo/missions/{mission["id"]}/{faction}/{trigger["id"]}-{index}.ogg',
                            text.split(': ',1)[-1],faction)
                        jobs[-1]['display_caption']=text
    return jobs

def write_scripts():
    jobs = voice_jobs()
    path = ROOT/'assets/audio/scripts'
    path.mkdir(parents=True, exist_ok=True)
    for name, prefix in [('unit_responses', 'vo.unit.'), ('announcer', 'vo.announcer.'), ('missions', 'vo.')]:
        subset = [j for j in jobs if j['id'].startswith(prefix) and (name!='missions' or not j['id'].startswith(('vo.unit.', 'vo.announcer.')))]
        lines = [f'# {name.replace("_", " ").title()}', '', 'Original English scripts. Stock synthetic voices; no cloned speaker. Generated from `assets/pipeline/audio/dialogue.py` and authored mission JSON.', '', '| ID / variant | Voice | Exact spoken text |', '|---|---|---|']
        lines += [f'| `{j["id"]}` / {j["variant"]} | `{j["voice"]}` | {j["caption"]} |' for j in subset]
        (path/f'{name}.md').write_text('\n'.join(lines)+'\n')
    return jobs

if __name__=='__main__':
    print(f'{len(write_scripts())} voiced clips authored.')
