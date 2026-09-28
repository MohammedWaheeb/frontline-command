// Original authored layouts by Codex, using Claude Opus 5.5's map helpers.
// Every competitive resource/spawn location is explicit. Scenario sites are
// shared authoring anchors, while each named mission has its own terrain recipe.
import {MapBuilder, PACK} from './lib/mapkit.mjs';
import {woods, rubble, outcrop, ridge, road, river, ravine, crossing, town, ringRoad} from './lib/features.mjs';

const cell = (x,y) => ({x:x*1000+500,y:y*1000+500});
const c = (m,points,w=7) => road(m,points,w,true,false);
const track = (m,points,w=5) => road(m,points,w,false,false);
const cover = (m,x,y,r,seed) => woods(m,x-r,y-r,x+r,y+r,seed,.54,4,false);
const rid = (m,p,w=4) => ridge(m,p,w,2,false);
const rock = (m,x,y,rx,ry=rx) => outcrop(m,x,y,rx,ry,2,false);
const crossingAt = (m,p,w=8) => crossing(m,p,w,false,false);

function competitive(meta,paint) {
  const m=new MapBuilder(meta);paint(m);m.clearSpawns(13);
  return {builder:m,kind:'skirmish',launch:true,review:'Unreviewed. Terrain/connectivity validation is not competitive certification.'};
}

export function launchLayouts() {
  const out=[];
  out.push(competitive({id:'copper-junction',title:'Copper Junction',width:128,height:128,symmetry:'rot180'},m=>{
    m.spawn(18,64,[1,2]).field(22,53,36000000,true,'Starting supply').field(36,30,24000000,true,'Flank expansion');
    m.field(62,43,24000000,true,'Contested supply').station(45,66,true,'Junction relay').setShipment(64,64);
    road(m,[[18,64],[48,64],[64,60]],8,true);road(m,[[19,58],[26,31],[47,22],[75,22],[96,40]],7,true);
    road(m,[[18,73],[31,98],[57,103],[79,95]],7,true);
    outcrop(m,45,46,8,7);outcrop(m,57,87,6,8);woods(m,31,48,43,76,21,.59);rubble(m,57,53,72,73,32,.65);
    m.object('heavy_prop',48,56).object('garrison',38,83).label('Copper exchange',64,62).label('Western switchback',33,96);
  }));
  out.push(competitive({id:'relay-heights',title:'Relay Heights',width:128,height:128,symmetry:'rot180'},m=>{
    m.spawn(18,64,[1,2]).field(20,51,36000000,true,'Starting supply').field(31,25,24000000,true,'Lower expansion');
    m.plateau(46,34,81,93,2,[{x0:43,y0:43,x1:50,y1:51},{x0:43,y0:76,x1:50,y1:84}]);
    road(m,[[18,64],[34,55],[48,47],[63,47]],7,true);road(m,[[20,71],[34,81],[48,80],[64,80]],7,true);
    road(m,[[18,54],[28,24],[52,19],[94,23]],7,true);road(m,[[18,75],[31,106],[59,109],[95,103]],7,true);
    m.field(62,44,24000000,true,'Plateau supply').station(59,60,true,'High relay').setShipment(64,65);
    woods(m,25,41,38,53,52,.54);woods(m,28,90,42,102,54,.57);m.object('garrison',54,70).label('Relay plateau',65,58);
  }));
  out.push(competitive({id:'dry-river',title:'Dry River',width:128,height:128,symmetry:'rot180'},m=>{
    m.spawn(20,64,[1,2]).field(23,51,36000000,true,'Starting supply').field(35,25,24000000,true,'Bank expansion');
    ravine(m,[[63,0],[63,38],[65,66],[64,92],[64,127]],10,false);
    for(const y of [27,64,101]) {crossingAt(m,[[53,y],[76,y]],9);track(m,[[20,64],[38,y],[57,y]],7);track(m,[[108,64],[90,y],[73,y]],7);}
    m.field(46,43,24000000,true,'Crossing supply').station(48,86,true,'Crossing relay').setShipment(64,64);
    m.rect(61,61,67,67,{terrain:'road',mandatory:false},false);
    woods(m,37,63,49,79,67,.6);rubble(m,47,17,56,35,71,.5);m.object('garrison',35,83).label('Three permanent crossings',64,63);
  }));
  out.push(competitive({id:'industrial-valley',title:'Industrial Valley',width:160,height:160,symmetry:'rot90'},m=>{
    m.spawn(25,25,[1,2,1,2]).field(35,22,36000000,true,'Starting supply').field(50,34,24000000,true,'Outer depot');
    road(m,[[25,25],[51,49],[58,72],[80,80]],8,true);road(m,[[25,25],[70,20],[114,25]],7,true);
    town(m,57,57,102,102,110,{street:11,garrisons:true,sym:false});
    for(const p of [[[50,70],[110,70]],[[50,91],[110,91]],[[69,50],[69,110]],[[91,50],[91,110]]])c(m,p,7);
    m.field(56,80,24000000,false,'Western freight').field(104,80,24000000,false,'Eastern freight');
    m.station(80,51,false,'North dispatch').station(80,109,false,'South dispatch').setShipment(80,80);
    woods(m,33,52,49,66,112,.6);rubble(m,42,37,52,48,113,.5);m.label('Warehouse district',80,79);
  }));
  out.push(competitive({id:'border-depots',title:'Border Depots',width:160,height:160,symmetry:'rot180'},m=>{
    m.spawn(22,38,[1,2]).spawn(22,119,[1,2]);
    m.field(32,35,36000000,true,'North starting supply').field(32,116,36000000,true,'South starting supply');
    m.field(46,23,24000000,true,'North expansion').field(46,137,24000000,true,'South expansion');
    c(m,[[20,39],[65,39],[100,39],[139,39]],9);c(m,[[20,120],[60,120],[106,120],[139,120]],9);
    c(m,[[48,39],[58,78],[48,120]],7);c(m,[[110,39],[100,80],[110,120]],7);c(m,[[55,80],[105,80]],8);
    rock(m,78,54,11,9);rock(m,81,106,11,9);cover(m,45,75,12,131);cover(m,115,85,12,137);
    m.field(70,77,24000000,false,'West contested depot').field(90,83,24000000,false,'East contested depot');
    m.station(76,23,false,'North border relay').station(84,137,false,'South border relay').setShipment(80,80);
    m.object('garrison',62,59).object('garrison',96,100).label('Connector yards',79,80);
  }));
  out.push(competitive({id:'port-outskirts',title:'Port Outskirts',width:160,height:160,symmetry:'mirrorX'},m=>{
    m.rect(0,0,159,10,{terrain:'water'},false);m.rect(0,11,159,14,{terrain:'rubble'},false);
    m.spawn(27,39,[1,2]).spawn(27,125,[1,2]);
    m.field(37,36,36000000,true,'Harbor starting supply').field(37,122,36000000,true,'Inland starting supply');
    m.field(49,22,24000000,true,'Dock expansion').field(49,142,24000000,true,'Inland expansion');
    c(m,[[26,39],[26,81],[26,126],[80,133],[133,126],[133,81],[133,39],[80,27],[26,39]],8);
    c(m,[[28,80],[80,80],[132,80]],8);c(m,[[80,28],[80,132]],7);
    town(m,57,39,105,65,158,{street:13,sym:false});town(m,59,97,102,119,159,{street:12,sym:false});
    m.field(66,76,24000000,false,'West cargo').field(94,84,24000000,false,'East cargo');
    m.station(55,86,false,'Western gate').station(105,74,false,'Eastern gate').setShipment(80,80);
    cover(m,44,102,8,163);cover(m,116,102,8,163);m.label('Abandoned harbor warehouses',80,48);
  }));
  for(const [id,title,paint] of [
    ['convoy-union','Convoy Union',m=>{
      rid(m,[[48,38],[53,64],[48,88]],6);rid(m,[[85,46],[90,70],[86,99]],5);
      c(m,[[21,106],[37,91],[54,81],[72,78],[94,62],[109,37]],9);
      c(m,[[37,91],[36,64],[63,44],[93,40],[109,37]],8);c(m,[[54,81],[64,110],[102,102],[112,68],[109,37]],8);
      town(m,53,47,73,65,201,{street:10,sym:false});cover(m,81,96,9,202);rock(m,104,82,6,5);
    }],
    ['twin-outposts','Twin Outposts',m=>{
      river(m,[[62,0],[63,43],[65,73],[63,127]],7,false);
      crossingAt(m,[[50,45],[77,45]],8);crossingAt(m,[[50,91],[77,91]],9);crossingAt(m,[[53,67],[76,67]],7);
      c(m,[[22,107],[40,91],[64,91],[87,91],[107,107]],8);c(m,[[22,107],[29,68],[57,45],[86,40],[107,22]],8);
      c(m,[[107,107],[101,66],[78,45],[53,28],[22,22]],8);cover(m,44,66,11,215);cover(m,86,71,11,217);rock(m,30,42,7,8);
    }],
  ]) {
    const m=new MapBuilder({id,title,width:128,height:128});paint(m);
    m.spawnAt(20,106,1).spawnAt(id==='twin-outposts'?106:46,106,1).spawnAt(15,78,1).spawnAt(106,22,2);
    m.field(19,93,36000000,false,'Commander one supply').field(id==='twin-outposts'?105:42,94,36000000,false,'Commander two supply');
    m.field(46,80,24000000,false,'Forward supply').field(88,59,24000000,false,'Contested supply').field(108,11,36000000,false,'Opponent supply');
    m.station(58,78,false,'Forward repair').station(94,44,false,'Exit control').setShipment(65,65);
    m.region('base-one',10,98,30,115).region('base-two',id==='twin-outposts'?96:39,98,id==='twin-outposts'?116:55,115);
    m.region('corridor-west',47,85,59,98).region('corridor-east',68,85,81,98).region('central-connection',56,61,73,73);
    m.region('convoy-origin',12,110,23,121).region('route-junction',31,84,43,96).region('north-branch',53,38,66,50).region('south-branch',59,101,72,114);
    m.region('north-merge',87,34,99,46).region('south-merge',101,59,115,73).region('convoy-exit',102,29,117,44);
    m.region('forward-repair',51,71,65,84).region('enemy-base',96,13,117,33).region('second-base',12,12,33,33);
    // All objective-region centers are explicit access points, with generous
    // approach brushes; none depends on destroying a random decoration.
    for(const r of m.regions) {const x=(r.min.x+r.max.x)/2000,y=(r.min.y+r.max.y)/2000;m.disc(x,y,4,{terrain:'open',height:0},false)}
    m.rect(7,91,62,122,{terrain:'open',height:0,mandatory:false},false);m.rect(89,91,124,122,{terrain:'open',height:0,mandatory:false},false);m.rect(7,7,40,39,{terrain:'open',height:0,mandatory:false},false);m.rect(90,7,124,40,{terrain:'open',height:0,mandatory:false},false);m.clearSpawns(10);out.push({builder:m,kind:'scenario',launch:true});
  }
  return out;
}

export const campaignTitles={
  US:['First Foothold','Open Corridor','Relay Ridge','Broken Umbrella','Split Front','Clear Horizon'],
  IR:['Forward Signal','Eyes Above','Beyond the Basin','Hold the Network','The Second Volley','Iron Signal'],
  SY:['Workshop Foothold','Supply Trail','Three Crossings','Open Doors','Relay Break','Open Road'],
  SA:['Arrival Point','Moving Shield','Distant Depots','Intercept Window','Three Positions','Shieldline'],
};

const recipes={
  'US-1':m=>{rock(m,47,101,9,6);rock(m,32,63,7,12);cover(m,60,82,9,301);cover(m,83,65,8,302);track(m,[[20,104],[47,84],[72,87],[102,64]],7);},
  'US-2':m=>{rid(m,[[43,25],[48,65],[56,92]],7);rid(m,[[80,38],[83,69],[89,96]],6);c(m,[[29,93],[32,64],[49,45],[76,40],[102,26]],8);c(m,[[29,93],[64,105],[101,82],[102,26]],8);cover(m,64,65,12,312);},
  'US-3':m=>{m.plateau(45,41,95,79,2,[{x0:42,y0:66,x1:50,y1:75},{x0:88,y0:48,x1:98,y1:56}],false);c(m,[[19,104],[39,85],[47,70],[66,61],[92,52],[107,22]],7);track(m,[[34,91],[31,35],[81,25]],6);},
  'US-4':m=>{rock(m,58,69,12,14);rock(m,92,48,7,11);c(m,[[19,103],[48,103],[83,93],[112,66]],9);track(m,[[20,104],[23,60],[54,39],[107,22]],7);cover(m,42,55,8,331);cover(m,89,82,8,332);},
  'US-5':m=>{river(m,[[47,0],[48,47],[62,65],[57,97],[58,127]],8,false);for(const y of [34,75,107])crossingAt(m,[[38,y],[73,y]],8);town(m,75,52,96,75,342,{street:10,sym:false});cover(m,39,84,8,344);},
  'US-6':m=>{rid(m,[[31,46],[58,46],[72,59]],6);rid(m,[[79,79],[93,89],[115,92]],6);c(m,[[20,104],[50,80],[76,63],[101,48],[107,22]],9);c(m,[[48,82],[30,69],[37,29],[75,22]],7);cover(m,65,98,11,352);town(m,82,29,100,47,353,{street:9,sym:false});},
  'IR-1':m=>{rock(m,42,89,8,11);cover(m,52,64,15,401);cover(m,90,85,10,402);c(m,[[20,104],[56,103],[74,70],[107,22]],7);track(m,[[20,104],[20,57],[62,34]],6);},
  'IR-2':m=>{rid(m,[[30,44],[63,42],[73,58]],7);rid(m,[[64,93],[90,94],[100,112]],6);c(m,[[20,104],[43,84],[76,76],[105,49]],8);c(m,[[43,84],[38,60],[75,30],[106,22]],7);cover(m,89,62,10,412);},
  'IR-3':m=>{river(m,[[7,54],[45,54],[69,66],[111,66],[127,63]],6,false);for(const x of [25,61,105])crossingAt(m,[[x,44],[x,77]],8);rock(m,81,39,10,11);cover(m,42,85,11,423);},
  'IR-4':m=>{m.plateau(42,43,83,81,1,[{x0:39,y0:50,x1:48,y1:58},{x0:75,y0:68,x1:87,y1:77}],false);ringRoad(m,67,69,38,7,false);c(m,[[20,104],[42,78],[81,74],[106,22]],8);cover(m,92,99,9,434);},
  'IR-5':m=>{rid(m,[[35,37],[60,47],[79,40]],6);rid(m,[[43,88],[73,93],[97,84]],6);track(m,[[19,104],[27,72],[58,65],[91,53],[107,22]],8);cover(m,74,67,8,445);rock(m,111,73,5,11);},
  'IR-6':m=>{ravine(m,[[60,0],[61,41],[71,75],[73,127]],9,false);for(const y of [28,65,101])crossingAt(m,[[49,y],[84,y]],8);town(m,84,38,112,64,455,{street:12,sym:false});cover(m,40,74,11,456);},
  'SY-1':m=>{town(m,37,68,62,89,501,{street:11,sym:false});cover(m,29,68,14,502);cover(m,70,101,12,503);rock(m,82,52,9,13);track(m,[[20,104],[60,106],[88,85],[106,22]],6);},
  'SY-2':m=>{river(m,[[34,0],[39,39],[59,69],[69,104],[73,127]],7,false);crossingAt(m,[[25,81],[80,81]],8);crossingAt(m,[[30,42],[57,42]],8);crossingAt(m,[[58,111],[85,111]],8);cover(m,83,92,12,512);town(m,80,38,108,58,514,{street:12,sym:false});},
  'SY-3':m=>{ravine(m,[[0,60],[41,61],[83,63],[127,61]],10,false);for(const x of [26,66,108])crossingAt(m,[[x,47],[x,76]],8);cover(m,41,85,10,521);cover(m,83,42,11,523);track(m,[[20,104],[66,99],[108,87]],7);},
  'SY-4':m=>{town(m,30,38,97,83,531,{street:14,sym:false});c(m,[[20,104],[39,90],[57,73],[83,61],[107,22]],8);c(m,[[39,90],[106,97],[116,49]],7);cover(m,25,74,11,535);},
  'SY-5':m=>{m.plateau(48,39,88,74,2,[{x0:44,y0:56,x1:54,y1:64},{x0:80,y0:45,x1:92,y1:54}],false);town(m,78,82,108,101,543,{street:12,sym:false});c(m,[[20,104],[34,77],[48,61],[83,49],[107,22]],7);cover(m,42,96,11,544);},
  'SY-6':m=>{rid(m,[[41,23],[48,54],[63,76]],5);rid(m,[[76,86],[95,105],[119,108]],6);c(m,[[20,104],[47,98],[72,67],[104,42]],8);c(m,[[20,104],[22,52],[46,27],[81,19]],7);cover(m,89,72,13,555);town(m,72,32,97,57,556,{street:11,sym:false});},
  'SA-1':m=>{rock(m,47,79,11,8);rock(m,84,63,9,12);track(m,[[20,104],[62,105],[105,78],[107,22]],10);cover(m,63,54,9,601);rubble(m,27,47,48,67,602,.5,4,false);},
  'SA-2':m=>{rid(m,[[38,35],[44,75],[59,98]],7);rid(m,[[84,44],[91,69],[99,99]],6);c(m,[[20,104],[32,78],[62,62],[91,54],[108,27]],10);c(m,[[32,78],[44,110],[89,110],[111,68]],8);cover(m,74,83,11,612);},
  'SA-3':m=>{river(m,[[62,0],[61,35],[55,68],[63,99],[67,127]],7,false);for(const y of [34,70,104])crossingAt(m,[[43,y],[81,y]],10);cover(m,33,61,9,623);cover(m,94,93,9,624);},
  'SA-4':m=>{rock(m,56,69,13,13);rock(m,89,43,8,7);ringRoad(m,66,69,40,9,false);c(m,[[20,104],[52,101],[86,81],[109,55],[108,23]],10);cover(m,37,54,9,634);},
  'SA-5':m=>{m.plateau(44,38,95,74,2,[{x0:40,y0:54,x1:50,y1:64},{x0:86,y0:47,x1:99,y1:57}],false);c(m,[[20,104],[31,75],[46,60],[90,52],[108,22]],9);c(m,[[20,104],[91,104],[116,67]],9);cover(m,72,87,12,645);},
  'SA-6':m=>{river(m,[[0,48],[34,49],[69,67],[103,74],[127,74]],7,false);for(const x of [23,66,108])crossingAt(m,[[x,39],[x,86]],10);c(m,[[20,104],[68,108],[111,100],[110,22]],10);town(m,72,26,103,48,655,{street:13,sym:false});cover(m,42,86,9,656);},
};

export function campaignLayouts() {
  const out=[];
  for(const [faction,titles] of Object.entries(campaignTitles))titles.forEach((title,i)=>{
    const order=i+1,id=`${faction.toLowerCase()}-${String(order).padStart(2,'0')}-${title.toLowerCase().replaceAll(' ','-')}`;
    const m=new MapBuilder({id:`${id}-layout`,title:`${title} — ${faction} operation`,width:128,height:128});recipes[`${faction}-${order}`](m);
    m.spawnAt(20,104,1).spawnAt(106,22,2).spawnAt(12,76,1).spawnAt(100,52,2);
    const sites={base:[20,104],site1:[50,82],site2:[85,65],site3:[103,39],exit:[105,44],safe:[37,105],enemy:[106,22],enemy2:[83,20],ally:[12,116],recovery1:[39,83],recovery2:[77,82],recoveryRig:[49,62]};
    // Distinct broad branches connect mission stages without deleting the
    // side-route terrain identity. Painted arteries are building-free.
    c(m,[[20,104],[50,82],[85,65],[103,39],[106,22]],7);
    track(m,[[20,104],[17,72],[29,43],[59,26],[83,20],[106,22]],6);
    track(m,[[37,105],[75,111],[111,93],[114,62],[105,44]],7);
    track(m,[[49,62],[50,82],[39,83],[43,96]],6);track(m,[[50,82],[77,82],[85,65]],6);track(m,[[50,82],[66,65],[85,65]],6);
    m.field(21,91,order===3&&faction==='IR'?6000000:36000000,false,'Starting field');
    m.field(47,78,24000000,false,'Western expansion').field(89,70,24000000,false,'Eastern expansion').field(109,11,36000000,false,'Opponent supply');
    m.station(49,85,false,'First military relay').station(88,62,false,'Second military relay').setShipment(66,65);
    for(const [name,[x,y]] of Object.entries(sites)) {
      m.disc(x,y,name==='base'?14:name==='enemy'?12:7,{terrain:'open',height:0,mandatory:false,sight:false},false);
      m.region(name,x-6,y-6,x+6,y+6);
    }
    m.region('corridor1',38,91,48,101).region('corridor2',72,77,82,87).region('training-move',29,94,36,102).region('training-cover',39,108,48,116);
    m.rect(39,108,48,116,{terrain:'cover',height:0,mandatory:false},false);
    for(const r of m.regions) {const x=(r.min.x+r.max.x)/2000,y=(r.min.y+r.max.y)/2000;if(r.id!=='training-cover')m.disc(x,y,3,{terrain:'open',height:0,sight:false},false)}
    m.rect(7,89,41,121,{terrain:'open',height:0,mandatory:false,sight:false},false);m.rect(89,7,124,42,{terrain:'open',height:0,mandatory:false,sight:false},false);m.rect(72,13,92,35,{terrain:'open',height:0,mandatory:false,sight:false},false);
    m.rect(39,108,48,116,{terrain:'cover',height:0,mandatory:false},false);m.clearSpawns(9);
    out.push({builder:m,kind:'scenario',launch:false,faction,order,missionId:id,missionTitle:title,sites,requiredPacks:[PACK]});
  });
  return out;
}
