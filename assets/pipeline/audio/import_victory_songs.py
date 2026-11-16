"""Local-only victory-song overrides from files the operator already has.

Shipped victory music stays the original anthems from music.py
(`music.victory_US/IR/SY/SA`). This tool never downloads anything. It only
converts audio files the operator supplies on this machine into the exact
runtime shape music.py exports (44.1 kHz stereo Ogg + MP3, hashed index
entry), so a local build can play them through the existing AudioDirector
anthem path. Inputs and backups live under .local/ (git-ignored). Imported
encodings replace files in assets/build/audio/music/ on this machine only:
do not commit or package them. --restore (or re-running
`music.py --only victory_`) puts the shipped originals back.

Expected inputs (any ffmpeg-readable extension works, mp3 shown):
    .local/victory-songs/US.mp3
    .local/victory-songs/IR.mp3
    .local/victory-songs/SY.mp3
    .local/victory-songs/SA.mp3

Run: .local/audio-venv/bin/python assets/pipeline/audio/import_victory_songs.py
     [--dir .local/victory-songs] [--start 12] [--seconds 60] [--crossfade 2]
     [--only US,IR] [--restore]
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import music as fc_music  # reuse export(): identical encoding + index shape

ROOT = fc_music.ROOT
OUT = fc_music.OUT
SR = fc_music.SR
FACTIONS = ('US', 'IR', 'SY', 'SA')
EXTS = ('.mp3', '.ogg', '.wav', '.m4a', '.flac', '.aac', '.opus')
# client/src/audio/index.ts rejects music variants over 180 s / 16 MiB.
MAX_SECONDS = 180.0
BACKUP_DIR = ROOT/'.local/victory-songs/backup-original'
STATE_FILE = ROOT/'.local/victory-songs/imported.json'


def find_input(song_dir, faction):
    for ext in EXTS:
        p = song_dir/f'{faction}{ext}'
        if p.is_file():
            return p
    return None


def decode(path, tmp_dir):
    """Decode any ffmpeg-readable file to the score engine's 44.1 kHz stereo."""
    wav = tmp_dir/f'.{path.stem}.decode.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(path),
                    '-vn', '-ac', '2', '-ar', str(SR), '-c:a', 'pcm_f32le', str(wav)], check=True)
    try:
        samples, rate = sf.read(wav, dtype='float32', always_2d=True)
    finally:
        wav.unlink(missing_ok=True)
    if rate != SR or samples.shape[1] != 2 or not np.isfinite(samples).all():
        raise ValueError(f'unusable decoded audio: {path}')
    return samples


def shape_loop(samples, start, seconds, crossfade):
    """Trim to one loop; fold the tail over the head so the seam does not click."""
    a = int(round(start*SR)); n = int(round(seconds*SR)); xf = int(round(crossfade*SR))
    if a >= len(samples):
        raise ValueError(f'--start {start}s is past the end of the file')
    seg = samples[a:a + n].copy()
    if len(seg) < SR:
        raise ValueError('selection is shorter than one second')
    if 0 < xf < len(seg)//4:
        w = np.linspace(0, 1, xf, dtype=np.float32)[:, None]
        body = seg[xf:].copy()
        body[:xf] = seg[xf:2*xf]*np.sqrt(w) + seg[-xf:]*np.sqrt(1 - w)
        seg = body
    peak = float(np.max(np.abs(seg)))
    if peak > .89:
        seg *= .89/peak
    return np.ascontiguousarray(seg, dtype=np.float32)


def load_index():
    path = OUT/'index.json'
    return path, json.loads(path.read_text())


def save_index(path, index):
    tmp = path.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(index, indent=2) + '\n')
    os.replace(tmp, path)


def backup_once(index):
    """Keep the first pre-import originals; later imports never overwrite them."""
    manifest = BACKUP_DIR/'index-entries.json'
    if manifest.exists():
        return
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    entries = {}
    for f in FACTIONS:
        key = f'music.victory_{f}'
        if key not in index['entries']:
            continue
        entries[key] = index['entries'][key]
        for ext in ('ogg', 'mp3'):
            src = OUT/'music'/f'victory_{f}.{ext}'
            if src.is_file():
                shutil.copy2(src, BACKUP_DIR/src.name)
    manifest.write_text(json.dumps(entries, indent=2) + '\n')


def restore():
    manifest = BACKUP_DIR/'index-entries.json'
    if not manifest.exists():
        print('no local backup found; re-run: music.py --only victory_')
        return 2
    entries = json.loads(manifest.read_text())
    path, index = load_index()
    for f in FACTIONS:
        for ext in ('ogg', 'mp3'):
            src = BACKUP_DIR/f'victory_{f}.{ext}'
            if src.is_file():
                shutil.copy2(src, OUT/'music'/src.name)
        key = f'music.victory_{f}'
        if key in entries:
            index['entries'][key] = entries[key]
    save_index(path, index)
    STATE_FILE.unlink(missing_ok=True)
    print('restored shipped victory originals (local backup kept)')
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--dir', default=str(ROOT/'.local/victory-songs'))
    ap.add_argument('--only', default='', help='comma list, e.g. US,IR')
    ap.add_argument('--start', type=float, default=0.0, help='excerpt start, seconds')
    ap.add_argument('--seconds', type=float, default=60.0, help=f'loop length (max {MAX_SECONDS:g})')
    ap.add_argument('--crossfade', type=float, default=2.0, help='loop seam crossfade, seconds')
    ap.add_argument('--restore', action='store_true')
    args = ap.parse_args()
    if args.restore:
        return restore()
    if not 1 <= args.seconds <= MAX_SECONDS:
        ap.error(f'--seconds must be within 1..{MAX_SECONDS:g}')
    if args.start < 0 or args.crossfade < 0:
        ap.error('--start/--crossfade must be >= 0')
    wanted = [s for s in args.only.split(',') if s] or list(FACTIONS)
    if any(f not in FACTIONS for f in wanted):
        ap.error(f'--only values must be among {FACTIONS}')
    song_dir = Path(args.dir)
    found = {f: find_input(song_dir, f) for f in wanted}
    missing = [f for f in wanted if not found[f]]
    for f in missing:
        print(f'skip {f}: no {f}.mp3 (or {"/".join(EXTS)}) in {song_dir}')
    todo = [(f, found[f]) for f in wanted if found[f]]
    if not todo:
        print('nothing imported. Expected e.g.:')
        for f in FACTIONS:
            print(f'  {song_dir}/{f}.mp3')
        return 2
    index_path, index = load_index()
    backup_once(index)
    state = {}
    if STATE_FILE.exists():
        state = json.loads(STATE_FILE.read_text())
    tmp_dir = OUT/'music'
    tmp_dir.mkdir(parents=True, exist_ok=True)
    for faction, src in todo:
        key = f'music.victory_{faction}'
        old = index['entries'].get(key, {})
        extra = {k: old[k] for k in ('bus', 'loop', 'bpm', 'beats_per_bar', 'priority', 'cooldown_ms') if k in old}
        extra.setdefault('bus', 'music'); extra['loop'] = True
        extra.setdefault('bpm', 100); extra.setdefault('beats_per_bar', 4)
        samples = shape_loop(decode(src, tmp_dir), args.start, args.seconds, args.crossfade)
        index['entries'][key] = fc_music.export(f'victory_{faction}', samples, extra)
        save_index(index_path, index)
        state[faction] = dict(source=src.name, source_sha256=hashlib.sha256(src.read_bytes()).hexdigest(),
                              start=args.start, seconds=args.seconds, crossfade=args.crossfade,
                              duration=len(samples)/SR)
        print(f'{key} <- {src.name} ({len(samples)/SR:.1f}s loop)')
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2) + '\n')
    print('LOCAL ONLY: do not commit or package imported encodings; '
          '--restore brings back the shipped originals.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
