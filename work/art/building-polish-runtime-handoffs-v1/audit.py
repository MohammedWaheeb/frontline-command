"""Recheck old complete building graphs against their original receipts, no render."""
from pathlib import Path
import hashlib,json,re
B=Path(__file__).resolve().parent;R=B.parents[2];S=R/'work/art/building-polish-production-v2';F=S/'work/art/building-roster'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rel=lambda p:str(p.relative_to(R))
lock=json.loads((F/'production-lock.json').read_text());pub=json.loads((S/'publication.json').read_text());amend=json.loads((F/'source-amendment.json').read_text());assert lock['assets']==pub['assets'] and len(lock['assets'])==7
for name,want in lock['sources'].items():assert sha(S/name)==want,name
proof=R/'work/art/producer-sy-service-apron-fix/isolation.json';assert sha(proof)==amend['proof_sha256'];assert amend['new_model_sha256']==lock['model_sha256']
for name,want in amend['png_sha256'].items():assert sha(S/name)==want,name
publication_verified=0
for row in pub['published']:
 p=S/row['path']
 if 'files'in row:
  actual={str(f.relative_to(p)):sha(f)for f in p.rglob('*')if f.is_file()};assert actual==row['files'],row['path'];publication_verified+=len(actual)
 else:assert sha(p)==row['sha256'],row['path'];publication_verified+=1
rows=[]
for aid in lock['assets']:
 receiptpath=F/f'receipt-{aid}.json';receipt=json.loads(receiptpath.read_text());specpath=S/f'assets/pipeline/specs/{aid}.json';spec=json.loads(specpath.read_text());assert sha(specpath)==receipt['spec_sha256'];poses=sum(s['directions']*s['frames']for s in spec['states']);raw=S/f'assets/build/frames/{aid}'
 for name,want in receipt['raw_sha256'].items():assert sha(raw/name)==want,(aid,name)
 pilot=R/receipt['pilot'];assert sha(pilot/'render.json')==receipt['pilot_render_sha256']and sha(pilot/'check.json')==receipt['pilot_check_sha256'];check=json.loads((F/f'check-{aid}.json').read_text());assert check['failures']==0 and check['poses']==poses
 md=F/f'ui-check-{aid}.md';ui=[line for line in md.read_text().splitlines()if re.fullmatch(r'\| (portraits|icons/build) \| (1x|2x) \| [a-z-]+ \| (PASS|FAIL) \|',line)];assert len(ui)==20 and all(x.endswith('PASS |')for x in ui)
 side=json.loads((S/f'assets/build/sprites/{aid}/{aid}.sprite.json').read_text());assert side['states']==spec['states']and side['frame_count']==poses
 rows.append({'id':aid,'poses':poses,'check_count':check['checks'],'ui_checks':20,'raw_files_pinned_to_original_receipt':len(receipt['raw_sha256']),'original_pixel_source_sha256':receipt['source_sha256'],'equivalent_current_model_sha256':lock['model_sha256'],'model_amendment_applies':aid in amend['unchanged_assets'],'original_receipt':rel(receiptpath),'original_receipt_sha256':sha(receiptpath),'pilot':receipt['pilot'],'pilot_render_sha256':receipt['pilot_render_sha256'],'pilot_check_sha256':receipt['pilot_check_sha256']})
inputs=[F/'production-lock.json',F/'source-amendment.json',S/'publication.json',proof,R/'work/art/producer-go-parking-pilot-v4/native-review.json',R/'work/art/producer-go-parking-pilot-v4/run-v1/check.json'];native=json.loads(inputs[-2].read_text());assert native['accepted']and native['model_sha256']==lock['model_sha256']and native['check_sha256']==sha(inputs[-1])
result={'scope':'Read-only verification of original7 complete staged building exports; no rerender/repack/publication. Every original raw receipt, published export and accepted source amendment rechecked. Fresh native review/handoff still follows.','source_stage':rel(S),'sources':lock['sources'],'rows':rows,'publication_files_verified':publication_verified,'amended_png_files_verified':len(amend['png_sha256']),'inputs':{rel(p):sha(p)for p in inputs},'script_sha256':sha(Path(__file__)),'failures':0};p=B/'audit-v1.json';assert not p.exists();p.write_text(json.dumps(result,indent=2)+'\n');print('FC_HISTORICAL_BUILDING_AUDIT',len(rows),sum(r['poses']for r in rows),publication_verified,'published files; failures0')
