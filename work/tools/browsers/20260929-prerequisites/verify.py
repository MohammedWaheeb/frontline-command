from pathlib import Path
import subprocess,json,plistlib,hashlib,datetime
HERE=Path(__file__).resolve().parent
record={'checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'browser_launched':False,'webdriver_server_or_session_started':False,'apps':{}}
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  while b:=f.read(1024*1024):h.update(b)
 return h.hexdigest()
def cmd(argv):
 p=subprocess.run(argv,capture_output=True,text=True);return {'command':argv,'exit_code':p.returncode,'stdout':p.stdout,'stderr':p.stderr}
for name,team in [('Google Chrome.app','EQHXZ8M8AV'),('Microsoft Edge.app','UBF8T346G9'),('Firefox.app','43AQ936H96')]:
 app=HERE/'apps'/name;info=plistlib.loads((app/'Contents/Info.plist').read_bytes());exe=app/'Contents/MacOS'/info['CFBundleExecutable']
 r={'app_path':str(app),'executable':str(exe),'info':{k:info.get(k)for k in ['CFBundleIdentifier','CFBundleShortVersionString','CFBundleVersion','CFBundleExecutable','LSMinimumSystemVersion']},'plist_sha256':sha(app/'Contents/Info.plist'),'executable_sha256':sha(exe),'commands':{}}
 for k,args in [('architectures',['lipo','-archs',str(exe)]),('signature',['codesign','-dv','--verbose=4',str(app)]),('verify',['codesign','--verify','--deep','--strict','--verbose=2',str(app)]),('gatekeeper',['spctl','--assess','--type','execute','--verbose=4',str(app)])]:r['commands'][k]=cmd(args)
 assert 'arm64' in r['commands']['architectures']['stdout']
 assert 'TeamIdentifier='+team in r['commands']['signature']['stderr']
 assert r['commands']['verify']['exit_code']==0
 r['signed_code_files']={}
 for binary in [*app.glob('Contents/Frameworks/*Framework.framework/Versions/*/*Framework'),*app.glob('Contents/MacOS/XUL')]:
  if binary.is_file() and not binary.is_symlink():r['signed_code_files'][str(binary.relative_to(app))]={'bytes':binary.stat().st_size,'sha256':sha(binary)}
 record['apps'][name]=r;(HERE/'verification.json').write_text(json.dumps(record,indent=2)+'\n');print(name,r['info']['CFBundleShortVersionString'],'signature ok','gatekeeper',r['commands']['gatekeeper']['exit_code'],flush=True)
gecko=HERE/'bin/geckodriver';record['geckodriver']={'path':str(gecko),'sha256':sha(gecko),'architecture':cmd(['lipo','-archs',str(gecko)]),'signature':cmd(['codesign','-dv','--verbose=4',str(gecko)]),'verify':cmd(['codesign','--verify','--strict','--verbose=2',str(gecko)]),'version':cmd([str(gecko),'--version'])}
(HERE/'verification.json').write_text(json.dumps(record,indent=2)+'\n');print('geckodriver',record['geckodriver']['version']['stdout'],flush=True)
