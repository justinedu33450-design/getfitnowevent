import { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
  Lock,
  Map as MapIcon,
  MapPin,
  Plus,
  Search,
  UserCheck,
  Users,
} from 'lucide-react';
import { Discipline, DisciplineItem, SportEvent } from '../types';
import {
  evaluateEventBooking,
  formatCapacityCompact,
  formatEventCoachesLabel,
  formatEventPrice,
  formatFrenchDateLong,
  formatFrenchTime,
  formatPaymentModeLabel,
  formatTimeRange,
  getMonthDaysGrid,
  getWeekDays,
  isSameCalendarDay,
} from '../utils/dateAndValidation';
import { getDisciplineStyle } from '../utils/disciplineColors';
import { EventsOverviewMap } from './EventLocationMap';

interface CalendarViewProps {
  events: SportEvent[];
  disciplines: DisciplineItem[];
  nowMs: number;
  isCoach: boolean;
  isCoachAdmin?: boolean;
  registeredEventIds?: Set<string>;
  loading: boolean;
  hasMapsApiKey: boolean;
  onSelectEvent: (event: SportEvent) => void;
  onCreateEventForDate: (date: Date) => void;
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export function CalendarView({
  events,
  disciplines,
  nowMs,
  isCoach,
  isCoachAdmin = false,
  registeredEventIds,
  loading,
  hasMapsApiKey,
  onSelectEvent,
  onCreateEventForDate,
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
    const today = new Date();
    setAnchorDate(today);
    setSelectedDate(today);
    setDayDisplayMode('map');
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
        ? 'text-emerald-700 dark:text-emerald-400'
        : evalState === 'cutoff_closed'
          ? 'text-amber-700 dark:text-amber-400'
          : evalState === 'full' || evalState === 'cancelled'
            ? 'text-rose-700 dark:text-rose-400'
            : 'text-slate-500 dark:text-slate-400';

    const container =
      evalState === 'cancelled'
        ? `border-slate-200 border-l-4 ${discStyle.leftBorder} bg-slate-100 text-slate-500 line-through hover:bg-slate-200/70 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:bg-slate-800`
        : isMuted
          ? `border-slate-200 border-l-4 ${discStyle.leftBorder} bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:bg-slate-800`
          : `${discStyle.border} border-l-4 ${discStyle.leftBorder} ${discStyle.cardBg} text-slate-900 dark:text-slate-100`;

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
      className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
    >
      {/* Toolbar */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white capitalize sm:text-2xl">
            {headerTitle}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            Touchez un jour puis une séance pour voir l’emplacement sur la carte et réserver votre place jusqu’à 1h avant le début.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5 sm:justify-start sm:gap-3">
          {/* Segmented Month / Week toggle */}
          <div
            role="group"
            aria-label="Mode d'affichage du calendrier"
            className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
          >
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                viewMode === 'month'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              Mois
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                viewMode === 'week'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              Semaine
            </button>
          </div>

          {/* Date navigation */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Période précédente"
              className="flex h-[40px] w-[40px] items-center justify-center border-r border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="h-[40px] px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
            >
              Aujourd’hui
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Période suivante"
              className="flex h-[40px] w-[40px] items-center justify-center border-l border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleTodayMap}
            className="inline-flex h-[40px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Carte du jour
          </button>
        </div>
      </div>

      {/* Filters Row: City/Region search + Region select + Discipline filter */}
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
          {/* City or Region Search Input */}
          <div className="relative w-full sm:w-56">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
              placeholder="Rechercher par ville ou région..."
              aria-label="Rechercher les événements par ville ou région"
              list="calendar-locations-list"
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
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
            className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:w-auto"
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
                className={`h-3 w-3 shrink-0 rounded-sm ${getDisciplineStyle(disciplineFilter, disciplines).swatchBg}`}
                aria-hidden="true"
              />
            )}
            <select
              value={disciplineFilter}
              onChange={(e) => setDisciplineFilter(e.target.value)}
              aria-label="Filtrer par discipline"
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:w-auto"
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
      </div>

      {/* Quick city pills if multiple cities exist */}
      {availableCities.length > 1 && (
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0 mr-1">
            Villes :
          </span>
          <button
            type="button"
            onClick={() => setCityQuery('')}
            className={`min-h-[32px] rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              cityQuery.trim() === ''
                ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
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
                className={`min-h-[32px] rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-600 dark:bg-emerald-600'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {city}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Calendar + Selected Day Detail */}
      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Calendar Grid */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:col-span-8">
          {loading ? (
            <div className="p-4 sm:p-6 space-y-3">
              <div className="h-8 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {Array.from({ length: 28 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 sm:h-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800"
                  />
                ))}
              </div>
            </div>
          ) : viewMode === 'month' ? (
            <div>
              {/* Weekday Headers */}
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/70">
                {WEEKDAY_LABELS.map((day) => (
                  <div
                    key={day}
                    className="py-2 text-center text-[11px] font-semibold text-slate-600 dark:text-slate-300 sm:py-2.5 sm:text-xs"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* 6x7 Month Cells */}
              <div className="grid grid-cols-7 divide-x divide-y divide-slate-200 dark:divide-slate-800">
                {monthDays.map((dayDate) => {
                  const isCurrentMonth =
                    dayDate.getMonth() === anchorDate.getMonth();
                  const isToday = isSameCalendarDay(dayDate, today);
                  const isSelected = isSameCalendarDay(dayDate, selectedDate);
                  const dayEvents = filteredEvents.filter((ev) =>
                    isSameCalendarDay(ev.startAt.toDate(), dayDate)
                  );

                  return (
                    <div
                      key={dayDate.toISOString()}
                      onClick={() => setSelectedDate(dayDate)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedDate(dayDate);
                        }
                      }}
                      className={`group min-h-[54px] p-1 text-left transition-colors cursor-pointer sm:min-h-[112px] sm:p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 ${
                        isSelected
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/35'
                          : isCurrentMonth
                            ? 'bg-white hover:bg-slate-50/70 dark:bg-slate-900 dark:hover:bg-slate-800/50'
                            : 'bg-slate-50/60 text-slate-400 hover:bg-slate-100/60 dark:bg-slate-950/60 dark:text-slate-500 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-center sm:justify-between sm:px-1">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-md font-mono text-xs tabular-nums ${
                            isToday
                              ? 'bg-slate-900 font-semibold text-white dark:bg-slate-100 dark:text-slate-900'
                              : isSelected
                                ? 'bg-emerald-700 font-semibold text-white dark:bg-emerald-600'
                                : isCurrentMonth
                                  ? 'font-medium text-slate-800 dark:text-slate-200'
                                  : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {dayDate.getDate()}
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
                            className="hidden h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-white sm:group-hover:inline-flex cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>

                      {/* Mobile compact indicator squares by discipline */}
                      {dayEvents.length > 0 && (
                        <div className="mt-1 flex flex-wrap items-center justify-center gap-1 sm:hidden">
                          {dayEvents.slice(0, 3).map((ev) => {
                            const style = getEventVisualState(ev);
                            return (
                              <span
                                key={ev.id}
                                className={`h-2 w-2 rounded-sm ${style.dotColor}`}
                                aria-hidden="true"
                              />
                            );
                          })}
                          {dayEvents.length > 3 && (
                            <span className="font-mono text-[9px] font-semibold text-slate-500 dark:text-slate-400">
                              +{dayEvents.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Desktop / Tablet event pills inside cell */}
                      <div className="mt-1.5 hidden space-y-1 sm:block">
                        {dayEvents.slice(0, 3).map((ev) => {
                          const style = getEventVisualState(ev);
                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDate(dayDate);
                                onSelectEvent(ev);
                              }}
                              className={`w-full rounded border px-1.5 py-1 text-left text-[11px] leading-tight transition-colors cursor-pointer ${style.container}`}
                            >
                              <div className="flex items-center justify-between gap-1 font-mono tabular-nums">
                                <span className="font-semibold">
                                  {formatFrenchTime(ev.startAt.toDate())}
                                </span>
                                {isCoach ? (
                                  <span className="hidden md:inline opacity-80">
                                    {ev.isPaid ? formatEventPrice(ev) : formatCapacityCompact(ev)}
                                  </span>
                                ) : style.evalState === 'full' ? (
                                  <span className="hidden md:inline text-rose-700 dark:text-rose-400 font-semibold">
                                    Complet
                                  </span>
                                ) : ev.isPaid ? (
                                  <span className="hidden md:inline font-semibold text-amber-800 dark:text-amber-300">
                                    {formatEventPrice(ev)}
                                  </span>
                                ) : null}
                              </div>
                              <div className="truncate font-medium">
                                {ev.title}
                              </div>
                            </button>
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <div className="px-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            + {dayEvents.length - 3} autre
                            {dayEvents.length - 3 > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Week View */
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
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
                    className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-start transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/30 dark:bg-emerald-950/25'
                        : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between sm:w-44 sm:shrink-0">
                      <div>
                        <p className="text-sm font-semibold capitalize text-slate-900 dark:text-white">
                          {new Intl.DateTimeFormat('fr-FR', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'short',
                          }).format(dayDate)}
                        </p>
                        {isToday && (
                          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
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
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
                          title="Ajouter une séance ce jour"
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    <div className="flex-1 space-y-2">
                      {dayEvents.length === 0 ? (
                        <p className="py-1 text-xs text-slate-400 dark:text-slate-500">
                          Aucune séance programmée
                        </p>
                      ) : (
                        dayEvents.map((ev) => {
                          const evalInfo = evaluateEventBooking(ev, nowMs, {
                            hideRegisteredCount: !isCoach,
                          });
                          const style = getEventVisualState(ev);
                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectEvent(ev);
                              }}
                              className={`flex w-full flex-col gap-2 rounded-lg border p-3 text-left transition-colors cursor-pointer sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${style.container}`}
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
                                  <span className="font-mono font-semibold tabular-nums">
                                    {formatTimeRange(
                                      ev.startAt.toDate(),
                                      ev.durationMinutes
                                    )}
                                  </span>
                                  <span
                                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold bg-white dark:bg-slate-900 ${style.discStyle.border} ${style.discStyle.text}`}
                                  >
                                    <span
                                      className={`h-2 w-2 rounded-sm ${style.discStyle.swatchBg}`}
                                      aria-hidden="true"
                                    />
                                    {ev.discipline}
                                  </span>
                                  <span className="truncate text-slate-600 dark:text-slate-300">
                                    {ev.city}
                                    {ev.region ? ` (${ev.region})` : ''} — {ev.location}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-sm font-semibold truncate">
                                  {ev.title}
                                </p>
                                <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300 truncate">
                                  {formatEventCoachesLabel(ev)}
                                </p>
                              </div>
                              <div className="flex items-center justify-between gap-3 sm:block sm:shrink-0 sm:text-right">
                                <div className="flex items-center gap-2 sm:justify-end">
                                  {registeredEventIds?.has(ev.id) && (
                                    <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                      Inscrit
                                    </span>
                                  )}
                                  <span
                                    className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                                      ev.isPaid
                                        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                        : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    }`}
                                  >
                                    {formatEventPrice(ev)}
                                  </span>
                                  <p className={`text-xs font-semibold ${style.statusColor}`}>
                                    {evalInfo.statusLabel}
                                  </p>
                                </div>
                                <p className="mt-0.5 font-mono text-xs tabular-nums opacity-80">
                                  {isCoach
                                    ? ev.isUnlimitedCapacity
                                      ? `${ev.registeredCount} · Illimité`
                                      : `${ev.registeredCount}/${ev.maxCapacity} places`
                                    : evalInfo.capacityLabel}
                                </p>
                              </div>
                            </button>
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

        {/* Selected Day Agenda Panel */}
        <aside
          id="day-agenda-panel"
          className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5 lg:col-span-4"
        >
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Programme du jour sélectionné
                </p>
                <h3 className="mt-0.5 font-display text-base font-bold capitalize text-slate-900 dark:text-white sm:text-lg">
                  {formatFrenchDateLong(selectedDate)}
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {eventsForSelectedDay.length > 0 && (
                  <div
                    role="group"
                    aria-label="Afficher le programme du jour en liste ou sur une carte"
                    className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
                  >
                    <button
                      type="button"
                      onClick={() => setDayDisplayMode('list')}
                      className={`inline-flex min-h-[32px] items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        dayDisplayMode === 'list'
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
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
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                      }`}
                    >
                      <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      Carte
                    </button>
                  </div>
                )}

                {isCoach && (
                  <button
                    type="button"
                    onClick={() => onCreateEventForDate(selectedDate)}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Planifier
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {eventsForSelectedDay.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center dark:border-slate-700 dark:bg-slate-800/40">
                  <CalendarIcon
                    className="mx-auto h-7 w-7 text-slate-400 dark:text-slate-500"
                    aria-hidden="true"
                  />
                  <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    Aucune séance ce jour
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {cityQuery.trim() || regionFilter
                      ? `Aucun événement trouvé pour « ${[cityQuery.trim(), regionFilter].filter(Boolean).join(' · ')} » à cette date.`
                      : 'Sélectionnez une autre date sur le calendrier ou consultez la liste des séances.'}
                  </p>
                  {isCoach && (
                    <button
                      type="button"
                      onClick={() => onCreateEventForDate(selectedDate)}
                      className="mt-4 inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white cursor-pointer"
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
                  <p className="text-xs text-slate-500 dark:text-slate-400">
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
                  return (
                    <div
                      key={ev.id}
                      className={`rounded-lg border border-slate-200 border-l-4 ${discStyle.leftBorder} p-4 transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold shrink-0 ${discStyle.softBg} ${discStyle.border} ${discStyle.text}`}
                          >
                            <span
                              className={`h-2 w-2 rounded-sm ${discStyle.swatchBg}`}
                              aria-hidden="true"
                            />
                            {ev.discipline}
                          </span>
                          <span
                            className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums shrink-0 ${
                              ev.isPaid
                                ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            }`}
                          >
                            {formatEventPrice(ev)}
                          </span>
                          {registeredEventIds?.has(ev.id) && (
                            <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 shrink-0">
                              Inscrit
                            </span>
                          )}
                          <span className="truncate">
                            {ev.city}
                            {ev.region ? ` (${ev.region})` : ''}
                          </span>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 font-semibold shrink-0 ${
                            evalInfo.state === 'open'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : evalInfo.state === 'cutoff_closed'
                                ? 'text-amber-700 dark:text-amber-400'
                                : evalInfo.state === 'full' ||
                                    evalInfo.state === 'cancelled'
                                  ? 'text-rose-700 dark:text-rose-400'
                                  : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {evalInfo.state === 'cutoff_closed' && (
                            <Lock className="h-3 w-3" aria-hidden="true" />
                          )}
                          {evalInfo.statusLabel}
                        </span>
                      </div>

                      <h4 className="mt-1.5 font-display text-base font-semibold text-slate-900 dark:text-white">
                        {ev.title}
                      </h4>

                      <div className="mt-2.5 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-2 font-mono tabular-nums">
                          <Clock className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                          <span>
                            {formatTimeRange(ev.startAt.toDate(), ev.durationMinutes)} ({ev.durationMinutes} min)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            {ev.location} · {ev.city}
                            {ev.region ? `, ${ev.region}` : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                          <span className="truncate">{formatEventCoachesLabel(ev)}</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono tabular-nums">
                          <Users className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                          <span>{evalInfo.capacityLabel}</span>
                        </div>
                      </div>

                      {ev.isPaid && (
                        <p className="mt-2 font-mono text-[11px] text-amber-800 dark:text-amber-300 tabular-nums">
                          Séance payante · {formatEventPrice(ev)} ({formatPaymentModeLabel(ev.paymentMode)})
                        </p>
                      )}

                      <p
                        className={`mt-2 text-xs ${
                          evalInfo.state === 'cancelled'
                            ? 'font-medium text-rose-700 dark:text-rose-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {evalInfo.helperText}
                      </p>

                      {(() => {
                        const hasSpots =
                          evalInfo.isUnlimited || (evalInfo.remainingSpots ?? 0) > 0;
                        const canBookFromCard =
                          hasSpots &&
                          (evalInfo.state === 'open' ||
                            (isCoachAdmin && evalInfo.state === 'cutoff_closed'));
                        return (
                          <button
                            type="button"
                            onClick={() => onSelectEvent(ev)}
                            className={`mt-3 w-full min-h-[44px] rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                              canBookFromCard
                                ? 'bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500'
                                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {evalInfo.state === 'open' && hasSpots
                              ? ev.isPaid
                                ? `Réserver (${formatEventPrice(ev)})`
                                : 'Réserver & voir la carte'
                              : isCoachAdmin &&
                                  evalInfo.state === 'cutoff_closed' &&
                                  hasSpots
                                ? ev.isPaid
                                  ? `Réserver (${formatEventPrice(ev)}) · admin`
                                  : 'Réserver (accès admin)'
                                : 'Voir la carte et détails'}
                          </button>
                        );
                      })()}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Règle d’inscription : chaque séance (gratuite ou payante) est accessible jusqu’à 60 minutes avant le coup d’envoi.
          </div>
        </aside>
      </div>
    </section>
  );
}
