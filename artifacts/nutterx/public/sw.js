/* Nutterx Technologies — Service Worker */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Nutterx", body: event.data.text() };
  }

  const { title = "Nutterx", body = "", icon, tag, data } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: icon || "/favicon.svg",
      badge: "/favicon.svg",
      tag: tag || "nutterx-msg",
      renotify: true,
      data: data || {},
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
