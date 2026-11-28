import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  List,
  LocateFixed,
  Lock,
  Map as MapIcon,
  MapPin,
  Maximize2,
  MessageSquare,
  Plus,
  Search,
  SlidersHorizontal,
  UserCheck,
} from 'lucide-react';
import {
  Discipline,
  DisciplineItem,
  EventRatingSummary,
  SportEvent,
} from '../types';
import {
  canMemberMessageEventCoach,
  evaluateEventBooking,
  formatEventCoachesLabel,
  formatEventPrice,
  formatExternalUrlLabel,
  formatFrenchDateLong,
  formatFrenchTime,
  formatPaymentModeLabel,
  formatTimeRange,
  getEventDurationMinutes,
  getMonthDaysGrid,
  getSafeEventCoverImageSrc,
  getSafeExternalHref,
  getWeekDays,
  hasEventDuration,
  isSameCalendarDay,
  normalizeCoverImagePosition,
} from '../utils/dateAndValidation';
import { getDisciplineStyle } from '../utils/disciplineColors';
import { DisciplineIcon } from './DisciplineIcon';
import { EventsOverviewMap } from './EventLocationMap';
import {
  EventRatingInline,
  EventShareButton,
} from './EventEngagementWidgets';
import { EventImageLightbox } from './EventImageLightbox';

interface CalendarViewProps {
  events: SportEvent[];
  disciplines: DisciplineItem[];
  nowMs: number;
  isCoach: boolean;
  isCoachAdmin?: boolean;
  registeredEventIds?: Set<string>;
  onShareEvent?: (event: SportEvent) => void;
  ratingSummaryByEventId?: Map<string, EventRatingSummary>;
  loading: boolean;
  hasMapsApiKey: boolean;
  onSelectEvent: (event: SportEvent) => void;
  onCreateEventForDate: (date: Date) => void;
  onMessageCoach?: (event: SportEvent) => void;
  onOpenNearbyMap?: () => void;
}

const WEEKDAY_LABELS = ['LU', 'MA', 'ME', 'JE', 'VE', 'SA', 'DI'];

export function CalendarView({
  events,
  disciplines,
  nowMs,
  isCoach,
  isCoachAdmin = false,
  registeredEventIds,
  onShareEvent,
  ratingSummaryByEventId,
  loading,
  hasMapsApiKey,
  onSelectEvent,
  onCreateEventForDate,
  onMessageCoach,
  onOpenNearbyMap,
}: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [dayDisplayMode, setDayDisplayMode] = useState<'list' | 'map'>('list');
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [disciplineFilter, setDisciplineFilter] = useState<'all' | Discipline>(
    'all'
  );
  const [cityQuery, setCityQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [dayAgendaExpanded, setDayAgendaExpanded] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{
    src: string;
    title: string;
  } | null>(null);
  const skipNextAutoCollapseRef = useRef(false);
  const prevSelectedDayKeyRef = useRef<string | null>(null);
  const prevHasEventsRef = useRef<boolean>(false);

  const disciplineFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    disciplines.forEach((d) => map.set(d.name.toLowerCase(), d.name));
    events.forEach((ev) => {
      if (ev.discipline?.trim()) {
        const key = ev.discipline.trim().toLowerCase();
        if (!map.has(key)) map.set(key, ev.discipline.trim());
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, 'fr', { sensitivity: 'base' })
    );
  }, [disciplines, events]);

  const availableCities = useMemo(() => {
    const set = new Set<string>();
    events.forEach((ev) => {
      if (ev.city?.trim()) set.add(ev.city.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [events]);

  const availableRegions = useMemo(() => {
    const set = new Set<string>();
    events.forEach((ev) => {
      if (ev.region?.trim()) set.add(ev.region.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [events]);

  const availableSearchSuggestions = useMemo(() => {
    return Array.from(new Set([...availableCities, ...availableRegions])).sort(
      (a, b) => a.localeCompare(b, 'fr')
    );
  }, [availableCities, availableRegions]);

  const filteredEvents = useMemo(() => {
    const cq = cityQuery.trim().toLowerCase();
    const rq = regionFilter.trim().toLowerCase();
    return events.filter((e) => {
      if (disciplineFilter !== 'all' && e.discipline !== disciplineFilter) {
        return false;
      }
      if (rq && (e.region || '').trim().toLowerCase() !== rq) {
        return false;
      }
      if (cq) {
        const cityMatch = e.city.toLowerCase().includes(cq);
        const regionMatch = (e.region || '').toLowerCase().includes(cq);
        if (!cityMatch && !regionMatch) return false;
      }
      return true;
    });
  }, [events, disciplineFilter, cityQuery, regionFilter]);

  const monthDays = useMemo(
    () => getMonthDaysGrid(anchorDate.getFullYear(), anchorDate.getMonth()),
    [anchorDate]
  );

  const weekDays = useMemo(() => getWeekDays(anchorDate), [anchorDate]);

  const eventsForSelectedDay = useMemo(() => {
    return filteredEvents.filter((ev) =>
      isSameCalendarDay(ev.startAt.toDate(), selectedDate)
    );
  }, [filteredEvents, selectedDate]);

  const selectedDayKey = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`;
  const hasEventsForSelectedDay = eventsForSelectedDay.length > 0;

  useEffect(() => {
    const dayChanged = prevSelectedDayKeyRef.current !== selectedDayKey;
    const eventsPresenceChanged =
      prevHasEventsRef.current !== hasEventsForSelectedDay;

    prevSelectedDayKeyRef.current = selectedDayKey;
    prevHasEventsRef.current = hasEventsForSelectedDay;

    if (skipNextAutoCollapseRef.current) {
      skipNextAutoCollapseRef.current = false;
      setDayAgendaExpanded(true);
      return;
    }

    if (dayChanged || eventsPresenceChanged) {
      setDayAgendaExpanded(hasEventsForSelectedDay);
    }
  }, [selectedDayKey, hasEventsForSelectedDay]);

  const headerTitle = useMemo(() => {
    if (viewMode === 'month') {
      return new Intl.DateTimeFormat('fr-FR', {
        month: 'long',
        year: 'numeric',
      }).format(anchorDate);
    }
    const start = weekDays[0];
    const end = weekDays[6];
    const fmtDay = new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
    });
    return `Semaine du ${fmtDay.format(start)} au ${fmtDay.format(end)} ${end.getFullYear()}`;
  }, [viewMode, anchorDate, weekDays]);

  const handlePrev = () => {
    if (viewMode === 'month') {
      setAnchorDate(
        new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1)
      );
    } else {
      setAnchorDate(
        new Date(
          anchorDate.getFullYear(),
          anchorDate.getMonth(),
          anchorDate.getDate() - 7
        )
      );
    }
  };

  const handleNext = () => {
    if (viewMode === 'month') {
      setAnchorDate(
        new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1)
      );
    } else {
      setAnchorDate(
        new Date(
          anchorDate.getFullYear(),
          anchorDate.getMonth(),
          anchorDate.getDate() + 7
        )
      );
    }
  };

  const handleToday = () => {
    const today = new Date();
    setAnchorDate(today);
    setSelectedDate(today);
  };

  const handleTodayMap = () => {
    const todayDate = new Date();
    const todayKey = `${todayDate.getFullYear()}-${todayDate.getMonth()}-${todayDate.getDate()}`;
    if (todayKey !== selectedDayKey) {
      skipNextAutoCollapseRef.current = true;
    }
    setAnchorDate(todayDate);
    setSelectedDate(todayDate);
    setDayDisplayMode('map');
    setDayAgendaExpanded(true);
    window.setTimeout(() => {
      document
        .getElementById('day-agenda-panel')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const today = new Date(nowMs);

  const getEventVisualState = (ev: SportEvent) => {
    const evalState = evaluateEventBooking(ev, nowMs, {
      hideRegisteredCount: !isCoach,
    }).state;
    const discStyle = getDisciplineStyle(ev.discipline, disciplines);
    const isMuted = evalState === 'cancelled' || evalState === 'past';

    const statusColor =
      evalState === 'open'
        ? 'text-emerald-700 dark:text-[#4ADE80]'
        : evalState === 'closed'
          ? 'text-amber-700 dark:text-amber-400'
          : evalState === 'full' || evalState === 'cancelled'
            ? 'text-rose-700 dark:text-rose-400'
            : 'text-slate-500 dark:text-[#8E8E8E]';

    const container =
      evalState === 'cancelled'
        ? `border-slate-200 border-l-4 ${discStyle.leftBorder} bg-slate-100 text-slate-500 line-through hover:bg-slate-200/70 dark:border-[#262626] dark:bg-[#1F1F1F]/70 dark:text-[#8E8E8E] dark:hover:bg-[#1F1F1F]`
        : isMuted
          ? `border-slate-200 border-l-4 ${discStyle.leftBorder} bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-[#262626] dark:bg-[#1F1F1F]/50 dark:text-[#A3A3A3] dark:hover:bg-[#1F1F1F]`
          : `${discStyle.border} border-l-4 ${discStyle.leftBorder} ${discStyle.cardBg} text-slate-900 dark:text-[#E5E5E5]`;

    return {
      discStyle,
      container,
      dotColor: discStyle.swatchBg,
      statusColor,
      evalState,
    };
  };

  return (
    <section
      id="calendrier-section"
      className="calendar-dot-backdrop w-full flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
    >
      <div className="mx-auto max-w-4xl space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-[#8E8E8E] sm:text-sm">
            Touchez une date pour consulter les séances et réserver votre place.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {/* Segmented Month / Week toggle */}
          <div
            role="group"
            aria-label="Mode d'affichage du calendrier"
            className="flex items-center gap-1 rounded-[10px] border border-slate-200 bg-white p-1 dark:border-[#262626] dark:bg-[#161616]"
          >
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                viewMode === 'month'
                  ? 'bg-slate-900 text-white shadow-sm dark:bg-[#4ADE80] dark:text-[#0A0A0A] dark:font-semibold'
                  : 'text-slate-600 hover:text-slate-900 dark:text-[#A3A3A3] dark:hover:text-[#E5E5E5]'
              }`}
            >
              Mois
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                viewMode === 'week'
                  ? 'bg-slate-900 text-white shadow-sm dark:bg-[#4ADE80] dark:text-[#0A0A0A] dark:font-semibold'
                  : 'text-slate-600 hover:text-slate-900 dark:text-[#A3A3A3] dark:hover:text-[#E5E5E5]'
              }`}
            >
              Semaine
            </button>
          </div>

          <button
            type="button"
            onClick={handleToday}
            className="inline-flex h-[40px] items-center rounded-[10px] border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:border-[#262626] dark:bg-[#161616] dark:text-[#E5E5E5] dark:hover:bg-[#1F1F1F] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            Aujourd’hui
          </button>

          <button
            type="button"
            onClick={handleTodayMap}
            className="inline-flex h-[40px] items-center gap-1.5 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-[#4ADE80]/30 dark:bg-[#4ADE80]/10 dark:text-[#4ADE80] dark:hover:bg-[#4ADE80]/20 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Carte du jour
          </button>
          {onOpenNearbyMap && (
            <button
              type="button"
              onClick={onOpenNearbyMap}
              className="inline-flex h-[40px] items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-[#262626] dark:bg-[#161616] dark:text-[#E5E5E5] dark:hover:bg-[#1F1F1F] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <LocateFixed className="h-3.5 w-3.5 text-emerald-700 dark:text-[#4ADE80]" aria-hidden="true" />
              Autour de moi
            </button>
          )}
        </div>
      </div>

      {/* Grouped Filters & Quick City Pills (Collapsible) */}
      <div className="rounded-[16px] border border-slate-200 bg-white shadow-sm dark:border-[#262626] dark:bg-[#161616] dark:shadow-[0_12px_30px_-14px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 sm:px-4">
          <button
            type="button"
            onClick={() => setFiltersExpanded((prev) => !prev)}
            aria-expanded={filtersExpanded}
            aria-controls="calendar-filters-body"
            className="flex flex-1 items-center gap-2.5 text-left min-w-0 cursor-pointer"
          >
            <SlidersHorizontal
              className="h-4 w-4 shrink-0 text-emerald-700 dark:text-[#4ADE80]"
              aria-hidden="true"
            />
            <span className="text-xs font-semibold text-slate-800 dark:text-[#E5E5E5] sm:text-sm">
              Filtres &amp; villes
            </span>
            {(cityQuery.trim() || regionFilter || disciplineFilter !== 'all') && (
              <span className="truncate text-[11px] font-medium text-emerald-700 dark:text-[#4ADE80]">
                {[
                  cityQuery.trim() ? `« ${cityQuery.trim()} »` : null,
                  regionFilter || null,
                  disciplineFilter !== 'all' ? disciplineFilter : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </button>

          <div className="flex items-center gap-2 shrink-0">
            {(cityQuery.trim() || regionFilter || disciplineFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setCityQuery('');
                  setRegionFilter('');
                  setDisciplineFilter('all');
                }}
                className="text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:text-[#8E8E8E] dark:hover:text-[#E5E5E5] cursor-pointer"
              >
                Réinitialiser
              </button>
            )}
            <button
              type="button"
              onClick={() => setFiltersExpanded((prev) => !prev)}
              aria-expanded={filtersExpanded}
              aria-controls="calendar-filters-body"
              aria-label={
                filtersExpanded
                  ? 'Replier les filtres et villes'
                  : 'Déplier les filtres et villes'
              }
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#A3A3A3] dark:hover:bg-[#262626] dark:hover:text-[#E5E5E5] cursor-pointer"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  filtersExpanded ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        {filtersExpanded && (
          <div
            id="calendar-filters-body"
            className="space-y-3 border-t border-slate-100 px-3.5 py-3 dark:border-[#262626] sm:px-4"
          >
            {/* Filters Row: City/Region search + Region select + Discipline filter */}
            <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
              {/* City or Region Search Input */}
              <div className="relative w-full sm:w-56">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-[#8E8E8E]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={cityQuery}
                  onChange={(e) => setCityQuery(e.target.value)}
                  placeholder="Rechercher par ville ou région..."
                  aria-label="Rechercher les événements par ville ou région"
                  list="calendar-locations-list"
                  className="min-h-[40px] w-full rounded-[10px] border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#E5E5E5] dark:placeholder:text-[#525252] dark:focus:border-[#4ADE80] dark:focus:ring-[#4ADE80]/20"
                />
                <datalist id="calendar-locations-list">
                  {availableSearchSuggestions.map((loc) => (
                    <option key={loc} value={loc} />
                  ))}
                </datalist>
              </div>

              {/* Region Select */}
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                aria-label="Filtrer par région"
                className="min-h-[40px] w-full rounded-[10px] border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#E5E5E5] dark:focus:border-[#4ADE80] dark:focus:ring-[#4ADE80]/20 sm:w-auto"
              >
                <option value="">Toutes les régions</option>
                {availableRegions.map((reg) => (
                  <option key={reg} value={reg}>
                    {reg}
                  </option>
                ))}
              </select>

              {/* Discipline Select List (alphabetical) */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {disciplineFilter !== 'all' && (
                  <span
                    className={`flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[10px] border ${getDisciplineStyle(disciplineFilter, disciplines).softBg} ${getDisciplineStyle(disciplineFilter, disciplines).border} ${getDisciplineStyle(disciplineFilter, disciplines).text}`}
                    aria-hidden="true"
                  >
                    <DisciplineIcon
                      disciplineName={disciplineFilter}
                      catalog={disciplines}
                      className="h-4 w-4"
                    />
                  </span>
                )}
                <select
                  value={disciplineFilter}
                  onChange={(e) => setDisciplineFilter(e.target.value)}
                  aria-label="Filtrer par discipline"
                  className="min-h-[40px] w-full rounded-[10px] border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#E5E5E5] dark:focus:border-[#4ADE80] dark:focus:ring-[#4ADE80]/20 sm:w-auto"
                >
                  <option value="all">Toutes les disciplines</option>
                  {disciplineFilterOptions.map((disc) => (
                    <option key={disc} value={disc}>
                      {disc}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick city pills if multiple cities exist */}
            {availableCities.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 pt-3 pb-0.5 dark:border-[#262626]">
                <span className="text-xs font-medium text-slate-500 dark:text-[#8E8E8E] whitespace-nowrap shrink-0 mr-1">
                  Villes :
                </span>
                <button
                  type="button"
                  onClick={() => setCityQuery('')}
                  className={`min-h-[32px] rounded-[8px] border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    cityQuery.trim() === ''
                      ? 'border-emerald-700 bg-emerald-700 text-white dark:border-[#4ADE80] dark:bg-[#4ADE80] dark:text-[#0A0A0A] dark:font-semibold'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#A3A3A3] dark:hover:bg-[#262626] dark:hover:text-[#E5E5E5]'
                  }`}
                >
                  Toutes
                </button>
                {availableCities.map((city) => {
                  const active =
                    cityQuery.trim().toLowerCase() === city.toLowerCase();
                  return (
                    <button
                      key={city}
                      type="button"
                      onClick={() => setCityQuery(active ? '' : city)}
                      className={`min-h-[32px] rounded-[8px] border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        active
                          ? 'border-emerald-700 bg-emerald-700 text-white dark:border-[#4ADE80] dark:bg-[#4ADE80] dark:text-[#0A0A0A] dark:font-semibold'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#A3A3A3] dark:hover:bg-[#262626] dark:hover:text-[#E5E5E5]'
                      }`}
                    >
                      {city}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Two Vertically Stacked Cards: Calendar (Top) + Selected Day Detail (Bottom) */}
      <div className="flex flex-col gap-5">
        {/* Card 1: Calendar */}
        <div className="overflow-hidden rounded-[16px] border border-slate-200 bg-white p-4 shadow-sm dark:border-[#262626] dark:bg-[#161616] dark:shadow-[0_18px_40px_-16px_rgba(0,0,0,0.85)] sm:p-5">
          {/* Month / Period Navigation Header (#1F1F1F, radius 10px) */}
          <div className="flex items-center justify-between rounded-[10px] bg-slate-100 px-2 py-1.5 dark:bg-[#1F1F1F]">
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Période précédente"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-white hover:text-slate-950 dark:text-[#A3A3A3] dark:hover:bg-[#2A2A2A] dark:hover:text-[#E5E5E5] cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>

            <h2 className="font-display text-sm font-semibold tracking-tight text-slate-900 capitalize dark:text-[#E5E5E5] sm:text-base">
              {headerTitle}
            </h2>

            <button
              type="button"
              onClick={handleNext}
              aria-label="Période suivante"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-white hover:text-slate-950 dark:text-[#A3A3A3] dark:hover:bg-[#2A2A2A] dark:hover:text-[#E5E5E5] cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {loading ? (
            <div className="pt-4 space-y-3">
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 35 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-11 sm:h-12 animate-pulse rounded-full bg-slate-100 dark:bg-[#1F1F1F]"
                  />
                ))}
              </div>
            </div>
          ) : viewMode === 'month' ? (
            <div className="pt-4">
              {/* Weekday Headers (2-letter uppercase, Monday start) */}
              <div className="grid grid-cols-7 pb-2">
                {WEEKDAY_LABELS.map((day) => (
                  <div
                    key={day}
                    className="py-1 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#8E8E8E]"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Numeric Calendar Grid (7x5 / dynamic exact weeks) */}
              <div className="grid grid-cols-7 gap-y-1.5 sm:gap-y-2">
                {monthDays.map((dayDate) => {
                  const isCurrentMonth =
                    dayDate.getMonth() === anchorDate.getMonth();
                  const isToday = isSameCalendarDay(dayDate, today);
                  const isSelected = isSameCalendarDay(dayDate, selectedDate);
                  const dayEvents = filteredEvents.filter((ev) =>
                    isSameCalendarDay(ev.startAt.toDate(), dayDate)
                  );
                  const hasEvents = dayEvents.length > 0;

                  return (
                    <div
                      key={dayDate.toISOString()}
                      onClick={() => setSelectedDate(dayDate)}
                      role="button"
                      tabIndex={0}
                      aria-label={`${formatFrenchDateLong(dayDate)}${
                        hasEvents
                          ? `, ${dayEvents.length} séance${dayEvents.length > 1 ? 's' : ''}`
                          : ''
                      }`}
                      aria-pressed={isSelected}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedDate(dayDate);
                        }
                      }}
                      className="group relative flex min-h-[48px] items-center justify-center rounded-xl transition-colors cursor-pointer sm:min-h-[56px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ADE80]"
                    >
                      <span
                        className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full font-sans text-sm tabular-nums transition-all sm:h-11 sm:w-11 ${
                          isSelected
                            ? 'bg-emerald-500 font-semibold text-white shadow-sm dark:bg-[#4ADE80] dark:text-[#0A0A0A]'
                            : isToday
                              ? 'ring-1 ring-emerald-500/60 font-semibold text-slate-900 hover:bg-slate-100 dark:ring-[#4ADE80]/50 dark:text-[#E5E5E5] dark:hover:bg-[#1F1F1F]'
                              : isCurrentMonth
                                ? 'font-medium text-slate-800 hover:bg-slate-100 dark:text-[#E5E5E5] dark:hover:bg-[#1F1F1F]'
                                : 'font-normal text-slate-300 hover:bg-slate-50 dark:text-[#525252] dark:hover:bg-[#1B1B1B]'
                        }`}
                      >
                        {dayDate.getDate()}
                        {hasEvents && (
                          <span
                            aria-hidden="true"
                            className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ${
                              isSelected
                                ? 'bg-emerald-600 ring-white dark:bg-[#4ADE80] dark:ring-[#161616]'
                                : 'bg-emerald-500 ring-white dark:bg-[#4ADE80] dark:ring-[#161616]'
                            }`}
                          />
                        )}
                      </span>

                      {isCoach && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCreateEventForDate(dayDate);
                          }}
                          title="Planifier une séance ce jour"
                          aria-label={`Planifier une séance le ${formatFrenchDateLong(dayDate)}`}
                          className="hidden h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-900 dark:text-[#8E8E8E] dark:hover:bg-[#262626] dark:hover:text-[#4ADE80] sm:group-hover:inline-flex absolute right-1 bottom-1 cursor-pointer"
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Week View */
            <div className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-[#262626] dark:border-[#262626]">
              {weekDays.map((dayDate) => {
                const isToday = isSameCalendarDay(dayDate, today);
                const isSelected = isSameCalendarDay(dayDate, selectedDate);
                const dayEvents = filteredEvents.filter((ev) =>
                  isSameCalendarDay(ev.startAt.toDate(), dayDate)
                );

                return (
                  <div
                    key={dayDate.toISOString()}
                    onClick={() => setSelectedDate(dayDate)}
                    className={`flex flex-col gap-3 p-3.5 sm:p-4 md:flex-row md:items-start md:gap-4 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/40 dark:bg-[#1C1C1C]'
                        : 'hover:bg-slate-50/70 dark:hover:bg-[#1B1B1B]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 md:w-36 md:shrink-0 xl:w-44">
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-semibold capitalize ${
                            isSelected
                              ? 'text-emerald-700 dark:text-[#4ADE80]'
                              : 'text-slate-900 dark:text-[#E5E5E5]'
                          }`}
                        >
                          {new Intl.DateTimeFormat('fr-FR', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'short',
                          }).format(dayDate)}
                        </p>
                        {isToday && (
                          <span className="text-xs font-medium text-emerald-700 dark:text-[#4ADE80]">
                            Aujourd’hui
                          </span>
                        )}
                      </div>
                      {isCoach && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCreateEventForDate(dayDate);
                          }}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-[#262626] dark:text-[#A3A3A3] dark:hover:bg-[#262626] dark:hover:text-[#E5E5E5] cursor-pointer"
                          title="Ajouter une séance ce jour"
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-2.5">
                      {dayEvents.length === 0 ? (
                        <p className="py-1 text-xs text-slate-400 dark:text-[#525252]">
                          Aucune séance programmée
                        </p>
                      ) : (
                        dayEvents.map((ev) => {
                          const evalInfo = evaluateEventBooking(ev, nowMs, {
                            hideRegisteredCount: !isCoach,
                          });
                          const style = getEventVisualState(ev);
                          const ratingSummary = ratingSummaryByEventId?.get(ev.id);
                          const coverImageSrc = getSafeEventCoverImageSrc(
                            ev.coverImageUrl
                          );
                          const coverImagePosition = normalizeCoverImagePosition(
                            ev.coverImagePosition
                          );
                          return (
                            <div
                              key={ev.id}
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectEvent(ev);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onSelectEvent(ev);
                                }
                              }}
                              className={`flex w-full min-w-0 flex-col gap-3 rounded-lg border p-3 sm:p-3.5 text-left transition-colors cursor-pointer xl:flex-row xl:items-center xl:justify-between xl:gap-4 ${style.container}`}
                            >
                              <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start">
                                {coverImageSrc && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setLightboxImage({
                                        src: coverImageSrc,
                                        title: ev.title,
                                      });
                                    }}
                                    aria-label={`Agrandir le visuel de ${ev.title}`}
                                    className="group relative aspect-[16/9] w-full overflow-hidden rounded-md border border-slate-200/80 bg-slate-900 dark:border-[#262626] sm:aspect-auto sm:h-20 sm:w-28 sm:shrink-0 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4ADE80]"
                                  >
                                    <img
                                      src={coverImageSrc}
                                      alt={ev.title}
                                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                                      style={{ objectPosition: coverImagePosition }}
                                      loading="lazy"
                                    />
                                    <span className="pointer-events-none absolute bottom-1 right-1 inline-flex items-center justify-center rounded bg-slate-950/65 p-1 text-white/95 backdrop-blur-xs">
                                      <Maximize2 className="h-3 w-3" aria-hidden="true" />
                                    </span>
                                  </button>
                                )}
                                <div className="min-w-0 flex-1 space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium">
                                    <span className="font-semibold tabular-nums whitespace-nowrap">
                                      {formatTimeRange(
                                        ev.startAt.toDate(),
                                        ev.durationMinutes
                                      )}
                                    </span>
                                    <span
                                      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold bg-white dark:bg-[#161616] shrink-0 ${style.discStyle.border} ${style.discStyle.text}`}
                                    >
                                      <DisciplineIcon
                                        disciplineName={ev.discipline}
                                        catalog={disciplines}
                                        className="h-3 w-3 shrink-0"
                                      />
                                      {ev.discipline}
                                    </span>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <p className="text-sm font-semibold leading-snug break-words">
                                      {ev.title}
                                    </p>
                                    {ratingSummary && (
                                      <EventRatingInline summary={ratingSummary} />
                                    )}
                                  </div>

                                  <div className="space-y-0.5 text-xs text-slate-600 dark:text-[#A3A3A3]">
                                    <p className="flex items-start gap-1.5 min-w-0">
                                      <MapPin
                                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-[#737373]"
                                        aria-hidden="true"
                                      />
                                      <span className="break-words">
                                        {ev.city}
                                        {ev.region ? ` (${ev.region})` : ''} — {ev.location}
                                      </span>
                                    </p>
                                    <p className="flex items-center gap-1.5 min-w-0 text-[11px]">
                                      <UserCheck
                                        className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-[#737373]"
                                        aria-hidden="true"
                                      />
                                      <span className="truncate">
                                        {formatEventCoachesLabel(ev)}
                                      </span>
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2.5 dark:border-[#262626] xl:border-t-0 xl:pt-0 xl:flex-nowrap xl:shrink-0 xl:justify-end">
                                <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
                                  {registeredEventIds?.has(ev.id) && (
                                    <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-[#4ADE80]/30 dark:bg-[#4ADE80]/10 dark:text-[#4ADE80]">
                                      Inscrit
                                    </span>
                                  )}
                                  <span
                                    className={`inline-flex items-center rounded-[6px] border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                                      ev.isPaid
                                        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300'
                                        : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-[#4ADE80]/30 dark:bg-[#4ADE80]/10 dark:text-[#4ADE80]'
                                    }`}
                                  >
                                    {formatEventPrice(ev)}
                                  </span>
                                  <p className={`text-xs font-semibold ${style.statusColor}`}>
                                    {evalInfo.statusLabel}
                                  </p>
                                </div>
                                {evalInfo.state !== 'cancelled' && onShareEvent && (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <EventShareButton
                                      compact
                                      eventTitle={ev.title}
                                      onClick={() => onShareEvent(ev)}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Card 2: Selected Day Detail / Context Panel */}
        <aside
          id="day-agenda-panel"
          className="flex flex-col rounded-[16px] border border-slate-200 bg-white p-4 shadow-sm dark:border-[#262626] dark:bg-[#161616] dark:shadow-[0_18px_40px_-16px_rgba(0,0,0,0.85)] sm:p-5"
        >
          <div>
            <div
              className={`flex items-center justify-between gap-3 ${
                dayAgendaExpanded
                  ? 'border-b border-slate-100 pb-4 dark:border-[#262626]'
                  : ''
              }`}
            >
              <button
                type="button"
                onClick={() => setDayAgendaExpanded((prev) => !prev)}
                aria-expanded={dayAgendaExpanded}
                aria-controls="day-agenda-panel-body"
                className="flex-1 text-left min-w-0 cursor-pointer"
              >
                <div className="flex items-center gap-2 text-emerald-700 dark:text-[#4ADE80]">
                  <CalendarIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <h3 className="font-display text-base font-semibold capitalize sm:text-lg">
                    {formatFrenchDateLong(selectedDate)}
                  </h3>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-[#8E8E8E] tabular-nums">
                  {eventsForSelectedDay.length === 0
                    ? 'Aucune séance ce jour'
                    : `${eventsForSelectedDay.length} séance${eventsForSelectedDay.length > 1 ? 's' : ''} ce jour`}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setDayAgendaExpanded((prev) => !prev)}
                aria-expanded={dayAgendaExpanded}
                aria-controls="day-agenda-panel-body"
                aria-label={
                  dayAgendaExpanded
                    ? 'Replier le programme du jour sélectionné'
                    : 'Déplier le programme du jour sélectionné'
                }
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#A3A3A3] dark:hover:bg-[#262626] dark:hover:text-[#E5E5E5] cursor-pointer"
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${
                    dayAgendaExpanded ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>
            </div>

            {dayAgendaExpanded && (
              <div id="day-agenda-panel-body">
                {(eventsForSelectedDay.length > 0 || isCoach) && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    {eventsForSelectedDay.length > 0 ? (
                      <div
                        role="group"
                        aria-label="Afficher le programme du jour en liste ou sur une carte"
                        className="flex items-center gap-1 rounded-[10px] bg-slate-100 p-1 dark:bg-[#1F1F1F]"
                      >
                        <button
                          type="button"
                          onClick={() => setDayDisplayMode('list')}
                          className={`inline-flex min-h-[32px] items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                            dayDisplayMode === 'list'
                              ? 'bg-white text-slate-900 shadow-sm dark:bg-[#4ADE80] dark:text-[#0A0A0A] dark:font-semibold'
                              : 'text-slate-600 hover:text-slate-900 dark:text-[#A3A3A3] dark:hover:text-[#E5E5E5]'
                          }`}
                        >
                          <List className="h-3.5 w-3.5" aria-hidden="true" />
                          Liste
                        </button>
                        <button
                          type="button"
                          onClick={() => setDayDisplayMode('map')}
                          className={`inline-flex min-h-[32px] items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                            dayDisplayMode === 'map'
                              ? 'bg-white text-slate-900 shadow-sm dark:bg-[#4ADE80] dark:text-[#0A0A0A] dark:font-semibold'
                              : 'text-slate-600 hover:text-slate-900 dark:text-[#A3A3A3] dark:hover:text-[#E5E5E5]'
                          }`}
                        >
                          <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          Carte
                        </button>
                      </div>
                    ) : (
                      <span />
                    )}

                    {isCoach && (
                      <button
                        type="button"
                        onClick={() => onCreateEventForDate(selectedDate)}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-[10px] border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#E5E5E5] dark:hover:bg-[#2A2A2A] whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Planifier
                      </button>
                    )}
                  </div>
                )}

            <div className="mt-4 space-y-3">
              {eventsForSelectedDay.length === 0 ? (
                <div className="rounded-[12px] border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center dark:border-[#262626] dark:bg-[#1B1B1B]">
                  <CalendarIcon
                    className="mx-auto h-7 w-7 text-slate-400 dark:text-[#525252]"
                    aria-hidden="true"
                  />
                  <p className="mt-2 text-sm font-medium text-slate-700 dark:text-[#E5E5E5]">
                    Aucune séance ce jour
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-[#8E8E8E]">
                    {cityQuery.trim() || regionFilter
                      ? `Aucun événement trouvé pour « ${[cityQuery.trim(), regionFilter].filter(Boolean).join(' · ')} » à cette date.`
                      : 'Sélectionnez une autre date sur le calendrier ou consultez la liste des séances.'}
                  </p>
                  {isCoach && (
                    <button
                      type="button"
                      onClick={() => onCreateEventForDate(selectedDate)}
                      className="mt-4 inline-flex min-h-[42px] items-center gap-1.5 rounded-[10px] bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-[#4ADE80] dark:text-[#0A0A0A] dark:hover:bg-[#22C55E] cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Créer une séance ce jour
                    </button>
                  )}
                </div>
              ) : dayDisplayMode === 'map' ? (
                <div className="space-y-3">
                  <EventsOverviewMap
                    events={eventsForSelectedDay}
                    disciplines={disciplines}
                    hasMapsApiKey={hasMapsApiKey}
                    heightClass="h-[300px] sm:h-[360px]"
                    onSelectEvent={onSelectEvent}
                  />
                  <p className="text-xs text-slate-500 dark:text-[#8E8E8E]">
                    {eventsForSelectedDay.length} séance
                    {eventsForSelectedDay.length > 1 ? 's' : ''} ce jour · Touchez un repère sur la carte pour ouvrir la réservation.
                  </p>
                </div>
              ) : (
                eventsForSelectedDay.map((ev) => {
                  const evalInfo = evaluateEventBooking(ev, nowMs, {
                    hideRegisteredCount: !isCoach,
                  });
                  const discStyle = getDisciplineStyle(ev.discipline, disciplines);
                  const coverImageSrc = getSafeEventCoverImageSrc(
                    ev.coverImageUrl
                  );
                  const coverImagePosition = normalizeCoverImagePosition(
                    ev.coverImagePosition
                  );
                  return (
                    <div
                      key={ev.id}
                      className={`overflow-hidden rounded-[12px] border border-slate-200 border-l-4 ${discStyle.leftBorder} transition-colors hover:border-slate-300 dark:border-[#262626] dark:bg-[#1B1B1B] dark:hover:border-[#3A3A3A]`}
                    >
                      {coverImageSrc && (
                        <button
                          type="button"
                          onClick={() =>
                            setLightboxImage({
                              src: coverImageSrc,
                              title: ev.title,
                            })
                          }
                          aria-label={`Agrandir le visuel de ${ev.title}`}
                          className="group relative block aspect-[16/7] w-full overflow-hidden border-b border-slate-200/80 bg-slate-900 dark:border-[#262626] dark:bg-[#0E0E0E] cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4ADE80]"
                        >
                          <img
                            src={coverImageSrc}
                            alt={ev.title}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                            style={{ objectPosition: coverImagePosition }}
                            loading="lazy"
                          />
                          <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-[6px] bg-slate-950/65 px-2 py-1 text-[11px] font-medium text-white/95 backdrop-blur-xs transition-colors group-hover:bg-slate-950/85">
                            <Maximize2 className="h-3 w-3" aria-hidden="true" />
                            Agrandir
                          </span>
                        </button>
                      )}
                      <div className="p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-[#8E8E8E]">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold shrink-0 ${discStyle.softBg} ${discStyle.border} ${discStyle.text}`}
                          >
                            <DisciplineIcon
                              disciplineName={ev.discipline}
                              catalog={disciplines}
                              className="h-3 w-3 shrink-0"
                            />
                            {ev.discipline}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold tabular-nums shrink-0 ${
                              ev.isPaid
                                ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-[#4ADE80]/30 dark:bg-[#4ADE80]/10 dark:text-[#4ADE80]'
                            }`}
                          >
                            {formatEventPrice(ev)}
                          </span>
                          {registeredEventIds?.has(ev.id) && (
                            <span className="inline-flex items-center rounded-[6px] border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-[#4ADE80]/30 dark:bg-[#4ADE80]/10 dark:text-[#4ADE80] shrink-0">
                              Inscrit
                            </span>
                          )}
                          <span className="truncate">
                            {ev.city}
                            {ev.region ? ` (${ev.region})` : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`inline-flex items-center gap-1 font-semibold shrink-0 ${
                              evalInfo.state === 'open'
                                ? 'text-emerald-700 dark:text-[#4ADE80]'
                                : evalInfo.state === 'closed'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : evalInfo.state === 'full' ||
                                      evalInfo.state === 'cancelled'
                                    ? 'text-rose-700 dark:text-rose-400'
                                    : 'text-slate-500 dark:text-[#8E8E8E]'
                            }`}
                          >
                            {evalInfo.statusLabel}
                          </span>
                          {evalInfo.state !== 'cancelled' && onShareEvent && (
                            <EventShareButton
                              compact
                              eventTitle={ev.title}
                              onClick={() => onShareEvent(ev)}
                            />
                          )}
                        </div>
                      </div>

                      <h4 className="mt-1.5 font-display text-base font-semibold text-slate-900 dark:text-[#E5E5E5]">
                        {ev.title}
                      </h4>

                      {ratingSummaryByEventId?.get(ev.id) && (
                        <div className="mt-1">
                          <EventRatingInline
                            summary={ratingSummaryByEventId.get(ev.id)}
                          />
                        </div>
                      )}

                      <div className="mt-2.5 space-y-1.5 text-xs text-slate-600 dark:text-[#A3A3A3]">
                        <div className="flex items-center gap-2 tabular-nums">
                          <Clock className="h-3.5 w-3.5 text-slate-400 dark:text-[#8E8E8E] shrink-0" aria-hidden="true" />
                          <span>
                            {formatTimeRange(
                              ev.startAt.toDate(),
                              getEventDurationMinutes(ev)
                            )}
                            {hasEventDuration(ev)
                              ? ` (${ev.durationMinutes} min)`
                              : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-slate-400 dark:text-[#8E8E8E] shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            {ev.location} · {ev.city}
                            {ev.region ? `, ${ev.region}` : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-3.5 w-3.5 text-slate-400 dark:text-[#8E8E8E] shrink-0" aria-hidden="true" />
                          <span className="truncate">{formatEventCoachesLabel(ev)}</span>
                        </div>
                        {(() => {
                          const safeExternalUrl = getSafeExternalHref(ev.externalUrl);
                          if (!safeExternalUrl) return null;
                          return (
                            <div className="flex items-center gap-2">
                              <ExternalLink className="h-3.5 w-3.5 text-emerald-600 dark:text-[#4ADE80] shrink-0" aria-hidden="true" />
                              <a
                                href={safeExternalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate font-medium text-emerald-700 hover:underline dark:text-[#4ADE80]"
                              >
                                {formatExternalUrlLabel(safeExternalUrl)}
                              </a>
                            </div>
                          );
                        })()}
                      </div>

                      {ev.isPaid && (
                        <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-300 tabular-nums">
                          Séance payante · {formatEventPrice(ev)} ({formatPaymentModeLabel(ev.paymentMode)})
                        </p>
                      )}

                      <p
                        className={`mt-2 text-xs ${
                          evalInfo.state === 'cancelled'
                            ? 'font-medium text-rose-700 dark:text-rose-400'
                            : 'text-slate-500 dark:text-[#8E8E8E]'
                        }`}
                      >
                        {evalInfo.helperText}
                      </p>

                      {(() => {
                        const hasSpots =
                          evalInfo.isUnlimited || (evalInfo.remainingSpots ?? 0) > 0;
                        const canBookFromCard =
                          hasSpots && evalInfo.state === 'open';
                        const isClosedBeforeStart =
                          (evalInfo.state === 'closed' ||
                            (evalInfo.state === 'cancelled' &&
                              evalInfo.isAutoCancelledNoRegistrants)) &&
                          nowMs < evalInfo.startMs;
                        const showClosedMessageCta =
                          !isCoach &&
                          Boolean(onMessageCoach) &&
                          isClosedBeforeStart &&
                          canMemberMessageEventCoach(ev, nowMs, evalInfo);
                        return (
                          <div className="mt-3 space-y-2">
                            {showClosedMessageCta && (
                              <p className="text-[11px] font-medium text-emerald-700 dark:text-[#4ADE80]">
                                Message à l’animateur possible jusqu’à {formatFrenchTime(ev.startAt.toDate())}
                              </p>
                            )}
                            <div className="flex flex-col gap-2 sm:flex-row">
                              {showClosedMessageCta && onMessageCoach && (
                                <button
                                  type="button"
                                  onClick={() => onMessageCoach(ev)}
                                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-emerald-700 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-50 dark:border-[#4ADE80]/40 dark:bg-[#161616] dark:text-[#4ADE80] dark:hover:bg-[#4ADE80]/10 cursor-pointer"
                                >
                                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                                  Écrire à l’animateur
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onSelectEvent(ev)}
                                className={`min-h-[44px] flex-1 rounded-[10px] px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                                  canBookFromCard
                                    ? 'bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-[#4ADE80] dark:text-[#0A0A0A] dark:hover:bg-[#22C55E]'
                                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-[#262626] dark:bg-[#222222] dark:text-[#E5E5E5] dark:hover:bg-[#2A2A2A]'
                                }`}
                              >
                                {evalInfo.state === 'open' && hasSpots
                                  ? ev.isPaid
                                    ? `Réserver (${formatEventPrice(ev)})`
                                    : 'Réserver & voir la carte'
                                  : evalInfo.state === 'cancelled'
                                    ? 'Séance annulée · Voir détails'
                                    : 'Voir la carte et détails'}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
              </div>
            )}
          </div>

          {dayAgendaExpanded && (
            <div className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-[#262626] dark:text-[#8E8E8E]">
              Règle d’inscription : chaque séance reste ouverte jusqu’à l’heure de début ou selon le délai de clôture défini par le coach lors de sa création. Les événements passés ou annulés restent affichés puis sont supprimés 30 jours après la fin de la séance.
            </div>
          )}
        </aside>
      </div>

      </div>

      {lightboxImage && (
        <EventImageLightbox
          src={lightboxImage.src}
          title={lightboxImage.title}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </section>
  );
}
