import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const b = await chromium.launch({ channel: "chrome" });
const c = await b.newContext({
  viewport: { width: 320, height: 800 },
  reducedMotion: "reduce",
});
await c.route("**/*", (r) =>
  ["GET", "HEAD"].includes(r.request().method()) ? r.continue() : r.abort(),
);
const p = await c.newPage();
const checks = [];
await p.goto("http://127.0.0.1:5180/contacts");
await p.locator("h1").waitFor();
await p.keyboard.press("Tab");
await expect(p.locator(".skip-link")).toBeFocused();
await p.keyboard.press("Enter");
await expect(p.locator("#main-content")).toBeFocused();
checks.push("Skip link reaches main with keyboard.");
const menu = p.getByRole("button", { name: "Открыть меню" });
await menu.focus();
await p.keyboard.press("Enter");
await expect(p.getByRole("dialog")).toBeVisible();
for (let i = 0; i < 20; i++) {
  await p.keyboard.press("Tab");
  assert.ok(
    await p.evaluate(() => !!document.activeElement?.closest("dialog[open]")),
  );
}
await p.keyboard.press("Escape");
await expect(menu).toBeFocused();
checks.push(
  "Mobile menu opens with Enter, traps 20 Tab steps, Escape returns focus.",
);
await p.goto("http://127.0.0.1:5180/kakpodobrat");
await p.locator("h1").waitFor();
const all = p.locator(".room-picker button");
await all.focus();
await p.keyboard.press("Enter");
await expect(p.locator("#all-rooms")).toBeVisible();
const kitchen = p.locator('.room-picker a[href="#kitchen"]');
await kitchen.focus();
await p.keyboard.press("Enter");
await expect(p.locator("#room-heading")).toHaveText("Кухня");
const full = p.locator(".room-full summary");
await full.focus();
await p.keyboard.press("Enter");
await expect(p.locator(".room-full .reading-copy")).toBeVisible();
checks.push("Room picker and full article work with keyboard.");
for (const [path, expected] of [
  ["/fabrics?sort=price-asc", "/tkani?sort=price-asc"],
  ["/furnitura?from=calculator", "/fyrnityra?from=calculator"],
  ["/privacy?from=form#policy-6", "/popd?from=form#policy-6"],
  ["/studio?from=menu#rec224459428", "/company?from=menu#rec224459428"],
]) {
  await p.goto("http://127.0.0.1:5180" + path);
  await expect(p).toHaveURL("http://127.0.0.1:5180" + expected);
}
checks.push("All compatible redirects preserve query and hash.");
await p.goto("http://127.0.0.1:5180/contacts");
await p.locator("h1").waitFor();
await p.locator(".contact-card button").click();
await p.screenshot({ path: "docs/qa-liquid-glass/dialog-320.png" });
const dialog = p.getByRole("dialog");
assert.ok(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
checks.push("320px inquiry dialog fits viewport.");
await b.close();
await fs.writeFile(
  "docs/qa-liquid-glass/keyboard.json",
  JSON.stringify(
    { checkedAt: new Date().toISOString(), checks, passed: true },
    null,
    2,
  ),
);
console.log(checks);
