"""Diagnose first exact raw-index failure against an unchanged-source repeat."""
from pathlib import Path
script=Path(__file__).resolve().parent/'check-source.py'
exec(compile(script.read_text().split('rows=[];')[0],str(script),'exec'),globals())
sp=R/'assets/pipeline/specs/unit.IR.artillery.json';spec=json.loads(sp.read_text())
def detail(objects):
 return {o.name:{'type':o.type,'parent':o.parent.name if o.parent else None,'vertices':[rounds(v.co) for v in o.data.vertices] if o.type=='MESH' else None,'faces':[(list(p.vertices),int(p.material_index),bool(p.use_smooth)) for p in o.data.polygons] if o.type=='MESH' else None,'materials':[m.name for m in o.data.materials] if o.type=='MESH' else None} for o in objects}
all=[]
for label,module in [('baseline1',before),('baseline2',before),('candidate',after)]:
 rig,objects=build(module,spec);all.append({'label':label,'geometry':detail(objects),'materials':mats()})
comparisons=[]
for row in all[1:]:
 a,b=all[0],row;diff={name:{k:{'old':a['geometry'][name].get(k),'new':v} for k,v in g.items() if a['geometry'][name].get(k)!=v} for name,g in b['geometry'].items() if a['geometry'].get(name)!=g}
 comparisons.append({'left':a['label'],'right':b['label'],'geometry_differences':diff,'material_differences':{k:{'old':a['materials'].get(k),'new':v} for k,v in b['materials'].items() if a['materials'].get(k)!=v}})
out=B/'source-diagnostic-v1.json';assert not out.exists();out.write_text(json.dumps({'scope':'Diagnostic only. Original raw-index exact source gate remains failed.','script_sha256':sha(Path(__file__)),'spec_sha256':sha(sp),'comparisons':comparisons},indent=2)+'\n')
for c in comparisons:print(c['right'],'objects',[(k,list(v)) for k,v in c['geometry_differences'].items()],'materials',list(c['material_differences']))
print('FC_SA_RAW_INDEX_DIAGNOSTIC_DONE')
