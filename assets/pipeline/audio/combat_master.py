"""Reproducible dry, hard-edged combat mastering from preserved runtime originals.

Keeps exact sample counts, event routing, captions and music/ambient/UI levels.
The original Ogg/MP3 pair is retained under .local/audio-before-rough-20261108.
"""
import argparse
import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt
from common import ROOT, OUT, atomic_json, digest, VORBIS_COMPRESSION, MONO_MP3_BITRATE

BACKUP = ROOT / '.local/audio-before-rough-20261108'
PREFIXES = ('sfx.weapon.', 'sfx.explosion_', 'sfx.impact_')
EXTRA = {'sfx.building_collapse', 'sfx.vehicle_kill', 'sfx.bullet_crack_near',
         'sfx.strategic_impact', 'sfx.missile_terminal_crack'}


def master(signal, rate):
    # Parallel chest/presence bands make the impact audible on small speakers;
    # the original high-frequency crack stays present instead of adding subbass.
    dry = sosfilt(butter(2, 45, btype='highpass', fs=rate, output='sos'), signal, axis=0)
    chest = sosfilt(butter(2, [100, 650], btype='bandpass', fs=rate, output='sos'), dry, axis=0)
    edge = sosfilt(butter(2, [900, 3900], btype='bandpass', fs=rate, output='sos'), dry, axis=0)
    gritty = np.tanh(edge * 3) / 3
    mixed = dry + .5 * chest + .3 * gritty
    attack = 1 + .4 * np.exp(-np.arange(len(signal)) / (rate * .045))
    mixed *= attack[:, None]
    mixed -= np.mean(mixed, axis=0)
    # Retain the old peak budget: this changes texture, not the master volume.
    peak = min(.80, float(np.max(np.abs(signal))))
    actual = float(np.max(np.abs(mixed)))
    if actual > 0:
        mixed *= peak / actual
    return mixed.astype(np.float32)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', default='')
    parser.add_argument('--index-output', type=Path, help='Stage metadata without publishing the shared index.')
    args = parser.parse_args()
    index_path = OUT / 'index.json'
    index = json.loads(index_path.read_text())
    BACKUP.mkdir(parents=True, exist_ok=True)
    if not (BACKUP / 'index.json').exists():
        shutil.copy2(index_path, BACKUP / 'index.json')
    total = 0
    for event, entry in index['entries'].items():
        if entry['bus'] != 'effects' or entry.get('loop') or not (event.startswith(PREFIXES) or event in EXTRA):
            continue
        if args.only and args.only not in event:
            continue
        for variant in entry['variants']:
            rel = Path(variant['url'].removeprefix('/art/audio/'))
            source = BACKUP / rel
            source.parent.mkdir(parents=True, exist_ok=True)
            if not source.exists():
                shutil.copy2(OUT / rel, source)
                shutil.copy2((OUT / rel).with_suffix('.mp3'), source.with_suffix('.mp3'))
            signal, rate = sf.read(source, always_2d=True)
            processed = master(signal, rate)
            wav = ROOT / 'assets/audio/masters/rough-combat' / rel.with_suffix('.wav')
            wav.parent.mkdir(parents=True, exist_ok=True)
            sf.write(wav, processed, rate, subtype='FLOAT')
            target = OUT / rel
            temp = target.with_suffix('.rough.ogg')
            sf.write(temp, processed, rate, format='OGG', subtype='VORBIS', compression_level=VORBIS_COMPRESSION)
            temp.replace(target)
            mp3 = target.with_suffix('.mp3')
            temp = mp3.with_suffix('.rough.mp3')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-c:a', 'libmp3lame', '-b:a', MONO_MP3_BITRATE, '-map_metadata', '-1', str(temp)], check=True)
            temp.replace(mp3)
            decoded, decoded_rate = sf.read(target, always_2d=True)
            assert decoded_rate == rate and len(decoded) == len(signal)
            assert np.isfinite(decoded).all() and np.max(np.abs(decoded)) < .995
            variant.update(bytes=target.stat().st_size, sha256=digest(target.read_bytes()),
                           mp3_bytes=mp3.stat().st_size, mp3_sha256=digest(mp3.read_bytes()))
            total += 1
    # Merge at install time; the speech pipeline may have updated other entries.
    current = json.loads(index_path.read_text())
    for event, entry in index['entries'].items():
        if entry['bus'] == 'effects' and (event.startswith(PREFIXES) or event in EXTRA):
            current['entries'][event] = entry
    atomic_json(args.index_output or index_path, current)
    print(json.dumps({'processed_combat_clips': total, 'originals': str(BACKUP)}))


if __name__ == '__main__':
    main()
