"""Render original scripts with a pinned, stock licensed Kokoro model on CPU."""
import argparse
import hashlib
import json
import time
import shutil
from fractions import Fraction
from pathlib import Path
import numpy as np
import torch
from scipy.signal import butter, sosfilt, resample_poly
from huggingface_hub import hf_hub_download
from kokoro import KModel, KPipeline
from common import ROOT, SOURCE, OUT, RATE, VERSION, atomic_json, existing, export, finish, fingerprint
from dialogue import voice_jobs

REPOSITORY='hexgrad/Kokoro-82M'
REVISION='f3ff3571791e39611d31c381e3a41a3af07b4987'
MODEL_SHA='496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4'

def field_radio(samples, job):
    """Dry male delivery, modest pitch weight and parallel radio grit.

    Pitch and formants move together by less than one semitone; the source
    remains an actual male stock voice. No subharmonic/artificial bass layer.
    Keep the original loudness target so this changes character, not volume.
    """
    ratio=Fraction(2**(-job.get('pitch_semitones', 0)/12)).limit_denominator(1000)
    samples=resample_poly(samples,ratio.numerator,ratio.denominator)
    low,high=job.get('eq',(95,5700))
    samples=sosfilt(butter(2,[low,high],btype='bandpass',fs=RATE,output='sos'),samples)
    # Retain chest fundamentals without making the radio muffled; parallel
    # saturation adds upper harmonics while the dry lane retains consonants.
    chest=sosfilt(butter(2,[110,360],btype='bandpass',fs=RATE,output='sos'),samples)
    samples=finish(samples+.28*chest,peak=.85,rms=.19,fade=0)
    grit=np.tanh(samples*4)/np.tanh(4)
    samples=.68*samples+.32*grit
    return finish(samples,peak=.78,rms=.14,fade=.008)

def merge_voice(index, rendered):
    """Replace one exact voice URL; never reconstruct the complete audio index.

    SFX, score, entry metadata and unrendered variants stay byte-for-byte as
    JSON values, including published entries absent from this script roster.
    """
    entry=index['entries'].get(rendered['id'])
    if not entry or entry.get('bus')!='voice':
        raise ValueError('Voice event missing from existing index: '+rendered['id'])
    matches=[v for v in entry['variants'] if v['url']==rendered['url']]
    if len(matches)!=1: raise ValueError('Voice URL missing or ambiguous: '+rendered['url'])
    keys=('duration','bytes','sha256','mp3_url','mp3_bytes','mp3_sha256')
    matches[0].update({key:rendered[key] for key in keys})
    # Captions remain the exact text already shipped with this event.
    return index

def preserve_original(job,index):
    backup=ROOT/'.local/audio-before-rough-20261108'
    backup.mkdir(parents=True,exist_ok=True)
    if not (backup/'index.json').exists(): atomic_json(backup/'index.json',index)
    for suffix in ('.ogg','.mp3'):
        relative=Path(job['path']).with_suffix(suffix)
        source,target=OUT/relative,backup/relative
        if source.exists() and not target.exists():
            target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)

def published_jobs(index):
    """Use the shipped roster and captions, including older mission action IDs.

    Source missions can evolve independently of the published audio package.
    Never delete a shipped line or silently change its spoken caption here.
    """
    authored=voice_jobs();by_url={'/art/audio/'+j['path']:j for j in authored};jobs=[]
    for id,entry in index['entries'].items():
        if entry.get('bus')!='voice': continue
        for number,variant in enumerate(entry['variants'],1):
            job=by_url.get(variant['url'])
            if job is None:
                prefix=id.rsplit('.',2)[0]
                job=next((j for j in authored if j['id'].startswith(prefix+'.')),None)
                if job is None: raise ValueError('No male voice profile for published event: '+id)
            job={**job,'id':id,'path':variant['url'].removeprefix('/art/audio/'),
                 'caption':variant['caption'],'variant':number}
            if 'display_caption' in variant: job['display_caption']=variant['display_caption']
            jobs.append(job)
    # Replace responsive battle lines first; long scenario narration follows.
    return sorted(jobs,key=lambda j:not j['id'].startswith(('vo.unit.','vo.announcer.')))

def setup():
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    torch.manual_seed(24680)
    def get(name):
        return hf_hub_download(REPOSITORY, filename=name, revision=REVISION, cache_dir=ROOT/'.local/audio-models')
    config=get('config.json'); weights=get('kokoro-v1_0.pth')
    if hashlib.sha256(Path(weights).read_bytes()).hexdigest()!=MODEL_SHA:
        raise ValueError('Pinned voice model checksum mismatch')
    model=KModel(repo_id=REPOSITORY,config=config,model=weights).to('cpu').eval()
    pipelines={}
    def render(job):
        language=job['voice'][0]
        if language not in pipelines: pipelines[language]=KPipeline(lang_code=language,repo_id=REPOSITORY,model=model)
        pipeline=pipelines[language]
        voice=get('voices/'+job['voice']+'.pt')
        torch.manual_seed(int(fingerprint(job)[:8],16))
        chunks=[]
        for result in pipeline(job['caption'],voice=voice,speed=job['speed'],split_pattern=r'\n+'):
            if result.audio is None: raise ValueError('Speech generator returned no audio')
            if chunks: chunks.append(np.zeros(int(RATE*.12)))
            chunks.append(result.audio.cpu().numpy())
        if not chunks: raise ValueError('Speech generator returned no chunks')
        samples=np.concatenate(chunks)
        active=np.flatnonzero(np.abs(samples)>.002)
        if len(active)==0: raise ValueError('Silent speech')
        samples=samples[max(0,active[0]-int(RATE*.06)):min(len(samples),active[-1]+int(RATE*.12))]
        return field_radio(samples,job), hashlib.sha256(Path(voice).read_bytes()).hexdigest()
    return render

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--filter',default='');parser.add_argument('--limit',type=int,default=0)
    args=parser.parse_args();index=json.loads((OUT/'index.json').read_text())
    jobs=[j for j in published_jobs(index) if args.filter in j['id']]
    if args.limit: jobs=jobs[:args.limit]
    render=None;done=0;started=time.monotonic()
    pipeline_hash=hashlib.sha256(Path(__file__).read_bytes()+Path(__file__).with_name('common.py').read_bytes()).hexdigest()
    for job in jobs:
        source_hash=fingerprint(dict(job=job,revision=REVISION,pipeline=pipeline_hash,version=VERSION))
        prior=existing(job,source_hash)
        if prior:
            merge_voice(index,prior);atomic_json(OUT/'index.json',index)
            continue
        entry=index['entries'].get(job['id'])
        if not entry or entry.get('bus')!='voice' or sum(v['url']=='/art/audio/'+job['path'] for v in entry['variants'])!=1:
            raise ValueError('Refusing to overwrite unpublished voice: '+job['path'])
        if render is None: render=setup()
        samples,voice_sha=render(job)
        preserve_original(job,index)
        rendered=export(job,samples,source_hash,dict(method='stock synthetic male speech with field-radio processing',model=REPOSITORY,revision=REVISION,
               model_sha256=MODEL_SHA,voice_sha256=voice_sha,license='Apache-2.0',authored_dialogue='Frontline Command original scripts',
               processing=dict(pitch_semitones=job.get('pitch_semitones',0),band_hz=job.get('eq'),chest_band_hz=[110,360],
                               chest_mix=.28,saturation_drive=4,saturation_mix=.32,target_rms=.14,peak_ceiling=.78)))
        merge_voice(index,rendered);atomic_json(OUT/'index.json',index)
        done+=1
        print(json.dumps(dict(clip=job['path'],seconds=round(len(samples)/RATE,2),completed=done,elapsed=round(time.monotonic()-started,1))),flush=True)
    print(f'Preserved {len(index["entries"])} events; generated {done} voice clips.',flush=True)

if __name__=='__main__': main()
