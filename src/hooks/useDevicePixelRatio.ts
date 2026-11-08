import { useSyncExternalStore } from "react";

// One shared media query listener for all subscribers. A resolution query only
// matches the current DPR, so it's re-created after every change.
const listeners = new Set<() => void>();
let mql: MediaQueryList | null = null;

function unwatch() {
  mql?.removeEventListener("change", onChange);
  mql = null;
}

function watch() {
  unwatch();
  mql = window.matchMedia(`(resolution: ${getSnapshot()}dppx)`);
  mql.addEventListener("change", onChange);
}

function onChange() {
  watch();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) watch();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) unwatch();
  };
}

function getSnapshot() {
  return window.devicePixelRatio || 1;
}

/**
 * Current window.devicePixelRatio, updated when it changes (browser zoom,
 * moving the window to a screen with a different density).
 */
export function useDevicePixelRatio(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export default useDevicePixelRatio;
