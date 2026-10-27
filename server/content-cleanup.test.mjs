import test from "node:test";
import assert from "node:assert/strict";
import { removeRetiredSocialLinks } from "./content-cleanup.mjs";
import email from "../src/data/contact-email.json" with { type: "json" };
import messengers from "../src/data/contact-messengers.json" with { type: "json" };

test("old and current CMS snapshots publish one Telegram phone link with WhatsApp and MAX", () => {
  for (const socials of [
    [{ title: "Telegram", url: "https://t.me/vipdecordesign" }],
    messengers,
  ]) {
    const snapshot = { contacts: { email, socials } };
    const original = structuredClone(snapshot);
    const result = removeRetiredSocialLinks(snapshot);
    assert.deepEqual(result.contacts.socials, messengers);
    assert.equal(
      result.contacts.socials.find((item) => item.title === "Telegram").url,
      "https://t.me/+79690359889",
    );
    assert.deepEqual(removeRetiredSocialLinks(result), result);
    assert.deepEqual(snapshot, original);
  }
});

test("old CMS contact snapshots publish the current email without changing stored data", () => {
  const snapshot = {
    contacts: {
      email: "info@vip2d.ru",
      phones: ["+7 969 035 98 89"],
      socials: [],
    },
    pages: [
      {
        paragraphs: ["E-mail: INFO@VIP2D.RU"],
        html: '<a href="mailto:info@vip2d.ru">info@vip2d.ru</a>',
      },
    ],
    other: "customer@example.com",
  };
  const original = structuredClone(snapshot);
  const result = removeRetiredSocialLinks(snapshot);
  assert.equal(result.contacts.email, email);
  assert.deepEqual(result.contacts.phones, snapshot.contacts.phones);
  assert.equal(result.pages[0].paragraphs[0], "E-mail: " + email);
  assert.equal(result.pages[0].html, `<a href="mailto:${email}">${email}</a>`);
  assert.equal(result.other, snapshot.other);
  assert.deepEqual(snapshot, original);
});
