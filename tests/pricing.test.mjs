import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCurtainsRange, DEFAULT_INPUT } from '../src/features/calculator/model.ts';
import { applyCurrentPricing } from '../server/pricing-content.mjs';

test('owner example uses separate sewing length and piece count for eyelets', () => {
  assert.deepEqual(calculateCurtainsRange(DEFAULT_INPUT), { min: 9900, max: 9900 });
  assert.deepEqual(calculateCurtainsRange({ ...DEFAULT_INPUT, sewingLength: 10 }), { min: 8800, max: 8800 });
  assert.deepEqual(calculateCurtainsRange({ ...DEFAULT_INPUT, width: 4 }), { min: 7700, max: 7700 });
  assert.deepEqual(calculateCurtainsRange({ ...DEFAULT_INPUT, fabric: 9500, mount: 'velcro' }), { min: 62400, max: 335400 });
  assert.deepEqual(calculateCurtainsRange({ ...DEFAULT_INPUT, mount: 'eyelet-tape' }), { min: 10500, max: 10500 });
  assert.deepEqual(calculateCurtainsRange({ ...DEFAULT_INPUT, mount: 'eyelet', eyeletCount: 12 }), { min: 12360, max: 12360 });
  assert.deepEqual(calculateCurtainsRange({ ...DEFAULT_INPUT, sewingLength: 15.5 }), { min: 10010, max: 10010 });
  for (const patch of [{ fabric: 570 }, { sewingLength: -1 }, { sewingLength: NaN }, { sewingLength: Infinity }, { eyeletCount: 1.5 }, { eyeletCount: 0 }]) {
    assert.throws(() => calculateCurtainsRange({ ...DEFAULT_INPUT, ...patch }), RangeError);
  }
});

test('legacy CMS page copy updates without modifying products or original records', () => {
  const original = { pages: [{ path: '/dostavka', html: 'предоплате 50% / предоплате от 50% / предоплата 60–70% / предоплата 60-70% / 400 р. / + 30 р./км.' }], products: [{ price: 400, description: 'предоплата 50%' }] };
  const result = applyCurrentPricing(original);
  assert.equal(result.pages[0].html, 'предоплате 50% / предоплате 50% / предоплата 50% / предоплата 50% / 1 000 р. / + 30 р./км.');
  assert.deepEqual(result.products, original.products);
  assert.ok(original.pages[0].html.includes('50%'));
  assert.deepEqual(applyCurrentPricing(result), result);
});
