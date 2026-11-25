/// <reference types="google.maps" />
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APILoadingStatus,
  Circle,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  AlertCircle,
  Clock,
  Compass,
  Crosshair,
  ExternalLink,
  Loader2,
  LocateFixed,
  MapPin,
  Minus,
  Navigation,
  Plus,
  RefreshCw,
  UserCheck,
  X,
} from 'lucide-react';
import { DisciplineItem, SportEvent } from '../types';
import {
  evaluateEventBooking,
  formatEventCoachesLabel,
  formatEventPrice,
  formatFrenchDateShort,
  formatFrenchTime,
  formatTimeRange,
} from '../utils/dateAndValidation';
import { getDisciplineStyle } from '../utils/disciplineColors';
import { DisciplineIcon } from './DisciplineIcon';
import {
  buildMapsExternalUrl,
  isQuotaError,
  MAPS_ATTRIBUTION_IDS,
  useIsDarkTheme,
  useMapRenderError,
} from './EventLocationMap';
import { PlaceAutocompleteInput, PlaceSelection } from './PlaceAutocompleteInput';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface SearchCenter extends GeoPoint {
  label: string;
  source: 'gps' | 'manual';
}

export interface NearbyEventEntry {
  event: SportEvent;
  pos: GeoPoint;
  distanceKm: number | null;
}

const RADIUS_OPTIONS_KM = [5, 10, 25, 50, 100] as const;
const MIN_RADIUS_KM = 1;
const MAX_RADIUS_KM = 150;
const DEFAULT_FRANCE_CENTER: GeoPoint = { lat: 46.603354, lng: 1.888334 };

function computeZoomForRadiusKm(
  radiusKm: number,
  lat: number,
  widthPx: number,
  heightPx: number
): number {
  const safeMinDim = Math.max(
    220,
    Math.min(widthPx || 360, heightPx || 360) - 48
  );
  const diameterMeters = Math.max(500, radiusKm * 2000);
  const cosLat = Math.max(0.15, Math.cos((lat * Math.PI) / 180));
  const rawZoom = Math.log2(
    (safeMinDim * 156543.03392 * cosLat) / diameterMeters
  );
  return Math.max(4, Math.min(16, Number(rawZoom.toFixed(2))));
}

// Ephemeral in-memory session cache only (never persisted to storage or DB)
const sessionResolvedCoordsCache: Record<string, GeoPoint | null> = {};

function buildEventGeoCacheKey(ev: SportEvent): string {
  return `${ev.id}::${ev.location.trim()}::${ev.city.trim()}::${(ev.region || '').trim()}`;
}

export function calculateDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return earthRadiusKm * c;
}

export function formatDistanceKm(km: number): string {
  if (km < 1) {
    const meters = Math.max(10, Math.round((km * 1000) / 10) * 10);
    return `${meters} m`;
  }
  if (km < 10) {
    return `${km.toFixed(1).replace('.', ',')} km`;
  }
  return `${Math.round(km)} km`;
}

function buildDirectionsUrl(
  origin: SearchCenter | null,
  dest: GeoPoint,
  event: SportEvent
): string {
  if (origin) {
    return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}`;
  }
  return buildMapsExternalUrl(event.location, event.city, dest);
}

interface NearbyEventsMapProps {
  events: SportEvent[];
  disciplines?: DisciplineItem[];
  nowMs: number;
  isCoach?: boolean;
  registeredEventIds?: Set<string>;
  hasMapsApiKey: boolean;
  autoLocateOnMount?: boolean;
  onSelectEvent: (event: SportEvent) => void;
}

export function NearbyEventsMap({
  events,
  disciplines = [],
  nowMs,
  isCoach = false,
  registeredEventIds,
  hasMapsApiKey,
  autoLocateOnMount = true,
  onSelectEvent,
}: NearbyEventsMapProps) {
  const [searchCenter, setSearchCenter] = useState<SearchCenter | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(25);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [manualAddressText, setManualAddressText] = useState('');
  const [showManualPicker, setShowManualPicker] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [recenterNonce, setRecenterNonce] = useState(0);
  const [resolvedVersion, setResolvedVersion] = useState(0);
  const [resolvingPlaces, setResolvingPlaces] = useState(false);
  const hasAutoLocatedRef = useRef(false);
  const userClearedRef = useRef(false);
  const mapWrapperRef = useRef<HTMLDivElement | null>(null);

  const requestDeviceLocation = useCallback((isAuto = false) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeoError(
        'La géolocalisation de l’appareil n’est pas prise en charge par ce navigateur. Choisissez une adresse de départ ci-dessous.'
      );
      setShowManualPicker(true);
      return;
    }

    userClearedRef.current = false;
    setLocating(true);
    if (!isAuto) {
      setGeoError(null);
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSearchCenter({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: 'Position actuelle de votre appareil',
          source: 'gps',
        });
        setGeoError(null);
        setLocating(false);
        setShowManualPicker(false);
        setRecenterNonce((n) => n + 1);
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError(
            'L’accès à la localisation de votre appareil a été refusé. Autorisez-le dans votre navigateur ou indiquez une ville/adresse de départ.'
          );
        } else if (err.code === err.TIMEOUT) {
          setGeoError(
            'La localisation de votre appareil a pris trop de temps. Réessayez ou indiquez une adresse de départ.'
          );
        } else {
          setGeoError(
            'Impossible d’obtenir votre position GPS pour le moment. Vous pouvez choisir une ville ou adresse de départ.'
          );
        }
        setShowManualPicker(true);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }, []);

  useEffect(() => {
    if (autoLocateOnMount && !hasAutoLocatedRef.current && !userClearedRef.current) {
      hasAutoLocatedRef.current = true;
      requestDeviceLocation(true);
    }
  }, [autoLocateOnMount, requestDeviceLocation]);

  const handleClearLocation = () => {
    userClearedRef.current = true;
    setSearchCenter(null);
    setGeoError(null);
    setManualAddressText('');
    setSelectedEventId(null);
    setRecenterNonce((n) => n + 1);
  };

  const handleSelectManualPlace = (place: PlaceSelection) => {
    setManualAddressText(place.location);
    if (place.hasCoords) {
      userClearedRef.current = false;
      setSearchCenter({
        lat: place.lat,
        lng: place.lng,
        label: place.city ? `${place.city}` : place.location,
        source: 'manual',
      });
      setGeoError(null);
      setShowManualPicker(false);
      setRecenterNonce((n) => n + 1);
    }
  };

  // Resolve coordinates for events that don't have stored lat/lng yet
  const eventsWithPos = useMemo(() => {
    void resolvedVersion;
    const mapped: NearbyEventEntry[] = [];
    let unlocatedCount = 0;

    events.forEach((ev) => {
      const cacheKey = buildEventGeoCacheKey(ev);
      const pos = ev.hasCoords
        ? { lat: ev.lat, lng: ev.lng }
        : sessionResolvedCoordsCache[cacheKey] ?? null;

      if (pos) {
        const distanceKm = searchCenter
          ? calculateDistanceKm(searchCenter, pos)
          : null;
        mapped.push({ event: ev, pos, distanceKm });
      } else {
        unlocatedCount += 1;
      }
    });

    return { mapped, unlocatedCount };
  }, [events, searchCenter, resolvedVersion]);

  const { nearbyEvents, closestOutside } = useMemo(() => {
    if (!searchCenter) {
      const sorted = eventsWithPos.mapped
        .slice()
        .sort((a, b) => a.event.startAt.toMillis() - b.event.startAt.toMillis());
      return {
        nearbyEvents: sorted,
        closestOutside: null as NearbyEventEntry | null,
      };
    }

    const inside: NearbyEventEntry[] = [];
    let nearestOutside: NearbyEventEntry | null = null;

    eventsWithPos.mapped.forEach((entry) => {
      const dist = entry.distanceKm ?? Infinity;
      if (dist <= radiusKm) {
        inside.push(entry);
      } else if (
        !nearestOutside ||
        dist < (nearestOutside.distanceKm ?? Infinity)
      ) {
        nearestOutside = entry;
      }
    });

    inside.sort((a, b) => {
      const da = a.distanceKm ?? Infinity;
      const db = b.distanceKm ?? Infinity;
      if (Math.abs(da - db) > 0.05) return da - db;
      return a.event.startAt.toMillis() - b.event.startAt.toMillis();
    });

    return {
      nearbyEvents: inside,
      closestOutside: nearestOutside,
    };
  }, [eventsWithPos.mapped, searchCenter, radiusKm]);

  useEffect(() => {
    if (
      selectedEventId &&
      !nearbyEvents.some((entry) => entry.event.id === selectedEventId)
    ) {
      setSelectedEventId(null);
    }
  }, [nearbyEvents, selectedEventId]);

  const suggestedLargerRadius = useMemo(() => {
    if (!closestOutside || closestOutside.distanceKm === null) return null;
    const candidates = [5, 10, 25, 50, 100, 150];
    return (
      candidates.find(
        (r) => r > radiusKm && r >= (closestOutside.distanceKm ?? 0)
      ) ?? null
    );
  }, [closestOutside, radiusKm]);

  const updateRadiusKm = useCallback((nextKm: number) => {
    const clamped = Math.max(MIN_RADIUS_KM, Math.min(MAX_RADIUS_KM, Math.round(nextKm)));
    setRadiusKm(clamped);
    setRecenterNonce((n) => n + 1);
  }, []);

  const handleDecreaseRadius = useCallback(() => {
    const step = radiusKm > 50 ? 10 : radiusKm > 10 ? 5 : 1;
    updateRadiusKm(radiusKm - step);
  }, [radiusKm, updateRadiusKm]);

  const handleIncreaseRadius = useCallback(() => {
    const step = radiusKm >= 50 ? 10 : radiusKm >= 10 ? 5 : 1;
    updateRadiusKm(radiusKm + step);
  }, [radiusKm, updateRadiusKm]);

  const handleFocusEventOnMap = (eventId: string) => {
    setSelectedEventId(eventId);
    mapWrapperRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  };

  return (
    <div className="space-y-4">
      {hasMapsApiKey && (
        <NearbyPlaceResolver
          events={events}
          onResolvedUpdate={() => setResolvedVersion((v) => v + 1)}
          onResolvingChange={setResolvingPlaces}
        />
      )}

      {/* Location & Radius Control Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Device Geolocation Controls */}
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => requestDeviceLocation(false)}
                disabled={locating}
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer whitespace-nowrap"
              >
                {locating ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <LocateFixed className="h-4 w-4" aria-hidden="true" />
                )}
                {locating
                  ? 'Localisation en cours...'
                  : searchCenter?.source === 'gps'
                    ? 'Actualiser ma position'
                    : 'Me localiser (GPS)'}
              </button>

              <button
                type="button"
                onClick={() => setShowManualPicker((prev) => !prev)}
                className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap"
              >
                <MapPin className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                {showManualPicker ? 'Fermer la saisie' : 'Autre adresse de départ'}
              </button>

              {searchCenter && (
                <>
                  <button
                    type="button"
                    onClick={() => setRecenterNonce((n) => n + 1)}
                    className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap"
                    title="Recentrer la carte sur le rayon"
                  >
                    <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                    Recentrer
                  </button>
                  <button
                    type="button"
                    onClick={handleClearLocation}
                    className="inline-flex min-h-[42px] items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer whitespace-nowrap"
                    title="Effacer la position utilisée"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Effacer ma position
                  </button>
                </>
              )}
            </div>

            {searchCenter ? (
              <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                <Navigation className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate font-medium">
                  Centre actif : {searchCenter.label}
                </span>
              </p>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Activez la localisation de votre appareil ou saisissez un lieu pour afficher uniquement les séances dans votre rayon.
              </p>
            )}
          </div>

          {/* Radius Selector */}
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
              Rayon de recherche :
            </span>
            <div
              role="group"
              aria-label="Choisir le rayon en kilomètres"
              className="flex flex-col gap-2 rounded-lg bg-slate-100 p-1.5 dark:bg-slate-800"
            >
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={handleDecreaseRadius}
                  disabled={radiusKm <= MIN_RADIUS_KM}
                  aria-label="Réduire le rayon et agrandir le zoom sur la carte"
                  title="Réduire le rayon (zoom avant)"
                  className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                {RADIUS_OPTIONS_KM.map((km) => (
                  <button
                    key={km}
                    type="button"
                    onClick={() => updateRadiusKm(km)}
                    className={`min-h-[34px] rounded-md px-2.5 py-1 font-mono text-xs font-semibold tabular-nums whitespace-nowrap cursor-pointer transition-colors ${
                      radiusKm === km
                        ? 'bg-emerald-700 text-white shadow-xs dark:bg-emerald-600'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                    }`}
                  >
                    {km} km
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleIncreaseRadius}
                  disabled={radiusKm >= MAX_RADIUS_KM}
                  aria-label="Agrandir le rayon et réduire le zoom sur la carte"
                  title="Agrandir le rayon (zoom arrière)"
                  className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <div className="flex items-center gap-2.5 px-1 pb-0.5">
                <input
                  type="range"
                  min={MIN_RADIUS_KM}
                  max={MAX_RADIUS_KM}
                  step={1}
                  value={radiusKm}
                  onChange={(e) => updateRadiusKm(Number(e.target.value))}
                  aria-label="Ajuster le rayon de recherche pour réduire ou agrandir la carte"
                  className="h-1.5 flex-1 cursor-pointer accent-emerald-700 dark:accent-emerald-500"
                />
                <span className="min-w-[52px] text-right font-mono text-[11px] font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
                  {radiusKm} km
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Manual starting address fallback */}
        {showManualPicker && (
          <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <label
              htmlFor="nearby-manual-address"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              Choisir un point de départ (adresse ou ville)
            </label>
            <div className="mt-1 max-w-lg">
              <PlaceAutocompleteInput
                inputId="nearby-manual-address"
                required={false}
                value={manualAddressText}
                hasMapsApiKey={hasMapsApiKey}
                onChangeText={setManualAddressText}
                onSelectPlace={handleSelectManualPlace}
                placeholder="Ex. Lyon, Paris 11e, Parc de la Tête d’Or..."
                ariaLabel="Choisir une adresse ou ville de départ"
              />
            </div>
            {!hasMapsApiKey && (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                La recherche d’adresse nécessite l’activation de Google Maps ; utilisez la localisation GPS de votre appareil.
              </p>
            )}
          </div>
        )}

        {/* Geolocation Error Banner */}
        {geoError && (
          <div
            role="status"
            className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{geoError}</span>
          </div>
        )}
      </div>

      {/* Interactive Proximity Map */}
      <div ref={mapWrapperRef}>
        {hasMapsApiKey ? (
          <NearbyGoogleMapCanvas
            entries={nearbyEvents}
            disciplines={disciplines}
            searchCenter={searchCenter}
            radiusKm={radiusKm}
            recenterNonce={recenterNonce}
            selectedEventId={selectedEventId}
            onSelectMarker={setSelectedEventId}
            onSelectEvent={onSelectEvent}
            resolvingPlaces={resolvingPlaces}
          />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-center text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            La carte interactive s’affichera dès que la clé Google Maps sera configurée. Les séances à proximité restent calculées et classées par distance ci-dessous.
          </div>
        )}
      </div>

      {/* Results Summary + Synchronized Sorted List */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              {searchCenter
                ? `${nearbyEvents.length} séance${nearbyEvents.length > 1 ? 's' : ''} dans un rayon de ${radiusKm} km`
                : `${nearbyEvents.length} séance${nearbyEvents.length > 1 ? 's' : ''} géolocalisée${nearbyEvents.length > 1 ? 's' : ''}`}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {searchCenter
                ? 'Classées de la plus proche à la plus éloignée autour de votre position.'
                : 'Activez votre position GPS pour filtrer et trier par distance.'}
              {eventsWithPos.unlocatedCount > 0 && !resolvingPlaces
                ? ` · ${eventsWithPos.unlocatedCount} séance${eventsWithPos.unlocatedCount > 1 ? 's' : ''} sans coordonnées exactes`
                : ''}
            </p>
          </div>
          {resolvingPlaces && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Localisation des lieux en cours...
            </span>
          )}
        </div>

        {nearbyEvents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
            <Compass
              className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600"
              aria-hidden="true"
            />
            <p className="mt-2 font-display text-sm font-bold text-slate-900 dark:text-white">
              {searchCenter
                ? `Aucune séance dans un rayon de ${radiusKm} km`
                : 'Aucune séance géolocalisée disponible'}
            </p>
            {searchCenter && closestOutside && closestOutside.distanceKm !== null ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                La séance la plus proche (« {closestOutside.event.title} » à{' '}
                {closestOutside.event.city}) se situe à{' '}
                <strong className="font-mono text-slate-800 dark:text-slate-200">
                  {formatDistanceKm(closestOutside.distanceKm)}
                </strong>
                .
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Essayez d’élargir le rayon de recherche ou de modifier vos filtres de discipline et de période.
              </p>
            )}
            {suggestedLargerRadius && (
              <button
                type="button"
                onClick={() => {
                  setRadiusKm(suggestedLargerRadius);
                  setRecenterNonce((n) => n + 1);
                }}
                className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
              >
                Élargir le rayon à {suggestedLargerRadius} km
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {nearbyEvents.map(({ event, pos, distanceKm }) => {
              const discStyle = getDisciplineStyle(event.discipline, disciplines);
              const evalInfo = evaluateEventBooking(event, nowMs, {
                hideRegisteredCount: !isCoach,
              });
              const startDate = event.startAt.toDate();
              const isSelected = selectedEventId === event.id;
              const hasSpots =
                evalInfo.isUnlimited || (evalInfo.remainingSpots ?? 0) > 0;
              const canBook = hasSpots && evalInfo.state === 'open';

              return (
                <article
                  key={event.id}
                  className={`flex flex-col justify-between rounded-xl border border-l-4 ${discStyle.leftBorder} bg-white p-4 transition-colors dark:bg-slate-900 ${
                    isSelected
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 dark:border-emerald-500'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {distanceKm !== null && (
                          <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-800 tabular-nums dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <Navigation className="h-3 w-3" aria-hidden="true" />
                            À {formatDistanceKm(distanceKm)}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold ${discStyle.softBg} ${discStyle.border} ${discStyle.text}`}
                        >
                          <DisciplineIcon
                            disciplineName={event.discipline}
                            catalog={disciplines}
                            className="h-3 w-3 shrink-0"
                          />
                          {event.discipline}
                        </span>
                        <span
                          className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                            event.isPaid
                              ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          }`}
                        >
                          {formatEventPrice(event)}
                        </span>
                        {registeredEventIds?.has(event.id) && (
                          <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            Inscrit
                          </span>
                        )}
                      </div>

                      <span
                        className={`text-xs font-semibold ${
                          evalInfo.state === 'open'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : evalInfo.state === 'closed'
                              ? 'text-amber-700 dark:text-amber-400'
                              : evalInfo.state === 'full' ||
                                  evalInfo.state === 'cancelled'
                                ? 'text-rose-700 dark:text-rose-400'
                                : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {evalInfo.statusLabel}
                      </span>
                    </div>

                    <h4 className="mt-2 font-display text-base font-bold text-slate-900 dark:text-white">
                      {event.title}
                    </h4>

                    <div className="mt-2.5 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      <p className="flex items-center gap-1.5 font-mono tabular-nums">
                        <Clock
                          className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="capitalize">
                          {formatFrenchDateShort(startDate)} ·{' '}
                          {formatTimeRange(startDate, event.durationMinutes)}
                        </span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <MapPin
                          className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="truncate">
                          {event.location} ·{' '}
                          <strong className="text-slate-900 dark:text-white">
                            {event.city}
                          </strong>
                        </span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <UserCheck
                          className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="truncate">
                          {formatEventCoachesLabel(event)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    {hasMapsApiKey && (
                      <button
                        type="button"
                        onClick={() => handleFocusEventOnMap(event.id)}
                        className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                      >
                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                        Centrer
                      </button>
                    )}
                    <a
                      href={buildDirectionsUrl(searchCenter, pos, event)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Itinéraire
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                    <button
                      type="button"
                      onClick={() => onSelectEvent(event)}
                      className={`flex-1 min-h-[38px] rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                        canBook
                          ? 'bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500'
                          : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {canBook ? 'Voir & réserver' : 'Voir détails'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function NearbyPlaceResolver({
  events,
  onResolvedUpdate,
  onResolvingChange,
}: {
  events: SportEvent[];
  onResolvedUpdate: () => void;
  onResolvingChange: (resolving: boolean) => void;
}) {
  const placesLib = useMapsLibrary('places');

  useEffect(() => {
    if (!placesLib || events.length === 0) {
      onResolvingChange(false);
      return;
    }

    const toResolve = events.filter((ev) => {
      if (ev.hasCoords) return false;
      const key = buildEventGeoCacheKey(ev);
      return !(key in sessionResolvedCoordsCache);
    });

    if (toResolve.length === 0) {
      onResolvingChange(false);
      return;
    }

    let cancelled = false;
    onResolvingChange(true);

    const resolveBatch = async () => {
      let quotaHit = false;
      const batch = toResolve.slice(0, 12);
      for (const ev of batch) {
        if (cancelled || quotaHit) break;
        const key = buildEventGeoCacheKey(ev);
        const primaryQuery = [ev.location, ev.city, ev.region]
          .filter(Boolean)
          .join(', ');
        const cityFallbackQuery = [ev.city, ev.region]
          .filter(Boolean)
          .join(', ');

        try {
          const res = await placesLib.Place.searchByText({
            textQuery: primaryQuery,
            fields: ['location'],
            language: 'fr',
            region: 'fr',
            maxResultCount: 1,
          });
          let loc = res.places?.[0]?.location;
          if (!loc && cityFallbackQuery && cityFallbackQuery !== primaryQuery) {
            const fallbackRes = await placesLib.Place.searchByText({
              textQuery: cityFallbackQuery,
              fields: ['location'],
              language: 'fr',
              region: 'fr',
              maxResultCount: 1,
            });
            loc = fallbackRes.places?.[0]?.location;
          }
          sessionResolvedCoordsCache[key] = loc
            ? { lat: loc.lat(), lng: loc.lng() }
            : null;
        } catch (err: unknown) {
          if (isQuotaError(err)) {
            quotaHit = true;
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          } else {
            sessionResolvedCoordsCache[key] = null;
          }
        }
      }

      if (!cancelled) {
        onResolvingChange(false);
        onResolvedUpdate();
      }
    };

    void resolveBatch();

    return () => {
      cancelled = true;
    };
  }, [events, placesLib, onResolvedUpdate, onResolvingChange]);

  return null;
}

function NearbyGoogleMapCanvas({
  entries,
  disciplines,
  searchCenter,
  radiusKm,
  recenterNonce,
  selectedEventId,
  onSelectMarker,
  onSelectEvent,
  resolvingPlaces,
}: {
  entries: NearbyEventEntry[];
  disciplines: DisciplineItem[];
  searchCenter: SearchCenter | null;
  radiusKm: number;
  recenterNonce: number;
  selectedEventId: string | null;
  onSelectMarker: (eventId: string | null) => void;
  onSelectEvent: (event: SportEvent) => void;
  resolvingPlaces: boolean;
}) {
  const isDark = useIsDarkTheme();
  const status = useApiLoadingStatus();
  const { hasRenderError, containerRef } = useMapRenderError();
  const [userInfoOpen, setUserInfoOpen] = useState(false);

  const selectedEntry = useMemo(
    () => entries.find((m) => m.event.id === selectedEventId) ?? null,
    [entries, selectedEventId]
  );

  useEffect(() => {
    setUserInfoOpen(false);
  }, [searchCenter?.lat, searchCenter?.lng]);

  if (
    hasRenderError ||
    status === APILoadingStatus.FAILED ||
    status === APILoadingStatus.AUTH_FAILURE
  ) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
        Impossible d’afficher la carte interactive Google Maps pour le moment. Les séances situées dans votre rayon restent listées et triées par distance ci-dessous.
      </div>
    );
  }

  const initialCenter =
    searchCenter ?? entries[0]?.pos ?? DEFAULT_FRANCE_CENTER;
  const initialZoom = searchCenter ? 11 : entries.length > 1 ? 6 : 5;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div ref={containerRef} className="relative h-[360px] w-full sm:h-[460px]">
        <GoogleMap
          id="nearby-events-map"
          key={isDark ? 'nearby-dark' : 'nearby-light'}
          mapId="DEMO_MAP_ID"
          defaultCenter={initialCenter}
          defaultZoom={initialZoom}
          colorScheme={isDark ? 'DARK' : 'LIGHT'}
          gestureHandling="greedy"
          streetViewControl={false}
          mapTypeControl={false}
          internalUsageAttributionIds={MAPS_ATTRIBUTION_IDS}
          style={{ width: '100%', height: '100%' }}
        >
          <NearbyBoundsFitter
            searchCenter={searchCenter}
            radiusKm={radiusKm}
            positions={entries.map((e) => e.pos)}
            recenterNonce={recenterNonce}
          />

          {searchCenter && (
            <>
              <Circle
                center={{ lat: searchCenter.lat, lng: searchCenter.lng }}
                radius={radiusKm * 1000}
                strokeColor={isDark ? '#34d399' : '#059669'}
                strokeOpacity={0.85}
                strokeWeight={2}
                fillColor="#10b981"
                fillOpacity={isDark ? 0.14 : 0.1}
                clickable={false}
              />

              <AdvancedMarker
                position={{ lat: searchCenter.lat, lng: searchCenter.lng }}
                title={searchCenter.label}
                zIndex={1000}
                onClick={() => {
                  onSelectMarker(null);
                  setUserInfoOpen((prev) => !prev);
                }}
              >
                <div className="relative flex items-center justify-center">
                  <span className="absolute h-7 w-7 animate-ping rounded-full bg-sky-500/35" />
                  <span className="relative flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-sky-600 shadow-md dark:border-slate-900">
                    <span className="h-2 w-2 rounded-full bg-white" />
                  </span>
                </div>
              </AdvancedMarker>

              {userInfoOpen && (
                <InfoWindow
                  position={{ lat: searchCenter.lat, lng: searchCenter.lng }}
                  onCloseClick={() => setUserInfoOpen(false)}
                  maxWidth={220}
                  headerContent={
                    <span className="text-xs font-bold">
                      {searchCenter.source === 'gps'
                        ? 'Votre position'
                        : 'Point de départ'}
                    </span>
                  }
                >
                  <p className="text-[11px] opacity-85">
                    {searchCenter.label} · Rayon {radiusKm} km
                  </p>
                </InfoWindow>
              )}
            </>
          )}

          {entries.map(({ event, pos, distanceKm }) => {
            const discStyle = getDisciplineStyle(event.discipline, disciplines);
            const isSelected = selectedEventId === event.id;
            return (
              <AdvancedMarker
                key={event.id}
                position={pos}
                title={
                  distanceKm !== null
                    ? `${event.title} — À ${formatDistanceKm(distanceKm)}`
                    : `${event.title} (${event.city})`
                }
                zIndex={isSelected ? 900 : 100}
                onClick={() => {
                  setUserInfoOpen(false);
                  onSelectMarker(event.id);
                }}
              >
                <Pin
                  background={isSelected ? '#0f172a' : discStyle.hex}
                  borderColor={isSelected ? '#020617' : discStyle.borderHex}
                  glyphColor="#ffffff"
                  scale={isSelected ? 1.18 : 1}
                >
                  <DisciplineIcon
                    disciplineName={event.discipline}
                    catalog={disciplines}
                    className="h-3.5 w-3.5 text-white"
                  />
                </Pin>
              </AdvancedMarker>
            );
          })}

          {selectedEntry && (
            <InfoWindow
              position={selectedEntry.pos}
              onCloseClick={() => onSelectMarker(null)}
              maxWidth={270}
              headerContent={
                <span className="text-xs font-bold leading-snug">
                  {selectedEntry.event.title}
                </span>
              }
            >
              <div className="space-y-1.5 pt-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {selectedEntry.distanceKm !== null && (
                    <span className="inline-flex items-center rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald-800">
                      À {formatDistanceKm(selectedEntry.distanceKm)}
                    </span>
                  )}
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-semibold"
                    style={{
                      color: getDisciplineStyle(
                        selectedEntry.event.discipline,
                        disciplines
                      ).hex,
                    }}
                  >
                    <DisciplineIcon
                      disciplineName={selectedEntry.event.discipline}
                      catalog={disciplines}
                      className="h-3 w-3 shrink-0"
                    />
                    {selectedEntry.event.discipline}
                  </span>
                </div>
                <p className="text-xs capitalize opacity-90">
                  {formatFrenchDateShort(selectedEntry.event.startAt.toDate())} à{' '}
                  {formatFrenchTime(selectedEntry.event.startAt.toDate())}
                </p>
                <p className="text-xs opacity-80">
                  {selectedEntry.event.location} · {selectedEntry.event.city}
                </p>
                <p className="text-[11px] font-medium opacity-90">
                  {formatEventCoachesLabel(selectedEntry.event)} ·{' '}
                  <span className="font-mono font-semibold text-emerald-700">
                    {formatEventPrice(selectedEntry.event)}
                  </span>
                </p>
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => onSelectEvent(selectedEntry.event)}
                    className="flex-1 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 cursor-pointer"
                  >
                    Voir &amp; réserver
                  </button>
                  <a
                    href={buildDirectionsUrl(
                      searchCenter,
                      selectedEntry.pos,
                      selectedEntry.event
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Itinéraire
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>

        {resolvingPlaces && (
          <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 shadow-xs dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200">
            <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
            Géolocalisation des lieux...
          </div>
        )}
      </div>
    </div>
  );
}

function NearbyBoundsFitter({
  searchCenter,
  radiusKm,
  positions,
  recenterNonce,
}: {
  searchCenter: SearchCenter | null;
  radiusKm: number;
  positions: GeoPoint[];
  recenterNonce: number;
}) {
  const map = useMap('nearby-events-map');
  const coreLib = useMapsLibrary('core');
  const prevRadiusRef = useRef<number>(radiusKm);

  const positionsKey = useMemo(
    () =>
      positions.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|'),
    [positions]
  );

  const applyCamera = useCallback(
    (center: GeoPoint, zoom: number) => {
      if (!map) return;
      if (typeof map.moveCamera === 'function') {
        map.moveCamera({ center, zoom });
      } else {
        map.setCenter(center);
        map.setZoom(zoom);
      }
    },
    [map]
  );

  const fit = useCallback(() => {
    if (!map) return;
    const radiusChanged = prevRadiusRef.current !== radiusKm;
    prevRadiusRef.current = radiusKm;

    const mapDiv = map.getDiv();
    const widthPx = mapDiv?.offsetWidth ?? 600;
    const heightPx = mapDiv?.offsetHeight ?? 400;

    if (searchCenter) {
      const targetZoom = computeZoomForRadiusKm(
        radiusKm,
        searchCenter.lat,
        widthPx,
        heightPx
      );
      applyCamera(
        { lat: searchCenter.lat, lng: searchCenter.lng },
        targetZoom
      );
      return;
    }

    if (radiusChanged) {
      const currentCenter = map.getCenter();
      const targetCenter = currentCenter
        ? { lat: currentCenter.lat(), lng: currentCenter.lng() }
        : positions[0] ?? DEFAULT_FRANCE_CENTER;
      const targetZoom = computeZoomForRadiusKm(
        radiusKm,
        targetCenter.lat,
        widthPx,
        heightPx
      );
      applyCamera(targetCenter, targetZoom);
      return;
    }

    if (!coreLib || positions.length === 0) return;
    if (positions.length === 1) {
      applyCamera(positions[0], 13);
      return;
    }
    const bounds = new coreLib.LatLngBounds();
    positions.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    map,
    coreLib,
    applyCamera,
    searchCenter?.lat,
    searchCenter?.lng,
    radiusKm,
    positionsKey,
    recenterNonce,
  ]);

  useEffect(() => {
    fit();
  }, [fit]);

  return null;
}
