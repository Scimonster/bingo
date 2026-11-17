import { useCallback, useEffect, useState } from "react";

/** Keeps the screen awake while mounted (Screen Wake Lock), re-acquiring after the tab is shown again. */
export function useWakeLock(enabled = true): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      try {
        lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        setActive(true);
        lock.addEventListener("release", () => setActive(false));
      } catch {
        setActive(false);
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible" && (!lock || lock.released)) void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => undefined);
    };
  }, [enabled]);
  return active;
}

/** Fullscreen state + toggle for the whole document. */
export function useFullscreen(): { isFullscreen: boolean; toggle: () => void; supported: boolean } {
  const [isFullscreen, set] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const on = () => set(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);
  return { isFullscreen, toggle, supported: !!document.documentElement.requestFullscreen };
}
