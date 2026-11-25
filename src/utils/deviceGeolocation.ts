export interface GeolocationCoordsResult {
  lat: number;
  lng: number;
}

export type GeolocationAttemptResult =
  | { ok: true; coords: GeolocationCoordsResult }
  | {
      ok: false;
      reason: 'insecure' | 'unsupported' | 'denied' | 'timeout' | 'unavailable';
      message: string;
    };

export function isAppleMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

export function isEmbeddedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function getMobileLocationPermissionHint(rawMessage?: string): string {
  const lower = (rawMessage || '').toLowerCase();
  if (
    lower.includes('permissions policy') ||
    lower.includes('feature policy') ||
    isEmbeddedIframe()
  ) {
    return 'La géolocalisation est bloquée dans cette fenêtre intégrée. Ouvrez la page directement dans Safari/Chrome ou choisissez un point de départ ci-dessous.';
  }
  if (isAppleMobileDevice()) {
    return 'Sur iPhone/iPad : Réglages > Confidentialité et sécurité > Service de localisation > Safari (ou votre navigateur), puis appuyez sur « Me localiser (GPS) » ou choisissez un point de départ ci-dessous.';
  }
  if (isAndroidDevice()) {
    return 'Sur Android : touchez le cadenas dans la barre d’adresse > Autorisations > Position, puis réessayez ou choisissez un point de départ ci-dessous.';
  }
  return 'Autorisez la localisation dans votre navigateur ou indiquez une ville/adresse de départ ci-dessous.';
}

let inFlightGeoPromise: Promise<GeolocationAttemptResult> | null = null;
let inFlightGeoTimestamp = 0;

/**
 * MUST be invoked synchronously inside a user tap/click handler so iOS Safari
 * and iOS standalone PWAs preserve the user-activation token for CoreLocation.
 */
export function requestGeolocationSynchronously(options?: {
  highAccuracyFirst?: boolean;
}): Promise<GeolocationAttemptResult> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return Promise.resolve({
      ok: false,
      reason: 'insecure',
      message:
        'La géolocalisation sur iOS et Android nécessite une connexion sécurisée (HTTPS). Choisissez un point de départ ci-dessous.',
    });
  }

  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return Promise.resolve({
      ok: false,
      reason: 'unsupported',
      message:
        'La géolocalisation n’est pas prise en charge par ce navigateur. Choisissez un point de départ ci-dessous.',
    });
  }

  const highAccuracyFirst = options?.highAccuracyFirst ?? !isAppleMobileDevice();

  const promise = new Promise<GeolocationAttemptResult>((resolve) => {
    let settled = false;
    let watchdogId: number | null = null;
    let watchId: number | null = null;

    const cleanupTimersAndWatch = () => {
      if (watchdogId !== null) {
        window.clearTimeout(watchdogId);
        watchdogId = null;
      }
      if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch {
          // Ignore clearWatch errors
        }
        watchId = null;
      }
    };

    const finish = (result: GeolocationAttemptResult) => {
      if (settled) return;
      settled = true;
      cleanupTimersAndWatch();
      resolve(result);
    };

    const startWatchRecovery = (lastErr?: GeolocationPositionError) => {
      if (settled) return;
      cleanupTimersAndWatch();

      if (typeof navigator.geolocation.watchPosition !== 'function') {
        finish({
          ok: false,
          reason: lastErr?.code === lastErr?.TIMEOUT ? 'timeout' : 'unavailable',
          message:
            'Position temporairement indisponible sur cet appareil. Appuyez sur « Me localiser (GPS) » ou choisissez un point de départ.',
        });
        return;
      }

      watchdogId = window.setTimeout(() => {
        finish({
          ok: false,
          reason: 'timeout',
          message:
            'La localisation de votre appareil a expiré. Réessayez ou choisissez un point de départ.',
        });
      }, 7500);

      try {
        watchId = navigator.geolocation.watchPosition(
          (position) => {
            finish({
              ok: true,
              coords: {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              },
            });
          },
          (err) => {
            if (settled) return;
            if (err.code === err.PERMISSION_DENIED) {
              finish({
                ok: false,
                reason: 'denied',
                message: `L’accès à la localisation a été refusé. ${getMobileLocationPermissionHint(err.message)}`,
              });
            }
            // For transient POSITION_UNAVAILABLE on iOS CoreLocation warm-up, keep watching until watchdog expires
          },
          {
            enableHighAccuracy: false,
            timeout: 7000,
            maximumAge: 180000,
          }
        );
      } catch {
        finish({
          ok: false,
          reason: 'unavailable',
          message:
            'Impossible de démarrer la géolocalisation sur cet appareil. Choisissez un point de départ.',
        });
      }
    };

    const runAttempt = (
      enableHighAccuracy: boolean,
      timeoutMs: number,
      maximumAgeMs: number,
      fallbackHighAccuracy: boolean | null
    ) => {
      cleanupTimersAndWatch();
      watchdogId = window.setTimeout(() => {
        if (settled) return;
        if (fallbackHighAccuracy !== null) {
          runAttempt(fallbackHighAccuracy, 6500, 120000, null);
        } else {
          startWatchRecovery();
        }
      }, timeoutMs + 1500);

      try {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            finish({
              ok: true,
              coords: {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              },
            });
          },
          (err) => {
            if (settled) return;
            cleanupTimersAndWatch();
            if (err.code === err.PERMISSION_DENIED) {
              finish({
                ok: false,
                reason: 'denied',
                message: `L’accès à la localisation a été refusé. ${getMobileLocationPermissionHint(err.message)}`,
              });
              return;
            }
            if (fallbackHighAccuracy !== null) {
              runAttempt(fallbackHighAccuracy, 6500, 120000, null);
              return;
            }
            startWatchRecovery(err);
          },
          {
            enableHighAccuracy,
            timeout: timeoutMs,
            maximumAge: maximumAgeMs,
          }
        );
      } catch {
        finish({
          ok: false,
          reason: 'unavailable',
          message:
            'Impossible de démarrer la géolocalisation sur cet appareil. Choisissez un point de départ.',
        });
      }
    };

    // Call navigator.geolocation.getCurrentPosition synchronously on the first tick!
    if (highAccuracyFirst) {
      runAttempt(true, 6000, 60000, false);
    } else {
      // On iOS, Wi-Fi/CoreLocation network mode responds immediately indoors, with GPS & watch recovery outdoors
      runAttempt(false, 6000, 180000, true);
    }
  });

  inFlightGeoPromise = promise;
  inFlightGeoTimestamp = Date.now();
  return promise;
}

export function primeDeviceLocationFromGesture(): void {
  // Always invoke synchronously inside tap handlers for iOS Safari/PWA compatibility
  void requestGeolocationSynchronously({
    highAccuracyFirst: false,
  });
}

export function consumePrimedGeolocation(
  maxAgeMs = 15000
): Promise<GeolocationAttemptResult> | null {
  if (!inFlightGeoPromise) return null;
  if (Date.now() - inFlightGeoTimestamp > maxAgeMs) {
    inFlightGeoPromise = null;
    return null;
  }
  const p = inFlightGeoPromise;
  inFlightGeoPromise = null;
  return p;
}
