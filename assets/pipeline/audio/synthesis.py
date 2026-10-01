"""Original sampled-at-build-time industrial score and sound-design instruments.

All oscillators, noise, envelopes, motifs and arrangements originate here.
No third-party recordings or franchise melodies are used.

Lane A additions (2026-10-01, Generals bar per work/art/audio-effects-scout.md
section 2 + design 23.2/23.3). Every new ID below is synthesized here with a
deterministic seed (rng_for of the render path); no samples, no speech models.

Missile split (separate mixable tails, not one one-shot):
- sfx.missile_launch_roar (one-shot 2.6 s): ignition crack 0.3-8 kHz exp
  decay 18/s; roar band 0.12-2.6 kHz, attack 6/s, decay 0.9/s; sub sweep
  58 Hz + 22 Hz/s rising, attack 4/s, decay 1.1/s.
- sfx.missile_flight_whine (seamless 4 s loop): integer-cycle harmonics
  300/600/900/1500 Hz at .10/.05/.028/.014 gain, 3 Hz AM, periodic 1.5-6 kHz
  hiss at .02 RMS; every partial completes whole cycles per loop.
- sfx.missile_terminal_crack (one-shot 1.4 s): supersonic crack 2.5-10.5 kHz
  decay 55/s; body snap 0.3-4 kHz decay 30/s; 46 Hz sub thump decay 9/s.
- sfx.weapon.IR_SHAHED x3 vars (one-shot 2.2 s, weapon_class 'loiter'):
  loitering-munition terminal payload; prop-buzz harmonics of 112 Hz with a
  descending sweep into detonation at 1.75 s (crack 0.4-9 kHz decay 22/s +
  44 Hz thump decay 8/s). Played once at impact by combat-sound.ts.
- sfx.strategic_launch (one-shot 3.2 s): sub 31 Hz + slow 3.5/s attack roar
  60 Hz-4.2 kHz, decay ~1/s; deeper and longer than missile_launch_roar.
- sfx.strategic_incoming_whine (one-shot 4.0 s tracking whine): sine sweep
  420 Hz + 520 Hz/s rise with 7 Hz vibrato, gain (t/4)^1.5; air hiss
  1.5-9 kHz gain (t/4)^2; ends abruptly, impact is a separate ID.
- sfx.strategic_impact (one-shot 3.6 s): broadband blast decay 3.2/s, 30 Hz
  sub decay 2.2/s, delayed low echo at 0.75 s decay 3.5/s at .6 gain.

Destruction cascade:
- sfx.building_collapse (one-shot 4.2 s): low rumble bed 40-320 Hz decay
  1.4/s; 10 seeded debris-clatter hits 0.9-7 kHz over 0.05-2.4 s; secondary
  pops at 1.15/2.05/2.9 s with gains .55/.38/.26 (52 Hz thump + crack).
- sfx.vehicle_kill (one-shot 2.0 s): crack 0.5-9 kHz decay 28/s, inharmonic
  ring 312/528/891/1667 Hz, fire-onset hiss 0.3-4.5 kHz rising; Lane C
  crossfades into sfx.burning_wreck_loop.
- sfx.burning_wreck_loop (seamless 4 s loop): periodic low fire bed
  (<900 Hz) at .06 RMS + air hiss .012 + 26 seeded circular crackle pops.
- sfx.structure_damage_groan (one-shot 1.6 s): detuned sweep 150->105 Hz +
  226->130 Hz partial, 0.9-2.6 kHz creak with 3.7 Hz AM, attack 9/s.

Bullets:
- sfx.bullet_crack_near x3 vars (one-shot 0.35 s near-miss/suppression
  layer): crack 2.8-10.5 kHz decay 95/s + faint body 0.4-3 kHz. The existing
  28 weapon IDs x 3 vars shape is unchanged.

Troops (short, restrained, non-verbal; no screams):
- sfx.troop_death_{US,IR,SY,SA} x3 vars each (one-shot 0.55 s): exhaled
  two-formant (0.7-1.4 kHz) vowel-like sweep, base 190/150/215/170 Hz with
  5.5 Hz wobble, decay 5/s; 88 Hz body thud decay 30/s; gear rustle
  1.2-6 kHz at .12. Faction varies register only, no words or accents.
- sfx.heal_loop (seamless 4 s): 220/330 Hz soft pulse with 1 Hz swell +
  periodic 0.4-2.5 kHz bed. sfx.repair_loop (4 s): 75 Hz tool-hum harmonics
  + 8 grid clanks (1240/830/2090 Hz) alternating gain. sfx.capture_loop
  (4 s): 55 Hz pulse with 2 Hz AM + integer-phase 300->375 Hz sweep +
  4 radio-style blips at 1180 Hz. All loop partials use whole cycles.

Pilot: .local/audio-venv/bin/python assets/pipeline/audio/synthesis.py
  --kind sfx --only IR_SHAHED,building_collapse,burning_wreck_loop
Full SFX re-render: same command with --kind sfx and no --only.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import numpy as np
from scipy.signal import butter, sosfilt
from common import ROOT, SOURCE, RATE, VERSION, existing, export, finish, fingerprint, write_index

def rng_for(name): return np.random.default_rng(int(hashlib.sha256(name.encode()).hexdigest()[:16],16))
def times(seconds): return np.arange(round(RATE*seconds))/RATE
def hz(midi): return 440*2**((midi-69)/12)
def noise(rng,seconds,low=80,high=7000):
    return sosfilt(butter(2,[low,high],btype='bandpass',fs=RATE,output='sos'),rng.normal(0,1,len(times(seconds))))
def tone(freq,seconds,kind='pluck'):
    t=times(seconds)
    if kind=='pad':
        wave=sum(np.sin(2*np.pi*freq*(1+d)*t+p)/3 for d,p in [(-.002,0),(0,.8),(.002,1.5)])
        wave+=.17*np.sin(2*np.pi*freq*2*t)
        env=np.sin(np.pi*np.minimum(t/max(seconds,1e-6),1))**.55
    elif kind=='bass':
        wave=sum(np.sin(2*np.pi*freq*n*t)/(n*n) for n in range(1,8))
        env=(1-np.exp(-t*120))*np.exp(-t*4.5)
    elif kind=='steel':
        wave=sum(np.sin(2*np.pi*freq*n*t+.13*n)*np.exp(-t*(1.5+n*.7))/(n**1.4) for n in range(1,9))
        env=(1-np.exp(-t*100))
    else:
        wave=sum(np.sin(2*np.pi*freq*n*t)*np.exp(-t*n*2.3)/n for n in range(1,10))
        wave=np.tanh(wave*1.8)
        env=(1-np.exp(-t*160))*np.exp(-t*1.7)
    return wave*env

def drum(kind,rng):
    if kind=='kick':
        t=times(.48);phase=2*np.pi*(44*t+(130-44)*.032*(1-np.exp(-t/.032)))
        return np.sin(phase)*np.exp(-t*11)+noise(rng,.48,1300,6500)*np.exp(-t*110)*.11
    if kind=='snare':
        t=times(.30)
        return (noise(rng,.30,350,8000)*.65+np.sin(2*np.pi*185*t)*.23)*np.exp(-t*18)
    if kind=='metal':
        t=times(.24)
        return sum(np.sin(2*np.pi*f*t) for f in (703,1121,1847,2713))*.14*np.exp(-t*20)+noise(rng,.24,2200,9500)*np.exp(-t*38)*.20
    t=times(.12)
    return noise(rng,.12,5200,10500)*np.exp(-t*65)*.45

SFX_NAMES = ['impact_ground','impact_metal_light','impact_metal_heavy','impact_structure','intercept_burst',
 'explosion_small','explosion_large','explosion_building','engine_tracked_heavy','engine_wheeled_light',
 'engine_technical','engine_8x8','engine_rig','engine_hauler','jet_pass','rotor_loop','drone_prop_loop',
 'footsteps_squad','construct_loop','construct_complete','sell','power_down','power_up','deploy_hydraulic',
 'launcher_setup','missile_warning_tone','defeat_countdown_tick','ui_click','ui_confirm','ui_error','ui_tab',
 'ui_hover','ui_queue_add','ui_ping','ambient_desert_wind','ambient_industrial','ambient_coastal','ambient_river',
 'ambient_highland','ambient_depot',
 'missile_launch_roar','missile_flight_whine','missile_terminal_crack',
 'strategic_launch','strategic_incoming_whine','strategic_impact',
 'building_collapse','vehicle_kill','burning_wreck_loop','structure_damage_groan',
 'bullet_crack_near','troop_death_US','troop_death_IR','troop_death_SY','troop_death_SA',
 'heal_loop','repair_loop','capture_loop']

# Lane A multi-variant one-shots; matches the weapon 3-variant runtime shape.
SFX_VARIANTS = {'bullet_crack_near':3,'troop_death_US':3,'troop_death_IR':3,
 'troop_death_SY':3,'troop_death_SA':3}
# Lane A seamless loops (4 s each); rendered with loop=True like engines.
LOOP_SFX_EXTRA = {'missile_flight_whine','burning_wreck_loop','heal_loop',
 'repair_loop','capture_loop'}

def one_shot(name,rng,weapon_class=None):
    if weapon_class:
        durations={'small':.42,'auto':.50,'cannon':1.6,'antiarmor':1.3,'shell':2.1,'antiair':1.25,'airground':1.5,'tactical':3.0,'loiter':2.2}
        duration=durations[weapon_class];t=times(duration)
        if weapon_class=='loiter':
            # Loitering-munition terminal payload (IR_SHAHED): prop buzz with a
            # descending Doppler-style sweep into one detonation at 1.75 s.
            det_at=duration-.45;after=np.maximum(t-det_at,0);struck=(t>=det_at)
            buzz=sum(np.sin(2*np.pi*(112*i*t-9*i*t*t))*np.exp(-after*9)/(i**1.2) for i in range(1,6))
            whistle=np.sin(2*np.pi*(950*t-260*t*t))*np.exp(-after*7)*.25
            crack=noise(rng,duration,400,9000)*np.exp(-after*22)*struck
            thump=np.sin(2*np.pi*44*(t-det_at))*np.exp(-after*8)*struck
            return buzz*.5+whistle+crack*.9+thump*.8
        if weapon_class in ('small','auto'):
            attack=noise(rng,duration,700,9500)*np.exp(-t*45)
            body=np.sin(2*np.pi*(155+rng.uniform(-15,15))*t)*np.exp(-t*26)
            tail=noise(rng,duration,250,3500)*np.exp(-t*13)
            return attack*.8+body*.6+tail*.25
        if weapon_class in ('cannon','shell'):
            thump=np.sin(2*np.pi*(42*t+48*.05*(1-np.exp(-t/.05))))*np.exp(-t*7)
            crack=noise(rng,duration,300,8000)*np.exp(-t*30)
            tail=noise(rng,duration,80,1200)*np.exp(-t*2.5)
            return thump+crack*.8+tail*.7
        attack=noise(rng,duration,100,6500)*(1-np.exp(-t*45))*np.exp(-t*2.3)
        hiss=noise(rng,duration,1800,9000)*np.exp(-t*6)
        engine=np.sin(2*np.pi*(170*t+40*t*t))*np.exp(-t*3)
        return attack*.9+hiss*.22+engine*.15
    if name.startswith('ui_') or name in ('construct_complete','sell','power_up','power_down','defeat_countdown_tick','missile_warning_tone'):
        patterns={'ui_click':[520],'ui_hover':[420],'ui_tab':[390,590],'ui_confirm':[480,640,960],
          'ui_queue_add':[600,800],'ui_error':[240,170],'ui_ping':[1050,790,1050],
          'construct_complete':[330,440,660],'sell':[700,420],'power_up':[220,330,550],
          'power_down':[550,330,160],'defeat_countdown_tick':[720], 'missile_warning_tone':[880,660,880,660]}
        notes=patterns[name];step=.075 if name.startswith('ui_') else .15
        wave=np.zeros(round((len(notes)*step+.18)*RATE))
        for i,freq in enumerate(notes):
            t=times(.15);pulse=np.sin(2*np.pi*freq*t)*(1-np.exp(-t*500))*np.exp(-t*36)
            if name=='missile_warning_tone': pulse+=np.sin(2*np.pi*freq*2*t)*np.exp(-t*25)*.18
            start=round(i*step*RATE);wave[start:start+len(pulse)]+=pulse
        return wave*.5
    if name.startswith('explosion') or name.startswith('impact') or name=='intercept_burst':
        duration={'explosion_small':1.2,'explosion_large':2.5,'explosion_building':3.3,'impact_ground':.8,
                  'impact_metal_light':.55,'impact_metal_heavy':1.0,'impact_structure':1.5,'intercept_burst':1.2}[name]
        t=times(duration);decay=4/duration
        body=np.sin(2*np.pi*(38*t+55*.04*(1-np.exp(-t/.04))))*np.exp(-t*decay*1.8)
        rumble=noise(rng,duration,40,2400)*np.exp(-t*decay)
        debris=noise(rng,duration,1500,8500)*np.exp(-t*12)
        if 'metal' in name:
            body+=sum(np.sin(2*np.pi*f*t)*np.exp(-t*(3+f/400))*.13 for f in [321,547,903,1731])
        if name=='intercept_burst':body*=.4;debris*=1.7
        return body*.7+rumble+debris*.4
    if name=='jet_pass':
        t=times(3.2);env=np.exp(-((t-1.45)/.65)**2)
        return (noise(rng,3.2,90,7200)*.7+np.sin(2*np.pi*(220*t-24*t*t))*.2)*env
    if name in ('deploy_hydraulic','launcher_setup'):
        duration=1.8;t=times(duration);env=np.sin(np.pi*t/duration)**.7
        return (noise(rng,duration,700,5200)*.22+np.sin(2*np.pi*137*t)*.09)*env+noise(rng,duration,150,2400)*np.exp(-np.abs(t-1.45)*50)*.4
    if name=='missile_launch_roar':
        duration=2.6;t=times(duration)
        ignite=noise(rng,duration,300,8000)*np.exp(-t*18)
        roar=noise(rng,duration,120,2600)*(1-np.exp(-t*6))*np.exp(-t*.9)
        sub=np.sin(2*np.pi*(58*t+11*t*t))*(1-np.exp(-t*4))*np.exp(-t*1.1)
        return ignite*.9+roar*.9+sub*.5
    if name=='missile_terminal_crack':
        duration=1.4;t=times(duration)
        crack=noise(rng,duration,2500,10500)*np.exp(-t*55)
        snap=noise(rng,duration,300,4000)*np.exp(-t*30)
        thump=np.sin(2*np.pi*46*t)*np.exp(-t*9)
        return crack*.9+snap*.7+thump*.8
    if name=='strategic_launch':
        duration=3.2;t=times(duration)
        attack=noise(rng,duration,60,1800)*(1-np.exp(-t*3.5))*np.exp(-t*.8)
        roar=noise(rng,duration,400,4200)*(1-np.exp(-t*5))*np.exp(-t*1.1)*.6
        sub=np.sin(2*np.pi*(31*t+4.5*t*t))*(1-np.exp(-t*3))*np.exp(-t*.9)
        return attack+roar+sub*.7
    if name=='strategic_incoming_whine':
        duration=4.0;t=times(duration)
        sweep=np.sin(2*np.pi*(420*t+260*t*t)+.6*np.sin(2*np.pi*7*t))*(t/duration)**1.5
        air=noise(rng,duration,1500,9000)*(t/duration)**2*.5
        return sweep*.55+air
    if name=='strategic_impact':
        duration=3.6;t=times(duration)
        blast=noise(rng,duration,40,9000)*np.exp(-t*3.2)
        sub=np.sin(2*np.pi*(30*t+20*.05*(1-np.exp(-t/.05))))*np.exp(-t*2.2)
        echo_at=.75
        echo=noise(rng,duration,60,1200)*np.exp(-np.maximum(t-echo_at,0)*3.5)*(t>=echo_at)*.6
        return blast+sub*.9+echo
    if name=='building_collapse':
        duration=4.2;t=times(duration)
        wave=noise(rng,duration,40,320)*(1-np.exp(-t*8))*np.exp(-t*1.4)
        for _ in range(10):
            at=rng.uniform(.05,2.4);band=rng.uniform(900,5200)
            hit=noise(rng,duration,band,band+1800)*np.exp(-np.maximum(t-at,0)*rng.uniform(14,30))*(t>=at)
            wave+=hit*rng.uniform(.08,.22)
        for gain,at in ((.55,1.15),(.38,2.05),(.26,2.9)):
            wave+=np.sin(2*np.pi*52*(t-at))*np.exp(-np.maximum(t-at,0)*7)*(t>=at)*gain
            wave+=noise(rng,duration,300,5000)*np.exp(-np.maximum(t-at,0)*16)*(t>=at)*gain*.8
        return wave
    if name=='vehicle_kill':
        duration=2.0;t=times(duration)
        crack=noise(rng,duration,500,9000)*np.exp(-t*28)
        ring=sum(np.sin(2*np.pi*f*t)*np.exp(-t*(5+f/500))*.12 for f in (312,528,891,1667))
        fire=noise(rng,duration,300,4500)*(1-np.exp(-t*3))*np.exp(-t*1.2)*.5
        return crack*.9+ring+fire
    if name=='structure_damage_groan':
        duration=1.6;t=times(duration)
        sweep=np.sin(2*np.pi*(150*t-22.5*t*t))*.5+np.sin(2*np.pi*(226*t-30*t*t))*.3
        creak=noise(rng,duration,900,2600)*(.5+.5*np.sin(2*np.pi*3.7*t+1))*.25
        return (sweep+creak)*(1-np.exp(-t*9))*np.exp(-t*2.2)
    if name=='bullet_crack_near':
        duration=.35;t=times(duration)
        crack=noise(rng,duration,2800,10500)*np.exp(-t*95)
        body=noise(rng,duration,400,3000)*np.exp(-t*40)*.4
        return crack*.85+body
    if name.startswith('troop_death_'):
        duration=.55;t=times(duration)
        base={'troop_death_US':190,'troop_death_IR':150,'troop_death_SY':215,'troop_death_SA':170}[name]
        wob=base*(1+.06*np.sin(2*np.pi*5.5*t))
        raw=np.sin(2*np.pi*wob*t)*.6+np.sin(2*np.pi*wob*2.02*t)*.25
        cry=sosfilt(butter(2,[700,1400],btype='bandpass',fs=RATE,output='sos'),raw*np.exp(-t*5))
        thump=np.sin(2*np.pi*88*t)*np.exp(-t*30)*.5
        rustle=noise(rng,duration,1200,6000)*np.exp(-t*22)*.12
        return cry*.5+thump+rustle
    raise ValueError(name)

def loop_sfx(name,rng):
    duration=8 if name.startswith('ambient') else 4;n=round(duration*RATE);t=np.arange(n)/RATE
    # Periodic spectral noise ensures no random-noise splice at the loop boundary.
    freqs=np.fft.rfftfreq(n,1/RATE);shape=np.zeros_like(freqs)
    if name.startswith('ambient'):
        bandwidth={'ambient_desert_wind':900,'ambient_industrial':1900,'ambient_coastal':3800,'ambient_river':4600,'ambient_highland':1500,'ambient_depot':2100}[name]
        shape[1:]=1/np.maximum(freqs[1:],80)**.55*np.exp(-(freqs[1:]/bandwidth)**2)
        wave=np.fft.irfft((rng.normal(size=len(freqs))+1j*rng.normal(size=len(freqs)))*shape,n=n)
        wave/=max(np.std(wave),1e-9);wave*=.10*(.65+.25*np.cos(2*np.pi*t/duration)+.1*np.sin(2*np.pi*t/duration*3))
        if name in ('ambient_industrial','ambient_depot'):wave+=.015*np.sin(2*np.pi*50*t)+.011*np.sin(2*np.pi*100*t)
        return wave
    if name=='missile_flight_whine':
        # Integer-cycle harmonics + 3 Hz AM keep the 4 s boundary seamless.
        am=.75+.25*np.sin(2*np.pi*3*t)
        whine=sum(np.sin(2*np.pi*f*t)*a for f,a in ((300,.10),(600,.05),(900,.028),(1500,.014)))*am
        shape[1:]=np.exp(-(freqs[1:]/6000)**2)/np.maximum(freqs[1:],1500)**.3
        hiss=np.fft.irfft((rng.normal(size=len(freqs))+1j*rng.normal(size=len(freqs)))*shape,n=n)
        return whine+hiss/max(np.std(hiss),1e-9)*.02
    if name=='burning_wreck_loop':
        shape[1:]=np.exp(-(freqs[1:]/900)**2)/np.maximum(freqs[1:],60)**.5
        bed=np.fft.irfft((rng.normal(size=len(freqs))+1j*rng.normal(size=len(freqs)))*shape,n=n)
        wave=bed/max(np.std(bed),1e-9)*.06
        shape[1:]=np.exp(-(freqs[1:]/7000)**2)
        air=np.fft.irfft((rng.normal(size=len(freqs))+1j*rng.normal(size=len(freqs)))*shape,n=n)
        wave+=air/max(np.std(air),1e-9)*.012
        for _ in range(26):
            at=rng.uniform(0,duration);length=round(rng.uniform(.02,.09)*RATE)
            pop=rng.normal(0,1,length)*np.exp(-np.arange(length)/RATE*rng.uniform(60,160))
            wave[(np.arange(length)+round(at*RATE))%n]+=pop*rng.uniform(.05,.22)
        return wave
    if name in ('heal_loop','repair_loop','capture_loop'):
        wave=np.zeros(n)
        if name=='heal_loop':
            pulse=(.6+.4*np.sin(2*np.pi*1*t))**4
            wave+=np.sin(2*np.pi*220*t)*.03*pulse+np.sin(2*np.pi*330*t)*.018*pulse
            shape[1:]=np.exp(-(freqs[1:]/2500)**2)/np.maximum(freqs[1:],400)**.3
        elif name=='repair_loop':
            wave+=sum(np.sin(2*np.pi*75*i*t)*(.05/(i**1.2)) for i in range(1,6))
            for k in range(8):
                at=(k+.5)*duration/8;length=round(.12*RATE);tt=np.arange(length)/RATE
                clank=sum(np.sin(2*np.pi*f*tt)*np.exp(-tt*d)*a for f,a,d in ((1240,.10,60),(830,.07,45),(2090,.05,90)))
                wave[(np.arange(length)+round(at*RATE))%n]+=clank*(1 if k%2==0 else .6)
            shape[1:]=np.exp(-(freqs[1:]/3000)**2)/np.maximum(freqs[1:],200)**.3
        else:
            wave+=np.sin(2*np.pi*55*t)*(.10+.06*np.sin(2*np.pi*2*t))
            wave+=np.sin(2*np.pi*(300*t+75*t*t/duration))*.02*np.sin(np.pi*t/duration)**2
            for k in range(4):
                at=(k+.25)*duration/4;length=round(.08*RATE);tt=np.arange(length)/RATE
                wave[(np.arange(length)+round(at*RATE))%n]+=np.sin(2*np.pi*1180*tt)*np.exp(-tt*55)*.05
            shape[1:]=np.exp(-(freqs[1:]/2000)**2)/np.maximum(freqs[1:],150)**.3
        hiss=np.fft.irfft((rng.normal(size=len(freqs))+1j*rng.normal(size=len(freqs)))*shape,n=n)
        return wave+hiss/max(np.std(hiss),1e-9)*.015
    fundamental={'engine_tracked_heavy':38,'engine_wheeled_light':58,'engine_technical':67,'engine_8x8':43,
      'engine_rig':47,'engine_hauler':51,'rotor_loop':24,'drone_prop_loop':116,'construct_loop':75,'footsteps_squad':65}[name]
    pulse=(.7+.3*np.sin(2*np.pi*(6 if name=='rotor_loop' else 9)*t))
    wave=sum(np.sin(2*np.pi*fundamental*i*t)*(.1/(i**1.3)) for i in range(1,9))*pulse
    shape[1:]=np.exp(-(freqs[1:]/3500)**2)/np.maximum(freqs[1:],100)**.4
    hiss=np.fft.irfft((rng.normal(size=len(freqs))+1j*rng.normal(size=len(freqs)))*shape,n=n)
    hiss=hiss/max(np.std(hiss),1e-9)*.025
    if name=='footsteps_squad':
        wave=np.zeros(n)
        for start in np.arange(0,duration,.25):
            length=round(.16*RATE);envelope=np.exp(-np.arange(length)/RATE*40)
            offset=round(start*RATE);wave[offset:offset+length]=hiss[offset:offset+length]*envelope*5
    elif name=='construct_loop':
        wave*=.5+.5*np.cos(2*np.pi*t*2)**12
    return wave+hiss

def sfx_jobs():
    design=(ROOT/'outputs/frontline-command-game-design.md').read_text()
    section=design.split('### 6.2 Weapon catalog')[1].split('### 6.3')[0]
    jobs=[]
    for weapon,kind in re.findall(r'^\| `([A-Z_]+)` \| (\w+) \|',section,re.M):
        for i in range(1,4): jobs.append(dict(id='sfx.weapon.'+weapon,path=f'sfx/weapon/{weapon}_{i}.ogg',bus='effects',variant=i,weapon_class=kind))
    # Synthetic loitering-munition round: not in the design catalog table, but
    # combat-sound.ts plays sfx.weapon.IR_SHAHED at terminal impact.
    for i in range(1,4):
        jobs.append(dict(id='sfx.weapon.IR_SHAHED',path=f'sfx/weapon/IR_SHAHED_{i}.ogg',bus='effects',variant=i,weapon_class='loiter'))
    for name in SFX_NAMES:
        loop=name.startswith(('engine_','ambient_')) or name in ('rotor_loop','drone_prop_loop','construct_loop','footsteps_squad') or name in LOOP_SFX_EXTRA
        variants=SFX_VARIANTS.get(name,1)
        for i in range(1,variants+1):
            job=dict(id='sfx.'+name,path=f'sfx/{name}_{i}.ogg' if variants>1 else f'sfx/{name}.ogg',
                     bus='ui' if name.startswith('ui_') else 'effects',loop=loop)
            if variants>1:job['variant']=i
            jobs.append(job)
    return jobs

# Distinct original minor/modal motifs and bass movement, not franchise themes.
SCORES={
 'US':dict(title='Clear Horizon',bpm=112,root=38,progression=[0,0,5,3,0,7,5,0],motif=[(0,12,1),(1.5,19,.5),(3,15,1),(5,17,.5),(6,15,1),(8,12,1.5),(10,10,.5),(11,12,1),(13,7,1),(14.5,10,.5)]),
 'IR':dict(title='Signal Under Steel',bpm=104,root=40,progression=[0,3,0,7,5,3,7,0],motif=[(0,12,.5),(1,12,.5),(2.5,15,1),(4,19,1),(6,17,1),(8,15,.5),(9.5,14,.5),(11,12,1),(13,10,1),(15,7,.5)]),
 'SY':dict(title='Roads We Hold',bpm=120,root=45,progression=[0,7,3,5,0,3,10,7],motif=[(0,12,.75),(1,15,.5),(2,19,1),(4,17,.5),(5.5,15,.5),(7,12,1),(9,10,.5),(10,12,1),(12,7,.5),(13.5,10,1),(15,12,.5)]),
 'SA':dict(title='Brass Meridian',bpm=108,root=36,progression=[0,5,0,3,7,5,3,0],motif=[(0,12,1.5),(2,7,.5),(3,10,1),(5,12,1),(7,15,1),(9,14,.5),(10,12,1),(12,10,1),(14,7,1)]),
 'menu':dict(title='Frontline Command',bpm=100,root=38,progression=[0,5,3,7,0,10,5,7],motif=[(0,12,1),(2,15,1),(4,19,1.5),(6,17,.5),(7,15,1),(9,12,1.5),(11,10,.5),(12,7,1),(14,12,1.5)]),
}

def compose(score,layer,seed,bars=32,loop=True):
    rng=rng_for(seed);beat=60/score['bpm'];duration=bars*4*beat;n=round(duration*RATE)
    music=np.zeros((n,2),dtype=np.float64)
    def put(sample,at,gain=1,pan=0):
        start=round(at*RATE);l=np.sqrt((1-pan)/2);r=np.sqrt((1+pan)/2)
        # Circular accumulation retains note/reverb tails across the bar boundary.
        for offset in range(0,len(sample),n):
            part=sample[offset:offset+n]*gain;indexes=(np.arange(len(part))+start+offset)%n
            music[indexes,0]+=part*l;music[indexes,1]+=part*r
    for bar in range(bars):
        root=score['root']+score['progression'][(bar//2)%8];at=bar*4*beat
        # Broad but subdued harmonic bed, with a fifth and minor third.
        for j,interval in enumerate((0,7,15)):
            put(tone(hz(root+12+interval),4.6*beat,'pad'),at,.060,[-.55,.45,.05][j])
        for subdivision in (range(8) if layer=='combat' else range(4)):
            spacing=.5 if layer=='combat' else 1
            bass=root+(12 if subdivision%4==3 else 0)
            put(tone(hz(bass),beat*.75,'bass'),at+subdivision*spacing*beat,.19 if layer=='combat' else .12)
        if layer in ('tension','combat'):
            for step in range(8):
                pitch=root+12+[0,7,12,7,3,7,10,7][step]
                put(tone(hz(pitch),beat*.55,'steel'),at+step*.5*beat,.11 if layer=='combat' else .065,-.35 if step%2 else .35)
                put(drum('hat',rng),at+step*.5*beat,.17 if step%2 else .11,.35)
            for step in ([0,1.5,2,3.5] if layer=='combat' else [0,2]): put(drum('kick',rng),at+step*beat,.43 if layer=='combat' else .23)
            for step in (1,3): put(drum('snare',rng),at+step*beat,.32 if layer=='combat' else .13,-.1)
            if bar%4==3: put(drum('metal',rng),at+3.5*beat,.27,-.6)
        elif bar%2==0: put(drum('metal',rng),at,.07,.4)
        if layer=='combat' and bar%4==3:
            for step in (3.25,3.5,3.75):put(drum('snare',rng),at+step*beat,.12,-.2)
    # Four-bar motif; calm arrangement leaves breathing room between phrases.
    for phrase in range(bars//4):
        if layer=='calm' and phrase%2:continue
        for pos,interval,length in score['motif']:
            root=score['root'];octave=12 if phrase%4==3 else 0
            sample=tone(hz(root+interval+octave),beat*(length+.6),'pluck' if layer=='combat' else 'steel')
            gain=.16 if layer=='combat' else .10
            put(sample,(phrase*16+pos)*beat,gain,.13)
            put(sample,(phrase*16+pos+.75)*beat,gain*.20,-.45)
    if not loop:
        envelope=np.minimum(1,np.arange(n)/(RATE*.2))*np.minimum(1,(n-np.arange(n))/(RATE*1.3))
        music*=envelope[:,None]
    return finish(music,peak=.60,rms=.095,fade=0 if loop else .015)

def music_jobs():
    jobs=[]
    beds={'menu_theme':('menu','combat'),'lobby_loop':('menu','tension'),'briefing_bed':('IR','calm'),
          'debrief_bed':('SA','calm'),'editor_ambient':('US','calm'),'credits':('menu','calm')}
    for name,(score,layer) in beds.items():
        jobs.append(dict(id='music.'+name,path=f'music/{name}.ogg',bus='music',loop=True,score=score,layer=layer,bpm=SCORES[score]['bpm'],beats_per_bar=4))
    for faction in ('US','IR','SY','SA'):
        for layer in ('calm','tension','combat'):
            name=f'battle_{faction}_{layer}'
            jobs.append(dict(id='music.'+name,path=f'music/{name}.ogg',bus='music',loop=True,score=faction,layer=layer,bpm=SCORES[faction]['bpm'],beats_per_bar=4))
    for name in ('victory','defeat','mission_start','objective','strategic_warning'):
        jobs.append(dict(id='music.stinger_'+name,path=f'music/stinger_{name}.ogg',bus='music',loop=False,stinger=name))
    return jobs

def stinger(name):
    rng=rng_for(name);duration=5.4 if name in ('victory','defeat') else 3.4;out=np.zeros((round(duration*RATE),2))
    notes={'victory':[50,57,62,65,69],'defeat':[50,48,45,41,38], 'mission_start':[38,45,50,57],
           'objective':[62,65,69], 'strategic_warning':[38,39,38,39,38]}[name]
    for i,note in enumerate(notes):
        sample=tone(hz(note),duration-i*.36,'steel');start=round(i*.36*RATE)
        sample=sample[:len(out)-start];out[start:start+len(sample)]+=sample[:,None]*.18
    kick=drum('kick',rng);out[:len(kick)]+=kick[:,None]*.35
    return finish(out,peak=.65,rms=.1,fade=.02)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--kind',choices=['sfx','music','all'],default='all')
    parser.add_argument('--only',default='',help='comma-separated path substrings; render only matching jobs (pilot renders)')
    args=parser.parse_args()
    jobs=(sfx_jobs() if args.kind in ('sfx','all') else [])+(music_jobs() if args.kind in ('music','all') else [])
    if args.only:
        needles=[s.strip() for s in args.only.split(',') if s.strip()]
        jobs=[job for job in jobs if any(needle in job['path'] for needle in needles)]
    pipeline=hashlib.sha256(Path(__file__).read_bytes()+Path(__file__).with_name('common.py').read_bytes()).hexdigest()
    (SOURCE/'music_projects').mkdir(parents=True,exist_ok=True)
    (SOURCE/'music_projects/scores.json').write_text(json.dumps(SCORES,indent=2)+'\n')
    for count,job in enumerate(jobs,1):
        source_hash=fingerprint(dict(job=job,score=SCORES.get(job.get('score')),pipeline=pipeline,version=VERSION))
        if existing(job,source_hash):continue
        name=job['id'].split('.',1)[1];rng=rng_for(job['path'])
        if job['bus']=='music':
            samples=stinger(job['stinger']) if 'stinger' in job else compose(SCORES[job['score']],job['layer'],job['score'])
        elif job.get('loop'):samples=finish(loop_sfx(name,rng),peak=.70,rms=.09,fade=0)
        else:samples=finish(one_shot(name,rng,job.get('weapon_class')),peak=.75,rms=.12,fade=.003)
        export(job,samples,source_hash,dict(method='original procedural composition' if job['bus']=='music' else 'original procedural sound design',
            source='assets/pipeline/audio/synthesis.py',license='Project-original'))
        if count%10==0:write_index()
        print(f'{count}/{len(jobs)} {job["path"]} {len(samples)/RATE:.2f}s',flush=True)
    print(f'{write_index()} events indexed.',flush=True)

if __name__=='__main__':main()
