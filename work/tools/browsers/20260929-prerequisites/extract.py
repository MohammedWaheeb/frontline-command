from pathlib import Path
import subprocess,json,plistlib,tarfile,hashlib
HERE=Path(__file__).resolve().parent
APPS=HERE/'apps';APPS.mkdir(exist_ok=True)
record={'scope':'Read-only mounts and task-local extraction; no installer scripts, app executable, browser or WebDriver server/session launched.','commands':[]}
def run(cmd):
 r=subprocess.run(cmd,capture_output=True,text=True);record['commands'].append({'command':cmd,'exit_code':r.returncode,'stdout':r.stdout,'stderr':r.stderr});(HERE/'extraction.json').write_text(json.dumps(record,indent=2)+'\n');assert r.returncode==0,(cmd,r.stderr);return r
for dmg,app in [('googlechrome.dmg','Google Chrome.app'),('firefox.dmg','Firefox.app')]:
 mount=HERE/('mount-'+dmg.split('.')[0]);mount.mkdir();target=APPS/app;assert not target.exists()
 run(['hdiutil','attach','-readonly','-nobrowse','-noautoopen','-mountpoint',str(mount),str(HERE/dmg)])
 try:run(['ditto',str(mount/app),str(target)])
 finally:run(['hdiutil','detach',str(mount)])
 mount.rmdir();print('Extracted',app,flush=True)
pkg=HERE/'MicrosoftEdge-154.0.4258.37.pkg';expanded=HERE/'edge-expanded';assert not expanded.exists()
run(['pkgutil','--check-signature',str(pkg)])
run(['pkgutil','--expand-full',str(pkg),str(expanded)])
found=list(expanded.rglob('Microsoft Edge.app'));assert len(found)==1,found
run(['ditto',str(found[0]),str(APPS/'Microsoft Edge.app')]);record['edge_app_payload']=str(found[0]);print('Extracted Microsoft Edge.app',flush=True)
binpath=HERE/'bin';binpath.mkdir(exist_ok=True)
with tarfile.open(HERE/'geckodriver-v0.37.1-macos-aarch64.tar.gz') as tar:
 members=tar.getmembers();assert len(members)==1 and members[0].name=='geckodriver' and members[0].isfile();tar.extractall(binpath,filter='data')
record['done']=True;(HERE/'extraction.json').write_text(json.dumps(record,indent=2)+'\n');print('Extracted geckodriver',flush=True)
