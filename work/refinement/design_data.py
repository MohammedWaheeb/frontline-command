"""Single-source tuning inputs for the v2 design and analytical checks."""

# name, credits, build seconds, HP, armor, supply, tier, speed, weapon, producer
BASE = {
 'rifle': ('Rifle squad',300,10,300,'infantry',2,1,2.5,'RIF','barracks'),
 'at': ('Anti-armor team',500,15,220,'infantry',2,1,2.5,'AT','barracks'),
 'recon': ('Recon squad',350,12,180,'infantry',1,1,3.0,'REC','barracks'),
 'elite': ('Commando team',1600,40,500,'infantry',4,3,2.8,'ELI','barracks'),
 'engineer': ('Engineer',400,12,150,'infantry',1,1,2.5,None,'barracks'),
 'medic': ('Medic',350,12,160,'infantry',1,1,2.5,None,'barracks'),
 'car': ('Scout car',500,15,450,'light',2,1,4.5,'AUTO','factory'),
 'apc': ('APC',700,20,700,'light',3,1,3.5,'APC','factory'),
 'tank': ('Battle tank',1200,30,1400,'heavy',4,1,2.3,'TANK','factory'),
 'artillery': ('Artillery',1100,30,600,'light',3,2,2.0,'ART','factory'),
 'aa': ('Mobile AA',900,25,650,'light',3,1,3.0,'AA','factory'),
 'repair': ('Repair truck',600,18,400,'light',2,1,3.0,None,'factory'),
 'fighter': ('Interceptor',1500,40,700,'air',4,2,7.0,'FIGHT','airfield'),
 'strike': ('Strike aircraft',1700,45,650,'air',4,2,7.0,'STRIKE','airfield'),
 'gunship': ('Gunship',1300,35,800,'air',4,2,4.0,'GUN','airfield'),
 'launcher': ('Tactical launcher',2600,55,650,'light',5,3,1.8,'MISSILE','factory'),
 'rig': ('Construction rig',800,20,600,'light',0,1,2.0,None,'hq'),
 'hauler': ('Supply hauler',900,25,900,'heavy',0,1,3.0,None,'supply'),
}
KEYS = ('name','cost','build','hp','armor','supply','tier','speed','weapon','producer')

NAMES = {
 'US': ['Ranger squad','Guided-missile team','Pathfinder team','Special operations team','Combat engineer','Field medic','Recon rover','Infantry carrier','Sentinel tank','Precision howitzer','Skyguard vehicle','Recovery vehicle','Falcon interceptor','Precision strike jet','Attack helicopter','Precision missile carrier','Engineering rig','Logistics truck'],
 'IR': ['Line infantry','Missile infantry','Forward observers','Infiltration team','Field engineer','Medical team','Patrol vehicle','Armored troop carrier','Bastion tank','Rocket artillery','Mobile SAM','Maintenance truck','Interceptor drone','Strike drone','Loiter drone','Tactical missile launcher','Construction crawler','Supply transporter'],
 'SY': ['Mobile rifle squad','Anti-armor crew','Local scouts','Veteran raiders','Mechanic team','Aid team','Light technical','Troop technical','Refitted tank','Mobile mortar','Air-defense technical','Salvage truck','Portable AA team','Scout drone','Raider buggy','Heavy rocket carrier','Workshop rig','Supply convoy truck'],
 'SA': ['Mechanized rifle squad','Anti-tank detachment','Desert reconnaissance','Rapid-response team','Engineering detachment','Medical detachment','Desert patrol car','Wheeled infantry carrier','Guardian tank','Mobile howitzer','Air-shield vehicle','Service vehicle','Defense fighter','Multirole strike jet','Escort helicopter','Cruise missile carrier','Infrastructure rig','Logistics carrier'],
}

OVERRIDES = {
 'US': {
   'tank':dict(cost=1300,hp=1400),
   'fighter':dict(cost=1600,hp=750,build=38,weapon='US_FIGHT'),
   'strike':dict(cost=1800,hp=700,build=42,weapon='US_STRIKE'),
   'gunship':dict(cost=1400,hp=800,weapon='US_GUN'),
   'launcher':dict(cost=2800,build=60),
 },
 'IR': {
   'tank':dict(cost=1150,hp=1200),
   'artillery':dict(cost=1200,hp=550,weapon='IR_ART'),
   'fighter':dict(cost=1000,build=28,hp=400,supply=3,speed=6.5,weapon='IR_FIGHT',producer='drone_hub'),
   'strike':dict(cost=750,build=24,hp=320,supply=2,speed=5.5,weapon='IR_STRIKE',producer='drone_hub'),
   'gunship':dict(cost=950,build=28,hp=450,supply=3,speed=4.5,weapon='IR_LOITER',producer='drone_hub'),
   'launcher':dict(cost=2400,build=55,hp=600,weapon='IR_MISSILE'),
 },
 'SY': {
   'rifle':dict(cost=250,hp=250,speed=2.8),
   'at':dict(cost=450,hp=190,speed=2.8),
   'recon':dict(cost=300,hp=160,speed=3.3),
   'elite':dict(cost=1400,hp=420,speed=3.1),
   'car':dict(cost=400,hp=330,speed=5.0),
   'apc':dict(cost=550,hp=480,speed=4.2),
   'tank':dict(cost=1250,hp=1050,weapon='SY_TANK'),
   'artillery':dict(cost=900,hp=450,speed=2.7,weapon='SY_ART'),
   'aa':dict(cost=750,hp=480,speed=4.0),
   'fighter':dict(cost=350,build=12,hp=180,armor='infantry',supply=2,tier=1,speed=2.8,weapon='SY_AA',producer='barracks'),
   'strike':dict(cost=500,build=20,hp=180,supply=1,speed=5.0,weapon=None,producer='workshop_air'),
   'gunship':dict(cost=850,build=25,hp=480,armor='light',supply=3,speed=5.0,weapon='SY_BUGGY',producer='factory'),
   'launcher':dict(cost=2100,build=50,hp=500,speed=2.2,weapon='SY_ROCKET'),
 },
 'SA': {
   'apc':dict(cost=800,hp=850,speed=3.7),
   'tank':dict(cost=1400,hp=1600,speed=2.2),
   'aa':dict(cost=1050,hp=850,speed=2.8),
   'repair':dict(cost=750,hp=550,speed=3.2),
   'fighter':dict(cost=1550,hp=700),
   'strike':dict(cost=1750,hp=650),
   'gunship':dict(cost=1350,hp=800),
 },
}

EXTRAS = {
 'US': [('airlift',('Transport helicopter',900,28,550,'air',3,2,5.5,None,'airfield'))],
 'IR': [('isr',('Survey drone',450,18,180,'air',1,2,5.5,None,'drone_hub'))],
 'SY': [],
 'SA': [('mobile_abm',('Aegis carrier',1600,40,850,'light',4,2,2.5,None,'factory'))],
}

# Weapon class, damage per projectile, interval seconds, min/max range, rounds per sortie/magazine.
WEAPONS = {
 'RIF': ('small',24,1,0,5,None),
 'REC': ('small',12,1,0,4,None),
 'ELI': ('small',60,1,0,6,None),
 'APC': ('small',16,1,0,5,None),
 'AUTO': ('auto',18,.75,0,5,None),
 'TANK': ('cannon',100,2.5,0,7,None),
 'AT': ('antiarmor',100,3,0,7,None),
 'ART': ('shell',140,5,4,14,None),
 'AA': ('antiair',70,1.5,0,10,None),
 'FIGHT': ('antiair',100,2,0,9,6),
 'STRIKE': ('airground',160,1,0,8,2),
 'GUN': ('airground',60,2,0,7,8),
 'US_FIGHT': ('antiair',100,1.8,0,10,6),
 'US_STRIKE': ('airground',200,1,0,8,2),
 'US_GUN': ('airground',65,2,0,7,8),
 'IR_ART': ('shell',40,1,5,15,None),
 'IR_FIGHT': ('antiair',70,1.5,0,8,6),
 'IR_STRIKE': ('airground',100,1,0,6,2),
 'IR_LOITER': ('airground',40,2,0,7,10),
 'SY_ART': ('shell',100,4.5,3,12,None),
 'SY_AA': ('antiair',50,2,0,8,None),
 'SY_BUGGY': ('antiarmor',70,3,0,7,None),
 'SY_TANK': ('cannon',90,3,0,7,None),
 'MISSILE': ('tactical',500,80,10,36,1),
 'IR_MISSILE': ('tactical',350,60,10,44,2),
 'SY_ROCKET': ('tactical',400,65,8,28,1),
 'TURRET': ('cannon',80,2,0,9,None),
 'AA_POST': ('antiair',70,1.5,0,11,None),
}
ARMOR = {
 'small': {'infantry':1,'light':.35,'heavy':.10,'structure':.10,'air':0},
 'auto': {'infantry':1,'light':1,'heavy':.35,'structure':.30,'air':0},
 'cannon': {'infantry':.35,'light':1,'heavy':1,'structure':.70,'air':0},
 'antiarmor': {'infantry':0,'light':1,'heavy':1.4,'structure':.70,'air':0},
 'shell': {'infantry':1,'light':.8,'heavy':.45,'structure':1,'air':0},
 'antiair': {'infantry':0,'light':0,'heavy':0,'structure':0,'air':1},
 'airground': {'infantry':.65,'light':1,'heavy':1,'structure':1,'air':0},
}

def rosters():
    factions={}
    for faction, names in NAMES.items():
        rows={}
        for (key,values), name in zip(BASE.items(),names,strict=True):
            u=dict(zip(KEYS,values,strict=True))
            u['name']=name
            u.update(OVERRIDES[faction].get(key,{}))
            role_key = {'fighter':'portable_aa','strike':'scout_drone','gunship':'buggy'}.get(key,key) if faction=='SY' else key
            rows[role_key]=u
        for key,values in EXTRAS[faction]:
            rows[key]=dict(zip(KEYS,values,strict=True))
        factions[faction]=rows
    return factions

ROSTERS=rosters()

def roster_md(faction):
    lines=['| Unit / role ID | Credits / build s | HP / armor | Supply / tier | Move | Weapon | Producer |',
           '|---|---:|---|---|---:|---|---|']
    for key,u in ROSTERS[faction].items():
        lines.append(f"| {u['name']} (`{faction}.{key}`) | {u['cost']} / {u['build']} | {u['hp']} / {u['armor']} | {u['supply']} / T{u['tier']} | {u['speed']:g} | {u['weapon'] or 'Unarmed'} | {u['producer']} |")
    return '\n'.join(lines)

def weapons_md():
    lines=['| Weapon ID | Class | Damage / shot | Shot interval s | Range tiles | Ammunition |',
           '|---|---|---:|---:|---|---|']
    for key,(kind,dmg,interval,mn,mx,ammo) in WEAPONS.items():
        timing='Volley rule below' if key=='IR_ART' else f'{interval:g}'
        if kind=='tactical': timing=f'{interval:g} / charge'
        lines.append(f'| `{key}` | {kind} | {dmg} | {timing} | {mn}-{mx} | {ammo if ammo is not None else "Unlimited"} |')
    return '\n'.join(lines)
