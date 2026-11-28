import { ArrowDownRight, LocateFixed } from 'lucide-react';
import { SportEvent } from '../types';

interface HeroSectionProps {
  events: SportEvent[];
  nowMs: number;
  isCoach: boolean;
  coachPhotoUrl?: string | null;
  coachName?: string | null;
  onExploreCalendar: () => void;
  onExploreNearby?: () => void;
  onOpenCoachSpace: () => void;
  onOpenMemberProfile?: () => void;
}

export function HeroSection({
  isCoach,
  onExploreCalendar,
  onExploreNearby,
  onOpenCoachSpace,
  onOpenMemberProfile,
}: HeroSectionProps) {
  return (
    <section className="border-b border-slate-200 dark:border-[#262626]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        {/* Hero header content */}
        <div className="flex flex-col justify-between">
          <div>
            <h1
              className="max-w-3xl font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-[#E5E5E5] sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]"
              style={{ textWrap: 'balance' }}
            >
              Réservez vos séances sportives et suivez votre progression
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-[#A3A3A3] sm:mt-4 sm:text-base">
              Consultez le calendrier, localisez les événements à proximité sur la carte, réservez votre place en quelques clics et rencontrez de nouveaux partenaires d’entraînement.
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-2.5 sm:mt-6 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <button
              type="button"
              onClick={onExploreCalendar}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[10px] bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-emerald-800 dark:bg-[#4ADE80] dark:text-[#0A0A0A] dark:hover:bg-[#22C55E] whitespace-nowrap shrink-0 cursor-pointer sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ADE80] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#161616]"
            >
              Calendrier des événements
              <ArrowDownRight className="h-4 w-4" aria-hidden="true" />
            </button>
            {onExploreNearby && (
              <button
                type="button"
                onClick={onExploreNearby}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition-colors duration-150 hover:bg-emerald-100 dark:border-[#4ADE80]/30 dark:bg-[#4ADE80]/10 dark:text-[#4ADE80] dark:hover:bg-[#4ADE80]/20 whitespace-nowrap shrink-0 cursor-pointer sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ADE80] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#161616]"
              >
                <LocateFixed className="h-4 w-4" aria-hidden="true" />
                Événements autour de moi
              </button>
            )}
            <button
              type="button"
              onClick={
                isCoach
                  ? onOpenCoachSpace
                  : onOpenMemberProfile || onOpenCoachSpace
              }
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-[10px] border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-900 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#E5E5E5] dark:hover:bg-[#2A2A2A] dark:hover:text-white whitespace-nowrap shrink-0 cursor-pointer sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ADE80] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#161616]"
            >
              {isCoach ? 'Ouvrir le suivi adhérents' : 'Mon profil'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
