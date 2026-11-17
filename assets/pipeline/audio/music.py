"""Frontline Command original score, engine v2 (2026-11-08).

Replaces the first-pass sine-additive music in synthesis.py. Everything here is
original: instruments are synthesized (band-limited saws, Karplus-Strong plucks,
FM bells, synthesized drums) and every melody, progression and groove is authored
below. No samples, recordings or existing themes are used.

What changed versus v1 and why it sounds better:
- 44.1 kHz stereo instead of 24 kHz; band-limited (polyBLEP) oscillators.
- Real harmony: diatonic chords with voice-led pad voicings; melodies are
  authored in scale degrees and snapped to chord tones on strong beats, so the
  lead never fights the progression (v1 played a fixed motif over moving roots).
- Faction identities: US hybrid-orchestral, IR Hijaz (oud, frame drums, ney),
  SY industrial (distorted power chords, synth lead), SA brass march, menu epic.
- Arrangement in 8-bar sections (A, A', B, B') with fills, crashes and risers.
- Stereo convolution reverb, kick sidechain, glue compression and soft clip.
- Loops are seamless: notes, delays and reverb tails wrap circularly.

Runtime contract kept: same file names and IDs; the three battle layers of a
faction share tempo, 32-bar length and phase, so the mixer can crossfade them.

Run: .local/audio-venv/bin/python assets/pipeline/audio/music.py [--only name,...]
"""
import argparse
import hashlib
import json
import os
import subprocess
from functools import lru_cache
from pathlib import Path

import numpy as np
import soundfile as sf
from common import VORBIS_COMPRESSION, STEREO_MP3_BITRATE
from scipy.signal import butter, fftconvolve, lfilter, sosfilt

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT/'assets/build/audio'
SR = 44100
ENGINE = 'frontline-music/2'

# ---------------------------------------------------------------- primitives

def hz(m): return 440.0*2**((m-69)/12)
def nsamp(sec): return max(1, int(round(sec*SR)))
def tt(sec): return np.arange(nsamp(sec))/SR
def seeded(*key): return np.random.default_rng(int(hashlib.sha256(repr(key).encode()).hexdigest()[:16], 16))

@lru_cache(maxsize=None)
def _sos(kind, lo, hi=None, order=2):
    lo = min(lo, SR*.45)
    if kind == 'band': return butter(order, [lo, min(hi, SR*.45)], btype='bandpass', fs=SR, output='sos')
    return butter(order, lo, btype=kind, fs=SR, output='sos')

def lp(x, fc, order=2): return sosfilt(_sos('low', round(fc), None, order), x, axis=0)
def hp(x, fc, order=2): return sosfilt(_sos('high', round(fc), None, order), x, axis=0)
def bp(x, lo, hi, order=2): return sosfilt(_sos('band', round(lo), round(hi), order), x, axis=0)

def saw(freq, n, phase=0.0):
    """PolyBLEP band-limited sawtooth; freq may be a scalar or per-sample array."""
    dt = np.broadcast_to(np.asarray(freq, dtype=np.float64)/SR, (n,))
    ph = (phase + np.cumsum(dt)) % 1.0
    out = 2*ph - 1
    m = ph < dt
    x = ph[m]/dt[m]; out[m] -= x + x - x*x - 1
    m = ph > 1 - dt
    x = (ph[m] - 1)/dt[m]; out[m] -= x*x + x + x + 1
    return out

def square(freq, n, phase=0.0):
    return .5*(saw(freq, n, phase) - saw(freq, n, (phase + .5) % 1))

def sine(freq, n, phase=0.0):
    dt = np.broadcast_to(np.asarray(freq, dtype=np.float64)/SR, (n,))
    return np.sin(2*np.pi*(phase + np.cumsum(dt)))

def adsr(n, a, d, s, r, hold):
    """Envelope of n samples; note held for `hold` seconds then released."""
    t = np.arange(n)/SR
    env = np.where(t < a, t/max(a, 1e-4), s + (1 - s)*np.exp(-(t - a)/max(d, 1e-4)))
    rel = t > hold
    if rel.any():
        at_hold = env[min(n - 1, nsamp(hold))]
        env[rel] = at_hold*np.exp(-(t[rel] - hold)/max(r, 1e-4))
    return env

def noise(n, key): return seeded('noise', key).normal(0, 1, n)

def pan2(x, pan):
    l, r = np.sqrt((1 - pan)/2), np.sqrt((1 + pan)/2)
    return np.stack([x*l, x*r], axis=1)

def soft(x, drive=1.0): return np.tanh(x*drive)/np.tanh(drive)

# ---------------------------------------------------------------- instruments
# Every instrument returns float64 mono (n,) or stereo (n,2) and is cached.

def _detuned(freq, n, cents, key, vib=None):
    rng = seeded('det', key)
    f = freq*2**(cents/1200)
    if vib is not None: f = f*vib
    return saw(f, n, rng.random())

@lru_cache(maxsize=None)
def pad(notes, dur, bright=1200.0, attack=.5):
    """Detuned saw ensemble, stereo-spread, slow swell. notes: tuple of MIDI."""
    tail = 1.6; n = nsamp(dur + tail); L = np.zeros(n); R = np.zeros(n)
    for i, m in enumerate(notes):
        f = hz(m)
        for j, c in enumerate((-11, -4, 4, 11)):
            v = _detuned(f, n, c + (i - 1)*1.3, ('pad', m, j))
            (L if (j + i) % 2 else R)[:] += v
            (R if (j + i) % 2 else L)[:] += v*.35
    env = adsr(n, attack, 1.0, .85, .7, dur)
    out = np.stack([L, R], axis=1)*env[:, None]/(len(notes)*3.0)
    out = lp(lp(out, bright), bright*1.4)
    return hp(out, 110)

@lru_cache(maxsize=None)
def strings(m, dur, bright=2600.0, vel=1.0):
    """Short bowed ensemble note (spiccato/marcato)."""
    n = nsamp(dur + .35); f = hz(m)
    x = sum(_detuned(f, n, c, ('str', m, k)) for k, c in enumerate((-8, 0, 7)))/3
    env = adsr(n, .006, .09, .55, .09, dur)
    x = lp(x*env, bright*(.7 + .3*vel))
    return hp(x, 140)*vel

@lru_cache(maxsize=None)
def legato_strings(m, dur, bright=3200.0):
    """Expressive sustained violins for melodies (delayed vibrato)."""
    n = nsamp(dur + .6); t = np.arange(n)/SR; f = hz(m)
    vib = 1 + .0045*np.sin(2*np.pi*5.4*t)*np.clip((t - .25)/.4, 0, 1)
    x = sum(_detuned(f, n, c, ('lstr', m, k), vib) for k, c in enumerate((-9, -3, 3, 9)))/4
    env = adsr(n, .12, .5, .9, .35, dur)
    return hp(lp(x*env, bright), 220)

@lru_cache(maxsize=None)
def brass(m, dur, vel=1.0, bright=3400.0):
    """Section brass: scooped pitch, filter that blooms then settles."""
    n = nsamp(dur + .4); t = np.arange(n)/SR; f = hz(m)
    scoop = 2**((-.35*np.exp(-t/.045))/12)
    vib = scoop*(1 + .003*np.sin(2*np.pi*5.0*t)*np.clip((t - .3)/.5, 0, 1))
    x = sum(_detuned(f, n, c, ('brs', m, k), vib) for k, c in enumerate((-6, 0, 5)))/3
    dark, open_ = lp(x, 520), lp(x, bright*(.6 + .4*vel), 2)
    w = np.clip(t/.07, 0, 1)*(.45 + .55*np.exp(-t/.35))*vel
    x = dark*(1 - w) + open_*w
    env = adsr(n, .035, .3, .82, .18, dur)
    return hp(soft(x*env*1.6, 1.4), 90)*vel

@lru_cache(maxsize=None)
def bass(m, dur, cutoff=900.0, drive=1.6, vel=1.0):
    """Analog-style bass: saw + sub sine with a plucky filter envelope."""
    n = nsamp(dur + .12); t = np.arange(n)/SR; f = hz(m)
    x = .7*saw(f, n, .25) + .6*sine(f, n) + .25*square(f/2, n)
    lo, hi = lp(x, 180), lp(x, cutoff, 2)
    w = np.exp(-t/.09)*vel
    x = lo*(1 - w) + hi*w + .35*lo
    env = adsr(n, .003, .25, .78, .05, dur)
    return soft(x*env*drive, drive)*vel*.8

@lru_cache(maxsize=None)
def pluck(m, dur, bright=4200.0, decay=.9965, key=0):
    """Karplus-Strong string (oud / guitar / harp)."""
    f = hz(m); N = max(2, int(round(SR/f - .5))); n = nsamp(dur + 1.2)
    exc = np.zeros(n); burst = noise(N, ('ks', m, key))
    exc[:N] = lp(burst, bright)*np.hanning(N)**.3
    a = np.zeros(N + 2); a[0] = 1; a[N] = -decay*.5; a[N + 1] = -decay*.5
    y = lfilter([1.0], a, exc)
    y *= adsr(n, .001, 10, 1, .12, dur + .9)
    return hp(y/(np.max(np.abs(y)) + 1e-9), 90)

@lru_cache(maxsize=None)
def bell(m, dur, ratio=3.5, index=2.2, decay=1.6):
    """FM bell/celesta for calm melodies."""
    n = nsamp(max(dur, 1.0) + 2.0); t = np.arange(n)/SR; f = hz(m)
    mod = index*np.exp(-t*3.2)*np.sin(2*np.pi*f*ratio*t)
    x = np.sin(2*np.pi*f*t + mod) + .25*np.sin(2*np.pi*f*2.001*t)*np.exp(-t*4)
    return x*np.exp(-t*decay)*np.clip(t/.002, 0, 1)

@lru_cache(maxsize=None)
def ney(m, dur):
    """Breathy end-blown flute with ornamental vibrato (IR calm voice)."""
    n = nsamp(dur + .5); t = np.arange(n)/SR; f = hz(m)
    vib = 1 + .006*np.sin(2*np.pi*5.6*t)*np.clip((t - .18)/.3, 0, 1)
    tone_ = sine(f*vib, n) + .22*sine(2*f*vib, n, .1) + .06*sine(3*f*vib, n, .3)
    breath = bp(noise(n, ('ney', m)), f*1.2, min(f*4, 9000))*.22
    env = adsr(n, .09, .4, .88, .22, dur)
    return (tone_ + breath*(.6 + .4*np.exp(-t*6)))*env

@lru_cache(maxsize=None)
def synth_lead(m, dur):
    """Gritty detuned saw/square lead for the industrial faction."""
    n = nsamp(dur + .25); t = np.arange(n)/SR; f = hz(m)
    vib = 1 + .005*np.sin(2*np.pi*5.8*t)*np.clip((t - .2)/.3, 0, 1)
    x = .5*_detuned(f, n, -7, ('ld', m, 0), vib) + .5*_detuned(f, n, 7, ('ld', m, 1), vib) + .4*square(f*vib, n)
    w = np.exp(-t/.25)
    x = lp(x, 1400)*(1 - w) + lp(x, 4200)*w
    env = adsr(n, .008, .3, .8, .1, dur)
    return hp(soft(x*env*2.2, 2.2), 160)

@lru_cache(maxsize=None)
def power_chord(m, dur, mute=False, take=0):
    """Distorted guitar power chord (root, fifth, octave) through a cab filter."""
    n = nsamp(dur + (.06 if mute else .3)); t = np.arange(n)/SR
    sign = 1 if take == 0 else -1
    x = sum(_detuned(hz(m + i), n, c*sign + 2*take, ('pc', m, i, take)) for i, c in ((0, -4), (7, 3), (12, 6)))
    x = hp(x, 120)
    x = soft(x*7.0, 7.0)
    x = lp(lp(x, 3600 if not mute else 1800), 5200)
    env = adsr(n, .002, .07 if mute else .6, .25 if mute else .7, .05, dur)
    return hp(x*env, 85)

@lru_cache(maxsize=None)
def choir(notes, dur):
    """Wordless 'ah' choir pad (formant-filtered saw ensemble)."""
    tail = 1.4; n = nsamp(dur + tail); t = np.arange(n)/SR
    src = np.zeros(n)
    for i, m in enumerate(notes):
        vib = 1 + .004*np.sin(2*np.pi*(5 + .3*i)*t + i)
        for k, c in enumerate((-8, 8)):
            src += _detuned(hz(m), n, c, ('ch', m, k), vib)
    x = bp(src, 650, 1100)*1.0 + bp(src, 1000, 1500)*.55 + bp(src, 2400, 3000)*.18
    env = adsr(n, .8, 1, .9, .9, dur)
    out = x*env/(len(notes)*2)
    return np.stack([out, np.roll(out, 397)], axis=1)

# ---- drums (variant v gives round-robin humanization)

@lru_cache(maxsize=None)
def kick(v=0, punch=1.0):
    n = nsamp(.55); t = np.arange(n)/SR
    f = 46 + 120*np.exp(-t/.035)
    body = sine(f, n)*np.exp(-t*7.5)
    click = hp(noise(n, ('kc', v)), 2500)*np.exp(-t*160)*.35
    return soft((body + click)*1.7*punch, 1.8)

@lru_cache(maxsize=None)
def snare(v=0, tone_=1.0):
    n = nsamp(.38); t = np.arange(n)/SR
    body = (sine(188, n)*.7 + sine(332, n)*.35)*np.exp(-t*24)
    wires = bp(noise(n, ('sn', v)), 1800, 9500)*np.exp(-t*14)
    snap = hp(noise(n, ('sn2', v)), 4000)*np.exp(-t*70)*.5
    return soft((body*tone_ + wires*.9 + snap)*1.3, 1.5)

@lru_cache(maxsize=None)
def clap(v=0):
    n = nsamp(.35); t = np.arange(n)/SR
    src = bp(noise(n, ('cl', v)), 900, 5000)
    env = sum(np.exp(-np.clip(t - d, 0, None)*180)*(t >= d) for d in (0, .011, .023)) + np.exp(-np.clip(t - .03, 0, None)*16)*(t >= .03)*.6
    return src*env*.7

@lru_cache(maxsize=None)
def hat(v=0, open_=False):
    n = nsamp(.6 if open_ else .12); t = np.arange(n)/SR
    metal = sum(square(f, n) for f in (317, 445, 581, 813, 1075, 1347))
    x = hp(metal*.25 + noise(n, ('ht', v))*.8, 7200, 4)
    return x*np.exp(-t*(7 if open_ else 55))*.55

@lru_cache(maxsize=None)
def shaker(v=0):
    n = nsamp(.14); t = np.arange(n)/SR
    return bp(noise(n, ('sh', v)), 4500, 11000)*np.clip(t/.018, 0, 1)*np.exp(-t*35)*.6

@lru_cache(maxsize=None)
def tom(pitch=110.0, v=0):
    n = nsamp(.7); t = np.arange(n)/SR
    f = pitch*(1 + .55*np.exp(-t/.05))
    x = sine(f, n)*np.exp(-t*6) + lp(noise(n, ('tm', v)), 1800)*np.exp(-t*30)*.25
    return soft(x*1.3, 1.3)

@lru_cache(maxsize=None)
def taiko(v=0, size=1.0):
    n = nsamp(1.4); t = np.arange(n)/SR
    f = 62/size*(1 + .7*np.exp(-t/.03))
    body = sine(f, n)*np.exp(-t*3.6) + .4*sine(f*1.58, n)*np.exp(-t*7)
    skin = lp(noise(n, ('tk', v)), 1400)*np.exp(-t*22)*.55
    return soft((body + skin)*1.6, 1.6)

@lru_cache(maxsize=None)
def timpani(m, v=0):
    n = nsamp(2.2); t = np.arange(n)/SR; f = hz(m)
    x = sum(a*sine(f*r, n)*np.exp(-t*d) for r, a, d in ((1, 1, 1.6), (1.504, .5, 2.6), (1.742, .3, 3.2), (2.0, .25, 3.5)))
    x += lp(noise(n, ('tp', v)), 900)*np.exp(-t*25)*.5
    return x*.8

@lru_cache(maxsize=None)
def doum(v=0):
    n = nsamp(.6); t = np.arange(n)/SR
    f = 84*(1 + .35*np.exp(-t/.02))
    return sine(f, n)*np.exp(-t*8) + lp(noise(n, ('dm', v)), 700)*np.exp(-t*30)*.4

@lru_cache(maxsize=None)
def tek(v=0):
    n = nsamp(.22); t = np.arange(n)/SR
    ring = sine(620 + 30*v, n)*np.exp(-t*38)*.5
    return (bp(noise(n, ('tk2', v)), 2000, 7000)*np.exp(-t*45) + ring)*.8

@lru_cache(maxsize=None)
def crash(v=0):
    n = nsamp(3.2); t = np.arange(n)/SR
    metal = sum(square(f, n) for f in (397, 563, 788, 1093, 1499, 2011))
    x = hp(noise(n, ('cr', v)) + metal*.3, 3400, 2)
    return x*np.exp(-t*1.35)*np.clip(t/.003, 0, 1)*.5

@lru_cache(maxsize=None)
def anvil(v=0):
    """Industrial metal hit."""
    n = nsamp(.9); t = np.arange(n)/SR
    x = sum(sine(f, n)*np.exp(-t*d) for f, d in ((563, 5), (1288, 7), (2210, 9), (3433, 12)))*.3
    return x + hp(noise(n, ('an', v)), 2000)*np.exp(-t*60)*.4

@lru_cache(maxsize=None)
def boom(v=0):
    n = nsamp(3.0); t = np.arange(n)/SR
    f = 34 + 40*np.exp(-t/.08)
    return soft((sine(f, n)*np.exp(-t*1.6) + lp(noise(n, ('bm', v)), 600)*np.exp(-t*5)*.5)*1.5, 1.5)

@lru_cache(maxsize=None)
def riser(seconds, v=0):
    """Filtered noise swell + rising tone, ends at `seconds`."""
    n = nsamp(seconds); t = np.arange(n)/SR; p = t/seconds
    src = noise(n, ('rs', v))
    blocks = 24; out = np.zeros(n)
    edges = np.linspace(0, n, blocks + 1).astype(int)
    for b in range(blocks):
        a, e = edges[b], edges[b + 1]; fc = 300*2**(5*b/blocks)
        out[a:e] = bp(src[max(0, a - 2000):e], fc, min(fc*3, 15000))[-(e - a):]
    tone_ = sine(110*2**(3*p**1.4), n)*.2
    return (out + tone_)*p**2.2*.6

# ---- v3 faction instruments

@lru_cache(maxsize=None)
def synth_pulse(m, dur, bright=2400.0):
    """Sequencer pulse (US): saw+square blip with a fast filter decay."""
    n = nsamp(dur + .15); t = np.arange(n)/SR; f = hz(m)
    x = .6*saw(f, n, .1) + .5*square(f*1.002, n)
    w = np.exp(-t/.06)
    x = lp(x, 500)*(1 - w) + lp(x, bright, 2)*w
    return hp(x*adsr(n, .002, .12, .35, .05, dur), 120)

@lru_cache(maxsize=None)
def gated_tom(pitch=80.0, v=0):
    n = nsamp(1.0); t = np.arange(n)/SR
    f = pitch*(1 + .6*np.exp(-t/.06))
    x = sine(f, n)*np.exp(-t*3.5) + lp(noise(n, ('gt', v)), 1500)*np.exp(-t*14)*.35
    gate = np.clip((.42 - t)/.05, 0, 1)
    return soft(x*1.4, 1.4)*gate

@lru_cache(maxsize=None)
def santur(m, dur, key=0):
    """Hammered dulcimer: two bright string courses plus a felt-hammer click."""
    a = pluck(m, dur, 8000, .9982, key)
    b = pluck(m, dur, 6000, .9978, key + 11)
    n = len(a); t = np.arange(n)/SR
    click = hp(noise(n, ('sant', m, key)), 3000)*np.exp(-t*400)*.25
    return hp(a*.6 + np.roll(b, 37)*.5 + click, 160)

@lru_cache(maxsize=None)
def kamancheh(m, dur):
    """Bowed spike fiddle: nasal formants, deep expressive vibrato, bow noise."""
    n = nsamp(dur + .4); t = np.arange(n)/SR; f = hz(m)
    vib = 1 + .0075*np.sin(2*np.pi*6.2*t)*np.clip((t - .12)/.25, 0, 1)
    x = saw(f*vib, n, .3)
    x = bp(x, 700, 1300)*1.0 + bp(x, 2200, 3400)*.5 + lp(x, 500)*.4
    x += bp(noise(n, ('kam', m)), 1500, 6000)*.05
    return hp(x*adsr(n, .07, .4, .85, .18, dur), 200)

@lru_cache(maxsize=None)
def tombak(kind='tom', v=0):
    n = nsamp(.5); t = np.arange(n)/SR
    if kind == 'tom':
        f = 92*(1 + .4*np.exp(-t/.02))
        return sine(f, n)*np.exp(-t*9) + lp(noise(n, ('tb', v)), 900)*np.exp(-t*40)*.3
    if kind == 'bak':
        return bp(noise(n, ('tbk', v)), 2500, 8000)*np.exp(-t*60)*.8 + sine(880 + 25*v, n)*np.exp(-t*45)*.35
    return hp(noise(n, ('tbp', v)), 4000)*np.exp(-t*120)*.6

@lru_cache(maxsize=None)
def daf(kind='dum', v=0):
    """Frame drum with ring jingles."""
    n = nsamp(.7); t = np.arange(n)/SR
    jingle = hp(noise(n, ('dfj', v)), 6000)*(1 + .8*np.sin(2*np.pi*36*t))*np.exp(-t*7)*.18
    if kind == 'dum':
        f = 68*(1 + .5*np.exp(-t/.03))
        return sine(f, n)*np.exp(-t*6) + lp(noise(n, ('df', v)), 600)*np.exp(-t*20)*.3 + jingle
    return bp(noise(n, ('dft', v)), 1200, 5000)*np.exp(-t*35)*.6 + jingle*1.3

@lru_cache(maxsize=None)
def blip(m, v=0):
    """Telemetry blip: the drone network 'talking' (IR)."""
    n = nsamp(.12); t = np.arange(n)/SR; f = hz(m)
    return (sine(f, n) + .3*square(f, n))*np.exp(-t*45)*np.clip(t/.002, 0, 1)

@lru_cache(maxsize=None)
def ping(v=0):
    n = nsamp(2.4); t = np.arange(n)/SR
    f = 1320*(1 - .03*t/2.4)
    return sine(f, n)*np.exp(-t*2.2)*np.clip(t/.004, 0, 1)*.6

@lru_cache(maxsize=None)
def missile_swell(seconds, v=0):
    """Sub-bass pressure swell that lands on a downbeat (IR volleys)."""
    n = nsamp(seconds); t = np.arange(n)/SR; p = t/seconds
    sub = sine(38 + 22*p, n)
    air = bp(noise(n, ('ms', v)), 200, 1800)*.3
    return (sub + air)*p**2.5

@lru_cache(maxsize=None)
def buzuq(m, dur, key=0):
    """Long-neck lute: bright metallic pluck with a sympathetic octave."""
    a = pluck(m, dur, 6500, .9972, key)
    b = pluck(m + 12, dur, 5000, .996, key + 5)
    return soft(a + .25*np.roll(b, 23), 1.4)

@lru_cache(maxsize=None)
def nylon(m, dur, key=0):
    return lp(pluck(m, dur, 2600, .9968, key), 5000)

@lru_cache(maxsize=None)
def oud(m, dur, key=0):
    """Fretless lute: warm pluck with a soft pick and body resonance."""
    x = pluck(m, dur, 3200, .9966, key)
    return x + bp(x, 180, 420)*.6

@lru_cache(maxsize=None)
def tar(m, dur, key=0):
    """Persian long-neck lute: bright, nasal, skin-bodied."""
    x = pluck(m, dur, 7000, .9968, key)
    return soft(x + bp(x, 900, 2500)*.8, 1.3)

@lru_cache(maxsize=None)
def mijwiz(m, dur):
    """Twin-reed pipe: two slightly detuned buzzy reeds, circular-breath steady."""
    n = nsamp(dur + .12); t = np.arange(n)/SR; f = hz(m)
    vib = 1 + .004*np.sin(2*np.pi*6.5*t)
    x = square(f*vib, n) + square(f*1.006*vib, n, .3)
    x = bp(x, 550, 3400) + bp(noise(n, ('mj', m)), 2000, 6000)*.05
    return hp(soft(x*adsr(n, .015, .2, .9, .05, dur)*1.6, 1.6), 300)

@lru_cache(maxsize=None)
def epiano(m, dur):
    """FM electric piano for montuno figures."""
    n = nsamp(dur + .8); t = np.arange(n)/SR; f = hz(m)
    mod = 1.6*np.exp(-t*6)*np.sin(2*np.pi*f*t)
    x = np.sin(2*np.pi*f*t + mod) + .2*np.sin(2*np.pi*f*14*t)*np.exp(-t*30)
    return x*adsr(n, .002, .9, .3, .2, dur)

@lru_cache(maxsize=None)
def conga(pitch=330.0, slap=False, v=0):
    n = nsamp(.4); t = np.arange(n)/SR
    f = pitch*(1 + .25*np.exp(-t/.01))
    x = sine(f, n)*np.exp(-t*(16 if slap else 9))
    x += bp(noise(n, ('cg', v, slap)), 1500, 7000)*np.exp(-t*(70 if slap else 120))*(.8 if slap else .25)
    return x

@lru_cache(maxsize=None)
def wardrum(v=0, size=1.0):
    """Large ceremonial drum (ardah-style procession)."""
    n = nsamp(1.6); t = np.arange(n)/SR
    f = 66/size*(1 + .9*np.exp(-t/.025))
    body = sine(f, n)*np.exp(-t*2.6) + .35*sine(f*1.5, n)*np.exp(-t*6)
    skin = lp(noise(n, ('wd', v)), 1100)*np.exp(-t*18)*.6
    return soft((body + skin)*1.8, 1.8)

@lru_cache(maxsize=None)
def tabl(kind='dum', v=0):
    """Dabke double-headed drum: deep beater 'dum', thin stick 'tak'."""
    n = nsamp(.6); t = np.arange(n)/SR
    if kind == 'dum':
        f = 70*(1 + .6*np.exp(-t/.02))
        return soft((sine(f, n)*np.exp(-t*7) + lp(noise(n, ('tl', v)), 800)*np.exp(-t*25)*.4)*1.5, 1.5)
    return bp(noise(n, ('tlt', v)), 1800, 6500)*np.exp(-t*55) + sine(520, n)*np.exp(-t*40)*.25

@lru_cache(maxsize=None)
def clank(v=0):
    """Machinery: low struck steel plus a ratchet burst (SA service machinery)."""
    n = nsamp(.8); t = np.arange(n)/SR
    steel = sum(sine(f, n)*np.exp(-t*d) for f, d in ((211, 6), (487, 9), (1033, 13), (1771, 16)))*.3
    ratchet = hp(noise(n, ('ck', v)), 1500)*(np.sin(2*np.pi*60*t) > .6)*np.exp(-t*9)*.3
    return steel + ratchet

@lru_cache(maxsize=None)
def hydraulic(seconds, v=0):
    n = nsamp(seconds); t = np.arange(n)/SR; p = t/seconds
    return bp(noise(n, ('hy', v)), 1800, 7000)*np.sin(np.pi*p)**1.5*.4

@lru_cache(maxsize=None)
def wind(seconds, v=0):
    """Dusty wind bed: slowly breathing band noise (SY)."""
    n = nsamp(seconds); t = np.arange(n)/SR
    lfo = .55 + .45*np.sin(2*np.pi*t/seconds*3 + v)
    return (lp(noise(n, ('wn', v)), 900)*lfo + bp(noise(n, ('wn2', v)), 1500, 4000)*.15*lfo**2)*.5

def bitcrush(x, bits=9, hold=2):
    q = 2**(bits - 1)
    y = np.round(x*q)/q
    if hold > 1: y = np.repeat(y[::hold], hold, axis=0)[:len(x)]
    return y

# ---------------------------------------------------------------- reverb / fx

@lru_cache(maxsize=None)
def impulse(seconds=2.4, dark=5200.0, predelay=.018):
    n = nsamp(seconds); t = np.arange(n)/SR
    chans = []
    for c in range(2):
        x = noise(n, ('ir', seconds, c))*np.exp(-t*6.9/seconds)
        x = lp(x, dark)*(.55 + .45*np.exp(-t*2.5)) + lp(x, dark*.35)*.45*(1 - np.exp(-t*2.5))
        er = np.zeros(n)
        for d, g in ((.011, .6), (.019, .45), (.027, .4), (.041, .3), (.053, .25)):
            er[nsamp(d + c*.0037)] += g
        x = x*.9 + er
        chans.append(np.concatenate([np.zeros(nsamp(predelay)), x]))
    ir = np.stack(chans, axis=1)
    return ir/np.sqrt(np.sum(ir**2)/2)

def circular_conv(x, ir, loop):
    y = np.stack([fftconvolve(x[:, c], ir[:, c]) for c in range(2)], axis=1)
    n = len(x)
    if loop:
        out = y[:n].copy(); tail = y[n:]
        for s in range(0, len(tail), n): out[:len(tail[s:s + n])] += tail[s:s + n]
        return out
    return y[:n]

def delay(x, seconds, feedback=.35, taps=5, loop=True, pingpong=True):
    out = np.zeros_like(x); d = nsamp(seconds); g = 1.0
    for k in range(1, taps + 1):
        g *= feedback
        src = lp(x, 4000)
        if pingpong and k % 2: src = src[:, ::-1]
        out += (np.roll(src, d*k, axis=0) if loop else np.pad(src, ((d*k, 0), (0, 0)))[:len(x)])*g
    return out

def glue(x, threshold=.22, ratio=2.5, attack=.01, release=.15):
    level = np.max(np.abs(x), axis=1)
    a = np.exp(-1/(SR*attack)); r = np.exp(-1/(SR*release))
    # One-pole follower on a decimated signal, then upsampled (fast, smooth).
    hop = 64; lv = level[:len(level)//hop*hop].reshape(-1, hop).max(axis=1)
    env = np.zeros_like(lv); e = 0.0
    a, r = a**hop, r**hop
    for i, v in enumerate(lv):
        e = a*e + (1 - a)*v if v > e else r*e + (1 - r)*v
        env[i] = e
    env = np.interp(np.arange(len(level)), np.arange(len(env))*hop + hop/2, env)
    over = np.maximum(env/threshold, 1)
    gain = over**(1/ratio - 1)
    return x*gain[:, None]

# ---------------------------------------------------------------- theory

SCALES = {'aeolian': [0, 2, 3, 5, 7, 8, 10], 'dorian': [0, 2, 3, 5, 7, 9, 10],
          'harmonic': [0, 2, 3, 5, 7, 8, 11], 'hijaz': [0, 1, 4, 5, 7, 8, 10]}

def deg_pitch(scale, deg):
    s = SCALES[scale]; o, i = divmod(deg, 7)
    return 12*o + s[i]

class Chord:
    def __init__(self, deg, scale, tonic):
        self.deg, self.scale, self.tonic = deg, scale, tonic
        self.degs = [deg, deg + 2, deg + 4]
        self.pcs = {(tonic + deg_pitch(scale, d)) % 12 for d in self.degs}
        self.root_pc = (tonic + deg_pitch(scale, deg)) % 12

    def root(self, low):
        """Lowest root pitch >= low."""
        p = self.tonic + deg_pitch(self.scale, self.deg)
        while p < low: p += 12
        while p - 12 >= low: p -= 12
        return p

    def is_tone(self, deg): return (deg % 7) in {d % 7 for d in self.degs}

    def snap(self, deg):
        if self.is_tone(deg): return deg
        for k in (-1, 1, -2, 2):
            if self.is_tone(deg + k): return deg + k
        return deg

    def pitch(self, deg, base): return base + deg_pitch(self.scale, deg)

def voicing(chord, prev, low, high, size=4):
    """Pick a close voicing (root doubled) nearest the previous one."""
    pcs = sorted(chord.pcs, key=lambda pc: (pc - chord.root_pc) % 12)
    cands = []
    for p in range(low, high + 1):
        if p % 12 in chord.pcs: cands.append(p)
    best, cost = None, 1e9
    for i in range(len(cands)):
        v = cands[i:i + size]
        if len(v) < size or {p % 12 for p in v} != set(pcs): continue
        c = sum(abs(a - b) for a, b in zip(v, prev)) if prev else abs(v[0] - (low + high)//2)
        if c < cost: best, cost = v, c
    return tuple(best or cands[:size])

# ---------------------------------------------------------------- scores (v3)
# Melodies: (start, length, scale degree from tonic) in units of 1/grid beat,
# 32 beats per phrase. prog: four chords x 2 bars per 8-bar section kind.
# Faction identities follow work/evidence/audio/music-v2-critical-review.md.

SCALES.update({'phrygian': [0, 1, 3, 5, 7, 8, 10], 'ionian': [0, 2, 4, 5, 7, 9, 11],
               'mixolydian': [0, 2, 4, 5, 7, 9, 10], 'chahargah': [0, 1, 4, 5, 7, 8, 11]})

SCORES = {
 # Air superiority: confident, precise, airborne. Bright dorian IV, horn calls.
 'US': dict(title='Clear Horizon', bpm=120, tonic=52, scale='dorian', lead_base=64, grid=1,
   prog={'A': [(0,), (6,), (3,), (3,)], 'B': [(2,), (6,), (3,), (4, 'harmonic')],
         'X': [(0,), (0,), (5, 'aeolian'), (6,)]},
   melA=[(0,1,0),(1,.5,4),(1.5,.5,4),(2,2,7),(4,1,6),(5,1,7),(6,2,4),
         (8,1,3),(9,.5,6),(9.5,.5,6),(10,2,8),(12,1,7),(13,1,6),(14,2,3),
         (16,1,3),(17,.5,7),(17.5,.5,7),(18,2,10),(20,1,9),(21,1,8),(22,2,7),
         (24,1,5),(25,1,7),(26,1,8),(27,1,9),(28,4,10)],
   melB=[(0,2,9),(2,1,7),(3,1,6),(4,1.5,4),(5.5,.5,6),(6,2,9),
         (8,2,10),(10,1,8),(11,1,6),(12,1,8),(13,1,7),(14,2,6),
         (16,2,7),(18,1,5),(19,1,3),(20,1,5),(21,1,7),(22,2,10),
         (24,2,11),(26,1,8),(27,1,6),(28,3,8),(31,1,6)]),
 # Drone network and missile volleys: watchful, patient, then saturating. 12/8.
 'IR': dict(title='Signal Under Steel', bpm=96, tonic=54, scale='hijaz', lead_base=66, grid=3,
   prog={'A': [(0,), (1,), (0,), (6,)], 'B': [(3,), (6,), (0,), (1,)], 'X': [(0,), (0,), (1,), (1,)]},
   melA=[(0,3,4),(3,1,5),(4,1,4),(5,1,3),(6,3,2),(9,3,1),(12,6,0),(18,2,1),(20,1,2),(21,3,3),
         (24,3,3),(27,1,4),(28,1,5),(29,1,4),(30,6,3),(36,3,1),(39,3,2),(42,6,1),
         (48,3,2),(51,3,4),(54,6,7),(60,2,6),(62,1,5),(63,3,4),(66,6,2),
         (72,3,3),(75,3,1),(78,3,-1),(81,3,1),(84,6,1),(90,6,0)],
   melB=[(0,6,7),(6,3,5),(9,3,3),(12,3,5),(15,3,6),(18,6,7),
         (24,6,8),(30,3,6),(33,3,5),(36,3,6),(39,3,8),(42,6,10),
         (48,6,9),(54,3,7),(57,3,6),(60,3,4),(63,3,6),(66,6,7),
         (72,6,8),(78,3,5),(81,3,3),(84,3,3),(87,3,2),(90,6,1)]),
 # Guerrilla: nimble, concealed, scrappy. Phrygian riffs with space and stops.
 'SY': dict(title='Roads We Hold', bpm=128, tonic=48, scale='phrygian', lead_base=60, grid=4,
   prog={'A': [(0,), (0,), (1,), (0,)], 'B': [(5,), (6,), (0,), (1,)], 'X': [(0,), (0,), (0,), (0,)]},
   melA=[(0,2,0),(3,1,1),(4,2,0),(8,2,4),(10,2,3),(12,2,1),(16,6,0),(26,2,-1),(28,2,0),
         (32,2,4),(35,1,5),(36,2,4),(40,2,7),(42,2,6),(44,2,5),(48,6,4),(58,2,3),(60,2,1),
         (64,2,1),(67,1,2),(68,2,1),(72,2,5),(74,2,4),(76,2,3),(80,6,1),(90,2,0),(92,2,1),
         (96,2,0),(98,2,2),(100,2,4),(102,2,7),(104,4,6),(108,2,4),(112,8,0)],
   melB=[(0,4,7),(4,2,5),(6,2,7),(8,4,9),(12,2,8),(14,2,7),(16,8,5),(26,2,4),(28,2,5),
         (32,4,8),(36,2,6),(38,2,8),(40,4,10),(44,2,9),(46,2,8),(48,8,6),(58,2,5),(60,2,6),
         (64,4,7),(68,2,4),(70,2,7),(72,4,9),(76,4,8),(80,8,7),(90,2,8),(92,2,9),
         (96,4,10),(100,4,8),(104,4,5),(108,4,3),(112,6,1),(118,2,1),(120,8,1)]),
 # Armored formation: slow, heavy, unstoppable. Harmonic minor (Nahawand-type).
 'SA': dict(title='Brass Meridian', bpm=92, tonic=43, scale='harmonic', lead_base=55, grid=1,
   prog={'A': [(0,), (3,), (4,), (0,)], 'B': [(5,), (3,), (4,), (4,)], 'X': [(0,), (5,), (3,), (4,)]},
   melA=[(0,3,4),(3,1,5),(4,2,4),(6,1,2),(7,1,3),(8,3,5),(11,1,4),(12,2,3),(14,2,2),
         (16,2,6),(18,1,5),(19,1,6),(20,3,8),(23,1,7),(24,2,7),(26,1,6),(27,1,5),(28,4,4)],
   melB=[(0,2,7),(2,2,9),(4,3,8),(7,1,7),(8,2,7),(10,1,5),(11,1,7),(12,4,10),
         (16,2,8),(18,1,7),(19,1,6),(20,2,5),(22,2,6),(24,3,4),(27,1,5),(28,4,6)]),
 # Command console: industrial electronic, faction-neutral.
 'menu': dict(title='Frontline Command', bpm=104, tonic=50, scale='aeolian', lead_base=62, grid=1,
   prog={'A': [(0,), (6,), (5,), (6,)], 'B': [(0,), (4,), (5,), (4, 'harmonic')], 'X': [(3,), (5,), (6,), (4, 'harmonic')]},
   melA=[(0,3,4),(3,1,2),(4,2,4),(6,1,7),(7,1,6),(8,3,6),(11,1,4),(12,2,3),(14,2,1),
         (16,3,2),(19,1,4),(20,2,5),(22,1,4),(23,1,2),(24,3,1),(27,1,3),(28,4,3)],
   melB=[(0,2,7),(2,1,9),(3,1,7),(4,3,11),(7,1,9),(8,2,8),(10,1,6),(11,1,8),(12,3,11),(15,1,10),
         (16,2,9),(18,1,7),(19,1,5),(20,2,7),(22,2,9),(24,2,11),(26,1,9),(27,1,13),(28,4,11)]),
}
SCORES['neutral'] = {**SCORES['menu'], 'title': 'After Action', 'bpm': 88, 'tonic': 48, 'lead_base': 60}

FORM = ['A', 'A', 'A', 'B', 'X', 'A', 'B', 'B']          # 64 bars, breakdown at 33-40
LEAD = {'combat': {1: 'A', 2: 'A2', 3: 'B', 6: 'B2'},   # melody in half the sections
        'calm': {1: 'A', 3: 'B', 6: 'B2'}, 'tension': {}}
ENERGY = [.75, 1, 1, 1, .35, .85, 1, 1]

def cap(p, hi=86):
    while p > hi: p -= 12
    return p

def phrase_variant(mel, which, grid=1):
    """A' lifts the second half a third; B' pushes the climax up an octave."""
    if which == 'A2': return [(b, l, d + 2 if b >= 16*grid else d) for b, l, d in mel]
    if which == 'B2': return [(b, l, d + (7 if 20*grid <= b < 28*grid and d < 9 else 0)) for b, l, d in mel]
    return list(mel)

# ---------------------------------------------------------------- arranger

class Track:
    def __init__(self, n, loop):
        self.n, self.loop = n, loop
        self.buses = {}

    def bus(self, name):
        if name not in self.buses: self.buses[name] = np.zeros((self.n, 2))
        return self.buses[name]

    def put(self, name, sample, at, gain=1.0, pan=0.0):
        if gain == 0: return
        s = sample if sample.ndim == 2 else pan2(sample, pan)
        if sample.ndim == 2 and pan: s = s*np.array([np.sqrt(1 - pan), np.sqrt(1 + pan)])
        s = s*gain; buf = self.bus(name); start = int(round(at*SR)); n = self.n
        if not self.loop:
            if start >= n: return
            s = s[:n - start]; buf[start:start + len(s)] += s; return
        for off in range(0, len(s), n):
            part = s[off:off + n]; idx = (np.arange(len(part)) + start + off) % n
            buf[idx] += part

class Ctx:
    def __init__(s, name, layer, bars=64, loop=True, chords=None):
        sc = SCORES[name] if isinstance(name, str) else name
        s.sc, s.layer, s.bars, s.loop = sc, layer, bars, loop
        s.bpm = sc['bpm']; s.beat = 60/s.bpm; s.bar = 4*s.beat
        s.n = nsamp(bars*s.bar); s.trk = Track(s.n, loop); s.tonic = sc['tonic']
        s.rng = seeded('humanize', sc['title'], layer); s.kicks = []
        s.calm, s.tension, s.combat = layer == 'calm', layer == 'tension', layer == 'combat'
        if chords is None:
            chords = []
            for sec in range(bars//8):
                for spec in sc['prog'][FORM[sec % 8]]:
                    ch = Chord(spec[0], spec[1] if len(spec) > 1 else sc['scale'], s.tonic); chords += [ch, ch]
        s.chords = chords

    def kind(s, b): return FORM[(b//8) % 8]
    def energy(s, b): return ENERGY[(b//8) % 8] if s.combat else (.5 if s.kind(b) == 'X' else 1.0)
    def at(s, b, beat=0.0): return b*s.bar + beat*s.beat
    def put(s, bus, smp, t, g=1.0, pan=0.0): s.trk.put(bus, smp, t, g, pan)
    def kick(s, smp, t, g, bus='drums'): s.put(bus, smp, t, g); s.kicks.append(t)
    def hum(s, a=.004): return s.rng.uniform(-a, a)
    def vel(s, base, spread=.08): return base*(1 + s.rng.uniform(-spread, spread))
    def root(s, b, low): return s.chords[b].root(low)
    def tones(s, b, base):
        ch = s.chords[b]; return sorted({ch.pitch(d, base) for d in ch.degs})

    def pads(s, bright, gain, attack, low=7, high=26, every=2, bus='pad'):
        prev = None
        for b in range(0, s.bars, every):
            v = voicing(s.chords[b], prev, s.tonic + low, s.tonic + high); prev = v
            s.put(bus, pad(v, round(every*s.bar, 4), bright, attack), s.at(b), gain)

    def melody(s, plan, play, phrases=None):
        grid = s.sc.get('grid', 1)
        phrases = phrases or {'A': s.sc['melA'], 'A2': phrase_variant(s.sc['melA'], 'A2', grid),
                              'B': s.sc['melB'], 'B2': phrase_variant(s.sc['melB'], 'B2', grid)}
        for sec in range(s.bars//8):
            which = plan.get(sec % 8) if isinstance(plan, dict) else plan(sec)
            if not which: continue
            for (bt, ln, dg) in phrases[which]:
                bt, ln = bt/grid, ln/grid
                bi = sec*8 + int(bt//4); ch = s.chords[bi]
                strong = (bt % 4 == 0) or (bt % 2 == 0 and ln >= 2)
                d = ch.snap(dg) if strong else dg
                play(ch.pitch(d, s.sc['lead_base']), round(ln*s.beat*.96, 4), s.at(sec*8, bt) + s.hum(), bt, ln)

    def transitions(s, swell=None):
        """Riser into every section (tension/combat); louder into full sections."""
        if s.calm: return
        total = s.bars*s.bar
        for sec in range(s.bars//8):
            end = sec*8*s.bar; length = (2 if s.combat else 1)*s.bar
            g = (.2 if s.combat else .13)*(1.3 if FORM[sec % 8] != 'X' and FORM[(sec - 1) % 8] == 'X' else 1)
            s.put('fx', (swell or riser)(round(length, 4), sec), (end - length) % total, g)

# ---- United States: airborne precision

def arr_US(c):
    bright = {'calm': 1300, 'tension': 1800, 'combat': 2600}[c.layer]
    c.pads(bright, .2, 1.0 if c.calm else .4)
    for b in range(c.bars):
        k, e, t0 = c.kind(b), c.energy(b), c.at(b)
        root = c.root(b, c.tonic - 12); tones = c.tones(b, c.tonic + 12)
        if not c.calm:  # signature sequencer pulse
            sub = 16 if c.combat and k != 'X' else 8; step = c.bar/sub
            pat = [0, 0, 2, 0, 1, 0, 2, 3]
            for i in range(sub):
                idx = pat[i % 8]; p = tones[idx % 3] + (12 if idx == 3 else 0)
                c.put('arp', synth_pulse(p, round(step*.7, 4), 2800 if c.combat else 1700), t0 + i*step,
                      (.15 if c.combat else .11)*(1 if i % 4 == 0 else .72), -.35 + .7*(i % 2))
        elif k == 'B':
            for i in range(4): c.put('arp', synth_pulse(tones[i % 3] + 12, round(c.beat*.4, 4), 1100), t0 + i*c.beat, .05, .5 - (i % 2))
        if c.calm:
            if b % 2 == 0: c.put('bass', bass(root, round(2*c.bar - .1, 4), 360, 1.1, .8), t0, .5)
        else:
            for i in range(8):
                if (c.tension or k == 'X') and i % 2: continue
                p = root + (12 if c.combat and i in (3, 7) else 0)
                c.put('bass', bass(p, round(c.beat*.42, 4), 1100 if c.combat else 700, 1.8, 1 if i % 2 == 0 else .8), t0 + i*c.beat/2, .5)
        if c.calm:
            if b % 4 == 0: c.put('drums', gated_tom(62, b % 3), t0, .22, -.2)
            if b % 8 == 6: c.put('drums', snare(1, .5), t0 + 3.5*c.beat, .05)
        elif c.tension:
            c.kick(kick(b % 4, .9), t0, .45); c.kick(kick((b + 1) % 4, .9), t0 + 2*c.beat, .35)
            for i in range(8): c.put('drums', hat(i % 4), t0 + i*c.beat/2, .06 if i % 2 else .09, .35)
            c.put('drums', snare(b % 3, .6), t0 + 3*c.beat, .14)
            if b % 4 == 3:
                for j in range(4): c.put('drums', snare(j % 3, .5), t0 + (3 + j*.25)*c.beat, .05 + .02*j, -.2)
        else:
            if k == 'X':
                c.kick(kick(0, .9), t0, .5)
                if b % 8 >= 6:
                    for j in range(16): c.put('drums', snare(j % 3, .6), t0 + j*c.bar/16, .04 + .012*j + (.1 if b % 8 == 7 else 0), -.1)
            else:
                for pos in ((0, 1.5, 2, 3.5) if b % 2 else (0, 2, 2.75)): c.kick(kick(int(pos*4) % 4), t0 + pos*c.beat, .8*e)
                for pos in (1, 3): c.put('drums', snare(b % 3), t0 + pos*c.beat, .52*e, .05)
                for i in range(16):
                    if i % 4 in (1, 3): c.put('drums', snare((i + 1) % 3, .4), t0 + i*c.bar/16, .06*e, -.25)
                for i in range(8): c.put('drums', hat(i % 4, i == 7), t0 + i*c.beat/2, .09 if i % 2 else .13, .4)
                if b % 4 == 3:
                    for j, p in enumerate((120, 100, 84, 70)): c.put('drums', gated_tom(p, j), t0 + (3 + j*.25)*c.beat, .32, -.5 + .3*j)
            if b % 8 == 0 and k != 'X':
                c.put('drums', crash(b % 2), t0, .2, .3); c.put('drums', boom(b % 2), t0, .22)
    c.transitions()
    def play(p, dur, at, bt, ln):
        if c.combat:
            c.put('lead', brass(p, dur, c.vel(.92, .05), 2400), at, .36, .1)        # horn section
            c.put('lead', brass(p - 12, dur, .75, 1600), at, .18, -.1)
            c.put('lead', legato_strings(cap(p + 12, 88), dur), at, .1, -.25)
        elif c.calm:
            c.put('lead', brass(p, dur, .55, 1300), at, .26, .15)                   # distant solo horn
    c.melody(LEAD[c.layer], play)
    if c.tension:  # horn-call fragments only
        c.melody({1: 'A', 5: 'A'}, lambda p, dur, at, bt, ln: bt < 8 and c.put('lead', brass(p - 12, dur, .6, 1200), at, .22, .1))

# ---- Iran: the watching network, then the volley (12/8 feel)

def arr_IR(c):
    bright = {'calm': 900, 'tension': 1300, 'combat': 1900}[c.layer]
    c.pads(bright, .16, 1.0 if c.calm else .5)
    for b in range(0, c.bars, 2):  # network hum: low tonic/fifth drone
        c.put('pad', pad((c.tonic - 12, c.tonic - 5), round(2*c.bar, 4), 600, 1.0), c.at(b), .15)
    trip = c.beat/3
    for b in range(c.bars):
        k, e, t0 = c.kind(b), c.energy(b), c.at(b)
        root = c.root(b, c.tonic - 12); tones = c.tones(b, c.tonic + 12)
        # telemetry: sparse high blips on chord tones, deterministic, panned wide
        count = {'calm': 2, 'tension': 4, 'combat': 3}[c.layer]
        for j in range(count):
            u = int(c.rng.integers(0, 12)); p = tones[int(c.rng.integers(0, 3))] + 24
            c.put('blip', blip(p, j % 3), t0 + u*trip, .05 if c.calm else .06, float(c.rng.uniform(-.8, .8)))
        if b % 4 == 0 and not c.combat: c.put('fx', ping(b % 2), t0, .07 if c.calm else .09, -.4)
        if c.calm:
            if b % 2 == 0:  # santur tremolo swell on a chord tone
                p = tones[(b//2) % 3] + 12
                for j in range(9): c.put('santur', santur(p, round(trip, 4), j % 2), t0 + j*trip*.5, .05 + .015*np.sin(np.pi*j/8))
            if b % 2 == 0: c.put('bass', bass(root, round(2*c.bar - .1, 4), 320, 1.1, .8), t0, .45)
            if b % 2 == 0: c.put('drums', daf('dum', b % 3), t0, .25)
            if b % 4 == 3: c.put('drums', tombak('bak', 1), t0 + 3*c.beat, .12, .3)
            continue
        # santur ostinato in triplet eighths
        pat = [0, 1, 2, 1, 0, 1, 3, 1, 0, 2, 1, 2]
        for i in range(12):
            if (c.tension or k == 'X') and i % 3 == 2: continue
            idx = pat[i]; p = tones[idx % 3] + (12 if idx == 3 else 0)
            c.put('santur', santur(p, round(trip*1.5, 4), i % 3), t0 + i*trip + c.hum(.003), c.vel(.17 if i % 3 == 0 else .11), -.3 + .2*(i % 3))
        # bass on the dotted pulse
        for u, p in ((0, root), (5, root), (6, root + 7 if c.combat else root), (9, root), (11, root + 12 if c.combat else root)):
            if c.tension and u in (5, 11): continue
            c.put('bass', bass(p, round(trip*1.6, 4), 900, 1.8, 1 if u in (0, 6) else .75), t0 + u*trip, .5)
        # frame drums: daf on the big beats, tombak conversation inside
        for u in (0, 6): c.put('drums', daf('dum', u//6 + b % 2), t0 + u*trip, .42*e)
        for u in (3, 9): c.put('drums', daf('tak', u//3), t0 + u*trip, .2*e, .2)
        if c.combat and k != 'X':
            for u in (0, 6): c.kick(tombak('tom', u//6), t0 + u*trip, .5); c.kicks.append(t0 + u*trip)
            c.kick(kick(b % 4, .8), t0, .45)
            for u in (2, 4, 5, 8, 10, 11): c.put('drums', tombak('bak' if u in (4, 10) else 'pelang', u % 3), t0 + u*trip, .2 if u in (4, 10) else .09, -.35)
            for u in range(0, 12, 3): c.put('strings', strings(root + 12, round(trip*2, 4), 1800, 1 if u % 6 == 0 else .7), t0 + u*trip, .16, .25)
            if b % 4 == 3:
                for j in range(6): c.put('drums', tombak('bak', j % 3), t0 + (6 + j)*trip, .14 + .03*j, -.3 + .1*j)
        elif c.tension:
            for u in (4, 10): c.put('drums', tombak('bak', u % 3), t0 + u*trip, .12, -.3)
        if c.combat and b % 8 == 0 and k != 'X':  # the volley: three timed impacts
            for j in range(3):
                c.put('drums', boom(j % 2), t0 + j*trip*2, .2 - .03*j); c.put('drums', tombak('tom', j), t0 + j*trip*2, .4)
            c.put('drums', crash(b % 2), t0, .14, .3)
    c.transitions(missile_swell)
    def play(p, dur, at, bt, ln):
        if c.combat:
            c.put('lead', kamancheh(cap(p, 86), dur), at, .3, .1)
            c.put('lead', santur(cap(p + 12, 88), dur, 2), at, .1, -.25)
        elif c.calm:
            c.put('lead', ney(cap(p, 84), dur), at, .22, .1)
    c.melody(LEAD[c.layer], play)
    if c.tension:
        c.melody({1: 'A', 5: 'B'}, lambda p, dur, at, bt, ln: bt < 8 and c.put('lead', kamancheh(p - 12, dur), at, .16, .1))

# ---- Syrian Rebels: concealment, ambush, fast repositioning

def arr_SY(c):
    c.pads(800 if c.calm else 1100, .12 if c.calm else .1, 1.2 if c.calm else .6, low=5, high=22)
    for b in range(0, c.bars, 4): c.put('fx', wind(round(4*c.bar, 4), b), c.at(b), .14 if c.calm else .08)
    s16 = c.bar/16
    for b in range(c.bars):
        k, e, t0 = c.kind(b), c.energy(b), c.at(b)
        root = c.root(b, c.tonic - 12); tones = c.tones(b, c.tonic + 12)
        stop = (b % 8 == 7) and not c.calm                    # the drop: silence before the ambush
        cut = 8 if stop else 16
        if c.calm:
            if b % 4 == 0: c.put('bass', bass(root, round(4*c.bar - .2, 4), 300, 1.1, .7), t0, .42)
            if b % 2 == 1:
                for j in range(2):
                    u = int(c.rng.integers(0, 16)); c.put('perc', tek(j), t0 + u*s16, .1, float(c.rng.uniform(-.6, .6)))
            if b % 4 == 2: c.put('perc', shaker(b % 2), t0 + 2.5*c.beat, .07, .4)
            continue
        # buzuq ostinato: syncopated, b2 colour, leaves holes
        riff = [(0, 0), (3, 1), (6, 0), (8, 2), (10, 1), (13, 0)]
        for u, idx in riff:
            if u >= cut or (c.tension and u in (3, 13)): continue
            p = c.chords[b].pitch(c.chords[b].deg + [0, 1, 2][idx] if idx < 2 else c.chords[b].deg + 4, c.sc['lead_base'] - 12)
            c.put('pluck', buzuq(p, round(s16*1.6, 4), u % 3), t0 + u*s16 + c.hum(.003), c.vel(.2 if u == 0 else .14), .3)
        # palm-muted guitar stabs (combat), never a wall
        if c.combat and k != 'X':
            for u in (0, 3, 6, 10, 12):
                if u >= cut: continue
                c.put('guitar', power_chord(c.root(b, c.tonic), round(s16*.9, 4), True, u % 2), t0 + u*s16, .2, -.5 if u % 2 else .5)
        for u in ((0, 3, 6, 8, 11, 14) if c.combat else (0, 6, 8)):
            if u >= cut: continue
            c.put('bass', bass(root + (12 if u == 14 else 0), round(s16*1.4, 4), 1200 if c.combat else 700, 2.2, 1 if u in (0, 8) else .75), t0 + u*s16, .48)
        # broken beat, dry and lo-fi
        kp = (0, 6, 10) if b % 2 == 0 else (0, 3, 10)
        if c.tension or k == 'X': kp = (0, 10)
        for u in kp:
            if u < cut: c.kick(kick(u % 4, 1.0), t0 + u*s16, .7*e if c.combat else .45)
        for u, g in ((4, .5), (12, .5), (7, .1), (15, .08)):
            if u < cut and (c.combat or u in (12,)): c.put('drums', snare(u % 3, .8), t0 + u*s16, g*e if c.combat else .18)
        for u in range(0, cut, 2):
            c.put('drums', hat(u % 4), t0 + u*s16 + (.012 if u % 4 == 2 else 0), .08 if c.combat else .05, .35)
        for u in (1, 5, 9, 13):
            if u < cut and c.combat: c.put('perc', tek(u % 3), t0 + u*s16, .1, -.45)
        if b % 8 == 0 and c.combat and k != 'X':           # ambush hit after the drop
            c.put('guitar', power_chord(c.root(b, c.tonic), round(c.beat*1.5, 4), False, 0), t0, .32, -.4)
            c.put('guitar', power_chord(c.root(b, c.tonic), round(c.beat*1.5, 4), False, 1), t0 + .006, .32, .4)
            c.put('drums', boom(b % 2), t0, .26); c.put('drums', crash(b % 2), t0, .16, -.3)
    c.transitions()
    def play(p, dur, at, bt, ln):
        if c.combat: c.put('lead', buzuq(cap(p, 84), dur, 1), at, .34, -.1)
        elif c.calm: c.put('lead', buzuq(cap(p, 81), dur, 2), at, .2, .2)
    c.melody(LEAD[c.layer], play)
    if c.tension:
        c.melody({1: 'A', 5: 'A'}, lambda p, dur, at, bt, ln: bt < 8 and c.put('lead', buzuq(p - 12, dur, 3), at, .16, .2))

# ---- Saudi Arabia: the armored formation

def arr_SA(c):
    c.pads(1100 if c.calm else 1700, .2, 1.0 if c.calm else .5, low=9, high=28)
    for b in range(0, c.bars, 2):
        c.put('pad', pad((c.tonic, c.tonic + 7), round(2*c.bar, 4), 700, .8), c.at(b), .12)
    for b in range(c.bars):
        k, e, t0 = c.kind(b), c.energy(b), c.at(b)
        root = c.root(b, c.tonic - 5); low = c.root(b, c.tonic)
        if c.calm:
            c.kick(wardrum(b % 3, 1.15), t0, .16 if b % 2 else .2)  # distant formation heartbeat
            if b % 2 == 0: c.put('bass', bass(root, round(2*c.bar - .1, 4), 300, 1.1, .8), t0, .5)
            if b % 4 == 3: c.put('perc', clank(b % 2), t0 + 3.5*c.beat, .06, .5)
            continue
        # low string ostinato: root/fifth in marcato eighths (quarters in tension)
        steps = 8 if c.combat and k != 'X' else 4
        for i in range(steps):
            p = low + (7 if i % 4 == 2 else 0) + (12 if i % 8 == 7 else 0)
            c.put('strings', strings(p + 12, round(c.bar/steps*.75, 4), 2400, 1 if i % 2 == 0 else .75), t0 + i*c.bar/steps, .22, -.2)
        for i in range(4 if c.combat else 2):
            c.put('bass', bass(root, round(c.bar/(4 if c.combat else 2)*.85, 4), 700, 1.9), t0 + i*c.bar/(4 if c.combat else 2), .55)
        # war drums: heavy half-time procession
        if k == 'X' and c.combat:
            c.kick(wardrum(0), t0, .5)
        else:
            for pos, g in ((0, .48), (1.5, .3), (2, .42)): c.kick(wardrum(int(pos*2) % 3), t0 + pos*c.beat, g*e)
            for pos in (1, 3): c.put('drums', daf('tak', int(pos)), t0 + pos*c.beat, .18*e, .2)
            if c.combat:
                c.kick(kick(b % 4, .9), t0, .4)
                c.put('drums', snare(b % 3, .9), t0 + 2*c.beat, .38*e)     # half-time backbeat
                for i in range(8): c.put('drums', shaker(i % 2), t0 + i*c.beat/2, .05, .4)
            if b % 4 == 3:
                for j in range(8): c.put('drums', wardrum(j % 3, .7), t0 + (2 + j*.25)*c.beat, .08 + .025*j)
        if b % 2 == 1: c.put('perc', clank(b % 2), t0 + 3.5*c.beat, .12 if c.combat else .08, .5)
        if b % 8 == 0: c.put('fx', hydraulic(round(1.5*c.bar, 4), b), t0, .16, -.5)
        if c.combat and k != 'X' and b % 2 == 0:            # low brass stabs on the formation step
            v = voicing(c.chords[b], None, c.tonic, c.tonic + 14, 3)
            for pos in (0, 2.5):
                for p in v: c.put('brass', brass(p, round(c.beat*.6, 4), .9, 1800), t0 + pos*c.beat, .14)
        if c.combat and b % 8 == 0 and k != 'X':
            c.put('drums', crash(b % 2), t0, .16, .3); c.put('drums', boom(b % 2), t0, .26)
    c.transitions()
    def play(p, dur, at, bt, ln):
        if c.combat:
            c.put('lead', brass(p, dur, c.vel(.95, .05), 2000), at, .36, .1)     # low horns/trombones
            c.put('lead', legato_strings(p + 12, dur, 2600), at, .14, -.2)
        elif c.calm:
            c.put('lead', oud(cap(p + 12, 79), dur, int(bt) % 3), at, .3, .15)
    c.melody(LEAD[c.layer], play)
    if c.tension:
        c.melody({1: 'A', 5: 'B'}, lambda p, dur, at, bt, ln: bt < 8 and c.put('lead', oud(p, dur, 1), at, .18, .15))

# ---- Menu / neutral: command console

def arr_menu(c):
    c.pads({'calm': 1000, 'tension': 1500, 'combat': 2200}[c.layer], .2, .9 if c.calm else .35)
    for b in range(c.bars):
        k, e, t0 = c.kind(b), c.energy(b), c.at(b)
        root = c.root(b, c.tonic - 12); tones = c.tones(b, c.tonic + 12)
        if c.calm:
            for i in range(4): c.put('arp', synth_pulse(tones[(i + b) % 3], round(c.beat*.4, 4), 1000), t0 + i*c.beat, .05, .4 - .27*i)
            if b % 2 == 0: c.put('bass', bass(root, round(2*c.bar - .1, 4), 360, 1.1, .8), t0, .5)
            if b % 4 == 2: c.put('perc', anvil(b % 3), t0 + 3.5*c.beat, .04, -.5)
            continue
        sub = 16 if c.combat and k != 'X' else 8
        for i in range(sub):
            idx = [0, 2, 1, 2, 0, 2, 1, 3][i % 8]; p = tones[idx % 3] + (12 if idx == 3 else 0)
            c.put('arp', synth_pulse(p, round(c.bar/sub*.6, 4), 2200 if c.combat else 1400), t0 + i*c.bar/sub, .12*(1 if i % 4 == 0 else .7), -.4 + .8*(i % 2))
        for i in range(8):
            if c.tension and i % 2: continue
            c.put('bass', bass(root + (12 if i % 4 == 3 and c.combat else 0), round(c.beat*.45, 4), 1300 if c.combat else 800, 2.2), t0 + i*c.beat/2, .5)
        if c.combat and k != 'X':
            for pos in (0, 1.5, 2, 2.75): c.kick(kick(int(pos*4) % 4), t0 + pos*c.beat, .85*e)
            for pos in (1, 3): c.put('drums', snare(b % 3), t0 + pos*c.beat, .5*e); c.put('perc', anvil(int(pos)), t0 + pos*c.beat, .16, .3)
            for i in range(16): c.put('drums', hat(i % 4, i % 8 == 6), t0 + i*c.bar/16, .1 if i % 2 else .15, .35)
            if b % 2 == 0:
                v = voicing(c.chords[b], None, c.tonic + 7, c.tonic + 22, 3)
                for p in v: c.put('brass', brass(p, round(c.beat*.5, 4), .9), t0, .13)
            if b % 8 == 0: c.put('drums', crash(b % 2), t0, .2, .3); c.put('drums', boom(b % 2), t0, .25)
        else:
            c.kick(kick(b % 4, .9), t0, .45); c.kick(kick(1, .9), t0 + 2*c.beat, .35)
            c.put('drums', clap(b % 2), t0 + 3*c.beat, .16)
            for i in range(8): c.put('drums', hat(i % 4), t0 + i*c.beat/2, .06, .35)
            if b % 4 == 3: c.put('perc', anvil(1), t0 + 3.5*c.beat, .1, -.5)
    c.transitions()
    def play(p, dur, at, bt, ln):
        if c.combat:
            c.put('lead', brass(p, dur, c.vel(.95, .05)), at, .34, .1)
            c.put('lead', legato_strings(cap(p + 12, 88), dur), at, .12, -.2)
        elif c.calm:
            c.put('lead', pluck(p, dur, 2600, .997), at, .16, .1)
            c.put('lead', legato_strings(p - 12, dur, 1600), at, .1, -.1)
    c.melody(LEAD[c.layer], play)

ARRANGERS = {'US': arr_US, 'IR': arr_IR, 'SY': arr_SY, 'SA': arr_SA, 'menu': arr_menu, 'neutral': arr_menu}
STYLE = {'US': 'us', 'IR': 'ir', 'SY': 'sy', 'SA': 'sa', 'menu': 'menu', 'neutral': 'menu'}

def arrange(name, layer, bars=64, loop=True):
    c = Ctx(name, layer, bars, loop)
    ARRANGERS[name](c)
    return mixdown(c.trk, layer, STYLE[name], c.kicks, c.beat, loop)

LAYER_RMS = {'calm': .072, 'tension': .085, 'combat': .1, 'anthem': .1}

def mixdown(trk, layer, style, kick_times, beat, loop):
    n = trk.n
    duck = np.ones(n)
    if layer not in ('calm',) and kick_times:
        imp = np.zeros(n)
        for at in kick_times: imp[int(round(at*SR)) % n] = 1
        kern = np.exp(-np.arange(nsamp(.28))/(SR*.09))
        env = np.clip(circular_imp(imp, kern, loop), 0, 1)
        duck = 1 - (.4 if layer in ('combat', 'anthem') else .22)*env
    sends = {'pad': .32, 'strings': .22, 'pluck': .26, 'lead': .26, 'brass': .2, 'arp': .18, 'santur': .3,
             'blip': .5, 'bass': 0, 'drums': .1, 'perc': .2, 'guitar': .05, 'fx': .4}
    if layer == 'calm': sends = {k: v*1.5 for k, v in sends.items()}
    dry = np.zeros((n, 2)); wet_in = np.zeros((n, 2))
    for name, buf in trk.buses.items():
        if name in ('pad', 'bass', 'strings', 'guitar', 'arp'): buf = buf*duck[:, None]
        if name == 'bass': buf = circ(lambda v: lp(v, 5000), buf, loop)*.78
        if name == 'drums' and style == 'sa': buf = circ(lambda v: hp(v, 45), buf, loop)
        if name == 'drums' and style == 'sy': buf = circ(lambda v: lp(bitcrush(v, 10, 2), 9000), buf, loop)
        if name in ('lead', 'pluck') and style == 'sy': buf = buf + delay(buf, beat*.75, .28, 3, loop)*.45
        if name in ('lead', 'santur') and style == 'ir': buf = buf + delay(buf, beat*2/3, .25, 3, loop)*.35
        if name == 'arp' and style == 'us': buf = buf + delay(buf, beat*.75, .3, 3, loop)*.4
        if name == 'arp' and style == 'menu': buf = circ(lambda v: lp(bitcrush(v, 7, 3), 6000), buf, loop) + delay(buf, beat/2, .25, 2, loop)*.3
        if name == 'bass' and style == 'menu': buf = soft(buf*2.0, 2.0)*.6
        dry += buf; wet_in += buf*sends.get(name, .2)
    ir = impulse(3.2 if layer == 'calm' else 2.4, 4800 if layer == 'calm' else 5600)
    wet = circular_conv(circ(lambda v: hp(v, 200), wet_in, loop), ir, loop)
    mix = dry + wet*.55
    mix = circ(lambda v: glue(hp(v, 28)), mix, loop)
    # tilt: leave the low end to explosions, add presence so parts read under SFX
    low = circ(lambda v: lp(v, 140), mix, loop); mix = mix - .4*low
    high = circ(lambda v: hp(v, 2200), mix, loop); mix = mix + (.45 if layer == 'calm' else .7)*high
    # tape-style warmth: gentle saturation plus a soft top-end roll-off
    mix = circ(lambda v: lp(v, 14000), mix, loop)
    rms = np.sqrt(np.mean(mix**2)); mix *= LAYER_RMS[layer]/max(rms, 1e-9)
    mix = soft(mix*.9, 1.5)
    rms = np.sqrt(np.mean(mix**2)); mix *= LAYER_RMS[layer]/max(rms, 1e-9)
    peak = np.max(np.abs(mix))
    if peak > .89: mix *= .89/peak
    return mix

def circ(fn, x, loop, pre=2.0):
    """Run a stateful process as if the loop had already been playing."""
    if not loop: return fn(x)
    k = min(len(x), nsamp(pre))
    return fn(np.concatenate([x[-k:], x]))[k:]

def circular_imp(imp, kern, loop):
    y = fftconvolve(imp, kern)
    n = len(imp); out = y[:n].copy()
    if loop: out[:len(y) - n] += y[n:]
    return out

# ---------------------------------------------------------------- victory anthems
# Original melodies written in the style the user asked for per faction; no
# existing song's melody is reproduced.

def per_bar(specs, scale, tonic):
    return [Chord(s[0], s[1] if len(s) > 1 else scale, tonic) for s in specs]

ANTHEMS = {
 # US: slow 90s Latin dance-pop (claps, congas, nylon guitar, montuno, brass).
 'US': dict(title='Wheels Up Fiesta', bpm=84, tonic=57, scale='ionian', lead_base=69, grid=1,
   bars=[(0,), (3,), (4,), (0,), (5,), (3,), (4,), (0,)],
   mel=[(0,1,4),(1,.5,7),(1.5,.5,6),(2,1,4),(3,.5,2),(3.5,.5,4),(4,1.5,5),(5.5,.5,3),(6,1,5),(7,1,7),
        (8,1,6),(9,.5,8),(9.5,.5,7),(10,1,6),(11,1,4),(12,3,2),(15,1,4),
        (16,1,7),(17,.5,9),(17.5,.5,8),(18,1,7),(19,1,5),(20,1.5,3),(21.5,.5,5),(22,2,7),
        (24,1,8),(25,1,6),(26,1,4),(27,1,8),(28,4,7)]),
 # Iran: Persian heroic anthem; a kamancheh lament that turns triumphant.
 'IR': dict(title='The City Returns', bpm=80, tonic=50, scale='chahargah', lead_base=62, grid=1,
   bars=[(0,), (1,), (0,), (0,), (0,), (0,), (1,), (1,), (3,), (3,), (0,), (0,), (3,), (3,), (1,), (0,)],
   lament=[(0,3,4),(3,1,5),(4,2,4),(6,1,2),(7,1,1),(8,4,1),(12,3,0),(15,1,1)],
   mel=[(0,1.5,4),(1.5,.5,4),(2,1,7),(3,1,6),(4,2,7),(6,1,4),(7,1,5),
        (8,1.5,5),(9.5,.5,5),(10,1,8),(11,1,7),(12,3,5),(15,1,3),
        (16,1.5,7),(17.5,.5,7),(18,1,10),(19,1,9),(20,2,7),(22,1,5),(23,1,6),
        (24,2,7),(26,1,8),(27,1,6),(28,4,7)]),
 # Syria: Levantine dabke celebration (mijwiz-style reed, buzuq, tabl, claps).
 'SY': dict(title='Dabke at the Crossroads', bpm=132, tonic=55, scale='mixolydian', lead_base=67, grid=4,
   bars=[(0,), (0,), (6,), (6,), (3,), (3,), (0,), (0,)],
   mel=[(0,2,4),(2,1,5),(3,1,4),(4,2,2),(6,2,4),(8,2,5),(10,2,4),(12,4,2),
        (16,2,1),(18,2,2),(20,2,4),(22,2,2),(24,2,1),(26,2,0),(28,4,1),
        (32,2,3),(34,1,4),(35,1,3),(36,2,1),(38,2,3),(40,2,4),(42,2,3),(44,4,1),
        (48,2,-1),(50,2,1),(52,2,3),(54,2,1),(56,4,-1),(60,4,0),
        (64,2,5),(66,1,6),(67,1,5),(68,2,3),(70,2,5),(72,2,7),(74,2,5),(76,4,3),
        (80,2,4),(82,2,5),(84,2,4),(86,2,3),(88,4,3),(92,4,4),
        (96,2,4),(98,2,5),(100,2,7),(102,2,5),(104,2,4),(106,2,2),(108,4,4),
        (112,2,2),(114,2,1),(116,4,0),(120,8,0)]),
 # Saudi Arabia: ardah sword-dance procession (great drums, chant-like line, oud, brass).
 'SA': dict(title='Ardah of the Shield', bpm=80, tonic=43, scale='harmonic', lead_base=55, grid=1,
   bars=[(0,), (0,), (3,), (3,), (4,), (4,), (0,), (0,)],
   mel=[(0,1,0),(1,1,2),(2,1.5,3),(3.5,.5,2),(4,2,0),(6,1,1),(7,1,2),
        (8,1,3),(9,1,5),(10,1.5,4),(11.5,.5,3),(12,2,3),(14,1,2),(15,1,1),
        (16,1,4),(17,1,6),(18,1.5,5),(19.5,.5,4),(20,2,4),(22,1,5),(23,1,6),
        (24,1,7),(25,1,6),(26,1,5),(27,1,4),(28,1,2),(29,1,1),(30,2,0)]),
}

def anthem(fac):
    sc = ANTHEMS[fac]; specs = sc['bars']
    if len(specs) == 8: specs = specs + specs
    chords = per_bar(specs, sc['scale'], sc['tonic'])
    c = Ctx(sc, 'combat', 16, True, chords)
    {'US': anthem_US, 'IR': anthem_IR, 'SY': anthem_SY, 'SA': anthem_SA}[fac](c)
    return mixdown(c.trk, 'anthem', {'US': 'us', 'IR': 'ir', 'SY': 'sy-anthem', 'SA': 'sa'}[fac], c.kicks, c.beat, True)

def anthem_melody(c, mel, bar0, play, grid=None):
    grid = grid or c.sc.get('grid', 1)
    for bt, ln, dg in mel:
        bt, ln = bt/grid, ln/grid
        bi = bar0 + int(bt//4); ch = c.chords[bi]
        strong = (bt % 4 == 0) or (bt % 2 == 0 and ln >= 2)
        d = ch.snap(dg) if strong else dg
        play(ch.pitch(d, c.sc['lead_base']), round(ln*c.beat*.96, 4), c.at(bar0, bt) + c.hum(.003), bt, ln)

def anthem_US(c):
    c.pads(2400, .12, .2, low=7, high=24, every=1)
    for b in range(16):
        t0 = c.at(b); root = c.root(b, c.tonic - 12); tones = c.tones(b, c.tonic)
        for pos in (0, 1.5, 2): c.kick(kick(int(pos*2) % 4, 1.0), t0 + pos*c.beat, .7)
        for pos in (1, 3): c.put('drums', clap(int(pos)), t0 + pos*c.beat, .38); c.put('drums', snare(int(pos), .5), t0 + pos*c.beat, .16)
        for i in range(16): c.put('perc', shaker(i % 2), t0 + i*c.bar/16, .05 if i % 2 else .08, .4)
        for pos, hi, slap in ((1, 330, True), (3, 330, False), (3.5, 220, False), (2.5, 330, False)):
            c.put('perc', conga(hi, slap, int(pos*2) % 3), t0 + pos*c.beat, .22 if slap else .18, -.35 if hi == 330 else -.15)
        for pos, p in ((0, root), (1.5, root + 7), (2.5, root + 12), (3.5, root + 7)):  # tumbao anticipations
            c.put('bass', bass(p, round(c.beat*.7, 4), 1100, 1.6), t0 + pos*c.beat, .5)
        for pos in (.5, 1.5, 2, 3, 3.5):                                                  # montuno on the offbeats
            for p in tones: c.put('pluck', epiano(p + 12, round(c.beat*.35, 4)), t0 + pos*c.beat, .06, .25)
        for j, p in enumerate(tones + [tones[0] + 12]):                                  # nylon strum
            c.put('guitar', nylon(p, round(c.beat*1.8, 4), j), t0 + j*.014, .14, -.3)
            c.put('guitar', nylon(p, round(c.beat*1.8, 4), j + 4), t0 + 2*c.beat + (3 - j)*.014, .1, -.3)
        if b % 4 == 3:
            for p in tones: c.put('brass', brass(p + 12, round(c.beat*.4, 4), 1.0, 4000), t0 + 3.5*c.beat, .14)
        if b % 8 == 7:
            for j in range(6): c.put('perc', conga(400 - j*30, True, j % 3), t0 + (2.5 + j*.25)*c.beat, .2)
        if b in (0, 8): c.put('drums', crash(b//8), t0, .2, .3)
    anthem_melody(c, c.sc['mel'], 0, lambda p, d, at, bt, ln: (c.put('lead', epiano(p + 12, d), at, .14, .1), c.put('lead', nylon(p, d, 2), at, .2, -.1)))
    anthem_melody(c, c.sc['mel'], 8, lambda p, d, at, bt, ln: (c.put('lead', brass(p, d, 1.0, 4200), at, .3, .1), c.put('lead', brass(p - 12, d, .8, 2600), at, .16, -.15)))

def anthem_IR(c):
    for b in range(16):
        t0 = c.at(b); root = c.root(b, c.tonic - 12); tones = c.tones(b, c.tonic + 12)
        if b < 4:                                     # lament: drone, tar tremolo, kamancheh
            if b % 2 == 0: c.put('pad', pad((c.tonic - 12, c.tonic - 5, c.tonic), round(2*c.bar, 4), 700, 1.0), t0, .26)
            for j in range(12): c.put('pluck', tar(tones[0], round(c.beat/4, 4), j % 3), t0 + j*c.beat/3, .05 + .03*(j % 3 == 0))
            if b == 3:
                for j in range(8): c.put('drums', daf('tak', j % 2), t0 + (2 + j*.25)*c.beat, .1 + .04*j)
            continue
        if (b - 4) % 2 == 0:
            v = voicing(c.chords[b], None, c.tonic + 7, c.tonic + 24)
            c.put('pad', pad(v, round(2*c.bar, 4), 2200, .3), t0, .18)
        for pos in (0, 2): c.kick(daf('dum', int(pos)), t0 + pos*c.beat, .55); c.kick(kick(int(pos), .9), t0 + pos*c.beat, .35)
        for pos in (1, 3): c.put('drums', daf('tak', int(pos)), t0 + pos*c.beat, .3, .2)
        for i in range(8): c.put('perc', tombak('pelang' if i % 2 else 'bak', i % 3), t0 + i*c.beat/2, .08, -.3)
        for i in range(8): c.put('strings', strings(root + 12 + (7 if i % 4 == 2 else 0), round(c.beat*.4, 4), 2400, 1 if i % 2 == 0 else .7), t0 + i*c.beat/2, .2, -.2)
        for i in range(4): c.put('bass', bass(root, round(c.beat*.8, 4), 800, 1.6), t0 + i*c.beat, .5)
        for i in range(8): c.put('pluck', tar(tones[i % 3], round(c.beat*.5, 4), i % 3), t0 + i*c.beat/2, .1, .3)
        if b in (4, 12): c.put('drums', timpani(c.tonic - 12, 0), t0, .4); c.put('drums', crash(b % 2), t0, .2, .3); c.put('drums', boom(0), t0, .25)
        if b == 11:
            for j in range(8): c.put('drums', snare(j % 3, .7), t0 + (2 + j*.25)*c.beat, .12 + .04*j)
    anthem_melody(c, ANTHEMS['IR']['lament'], 0, lambda p, d, at, bt, ln: c.put('lead', kamancheh(p, d), at, .36, .1))
    anthem_melody(c, c.sc['mel'], 4, lambda p, d, at, bt, ln: (c.put('lead', brass(p, d, .95, 3200), at, .32, .1), c.put('lead', kamancheh(cap(p + 12, 86), d), at, .14, -.2)))
    tutti = [m for m in c.sc['mel'] if m[0] >= 16]
    anthem_melody(c, [(b - 16, l, d) for b, l, d in tutti], 12, lambda p, d, at, bt, ln: (c.put('lead', brass(p, d, 1.0, 3800), at, .34, .1), c.put('lead', brass(p - 12, d, .9), at, .2, -.1), c.put('lead', legato_strings(cap(p + 12, 88), d), at, .14, -.25)))

def anthem_SY(c):
    s8 = c.beat/2
    for b in range(16):
        t0 = c.at(b); root = c.root(b, c.tonic - 12); tones = c.tones(b, c.tonic)
        second = b >= 8
        for u, kind in ((0, 'dum'), (2, 'tak'), (3, 'tak'), (4, 'dum'), (6, 'tak')):   # dabke: DUM . tak tak DUM . tak .
            if kind == 'dum': c.kick(tabl('dum', u % 3), t0 + u*s8, .62); c.kicks.append(t0 + u*s8)
            else: c.put('drums', tabl('tak', u % 3), t0 + u*s8, .3, .2)
        for pos in (1, 3): c.put('perc', clap(int(pos)), t0 + pos*c.beat, .28 if second else .18, -.2)
        for i in range(16):
            if i % 4 in (1, 3) and second: c.put('perc', tek(i % 3), t0 + i*c.bar/16, .1, -.4)
        for u, p in ((0, root), (4, root + 7)): c.put('bass', bass(p, round(s8*1.6, 4), 900, 1.8), t0 + u*s8, .52)
        for u in range(8):                                                                # buzuq strumming
            for j, p in enumerate(tones): c.put('guitar', buzuq(p, round(s8*.9, 4), (u + j) % 3), t0 + u*s8 + j*.008, .06 if u % 2 else .09, .35)
        if b % 2 == 0: c.put('pad', pad(tuple(t + 12 for t in tones), round(2*c.bar, 4), 2000, .2), t0, .1)
        if b == 8: c.put('drums', crash(0), t0, .2, .3)
        if b == 7 or b == 15:
            for j in range(8): c.put('drums', tabl('tak', j % 3), t0 + (2 + j*.25)*c.beat, .2 + .03*j)
    anthem_melody(c, c.sc['mel'], 0, lambda p, d, at, bt, ln: c.put('lead', mijwiz(p, d), at, .24, .05))
    anthem_melody(c, c.sc['mel'], 8, lambda p, d, at, bt, ln: (c.put('lead', mijwiz(p, d), at, .3, .05), c.put('lead', buzuq(p + 12, d, 2), at, .12, -.3)))

def anthem_SA(c):
    for b in range(16):
        t0 = c.at(b); root = c.root(b, c.tonic - 5); low = c.root(b, c.tonic)
        response = b >= 8
        if b % 2 == 0:
            c.put('pad', pad((c.tonic, c.tonic + 7), round(2*c.bar, 4), 800, .5), t0, .14)
            if response:
                v = voicing(c.chords[b], None, c.tonic + 7, c.tonic + 24)
                c.put('pad', pad(v, round(2*c.bar, 4), 2000, .4), t0, .14)
        for pos in range(4): c.kick(wardrum(pos % 3, 1.0 if pos % 2 == 0 else 1.15), t0 + pos*c.beat, .42 if pos % 2 == 0 else .28)
        c.put('drums', daf('tak', b % 2), t0 + 3.5*c.beat, .26, .25)
        for pos in (1, 3): c.put('drums', daf('tak', int(pos)), t0 + pos*c.beat, .16, -.25)
        if b % 4 == 3:
            for j in range(8): c.put('drums', wardrum(j % 3, .7), t0 + (2 + j*.25)*c.beat, .07 + .03*j)
        for i in range(4): c.put('bass', bass(root, round(c.beat*.85, 4), 700, 1.8), t0 + i*c.beat, .52)
        for i in range(8 if response else 4):
            st = c.bar/(8 if response else 4)
            c.put('strings', strings(low + 12 + (7 if i % 4 == 2 else 0), round(st*.8, 4), 2400), t0 + i*st, .2, -.2)
        if b == 8: c.put('drums', crash(0), t0, .22, .3); c.put('drums', boom(0), t0, .3)
    anthem_melody(c, c.sc['mel'], 0, lambda p, d, at, bt, ln: (c.put('lead', oud(p + 12, d, int(bt) % 3), at, .34, .1), c.put('lead', legato_strings(p, d, 1800), at, .16, -.1)))
    anthem_melody(c, c.sc['mel'], 8, lambda p, d, at, bt, ln: (c.put('lead', brass(p + 12, d, 1.0, 3000), at, .32, .1), c.put('lead', brass(p, d, .9, 2000), at, .2, -.1), c.put('lead', oud(p + 12, d, 2), at, .14, .3)))

# ---------------------------------------------------------------- stingers

def stinger(name):
    dur = 6.0 if name in ('victory', 'defeat') else 4.0
    trk = Track(nsamp(dur), False); tonic = 50
    if name == 'victory':      # D major fanfare, timpani roll, crash
        for i, (at, notes) in enumerate([(0, (62, 66, 69)), (.32, (62, 66, 69)), (.52, (64, 67, 71)), (.72, (66, 69, 74))]):
            hold = 3.6 if i == 3 else .26
            for p in notes: trk.put('brass', brass(p, hold, 1.0), at, .26, (p - 68)/20)
            trk.put('brass', brass(notes[0] - 12, hold, .9), at, .22)
        trk.put('pad', pad((62, 66, 69, 74), 3.8, 2400, .2), .72, .3)
        for j in range(10): trk.put('drums', timpani(38, j % 2), j*.05, .12 + .02*j)
        trk.put('drums', timpani(38, 0), .72, .6); trk.put('drums', crash(0), .72, .35); trk.put('drums', boom(0), .72, .3)
        trk.put('lead', bell(86, 2.0), .72, .1)
    elif name == 'defeat':     # sinking minor line over low strings
        for i, p in enumerate((62, 61, 58, 57)):
            trk.put('lead', legato_strings(p, 1.0 if i < 3 else 3.2, 2200), i*.75, .38)
        trk.put('pad', pad((38, 45, 50, 53), 4.6, 900, .6), 0, .45)
        trk.put('drums', boom(1), 0, .45); trk.put('drums', taiko(0, 1.3), 2.25, .5)
        trk.put('brass', brass(38, 3.0, .7), 2.25, .35)
    elif name == 'mission_start':  # taiko call, rising fifth power chord
        for at, g in ((0, .55), (.28, .4), (.56, .7)): trk.put('drums', taiko(int(at*10) % 3), at, g)
        for p in (38, 45, 50): trk.put('brass', brass(p, 2.2, .95), .56, .28)
        trk.put('pad', pad((50, 57, 62), 2.6, 1800, .15), .56, .3)
        trk.put('drums', crash(1), .56, .25); trk.put('fx', riser(.56, 9), 0, .25)
    elif name == 'objective':      # bright confirmation arpeggio
        for i, p in enumerate((62, 66, 69, 74)): trk.put('lead', bell(p + 12, 1.4), i*.11, .2, -.3 + .2*i)
        for p in (62, 66, 69): trk.put('brass', brass(p, 1.2, .7), .33, .14)
        trk.put('drums', timpani(50, 0), .33, .3)
    elif name == 'strategic_warning':  # dissonant low brass pulses
        for i in range(4):
            at = i*.75
            for p in (38, 39, 45): trk.put('brass', brass(p, .5, .9), at, .3)
            trk.put('drums', taiko(i % 3, .9), at, .5)
        trk.put('pad', pad((26, 27, 38), 3.4, 600, .4), 0, .4)
    dry = sum(trk.buses.values()); wet = circular_conv(dry*.3, impulse(2.4, 5000), False)
    mix = hp(dry + wet*.6, 28)
    env = np.minimum(1, np.arange(len(mix))/(SR*.004))*np.minimum(1, (len(mix) - np.arange(len(mix)))/(SR*.8))
    mix *= env[:, None]
    rms = np.sqrt(np.mean(mix**2)); mix *= .1/max(rms, 1e-9)
    mix = soft(mix, 1.2)*.98
    peak = np.max(np.abs(mix))
    if peak > .9: mix *= .9/peak
    return mix

# ---------------------------------------------------------------- jobs/export

BEDS = {'menu_theme': ('menu', 'combat'), 'lobby_loop': ('menu', 'tension'), 'briefing_bed': ('menu', 'calm'),
        'debrief_bed': ('neutral', 'calm'), 'editor_ambient': ('neutral', 'tension'), 'credits': ('menu', 'combat')}

def jobs():
    out = [dict(name=k, score=s, layer=l) for k, (s, l) in BEDS.items()]
    out += [dict(name=f'battle_{f}_{l}', score=f, layer=l) for f in ('US', 'IR', 'SY', 'SA') for l in ('calm', 'tension', 'combat')]
    out += [dict(name=f'victory_{f}', anthem=f) for f in ('US', 'IR', 'SY', 'SA')]
    out += [dict(name=f'stinger_{s}', stinger=s) for s in ('victory', 'defeat', 'mission_start', 'objective', 'strategic_warning')]
    return out

def digest(b): return hashlib.sha256(b).hexdigest()

def export(name, samples, entry_extra):
    music = OUT/'music'; music.mkdir(parents=True, exist_ok=True)
    samples = np.asarray(samples, dtype=np.float32)
    ogg = music/f'{name}.ogg'; mp3 = music/f'{name}.mp3'
    tmp_wav = music/f'.{name}.tmp.wav'
    sf.write(tmp_wav, samples, SR, subtype='FLOAT')
    tmp = music/f'.{name}.tmp.ogg'
    # libsndfile can crash on one large Vorbis write; stream it in blocks.
    with sf.SoundFile(tmp, 'w', SR, samples.shape[1], format='OGG', subtype='VORBIS', compression_level=VORBIS_COMPRESSION) as out:
        for i in range(0, len(samples), 16384): out.write(samples[i:i + 16384])
    os.replace(tmp, ogg)
    tmp = music/f'.{name}.tmp.mp3'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(tmp_wav), '-c:a', 'libmp3lame', '-b:a', STEREO_MP3_BITRATE, '-map_metadata', '-1', str(tmp)], check=True)
    os.replace(tmp, mp3); tmp_wav.unlink()
    decoded, rate = sf.read(ogg, dtype='float32', always_2d=True)
    if rate != SR or not np.isfinite(decoded).all(): raise ValueError(f'bad export {ogg}')
    if np.max(np.abs(decoded)) >= .995: raise ValueError(f'clipping {ogg}')
    ob, mb = ogg.read_bytes(), mp3.read_bytes()
    variant = dict(url=f'/art/audio/music/{name}.ogg', duration=len(samples)/SR, bytes=len(ob), sha256=digest(ob),
                   mp3_url=f'/art/audio/music/{name}.mp3', mp3_bytes=len(mb), mp3_sha256=digest(mb))
    return {**entry_extra, 'variants': [variant]}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--only', default='')
    ap.add_argument('--preview', help='write WAVs to this directory instead of exporting')
    args = ap.parse_args()
    needles = [s for s in args.only.split(',') if s]
    todo = [j for j in jobs() if not needles or any(s in j['name'] for s in needles)]
    index_path = OUT/'index.json'; index = json.loads(index_path.read_text())
    for i, job in enumerate(todo, 1):
        if 'stinger' in job:
            samples = stinger(job['stinger']); extra = dict(bus='music', loop=False)
        elif 'anthem' in job:
            samples = anthem(job['anthem']); extra = dict(bus='music', loop=True, bpm=ANTHEMS[job['anthem']]['bpm'], beats_per_bar=4)
        else:
            sc = SCORES[job['score']]; samples = arrange(job['score'], job['layer'])
            extra = dict(bus='music', loop=True, bpm=sc['bpm'], beats_per_bar=4)
        if args.preview:
            Path(args.preview).mkdir(parents=True, exist_ok=True)
            sf.write(Path(args.preview)/f'{job["name"]}.wav', samples.astype(np.float32), SR, subtype='PCM_16')
        else:
            index['entries'][f'music.{job["name"]}'] = export(job['name'], samples, extra)
            tmp = index_path.with_suffix('.json.tmp'); tmp.write_text(json.dumps(index, indent=2) + '\n'); os.replace(tmp, index_path)
        print(f'{i}/{len(todo)} {job["name"]} {len(samples)/SR:.1f}s peak={np.max(np.abs(samples)):.2f} rms={np.sqrt(np.mean(samples**2)):.3f}', flush=True)

if __name__ == '__main__':
    main()
