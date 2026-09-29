package sim

import (
 "encoding/json"
 "os"
 "path/filepath"
 "reflect"
 "testing"
)

// Prepared units/infrastructure (and confined loaded cargo in the blocked branch)
// are explicit grants before replay recording. All subsequent changes are ordinary
// Submit/Advance; this is transport/render evidence, never an opening-economy claim.
func TestAPCLifecycleCourse(t *testing.T) {
 for _, branch := range []string{"ordinary", "blocked", "under-fire"} { t.Run(branch, func(t *testing.T) {
  setup:=transportAcceptanceFixture(t,"SY.apc"); e:=setup.engine; carrier:=e.entity(setup.carrier)
  for _,v:=range e.state.Entities {v.Stance="hold"}
  for _,id:=range setup.passengers {u:=e.entity(id);u.HP=u.MaxHP;u.Stance="hold"}
  home:=e.spawn("IR.drone_hub",2,Vec{X:42000,Y:35000},true,0)
  observer:=e.spawn("IR.isr",2,Vec{X:35000,Y:18000},true,0);observer.Home=home.ID;observer.Stance="hold";secondObserver:=e.spawn("IR.isr",2,Vec{X:20000,Y:33000},true,0);secondObserver.Home=home.ID;secondObserver.Stance="hold"
  tank:=e.spawn("IR.tank",2,Vec{X:48000,Y:30000},true,0);tank.Stance="hold";if branch=="under-fire" {tank.Position=Vec{X:31000,Y:19000};tank.LastPosition=tank.Position;tank.Anchor=tank.Position}
  if branch=="blocked" {for _,id:=range setup.passengers {u:=e.entity(id);u.Container=carrier.ID;u.Position=carrier.Position;u.State="embarked";carrier.Passengers=append(carrier.Passengers,id)};sealTransportArea(e,carrier.Position,true)}
  r:=droneRecord(t,e,"apc-"+branch);dir:=filepath.Join(os.Getenv("FRONTLINE_APC_COURSE"),branch)
  if os.Getenv("FRONTLINE_APC_COURSE")=="" {t.Fatal("output required")};if err:=os.MkdirAll(dir,0755);err!=nil {t.Fatal(err)}
  write:=func(name string,value any){t.Helper();b,err:=json.MarshalIndent(value,"","  ");if err!=nil {t.Fatal(err)};if err=os.WriteFile(filepath.Join(dir,name),b,0644);err!=nil {t.Fatal(err)}}
  write("map.json",e.state.Map)
  type point struct {Stage string `json:"stage"`;Tick Tick `json:"tick"`;Hash string `json:"hash"`;Actor ID `json:"actor"`;Owned View `json:"owned"`;Foreign View `json:"foreign"`;Passengers []ID `json:"passengers"`}
  points:=[]point{}
  capture:=func(stage string){t.Helper();own,_:=e.PlayerView(1);foreign,_:=e.PlayerView(2);visible:=false;for _,v:=range foreign.Entities {if v.ID==carrier.ID {visible=true};if v.Owner==1&&v.Private!=nil {t.Fatal("foreign private data")}};if !visible {t.Fatal("APC absent from real foreign sight",stage)}
   save,err:=e.Save();if err!=nil {t.Fatal(err)};copy,err:=Restore(e.catalog,save);if err!=nil||copy.Hash()!=e.Hash(){t.Fatal("restore",err)};a,_:=copy.PlayerView(1);b,_:=copy.PlayerView(2);if !reflect.DeepEqual(a,own)||!reflect.DeepEqual(b,foreign){t.Fatal("restored views")};if err=os.WriteFile(filepath.Join(dir,stage+".save.json"),save,0644);err!=nil {t.Fatal(err)};points=append(points,point{stage,e.Tick(),e.Hash(),carrier.ID,own,foreign,setup.passengers});write("course.json",points)
  }
  t.Cleanup(func(){if t.Failed(){if b,err:=e.Save();err==nil {_=os.WriteFile(filepath.Join(dir,"failure.save.json"),b,0644)};v,_:=e.PlayerView(1);write("failure.owner.json",v)}})
  until:=func(label string,n int,done func()bool){t.Helper();for range n {if done(){return};r.step()};if !done(){t.Fatalf("%s tick%d carrier%+v",label,e.Tick(),carrier)}}
  healthy:=func(){t.Helper();for _,id:=range setup.passengers {u:=e.entity(id);if u==nil||u.HP!=u.MaxHP {t.Fatal("passenger health changed",id)}}}
  capture("01-closed")
  if branch=="under-fire" {
   r.submit(2,Order{Kind:"attack",Entities:[]ID{tank.ID},Target:carrier.ID})
   until("live approaching projectile",100,func()bool{for _,p:=range e.state.Projectiles {if p.Shooter==tank.ID&&p.ImpactAt>e.Tick()+1 {return true}};return false})
   beforeHP:=carrier.HP;r.submit(1,Order{Kind:"board",Entities:setup.passengers,Target:carrier.ID});r.step();start:=e.Tick();capture("02-boarding-under-fire")
   until("actual damage during board",18,func()bool{return carrier.HP<beforeHP});if len(carrier.Passengers)!=0||e.entity(setup.passengers[0]).Channel!="board" {t.Fatal("damage canceled or skipped boarding")};capture("03-hit-boarding-retained")
   until("damaged board completion",22,func()bool{return len(carrier.Passengers)==len(setup.passengers)});if e.Tick()!=start+20 {t.Fatal("damaged board duration changed")};healthy();capture("04-damaged-board-complete")
  } else if branch=="blocked" {
   r.submit(1,Order{Kind:"unload",Entities:[]ID{carrier.ID}});r.step();capture("02-unload-start")
   until("blocked unload",40,func()bool{return carrier.State=="unload_exit_blocked"});capture("03-blocked-exit");healthy()
   before:=len(carrier.Passengers);for range 30 {r.step()};if len(carrier.Passengers)!=before {t.Fatal("blocked cargo escaped")};capture("04-blocked-wait")
   r.submit(1,Order{Kind:"stop",Entities:[]ID{carrier.ID}});r.step();if carrier.Channel!="" {t.Fatal("cancel failed")};capture("05-canceled-closed")
  } else {
   r.submit(1,Order{Kind:"board",Entities:setup.passengers,Target:carrier.ID});r.step()
   start:=e.Tick();for _,id:=range setup.passengers {if e.entity(id).ChannelUntil-start!=20 {t.Fatal("SY boarding is not 20 ticks")}};capture("02-boarding-open")
   for range 10 {r.step()};capture("03-boarding-midpoint")
   until("board complete",22,func()bool{return len(carrier.Passengers)==len(setup.passengers)});if e.Tick()!=start+20 {t.Fatal("boarding changed exact duration",e.Tick(),start)};healthy();capture("04-loaded-closed")
   r.submit(1,Order{Kind:"move",Entities:[]ID{carrier.ID},Position:Vec{X:26000,Y:24000}});r.step();until("loaded movement",60,func()bool{return carrier.LastPosition!=carrier.Position});capture("05-loaded-moving")
   until("move complete",300,func()bool{return len(carrier.Orders)==0});capture("06-arrived-closed")
   r.submit(1,Order{Kind:"unload",Entities:[]ID{carrier.ID}});r.step();start=e.Tick();if carrier.ChannelUntil-start!=20 {t.Fatal("SY unloading is not 20 ticks")};capture("07-unload-open");for range 19 {r.step()};if len(carrier.Passengers)!=len(setup.passengers){t.Fatal("unloaded early")};capture("08-last-unload-tick");r.step();if len(carrier.Passengers)!=0 {t.Fatal("unload incomplete")};healthy()
   for _,id:=range setup.passengers {u:=e.entity(id);if u.Container!=0||!e.clear(u.Position,e.radius(u),u.ID,false,true){t.Fatal("illegal unloaded passenger",id)}};capture("09-unloaded-closed")
   r.submit(1,Order{Kind:"board",Entities:setup.passengers,Target:carrier.ID});until("reboard begun",60,func()bool{return e.entity(setup.passengers[0]).Channel=="board"});capture("10-reboard-open")
   r.submit(1,Order{Kind:"move",Entities:[]ID{carrier.ID},Position:Vec{X:29000,Y:24000}});until("movement interrupts",30,func()bool{return carrier.LastPosition!=carrier.Position});for _,id:=range setup.passengers {u:=e.entity(id);if u.Container!=0||u.Channel!="" {t.Fatal("move failed to interrupt boarding")}};capture("11-movement-canceled-boarding")
   r.submit(1,Order{Kind:"stop",Entities:append([]ID{carrier.ID},setup.passengers...)});r.step();capture("12-stopped-closed")
   r.submit(2,Order{Kind:"attack",Entities:[]ID{tank.ID},Target:carrier.ID});until("actual damaged silhouette",1000,func()bool{return carrier.HP*1000/carrier.MaxHP<430});r.submit(2,Order{Kind:"stop",Entities:[]ID{tank.ID}});r.step();if e.entity(carrier.ID)==nil {t.Fatal("damage destroyed APC")};healthy();capture("13-actual-damage")
   r.submit(2,Order{Kind:"move",Entities:[]ID{tank.ID},Position:Vec{X:48000,Y:30000}});r.submit(1,Order{Kind:"move",Entities:[]ID{carrier.ID},Position:Vec{X:22000,Y:24000}})
   until("retreat from combat",500,func()bool{return len(carrier.Orders)==0&&distance(carrier.Position,tank.Position)>18000});if e.entity(carrier.ID)==nil {t.Fatal("retreat failed")};healthy();capture("14-damaged-closed")
  }
  if err:=r.replay.Capture(e,false);err!=nil {t.Fatal(err)};full:=*r.replay;full.Checkpoints=nil
  for _,p:=range points {replayed,err:=full.Seek(e.catalog,p.Tick);if err!=nil||replayed.Hash()!=p.Hash {t.Fatal("full replay boundary",p.Stage,err)};a,_:=replayed.PlayerView(1);b,_:=replayed.PlayerView(2);if !reflect.DeepEqual(a,p.Owned)||!reflect.DeepEqual(b,p.Foreign){t.Fatal("replay view boundary",p.Stage)}}
  packed,err:=full.Encode();if err!=nil {t.Fatal(err)};if err=os.WriteFile(filepath.Join(dir,"course.fcr"),packed,0644);err!=nil {t.Fatal(err)}
  write("result.json",map[string]any{"status":"passed","points":len(points),"hash":e.Hash(),"tick":e.Tick(),"metadata":e.Metadata(),"full_replay_exact":true,"healthy_passengers":true,"prepared_fixture":true,"branch":branch})
 })}
}
