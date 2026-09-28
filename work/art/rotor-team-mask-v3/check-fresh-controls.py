"""Report actual-image repeat differences without weakening strict equality."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image
HERE=Path(__file__).resolve().parent
OUT=HERE/'fresh-controls-v1'
report=json.loads((OUT/'render.json').read_text())
rows=[r for r in report['records'] if r['version']=='before']
comparisons=[]
def delta(a,b):
 a=np.asarray(Image.open(a).convert('RGBA')).astype(np.int16);b=np.asarray(Image.open(b).convert('RGBA')).astype(np.int16)
 d=np.abs(a-b)
 return {'exact':bool(np.array_equal(a,b)),'changed_pixels':int(np.any(d,axis=2).sum()),'max_channel_difference':int(d.max()),'alpha_changed_pixels':int((d[:,:,3]>0).sum())}
def compare(name,key,layer,a,b):
 comparisons.append({'comparison':name,'key':key,'layer':layer,**delta(a,b)})
for row in rows:
 aid,key=row['id'],row['key']
 layers=['beauty','shadow']+(['team'] if aid in ['unit.US.fighter','unit.IR.strike'] else [])
 for layer in layers:
  rel=Path(aid)/layer/(key+'.png')
  for name,a,b in [('original_repeat','before','repeat-before'),('candidate_repeat','candidate','repeat-candidate'),('original_candidate','before','candidate')]:
   compare(name,aid+'/'+key,layer,OUT/a/rel,OUT/b/rel)
  compare('historical_original_fresh_original',aid+'/'+key,layer,HERE/'actual-v1/before'/rel,OUT/'before'/rel)
for name in ['portrait','cameo']:
 rel=Path('unit.US.airlift/ui')/(name+'.beauty.png')
 for kind,a,b in [('original_repeat','before','repeat-before'),('candidate_repeat','candidate','repeat-candidate'),('original_candidate','before','candidate')]:compare(kind,'unit.US.airlift/'+name,'beauty',OUT/a/rel,OUT/b/rel)
 compare('historical_original_fresh_original','unit.US.airlift/'+name,'beauty',HERE/'actual-v1/before'/rel,OUT/'before'/rel)
summary={}
for kind in dict.fromkeys(r['comparison'] for r in comparisons):
 data=[r for r in comparisons if r['comparison']==kind]
 summary[kind]={'images':len(data),'byte_equal':sum(r['exact'] for r in data),'max_changed_pixels':max(r['changed_pixels'] for r in data),'max_channel_difference':max(r['max_channel_difference'] for r in data),'total_changed_pixels':sum(r['changed_pixels'] for r in data)}
result={'source_lock':report['sources'],'comparisons':comparisons,'summary':summary,'strict_byte_gate':'PASS' if all(r['exact'] for r in comparisons) else 'FAIL','tolerance_gate':'Not defined; numeric observations only. Parent review required, no generalized tolerance.'}
target=OUT/'check.json';assert not target.exists();target.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'summary':summary,'strict_byte_gate':result['strict_byte_gate']},indent=2))
