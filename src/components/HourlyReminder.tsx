import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

const ONE_HOUR_MS = 60 * 60 * 1000;
const STORAGE_KEY = "hourly_reminder_last_login_at";

/**
 * Plays a soothing chime + shows a gentle wellness reminder
 * exactly one hour after the user logs in (per session).
 *
 * Uses the WebAudio API to synthesize a calm bell tone — no asset needed.
 */
export function HourlyReminder() {
  const { user } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) {
      // Cleanup on logout
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    // Persist login timestamp across reloads so the 1-hour window is honored
    const stored = localStorage.getItem(STORAGE_KEY);
    let loginAt: number;
    if (stored) {
      loginAt = Number(stored);
      if (!Number.isFinite(loginAt)) {
        loginAt = Date.now();
        localStorage.setItem(STORAGE_KEY, String(loginAt));
      }
    } else {
      loginAt = Date.now();
      localStorage.setItem(STORAGE_KEY, String(loginAt));
    }

    const elapsed = Date.now() - loginAt;
    const remaining = ONE_HOUR_MS - elapsed;

    // Already past the hour and reminder hasn't been triggered this session?
    // We avoid spamming — only fire if remaining is still in a sensible window.
    if (remaining <= 0) {
      // If we missed the window by a long time, schedule the next hour instead.
      const nextLoginAt = Date.now();
      localStorage.setItem(STORAGE_KEY, String(nextLoginAt));
      timerRef.current = setTimeout(triggerReminder, ONE_HOUR_MS);
      return;
    }

    timerRef.current = setTimeout(triggerReminder, remaining);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const triggerReminder = () => {
    playSoothingChime();
    toast("Time for a mindful break", {
      description: "You've been working for an hour. Stretch, breathe, and sip some water 🌿",
      duration: 10000,
      icon: <Sparkles className="size-4 text-primary" />,
    });
    // Reset for next hour
    const next = Date.now();
    localStorage.setItem(STORAGE_KEY, String(next));
    timerRef.current = setTimeout(triggerReminder, ONE_HOUR_MS);
  };

  return null;
}

/**
 * Synthesize a calm two-note bell using WebAudio.
 * No external assets required.
 */
function playSoothingChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Gentle two-tone bell: C5 + E5
    const notes = [
      { freq: 523.25, start: 0, duration: 2.4 },
      { freq: 659.25, start: 0.35, duration: 2.4 },
      { freq: 783.99, start: 0.7, duration: 2.4 },
    ];

    notes.forEach(({ freq, start, duration }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;

      const t0 = ctx.currentTime + start;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.1);
    });

    // Close context after sound finishes to free resources
    setTimeout(() => {
      void ctx.close();
    }, 4000);
  } catch (err) {
    console.warn("Could not play reminder chime", err);
  }
}
