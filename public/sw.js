// Service Worker for Browser Web Push Notifications
// HỆ THỐNG QUẢN LÝ TIÊU CHÍ & MINH CHỨNG CÔNG TÁC ĐOÀN

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || "Công tác Đoàn - Thông báo";
    const options = {
      body: payload.message || "Bạn có thông báo mới từ hệ thống.",
      icon: "/huy-hieu-doan.png",
      badge: "/huy-hieu-doan.png",
      data: {
        url: payload.url || "/",
      },
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    const title = "Công tác Đoàn - Thông báo";
    const options = {
      body: event.data.text(),
      icon: "/huy-hieu-doan.png",
      badge: "/huy-hieu-doan.png",
    };
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
