"""Old/corrected mask controls on exact current aircraft and normal UI."""
from pathlib import Path
import hashlib,importlib.util,json,math,sys,time,shutil

HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE));REPO=HERE.parents[2]
lock=json.loads((HERE/'source-lock.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
proof=json.loads((HERE/'controls-v2/check.json').read_text());assert not proof['failures'];assert 'strict_byte_gate' in proof, 'Byte equality is a separate retained result'
modelpath=REPO/'work/art/aircraft-final-readability-v1/candidate-aircraft_roster.py';assert sha(modelpath)==lock['model_sha256']
OUT=HERE/'fresh-controls-v1';assert not OUT.exists();OUT.mkdir()
assets=[('unit.US.airlift',['hover','hover_low_board'],[3,11]),('unit.US.fighter',['fly'],[3,11]),('unit.IR.strike',['fly'],[3,11])]
records=[]
for version in ['before','repeat-before','candidate','repeat-candidate']:

 source_version=version.removeprefix('repeat-')
 libpath=HERE/(source_version+'-fclib.py');assert sha(libpath)==lock[source_version+'_sha256']
 definition=importlib.util.spec_from_file_location('fclib',libpath);lib=importlib.util.module_from_spec(definition);sys.modules['fclib']=lib;definition.loader.exec_module(lib)
 for aid,states,dirs in assets:
  specpath=REPO/'assets/pipeline/specs'/(aid+'.json');spec=json.loads(specpath.read_text())
  source=REPO/'assets/pipeline/blender/models/drone_fixed.py' if aid=='unit.IR.strike' else modelpath
  definition=importlib.util.spec_from_file_location('mask_actual_model',source);model=importlib.util.module_from_spec(definition);definition.loader.exec_module(model)
  lib.reset();lib.setup_camera(*spec['canvas'],spec['anchor']);lib.setup_lights(spec.get('sun_strength',3.3));rig=model.build(spec['faction'],spec.get('params',{}))
  for state_name in states:
   state=next(s for s in spec['states'] if s['name']==state_name)
   for direction in dirs:
    visible,shadow=model.pose(rig,state,0,direction);lib.bpy.context.view_layer.update();key=f'{state_name}/d{direction:02d}_f00'
    paths={layer:str(OUT/version/aid/layer/(key+'.png')) for layer in ['beauty','team','shadow']}
    for p in paths.values():Path(p).parent.mkdir(parents=True,exist_ok=True)
    lib.render_passes(rig,visible,paths,shadow_objs=shadow)
    records.append({'version':version,'id':aid,'key':key,'canvas':spec['canvas'],'spec_sha256':sha(specpath),'model_sha256':sha(source),'files':{layer:sha(Path(p)) for layer,p in paths.items()}})
  if aid=='unit.US.airlift':
   path=REPO/'assets/pipeline/blender/render_ui_shots.py';source=path.read_text();namespace={'__file__':str(path),'__name__':'team_mask_ui'};exec(compile(source[:source.rfind('\nmain()')],str(path),'exec'),namespace)
   lib.reset();lib.setup_camera(64,64,(32,32));lib.setup_lights(spec.get('sun_strength',3.3));rig=model.build(spec['faction'],spec['params']);visible,_=model.pose(rig,{'name':'idle','part':'whole','directions':16,'frames':1},0,0);rig.root.rotation_euler=(0,0,math.radians(-15))
   for name,size in [('portrait',(192,192)),('cameo',(128,96))]:namespace['shoot'](rig,visible,str(OUT/version/aid/'ui'/name),size,name)
(OUT/'render.json').write_text(json.dumps({'sources':lock,'records':records,'normal_ui_camera_unchanged':True},indent=2)+'\n')
print('FC_TEAM_ALPHA_FRESH_CONTROLS_RENDERED',len(records))
