import messengers from "../src/data/contact-messengers.json" with { type: "json" };
import contactEmail from "../src/data/contact-email.json" with { type: "json" };

const retiredSocial = /instagram|facebook|инстаграм|фейсбук|фэйсбук|файсбук|telegram|телеграм|https?:\/\/t\.me\//i;

// Strip retired social links from old CMS snapshots, then insert current messengers.
// The old Telegram username is replaced by the canonical phone-number link.
// Keep the stored snapshot and all unrelated editorial content intact.
export function removeRetiredSocialLinks(value) {
  // Older CMS snapshots also contain the previous company email in text and HTML.
  if (typeof value === "string") {
    value = value.replace(/\binfo@vip2d\.ru\b/gi, contactEmail);
  }
  if (Array.isArray(value)) {
    const hasRetiredLabels = value.some(
      (item) => typeof item === "string" && retiredSocial.test(item),
    );
    return value
      .filter((item) => {
        if (typeof item === "string") {
          if (/^(Instagram|Facebook|Telegram|Телеграм)$/i.test(item.trim())) return false;
          if (hasRetiredLabels && /^(Соцсети:|\|)$/.test(item.trim()))
            return false;
        }
        const url = item && typeof item === "object" && (item.url || item.href);
        return !url || !retiredSocial.test(url);
      })
      .map(removeRetiredSocialLinks);
  }
  if (value && typeof value === "object") {
    const cleaned = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        removeRetiredSocialLinks(item),
      ]),
    );
    if (cleaned.contacts) cleaned.contacts.email = contactEmail;
    if (cleaned.contacts && Array.isArray(cleaned.contacts.socials)) {
      cleaned.contacts.socials = [
        ...cleaned.contacts.socials.filter(
          (social) => !messengers.some((item) => item.title === social.title || item.url === social.url),
        ),
        ...messengers.map((item) => ({ ...item })),
      ];
    }
    return cleaned;
  }
  if (typeof value === "string" && retiredSocial.test(value)) {
    return value
      .replace(
        /<a\b[^>]*href=["'][^"']*(?:instagram|facebook|telegram|https?:\/\/t\.me\/)[^"']*["'][^>]*>[\s\S]*?<\/a>/gi,
        "",
      )
      .replace(/Соцсети:\s*\|?\s*(?:<br\s*\/?>|$)/gi, "");
  }
  return value;
}
