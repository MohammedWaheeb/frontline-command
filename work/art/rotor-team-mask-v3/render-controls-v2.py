"""Stacked transparent planes over team and non-team surfaces."""
from pathlib import Path
import hashlib,importlib.util,json,sys
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE));OUT=HERE/'controls-v2';assert not OUT.exists();OUT.mkdir()
lock=json.loads((HERE/'source-lock.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
cases=[(1,0),(1,.09),(1,.5),(1,1),(4,.09),(8,.09),(4,.5),(8,0)]
records=[]
for version in ['before','failed','candidate']:
 path=HERE/(version+'-fclib.py');key='failed_candidate_sha256' if version=='failed' else version+'_sha256';assert sha(path)==lock[key]
 definition=importlib.util.spec_from_file_location('fclib',path);lib=importlib.util.module_from_spec(definition);sys.modules['fclib']=lib;definition.loader.exec_module(lib)
 for count,alpha in cases:
  name=f'{count}-{alpha}';lib.reset();lib.setup_camera(128,128,(64,64));lib.setup_lights(3.3)
  scene=lib.bpy.context.scene;scene.cycles.seed=17;camera=scene.camera;camera.location=(0,0,6);camera.rotation_euler=(0,0,0);camera.data.ortho_scale=1.5
  root=lib.empty('root');rig=lib.Rig(root)
  team=lib.box('team_base',(.45,.7,.04),loc=(-.25,0,.12),material=lib.mat('control_team','#999999',team=True,grime=0),parent=root,bevel=0)
  plain=lib.box('plain_base',(.45,.7,.04),loc=(.25,0,.12),material=lib.mat('control_plain','#777777',grime=0),parent=root,bevel=0)
  objects=[team,plain];material=lib.mat('occluder','#333333',alpha=alpha,grime=0)
  for n in range(count):
   z=.25+n*.025;mesh=lib.bpy.data.meshes.new('plane');mesh.from_pydata([(-.5,-.35,z),(.5,-.35,z),(.5,.35,z),(-.5,.35,z)],[],[(0,1,2,3)]);mesh.update();o=lib.bpy.data.objects.new('plane',mesh);lib.bpy.context.collection.objects.link(o);o.data.materials.append(material);o.parent=root;objects.append(o)
  paths={layer:str(OUT/version/name/(layer+'.png')) for layer in ['beauty','team','shadow']}
  for p in paths.values():Path(p).parent.mkdir(parents=True,exist_ok=True)
  prior=scene.cycles.transparent_max_bounces;lib.render_passes(rig,objects,paths);assert scene.cycles.transparent_max_bounces==prior==4
  records.append({'version':version,'name':name,'planes':count,'source_alpha':alpha,'restored_limit':prior,'files':{l:sha(Path(p)) for l,p in paths.items()}})
# Inject failure after temporary material/view changes; all input state restores.
if version == 'candidate':
 def snapshot():
  sc=lib.bpy.context.scene
  return {'materials':[(o.name,[slot.material.name if slot.material else None for slot in o.material_slots]) for o in rig.meshes()], 'visibility':[(o.name,o.hide_render,o.visible_camera) for o in rig.meshes()], 'scene':(sc.cycles.samples,sc.cycles.transparent_max_bounces,sc.render.filepath,sc.view_settings.view_transform,sc.view_settings.look,sc.view_settings.exposure,sc.view_settings.gamma,sc.render.image_settings.file_format,sc.render.image_settings.color_mode,sc.render.image_settings.color_depth,rig.ground.hide_render,sc.cycles.use_denoising,sc.render.dither_intensity)}
 paths={'team':str(OUT/'injected-failure-team.png')}
 before=snapshot();original_merge=lib.merge_coverage
 def fail(*args):raise RuntimeError('intentional coverage-write failure')
 lib.merge_coverage=fail
 try:lib.render_passes(rig,objects,paths,layers=('team',))
 except RuntimeError as error:assert str(error)=='intentional coverage-write failure'
 else:raise AssertionError('Injected failure not reached')
 finally:lib.merge_coverage=original_merge
 assert snapshot()==before, 'State leaked after failure'
 records.append({'restoration_error_injection_passed':True})
(OUT/'render.json').write_text(json.dumps({'sources':lock,'records':records},indent=2)+'\n');print('FC_STACKED_MASK_CONTROLS_RENDERED',len(records))
