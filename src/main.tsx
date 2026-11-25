import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    const hadController = Boolean(navigator.serviceWorker.controller);
    void navigator.serviceWorker.getRegistrations().then(async (regs) => {
      if (regs.length === 0) return;
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
      if ('caches' in window) {
        const keys = await window.caches.keys().catch(() => []);
        await Promise.all(keys.map((k) => window.caches.delete(k).catch(() => false)));
      }
      if (hadController) {
        try {
          const reloadKey = 'gfn-dev-sw-cleaned';
          if (!window.sessionStorage.getItem(reloadKey)) {
            window.sessionStorage.setItem(reloadKey, '1');
            window.location.reload();
          }
        } catch {
          // Ignore storage/reload restrictions
        }
      }
    });
  } else {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        void updateSW(true);
      },
      onRegisteredSW(_swUrl, registration) {
        if (registration) {
          void registration.update().catch(() => undefined);
        }
      },
    });
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const key = 'gfn-sw-reloaded';
        if (!window.sessionStorage.getItem(key)) {
          window.sessionStorage.setItem(key, '1');
          window.location.reload();
        }
      } catch {
        // Ignore storage errors
      }
    });
  }
}

// Tier 1 Google Maps Platform Demo Key Quota Defense
(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const origError = console.error;
console.error = (...args: unknown[]) => {
  origError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  } else if (
    msg.includes('ApiNotActivatedMapError') ||
    msg.includes('BillingNotEnabledMapError') ||
    msg.includes('InvalidKeyMapError') ||
    msg.includes('RefererNotAllowedMapError') ||
    msg.includes('ApiProjectMapError')
  ) {
    window.dispatchEvent(new CustomEvent('gmp-map-render-error'));
  }
};

createRoot(document.getElementById('root')!).render(<App />);
