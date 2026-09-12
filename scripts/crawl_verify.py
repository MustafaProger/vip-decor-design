"""Check that current migration data agrees with captured source responses."""
import json,re
from pathlib import Path
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'src/data/site-content.json').read_text())
raw={}
for f in (ROOT/'data/source/catalog').glob('*.json'):
 for p in json.loads(f.read_text()).get('products',[]):raw[str(p['uid'])]=p
fail=[];checks=0
for p in data['products']:
 r=raw[p['id']]
 for name,a,b in [('title',p['title'],r['title']),('price',p['price'],float(r['price']) if r.get('price') else None),('priceText',p['priceText'],r.get('price','')),('priceProperties',p['variants']['properties'],r.get('properties',[]))]:
  checks+=1
  if a!=b:fail.append({'product':p['id'],'field':name,'error':'Source mismatch'})
 for ed in p['variants']['editions']:
  src=next(e for e in r.get('editions',[]) if e['uid']==ed['uid'])
  for k,v in src.items():
   if k=='img':continue
   checks+=1
   if ed.get(k)!=v:fail.append({'product':p['id'],'edition':ed['uid'],'field':k,'error':'Source edition mismatch'})
 for image in p['images']:
  checks+=1
  if not image.startswith('/source-media/') or not (ROOT/'public'/image.lstrip('/')).is_file():fail.append({'product':p['id'],'image':image,'error':'Missing local product image'})
for p in data['pages']:
 checks+=1
 if not (ROOT/p['snapshot']).is_file():fail.append({'page':p['path'],'error':'Missing source snapshot'})
 for html in [p['html']]+[b['html'] for b in p['blocks']]:
  soup=BeautifulSoup(html,'html.parser')
  for el in soup.find_all(True):
   checks+=1
   if el.name in ['script','style','iframe','object','embed','input','button','form','svg']:fail.append({'page':p['path'],'tag':el.name,'error':'Unsafe tag'})
   if any(a.startswith('on') or a in ['style','src','srcdoc'] for a in el.attrs):fail.append({'page':p['path'],'error':'Unsafe attribute'})
   if el.get('href') and not el['href'].startswith(('https://','http://','mailto:','tel:')):fail.append({'page':p['path'],'error':'Unsafe href'})
 for im in p['images']:
  checks+=1
  if not im['src'].startswith('/source-media/') or not (ROOT/'public'/im['src'].lstrip('/')).is_file():fail.append({'page':p['path'],'error':'Missing local image','image':im['src']})
for g in data['gallery']:
 checks+=1
 if not (ROOT/'public'/g['src'].lstrip('/')).is_file():fail.append({'gallery':g['originalUrl'],'error':'Missing gallery file'})
meta=json.loads((ROOT/'data/source/catalog-inventory.json').read_text())
for c in meta:
 checks+=1
 if c['received']!=c['total']:fail.append({'catalog':c['path'],'expected':c['total'],'received':c['received']})
checks+=1
if len(raw)!=len(data['products']):fail.append({'error':'Unique product count mismatch','raw':len(raw),'ui':len(data['products'])})
result={'checks':checks,'failures':fail,'pages':len(data['pages']),'uniqueProducts':len(data['products']),'galleryImages':len(data['gallery']),'catalogs':len(meta),'sourceErrors':data['sourceErrors']}
(ROOT/'data/source/verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result,ensure_ascii=False,indent=2))
raise SystemExit(1 if fail else 0)
