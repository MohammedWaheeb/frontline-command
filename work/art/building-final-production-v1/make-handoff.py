"""Seal a complete private HQ export after explicit native review."""
from pathlib import Path
import hashlib,json,sys,re
B=Path(__file__).resolve().parent;R=B.parents[2];S=B/'stage';F=S/'work/art/building-roster';aid=sys.argv[1];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rel=lambda p:str(p.relative_to(R));dump=lambda p,v:p.write_text(json.dumps(v,indent=2)+'\n')
lock=json.loads((B/'production-lock.json').read_text());assert aid in lock['assets'];assert aid in (F/'completed-assets.txt').read_text().splitlines()
for p,w in lock['sources'].items():assert sha(S/p)==w,p
specpath=S/'assets/pipeline/specs'/f'{aid}.json';spec=json.loads(specpath.read_text());poses=sum(x['directions']*x['frames'] for x in spec['states']);model=S/'assets/pipeline/blender/models/building_roster.py';assert f'FC_RENDER_DONE {aid} poses={poses} 'in(F/f'full-{aid}.log').read_text()
review=B/'contacts'/aid/'native-review.json';native=json.loads(review.read_text());assert native['accepted_bounded_export']
for p,w in native['images'].items():assert sha(R/p)==w
check=F/f'check-{aid}.json';assert json.loads(check.read_text())['failures']==0;target=B/check.name;assert not target.exists();target.write_bytes(check.read_bytes())
uitext=(F/f'ui-check-{aid}.md').read_text();rows=[x for x in uitext.splitlines() if re.fullmatch(r'\| (portraits|icons/build) \| (1x|2x) \| [a-z-]+ \| (PASS|FAIL) \|',x)];assert len(rows)==20 and all(x.endswith('PASS |') for x in rows);dump(B/f'ui-check-{aid}.json',{'id':aid,'checks':20,'failures':0,'rows':rows,'original_sha256':sha(F/f'ui-check-{aid}.md')})
prod=lock;pf=B/'production-lock.json'
if pf.exists():assert json.loads(pf.read_text())==prod
else:dump(pf,prod)
raw=S/'assets/build/frames'/aid;rf=B/f'raw-identity-{aid}.json';assert not rf.exists();dump(rf,{'id':aid,'files':{str(p.relative_to(raw)):sha(p) for p in sorted(raw.rglob('*')) if p.is_file()}})

paths=sorted(p for p in (S/'assets/build/sprites'/aid).iterdir() if p.is_file())+[S/'assets/build/ui'/folder/f'{aid}@{scale}.{layer}.png' for folder in ['portraits','icons/build'] for scale in ['1x','2x'] for layer in ['beauty','team']];files={str(p.relative_to(S/'assets/build')):{'source':rel(p),'sha256':sha(p),'bytes':p.stat().st_size} for p in paths};blend=S/'assets/source/blender'/f'{aid}.blend';assert blend.stat().st_size>1024
receipts=[target,B/f'ui-check-{aid}.json',review,pf,B/'preparation.json',rf]
out=B/'runtime-handoff';out.mkdir(exist_ok=True);p=out/f'{aid}.json';assert not p.exists();dump(p,{'id':aid,'stage':rel(S),'poses':poses,'model':rel(model),'model_sha256':sha(model),'spec':rel(specpath),'spec_sha256':sha(specpath),'editable_blend':rel(blend),'files':files,'receipts':{rel(p):sha(p) for p in receipts},'scope':'Complete private unchanged approved building export; original Codex quota-authored family with recorded prior bounded corrections, source/spec bytes fixed under f69e. Fresh full world/UI export using accepted streaming packer. No live/runtime/final art acceptance.'});print('FC_HQ_FULL_HANDOFF',aid,len(files),sum(v['bytes'] for v in files.values()))
