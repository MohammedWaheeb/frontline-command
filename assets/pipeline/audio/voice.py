"""Render original scripts with a pinned, stock licensed Kokoro model on CPU."""
import argparse
import hashlib
import json
import time
import urllib.request
from pathlib import Path
import numpy as np
import torch
from scipy.signal import butter, sosfilt
from huggingface_hub import hf_hub_download
from kokoro import KModel, KPipeline
from common import ROOT, SOURCE, RATE, VERSION, atomic_json, existing, export, finish, fingerprint, write_index
from dialogue import write_scripts

REPOSITORY='hexgrad/Kokoro-82M'
REVISION='f3ff3571791e39611d31c381e3a41a3af07b4987'
MODEL_SHA='496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4'

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
        # A restrained radio band with dry articulation; no accent simulation.
        # Per-faction timbre from dialogue.py; older job dicts without 'eq' keep
        # the previous priority-based band.
        low, high = job.get('eq', (130, 7200) if job['priority']>=40 else (220, 5300))
        samples=sosfilt(butter(2,[low,high],btype='bandpass',fs=RATE,output='sos'),samples)
        samples=np.tanh(samples*1.15)/1.15
        return finish(samples,peak=.78,rms=.14,fade=.008), hashlib.sha256(Path(voice).read_bytes()).hexdigest()
    return render

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--filter',default='');parser.add_argument('--limit',type=int,default=0)
    args=parser.parse_args();jobs=[j for j in write_scripts() if args.filter in j['id']]
    if args.limit: jobs=jobs[:args.limit]
    render=None;done=0;started=time.monotonic()
    pipeline_hash=hashlib.sha256(Path(__file__).read_bytes()+Path(__file__).with_name('common.py').read_bytes()).hexdigest()
    for job in jobs:
        source_hash=fingerprint(dict(job=job,revision=REVISION,pipeline=pipeline_hash,version=VERSION))
        if existing(job,source_hash): continue
        if render is None: render=setup()
        samples,voice_sha=render(job)
        export(job,samples,source_hash,dict(method='stock synthetic speech',model=REPOSITORY,revision=REVISION,
               model_sha256=MODEL_SHA,voice_sha256=voice_sha,license='Apache-2.0',authored_dialogue='Frontline Command original scripts'))
        done+=1
        if done%10==0: write_index()
        print(json.dumps(dict(clip=job['path'],seconds=round(len(samples)/RATE,2),completed=done,elapsed=round(time.monotonic()-started,1))),flush=True)
    print(f'Indexed {write_index()} events; generated {done} voice clips.',flush=True)

if __name__=='__main__': main()
