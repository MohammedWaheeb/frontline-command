"""One-way import of backend rules; does not modify the authoritative design."""
import importlib.util
import json
from decimal import Decimal
from pathlib import Path
root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('design', root/'work/refinement/design_data.py')
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)
def milli(v): return int(Decimal(str(v))*1000)
def ticks(v): return int(Decimal(str(v))*20)
units=[]
for faction, roster in d.ROSTERS.items():
 for role,u in roster.items():
  units.append(dict(id=f'{faction}.{role}',name=u['name'],faction=faction,role=role,cost=milli(u['cost']),build_ticks=ticks(u['build']),hp=milli(u['hp']),armor=u['armor'],supply=u['supply'],tier=u['tier'],speed=milli(u['speed']),weapon=u['weapon'] or '',producer=u['producer'],radius={'infantry':350,'light':600,'heavy':800,'air':600}[u['armor']],sight=12000 if role in ('isr','scout_drone') else 11000 if role=='recon' or u['armor']=='air' else 9000,detection=7000 if role=='recon' else 6000 if role in ('isr','scout_drone') else 0))
weapons=[]
for id,(kind,damage,interval,mn,mx,ammo) in d.WEAPONS.items():
 weapons.append(dict(id=id,kind=kind,damage=milli(damage),interval_ticks=ticks(6 if id=='IR_ART' else interval),min_range=milli(mn),max_range=milli(mx),ammo=ammo or 0,windup_ticks=3 if kind=='small' else 6,splash=1500 if id in ('IR_ART','SY_ART') else 2000 if kind in ('shell','tactical') else 0,volley=4 if id=='IR_ART' else 1,volley_spacing_ticks=8 if id=='IR_ART' else 0))
# id, title, cost, seconds, HP, width, height, power capacity, power demand, prerequisites, faction, slots, weapon
rows=[
 ('hq','Headquarters',3500,70,4500,4,4,40,0,[], '',0,''),
 ('power','Power station',500,15,1500,2,2,100,0,['hq'],'',0,''),
 ('supply','Supply center',1800,35,2500,4,3,0,20,['power'],'',0,''),
 ('barracks','Barracks',600,15,1500,3,2,0,10,['power'],'',0,''),
 ('factory','Vehicle factory',1800,45,2500,4,4,0,25,['supply','barracks'],'',0,''),
 ('radar','Radar center',1400,35,1500,3,2,0,20,['supply','barracks'],'',0,''),
 ('tech','Technology center',2500,60,2000,3,3,0,35,['radar','factory'],'',0,''),
 ('depot','Repair depot',1000,25,1500,3,3,0,15,['factory'],'',0,''),
 ('outpost','Outpost',1000,30,1200,2,2,0,0,[],'',0,''),
 ('bunker','Guard bunker',400,15,1200,2,2,0,0,['barracks'],'',0,''),
 ('turret','Gun turret',650,20,1000,2,2,0,10,['factory'],'',0,'TURRET'),
 ('aa_post','Air-defense post',800,20,1000,2,2,0,15,['barracks'],'',0,'AA_POST'),
 ('abm','Interceptor battery',1800,40,1500,3,2,0,30,['radar'],'',0,''),
 ('strategic','Strategic operations site',4500,90,3000,4,4,0,80,['tech','radar'],'',0,''),
 ('US.airfield','US airfield',2200,45,2500,6,5,0,35,['radar'],'US',6,''),
 ('IR.drone_hub','Iranian drone hub',1500,35,2200,4,4,0,30,['radar'],'IR',6,''),
 ('SY.workshop_air','Syrian air workshop',1000,30,1800,3,3,0,15,['radar'],'SY',2,''),
 ('SA.airfield','Saudi airfield',2000,50,2500,6,5,0,30,['radar'],'SA',4,''),
 ('SY.safehouse','Syrian safehouse',800,25,900,2,2,0,0,['radar'],'SY',0,''),
]
buildings=[]
for id,name,cost,sec,hp,w,h,cap,demand,prereq,faction,slots,weapon in rows:
 role=id.split('.')[-1]
 buildings.append(dict(id=id,name=name,role=role,cost=milli(cost),build_ticks=ticks(sec),hp=milli(hp),width=w,height=h,power_capacity=cap,power_demand=demand,prerequisites=prereq,faction=faction,service_slots=slots,weapon=weapon,defense=role in ('turret','aa_post','abm'),qualifying=role in ('hq','barracks','factory','airfield','drone_hub','workshop_air')))
upgrades=[]
for id,name,faction,cost,sec,tier,effect in [
 ('vehicle_armor','Vehicle armor','',1200,45,3,'vehicle_armor'),('weapons_training','Weapons training','',1500,60,2,'weapon_damage'),
 ('US.countermeasures','Defensive countermeasures','US',1200,45,2,'decoy'),('US.service_crews','Airfield service crews','US',1600,60,3,'air_repair'),
 ('IR.drone_servicing','Distributed drone servicing','IR',1000,45,2,'drone_service'),('IR.launcher_crews','Mobile launcher crews','IR',1600,60,3,'launcher_deploy'),
 ('SY.prepared_exits','Prepared exits','SY',1000,45,2,'transit'),('SY.field_restoration','Field restoration','SY',1400,60,3,'vehicle_repair'),
 ('SA.service_crews','Mobile service crews','SA',1100,45,2,'service_deploy'),('SA.interception','Integrated interception','SA',1700,60,3,'abm_recharge')]:
 upgrades.append(dict(id=id,name=name,faction=faction,cost=milli(cost),build_ticks=ticks(sec),tier=tier,producer='radar' if tier==2 else 'tech',effect=effect))
pack=dict(version='2.0.0',units=units,weapons=weapons,buildings=buildings,upgrades=upgrades,armor=[dict(weapon=k,armor=a,multiplier=milli(v)) for k,row in d.ARMOR.items() for a,v in row.items()])
(root/'pkg/content/rules.json').write_text(json.dumps(pack,indent=2)+'\n')
print(f'Imported {len(units)} units, {len(weapons)} weapons, {len(buildings)} buildings, {len(upgrades)} upgrades')
