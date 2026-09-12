#!/usr/bin/env python3
"""Read-only public-site inventory. Does not submit forms or create orders."""
import concurrent.futures as futures
import hashlib, json, re, time, warnings
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote
import requests
from bs4 import BeautifulSoup
warnings.filterwarnings('ignore')
ROOT=Path(__file__).resolve().parents[1]
BASE='https://vip2d.ru'
RAW=ROOT/'data/source'
MEDIA=ROOT/'public/source-media'
for p in [RAW/'pages',RAW/'catalog',MEDIA,ROOT/'src/data',ROOT/'docs']:p.mkdir(parents=True,exist_ok=True)
errors=[]
headers={'User-Agent':'Mozilla/5.0 (compatible; VIPDecorDesign-content-migration/1.0)','Referer':BASE+'/'}
def get(url):
 for n in range(3):
  try:
   r=requests.get(url,headers=headers,timeout=40);r.raise_for_status();return r
  except Exception:
   if n==2:raise
   time.sleep(n+1)
def savejson(path,obj):path.write_text(json.dumps(obj,ensure_ascii=False,indent=2))
def clean(s):return re.sub(r'\s+',' ',s or '').strip()
def txt(s):return clean(BeautifulSoup(s or '', 'html.parser').get_text(' ',strip=True))
def jparse(s,default):
 try:return json.loads(s) if isinstance(s,str) else s or default
 except Exception:return default
def key(path):return path.strip('/').replace('/','__') or 'index'
def validmedia(u):return bool(u and re.search(r'\.(?:jpe?g|png|webp|gif|svg|avif)(?:\?|$)',u,re.I) and 'mc.yandex' not in u)
def images(soup):
 arr=[];seen=set()
 for el in soup.select('[data-original],[data-content-cover-bg],img,[style]'):
  vals=[el.get('data-original'),el.get('data-content-cover-bg')]
  if el.name=='img':vals += [el.get('src')]
  vals += re.findall(r'url\([\'\"]?([^\)\'\"]+)',el.get('style',''))
  for u in vals:
   if not validmedia(u):continue
   u=urljoin(BASE,u)
   if '/resize/20x/' in u or u in seen:continue
   if u.startswith('data:'):continue
   seen.add(u);arr.append({'src':u,'alt':clean(el.get('alt') or el.get('data-img-zoom-descr') or ''),'originalUrl':u})
 return arr
ALLOWED={'div','span','p','br','strong','b','em','i','u','a','h1','h2','h3','h4','h5','h6','table','thead','tbody','tfoot','tr','th','td','ul','ol','li','blockquote','hr','sub','sup'}
def sanitize(content):
 cp=BeautifulSoup(str(content),'html.parser')
 for el in cp.select('script,style,noscript,svg,iframe,form,button,input,select,textarea,#t-header,#t-footer,[data-record-type="770"],[data-record-type="466"]'):el.decompose()
 for el in list(cp.find_all(True)):
  if el.name not in ALLOWED:el.unwrap();continue
  keep={}
  if el.name=='a' and el.get('href'):
   href=urljoin(BASE+'/',el['href'])
   if href.startswith(('https://','http://','mailto:','tel:')):keep['href']=href
  if el.name in {'td','th'}:
   for at in ['colspan','rowspan']:
    if el.get(at):keep[at]=el[at]
  el.attrs=keep
 return str(cp)
def crawl_page(url):
 path=urlparse(url).path or '/'
 try:
  r=get(url);r.encoding='utf-8';html=r.text
  (RAW/'pages'/f'{key(path)}.html').write_text(html)
  soup=BeautifulSoup(html,'html.parser')
  for el in soup.select('script,style,noscript'):el.decompose()
  (RAW/'pages'/f'{key(path)}.txt').write_text(soup.get_text('\n',strip=True))
  main=soup.select_one('#allrecords') or soup.body or soup
  all_links=[];seen=set()
  for a in soup.select('a[href]'):
   href=urljoin(url,a['href']);text=clean(a.get_text(' ',strip=True))
   if (href,text) in seen or href.startswith('javascript:'):continue
   seen.add((href,text));all_links.append({'href':href,'text':text})
  blocks=[]
  for rec in main.select(':scope > .t-rec'):
   if rec.get('data-record-type') in ['770','466','706','651']:continue
   bs=BeautifulSoup(str(rec),'html.parser')
   for el in bs.select('form,script,style,noscript,.t-form__successbox,.t-form__errorbox-wrapper'):el.decompose()
   lines=[clean(x) for x in bs.get_text('\n',strip=True).split('\n')];lines=list(dict.fromkeys(x for x in lines if x))
   if lines:blocks.append({'id':rec.get('id'),'type':rec.get('data-record-type'),'heading':next((clean(h.get_text(' ',strip=True)) for h in bs.select('h1,h2,h3,.t-title') if clean(h.get_text(' ',strip=True))),lines[0]),'paragraphs':lines,'html':sanitize(bs)})
  for el in main.select('#t-header,#t-footer,[data-record-type="770"],[data-record-type="466"],form,.t-form__successbox,.t-form__errorbox-wrapper'):el.decompose()
  lines=[clean(x) for x in main.get_text('\n',strip=True).split('\n')]
  title=clean(soup.title.get_text()) if soup.title else path
  desc=soup.select_one('meta[name="description"]')
  heading=next((clean(x.get_text(' ',strip=True)) for x in main.select('h1') if clean(x.get_text(' ',strip=True))),title)
  stores=[]
  for m in re.finditer(r"storepart:\s*['\"](\d+)['\"]",html):
   after=html[m.end():m.end()+6000];rec=re.search(r"t_store_init\(['\"](\d+)",after)
   if rec:stores.append({'part':m.group(1),'recid':rec.group(1),'path':path})
  imgs=images(main)
  galleries=[]
  for el in main.select('[data-record-type="603"],[data-record-type="604"],[data-record-type="407"]'):galleries += images(el)
  page={'path':path,'url':url,'title':title,'description':desc.get('content','') if desc else '', 'heading':heading,'paragraphs':list(dict.fromkeys(x for x in lines if x)),'images':imgs,'links':all_links,'html':sanitize(main),'blocks':blocks,'httpStatus':r.status_code,'snapshot':f'data/source/pages/{key(path)}.html','stores':stores,'gallery':galleries}
  print(f'PAGE {path}: {len(imgs)} images, {len(stores)} catalogs',flush=True)
  return page
 except Exception as e:
  errors.append({'url':url,'error':str(e),'kind':'page'});print(f'FAIL PAGE {url} {e}',flush=True);return None
sitemap=get(BASE+'/sitemap.xml').text;(RAW/'sitemap.xml').write_text(sitemap)
urls=set(re.findall(r'<loc>(.*?)</loc>',sitemap))|{BASE+'/page13486315.html',BASE+'/popd'}
pages=[];visited=set()
while urls-visited:
 batch=sorted(urls-visited);visited.update(batch)
 with futures.ThreadPoolExecutor(max_workers=6) as pool:
  for p in pool.map(crawl_page,batch):
   if not p:continue
   pages.append(p)
   for link in p['links']:
    u=urlparse(link['href']);path=u.path.rstrip('/') or '/'
    if u.hostname in ['vip2d.ru','www.vip2d.ru'] and not u.query and not re.search(r'\.(?:jpg|png|pdf|zip|svg|webp)$',path,re.I) and '/tproduct/' not in path:urls.add(BASE+path)
savejson(RAW/'page-inventory.json',pages)
# Save full paginated Tilda API responses, including options, prices and editions.
def crawl_store(store):
 prods=[];slic=1;seen=set();meta={}
 try:
  while slic and slic not in seen:
   seen.add(slic)
   endpoint=f'https://store.tildaapi.com/api/getproductslist/?storepartuid={store["part"]}&recid={store["recid"]}&getparts=true&getoptions=true&size=100&flag_root=withroot&slice={slic}'
   payload=get(endpoint).json();savejson(RAW/'catalog'/f'{store["part"]}-{slic}.json',payload)
   prods+=payload.get('products',[]);meta=payload;slic=payload.get('nextslice')
  result={**store,'total':meta.get('total',len(prods)),'received':len(prods),'products':prods,'filters':meta.get('filters',{}),'options':meta.get('options',[]),'partlinks':meta.get('partlinks',[])}
  print(f'CATALOG {store["path"]}: {len(prods)}/{result["total"]}',flush=True)
  if result['received']!=result['total']:errors.append({'kind':'catalog-count','path':store['path'],'expected':result['total'],'actual':len(prods)})
  return result
 except Exception as e:
  errors.append({'kind':'catalog','path':store['path'],'error':str(e)});print(f'FAIL CATALOG {store["path"]} {e}',flush=True);return {**store,'total':None,'received':len(prods),'products':prods}
stores=[];parts=set()
for p in pages:
 for s in p['stores']:
  if s['part'] not in parts:parts.add(s['part']);stores.append(s)
with futures.ThreadPoolExecutor(max_workers=4) as pool:catalogs=list(pool.map(crawl_store,stores))
savejson(RAW/'catalog-inventory.json',[{k:v for k,v in c.items() if k!='products'} for c in catalogs])
products={}
for catalog in catalogs:
 for p in catalog['products']:
  pid=str(p['uid']);gallery=jparse(p.get('gallery'),[]);options=jparse(p.get('json_options'),[])
  ims=[x.get('img','').replace('\\/','/') for x in gallery if x.get('img')]
  ims+= [e['img'] for e in p.get('editions',[]) if e.get('img')]
  category_path=(urlparse(p.get('url','')).path.split('/tproduct/')[0] or catalog['path'])
  properties=[{'name':x.get('title',''),'value':', '.join(x['values']) if isinstance(x.get('values'),list) else str(x.get('value',x.get('values','')))} for x in p.get('characteristics',[])+options]
  if pid not in products:
   editions=p.get('editions',[])
   products[pid]={'id':pid,'title':p['title'],'description':txt(p.get('text') or p.get('descr')),'shortDescription':txt(p.get('descr')),'descriptionHtml':sanitize(BeautifulSoup(p.get('text') or '', 'html.parser')),'price':float(p['price']) if p.get('price') else None,'priceText':p.get('price',''),'oldPrice':p.get('priceold',''),'sku':p.get('sku') or (editions[0].get('sku','') if editions else ''),'image':ims[0] if ims else '', 'images':list(dict.fromkeys(ims)),'url':p.get('url',''),'category':txt(p.get('descr')) or category_path.strip('/'),'categoryPath':category_path,'categoryPaths':[catalog['path']],'properties':properties,'variants':{'editions':editions,'properties':p.get('properties',[]),'options':options,'rawPrice':p.get('price'),'quantity':p.get('quantity'),'unit':p.get('unit'),'portion':p.get('portion')},'sourceSnapshot':f'data/source/catalog/{catalog["part"]}-1.json'}
  elif catalog['path'] not in products[pid]['categoryPaths']:products[pid]['categoryPaths'].append(catalog['path'])
products=list(products.values())
pages.sort(key=lambda p:(p['path']!='/','/tproduct/' in p['path'],p['path']))
# Preserve source navigation labels for categories.
labels={}
for p in pages:
 for l in p['links']:
  if l['text'] and len(l['text'])<60:labels.setdefault(urlparse(l['href']).path,l['text'])
category_paths=set(c['path'] for c in catalogs)
categories=[{'title':labels.get(p['path']) or p['heading'],'path':p['path'],'image':p['images'][0]['src'] if p['images'] else '', 'description':p['description'],'count':sum(p['path'] in pr['categoryPaths'] for pr in products)} for p in pages if p['path'] in category_paths]
gallery=[];seen=set()
for p in pages:
 for im in p.pop('gallery',[]):
  if im['originalUrl'] not in seen:seen.add(im['originalUrl']);gallery.append({'src':im['src'],'alt':im['alt'] or 'Текстильное оформление VIP Decor Design','sourcePath':p['path'],'originalUrl':im['originalUrl']})
contacts={'phones':['+7 495 969 31 89','+7 969 035 98 89','+7 903 969 31 89'],'email':'info@vip2d.ru','address':'Москва, Сокольническая площадь 4А, 2 этаж, пав. 226','socials':[{'title':'Telegram','url':'https://t.me/vipdecordesign'},{'title':'Instagram','url':'https://www.instagram.com/vip2d.ru/'},{'title':'Facebook','url':'https://www.facebook.com/vipdecordesign/?modal=admin_todo_tour'}]}
content={'crawledAt':datetime.now(timezone.utc).isoformat(),'pages':pages,'products':products,'categories':categories,'contacts':contacts,'gallery':gallery,'sourceErrors':errors}
savejson(ROOT/'src/data/site-content.json',content)
print(f'DATA WRITTEN: {len(pages)} pages, {len(products)} products, {len(categories)} categories, {len(gallery)} gallery images',flush=True)
# Download only public images belonging to inventoried pages/products.
mediaurls=set()
for p in pages:
 mediaurls.update(i['src'] for i in p['images'])
for p in products:mediaurls.update(p['images'])
mediaurls.update(i['src'] for i in gallery)
def download(u):
 ext=Path(urlparse(u).path).suffix.lower();ext=ext if ext in ['.png','.jpg','.jpeg','.gif','.svg','.webp','.avif'] else '.jpg'
 filename=hashlib.sha256(u.encode()).hexdigest()[:18]+ext;out=MEDIA/filename
 try:
  if not out.exists():out.write_bytes(get(u).content)
  if out.stat().st_size<30:raise ValueError('Empty media response')
  return u,{'src':'/source-media/'+filename,'originalUrl':u,'bytes':out.stat().st_size}
 except Exception as e:errors.append({'kind':'media','url':u,'error':str(e)});return u,{'src':u,'originalUrl':u,'error':str(e)}
media={}
with futures.ThreadPoolExecutor(max_workers=8) as pool:
 for i,(u,m) in enumerate(pool.map(download,sorted(mediaurls))):
  media[u]=m
  if i%25==0:print(f'MEDIA {i+1}/{len(mediaurls)}',flush=True)
savejson(RAW/'media-manifest.json',media)
for p in pages:
 for im in p['images']:im['src']=media.get(im['src'],{}).get('src',im['src'])
for p in products:
 p['image']=media.get(p['image'],{}).get('src',p['image']);p['images']=[media.get(u,{}).get('src',u) for u in p['images']]
 for ed in p['variants']['editions']:
  if ed.get('img'):ed['originalImg']=ed['img'];ed['img']=media.get(ed['img'],{}).get('src',ed['img'])
for c in categories:c['image']=media.get(c['image'],{}).get('src',c['image'])
for im in gallery:im['src']=media.get(im['src'],{}).get('src',im['src'])
content['sourceErrors']=errors
savejson(ROOT/'src/data/site-content.json',content)
savejson(RAW/'crawl-status.json',{'finishedAt':datetime.now(timezone.utc).isoformat(),'pages':len(pages),'products':len(products),'categories':len(categories),'gallery':len(gallery),'media':len(media),'mediaBytes':sum(m.get('bytes',0) for m in media.values()),'errors':errors})
# Migration register includes every public source page and every unique product.
rows=['# Реестр публичного содержимого VIP Decor Design','','Источник: https://vip2d.ru/. Дата выгрузки: '+content['crawledAt']+'.','',f'Получено {len(pages)} HTML-страниц, {len(products)} уникальных товаров, {len(categories)} каталогов, {len(gallery)} уникальных фотографий исходной галереи и {len(media)} файлов изображений.','', 'Реестр описывает загрузку исходных данных. Статус «данные сохранены» не означает проверенную работу интерфейса, отправки форм, оплаты или публикацию. Проверки интерфейса и интеграций ведутся отдельно.','','## Страницы','','| Исходный URL/элемент | Содержание | Новое место | Источник | Проверка | Статус |','|---|---|---|---|---|---|']
for p in pages:
 rows.append(f'| {p["url"]} | {p["title"].replace("|","/")}; {len(p["paragraphs"])} текстовых фрагментов; {len(p["images"])} фото | `{p["path"]}` | `{p["snapshot"]}` + полный `.txt` + `site-content.json` | HTTP {p["httpStatus"]}, извлечение текста и метаданных | Данные сохранены; UI проверяется отдельно |')
rows+=['','## Каталоги и пагинация','','| Исходный каталог | Tilda part | Получено / опубликовано API | Источник | Статус |','|---|---|---|---|---|']
for c in catalogs:rows.append(f'| {c["path"]} | {c["part"]} | {c["received"]} / {c["total"]} | `data/source/catalog/{c["part"]}-*.json` | '+('Количество совпало' if c['received']==c['total'] else 'Требуется проверка')+' |')
rows+=['','## Все уникальные товары','','Сохранены исходные описания, HTML описания, характеристики, артикулы, цены, изображения, варианты/надбавки. Исходные числовые расхождения не исправлялись.','','| Исходный URL / ID | Товар | Новое место | Источник | Проверка | Статус |','|---|---|---|---|---|---|']
for p in products:rows.append(f'| {p["url"] or p["id"]} | {p["title"].replace("|","/")} | `{urlparse(p["url"]).path}` | `{p["sourceSnapshot"]}`; UID `{p["id"]}` | API-данные + фото | Данные сохранены; UI проверяется отдельно |')
rows+=['','## Галерея','','| Исходный файл | Новое место | Источник | Проверка | Статус |','|---|---|---|---|---|']
for im in gallery:rows.append(f'| {im["originalUrl"]} | `{im["src"]}` | Главная, исходный блок галереи | Файл загружен | Данные сохранены |')
rows+=['','## Зафиксированные условия и ограничения','','- На главной опубликованы одновременно «Более 5000 тканей в наличии» и «10 000 тканей в наличии». Оба исходных утверждения сохранены; актуальность не подтверждена.','- Стаж 21 год, пошив от 3 дней, гарантия 1 год, цены пошива, предоплата от 50% и доставка от 400 рублей сохранены как опубликованные условия источника; не пересчитаны и не подтверждены владельцем.','- Публичная политика формы ведёт на `https://tilda.cc/page/?pageid=14057880&previewmode=yes`; публичная ссылка в подвале `/popd` проверяется отдельно.','- Логика калькулятора, формы Tilda, корзина/оплата и внешние сервисы исследуются отдельным реестром интеграций. Этот сборщик не отправляет формы и не совершает заказов.','','## Ошибки источника/загрузки','']
rows += [f'- `{json.dumps(e,ensure_ascii=False)}`' for e in errors] or ['Ошибок HTTP/пагинации/скачивания изображений не зафиксировано.']
(ROOT/'docs/CONTENT_INVENTORY.md').write_text('\n'.join(rows)+'\n')
print(json.dumps({'pages':len(pages),'products':len(products),'gallery':len(gallery),'media':len(media),'errors':errors},ensure_ascii=False),flush=True)
