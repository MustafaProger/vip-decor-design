import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { productCategoryPaths, primaryProductCategory } from '../src/lib/catalog.ts';
const dir = 'docs/qa-catalog-separation';
await mkdir(dir, { recursive: true });
const data = JSON.parse(await readFile('src/data/site-content.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { routes: [], menus: [], scenarios: [], errors: [] };
const labels = ['Все товары', 'Ткани для штор', 'Тюль', 'Рулонные шторы', 'Жалюзи', 'Карнизы', 'Держатели для штор', 'Кисти для штор', 'Картины'];
try {
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    await context.route('**/*', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    const open = path => page.goto('http://127.0.0.1:5180' + path);
    for (const [path, count, active] of [
      ['/catalog', 477, 'Все товары'],
      ['/catalog?category=%2Fderzhateli-dlya-shtor', 39, 'Держатели для штор'],
      ['/catalog?category=%2Fkisti', 11, 'Кисти для штор'],
      ['/catalog?category=%2Fkartini', 81, 'Картины'],
      ['/derzhateli-dlya-shtor', 39, 'Держатели для штор'],
      ['/kisti', 11, 'Кисти для штор'],
      ['/kartini', 81, 'Картины'],
      ['/tkani', 199, 'Ткани для штор'],
      ['/tyl', 69, 'Тюль'],
      ['/decor', 131, null],
    ]) {
      await open(path);
      await expect(page.locator('.results-meta [role=status]')).toHaveText(`Найдено: ${count}`);
      await expect(page.locator('.category-rail > a')).toHaveText(labels);
      if (active) await expect(page.locator('.category-rail [aria-current=page]')).toHaveText(active);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      for (const href of await page.locator('.product-card a').evaluateAll(as => as.map(a => a.getAttribute('href')).filter(href => href.startsWith('/product/')))) {
        const product = data.products.find(p => p.id === href.slice(9));
        const category = new URL(path, 'http://local').searchParams.get('category') || path;
        if (category !== '/catalog') assert.ok(productCategoryPaths(product).has(category), `${product.title} in ${category}`);
      }
      if (path === '/kartini' && width !== 320) {
        await page.locator('.product-grid').evaluate(async grid => {
          await Promise.all([...grid.querySelectorAll('img')].map(async image => {
            image.loading = 'eager';
            await image.decode();
          }));
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        await page.screenshot({ path: `${dir}/paintings-${width}.png` });
      }
      report.routes.push({ width, path, count });
    }
    await open('/catalog?category=%2Fderzhateli-dlya-shtor');
    await page.getByRole('searchbox').fill('Рама');
    await expect(page.locator('.results-meta [role=status]')).toHaveText('Найдено: 1');
    await page.reload();
    await expect(page.getByRole('searchbox')).toHaveValue('Рама');
    await page.locator('.product-card a').first().click();
    await expect(page.locator('.breadcrumbs')).toContainText('Держатели для штор');
    for (const href of await page.locator('.pd-related .product-card a').evaluateAll(as => as.map(a => a.getAttribute('href')))) {
      assert.equal(primaryProductCategory(data.products.find(p => p.id === href.slice(9))), '/derzhateli-dlya-shtor');
    }
    report.scenarios.push({ width, check: 'Holder search, reload, product breadcrumb and related holders' });
    await open('/');
    await expect(page.locator('.home-direction')).toHaveCount(6);
    await expect(page.locator('.home-directions .missing-image')).toHaveCount(0);
    await page.locator('.home-directions').scrollIntoViewIfNeeded();
    for (const image of await page.locator('.home-directions img').all()) {
      await expect(image).toHaveJSProperty('complete', true);
      assert.ok(await image.evaluate(img => img.naturalWidth > 0));
    }
    const svgImages = await page.locator('.home-directions svg image').evaluateAll(images => images.map(image => image.getAttribute('href')));
    await page.evaluate(async sources => {
      await Promise.all(sources.map(async src => {
        const image = new Image();
        image.src = src;
        await image.decode();
      }));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, svgImages);
    assert.ok(svgImages.length + await page.locator('.home-directions img').count() >= 6);
    if (width !== 320) await page.locator('.home-directions').screenshot({ path: `${dir}/home-categories-${width}.png` });
    if (width < 900) {
      await open('/catalog');
      const trigger = page.getByRole('button', { name: 'Открыть меню' });
      await trigger.click();
      const menu = page.getByRole('dialog', { name: 'Меню', exact: true });
      await expect(menu).toBeVisible();
      const styles = await menu.evaluate(el => {
        const css = getComputedStyle(el), backdrop = getComputedStyle(el, '::backdrop');
        return { background: css.backgroundColor, blur: css.backdropFilter, shadow: css.boxShadow, radius: css.borderRadius, backdropBlur: backdrop.backdropFilter,
          links: [...el.querySelectorAll('nav a')].map(a => { const s = getComputedStyle(a); return { radius: s.borderRadius, shadow: s.boxShadow }; }) };
      });
      assert.equal(styles.background, 'rgb(250, 249, 246)');
      assert.equal(styles.blur, 'none');
      assert.equal(styles.backdropBlur, 'none');
      assert.equal(styles.shadow, 'none');
      assert.ok(styles.links.every(link => link.radius === '0px' && link.shadow === 'none'));
      await expect(menu.locator('[aria-current=page]')).toHaveText('Каталог');
      await page.screenshot({ path: `${dir}/menu-${width}.png` });
      await page.keyboard.press('Escape');
      await expect(menu).not.toBeVisible();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await menu.getByRole('link', { name: 'О компании', exact: true }).click();
      await expect(page).toHaveURL(/\/company$/);
      await expect(menu).not.toBeVisible();
      report.menus.push({ width, styles, keyboardAndNavigation: true });
    }
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.errors.push(error.stack);
} finally {
  await writeFile(`${dir}/report.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log(JSON.stringify({ passed: report.passed, routes: report.routes.length, menus: report.menus.length, scenarios: report.scenarios.length, errors: report.errors }, null, 2));
if (!report.passed) process.exitCode = 1;
