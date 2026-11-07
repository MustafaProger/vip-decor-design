import test from "node:test";
import assert from "node:assert/strict";
import {
  contactGoal,
  initializeMetrika,
  reachGoal,
  trackAcceptedInquiry,
} from "../src/lib/metrika.ts";

test("production counter initializes once and queues goals until the library loads", (t) => {
  const scripts = [];
  globalThis.window = {
    location: { hostname: "vip2d.ru", pathname: "/contacts" },
  };
  globalThis.document = {
    createElement: () => ({}),
    head: { appendChild: (script) => scripts.push(script) },
  };
  t.after(() => {
    delete globalThis.window;
    delete globalThis.document;
  });
  initializeMetrika();
  initializeMetrika();
  assert.equal(scripts.length, 1);
  assert.deepEqual(scripts[0], {
    async: true,
    src: "https://mc.yandex.ru/metrika/tag.js",
  });
  assert.deepEqual(window.ym.a, [[67314823, "init", {}]]);
  reachGoal("click_phone");
  assert.deepEqual(window.ym.a[1], [67314823, "reachGoal", "click_phone"]);
});

test("loader leaves previews, admin pages and an existing counter untouched", (t) => {
  t.after(() => {
    delete globalThis.window;
    delete globalThis.document;
  });
  globalThis.document = {
    createElement() {
      throw new Error("Must not load a second counter");
    },
  };
  for (const location of [
    { hostname: "localhost", pathname: "/" },
    { hostname: "vip2d.ru", pathname: "/admin" },
    { hostname: "vip2d.ru", pathname: "/admin/inquiries" },
  ]) {
    globalThis.window = { location };
    initializeMetrika();
    assert.equal(window.ym, undefined);
  }
  const existing = () => {
    throw new Error("Must not initialize again");
  };
  globalThis.window = {
    location: { hostname: "vip2d.ru", pathname: "/" },
    ym: existing,
  };
  initializeMetrika();
  assert.equal(window.ym, existing);
});

test("contact goals recognize contact URLs, not lookalike hosts or embedded URLs", () => {
  for (const [href, goal] of [
    ["tel:+74959693189", "click_phone"],
    ["TEL:+74959693189", "click_phone"],
    ["mailto:studio@example.com?subject=Project", "click_email"],
    ["https://wa.me/79690359889", "click_whatsapp"],
    ["https://api.whatsapp.com/send?phone=79690359889", "click_whatsapp"],
    ["https://web.whatsapp.com/send?phone=79690359889", "click_whatsapp"],
    ["https://www.whatsapp.com/", "click_whatsapp"],
    ["whatsapp://send?phone=79690359889", "click_whatsapp"],
    ["https://t.me/+79690359889", "click_telegram"],
    ["https://telegram.me/studio", "click_telegram"],
    ["https://telegram.dog/studio", "click_telegram"],
    ["tg://resolve?domain=studio", "click_telegram"],
    ["https://max.ru/u/studio", "click_max"],
    ["max://chat/studio", "click_max"],
  ])
    assert.equal(contactGoal(href), goal, href);

  for (const href of [
    "/contacts",
    "#phone",
    "not a URL",
    "https://vip2d.ru/",
    "https://wa.me.evil.example/",
    "https://notmax.ru/",
    "https://t.me@evil.example/",
    "https://evil.example/?url=https://t.me/studio",
    "https://evil.example/mailto:studio@example.com",
    "ftp://max.ru/studio",
    "javascript:window.open('https://wa.me/123')",
  ])
    assert.equal(contactGoal(href), undefined, href);
});

test("confirmed inquiry IDs produce one call even after retry or a different form", (t) => {
  const calls = [];
  globalThis.window = { ym: (...args) => calls.push(args) };
  t.after(() => {
    delete globalThis.window;
  });
  trackAcceptedInquiry("lead_calculator", "accepted-calculator");
  trackAcceptedInquiry("lead_calculator", "accepted-calculator");
  trackAcceptedInquiry("lead_project", "accepted-calculator");
  trackAcceptedInquiry("lead_project", "accepted-project");
  assert.deepEqual(calls, [
    [67314823, "reachGoal", "lead_calculator"],
    [67314823, "reachGoal", "lead_project"],
  ]);
  // Contact events are counted per click, not deduplicated as inquiries are.
  reachGoal("click_phone");
  reachGoal("click_phone");
  assert.equal(calls.length, 4);
});

test("missing, blocked, and throwing counters cannot break callers", (t) => {
  assert.doesNotThrow(() => reachGoal("click_email"));
  globalThis.window = {};
  t.after(() => {
    delete globalThis.window;
  });
  assert.doesNotThrow(() =>
    trackAcceptedInquiry("lead_cart", "counter-absent"),
  );
  window.ym = "blocked";
  assert.doesNotThrow(() => reachGoal("click_max"));
  let calls = 0;
  window.ym = () => {
    calls++;
    throw new Error("Blocked tracker");
  };
  assert.doesNotThrow(() =>
    trackAcceptedInquiry("lead_selection", "counter-throws"),
  );
  trackAcceptedInquiry("lead_selection", "counter-throws");
  assert.equal(calls, 1);
  Object.defineProperty(window, "ym", {
    get() {
      throw new Error("Blocked access");
    },
  });
  assert.doesNotThrow(() => reachGoal("click_telegram"));
});
