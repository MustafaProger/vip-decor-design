import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const dir='docs/qa-owner-september-16';
const base='http://127.0.0.1:5180';
const browser=await chromium.launch({channel:'chrome'});
const context=await browser.newContext({reducedMotion:'reduce'});
await context.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.abort());
const page=await context.newPage();
const report={checkedAt:new Date().toISOString(),widths:[],checks:[],errors:[]};
page.on('pageerror',error=>report.errors.push(error.message));
const order=['Главная','О компании','Каталог','Отзывы','Блог'];
async function open(path='/') {await page.goto(base+path);await page.locator('main h1').waitFor();await page.locator('.page-loading').waitFor({state:'detached'});}
async function capture(name){await page.screenshot({path:dir+'/'+name+'.png'});}
function check(name,ok,details){report.checks.push({name,ok,details});}
try {
for(const width of [320,390,768,1024,1100,1440,1920]) {
 await page.setViewportSize({width,height:1000});await open();
const header=await page.locator('.site-header').evaluate(e=>({box:e.getBoundingClientRect().toJSON(),overflow:e.scrollWidth>e.clientWidth,links:[...e.querySelectorAll('.desktop-nav a')].map(a=>({text:a.textContent,href:a.getAttribute('href'),active:a.getAttribute('aria-current'),box:a.getBoundingClientRect().toJSON(),style:{borderRadius:getComputedStyle(a).borderRadius,background:getComputedStyle(a).backgroundColor,outline:getComputedStyle(a).outline,boxShadow:getComputedStyle(a).boxShadow}}))}));
 const desktop=await page.locator('.desktop-nav').isVisible();
 check(width+' header order',JSON.stringify(header.links.map(x=>x.text))===JSON.stringify(order));
 check(width+' header no overflow',!header.overflow&&header.box.x>=0&&header.box.right<=width+.5,header.box);
 check(width+' header home active',header.links.filter(x=>x.active==='page').length===1&&header.links[0].active==='page');
 await capture('header-'+width);
 if(!desktop){
  const menu=page.getByRole('button',{name:'Открыть меню'});await menu.click();
  const nav=page.getByRole('navigation',{name:'Мобильная навигация'});
  check(width+' mobile order',JSON.stringify((await nav.locator('a').allTextContents()).slice(0,5))===JSON.stringify(order));
  check(width+' mobile active',await nav.locator('[aria-current="page"]').textContent()==='Главная');
  await capture('header-menu-'+width);
  await page.keyboard.press('Escape');check(width+' escape closes menu',!(await page.locator('.menu-dialog').isVisible()));
  check(width+' focus restored',await menu.evaluate(e=>e===document.activeElement));
  await menu.click();await nav.getByRole('link',{name:'О компании',exact:true}).click();await page.waitForURL(base+'/company');
  check(width+' mobile navigate closes',!(await page.locator('.menu-dialog').isVisible()));
  await menu.click();check(width+' mobile company active',await nav.locator('[aria-current="page"]').textContent()==='О компании');
  await page.getByRole('button',{name:'Закрыть',exact:true}).click();check(width+' button closes',!(await page.locator('.menu-dialog').isVisible()));
  await open();
 }
 await page.locator('.home-help').scrollIntoViewIfNeeded();
 const cta=await page.locator('.home-help').evaluate(e=>({box:e.getBoundingClientRect().toJSON(),overflow:e.scrollWidth>e.clientWidth,text: e.textContent,children:[...e.querySelectorAll('h2,p,a')].map(c=>({text:c.textContent,box:c.getBoundingClientRect().toJSON()})),documentOverflow:document.documentElement.scrollWidth>innerWidth}));
 check(width+' CTA no overflow',!cta.overflow&&!cta.documentOverflow&&cta.children.every(x=>x.box.x>=-.5&&x.box.right<=width+.5));
 await capture('cta-'+width);report.widths.push({width,desktop,header,cta});
}
await page.setViewportSize({width:1440,height:1000});await open();
const company=page.locator('.desktop-nav').getByRole('link',{name:'О компании',exact:true});
await page.locator('.desktop-nav a').first().focus();await page.keyboard.press('Tab');
const focus=await company.evaluate(e=>({focused:e===document.activeElement,outline:getComputedStyle(e).outline,boxShadow:getComputedStyle(e).boxShadow}));
check('desktop keyboard focus visible',focus.focused&&(!focus.outline.startsWith('none')||focus.boxShadow!=='none'),focus);await capture('header-keyboard-focus');
await page.keyboard.press('Enter');await page.waitForURL(base+'/company');await expect(company).toHaveAttribute('aria-current','page');
check('desktop Enter navigation',await page.locator('.desktop-nav [aria-current="page"]').textContent()==='О компании');
await open('/tkani');check('catalog category active',await page.locator('.desktop-nav a[href="/catalog"]').getAttribute('aria-current')==='page');
await open();await page.locator('.home-help').getByRole('link',{name:'Обсудить мой заказ'}).click();await page.waitForURL(base+'/selection');check('CTA selection route',true);
await open();await page.locator('.home-help').getByRole('link',{name:'Контакты и маршрут'}).click();await page.waitForURL(base+'/contacts');check('CTA contacts route',true);
} catch(error){report.errors.push(error.stack);}finally{await writeFile(dir+'/header-cta-report.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({checks:report.checks.length,failed:report.checks.filter(x=>!x.ok),errors:report.errors,widths:report.widths.map(x=>({width:x.width,desktop:x.desktop,ctaHeight:x.cta.box.height}))},null,2));
