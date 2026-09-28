"""Original persistent battlefield cosmetics and disclosed resource transitions.

Artwork only: the eventual consumer must use a currently permitted actor/state
or an explicit event. These assets never supply health, ownership or timers.
They extend Claude Opus 5.5's preserved fxkit under the user's quota fallback.
"""
from __future__ import annotations

import math
import random

import numpy as np

from fxkit import (AMBER, BRASS, DUST_0, DUST_1, DUST_2, EMBER, INK,
                   OLIVE, ORANGE, RED, SMOKE_1, SMOKE_2, SMOKE_3,
                   Clip, Effect, Lobe, cel_cluster, ease_io, flame,
                   render_frames, window)


# group/name: ticks, loop, canvas, origin, form, size
DEFINITIONS = {
    'unit.dust_trail': (24, True, (88, 56), (44, 34), 'dust', .7),
    'unit.rotor_wash': (32, True, (148, 80), (74, 42), 'wash', 1),
    'unit.smoke_damaged': (32, True, (88, 108), (36, 96), 'smoke', .65),
    'unit.fire_critical': (24, True, (80, 106), (36, 94), 'fire', .6),
    'unit.wreck_smoke': (40, True, (100, 128), (38, 116), 'smoke', .8),
    'building.sell_dust': (36, False, (208, 112), (104, 80), 'dust', 2),
    'building.fire_damaged': (32, True, (120, 168), (54, 154), 'fire', 1),
    'building.smoke_critical': (40, True, (148, 188), (54, 174), 'smoke', 1.2),
    'building.construction_dust': (32, True, (176, 98), (88, 64), 'dust', 1.6),
    'environment.depletion_dust': (30, False, (144, 84), (72, 56), 'dust', 1.3),
    'environment.shipment_arrival': (40, False, (144, 100), (72, 72), 'shipment', 1),
    'environment.supply_station_capture': (36, False, (104, 108), (52, 80), 'capture', 1),
}


def vapor(cv, phase, scale, soft, still, seed):
    """A connected wavering smoke column with a gently feathered crown."""
    lobes=[]
    for i in range(11):
        t=i/10
        # Fixed vertical support avoids a visible respawn seam. Slow horizontal
        # waves imply convection without cycling isolated beads through space.
        x=(t*t*20+math.sin(phase*math.tau-t*4.5)*7*t)*scale
        y=(-6-t*78)*scale
        radius=(4.5+12*t+2*math.sin(t*7+phase*math.tau)*t)*scale
        lobes.append(Lobe(x,y,radius,seed+i))
    cel_cluster(cv,lobes,(SMOKE_1,SMOKE_2,SMOKE_3),
                .4 if soft else .62,outline=0,squash=1)
    # This helper is always the first paint in its canvas, including the fire
    # composition. Fade premultiplied RGB and alpha together toward both ends;
    # the upper plume dissipates rather than terminating in a rigid round cap.
    y=(np.arange(cv.buf.shape[0],dtype=np.float32)+.5)/cv.k-cv.oy
    t=np.clip(-y/(106*scale),0,1)
    envelope=np.power(np.sin(np.pi*t),.65)
    cv.buf*=envelope[:,None,None]


def dust(cv, phase, scale, soft, burst=False):
    for side in (-1,1):
        for i in range(3):
            t=(phase+i/3)%1
            fade=math.sin(math.pi*t)**1.2
            x=side*(8+t*21)*scale
            y=(-2-t*8)*scale
            r=(3+t*9)*scale
            cel_cluster(cv,[Lobe(x,y,r,91+i),Lobe(x-side*r*.5,y+r*.12,r*.7,173+i)],
                        (DUST_0,DUST_1,DUST_2),fade*(.24 if soft else .42),
                        outline=0,squash=.52)


def rotor(cv, phase, soft):
    # Broken low dust arcs, never a tactical coverage/range ring.
    for side in (-1,1):
        for i in range(3):
            t=(phase+i/3)%1
            fade=math.sin(math.pi*t)**1.2
            radius=29+t*27
            lobes=[Lobe(side*math.cos(angle)*radius,math.sin(angle)*radius*.43,
                        3+t*3,733+i+j)
                   for j,angle in enumerate((-.85,-.42,0,.42,.85))]
            cel_cluster(cv,lobes,(DUST_0,DUST_1,DUST_2),fade*(.16 if soft else .28),
                        outline=0,squash=.9)


def fire(cv, phase, scale, soft):
    # Slow coherent tongues instead of independently randomized frame flashes.
    vapor(cv,phase,scale*.85,soft,False,993)
    for i,(x,y,r) in enumerate(((-9,-1,9),(3,-3,13),(12,1,7))):
        wave=math.sin(phase*math.tau+i*1.7)
        def tongue(size,color,alpha):
            base=x*scale;bottom=y*scale;w=size*scale
            tip=wave*2*scale
            shape=[(base-w*.62,bottom),(base-w*.7,bottom-w*.65),
                   (base-w*.2,bottom-w*1.5),(base+tip,bottom-w*2.6),
                   (base+w*.22,bottom-w*1.42),(base+w*.58,bottom-w*.86),
                   (base+w*.63,bottom-w*.3),(base+w*.4,bottom)]
            cv.paint(cv.poly(shape),color,alpha)
        tongue(r,EMBER,.73 if soft else .86)
        tongue(r*.76,RED,.71 if soft else .85)
        tongue(r*.51,ORANGE,.65 if soft else .88)
        if not soft:tongue(r*.25,AMBER,.82)


def cargo(cv, phase, soft, capture=False):
    # Neutral logistics stamp: no team colour or invented ownership information.
    alpha=1-ease_io(window(phase,.6,1))
    color=OLIVE if capture else BRASS
    def stroke(points,width=1.5):
        cv.paint(cv.line(points,width+1.4),INK,alpha*.7)
        cv.paint(cv.line(points,width),color,alpha*(.65 if soft else .85))
    if capture:
        stroke([(-12,-5),(-12,-34),(-1,-31),(9,-34),(9,-19),(-1,-16),(-12,-19)])
        stroke([(-17,-5),(-7,-5)])
        stroke([(2,-10),(7,-5),(17,-18)],2)
    else:
        stroke([(-14,-8),(0,-15),(14,-8),(14,6),(0,13),(-14,6),(-14,-8)])
        stroke([(-14,-8),(0,-1),(14,-8)])
        stroke([(0,-1),(0,13)])
        stroke([(-6,-29),(0,-23),(6,-29)],2)
        stroke([(0,-39),(0,-23)],2)
        dust(cv,.3+phase*.4,1,soft)


def build(name):
    ticks,loop,box,origin,form,scale=DEFINITIONS[name]
    eid='fx.'+name
    def draw(cv,t,i,reduced=False,soft=False):
        phase=.3 if reduced else i/ticks if loop else t
        if form=='smoke':vapor(cv,phase,scale,soft,reduced,107)
        elif form=='fire':fire(cv,phase,scale,soft)
        elif form=='dust':dust(cv,phase,scale,soft,not loop)
        elif form=='wash':rotor(cv,phase,soft)
        else:cargo(cv,phase,soft,form=='capture')
        if not loop:
            cv.fade(ease_io(window(t,0,.2))*(1-ease_io(window(t,.6,1))))
    n=ticks if loop else ticks-1
    std=render_frames(box,origin,n,lambda c,t,i:draw(c,t,i),empty_tail=not loop)
    soft=render_frames(box,origin,n,lambda c,t,i:draw(c,t,i,soft=True),empty_tail=not loop)
    if loop:
        still=render_frames(box,origin,1,lambda c,t,i:draw(c,t,i,reduced=True),empty_tail=False)
        both=render_frames(box,origin,1,lambda c,t,i:draw(c,t,i,reduced=True,soft=True),empty_tail=False)
    else:
        still=render_frames(box,origin,n,lambda c,t,i:draw(c,t,i,reduced=True))
        both=render_frames(box,origin,n,lambda c,t,i:draw(c,t,i,reduced=True,soft=True))
    low=[std[(i//2)*2] for i in range(n)]+([] if loop else [std[-1]])
    return Effect(eid,1,{'ambient':Clip(20,loop,std),'low':Clip(20,loop,low),
                        'soft':Clip(20,loop,soft),'still':Clip(0 if loop else 20,False,still),
                        'still_dim':Clip(0 if loop else 20,False,both)},
                  {'standard':'ambient','low':'low','reducedMotion':'still',
                   'reducedFlashing':'soft','reduced':'still_dim'},
                  intent={'standard':'small warm stylized battlefield cosmetic',
                          'low':'two-tick held samples on the same simulation clock',
                          'reducedMotion':'fixed geometry; burst opacity envelope only',
                          'reducedFlashing':'muted translucent palette without white flash',
                          'reduced':'fixed muted geometry; burst opacity envelope only'},
                  wiring='PENDING integration: only current permitted state or explicit disclosed event; clear with visibility/reset',
                  notes='No gameplay status/range/ownership is encoded. Loop variants stop with their condition; bursts end transparently.')


def effects(keys=None):
    return [build(name) for name in DEFINITIONS if keys is None or 'fx.'+name in keys]
