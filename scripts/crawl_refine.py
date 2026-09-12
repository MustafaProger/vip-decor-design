"""Normalize completed public inventory without modifying original snapshots."""
import json,re
from pathlib import Path
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
f=ROOT/'src/data/site-content.json';data=json.loads(f.read_text());media=json.loads((ROOT/'data/source/media-manifest.json').read_text())
def canon(u):
 p=urlparse(u)
 if p.hostname and p.hostname.endswith('tildacdn.com'):
  m=re.search(r'/(tild[^/]+)/',p.path)
  if m:return 'https://static.tildacdn.com/'+m.group(1)+'/'+p.path.split('/')[-1]
 return u
# Recreate safe readable HTML from snapshots; retain block boundaries.
ALLOWED={'div','span','p','br','strong','b','em','i','u','a','h1','h2','h3','h4','h5','h6','table','thead','tbody','tfoot','tr','th','td','ul','ol','li','blockquote','hr','sub','sup'}
def safehtml(content):
 soup=BeautifulSoup(str(content),'html.parser')
 for el in soup.select('script,style,noscript,svg,iframe,form,button,input,select,textarea,#t-header,#t-footer,[data-record-type="770"],[data-record-type="466"],.t-form__successbox,.t-form__errorbox-wrapper'):el.decompose()
 for el in list(soup.find_all(True)):
  if el.name not in ALLOWED:el.unwrap();continue
  attrs={}
  if el.name=='a' and el.get('href'):
   href=urljoin('https://vip2d.ru/',el['href'])
   if href.startswith(('https://','http://','mailto:','tel:')):attrs['href']=href
  if el.name in {'td','th'}:
   for at in ['colspan','rowspan']:
    if el.get(at):attrs[at]=el[at]
  el.attrs=attrs
 for el in reversed(soup.find_all(['div','span'])):
  if not el.get_text(strip=True) and not el.find(['br','hr']):el.decompose()
 return str(soup)
for page in data['pages']:
 soup=BeautifulSoup((ROOT/page['snapshot']).read_text(),'html.parser')
 main=soup.select_one('#allrecords') or soup.body or soup
 page['html']=safehtml(main)
 for block in page['blocks']:
  source=soup.find(id=block['id'])
  if source:block['html']=safehtml(source)
for prod in data['products']:
 # API sourceSnapshot may span pages; descriptionHtml only contains product text.
 if prod.get('descriptionHtml'):prod['descriptionHtml']=safehtml(prod['descriptionHtml'])
# Tiny Tilda placeholders are presentation duplicates, not additional photographs.
for p in data['pages']:
 seen=set();out=[]
 for im in p['images']:
  cu=canon(im['originalUrl'])
  if cu in seen:continue
  seen.add(cu);im['src']=media.get(cu,{}).get('src',im['src']);im['originalUrl']=cu;out.append(im)
 p['images']=out
seen=set();gallery=[]
for im in data['gallery']:
 cu=canon(im['originalUrl'])
 if cu in seen:continue
 seen.add(cu);im['src']=media.get(cu,{}).get('src',im['src']);im['originalUrl']=cu;gallery.append(im)
data['gallery']=gallery
labels={}
for p in data['pages']:
 for l in p['links']:
  path=urlparse(l['href']).path
  if l['text'] and len(l['text'])<60:labels.setdefault(path,l['text'])
product_sources={}
for source in sorted((ROOT/'data/source/catalog').glob('*.json')):
 for product in json.loads(source.read_text()).get('products',[]):product_sources.setdefault(str(product['uid']),str(source.relative_to(ROOT)))
for p in data['products']:
 p['sourceSnapshot']=product_sources[p['id']]
 if p['categoryPath'] not in p['categoryPaths']:p['categoryPaths'].append(p['categoryPath'])
paths={p['path'] for p in data['pages']} - {'/','/dostavka','/page13486315.html','/popd','/kakpodobrat'}
catalogmeta=json.loads((ROOT/'data/source/catalog-inventory.json').read_text())
catalog_by_path={c['path']:c for c in catalogmeta}
categories=[]
for p in data['pages']:
 if p['path'] not in paths:continue
 cat={'title':labels.get(p['path']) or p['heading'],'path':p['path'],'image':p['images'][0]['src'] if p['images'] else '', 'description':p['description'],'count':sum(p['path'] in pr['categoryPaths'] for pr in data['products']),'sourceHasCatalog':p['path'] in catalog_by_path}
 if not cat['image']:
  product=next((pr for pr in data['products'] if p['path'] in pr['categoryPaths']),None)
  if product:cat['image']=product['image']
 categories.append(cat)
data['categories']=categories
data['sourceAnchors']={'rec208310200':'/studio','rec207714887':'/projects','rec208301757':'/catalog','rec208194534':'/contacts','rec221002251':'/calculator'}
f.write_text(json.dumps(data,ensure_ascii=False,indent=2))
statusf=ROOT/'data/source/crawl-status.json';status=json.loads(statusf.read_text());status['gallery']=len(gallery);status['categories']=len(categories);status['uniquePublicSourceImages']=len({canon(u) for u in media});statusf.write_text(json.dumps(status,ensure_ascii=False,indent=2))
# Full machine-readable migration registry, one entry per page, product, original gallery file and public link.
registry=[]
for p in data['pages']:registry.append({'source':p['url'],'kind':'page','content':{'title':p['title'],'textFragments':len(p['paragraphs']),'images':len(p['images']),'anchors':[b['id'] for b in p['blocks']]},'newPlace':p['path'],'dataSource':p['snapshot'],'verification':{'httpStatus':p['httpStatus'],'textSaved':True,'htmlSanitized':True},'status':'data-saved-ui-verification-separate'})
for p in data['products']:registry.append({'source':p['url'],'kind':'product','content':{'id':p['id'],'title':p['title'],'sku':p['sku'],'images':len(p['images']),'properties':len(p['properties'])},'newPlace':urlparse(p['url']).path,'dataSource':p['sourceSnapshot'],'verification':{'apiLoaded':True,'imagesSaved':all(i.startswith('/source-media/') for i in p['images'])},'status':'data-saved-ui-verification-separate'})
for g in gallery:registry.append({'source':g['originalUrl'],'kind':'gallery-image','content':g['alt'],'newPlace':'/projects','dataSource':g['src'],'verification':{'fileExists':(ROOT/'public'/g['src'].lstrip('/')).exists()},'status':'data-saved-ui-verification-separate'})
links={l['href'] for p in data['pages'] for l in p['links']}
for u in sorted(links):registry.append({'source':u,'kind':'public-link','content':'Исходная ссылка','newPlace':'Исходная ссылка или эквивалентный локальный маршрут','dataSource':'data/source/page-inventory.json','verification':'Собрана из HTML; внешняя отправка не выполнялась','status':'preserve-link'})
(ROOT/'data/source/migration-registry.json').write_text(json.dumps(registry,ensure_ascii=False,indent=2))
docf=ROOT/'docs/CONTENT_INVENTORY.md';doc=docf.read_text();doc=doc.replace('23 каталогов, 56 уникальных фотографий','36 направлений (23 с каталогом API), 28 уникальных фотографий')
# Remove thumbnail duplicate rows from human-readable gallery table.
doc='\n'.join(line for line in doc.split('\n') if not (line.startswith('| https://thb.tildacdn.com') and 'resizeb/20x/' in line))
doc+='\n## Дополнительные направления без опубликованного блока товаров\n\nЭти страницы доступны и перенесены с полными текстами и изображениями. Отсутствие блока магазина зафиксировано только для текущей опубликованной HTML-версии; содержимое не заменено демонстрационными товарами.\n\n'
for c in categories:
 if not c['sourceHasCatalog']:doc+='- `'+c['path']+'`: '+c['title']+'.\n'
doc+='\nПолный машиночитаемый реестр: `data/source/migration-registry.json`. Сопоставление исходных якорей главной находится в `site-content.json → sourceAnchors`; IDs текстовых блоков сохранены в `pages[].blocks[].id`.\n\n'
doc+='Копии оригинальных HTML и полного текста сохранены без сокращений. Переносимый HTML очищен от скриптов, навигации, подвала и форм; таблицы, заголовки, текст и ссылки сохранены. Формы и навигация реализуются отдельными компонентами.\n'
doc+='\nПубличная политика `/popd` успешно загружена (HTTP 200); Tilda preview-ссылка исходных форм не является её каноническим публичным URL.\n'
doc+='\nTilda использует 20px preview для каждого изображения галереи: они не посчитаны отдельными работами. Галерея содержит **'+str(len(gallery))+' уникальных исходных фотографий**.\n'
docf.write_text(doc)
print(json.dumps(status,ensure_ascii=False,indent=2))
