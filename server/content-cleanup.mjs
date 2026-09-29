const retiredSocial = /instagram|facebook|инстаграм|фейсбук|фэйсбук|файсбук/i;

// Also clean snapshots saved by an existing CMS before these links were removed.
// Keep the stored snapshot and all unrelated editorial content intact.
export function removeRetiredSocialLinks(value) {
  if (Array.isArray(value)) {
    const hasRetiredLabels = value.some(
      (item) => typeof item === "string" && retiredSocial.test(item),
    );
    return value
      .filter((item) => {
        if (typeof item === "string") {
          if (/^(Instagram|Facebook)$/i.test(item.trim())) return false;
          if (hasRetiredLabels && /^(Соцсети:|\|)$/.test(item.trim()))
            return false;
        }
        const url = item && typeof item === "object" && (item.url || item.href);
        return !url || !retiredSocial.test(url);
      })
      .map(removeRetiredSocialLinks);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        removeRetiredSocialLinks(item),
      ]),
    );
  }
  if (typeof value === "string" && retiredSocial.test(value)) {
    return value
      .replace(
        /<a\b[^>]*href=["'][^"']*(?:instagram|facebook)[^"']*["'][^>]*>[\s\S]*?<\/a>/gi,
        "",
      )
      .replace(/Соцсети:\s*\|?\s*(?:<br\s*\/?>|$)/gi, "");
  }
  return value;
}
