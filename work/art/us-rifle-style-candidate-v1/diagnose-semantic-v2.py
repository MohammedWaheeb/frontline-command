"""Unchanged-source repeat diagnostic; preserve original strict comparisons."""
from pathlib import Path
p=Path(__file__).resolve().parent/'check-source-semantic.py'
s=p.read_text().split('\nrows=[]')[0].replace('geometry=digest([','geometry=([').replace('signatures[key]=digest(value)','signatures[key]=value').replace('==signatures[f"','==digest(signatures[f"').replace("_f{f:02d}\"],(spec['id']","_f{f:02d}\"]),(spec['id']")
exec(compile(s,str(p),'exec'),globals())
spec=json.loads((S/'assets/pipeline/specs/unit.IR.at.json').read_text());snapshots=[]
for name,module in [('baseline-a',control),('baseline-b',control),('candidate-a',family)]:
 snapshots.append({'label':name,'value':run(module,spec)});print('FC_RIFLE_DIAG_CAPTURE',name,flush=True)
def differences(a,b,path=''):
 if type(a)!=type(b):return [{'path':path,'old':a,'new':b}]
 if isinstance(a,dict):
  result=[]
  for key in sorted(set(a)|set(b)):
   if key not in a or key not in b:result.append({'path':path+'/'+str(key),'old':a.get(key),'new':b.get(key)})
   else:result+=differences(a[key],b[key],path+'/'+str(key))
  return result
 if isinstance(a,(list,tuple)):
  if len(a)!=len(b):return [{'path':path,'old_length':len(a),'new_length':len(b)}]
  return [v for i,(x,y) in enumerate(zip(a,b)) for v in differences(x,y,path+'/'+str(i))]
 return [] if a==b else [{'path':path,'old':a,'new':b}]
comparisons=[{'left':snapshots[0]['label'],'right':v['label'],'differences':differences(snapshots[0]['value'],v['value'])} for v in snapshots[1:]]
out=B/'source-semantic-diagnostic-v2.json';assert not out.exists();out.write_text(json.dumps({'scope':'Unchanged-source repeat and exact candidate diagnostic only. No failed gate waived.','script_sha256':sha(Path(__file__)),'source_sha256':sha(S/'assets/pipeline/blender/models/infantry_roster.py'),'comparisons':comparisons},indent=2)+'\n')
for row in comparisons:print(row['right'],len(row['differences']),row['differences'][:8],flush=True)
print('FC_RIFLE_SEMANTIC_DIAGNOSTIC_DONE',flush=True)
