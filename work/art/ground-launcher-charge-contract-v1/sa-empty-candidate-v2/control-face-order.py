"""Diagnose first exact raw-index failure against an unchanged-source repeat."""
from pathlib import Path
script=Path(__file__).resolve().parent/'check-source.py'
exec(compile(script.read_text().split('rows=[];')[0],str(script),'exec'),globals())
sp=R/'assets/pipeline/specs/unit.IR.launcher.json';spec=json.loads(sp.read_text())
def detail(objects):
 return {o.name:{'type':o.type,'parent':o.parent.name if o.parent else None,'vertices':[rounds(v.co) for v in o.data.vertices] if o.type=='MESH' else None,'faces':[(list(p.vertices),int(p.material_index),bool(p.use_smooth)) for p in o.data.polygons] if o.type=='MESH' else None,'materials':[m.name for m in o.data.materials] if o.type=='MESH' else None} for o in objects}

rows=[];first=None;example=None
for i in range(32):
 rig,objects=build(before,spec);raw=detail(objects);canonical={name:{**v,'faces':sorted(v['faces']) if v['faces'] is not None else None} for name,v in raw.items()};current={'geometry':canonical,'materials':mats()}
 if first is None:first=current;first_raw=raw
 assert current==first,('semantic old-source mismatch',i)
 changed=[name for name in raw if raw[name]!=first_raw[name]];rows.append({'iteration':i,'raw_geometry_exact':not changed,'reordered_objects':changed,'semantic_geometry_material_exact':True})
 if changed and example is None:example={name:{'first':first_raw[name]['faces'],'repeat':raw[name]['faces']} for name in changed}
 # Keep original state mutation/recreation sequence in the control.
 for st in spec['states']:
  for d in range(st['directions']):
   for f in range(st['frames']):snap(before,rig,objects,st,d,f)
 print('FC_SA_OLD_SOURCE_CONTROL',i,changed,flush=True)
 if example and i>=3:break
out=B/'old-source-face-order-control-v1.json';assert not out.exists();out.write_text(json.dumps({'scope':'Identical source regenerated after full old pose sequence. Only polygon row ordering is canonicalized; vertex array, oriented face vertex cycles, material indices/smoothing, object structure and all material values remain exact. No numerical tolerance added.','baseline_sha256':sha(BASE/'candidate-vehicle_roster.py'),'spec_sha256':sha(sp),'script_sha256':sha(Path(__file__)),'rows':rows,'raw_order_difference_observed':example is not None,'first_difference':example,'canonical_exact':True},indent=2)+'\n');assert example is not None,'No raw-order difference reproduced in bounded controls';print('FC_SA_OLD_SOURCE_FACE_ORDER_CONTROL_DONE')
