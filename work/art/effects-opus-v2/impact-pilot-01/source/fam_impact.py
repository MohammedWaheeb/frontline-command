"""Material-specific impact artwork and symbolic disclosed-outcome marks.

Interception/decoy marks are symbols at an authorized event point, never an
invented missile breakup trajectory. Miss/blocked assets remain unwired because
the current Go event contract does not disclose those outcomes.
"""
from __future__ import annotations

import math
import random

from fxkit import (AMBER, BRASS, BRASS_DK, CONCRETE_0, CONCRETE_1, CONCRETE_2,
                   DUST_0, DUST_1, DUST_2, INK, OLIVE, ORANGE, PALE, RED,
                   SMOKE_1, SMOKE_2, SMOKE_3, STEEL_0, STEEL_1, STEEL_2,
                   Canvas, Clip, Effect, Frame, Lobe, cel_cluster, ease_io,
                   flame, render_frames, shard, streak, window)


DEFINITIONS = {
    'miss_ground': (12, 64, 'ground', 'UNWIRED: no explicit miss disclosure'),
    'blocked_shot': (12, 64, 'blocked', 'UNWIRED: no fired-projectile obstruction rule/event'),
    'hit_infantry': (14, 48, 'infantry', 'WIRED: explicitly confirmed hit with infantry armor; no gore'),
    'hit_light': (14, 64, 'light', 'WIRED: explicitly confirmed light-armor hit'),
    'hit_heavy': (14, 76, 'heavy', 'WIRED: explicitly confirmed heavy-armor hit'),
    'hit_structure': (14, 88, 'structure', 'WIRED: explicitly confirmed structure hit'),
    'hit_air': (14, 64, 'air', 'WIRED: explicitly confirmed air-armor hit at authorized actor anchor'),
    'intercepted_missile': (30, 64, 'intercept', 'WIRED: symbolic cancellation at the disclosed warning point; no physical flight'),
    'decoy_defeat': (30, 64, 'decoy', 'WIRED: explicit decoy-triggered event'),
    'cover_mitigated': (14, 44, 'cover', 'WIRED: positive explicit cover mitigation only'),
    'illegal_target_marker': (0, 36, 'illegal', 'UNWIRED decoration: existing own-order rejection remains authoritative'),
}


def symbol(cv, kind, t, reduced, soft):
    """Distinct shape semantics survive monochrome and all reduction flags."""
    alpha = 1 if t < .65 else 1-window(t, .65, 1)
    if soft:
        alpha *= .78
    spread = 1 if reduced else .85 + .15*ease_io(window(t, 0, .3))
    def line(points, color=BRASS, width=1.5):
        cv.paint(cv.line([(x*spread, y*spread) for x, y in points], width), color, alpha)
    if kind == 'illegal':
        for sx, sy in [(-1,-1),(-1,1),(1,-1),(1,1)]:
            line([(sx*5,sy*10),(sx*10,sy*10),(sx*10,sy*5)], (192,112,74))
        line([(-7,7),(7,-7)], (224,146,88), 2)
    elif kind == 'cover':
        line([(-8,-5),(-7,-14),(0,-17),(7,-14),(8,-5),(0,0),(-8,-5)], OLIVE, 1.7)
        line([(-4,-8),(-1,-5),(4,-11)], OLIVE, 1.5)
        if not reduced:
            line([(-12,-15),(-15,-18)], BRASS_DK, 1)
            line([(12,-15),(15,-18)], BRASS_DK, 1)
    elif kind == 'decoy':
        # A solid and an offset broken diamond read as a false target.
        line([(-15,0),(-8,-9),(-1,0),(-8,9),(-15,0)], OLIVE, 1.5)
        line([(3,-4),(8,-9),(15,0),(8,9),(3,4)], BRASS, 1.5)
        line([(-1,-12),(2,-15)], BRASS_DK, 1)
        line([(-1,12),(2,15)], BRASS_DK, 1)
    elif kind == 'intercept':
        # Broken octagonal brackets + crossed rocket glyph. No debris burst.
        line([(-15,-4),(-15,-10),(-10,-15),(-4,-15)])
        line([(4,-15),(10,-15),(15,-10),(15,-4)])
        line([(15,4),(15,10),(10,15),(4,15)])
        line([(-4,15),(-10,15),(-15,10),(-15,4)])
        line([(-3,7),(-3,-4),(0,-9),(3,-4),(3,7),(-3,7)], BRASS_DK, 1.3)
        line([(-8,8),(8,-8)], BRASS if soft else PALE, 2)


def physical(cv:Canvas, kind:str, t:float, reduced:bool, soft:bool, seed:str):
    phase = .36 if reduced else t
    fade = 1-ease_io(window(t, .5, 1))
    onset = ease_io(window(t, 0, .3)) if soft and not reduced else 1
    a = fade*(.75 if soft else 1)
    rng = random.Random(seed)
    if kind == 'blocked':
        # Authored deflection symbol; unavailable in current gameplay wiring.
        cv.paint(cv.line([(-14,-3),(-1,0),(11,-14)], 1.6), BRASS if soft else PALE, a*onset)
        cv.paint(cv.line([(7,-14),(11,-14),(11,-10)], 1.5), BRASS, a)
        return
    ground = kind in ('ground','infantry','structure')
    if ground:
        scale = {'ground':1.0,'infantry':.65,'structure':1.4}[kind]
        shades = (CONCRETE_0,CONCRETE_1,CONCRETE_2) if kind=='structure' else (DUST_0,DUST_1,DUST_2)
        lobes=[]
        for i in range(5):
            x=(i-2)*4*scale*(.6+phase)
            y=-3-(1-abs(i-2)/3)*11*phase*scale
            lobes.append(Lobe(x,y,(3+phase*4)*scale,rng.randrange(1<<28)))
        cel_cluster(cv,lobes,shades,a*.75,outline=0,squash=.8)
        count=7 if kind=='structure' else 4
        for i in range(count):
            angle=-math.pi*.9+i/max(1,count-1)*math.pi*.8
            reach=(3+phase*17)*scale
            shard(cv,math.cos(angle)*reach,math.sin(angle)*reach+phase*phase*9,
                  1.7*scale,angle+phase*2,shades[1],a,outline=.25,rng=random.Random(seed+str(i)))
        return
    size={'light':8,'heavy':12,'air':7}[kind]
    # A hot compact metal contact, followed by long asymmetric spark slashes.
    # Unlike a destruction blast this has no dust skirt or expanding fireball.
    if phase < .55 or reduced:
        radius=size*(1-.65*phase)
        flame(cv,0,-2,radius,random.Random(seed+':flash'),n=5,up=.25,
              ramp=[RED,ORANGE,AMBER] if soft else [RED,ORANGE,AMBER,PALE],
              alpha=a*onset*(1-phase),levels=(1,.72,.43,.2),rim=False)
    for i in range(7 if kind=='heavy' else 5):
        angle=-math.pi*.95+rng.random()*math.pi*.85
        speed=(10+rng.random()*10)*(1.2 if kind=='heavy' else 1)
        distance=3+phase*speed
        x,y=math.cos(angle)*distance,math.sin(angle)*distance+phase*phase*4
        length=(5+rng.random()*7)*(1-phase*.7)
        color=STEEL_1 if soft else (PALE if i%2 else AMBER)
        streak(cv,x-math.cos(angle)*length,y-math.sin(angle)*length,x,y,
               1.3 if kind=='heavy' else .9,color,a*onset)
    if phase>.18:
        cel_cluster(cv,[Lobe(-2,-5-phase*7,2.5+phase*2,93),Lobe(3,-2-phase*8,2+phase*2,51)],
                    (SMOKE_1,SMOKE_2,SMOKE_3),a*.45,outline=0)
    if kind=='heavy':
        # Two visible fragments give heavy armor a denser contact than a light hit.
        for i in range(2):
            shard(cv,(-1 if i else 1)*(4+phase*13),-3-phase*4,2.0,i+phase*2,
                  STEEL_0 if soft else STEEL_2,a,outline=.3,rng=random.Random(seed+':chip'+str(i)))


def build(name):
    ticks,size,kind,wiring=DEFINITIONS[name]
    eid='fx.impact.'+name
    symbolic=kind in ('cover','decoy','intercept','illegal')
    box=(size,size);origin=(size/2,size/2+4 if not symbolic else size/2)
    def draw(cv,t,reduced=False,soft=False):
        if symbolic:symbol(cv,kind,t,reduced,soft)
        else:physical(cv,kind,t,reduced,soft,eid)
    if ticks==0:
        fs=render_frames(box,origin,1,lambda cv,t,i:draw(cv,0,True,True),empty_tail=False)
        return Effect(eid,1,{'mark':Clip(0,False,fs)},
                      {v:'mark' for v in ('standard','low','reducedMotion','reducedFlashing','reduced')},
                      intent={'all':'static broken brackets and diagonal rejection stroke'},wiring=wiring)
    std=render_frames(box,origin,ticks-1,lambda cv,t,i:draw(cv,t))
    soft=render_frames(box,origin,ticks-1,lambda cv,t,i:draw(cv,t,soft=True))
    still=render_frames(box,origin,ticks-1,lambda cv,t,i:draw(cv,t,reduced=True))
    both=render_frames(box,origin,ticks-1,lambda cv,t,i:draw(cv,t,reduced=True,soft=True))
    low=[std[(i//2)*2] for i in range(ticks-1)]+[std[-1]]
    return Effect(eid,1,{'impact':Clip(20,False,std),'low':Clip(20,False,low),
                        'soft':Clip(20,False,soft),'settled':Clip(20,False,still),'settled_dim':Clip(20,False,both)},
                  {'standard':'impact','low':'low','reducedMotion':'settled','reducedFlashing':'soft','reduced':'settled_dim'},
                  intent={'standard':'distinct material contact or explicit symbolic outcome',
                          'low':'held samples on the same tick clock','reducedMotion':'fixed geometry with opacity fade',
                          'reducedFlashing':'muted palette; no white flash; eased ignition',
                          'reduced':'fixed muted geometry and opacity fade'},wiring=wiring,
                  notes='No damage/range/trajectory information is created by this decorative art.')


def effects(keys=None):
    return [build(name) for name in DEFINITIONS if keys is None or 'fx.impact.'+name in keys]
