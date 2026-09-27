# Requires the isolated synthetic fixture described in expanded-report.md.
# Never point this probe at production or a shared development database.
import http.client,json,re
from pathlib import Path
from html.parser import HTMLParser
root=Path(__file__).resolve().parents[3]
manifest=json.loads((root/'.next/server/server-reference-manifest.json').read_text())
actions={v.get('exportedName'):k for k,v in manifest['node'].items()}
rows=[]
def request(path,method='GET',data=None,headers=None):
 c=http.client.HTTPConnection('127.0.0.1',43187,timeout=30)
 c.request(method,path,data,headers or {}); r=c.getresponse(); b=r.read().decode(); h=dict(r.getheaders()); s=r.status;c.close();return s,h,b
class Scripts(HTMLParser):
 def __init__(self):super().__init__();self.scripts=[]
 def handle_starttag(self,tag,attrs):
  if tag=='script':self.scripts.append(dict(attrs))
nonces=[]
for path in ['/privacy','/privacy','/signin','/docs']:
 s,h,b=request(path);csp=h.get('content-security-policy','');match=re.search("'nonce-([^']+)'",csp);nonce=match.group(1) if match else None
 p=Scripts();p.feed(b);executable=[a for a in p.scripts if a.get('type','') not in ['application/ld+json','application/json']]
 ok=s==200 and nonce and "'strict-dynamic'" in csp and "script-src" in csp and "'unsafe-eval'" not in csp and all(a.get('nonce')==nonce for a in executable)
 rows.append({'case':'production-csp:'+path,'status':s,'executableScripts':len(executable),'allScriptNoncesMatch':all(a.get('nonce')==nonce for a in executable),'pass':bool(ok)})
 nonces.append(nonce)
rows.append({'case':'nonce-uniqueness','pass':len(set(nonces))==len(nonces)})
for path in ['/.env.local','/.git/config','/prisma/schema.prisma','/docs/%2e%2e/%2e%2e/.env.local']:
 s,h,b=request(path);rows.append({'case':'private-file:'+path,'status':s,'pass':s==404})
payloads={'loadPublishPreview':{'slug':'audit-a'},'loadSourceDetail':{'slug':'audit-a','surfaceSlug':'web'},'loadMoreTranslationKeys':{'slug':'audit-a','surfaceSlug':'web','query':{},'cursor':'tampered'},'previewTranslationRevert':{'slug':'audit-a','surfaceSlug':'web','keyId':'key-a'},'acceptInvitation':{'token':'synthetic-invalid'}}
for name,payload in payloads.items():
 for user in [None,'owner-b']:
  if name=='acceptInvitation' and user:continue
  headers={'next-action':actions[name],'content-type':'text/plain;charset=UTF-8','origin':'http://127.0.0.1:43187'}
  if user:headers['cookie']='authjs.session-token=security-audit-'+user
  s,h,b=request('/projects/audit-a/settings','POST',json.dumps([payload]),headers)
  marker='unauthorized' if user is None else 'not-found'
  rows.append({'case':name+(' anonymous' if not user else ' foreign project'),'status':s,'expectedRejection':marker,'pass':('"'+marker+'"') in b})
# Positive control proves the authenticated source reader works on the same server.
headers={'next-action':actions['loadSourceDetail'],'content-type':'text/plain;charset=UTF-8','origin':'http://127.0.0.1:43187','cookie':'authjs.session-token=security-audit-owner-b'}
s,h,b=request('/projects/audit-b/sources','POST',json.dumps([{'slug':'audit-b','surfaceSlug':'web'}]),headers)
rows.append({'case':'source-detail-own-project-positive-control','status':s,'pass':'"ok":true' in b})
for row in rows:print(json.dumps(row))
raise SystemExit(0 if all(row['pass'] for row in rows) else 1)
