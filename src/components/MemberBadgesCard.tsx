import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ChevronDown,
  Crown,
  Dumbbell,
  Flame,
  Lock,
  Medal,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import { DisciplineItem } from '../types';
import { formatFrenchDateShort } from '../utils/dateAndValidation';
import {
  DISCIPLINE_COLOR_PRESETS,
  getDisciplineStyle,
} from '../utils/disciplineColors';
import { DisciplineIcon } from './DisciplineIcon';
import {
  BadgeCategory,
  DisciplineBadgeGroup,
  MemberBadgeItem,
  MemberBadgesSummary,
} from '../utils/memberBadges';

interface MemberBadgesCardProps {
  summary: MemberBadgesSummary;
  disciplines?: DisciplineItem[];
  compact?: boolean;
  defaultExpanded?: boolean;
  forceExpandNonce?: number;
  highlightedBadgeIds?: string[];
  title?: string;
  subtitle?: string;
}

type BadgeFilterTab = 'all' | BadgeCategory;

function getMilestoneIcon(target: number) {
  if (target >= 500) return Crown;
  if (target >= 100) return Trophy;
  if (target >= 25) return Medal;
  if (target >= 5) return Award;
  return Target;
}

function getStreakIcon(target: number) {
  if (target >= 15) return Flame;
  if (target >= 7) return Zap;
  return Flame;
}

function formatCountShort(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}

export function MemberBadgesCard({
  summary,
  disciplines = [],
  compact = false,
  defaultExpanded = false,
  forceExpandNonce = 0,
  highlightedBadgeIds = [],
  title = 'Mes badges & récompenses',
  subtitle,
}: MemberBadgesCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<BadgeFilterTab>('all');
  const [expandedDisciplines, setExpandedDisciplines] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (forceExpandNonce > 0) {
      setExpanded(true);
    }
  }, [forceExpandNonce]);

  const highlightedSet = useMemo(
    () => new Set(highlightedBadgeIds),
    [highlightedBadgeIds]
  );

  // Auto-expand discipline groups that contain newly unlocked highlighted badges
  useEffect(() => {
    if (highlightedBadgeIds.length === 0) return;
    const toOpen: Record<string, boolean> = {};
    summary.disciplineGroups.forEach((group) => {
      if (group.badges.some((b) => highlightedSet.has(b.id))) {
        toOpen[group.key] = true;
      }
    });
    if (Object.keys(toOpen).length > 0) {
      setExpandedDisciplines((prev) => ({ ...prev, ...toOpen }));
    }
  }, [highlightedBadgeIds, highlightedSet, summary.disciplineGroups]);

  const visibleMilestoneBadges =
    activeTab === 'all' || activeTab === 'milestone'
      ? summary.milestoneBadges
      : [];
  const visibleStreakBadges =
    activeTab === 'all' || activeTab === 'streak'
      ? summary.streakBadges
      : [];
  const visibleDisciplineGroups =
    activeTab === 'all' || activeTab === 'discipline'
      ? summary.disciplineGroups
      : [];

  const collapsedSummaryText = useMemo(() => {
    const parts: string[] = [
      `${summary.unlockedCount} / ${summary.totalCount} badge${summary.totalCount > 1 ? 's' : ''} débloqué${summary.unlockedCount > 1 ? 's' : ''}`,
    ];
    if (summary.currentStreakDays > 0) {
      parts.push(`Série : ${summary.currentStreakDays} j`);
    } else if (summary.bestStreakDays > 0) {
      parts.push(`Meilleure série : ${summary.bestStreakDays} j`);
    }
    if (summary.nextMilestoneBadge) {
      parts.push(
        `Prochain palier : ${summary.totalValidatedEvents}/${formatCountShort(summary.nextMilestoneBadge.target)}`
      );
    }
    return parts.join(' · ');
  }, [summary]);

  const resolveDisciplinePreset = (
    colorKey?: string,
    disciplineName?: string
  ) => {
    if (
      colorKey &&
      DISCIPLINE_COLOR_PRESETS[
        colorKey as keyof typeof DISCIPLINE_COLOR_PRESETS
      ]
    ) {
      return DISCIPLINE_COLOR_PRESETS[
        colorKey as keyof typeof DISCIPLINE_COLOR_PRESETS
      ];
    }
    return getDisciplineStyle(disciplineName ?? '', disciplines);
  };

  const renderBadgeCard = (
    badge: MemberBadgeItem,
    options?: { insideDisciplineGroup?: boolean }
  ) => {
    const isHighlighted = highlightedSet.has(badge.id);
    const insideGroup = Boolean(options?.insideDisciplineGroup);

    const disciplinePreset =
      badge.category === 'discipline'
        ? resolveDisciplinePreset(
            badge.disciplineColorKey,
            badge.disciplineName ?? badge.title
          )
        : null;

    const IconComponent =
      badge.category === 'milestone'
        ? getMilestoneIcon(badge.target)
        : badge.category === 'streak'
          ? getStreakIcon(badge.target)
          : getMilestoneIcon(badge.target) ?? Dumbbell;

    const unlockedDateText = badge.unlockedAt
      ? formatFrenchDateShort(badge.unlockedAt)
      : '';

    const displayTitle =
      insideGroup && badge.shortTitle ? badge.shortTitle : badge.title;

    return (
      <div
        key={badge.id}
        className={`flex flex-col justify-between gap-2.5 rounded-lg border p-3.5 transition-colors ${
          badge.unlocked
            ? isHighlighted
              ? 'border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-500/30 dark:border-emerald-500 dark:bg-emerald-950/50 dark:ring-emerald-400/30'
              : 'border-emerald-200 bg-emerald-50/45 dark:border-emerald-800/80 dark:bg-emerald-950/25'
            : 'border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/50'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
              badge.unlocked
                ? badge.category === 'discipline' && disciplinePreset
                  ? `${disciplinePreset.softBg} ${disciplinePreset.border} ${disciplinePreset.text}`
                  : badge.category === 'streak'
                    ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/80 dark:bg-amber-950/60 dark:text-amber-300'
                    : 'border-emerald-200 bg-emerald-100/80 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                : 'border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500'
            }`}
          >
            <IconComponent className="h-4 w-4" aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p
                className={`text-xs font-bold leading-snug ${
                  badge.unlocked
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {displayTitle}
              </p>
              {badge.unlocked ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {isHighlighted ? 'Nouveau' : 'Débloqué'}
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  À débloquer
                </span>
              )}
            </div>

            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {badge.subtitle}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-500 dark:text-slate-400 capitalize">
              {badge.unlocked
                ? unlockedDateText
                  ? `Obtenu le ${unlockedDateText}`
                  : 'Accompli'
                : 'Progression'}
            </span>
            <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
              {`${formatCountShort(badge.current)}/${formatCountShort(badge.target)}`}
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-sm bg-slate-200/80 dark:bg-slate-800"
            role="progressbar"
            aria-valuenow={badge.progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progression pour ${badge.title}`}
          >
            <div
              className={`h-full transition-all duration-300 ${
                badge.unlocked
                  ? 'bg-emerald-600 dark:bg-emerald-500'
                  : 'bg-slate-400 dark:bg-slate-600'
              }`}
              style={{ width: `${badge.progressPct}%` }}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderDisciplineGroup = (group: DisciplineBadgeGroup) => {
    const isGroupOpen = Boolean(expandedDisciplines[group.key]);
    const preset = resolveDisciplinePreset(
      group.colorKey,
      group.disciplineName
    );
    const groupPct =
      group.totalCount > 0
        ? Math.round((group.unlockedCount / group.totalCount) * 100)
        : 0;

    return (
      <div key={group.key} className="p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              setExpandedDisciplines((prev) => ({
                ...prev,
                [group.key]: !prev[group.key],
              }))
            }
            aria-expanded={isGroupOpen}
            className="flex flex-1 items-center gap-3 text-left min-w-0 cursor-pointer"
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${preset.softBg} ${preset.border} ${preset.text}`}
            >
              <DisciplineIcon
                disciplineName={group.disciplineName}
                catalog={disciplines}
                className="h-4 w-4"
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {group.disciplineName}
                </p>
                <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {group.unlockedCount}/{group.totalCount} badges
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {formatCountShort(group.validatedCount)} séance
                {group.validatedCount > 1 ? 's' : ''} validée
                {group.validatedCount > 1 ? 's' : ''}
                {group.nextBadge
                  ? ` · Prochain palier : ${group.nextBadge.shortTitle ?? group.nextBadge.title} (${formatCountShort(group.validatedCount)}/${formatCountShort(group.nextBadge.target)})`
                  : ' · Tous les paliers débloqués'}
              </p>
              <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-sm bg-slate-200/80 dark:bg-slate-800">
                <div
                  className={`h-full transition-all duration-300 ${
                    group.unlockedCount > 0
                      ? 'bg-emerald-600 dark:bg-emerald-500'
                      : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                  style={{ width: `${groupPct}%` }}
                />
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setExpandedDisciplines((prev) => ({
                ...prev,
                [group.key]: !prev[group.key],
              }))
            }
            aria-expanded={isGroupOpen}
            aria-label={
              isGroupOpen
                ? `Replier les badges ${group.disciplineName}`
                : `Déplier les badges ${group.disciplineName}`
            }
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                isGroupOpen ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>
        </div>

        {isGroupOpen && (
          <div
            className={`mt-3.5 grid grid-cols-1 gap-2.5 border-t border-slate-100 pt-3.5 dark:border-slate-800 ${
              compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'
            }`}
          >
            {group.badges.map((badge) =>
              renderBadgeCard(badge, { insideDisciplineGroup: true })
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div
        className={
          expanded
            ? 'border-b border-slate-100 pb-4 dark:border-slate-800'
            : ''
        }
      >
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-controls="member-badges-details"
            className="flex flex-1 items-start gap-3 text-left min-w-0 cursor-pointer"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
              <Trophy className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {title}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {subtitle ?? collapsedSummaryText}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-controls="member-badges-details"
            aria-label={
              expanded ? 'Replier les badges' : 'Déplier les badges'
            }
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                expanded ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>
        </div>

        {expanded && (
          <div className="mt-3 flex flex-wrap items-center">
            <div
              role="group"
              aria-label="Filtrer les catégories de badges"
              className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
            >
              {(
                [
                  {
                    id: 'all',
                    label: `Tous (${summary.unlockedCount}/${summary.totalCount})`,
                  },
                  {
                    id: 'milestone',
                    label: `Événements (${summary.milestoneBadges.filter((b) => b.unlocked).length}/${summary.milestoneBadges.length})`,
                  },
                  {
                    id: 'streak',
                    label: `Séries (${summary.streakBadges.filter((b) => b.unlocked).length}/${summary.streakBadges.length})`,
                  },
                  {
                    id: 'discipline',
                    label: `Disciplines (${summary.unlockedDisciplineBadgesCount}/${summary.totalDisciplineBadgesCount})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {expanded && (
        <div id="member-badges-details" className="mt-4 space-y-5">
          {/* Compact Achievement Summary Strip */}
          <div className="grid grid-cols-1 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50/70 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="p-3">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Badges obtenus
              </p>
              <p className="mt-0.5 font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                {summary.unlockedCount}
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {' '}
                  / {summary.totalCount}
                </span>
              </p>
            </div>
            <div className="p-3">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Série en cours / Record
              </p>
              <p className="mt-0.5 font-mono text-lg font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                {summary.currentStreakDays} j
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {' '}
                  · record {summary.bestStreakDays} j
                </span>
              </p>
            </div>
            <div className="p-3">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Disciplines validées
              </p>
              <p className="mt-0.5 font-mono text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {summary.unlockedDisciplinesCount}
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {' '}
                  / {summary.totalDisciplinesCount}
                </span>
              </p>
            </div>
          </div>

          {highlightedSet.size > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100">
              <Sparkles
                className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
                aria-hidden="true"
              />
              <span>
                {highlightedSet.size === 1
                  ? 'Nouveau badge débloqué grâce à votre dernière validation !'
                  : `${highlightedSet.size} nouveaux badges débloqués grâce à votre dernière validation !`}
              </span>
            </div>
          )}

          {/* Category 1: Paliers d'événements validés */}
          {visibleMilestoneBadges.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-display text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Paliers d’événements validés
                </h4>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {formatCountShort(summary.totalValidatedEvents)} validé
                  {summary.totalValidatedEvents > 1 ? 's' : ''}
                </span>
              </div>
              <div
                className={`grid grid-cols-1 gap-2.5 ${
                  compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'
                }`}
              >
                {visibleMilestoneBadges.map((b) => renderBadgeCard(b))}
              </div>
            </div>
          )}

          {/* Category 2: Enchaînements (séries consécutives) */}
          {visibleStreakBadges.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-display text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Enchaînements consécutifs
                </h4>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  Record : {summary.bestStreakDays} j d’affilée
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {visibleStreakBadges.map((b) => renderBadgeCard(b))}
              </div>
            </div>
          )}

          {/* Category 3: Badges par discipline (paliers 1, 5, 10, 25, 50, 100, 250, 500, 1000 par discipline) */}
          {visibleDisciplineGroups.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-display text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Paliers par discipline (1 à 1 000 séances)
                </h4>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {summary.unlockedDisciplineBadgesCount}/
                  {summary.totalDisciplineBadgesCount} badges
                </span>
              </div>
              <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {visibleDisciplineGroups.map(renderDisciplineGroup)}
              </div>
            </div>
          )}

          {activeTab === 'discipline' &&
            visibleDisciplineGroups.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                Aucune discipline enregistrée pour le moment. Les badges apparaîtront dès qu’une discipline sera ajoutée ou validée.
              </div>
            )}
        </div>
      )}
    </div>
  );
}
