"""Complete frozen building asset coverage, packed runtime contract and provenance."""
from pathlib import Path
import hashlib,json,math,sys
repo=Path(__file__).resolve().parents[3];sys.path.insert(0,str(repo/'assets/pipeline/tools'))
import check_assets
aid=sys.argv[1];out=repo/'work/art/building-roster';spec_path=repo/'assets/pipeline/specs'/(aid+'.json');spec=json.loads(spec_path.read_text());assert spec['model']=='building_roster'
lock=json.loads((out/'production-lock.json').read_text());assert aid in lock['assets']
check_assets.check_spec(str(spec_path));record=lambda name,ok,detail='':check_assets.rec(aid,name,ok,detail)
root=repo/'assets/build/sprites'/aid;side=json.loads((root/(aid+'.sprite.json')).read_text());manifest=json.loads((repo/'assets/manifest/asset-manifest.json').read_text());entry=next(e for e in manifest['entries'] if e['id']==aid)
expected={f"{s['name']}/d{d:02d}_f{f:02d}" for s in spec['states'] for d in range(s['directions']) for f in range(s['frames'])}
record('manifest_states',spec['states']==entry['spec']['states'])
record('footprint_identity',side['id']==aid and side['faction']==spec['faction'] and side['footprint_tiles']==spec['footprint_tiles'])
record('complete_state_metadata',side['states']==spec['states'] and side['frame_count']==len(expected))
record('aliases_overlays',side['aliases']==spec.get('aliases',[]) and side['overlays']==spec.get('overlays',[]))
record('trimmed_anchor',all(0<=a<n for a,n in zip(side['anchor_2x'],side['frame_size_2x'])))
raw=json.loads((repo/'assets/build/frames'/aid/'hardpoints.json').read_text());expected_parts={part:{f"{s['name']}/d{d:02d}_f{f:02d}" for s in spec['states'] if s.get('part','body')==part for d in range(s['directions']) for f in range(s['frames'])} for part in ('building','turret')}
record('healthbar_present','healthbar' in raw and 'healthbar' in side['hardpoints_2x_rel_anchor'])
for name,points in raw.items():
 packed=side['hardpoints_2x_rel_anchor'].get(name,{});desired=expected_parts['turret' if name=='muzzle' else 'building'];ok=set(points)==desired and set(packed)==desired
 for key,point in packed.items():
  ok=ok and len(point)==2 and all(math.isfinite(v) for v in point) and all(abs(v-(points[key][axis]-spec['anchor'][axis]))<=.051 for axis,v in enumerate(point))
 record('hardpoint_'+name,ok)
if expected_parts['turret']:record('turret_shadow_layers',all('shadow' in s.get('layers',[]) for s in spec['states'] if s.get('part')=='turret'))
blend=repo/'assets/source/blender'/(aid+'.blend');record('editable_blend',blend.exists() and blend.stat().st_size>1024)
for p in ['assets/pipeline/blender/models/building_roster.py',str(spec_path.relative_to(repo))]:record('source_hash:'+p,hashlib.sha256((repo/p).read_bytes()).hexdigest()==lock['sources'][p])
memory={}
for scale,layers in side['atlases'].items():
 dims=[json.loads((root/name).read_text())['meta']['size'] for names in layers.values() for name in names]
 memory[scale]={'pages':len(dims),'decoded_mib':round(sum(d['w']*d['h']*4 for d in dims)/1024**2,2)}
failed=[r for r in check_assets.results if not r['ok']];report={'id':aid,'poses':len(expected),'checks':len(check_assets.results),'failures':len(failed),'results':check_assets.results,'memory_inventory_not_resident':memory}
(out/('check-'+aid+'.json')).write_text(json.dumps(report,indent=2)+'\n')
lines=['# '+aid+' production checks','',f"{len(expected)} poses; {report['checks']} checks; {len(failed)} failures.",'','| Check | Result | Detail |','|---|---|---|']+[f"| {r['check']} | {'PASS' if r['ok'] else 'FAIL'} | {r['detail']} |" for r in check_assets.results]
(out/('check-'+aid+'.md')).write_text('\n'.join(lines)+'\n');print(aid,report['checks'],'checks;',len(failed),'failures')
for r in failed:print(r['check'],r['detail'])
raise SystemExit(bool(failed))
