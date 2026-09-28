"""Combine already validated family exports without regenerating their pixels."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil

ap=argparse.ArgumentParser()
ap.add_argument('--out',type=Path,required=True)
ap.add_argument('families',nargs='+',type=Path)
args=ap.parse_args()
args.out.mkdir(parents=True,exist_ok=False)
sha=lambda b:hashlib.sha256(b).hexdigest()
effects={};provenance={};decoded=0
for family in args.families:
    receipt=json.loads((family/'runtime-validation.json').read_text())
    if receipt['status']!='passed':raise RuntimeError('Family validation did not pass')
    raw=(family/'fx/index.json').read_bytes()
    if sha(raw)!=receipt['descriptor']['sha256']:raise RuntimeError('Family index changed')
    source=json.loads((family/'report.json').read_text())
    for eid,desc in json.loads(raw)['effects'].items():
        if eid in effects:raise RuntimeError('Duplicate effect '+eid)
        metadata=(family/desc['url']).read_bytes()
        if sha(metadata)!=desc['sha256'] or len(metadata)!=desc['bytes']:raise RuntimeError('Changed metadata '+eid)
        target=args.out/desc['url'];target.parent.mkdir(parents=True)
        target.write_bytes(metadata)
        document=json.loads(metadata)
        for page in document['pages']:
            data=(family/Path(desc['url']).parent/page['file']).read_bytes()
            if sha(data)!=page['sha256'] or len(data)!=page['bytes']:raise RuntimeError('Changed PNG '+eid)
            (target.parent/page['file']).write_bytes(data)
            decoded+=page['width']*page['height']*4
        effects[eid]=desc
        provenance[eid]={'family':str(family),'family_report_sha256':sha((family/'report.json').read_bytes()),
                         'source_sha256':source['source_sha256']}
index={'format':1,'effects':effects}
(args.out/'fx/index.json').write_text(json.dumps(index,sort_keys=True,separators=(',',':'))+'\n')
(args.out/'provenance.json').write_text(json.dumps({'effects':provenance,'decoded_bytes_if_all_pages_resident':decoded,
    'scope':'Candidate art only, actual full graph validation and gameplay orientation/attachment acceptance remain separate.'},indent=2)+'\n')
print(len(effects),'effects,',decoded,'decoded RGBA bytes')
