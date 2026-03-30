import { useEffect } from "react";
import { useAuthStore } from "./use-auth";

const API = "/api/push";

async function getVapidKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API}/vapid-public-key`);
    if (!res.ok) return null;
    const { publicKey } = await res.json();
    return publicKey ?? null;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

async function registerAndSubscribe(token: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const vapidKey = await getVapidKey();
  if (!vapidKey) return;

  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  await fetch(`${API}/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(sub.toJSON()),
  });
}

/**
 * Registers the service worker and subscribes to Web Push when the user is
 * authenticated. Safe to call multiple times — registration is idempotent.
 */
export function usePushNotifications() {
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) return;
    registerAndSubscribe(token).catch(() => {});
  }, [token]);
}
