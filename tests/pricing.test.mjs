import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCurtainsRange, DEFAULT_INPUT } from '../src/features/calculator/model.ts';
import { applyCurrentPricing } from '../server/pricing-content.mjs';

test('owner rates produce a range for premium fabrics and keep same-price mounts distinct', () => {
  assert.deepEqual(calculateCurtainsRange(DEFAULT_INPUT), { min: 5800, max: 5800 });
  assert.deepEqual(calculateCurtainsRange({ fabric: 9500, sewing: 220, mount: 'velcro', width: 6 }), { min: 60420, max: 333420 });
  assert.deepEqual(calculateCurtainsRange({ ...DEFAULT_INPUT, mount: 'eyelet-tape' }), { min: 5800, max: 5800 });
  assert.deepEqual(calculateCurtainsRange({ ...DEFAULT_INPUT, mount: 'narrow-tape' }), { min: 5400, max: 5400 });
  assert.throws(() => calculateCurtainsRange({ ...DEFAULT_INPUT, fabric: 570 }), RangeError);
});

test('legacy CMS page copy updates without modifying products or original records', () => {
  const original = { pages: [{ path: '/dostavka', html: 'предоплате 50% / предоплате от 50% / 400 р. / + 30 р./км.' }], products: [{ price: 400, description: 'предоплата 50%' }] };
  const result = applyCurrentPricing(original);
  assert.equal(result.pages[0].html, 'предоплате 60–70% / предоплате 60–70% / 1 000 р. / + 30 р./км.');
  assert.deepEqual(result.products, original.products);
  assert.ok(original.pages[0].html.includes('50%'));
  assert.deepEqual(applyCurrentPricing(result), result);
});
