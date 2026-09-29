"""Run one frozen packer against a read-only source and a new output directory."""
from pathlib import Path
import argparse,hashlib,json,resource,sys,time
HERE=Path(__file__).resolve().parent;REPO=HERE.parents[2]
a=argparse.ArgumentParser();a.add_argument('--helper',choices=['before','candidate'],required=True);a.add_argument('--asset',required=True);a.add_argument('--frames',required=True);a.add_argument('--specs',required=True);a.add_argument('--output',required=True);a.add_argument('--page',type=int,default=2048);args=a.parse_args()
lock=json.loads((HERE/'source-lock.json').read_text())
for rel,w in lock['files'].items():assert hashlib.sha256((REPO/rel).read_bytes()).hexdigest()==w
out=REPO/args.output;assert not out.exists() and out.resolve().is_relative_to(HERE.resolve());out.mkdir(parents=True)
sys.path.insert(0,str(HERE/args.helper));import pack_sprites as pack
pack.FRAMES=str(REPO/args.frames);pack.SPECS=str(REPO/args.specs);pack.SPRITES=str(out);pack.PAGE=args.page
start=time.monotonic();pack.pack_asset(args.asset)
files={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.rglob('*')) if p.is_file()}
report={'asset':args.asset,'helper':args.helper,'outputs':files,'wall_seconds_shared_host':time.monotonic()-start,'peak_rss_bytes_macos':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'page':args.page,'scope':'Measured process memory on this shared host; no quiet timing or general performance claim.'}
(out/'result.json').write_text(json.dumps(report,indent=2)+'\n');print('FC_STREAMING_PACK_DONE',args.asset,len(files))
