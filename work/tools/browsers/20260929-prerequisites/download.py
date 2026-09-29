from pathlib import Path
import urllib.request,urllib.parse,hashlib,json,datetime
HERE=Path(__file__).resolve().parent
edge=json.loads((HERE/'edge-selected.json').read_text());edgefile=next(a for a in edge['Artifacts'] if a['ArtifactName']=='pkg')
gecko=json.loads((HERE/'geckodriver-release.json').read_text());g=next(a for a in gecko['assets'] if a['name'].endswith('macos-aarch64.tar.gz'))
inputs=[('googlechrome.dmg','https://dl.google.com/chrome/mac/universal/stable/GGRO/googlechrome.dmg',None,None),('MicrosoftEdge-'+edge['ProductVersion']+'.pkg',edgefile['Location'],edgefile['Hash'].lower(),edgefile['SizeInBytes']),('firefox.dmg','https://download.mozilla.org/?product=firefox-latest-ssl&os=osx&lang=en-US',None,None),(g['name'],g['browser_download_url'],g['digest'].split(':')[1],g['size'])]
receipts=[]
for name,url,expected,size in inputs:
 path=HERE/name;assert not path.exists(),f'Preserve existing {path}'
 record={'file':name,'requested_url':url,'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()};receipts.append(record)
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'Frontline-local-browser-prerequisite-audit'})
  h=hashlib.sha256();count=0
  with urllib.request.urlopen(req,timeout=60) as response,path.open('wb') as output:
   final=urllib.parse.urlsplit(response.url)
   if final.hostname=='release-assets.githubusercontent.com':
    final_url=urllib.parse.urlunsplit((final.scheme,final.netloc,final.path,'',''));record['ephemeral_public_cdn_query_omitted']=True
   else:final_url=response.url
   record.update(final_url=final_url,status=response.status,headers={k:v for k,v in response.headers.items() if k.lower() in ('content-type','content-length','last-modified','etag')})
   while chunk:=response.read(1024*1024):output.write(chunk);h.update(chunk);count+=len(chunk)
  record.update(bytes=count,sha256=h.hexdigest(),completed_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),vendor_sha256=expected,vendor_bytes=size)
  if expected:assert expected==h.hexdigest(),'Vendor digest differs'
  if size:assert size==count,'Vendor size differs'
  record['verified']='vendor-sha256' if expected else 'TLS-download-local-digest; signature verification follows'
  print(name,count,h.hexdigest(),flush=True)
 except Exception as e:
  record['error']=repr(e);raise
 finally:(HERE/'downloads.json').write_text(json.dumps(receipts,indent=2)+'\n')
