"""Complete isolated aircraft export metadata/pixel checks; no publishing."""
from pathlib import Path
import hashlib,json,math,sys
repo=Path(__file__).resolve().parents[3];base=repo/'work/art/aircraft-final-production-v2';lock=json.loads((base/'production-lock.json').read_text());stage=repo/lock['stage'];sys.path.insert(0,str(stage/'assets/pipeline/tools'));import check_assets
aid=sys.argv[1];assert aid in lock['assets'];specpath=stage/'assets/pipeline/specs'/(aid+'.json');spec=json.loads(specpath.read_text());check_assets.check_spec(str(specpath));record=lambda k,ok,detail='':check_assets.rec(aid,k,ok,detail)
root=stage/'assets/build/sprites'/aid;side=json.loads((root/(aid+'.sprite.json')).read_text());entries={e['id']:e for e in json.loads((stage/'assets/manifest/asset-manifest.json').read_text())['entries']};keys={f"{s['name']}/d{d:02d}_f{f:02d}" for s in spec['states'] for d in range(s['directions']) for f in range(s['frames'])}
record('complete_manifest_contract',spec['states']==entries[aid]['spec']['states']);record('identity_role_radius',side['id']==aid and side['role_id']==spec['role_id'] and side['faction']==spec['faction'] and side['footprint_radius_mt']==600);record('complete_sidecar_states',side['states']==spec['states'] and side['frame_count']==len(keys));record('aliases_overlays',side['aliases']==spec.get('aliases',[]) and side['overlays']==spec.get('overlays',[]));record('trimmed_anchor',all(0<=a<n for a,n in zip(side['anchor_2x'],side['frame_size_2x'])))
raw=json.loads((stage/'assets/build/frames'/aid/'hardpoints.json').read_text());packed=side['hardpoints_2x_rel_anchor'];record('healthbar_present','healthbar' in raw and 'healthbar' in packed)
for name,points in raw.items():
 target=packed.get(name,{});ok=set(points)==keys and set(target)==keys
 for key,xy in target.items():ok=ok and len(xy)==2 and all(math.isfinite(x) for x in xy) and all(abs(x-(points[key][axis]-spec['anchor'][axis]))<=.051 for axis,x in enumerate(xy))
 record('complete_projected_hardpoint_'+name,ok)
blend=stage/'assets/source/blender'/(aid+'.blend');record('editable_blend',blend.exists() and blend.stat().st_size>1024)
for path in ['assets/pipeline/blender/models/aircraft_roster.py',str(specpath.relative_to(stage))]:record('frozen_source_'+path,hashlib.sha256((stage/path).read_bytes()).hexdigest()==lock['sources'][path])
record('isolated_output_root',root.resolve().is_relative_to(base.resolve()) and not root.resolve().is_relative_to((repo/'assets').resolve()))
failed=[x for x in check_assets.results if not x['ok']];memory={}
for scale,layers in side['atlases'].items():
 sizes=[json.loads((root/name).read_text())['meta']['size'] for names in layers.values() for name in names];memory[scale]={'pages':len(sizes),'decoded_mib_inventory_not_resident':round(sum(s['w']*s['h']*4 for s in sizes)/1024**2,2)}
result={'id':aid,'status':'staged candidate only; runtime/Go parking acceptance pending','poses':len(keys),'checks':len(check_assets.results),'failures':len(failed),'results':check_assets.results,'memory_inventory':memory};(base/('check-'+aid+'.json')).write_text(json.dumps(result,indent=2)+'\n');print(aid,len(keys),'poses',len(check_assets.results),'checks',len(failed),'failures');[print(x['check'],x['detail']) for x in failed];raise SystemExit(bool(failed))
