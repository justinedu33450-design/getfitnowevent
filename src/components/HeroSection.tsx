import { ArrowDownRight, CalendarDays, Clock, Users } from 'lucide-react';
import { SportEvent } from '../types';
import { evaluateEventBooking, formatPriceEuros } from '../utils/dateAndValidation';

interface HeroSectionProps {
  events: SportEvent[];
  nowMs: number;
  isCoach: boolean;
  coachPhotoUrl?: string | null;
  coachName?: string | null;
  onExploreCalendar: () => void;
  onOpenCoachSpace: () => void;
  onOpenMemberProfile?: () => void;
}

export function HeroSection({
  events,
  nowMs,
  isCoach,
  onExploreCalendar,
  onOpenCoachSpace,
  onOpenMemberProfile,
}: HeroSectionProps) {
  const upcomingPublished = events.filter((ev) => {
    const startMs = ev.startAt.toMillis();
    return startMs > nowMs && evaluateEventBooking(ev, nowMs).state !== 'cancelled';
  });

  const openEvents = upcomingPublished.filter(
    (ev) => evaluateEventBooking(ev, nowMs).state === 'open'
  );

  const hasUnlimitedOpen = openEvents.some((ev) => ev.isUnlimitedCapacity);
  const limitedSpots = openEvents.reduce(
    (sum, ev) =>
      ev.isUnlimitedCapacity
        ? sum
        : sum + Math.max(0, ev.maxCapacity - ev.registeredCount),
    0
  );

  const activeCities = new Set(
    upcomingPublished.map((ev) => ev.city.trim()).filter(Boolean)
  ).size;

  const paidUpcoming = upcomingPublished.filter(
    (ev) => ev.isPaid && typeof ev.priceCents === 'number' && ev.priceCents > 0
  );
  const freeUpcoming = upcomingPublished.filter((ev) => !ev.isPaid);
  const minPaidCents =
    paidUpcoming.length > 0
      ? Math.min(...paidUpcoming.map((ev) => ev.priceCents ?? 0))
      : 0;
  const pricingMetricValue =
    paidUpcoming.length === 0
      ? 'Gratuit'
      : freeUpcoming.length > 0
        ? 'Gratuit & payant'
        : `Dès ${formatPriceEuros(minPaidCents)}`;
  const pricingMetricHelper =
    paidUpcoming.length === 0
      ? 'Inscription ouverte sur profil'
      : 'Règlement en ligne ou sur place';

  return (
    <section className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        {/* Hero header content */}
        <div className="flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 sm:text-sm">
              GetFitNow Event · Coaching sportif collectif et personnalisé
            </p>
            <h1
              className="mt-2 max-w-3xl font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]"
              style={{ textWrap: 'balance' }}
            >
              Réservez vos séances sportives et suivez votre progression
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:mt-4 sm:text-base">
              Consultez le calendrier par ville, région et discipline, visualisez les séances du jour sur la carte et réservez votre place en quelques clics jusqu’au début de la séance.
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-2.5 sm:mt-6 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <button
              type="button"
              onClick={onExploreCalendar}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 whitespace-nowrap shrink-0 cursor-pointer sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
            >
              Voir le calendrier des séances
              <ArrowDownRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={
                isCoach
                  ? onOpenCoachSpace
                  : onOpenMemberProfile || onOpenCoachSpace
              }
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white whitespace-nowrap shrink-0 cursor-pointer sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
            >
              {isCoach ? 'Ouvrir le suivi adhérents' : 'Mon suivi & profil'}
            </button>
          </div>
        </div>

        {/* Full-width 4-column metric strip below hero split */}
        <div className="mt-6 grid grid-cols-2 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-slate-50/70 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-800/50 sm:mt-8 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <div className="p-3.5 sm:p-4 sm:px-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Séances planifiées</span>
              <CalendarDays className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
            </div>
            <p className="mt-1.5 font-mono text-xl font-semibold text-slate-900 dark:text-white tabular-nums sm:text-2xl">
              {upcomingPublished.length}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">
              {openEvents.length} ouverte{openEvents.length > 1 ? 's' : ''} à la réservation
            </p>
          </div>

          <div className="border-l border-slate-200 dark:border-slate-800 p-3.5 sm:border-l-0 sm:p-4 sm:px-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>{isCoach ? 'Places disponibles' : 'Tarifs séances'}</span>
              <Users className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
            </div>
            <p className="mt-1.5 font-mono text-xl font-semibold text-slate-900 dark:text-white tabular-nums sm:text-2xl">
              {isCoach
                ? hasUnlimitedOpen
                  ? `${limitedSpots}+`
                  : limitedSpots
                : pricingMetricValue}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">
              {isCoach
                ? hasUnlimitedOpen
                  ? 'Inclut séances illimitées'
                  : 'Réservations en ligne ou sur place'
                : pricingMetricHelper}
            </p>
          </div>

          <div className="p-3.5 sm:p-4 sm:px-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Villes couvertes</span>
              <span className="hidden font-mono text-xs text-emerald-700 dark:text-emerald-400 sm:inline">Carte active</span>
            </div>
            <p className="mt-1.5 font-mono text-xl font-semibold text-slate-900 dark:text-white tabular-nums sm:text-2xl">
              {activeCities}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">
              Filtrables par ville et région
            </p>
          </div>

          <div className="border-l border-slate-200 dark:border-slate-800 p-3.5 sm:border-l-0 sm:p-4 sm:px-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Clôture réservation</span>
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
            </div>
            <p className="mt-1.5 font-mono text-xl font-semibold text-slate-900 dark:text-white tabular-nums sm:text-2xl">
              H - 1h00
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">
              Verrouillage automatique avant début
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
