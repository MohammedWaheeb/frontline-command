"""Audited one-time Mac metadata migration; never render or modify PNG/raw bytes."""
from pathlib import Path
import copy,ctypes,hashlib,json,os,shutil,sys,tempfile
import numpy as np
from PIL import Image
REPO=Path(__file__).resolve().parents[3];HERE=Path(__file__).resolve().parent;RUN=HERE/'promotion-v1'
sys.path.insert(0,str(REPO/'assets/pipeline/tools'));from sprite_ink_bounds import add_ink_bounds
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
HELPER='cda9670317a57b3d0693777978fa049b6e2ef035c120f5c1920aa0b8de05048e'
assert sha(REPO/'assets/pipeline/tools/sprite_ink_bounds.py')==HELPER
ROOTS={'shipping':REPO,'stage-v2':REPO/'work/art/aircraft-production/stage-v2'}
def content(directory,aid):
 h=hashlib.sha256()
 for path in sorted(directory.iterdir(),key=lambda p:p.name):
  if path.name==aid+'.sprite.json':continue
  assert path.is_file() and not path.is_symlink(),path
  h.update(path.name.encode()+path.read_bytes())
 return h.hexdigest()
def raw_inventory():
 result={}
 for root in ROOTS.values():
  for path in sorted((root/'assets/build/frames').rglob('*')):
   if path.is_file() and path.suffix=='.png':result[str(path.relative_to(REPO))]=sha(path)
 return result

def audit(directory,original):
 side=json.loads((directory/(directory.name+'.sprite.json')).read_text());checks=0
 assert content(directory,directory.name)==side['content_sha256']
 oldside=json.loads((original/(directory.name+'.sprite.json')).read_text());x=copy.deepcopy(side);x['content_sha256']=oldside['content_sha256'];assert x==oldside
 for scale,layers in side['atlases'].items():
  own={};body={};desc={}
  for layer,names in layers.items():
   for name in names:
    d=json.loads((directory/name).read_text());desc[name]=d
    old=json.loads((original/name).read_text());stripped=copy.deepcopy(d);stripped['meta'].pop('ink_bounds_policy')
    for frame in stripped['frames'].values():frame.pop('ink_bounds')
    assert stripped==old,(directory.name,name,'old fields')
    assert sha(directory/d['meta']['image'])==sha(original/d['meta']['image'])
    with Image.open(directory/d['meta']['image']) as im:alpha=np.array(im.getchannel('A'))
    for key,frame in d['frames'].items():
     r=frame['frame'];a=alpha[r['y']:r['y']+r['h'],r['x']:r['x']+r['w']];yy,xx=np.where(a>=1)
     box=None if not len(xx) else (int(xx.min()),int(yy.min()),int(xx.max())+1,int(yy.max())+1)
     own[layer,key]=box
     if layer in ('beauty','team'):
      prior=body.get(key)
      if box:body[key]=box if prior is None else (min(box[0],prior[0]),min(box[1],prior[1]),max(box[2],prior[2]),max(box[3],prior[3]))
  for layer,names in layers.items():
   for name in names:
    for key,frame in desc[name]['frames'].items():
     box=body.get(key) if layer in ('beauty','team') else own.get((layer,key));expected=None if box is None else dict(zip(('x','y','w','h'),(box[0],box[1],box[2]-box[0],box[3]-box[1])))
     assert frame['ink_bounds']==expected,(directory.name,name,key);checks+=1
 return checks

def exchange(a,b):
 # Mac renamex_np RENAME_SWAP performs one atomic directory exchange. Prove
 # actual behavior on disposable directories before any publication below.
 fn=ctypes.CDLL(None,use_errno=True).renamex_np;fn.argtypes=(ctypes.c_char_p,ctypes.c_char_p,ctypes.c_uint);fn.restype=ctypes.c_int
 if fn(os.fsencode(a),os.fsencode(b),2):raise OSError(ctypes.get_errno(),os.strerror(ctypes.get_errno()))

mode=sys.argv[1]
if mode=='prepare':
 assert not (RUN/'prepared.json').exists() and not (RUN/'prepared').exists()
 (RUN/'raw-before.json').write_text(json.dumps(raw_inventory(),indent=1)+'\n');rows=[]
 for label,root in ROOTS.items():
  for sidepath in sorted((root/'assets/build/sprites').glob('*/*.sprite.json')):
   aid=sidepath.parent.name;original=sidepath.parent;side=json.loads(sidepath.read_text());assert content(original,aid)==side['content_sha256'],(label,aid,'preexisting content hash')
   dest=RUN/'prepared'/label/aid;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copytree(original,dest)
   before={p.name:sha(p) for p in original.iterdir()};n=add_ink_bounds(dest,side['atlases']);side['content_sha256']=content(dest,aid);(dest/sidepath.name).write_text(json.dumps(side,indent=1))
   checks=audit(dest,original);assert checks==n
   rows.append({'label':label,'id':aid,'live':str(original.relative_to(REPO)),'prepared':str(dest.relative_to(REPO)),'before_sha256':before,'after_sha256':{p.name:sha(p) for p in dest.iterdir()},'frame_bounds_checked':checks})
   print('FC_INK_PRIVATE_ASSET',label,aid,checks,flush=True)
 report={'helper_sha256':HELPER,'assets':rows,'asset_count':len(rows),'frame_bounds_checked':sum(r['frame_bounds_checked'] for r in rows),'publication':'not yet performed','method':'Atomic whole-directory swap after source hashes checked; PNG bytes identical; old entire export retained in prepared path after swap.'}
 (RUN/'prepared.json').write_text(json.dumps(report,indent=1)+'\n');print('FC_INK_PREPARED',len(rows),report['frame_bounds_checked'],flush=True)
elif mode=='publish':
 assert not (RUN/'published.json').exists()
 report=json.loads((RUN/'prepared.json').read_text())
 # Fully validate all source/staged content before any visible publication.
 for row in report['assets']:
  live=REPO/row['live'];staged=REPO/row['prepared']
  assert {p.name:sha(p) for p in live.iterdir()}==row['before_sha256'],row['id']
  assert {p.name:sha(p) for p in staged.iterdir()}==row['after_sha256'],row['id']
 with tempfile.TemporaryDirectory(dir=RUN) as tmp:
  a=Path(tmp)/'a';b=Path(tmp)/'b';a.mkdir();b.mkdir();(a/'old').write_text('old');(b/'new').write_text('new');exchange(a,b);assert (a/'new').read_text()=='new' and (b/'old').read_text()=='old'
 completed=[]
 try:
  for row in report['assets']:
   exchange(REPO/row['live'],REPO/row['prepared']);completed.append(row)
 except BaseException:
  for row in reversed(completed):exchange(REPO/row['live'],REPO/row['prepared'])
  raise
 for row in report['assets']:
  live=REPO/row['live'];old=REPO/row['prepared'];assert {p.name:sha(p) for p in live.iterdir()}==row['after_sha256'];assert {p.name:sha(p) for p in old.iterdir()}==row['before_sha256']
  assert audit(live,old)==row['frame_bounds_checked']
 after=raw_inventory();before=json.loads((RUN/'raw-before.json').read_text());assert after==before
 report['publication']='complete';report['raw_png_sha_exact']=len(after);report['all_previous_fields_exact_except_content_sha256']=True;report['all_packed_png_sha_exact']=True;report['atomic_directory_swap_control_passed']=True
 (RUN/'published.json').write_text(json.dumps(report,indent=1)+'\n');print('FC_INK_PUBLISHED',len(completed),report['frame_bounds_checked'],len(after),flush=True)
else:raise ValueError(mode)
