/* ── Notification utilities ─────────────────────────────────────────────── */

// ── Sound ────────────────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

/**
 * Play a short WhatsApp-style notification "pop" using the Web Audio API.
 * Falls back silently if the browser blocks audio.
 */
export function playNotificationSound(): void {
  const ctx = getAudioCtx();
  if (!ctx) return;

  // Resume after user-gesture suspension (browsers require interaction first)
  const resume = ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
  resume.then(() => {
    try {
      const now = ctx.currentTime;

      // Primary tone — 880 Hz for 120 ms
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.exponentialRampToValueAtTime(0.22, now + 0.01);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Subtle harmonic — 1320 Hz for 80 ms
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1320, now + 0.02);
      gain2.gain.setValueAtTime(0.001, now + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.10, now + 0.04);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.02);
      osc2.stop(now + 0.11);
    } catch {
      // Ignore playback errors
    }
  }).catch(() => {});
}

// ── Browser notifications ────────────────────────────────────────────────────

/** Call once after the user interacts with the page (e.g. login). */
export async function requestNotificationPermission(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

export interface NotifOptions {
  title: string;
  body?: string;
  icon?: string;
}

/**
 * Show a browser notification when the tab is in the background.
 * Clicking the notification focuses the tab.
 */
export function showBrowserNotification({ title, body, icon }: NotifOptions): void {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (!document.hidden) return;   // only when tab is not visible

  const n = new Notification(title, {
    body,
    icon: icon || "/logo192.png",
    tag: "nutterx-message",       // collapses multiple rapid notifications into one
    silent: true,                  // we handle sound ourselves
  });

  n.onclick = () => {
    window.focus();
    n.close();
  };
}
