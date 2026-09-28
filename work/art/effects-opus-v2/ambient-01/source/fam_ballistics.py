"""Original weapon-family flashes and readable local-axis projectile bodies.

Long axes point toward screen +X. Production integration must orient them from
the actual firing actor or successive authorized body samples, never a hidden
target or guessed future endpoint. No source-to-target beam is painted here.
"""
from __future__ import annotations

import math
import random

from fxkit import (AMBER, BRASS, BRASS_DK, EMBER, INK, ORANGE, PALE, RED,
                   SMOKE_1, SMOKE_2, SMOKE_3, STEEL_0, STEEL_1, STEEL_2,
                   Clip, Effect, Lobe, cel_cluster, ease_io, flame,
                   render_frames, streak, window)


# Exact 28 manifest weapon IDs. These are visual families, not balance data.
MUZZLES = {
    'RIF':('small',7), 'REC':('small',6), 'ELI':('small',8), 'APC':('small',9),
    'AUTO':('auto',10), 'TANK':('cannon',16), 'AT':('rocket',12),
    'ART':('cannon',21), 'AA':('rocket',12), 'FIGHT':('rocket',11),
    'STRIKE':('release',8), 'GUN':('auto',11), 'US_FIGHT':('rocket',12),
    'US_STRIKE':('release',9), 'US_GUN':('auto',12), 'IR_ART':('rocket',17),
    'IR_FIGHT':('rocket',10), 'IR_STRIKE':('release',7), 'IR_LOITER':('auto',8),
    'SY_ART':('mortar',15), 'SY_AA':('rocket',11), 'SY_BUGGY':('rocket',10),
    'SY_TANK':('cannon',15), 'MISSILE':('rocket',21), 'IR_MISSILE':('rocket',22),
    'SY_ROCKET':('rocket',19), 'TURRET':('cannon',16), 'AA_POST':('rocket',14),
}
PROJECTILES = {
    'tracer_small':('tracer',5), 'tracer_auto':('tracer',8),
    'shell_cannon':('shell',8), 'missile_at':('missile',11),
    'shell_artillery':('shell',10), 'rocket_ir':('rocket',12),
    'mortar':('mortar',7), 'missile_aa':('missile',10),
    'bomb':('bomb',10), 'tactical_missile':('missile',17),
    'strategic_missile':('missile',23), 'interceptor':('missile',12),
}


def muzzle_draw(cv,t,kind,size,seed,still=False,soft=False):
    phase=.2 if still else t
    fade=1-ease_io(window(t,.25,1))
    onset=ease_io(window(t,0,.45)) if soft and not still else 1
    a=fade*(.7 if soft else 1)
    if kind=='release':
        # A mechanical rack release has no invented cannon or rocket ignition.
        cv.paint(cv.line([(-4,-4),(0,-2),(4,-4)],1.3),STEEL_1,a)
        cv.paint(cv.line([(-4,4),(0,2),(4,4)],1.3),STEEL_1,a)
        cv.paint(cv.ellipse(0,0,1.8,1.0),BRASS_DK if soft else BRASS,a*onset)
        return
    if kind=='rocket':
        # Short backblast behind the launcher. Origin is the actual muzzle.
        length=size*(.7+phase*.5)
        cv.paint(cv.poly([(0,-2),(-length*.55,-size*.33),(-length,0),(-length*.65,size*.27),(0,2)]),
                 RED if soft else ORANGE,a*onset)
        cv.paint(cv.poly([(0,-1),(-length*.45,-size*.12),(-length*.68,0),(-length*.35,size*.12),(0,1)]),
                 AMBER if soft else PALE,a*onset*.8)
        if phase>.1:
            cel_cluster(cv,[Lobe(-length-2,-1,size*.21,7),Lobe(-length-5,2,size*.17,11)],
                        (SMOKE_1,SMOKE_2,SMOKE_3),a*.38,outline=0)
        return
    r=size*(1-phase*.65)
    ramp=[EMBER,RED,ORANGE,AMBER] if soft else [RED,ORANGE,AMBER,PALE]
    if kind=='mortar':
        flame(cv,0,-r*.25,r*.5,random.Random(seed),n=7,up=.55,alpha=a*onset,ramp=ramp,levels=(1,.7,.45,.2),rim=False)
        cel_cluster(cv,[Lobe(-3,-3-phase*8,4,9),Lobe(4,-3-phase*9,4,18)],
                    (SMOKE_1,SMOKE_2,SMOKE_3),a*.4,outline=0)
    else:
        # Compact, directional six-point flare; heavy barrels add a smoke puff.
        cv.paint(cv.poly([(0,-2),(r*.35,-r*.4),(r*.43,-r*.12),(r,0),
                          (r*.43,r*.12),(r*.3,r*.33),(0,2)]),ramp[0],a*onset)
        cv.paint(cv.poly([(0,-1.2),(r*.35,-r*.18),(r*.8,0),(r*.32,r*.16),(0,1.2)]),ramp[2],a*onset)
        cv.paint(cv.poly([(0,-.8),(r*.47,0),(0,.8)]),ramp[3],a*onset)
        if kind in ('cannon','auto'):
            cel_cluster(cv,[Lobe(2+phase*7,-1-phase*2,size*.16,19)],
                        (SMOKE_1,SMOKE_2,SMOKE_3),a*.23,outline=0)


def build_muzzle(name):
    kind,size=MUZZLES[name];eid='fx.weapon_muzzle.'+name
    box=(80,64);origin=(40,36)
    def frames(still=False,soft=False):
        return render_frames(box,origin,5,lambda cv,t,i:muzzle_draw(cv,t,kind,size,eid,still,soft))
    std,soft,rm,rd=frames(),frames(soft=True),frames(still=True),frames(still=True,soft=True)
    low=[std[(i//2)*2] for i in range(5)]+[std[-1]]
    return Effect(eid,1,{'flash':Clip(20,False,std),'low':Clip(20,False,low),
                        'soft':Clip(20,False,soft),'settled':Clip(20,False,rm),'settled_dim':Clip(20,False,rd)},
                  {'standard':'flash','low':'low','reducedMotion':'settled','reducedFlashing':'soft','reduced':'settled_dim'},
                  intent={'standard':kind+' family, single short authored firing cue',
                          'low':'held geometry on the same six-tick clock',
                          'reducedMotion':'fixed flare/release geometry fading in place',
                          'reducedFlashing':'warm dim eased onset without white',
                          'reduced':'fixed warm dim geometry'},
                  wiring='Existing weapon_fired fact selects this ID; +X orientation and muzzle attachment acceptance required before install.',
                  notes='Family differences follow catalog role; no fire-rate, damage or physical trajectory is implied. Six ticks including terminal.')


def projectile_draw(cv,t,kind,size,soft=False,still=False):
    pulse=1 if still or soft else .9+.1*math.sin(t*math.tau)
    bright=BRASS if soft else PALE
    if kind=='tracer':
        streak(cv,-size,0,size*.3,0,2.4,INK,.9)
        streak(cv,-size,0,size*.3,0,1.2,bright,pulse)
        return
    if kind in ('missile','rocket'):
        flame_length=size*.5
        cv.paint(cv.poly([(-size*.65,-1),(-size*.65-flame_length,0),(-size*.65,1)]),
                 ORANGE if soft else AMBER,pulse*.8)
    # Deliberate silhouettes: tapered shell, finned missile/rocket, teardrop bomb,
    # squat mortar. All fit the same local-axis convention and stay opaque.
    if kind=='shell':
        pts=[(-size*.55,-2),(size*.4,-2),(size*.85,0),(size*.4,2),(-size*.55,2)]
    elif kind=='bomb':
        pts=[(-size*.65,-4),(-size*.25,-2),(size*.5,-3),(size*.85,0),(size*.5,3),(-size*.25,2),(-size*.65,4)]
    elif kind=='mortar':
        pts=[(-size*.65,-3),(-size*.2,-1.8),(size*.45,-3),(size*.8,0),(size*.45,3),(-size*.2,1.8),(-size*.65,3)]
    else:
        pts=[(-size*.65,-4),(-size*.42,-1.8),(size*.45,-1.8),(size*.88,0),
             (size*.45,1.8),(-size*.42,1.8),(-size*.65,4),(-size*.65,1.5),(-size*.8,1.5),(-size*.8,-1.5),(-size*.65,-1.5)]
    cv.paint(cv.poly([(x*1.09,y*1.15) for x,y in pts]),INK,1)
    cv.paint(cv.poly(pts),STEEL_0 if kind in ('bomb','rocket') else STEEL_1,1)
    cv.paint(cv.line([(-size*.35,-.8),(size*.38,-.8)],1),STEEL_1 if soft else STEEL_2,.95)
    if kind in ('missile','rocket'):
        cv.paint(cv.line([(size*.27,-1.4),(size*.27,1.4)],1.1),BRASS_DK,1)


def build_projectile(name):
    kind,size=PROJECTILES[name];eid='fx.projectile.'+name
    def frames(soft=False,still=False):
        return render_frames((88,40),(44,20),1 if still else 8,
                             lambda cv,t,i:projectile_draw(cv,t,kind,size,soft,still),empty_tail=False)
    std,soft,rm,rd=frames(),frames(soft=True),frames(still=True),frames(still=True,soft=True)
    low=std[::2]
    return Effect(eid,1,{'body':Clip(10,True,std),'low':Clip(5,True,low),'dim':Clip(10,True,soft),
                        'still':Clip(0,False,rm),'still_dim':Clip(0,False,rd)},
                  {'standard':'body','low':'low','reducedMotion':'still','reducedFlashing':'dim','reduced':'still_dim'},
                  intent={'standard':'readable '+kind+' silhouette; at most a subtle 1.25 Hz exhaust modulation',
                          'low':'half as many temporal samples, identical loop length',
                          'reducedMotion':'static body, no animated exhaust','reducedFlashing':'constant dim exhaust',
                          'reduced':'static muted body'},
                  wiring=('UNWIRED: no disclosed tracer endpoint' if name=='tracer_small' else
                          'UNWIRED: no disclosed interceptor path' if name=='interceptor' else
                          'Actual visible projectile body only; +X orientation from permitted samples must be integrated before install.'),
                  notes='Origin is the current disclosed body point. Artwork is a small body, not a guessed trajectory or blast radius.')


def effects(keys=None):
    out=[]
    for name in MUZZLES:
        if keys is None or 'fx.weapon_muzzle.'+name in keys:out.append(build_muzzle(name))
    for name in PROJECTILES:
        if keys is None or 'fx.projectile.'+name in keys:out.append(build_projectile(name))
    return out
