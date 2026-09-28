// Public mission-location authoring by Codex during authorized quota takeover.
// These fixed region hints describe declared destinations/owned defense areas.
// They never track hidden actors, later reinforcements, or current enemy state.
const mark=(id,text,region,objective)=>({id,text,region,...objective?{objective}:{}});
const locations={
 'us-01-first-foothold':[
  mark('ranger-west','Western Ranger recovery area','recovery1','reconnect'),
  mark('ranger-east','Eastern Ranger recovery area','recovery2','reconnect'),
  mark('intact-rig','Stranded engineering rig area','recoveryRig','engineering-rescue')],
 'us-02-open-corridor':[
  mark('western-branch','Western convoy approach','site1','branch'),
  mark('eastern-branch','Eastern convoy approach','site2','branch'),
  mark('convoy-destination','Exit depot area','exit','exit')],
 'us-04-broken-umbrella':[
  mark('original-airfield','Original airfield area','safe','airfields-survive'),
  mark('backup-airfield','Backup airfield and wing evacuation area','site1')],
 'us-06-clear-horizon':[
  mark('western-corridor','Western supply-corridor section','corridor1','two-bases'),
  mark('eastern-corridor','Eastern supply-corridor section','corridor2','two-bases'),
  mark('command-base','Main command-base area','enemy','two-bases'),
  mark('forward-base','Forward command-base area','enemy2','two-bases')],
 'ir-01-forward-signal':[
  mark('observation-ridge','Forward observation ridge','site1','observation-base')],
 'ir-02-eyes-above':[
  mark('launcher-destination','Launcher exit depot area','exit','launchers-arrive')],
 'ir-03-beyond-the-basin':[
  mark('western-expansion','Western expansion and supply-station area','site1'),
  mark('eastern-expansion','Eastern expansion and supply-station area','site2')],
 'ir-04-hold-the-network':[
  mark('home-network','Main drone service area','safe','network-hold'),
  mark('western-network','Western network service area','site1','network-hold'),
  mark('eastern-network','Eastern network service area','site2','network-hold')],
 'ir-05-the-second-volley':[
  mark('relay-1','First military outpost area','site1','outposts-disabled'),
  mark('relay-2','Second military outpost area','site2','outposts-disabled'),
  mark('relay-3','Third military outpost area','site3','outposts-disabled')],
 'ir-06-iron-signal':[
  mark('relay-1','Western defense and observer position','site1'),
  mark('relay-2','Eastern defense and observer position','site2'),
  mark('command-base','Command-base area','enemy','command-base')],
 'sy-01-workshop-foothold':[
  mark('recovered-rig','Stranded engineering rig area','recoveryRig','rig-recovered'),
  mark('mechanics-west','Western mechanic recovery area','recovery1','mechanic-teams'),
  mark('mechanics-east','Eastern mechanic recovery area','recovery2','mechanic-teams')],
 'sy-02-supply-trail':[
  mark('western-branch','Western convoy branch','site1','branch'),
  mark('eastern-branch','Eastern convoy branch','site2','branch'),
  mark('convoy-destination','Far exit depot area','exit','trail-open')],
 'sy-03-three-crossings':[
  mark('western-approach','Western expansion approach','site1','two-approaches'),
  mark('eastern-approach','Eastern expansion approach','site2','two-approaches'),
  mark('northern-approach','Northern expansion approach','site3','two-approaches')],
 'sy-04-open-doors':[
  mark('forward-safehouse','Forward safehouse and evacuation origin','site1','open-doors'),
  mark('rear-evacuation','Rear safehouse and evacuation destination','safe')],
 'sy-05-relay-break':[
  mark('relay-1','First relay and optional factory capture area','site1')],
 'sy-06-open-road':[
  mark('command-base','Main blocking command-base area','enemy','road-cleared'),
  mark('forward-base','Forward blocking command-base area','enemy2','road-cleared')],
 'sa-01-arrival-point':[
  mark('assembly-area','Forward assembly area','site1','arrival-base')],
 'sa-02-moving-shield':[
  mark('first-sector','First contested convoy sector','site1','sector-one'),
  mark('second-sector','Second contested convoy sector','site2','sector-two'),
  mark('convoy-destination','Exit depot area','exit','convoy-exit')],
 'sa-03-distant-depots':[
  mark('western-supply','Western supply position and station area','site1'),
  mark('eastern-supply','Eastern supply position and station area','site2')],
 'sa-04-intercept-window':[
  mark('western-outpost','Western defended outpost area','site1','intercept-window'),
  mark('eastern-outpost','Eastern defended outpost area','site2','intercept-window')],
 'sa-06-shieldline':[
  mark('western-corridor','Western permanent supply-corridor section','corridor1','connected-routes'),
  mark('eastern-corridor','Eastern permanent supply-corridor section','corridor2','connected-routes'),
  mark('command-base','Main command-complex area','enemy','shieldline'),
  mark('forward-base','Forward production-base area','enemy2','shieldline')],
 'tutorial-5-command-a-match':[
  mark('opposing-command','Opposing command-base area','enemy','short-battle')],
 'convoy-union':[
  mark('convoy-assembly','Convoy assembly area','convoy-origin'),
  mark('route-junction','Shared convoy route junction','route-junction'),
  mark('north-branch','Northern convoy branch','north-branch'),
  mark('north-merge','Northern route merge','north-merge'),
  mark('south-branch','Southern convoy branch','south-branch'),
  mark('south-merge','Southern route merge','south-merge'),
  mark('convoy-exit','Shared convoy exit','convoy-exit')],
 'twin-outposts':[
  mark('central-connection','Contested central connection','central-connection','reconnection'),
  mark('western-corridor','Western corridor approach','corridor-west'),
  mark('eastern-corridor','Eastern corridor approach','corridor-east'),
  mark('western-hostile-base','Western hostile base area','second-base','joint-assault'),
  mark('eastern-hostile-base','Eastern hostile base area','enemy-base','joint-assault')],
};
export function publicMissionLocations(id,authored){
 const merged=new Map(authored.map(marker=>[marker.id,marker]));
 for(const marker of locations[id]??[])merged.set(marker.id,marker);
 return [...merged.values()];
}
