/* No page/data caching: CMS authorization always remains server-controlled. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data?.json() || {};
  } catch {
    /* Display a safe fallback. */
  }
  const inquiry =
    typeof message.url === "string" &&
    /^\/admin\?inquiry=[a-zA-Z0-9_-]{1,100}$/.test(message.url);
  const url = inquiry ? message.url : "/admin";
  event.waitUntil(
    self.registration.showNotification(message.title || "VIP Decor", {
      body: message.body || "Новое уведомление. Откройте панель управления.",
      icon: "/admin/icon-192.png",
      badge: "/admin/icon-192.png",
      tag: message.tag || "vip-decor",
      renotify: false,
      data: { url },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url;
  const url = new URL(
    typeof path === "string" &&
      /^\/admin(?:\?inquiry=[a-zA-Z0-9_-]{1,100})?$/.test(path)
      ? path
      : "/admin",
    self.location.origin,
  ).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find((client) => client.url === url);
      if (existing) return existing.focus();
      // Open separately to preserve unsaved edits in another CMS window.
      return self.clients.openWindow(url);
    })(),
  );
});
