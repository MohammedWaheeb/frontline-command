"""Fresh private UI derivatives, exact source graph; no live or old-stage writes."""
from pathlib import Path
import hashlib,json,sys,shutil
import numpy as np
from PIL import Image
B=Path(__file__).resolve().parent;R=B.parents[2];helper=R/'work/art/us-rifle-style-candidate-v1/production-v1/stage/assets/pipeline/tools/pack_sprites.py';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();assert sha(helper)=='18a933faed0eb64a273ec273428047942fbb4b95f6a97d66a3d45375a366848a';sys.path.insert(0,str(helper.parent));from pack_sprites import normalise,downsample_premultiplied
catalog=R/'work/art/roster-runtime-overlay-v1/catalog-v53-v1/result.json';oldpath=B/'normalized-roster-v2/result.json';old={x['destination']:x for x in json.loads(oldpath.read_text())['files']};out=B/'normalized-current53-v1';assert not out.exists();out.mkdir();protected={};rows=[];failures=[];handoffs=[]
for row in json.loads(catalog.read_text())['assets']:
 hp=R/row['handoff'];assert sha(hp)==row['handoff_sha256'];h=json.loads(hp.read_text());handoffs.append({'id':h['id'],'path':row['handoff'],'sha256':row['handoff_sha256']})
 for rel in [h.get('model')or h['reviewed_source'],h.get('spec')or f"{h['stage']}/assets/pipeline/specs/{h['id']}.json",h.get('editable_blend')or f"{h['stage']}/assets/source/blender/{h['id']}.blend"]:protected[rel]=sha(R/rel)
 for dest,record in h['files'].items():assert sha(R/record['source'])==record['sha256'];protected[record['source']]=record['sha256']
 for dest,record in h['files'].items():
  if not dest.startswith('ui/')or not dest.endswith('@2x.team.png'):continue
  norm=normalise('team',Image.open(R/record['source']).convert('RGBA'))
  for scale,arr in [('2x',norm.clip(0,255).astype(np.uint8)),('1x',downsample_premultiplied(norm,2))]:
   key=dest.replace('@2x.',f'@{scale}.');source=h['files'][key];original=R/source['source'];before=np.asarray(Image.open(original).convert('RGBA'));assert arr.shape==before.shape;candidate=out/'candidate'/key;candidate.parent.mkdir(parents=True,exist_ok=True);prior=old.get(key);reuse=bool(prior and prior['original_sha256']==source['sha256'])
   if reuse:
    oldcandidate=R/prior['candidate'];assert sha(oldcandidate)==prior['candidate_sha256'];assert np.array_equal(np.asarray(Image.open(oldcandidate).convert('RGBA')),arr);shutil.copy2(oldcandidate,candidate)
   else:Image.fromarray(arr,'RGBA').save(candidate,optimize=True)
   origcopy=out/'original'/key;origcopy.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(original,origcopy);assert sha(origcopy)==source['sha256']
   alpha=int(np.count_nonzero(before[:,:,3]!=arr[:,:,3]));coverage=int(np.count_nonzero((before[:,:,3]>0)!=(arr[:,:,3]>0)));gray=int(np.count_nonzero((arr[:,:,0]!=arr[:,:,1])|(arr[:,:,1]!=arr[:,:,2])));r={'id':h['id'],'destination':key,'original_source':source['source'],'original_sha256':source['sha256'],'candidate':str(candidate.relative_to(R)),'candidate_sha256':sha(candidate),'reused_exact_prior_derivative':reuse,'prior_candidate':prior['candidate']if reuse else None,'alpha_changed_pixels':alpha,'coverage_changed_pixels':coverage,'non_gray_pixels':gray,'changed_rgb_pixels':int(np.count_nonzero(np.any(before[:,:,:3]!=arr[:,:,:3],axis=2))),'dimensions':[arr.shape[1],arr.shape[0]]};rows.append(r)
   if alpha or coverage or gray:failures.append(r)
for rel,want in protected.items():assert sha(R/rel)==want,rel
assert len(rows)==212
report={'scope':'Private current53 UI-mask candidates only. Same previously reviewed world normalization and exact frozen18a downsample helper.132 old compatible derivatives are copied verbatim;80 new/replacement masks derived. All models/world/beauty/original masks remain exact. No shipping/publication or new browser/visual acceptance.','catalog_sha256':sha(catalog),'old_candidate_receipt_sha256':sha(oldpath),'helper':str(helper.relative_to(R)),'helper_sha256':sha(helper),'script_sha256':sha(Path(__file__)),'handoffs':handoffs,'files':rows,'failures':failures,'protected_original_files_exact':len(protected),'protected_original_sha256':protected};(out/'result.json').write_text(json.dumps(report,indent=2)+'\n');assert not failures,[(x['id'],x['destination'])for x in failures];print('FC_CURRENT_UI_MASK_CANDIDATE',len(rows),'masks',sum(r['reused_exact_prior_derivative']for r in rows),'exact reuse',len(protected),'originals unchanged')
