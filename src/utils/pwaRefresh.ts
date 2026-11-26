export async function forceRefreshAppCache(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem('gfn-sw-reloaded');
  } catch {
    // Ignore storage access errors in private mode
  }
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map(async (reg) => {
          try {
            await reg.update();
          } catch {
            // Ignore update error before unregister
          }
          return reg.unregister().catch(() => false);
        })
      );
    }
  } catch {
    // Ignore service worker errors
  }
  try {
    if ('caches' in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((k) => window.caches.delete(k).catch(() => false)));
    }
  } catch {
    // Ignore Cache Storage errors
  }
  window.location.reload();
}
