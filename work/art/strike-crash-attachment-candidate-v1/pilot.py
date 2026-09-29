"""Render bounded candidate crash references only after full evaluated isolation proof."""
from pathlib import Path
import hashlib,importlib.util,json,sys
BASE=Path(__file__).resolve().parent;REPO=BASE.parents[2]
STAGE=REPO/'work/art/aircraft-final-production-v3/stage'
OUT=BASE/'pilot-v1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sys.path.insert(0,str(STAGE/'assets/pipeline/blender'))
import fclib
proof=json.loads((BASE/'proof-v1.json').read_text())
assert proof['failures']==0 and (proof['unchanged_poses'],proof['changed_poses'],proof['reverse_resets'])==(8992,128,9120)
source=BASE/'candidate-aircraft_roster.py'
assert sha(source)==proof['candidate_sha256']
module=importlib.util.spec_from_file_location('frozen_strike',source);model=importlib.util.module_from_spec(module);module.loader.exec_module(model)
assert not OUT.exists(),'Preserve prior diagnostic';OUT.mkdir()
result={'scope':'Candidate crash pilot after full source isolation proof. All128 crash memberships checked;16 selected views rendered. No full production or live promotion.','source':str(source.relative_to(REPO)),'source_sha256':sha(source),'helper_sha256':sha(STAGE/'assets/pipeline/blender/fclib.py'),'script_sha256':sha(Path(__file__)),'assets':[],'failures':0}
try:
 for aid in ['unit.US.strike','unit.SA.strike']:
  specpath=STAGE/'assets/pipeline/specs'/(aid+'.json');spec=json.loads(specpath.read_text())
  fclib.reset();fclib.setup_camera(*spec['canvas'],spec['anchor']);fclib.setup_lights(spec.get('sun_strength',3.3))
  rig=model.build(spec['faction'],spec['params']);state=next(s for s in spec['states'] if s['name']=='crash')
  row={'id':aid,'spec_sha256':sha(specpath),'canvas':spec['canvas'],'anchor':spec['anchor'],'poses':{},'rendered_keys':[]}
  for d in range(state['directions']):
   for f in range(state['frames']):
    visible,shadow=model.pose(rig,state,f,d);fclib.bpy.context.view_layer.update()
    names={o.name for o in visible};shadows={o.name for o in shadow};key=f'crash/d{d:02d}_f{f:02d}'
    assert not {'wing_-1','wing_team_-1','pylon_-1'} & names
    if aid=='unit.US.strike':assert 'tailplane_-1' in names
    assert not {'wing_-1','wing_team_-1','pylon_-1'} & shadows
    row['poses'][key]={'lost_wing_visible':False,'orphan_body_parts':[],'orphan_shadow_parts':[],'tailplane_left_visible':'tailplane_-1' in names}
    if d in [3,7,11,15] and f in [0,3]:
     paths={layer:str(OUT/'frames'/aid/layer/(key+'.png')) for layer in ['beauty','shadow']}
     for path in paths.values():Path(path).parent.mkdir(parents=True,exist_ok=True)
     fclib.render_passes(rig,visible,paths,layers=['beauty','shadow'],shadow_objs=shadow)
     row['rendered_keys'].append(key)
  result['assets'].append(row);print('FC_STRIKE_CRASH_PILOT_ASSET',aid,len(row['poses']),len(row['rendered_keys']),flush=True)
 result['files']={str(p.relative_to(OUT)):sha(p) for p in sorted((OUT/'frames').rglob('*.png'))}
 (OUT/'result.json').write_text(json.dumps(result,indent=2)+'\n')
 print('FC_STRIKE_CRASH_PILOT_DONE',sum(len(a['poses']) for a in result['assets']),flush=True)
except Exception as error:
 result.update(failures=1,error=repr(error));(OUT/'result.json').write_text(json.dumps(result,indent=2)+'\n');raise
