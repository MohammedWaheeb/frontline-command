"""Validate actual exported clips and inventory; never stand in for listening QA."""
import argparse
import json
from pathlib import Path
import numpy as np
import soundfile as sf
from common import ROOT, OUT, SOURCE, RATE, digest, atomic_json
from dialogue import voice_jobs
from synthesis import sfx_jobs, music_jobs

def check(partial=False):
    expected=voice_jobs()+sfx_jobs()+music_jobs()
    index=json.loads((OUT/'index.json').read_text())
    assert index['format']==1 and index['sample_rate']==RATE
    expected_paths={job['path']:job for job in expected}
    advertised={v['url'].removeprefix('/art/audio/'): (id,v,entry) for id,entry in index['entries'].items() for v in entry['variants']}
    missing=sorted(set(expected_paths)-set(advertised));extra=sorted(set(advertised)-set(expected_paths))
    errors=[];results=[]
    for rel,(id,variant,entry) in sorted(advertised.items()):
        try:
            job=expected_paths[rel]
            assert id==job['id'] and entry['bus']==job['bus'], 'identity/bus mismatch'
            assert variant.get('caption')==job.get('caption'), 'caption is not the authored script'
            file=OUT/rel;raw=file.read_bytes()
            assert len(raw)==variant['bytes'] and digest(raw)==variant['sha256'], 'Ogg integrity mismatch'
            mp3=OUT/variant['mp3_url'].removeprefix('/art/audio/');rawmp3=mp3.read_bytes()
            assert len(rawmp3)==variant['mp3_bytes'] and digest(rawmp3)==variant['mp3_sha256'], 'MP3 integrity mismatch'
            signal,rate=sf.read(file,always_2d=True,dtype='float32')
            fallback,fallback_rate=sf.read(mp3,always_2d=True,dtype='float32')
            assert rate==RATE and fallback_rate==RATE and signal.shape[1] in (1,2), 'encoding shape'
            assert np.isfinite(signal).all() and np.isfinite(fallback).all(), 'nonfinite signal'
            duration=len(signal)/rate
            assert .03<duration<150 and abs(duration-variant['duration'])<1/rate, 'duration metadata'
            assert abs(len(signal)-len(fallback))<RATE*.06, 'fallback timing drift'
            peak=float(np.max(np.abs(signal)));rms=float(np.sqrt(np.mean(signal**2)))
            assert .0001<rms<.4 and peak<.995, 'headroom or silence'
            master,_=sf.read(SOURCE/'masters'/Path(rel).with_suffix('.wav'),always_2d=True)
            master_rms=float(np.sqrt(np.mean(master**2)))
            assert .7<rms/master_rms<1.3, 'encoding level changed'
            seam=float(np.max(np.abs(master[0]-master[-1])))
            if entry.get('loop'):
                # A loop boundary must behave like an ordinary adjacent sample.
                step=np.max(np.abs(np.diff(master,axis=0)),axis=1)
                assert seam<max(.008,float(np.quantile(step,.995))*1.6), f'loop discontinuity {seam}'
            results.append(dict(path=rel,duration=duration,peak=peak,rms=rms,loop_seam=seam))
        except Exception as exc: errors.append(dict(path=rel,error=str(exc)))
    # All three battle arrangements must align to the same exact sample count.
    by_path={r['path']:r for r in results}
    for faction in ('US','IR','SY','SA'):
        values=[by_path.get(f'music/battle_{faction}_{layer}.ogg') for layer in ('calm','tension','combat')]
        if all(values):
            if len({v['duration'] for v in values})!=1: errors.append(dict(path=f'music/battle_{faction}',error='layer phase drift'))
    report=dict(status='passed' if not errors and not extra and (partial or not missing) else 'failed',
                scope='partial-output' if partial else 'complete-inventory',listening_review='pending',
                expected_clips=len(expected),advertised_clips=len(advertised),events=len(index['entries']),
                missing=missing,extra=extra,errors=errors,clips=results)
    atomic_json(ROOT/'work/evidence/audio/signal-results.json',report)
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--partial',action='store_true');a=p.parse_args()
    result=check(a.partial)
    print(json.dumps({k:v for k,v in result.items() if k not in ('clips','missing')}))
    print(f'Missing: {len(result["missing"])}')
    raise SystemExit(0 if result['status']=='passed' else 1)
