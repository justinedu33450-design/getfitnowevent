/// <reference types="google.maps" />
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { MapPin } from 'lucide-react';
import { VALIDATION_LIMITS } from '../types';

export interface PlaceSelection {
  location: string;
  city: string;
  region: string;
  hasCoords: boolean;
  lat: number;
  lng: number;
}

interface PlaceAutocompleteInputProps {
  value: string;
  hasMapsApiKey: boolean;
  onChangeText: (value: string) => void;
  onSelectPlace: (place: PlaceSelection) => void;
  onSubmitText?: (value: string) => void;
  inputId?: string;
  required?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  inputClassName?: string;
}

export function PlaceAutocompleteInput({
  value,
  hasMapsApiKey,
  onChangeText,
  onSelectPlace,
  onSubmitText,
  inputId = 'ev-location',
  required = true,
  placeholder = 'Rechercher une adresse ou un lieu...',
  ariaLabel,
  inputClassName,
}: PlaceAutocompleteInputProps) {
  const defaultClassName =
    'mt-1 min-h-[44px] w-full rounded-[10px] border border-slate-300 bg-white px-3 text-base sm:text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#E5E5E5] dark:placeholder:text-[#525252] dark:focus:border-[#4ADE80] dark:focus:ring-[#4ADE80]/20';

  if (!hasMapsApiKey) {
    return (
      <input
        id={inputId}
        type="text"
        required={required}
        minLength={required ? VALIDATION_LIMITS.LOCATION_MIN : undefined}
        maxLength={VALIDATION_LIMITS.LOCATION_MAX}
        value={value}
        onChange={(e) => onChangeText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onSubmitText) {
            e.preventDefault();
            onSubmitText(value);
          }
        }}
        placeholder={
          placeholder || 'Ex. 12 Rue Oberkampf ou Parc des Buttes-Chaumont'
        }
        aria-label={ariaLabel}
        className={inputClassName ?? defaultClassName}
      />
    );
  }

  return (
    <PlaceAutocompleteInner
      value={value}
      onChangeText={onChangeText}
      onSelectPlace={onSelectPlace}
      onSubmitText={onSubmitText}
      inputId={inputId}
      required={required}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      inputClassName={inputClassName ?? defaultClassName}
    />
  );
}

function PlaceAutocompleteInner({
  value,
  onChangeText,
  onSelectPlace,
  onSubmitText,
  inputId,
  required,
  placeholder,
  ariaLabel,
  inputClassName,
}: Omit<PlaceAutocompleteInputProps, 'hasMapsApiKey'> & {
  inputId: string;
  required: boolean;
  placeholder: string;
  inputClassName: string;
}) {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const selectingRef = useRef(false);
  const blurTimerRef = useRef<number | null>(null);
  const [suggestions, setSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!placesLib) return;
    const trimmed = value.trim();
    if (trimmed.length < 3 || !open) {
      setSuggestions([]);
      return;
    }

    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: trimmed,
        language: 'fr',
        includedRegionCodes: ['fr', 'be', 'ch', 'lu'],
        sessionToken: sessionTokenRef.current ?? undefined,
      })
        .then((res) => {
          if (!cancelled) {
            setSuggestions(res.suggestions ?? []);
          }
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (
            msg.includes('RESOURCE_EXHAUSTED') ||
            msg.includes('OVER_QUERY_LIMIT') ||
            msg.includes('429')
          ) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [placesLib, value, open]);

  const handleInput = useCallback(
    (e: FormEvent<HTMLInputElement>) => {
      onChangeText((e.target as HTMLInputElement).value);
      setOpen(true);
    },
    [onChangeText]
  );

  const handleSuggestionClick = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (selectingRef.current) return;
      if (!placesLib || !suggestion.placePrediction) return;
      selectingRef.current = true;
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }

      const place = suggestion.placePrediction.toPlace();
      try {
        await place.fetchFields({
          fields: [
            'displayName',
            'formattedAddress',
            'addressComponents',
            'location',
          ],
        });

        const locality =
          place.addressComponents?.find((c) => c.types.includes('locality'))
            ?.longText ||
          place.addressComponents?.find((c) =>
            c.types.includes('administrative_area_level_2')
          )?.longText ||
          '';

        const regionName =
          place.addressComponents?.find((c) =>
            c.types.includes('administrative_area_level_1')
          )?.longText || '';

        const displayLabel =
          place.displayName && place.formattedAddress
            ? `${place.displayName} — ${place.formattedAddress}`
            : place.formattedAddress ||
              place.displayName ||
              suggestion.placePrediction.text.text;

        const loc = place.location;
        onSelectPlace({
          location: displayLabel.slice(0, VALIDATION_LIMITS.LOCATION_MAX),
          city: locality.slice(0, VALIDATION_LIMITS.CITY_MAX),
          region: regionName.slice(0, VALIDATION_LIMITS.REGION_MAX),
          hasCoords: Boolean(loc),
          lat: loc ? loc.lat() : 0,
          lng: loc ? loc.lng() : 0,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('429')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      } finally {
        selectingRef.current = false;
        sessionTokenRef.current = null;
        setSuggestions([]);
        setOpen(false);
      }
    },
    [placesLib, onSelectPlace]
  );

  return (
    <div className="relative">
      <input
        id={inputId}
        type="text"
        required={required}
        minLength={required ? VALIDATION_LIMITS.LOCATION_MIN : undefined}
        maxLength={VALIDATION_LIMITS.LOCATION_MAX}
        value={value}
        onInput={handleInput}
        onFocus={() => {
          if (value.trim().length >= 3) {
            setOpen(true);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onSubmitText) {
            e.preventDefault();
            setOpen(false);
            onSubmitText(value);
          }
        }}
        onBlur={() => {
          if (blurTimerRef.current !== null) {
            window.clearTimeout(blurTimerRef.current);
          }
          blurTimerRef.current = window.setTimeout(() => {
            if (!selectingRef.current) {
              setOpen(false);
            }
          }, 320);
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        autoCorrect="off"
        enterKeyHint={onSubmitText ? 'search' : undefined}
        className={inputClassName}
      />

      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-[12px] border border-slate-200 bg-white shadow-lg dark:border-[#262626] dark:bg-[#161616]">
          {suggestions.map((s, idx) => (
            <li key={idx}>
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  void handleSuggestionClick(s);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => {
                  void handleSuggestionClick(s);
                }}
                className="flex min-h-[44px] w-full items-start gap-2 px-3 py-2.5 text-left text-xs text-slate-800 hover:bg-slate-50 active:bg-slate-100 dark:text-[#E5E5E5] dark:hover:bg-[#1F1F1F] dark:active:bg-[#262626] cursor-pointer touch-manipulation"
              >
                <MapPin
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-[#4ADE80]"
                  aria-hidden="true"
                />
                <span>{s.placePrediction?.text.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
