"""Diagnose first exact raw-index failure against an unchanged-source repeat."""
from pathlib import Path
script=Path(__file__).resolve().parent/'check-source.py'
exec(compile(script.read_text().split('rows=[];')[0],str(script),'exec'),globals())
def detail(objects):
 return {o.name:{'type':o.type,'parent':o.parent.name if o.parent else None,'vertices':[rounds(v.co) for v in o.data.vertices] if o.type=='MESH' else None,'faces':[(list(p.vertices),int(p.material_index),bool(p.use_smooth)) for p in o.data.polygons] if o.type=='MESH' else None,'materials':[m.name for m in o.data.materials] if o.type=='MESH' else None} for o in objects}

rows=[]
for aid in ['unit.IR.aa','unit.IR.apc','unit.IR.artillery']:
 spec=json.loads((R/'assets/pipeline/specs'/f'{aid}.json').read_text());poses=[(st,d,f) for st in spec['states'] for d in range(st['directions']) for f in range(st['frames'])];all=[]
 for label,module in [('baseline',before),('candidate',after)]:
  rig,objects=build(module,spec);all.append({'label':label,'geometry':detail(objects),'materials':mats()})
  for st,d,f in poses:snap(module,rig,objects,st,d,f)
  if label=='candidate':
   for st,d,f in reversed(poses):snap(module,rig,objects,st,d,f)
 a,b=all
 if aid=='unit.IR.artillery':
  rig,objects=build(before,spec);all.append({'label':'baseline_repeat','geometry':detail(objects),'materials':mats()})
 for b in all[1:]:
  diff={name:{k:{'old':a['geometry'][name].get(k),'new':v} for k,v in g.items() if a['geometry'][name].get(k)!=v} for name,g in b['geometry'].items() if a['geometry'].get(name)!=g}
  rows.append({'id':aid,'left':a['label'],'right':b['label'],'geometry_differences':diff,'material_differences':{k:{'old':a['materials'].get(k),'new':v} for k,v in b['materials'].items() if a['materials'].get(k)!=v}})
  print(aid,b['label'],'objects',[(k,list(v)) for k,v in diff.items()],'materials',list(rows[-1]['material_differences']),flush=True)
out=B/'source-diagnostic-v2.json';assert not out.exists();out.write_text(json.dumps({'scope':'Repeat original sequence through first failed asset, including all pose calls. Raw-index gate remains separately preserved.','script_sha256':sha(Path(__file__)),'comparisons':rows},indent=2)+'\n');print('FC_SA_SEQUENCE_DIAGNOSTIC_DONE')
