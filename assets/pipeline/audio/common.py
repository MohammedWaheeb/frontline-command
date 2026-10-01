"""Shared exact-byte audio exports. Raw editable sources stay outside the pack."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT/'assets/build/audio'
SOURCE = ROOT/'assets/audio'
RATE = 24000
VERSION = 'frontline-audio/1'

def digest(data): return hashlib.sha256(data).hexdigest()

def fingerprint(value):
    return digest(json.dumps(value, sort_keys=True, separators=(',', ':')).encode())

def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix+f'.{os.getpid()}.tmp')
    temporary.write_text(json.dumps(value, indent=2)+'\n')
    os.replace(temporary, path)

def finish(samples, peak=.78, rms=None, fade=.008):
    samples = np.asarray(samples, dtype=np.float64)
    if len(samples)==0 or not np.isfinite(samples).all(): raise ValueError('Invalid audio signal')
    samples -= np.mean(samples, axis=0)
    if rms is not None:
        actual = float(np.sqrt(np.mean(samples**2)))
        if actual>1e-8: samples *= min(8, rms/actual)
    maximum = float(np.max(np.abs(samples)))
    if maximum>peak: samples *= peak/maximum
    edge = min(int(RATE*fade), len(samples)//2)
    if edge:
        ramp = np.linspace(0, 1, edge)
        if samples.ndim==2: ramp = ramp[:,None]
        samples[:edge] *= ramp
        samples[-edge:] *= ramp[::-1]
    return samples.astype(np.float32)

def existing(job, source_hash):
    meta_path = SOURCE/'renders'/f'{job["path"]}.json'
    try:
        meta=json.loads(meta_path.read_text())
        file=OUT/job['path']
        return meta if (meta['source_hash']==source_hash and meta['sha256']==digest(file.read_bytes())
                        and meta['mp3_sha256']==digest(file.with_suffix('.mp3').read_bytes())) else None
    except (OSError, KeyError, ValueError): return None

def export(job, samples, source_hash, source_info):
    """Preserve float WAV master and encode browser-supported Vorbis+MP3 fallback."""
    OUT.mkdir(parents=True, exist_ok=True)
    raw=SOURCE/'masters'/Path(job['path']).with_suffix('.wav')
    raw.parent.mkdir(parents=True, exist_ok=True)
    sf.write(raw, samples, RATE, subtype='FLOAT')
    file=OUT/job['path']; file.parent.mkdir(parents=True, exist_ok=True)
    temp=file.with_suffix('.tmp.ogg')
    sf.write(temp,samples,RATE,format='OGG',subtype='VORBIS',compression_level=.35)
    os.replace(temp,file)
    # MP3 fallback makes the same offline package usable by older physical Safari.
    mp3=file.with_suffix('.mp3'); temp=mp3.with_suffix('.tmp.mp3')
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(raw),'-c:a','libmp3lame','-b:a','128k','-map_metadata','-1',str(temp)],check=True)
    os.replace(temp,mp3)
    decoded, rate=sf.read(file, dtype='float32', always_2d=True)
    if rate!=RATE or len(decoded)==0 or not np.isfinite(decoded).all(): raise ValueError(f'Invalid export {file}')
    if np.max(np.abs(decoded))>=.995: raise ValueError(f'Encoded clipping {file}')
    rms=float(np.sqrt(np.mean(decoded**2)))
    if rms<.0001: raise ValueError(f'Silent export {file}')
    result={**job,'source_hash':source_hash,'generator':VERSION,'url':'/art/audio/'+job['path'],
            'duration':len(decoded)/rate,'channels':decoded.shape[1], 'bytes':file.stat().st_size,
            'sha256':digest(file.read_bytes()),'mp3_url':'/art/audio/'+str(Path(job['path']).with_suffix('.mp3')),
            'mp3_bytes':mp3.stat().st_size,'mp3_sha256':digest(mp3.read_bytes()),
            'peak':float(np.max(np.abs(decoded))),'rms':rms,'source':source_info}
    atomic_json(SOURCE/'renders'/f'{job["path"]}.json',result)
    return result

def write_index():
    entries={}
    for file in sorted((SOURCE/'renders').rglob('*.json')):
        m=json.loads(file.read_text())
        if not existing(m,m['source_hash']): continue
        entry=entries.setdefault(m['id'], {key:m[key] for key in ('bus','priority','cooldown_ms','loop','bpm','beats_per_bar') if key in m})
        entry.setdefault('variants',[]).append({key:m[key] for key in ('url','caption','display_caption','duration','bytes','sha256','mp3_url','mp3_bytes','mp3_sha256') if key in m})
    atomic_json(OUT/'index.json',dict(format=1,sample_rate=RATE,entries=entries))
    return len(entries)

if __name__=='__main__': print(f'{write_index()} complete audio events indexed')
