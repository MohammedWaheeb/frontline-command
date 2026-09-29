"""Read-only receipts/PNG integrity summary; never edits rendered pixels."""
import sys,json,hashlib
from pathlib import Path
from PIL import Image
paths=[Path(x) for x in sys.argv[2:]]; records=[]
for path in paths:
 r=json.loads((path/'browser.json').read_text()); files=[]
 for f in sorted(path.glob('*.png')):
  with Image.open(f) as im:
   im.load(); alpha=im.convert('RGBA').getchannel('A'); hist=alpha.histogram()
   files.append({'file':str(f),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'width':im.width,'height':im.height,'alphaZeroPixels':hist[0]})
 records.append({'path':str(path),'receiptSHA256':hashlib.sha256((path/'browser.json').read_bytes()).hexdigest(),'status':r['status'],'functional':r.get('functionalStatus'),'failure':r.get('failure'),'browser':r.get('browserVersion'),'boundaries':len(r['boundaries']),'replayViews':sum(len(x['records']) for x in r['replays']),'qualities':r['identity']['qualities'],'scenarios':r['identity']['scenarios'],'rawFailures':len(r['requestFailures']),'pageConsoleErrors':len(r['errors']),'httpErrors':len(r['httpErrors']),'closedAt':r.get('closedAt'),'inputsVerifiedAfter':r.get('inputsVerifiedAfter'),'cleanup':r.get('cleanup'),'workersAfter':r.get('workersAfter'),'images':files})
Path(sys.argv[1]).write_text(json.dumps({'scope':'Read-only raw receipt and lossless PNG metadata analysis; no image modifications or diagnostic waiver','analysisSourceSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'courses':records},indent=2)+'\n')
print(json.dumps([{k:v for k,v in r.items() if k not in ['cleanup','images']}|{'images':len(r['images']),'imagesWithTransparentPixels':sum(x['alphaZeroPixels']>0 for x in r['images'])} for r in records],indent=2))
