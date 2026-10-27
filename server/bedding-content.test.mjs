import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanPublicContent, cleanPublicBlog } from './content-retirement.mjs';
const bedding = /постел|одеял|подуш|покрывал|плед|наволоч|простын|пододеяль|балдахин/i;

test('legacy CMS descriptions are cleaned without mutating records or commercial data', () => {
  const original = { products: [{ id: '1', title: 'Кисть', price: 2500, variants: { quantity: 2 }, description: 'Для светильников, подушек, покрывал, балдахинов.', descriptionHtml: '<p>Для светильников, подушек, покрывал, балдахинов.</p>' }], gallery: [{src:'/source-media/bdf7eaa4894d2a9641.webp'}, {src:'/source-media/74a4c8d1c28498b376.webp'}] };
  const snapshot = structuredClone(original);
  const result = cleanPublicContent(original);
  assert.equal(result.products[0].description, 'Для светильников.');
  assert.equal(result.products[0].descriptionHtml, '<p>Для светильников.</p>');
  assert.equal(result.products[0].price, 2500);
  assert.deepEqual(result.products[0].variants, {quantity:2});
  assert.equal(result.gallery.length, 1);
  assert.deepEqual(original, snapshot);
  assert.deepEqual(cleanPublicContent(result), result);
});

test('published source catalog has no bedding references and keeps all 477 products', () => {
  const source = JSON.parse(readFileSync(new URL('../src/data/site-content.json', import.meta.url)));
  const result = cleanPublicContent(source);
  assert.equal(result.products.length, 477);
  assert.doesNotMatch(JSON.stringify(result), bedding);
});

test('blog cleanup includes category descriptions, tables and metadata', () => {
  const source = {posts:[{slug:'living',category:'interior',title:'Текстиль для маленькой гостиной: шторы, подушки и свободное место',sections:[{table:{rows:[['Однотонные шторы и подушку одного из цветов обивки']]}}]}],categories:[{slug:'interior',description:'Как сочетать оформление окна, покрывала и подушки.'}]};
  const snapshot=structuredClone(source);
  assert.doesNotMatch(JSON.stringify(cleanPublicBlog(source)),bedding);
  assert.deepEqual(source,snapshot);
});

test('off-topic reviews are hidden intact without altering Yandex totals and ratings', async () => {
  const {cleanBeddingReviews}=await import('./bedding-content.mjs');
  const source={reviewCount:2,rating:4.9,reviews:[{id:'1',excerpt:'Заказывала шторы и покрывало.'},{id:'2',excerpt:'Красивые шторы.'}]};
  const snapshot=structuredClone(source);
  const result=cleanBeddingReviews(source);
  assert.deepEqual(result.reviews,[source.reviews[1]]);
  assert.equal(result.reviewCount,2);
  assert.equal(result.rating,4.9);
  assert.equal(result.publishedReviewCount,1);
  assert.deepEqual(source,snapshot);
});
