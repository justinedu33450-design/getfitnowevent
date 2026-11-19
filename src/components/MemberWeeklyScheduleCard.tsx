import { FormEvent, useMemo, useState } from 'react';
import {
  CalendarCheck2,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Dumbbell,
  ExternalLink,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  CoachDirectoryEntry,
  DisciplineItem,
  MemberScheduleSession,
  Registration,
  SportEvent,
  VALIDATION_LIMITS,
} from '../types';
import {
  createMemberScheduleSession,
  deleteMemberScheduleSession,
  toggleMemberScheduleCompleted,
  updateMemberScheduleSession,
} from '../services/firestoreService';
import {
  evaluateEventBooking,
  formatFrenchDateShort,
  formatFrenchTime,
  formatTimeRange,
  getEventCoachNames,
  getWeekDays,
  isSameCalendarDay,
  toLocalDateInputValue,
  toLocalTimeInputValue,
} from '../utils/dateAndValidation';
import {
  getDisciplineIconKey,
  getDisciplineStyle,
} from '../utils/disciplineColors';
import { DisciplineIcon } from './DisciplineIcon';

interface MemberWeeklyScheduleCardProps {
  mode: 'member' | 'coach';
  memberEmail: string;
  memberName: string;
  currentUserUid: string;
  currentCoachName?: string;
  customSessions: MemberScheduleSession[];
  registrations: Registration[];
  events: SportEvent[];
  disciplines: DisciplineItem[];
  coachDirectory?: CoachDirectoryEntry[];
  nowMs: number;
  compact?: boolean;
  defaultExpanded?: boolean;
  onSelectEvent?: (event: SportEvent) => void;
  onRequestCoachProgram?: (coach?: CoachDirectoryEntry) => void;
}

type ScheduleFilter = 'all' | 'custom' | 'events';

interface WeeklyScheduleEntry {
  id: string;
  kind: 'event' | 'custom';
  startDate: Date;
  durationMinutes: number;
  title: string;
  discipline: string;
  location: string;
  coachName: string;
  notes: string;
  attendedOrCompleted: boolean;
  isPast: boolean;
  matchedEvent?: SportEvent | null;
  registration?: Registration;
  customSession?: MemberScheduleSession;
}

const DURATION_PRESETS = [30, 45, 60, 75, 90, 120];

function getIsoWeekNumber(date: Date): number {
  const temp = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  return Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function MemberWeeklyScheduleCard({
  mode,
  memberEmail,
  memberName,
  currentUserUid,
  currentCoachName = '',
  customSessions,
  registrations,
  events,
  disciplines,
  coachDirectory = [],
  nowMs,
  compact = false,
  defaultExpanded = true,
  onSelectEvent,
  onRequestCoachProgram,
}: MemberWeeklyScheduleCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());
  const [filter, setFilter] = useState<ScheduleFilter>('all');
  const [compactSelectedDayIso, setCompactSelectedDayIso] = useState<
    string | 'all'
  >('all');

  // Form modal/inline state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSession, setEditingSession] =
    useState<MemberScheduleSession | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDiscipline, setFormDiscipline] = useState(
    disciplines[0]?.name || 'Renforcement'
  );
  const [formDate, setFormDate] = useState(() =>
    toLocalDateInputValue(new Date())
  );
  const [formTime, setFormTime] = useState('18:00');
  const [formDuration, setFormDuration] = useState<number>(60);
  const [formLocation, setFormLocation] = useState('');
  const [formCoachUid, setFormCoachUid] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const memberEmailLower = memberEmail.trim().toLowerCase();
  const weekDays = useMemo(() => getWeekDays(weekAnchor), [weekAnchor]);
  const weekStartMs = weekDays[0].getTime();
  const weekEndMs = new Date(
    weekDays[6].getFullYear(),
    weekDays[6].getMonth(),
    weekDays[6].getDate(),
    23,
    59,
    59,
    999
  ).getTime();
  const weekNumber = useMemo(
    () => getIsoWeekNumber(weekDays[0]),
    [weekDays]
  );

  const today = useMemo(() => new Date(nowMs), [nowMs]);

  const eventsById = useMemo(
    () => new Map(events.map((ev) => [ev.id, ev])),
    [events]
  );

  const coachByUid = useMemo(
    () => new Map(coachDirectory.map((c) => [c.uid, c])),
    [coachDirectory]
  );

  const disciplineOptions = useMemo(() => {
    const names = disciplines.map((d) => d.name);
    if (names.length === 0) {
      return ['Renforcement', 'Course à pied', 'HIIT', 'Mobilité', 'Cardio'];
    }
    if (formDiscipline && !names.includes(formDiscipline)) {
      return [formDiscipline, ...names];
    }
    return names;
  }, [disciplines, formDiscipline]);

  // Self-registered confirmed events for this member
  const selfRegisteredEntries = useMemo<WeeklyScheduleEntry[]>(() => {
    if (!memberEmailLower) return [];
    const list: WeeklyScheduleEntry[] = [];

    registrations.forEach((reg) => {
      if (reg.status !== 'confirmed') return;
      if (reg.isGuest) return;
      if (reg.email.trim().toLowerCase() !== memberEmailLower) return;

      const matchedEvent = eventsById.get(reg.eventId) ?? null;
      if (matchedEvent) {
        const evalInfo = evaluateEventBooking(matchedEvent, nowMs);
        if (
          matchedEvent.status === 'cancelled' ||
          evalInfo.isAutoCancelledNoRegistrants
        ) {
          return;
        }
      }

      const startDate = reg.eventStartAt.toDate();
      const durationMinutes =
        matchedEvent?.durationMinutes ?? reg.eventDurationMinutes ?? 60;
      const endMs = startDate.getTime() + durationMinutes * 60 * 1000;

      list.push({
        id: `event-${reg.id}`,
        kind: 'event',
        startDate,
        durationMinutes,
        title: matchedEvent?.title || reg.eventTitle,
        discipline: matchedEvent?.discipline || 'Événement',
        location: matchedEvent
          ? [matchedEvent.location, matchedEvent.city]
              .filter(Boolean)
              .join(' · ')
          : '',
        coachName: matchedEvent
          ? getEventCoachNames(matchedEvent).join(', ')
          : '',
        notes: matchedEvent?.description || '',
        attendedOrCompleted: Boolean(reg.attended),
        isPast: nowMs >= endMs,
        matchedEvent,
        registration: reg,
      });
    });

    return list;
  }, [registrations, memberEmailLower, eventsById, nowMs]);

  const customEntries = useMemo<WeeklyScheduleEntry[]>(() => {
    return customSessions.map((session) => {
      const startDate = session.startAt.toDate();
      const endMs = startDate.getTime() + session.durationMinutes * 60 * 1000;
      return {
        id: `custom-${session.id}`,
        kind: 'custom',
        startDate,
        durationMinutes: session.durationMinutes,
        title: session.title,
        discipline: session.discipline,
        location: session.location,
        coachName: session.coachName,
        notes: session.notes,
        attendedOrCompleted: Boolean(session.completed),
        isPast: nowMs >= endMs,
        customSession: session,
      };
    });
  }, [customSessions, nowMs]);

  const allEntries = useMemo(() => {
    const combined = [...selfRegisteredEntries, ...customEntries];
    combined.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    return combined;
  }, [selfRegisteredEntries, customEntries]);

  const weekEntries = useMemo(() => {
    return allEntries.filter((item) => {
      const ms = item.startDate.getTime();
      if (ms < weekStartMs || ms > weekEndMs) return false;
      if (filter === 'custom' && item.kind !== 'custom') return false;
      if (filter === 'events' && item.kind !== 'event') return false;
      return true;
    });
  }, [allEntries, weekStartMs, weekEndMs, filter]);

  const weekCounts = useMemo(() => {
    const inWeekAll = allEntries.filter((item) => {
      const ms = item.startDate.getTime();
      return ms >= weekStartMs && ms <= weekEndMs;
    });
    return {
      total: inWeekAll.length,
      events: inWeekAll.filter((i) => i.kind === 'event').length,
      custom: inWeekAll.filter((i) => i.kind === 'custom').length,
    };
  }, [allEntries, weekStartMs, weekEndMs]);

  const entriesByDayIso = useMemo(() => {
    const map = new Map<string, WeeklyScheduleEntry[]>();
    weekDays.forEach((d) => map.set(toLocalDateInputValue(d), []));
    weekEntries.forEach((entry) => {
      const key = toLocalDateInputValue(entry.startDate);
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    });
    return map;
  }, [weekDays, weekEntries]);

  const weekRangeLabel = useMemo(() => {
    const startLabel = new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
    }).format(weekDays[0]);
    const endLabel = new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(weekDays[6]);
    return `${startLabel} – ${endLabel}`;
  }, [weekDays]);

  const openCreateForm = (targetDate?: Date) => {
    setActionFeedback(null);
    setFormError(null);
    setEditingSession(null);
    setFormTitle('');
    setFormDiscipline(disciplines[0]?.name || 'Renforcement');
    setFormDate(toLocalDateInputValue(targetDate ?? new Date()));
    setFormTime('18:00');
    setFormDuration(60);
    setFormLocation('');
    setFormCoachUid(mode === 'coach' ? currentUserUid : '');
    setFormNotes('');
    setIsFormOpen(true);
    setExpanded(true);
  };

  const openEditForm = (session: MemberScheduleSession) => {
    setActionFeedback(null);
    setFormError(null);
    setEditingSession(session);
    const d = session.startAt.toDate();
    setFormTitle(session.title);
    setFormDiscipline(session.discipline);
    setFormDate(toLocalDateInputValue(d));
    setFormTime(toLocalTimeInputValue(d));
    setFormDuration(session.durationMinutes);
    setFormLocation(session.location || '');
    setFormCoachUid(session.coachUid || '');
    setFormNotes(session.notes || '');
    setIsFormOpen(true);
    setExpanded(true);
  };

  const handleSubmitForm = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setActionFeedback(null);

    if (!formDate || !formTime) {
      setFormError('Veuillez renseigner la date et l’heure de la séance.');
      return;
    }

    const [yStr, mStr, dStr] = formDate.split('-');
    const [hhStr, mmStr] = formTime.split(':');
    const startDate = new Date(
      Number(yStr),
      Number(mStr) - 1,
      Number(dStr),
      Number(hhStr),
      Number(mmStr),
      0,
      0
    );

    if (Number.isNaN(startDate.getTime())) {
      setFormError('Date ou heure invalide.');
      return;
    }

    const selectedCoach = formCoachUid ? coachByUid.get(formCoachUid) : null;
    const resolvedCoachUid = formCoachUid.trim();
    const resolvedCoachName =
      selectedCoach?.displayName ||
      (mode === 'coach' && resolvedCoachUid === currentUserUid
        ? currentCoachName
        : editingSession?.coachUid === resolvedCoachUid
          ? editingSession.coachName
          : '');

    setFormSaving(true);
    try {
      if (editingSession) {
        await updateMemberScheduleSession(editingSession.id, {
          title: formTitle,
          discipline: formDiscipline,
          notes: formNotes,
          location: formLocation,
          startDate,
          durationMinutes: formDuration,
          coachUid: resolvedCoachUid,
          coachName: resolvedCoachName,
          completed: editingSession.completed,
        });
        setActionFeedback({
          type: 'success',
          text: 'Séance personnalisée mise à jour.',
        });
      } else {
        await createMemberScheduleSession({
          memberEmail,
          memberName,
          title: formTitle,
          discipline: formDiscipline,
          notes: formNotes,
          location: formLocation,
          startDate,
          durationMinutes: formDuration,
          coachUid: resolvedCoachUid,
          coachName: resolvedCoachName,
          createdByUid: currentUserUid,
          createdByRole: mode,
        });
        setWeekAnchor(startDate);
        setActionFeedback({
          type: 'success',
          text: 'Séance ajoutée au planning hebdomadaire.',
        });
      }
      setIsFormOpen(false);
      setEditingSession(null);
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Impossible d’enregistrer cette séance.'
      );
    } finally {
      setFormSaving(false);
    }
  };

  const handleToggleCompleted = async (session: MemberScheduleSession) => {
    setActionFeedback(null);
    setTogglingId(session.id);
    try {
      await toggleMemberScheduleCompleted(session.id, !session.completed);
    } catch (err) {
      setActionFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de mettre à jour le statut de la séance.',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    setActionFeedback(null);
    setDeletingId(sessionId);
    try {
      await deleteMemberScheduleSession(sessionId);
      setConfirmDeleteId(null);
      setActionFeedback({
        type: 'success',
        text: 'Séance retirée du planning personnalisé.',
      });
    } catch (err) {
      setActionFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de supprimer cette séance.',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const renderEntryCard = (entry: WeeklyScheduleEntry, inDrawerCompact = false) => {
    const style = getDisciplineStyle(entry.discipline, disciplines);
    const iconKey = getDisciplineIconKey(entry.discipline, disciplines);
    const isEvent = entry.kind === 'event';
    const session = entry.customSession;

    return (
      <div
        key={entry.id}
        className={`rounded-lg border p-2.5 text-xs transition-colors ${
          isEvent
            ? 'border-emerald-200/90 bg-emerald-50/50 dark:border-emerald-900/70 dark:bg-emerald-950/25'
            : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90'
        } ${entry.attendedOrCompleted ? 'opacity-85' : ''}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={`shrink-0 ${style.text}`} aria-hidden="true">
              <DisciplineIcon
                iconKey={iconKey}
                className="h-3.5 w-3.5"
              />
            </span>
            <span className="truncate font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
              {formatTimeRange(entry.startDate, entry.durationMinutes)}
            </span>
          </div>

          {!isEvent && session && (
            <button
              type="button"
              disabled={togglingId === session.id}
              onClick={() => void handleToggleCompleted(session)}
              title={
                session.completed
                  ? 'Marquer comme à faire'
                  : 'Marquer comme terminée'
              }
              aria-label={
                session.completed
                  ? `Marquer ${session.title} comme à faire`
                  : `Marquer ${session.title} comme terminée`
              }
              className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap cursor-pointer ${
                session.completed
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
              }`}
            >
              {session.completed ? (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Circle className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {inDrawerCompact && (
                <span>{session.completed ? 'Terminée' : 'À faire'}</span>
              )}
            </button>
          )}

          {isEvent && (
            <span className="shrink-0 font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {entry.attendedOrCompleted ? 'Validée' : 'Inscrit'}
            </span>
          )}
        </div>

        <p
          className={`mt-1 font-display text-xs font-bold leading-snug text-slate-900 dark:text-white ${
            entry.attendedOrCompleted ? 'line-through decoration-slate-400' : ''
          }`}
        >
          {entry.title}
        </p>

        <p className="mt-0.5 truncate text-[11px] font-medium text-slate-600 dark:text-slate-300">
          {entry.discipline}
          {isEvent
            ? ' · Événement inscrit'
            : session?.createdByRole === 'coach'
              ? ' · Programme coach'
              : ' · Programme perso'}
        </p>

        {(entry.coachName || entry.location) && (
          <div className="mt-1 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {entry.coachName && (
              <p className="flex items-center gap-1 truncate">
                <UserCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">Coach : {entry.coachName}</span>
              </p>
            )}
            {entry.location && (
              <p className="flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{entry.location}</span>
              </p>
            )}
          </div>
        )}

        {!isEvent && entry.notes && (
          <p className="mt-1.5 line-clamp-3 whitespace-pre-line rounded-md bg-slate-50 px-2 py-1.5 text-[11px] leading-relaxed text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
            {entry.notes}
          </p>
        )}

        {/* Footer actions */}
        {isEvent && entry.matchedEvent && onSelectEvent && (
          <div className="mt-2 flex items-center justify-end border-t border-emerald-200/60 pt-1.5 dark:border-emerald-900/50">
            <button
              type="button"
              onClick={() => onSelectEvent(entry.matchedEvent!)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300 whitespace-nowrap cursor-pointer"
            >
              <span>Voir la séance</span>
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        )}

        {!isEvent && session && (
          <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5 border-t border-slate-100 pt-1.5 dark:border-slate-800">
            {confirmDeleteId === session.id ? (
              <>
                <button
                  type="button"
                  disabled={deletingId === session.id}
                  onClick={() => void handleDeleteSession(session.id)}
                  className="rounded-md bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                >
                  {deletingId === session.id ? 'Suppr...' : 'Confirmer'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 whitespace-nowrap cursor-pointer"
                >
                  Annuler
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => openEditForm(session)}
                  aria-label={`Modifier ${session.title}`}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white whitespace-nowrap cursor-pointer"
                >
                  <Pencil className="h-3 w-3" aria-hidden="true" />
                  <span>Modifier</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(session.id)}
                  aria-label={`Supprimer ${session.title}`}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-700 dark:text-slate-400 dark:hover:bg-rose-950/60 dark:hover:text-rose-300 whitespace-nowrap cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                  <span>Suppr.</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const compactVisibleDays = useMemo(() => {
    if (compactSelectedDayIso === 'all') return weekDays;
    return weekDays.filter(
      (d) => toLocalDateInputValue(d) === compactSelectedDayIso
    );
  }, [weekDays, compactSelectedDayIso]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      {/* Header */}
      <div
        className={`flex items-start justify-between gap-3 ${
          expanded ? 'border-b border-slate-100 pb-4 dark:border-slate-800' : ''
        }`}
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
            <CalendarCheck2 className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              {mode === 'coach'
                ? 'Planning hebdomadaire personnalisé'
                : 'Mon planning de la semaine'}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {mode === 'coach'
                ? 'Programme personnalisé hors événements publics + séances auxquelles l’adhérent s’est inscrit.'
                : 'Retrouvez sur la semaine vos événements inscrits et votre programme personnalisé avec un coach.'}
            </p>
            <p className="mt-1 font-mono text-[11px] font-medium text-slate-600 dark:text-slate-300 tabular-nums">
              Semaine {weekNumber} ({weekRangeLabel}) · {weekCounts.total}{' '}
              séance{weekCounts.total > 1 ? 's' : ''} ({weekCounts.events}{' '}
              événement{weekCounts.events > 1 ? 's' : ''}, {weekCounts.custom}{' '}
              perso)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls={`weekly-schedule-${mode}`}
          aria-label={
            expanded
              ? 'Replier le planning hebdomadaire'
              : 'Déplier le planning hebdomadaire'
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
        <div id={`weekly-schedule-${mode}`} className="mt-4 space-y-4">
          {/* Toolbar: Week Navigation + Source Filter + Actions */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800/70">
                <button
                  type="button"
                  onClick={() =>
                    setWeekAnchor(
                      new Date(
                        weekAnchor.getFullYear(),
                        weekAnchor.getMonth(),
                        weekAnchor.getDate() - 7
                      )
                    )
                  }
                  aria-label="Semaine précédente"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setWeekAnchor(new Date())}
                  className="min-h-[32px] rounded-md px-2.5 text-xs font-semibold text-slate-800 hover:bg-white dark:text-slate-100 dark:hover:bg-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Cette semaine
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setWeekAnchor(
                      new Date(
                        weekAnchor.getFullYear(),
                        weekAnchor.getMonth(),
                        weekAnchor.getDate() + 7
                      )
                    )
                  }
                  aria-label="Semaine suivante"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div
                role="group"
                aria-label="Filtrer les séances de la semaine"
                className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
              >
                {(
                  [
                    { id: 'all', label: `Tout (${weekCounts.total})` },
                    {
                      id: 'events',
                      label: `Événements inscrits (${weekCounts.events})`,
                    },
                    {
                      id: 'custom',
                      label: `Programme perso (${weekCounts.custom})`,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilter(tab.id)}
                    className={`min-h-[30px] rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                      filter === tab.id
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {mode === 'member' && onRequestCoachProgram && (
                <button
                  type="button"
                  onClick={() => onRequestCoachProgram(coachDirectory[0])}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <MessageSquare
                    className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                  <span>Demander un programme à un coach</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => openCreateForm(weekDays[0])}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Ajouter une séance perso</span>
              </button>
            </div>
          </div>

          {actionFeedback && (
            <div
              role="status"
              className={`rounded-lg border p-3 text-xs ${
                actionFeedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                  : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
              }`}
            >
              {actionFeedback.text}
            </div>
          )}

          {/* Add / Edit Personalized Session Inline Form */}
          {isFormOpen && (
            <form
              onSubmit={handleSubmitForm}
              className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/70 dark:bg-emerald-950/20 space-y-3.5"
            >
              <div className="flex items-center justify-between gap-2 border-b border-emerald-200/70 pb-2.5 dark:border-emerald-900/60">
                <div className="flex items-center gap-2 min-w-0">
                  <Dumbbell
                    className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                  <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
                    {editingSession
                      ? 'Modifier la séance personnalisée'
                      : mode === 'coach'
                        ? `Nouvelle séance sur mesure pour ${memberName}`
                        : 'Ajouter une séance à mon programme'}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingSession(null);
                  }}
                  aria-label="Fermer le formulaire"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={`sched-title-${mode}`}
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Titre de la séance *
                  </label>
                  <input
                    id={`sched-title-${mode}`}
                    type="text"
                    required
                    minLength={VALIDATION_LIMITS.TITLE_MIN}
                    maxLength={VALIDATION_LIMITS.TITLE_MAX}
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Ex. Renforcement haut du corps, Footing Z2..."
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`sched-discipline-${mode}`}
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Discipline *
                  </label>
                  <select
                    id={`sched-discipline-${mode}`}
                    value={formDiscipline}
                    onChange={(e) => setFormDiscipline(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {disciplineOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor={`sched-date-${mode}`}
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Date *
                  </label>
                  <input
                    id={`sched-date-${mode}`}
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`sched-time-${mode}`}
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Heure de début *
                  </label>
                  <input
                    id={`sched-time-${mode}`}
                    type="time"
                    required
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`sched-duration-${mode}`}
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Durée (minutes) *
                  </label>
                  <select
                    id={`sched-duration-${mode}`}
                    value={formDuration}
                    onChange={(e) => setFormDuration(Number(e.target.value))}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {DURATION_PRESETS.map((min) => (
                      <option key={min} value={min}>
                        {min} min
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={`sched-coach-${mode}`}
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Coach référent (optionnel)
                  </label>
                  <select
                    id={`sched-coach-${mode}`}
                    value={formCoachUid}
                    onChange={(e) => setFormCoachUid(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">Programme autonome (sans coach)</option>
                    {mode === 'coach' &&
                      currentCoachName &&
                      !coachDirectory.some((c) => c.uid === currentUserUid) && (
                        <option value={currentUserUid}>
                          {currentCoachName}
                        </option>
                      )}
                    {coachDirectory.map((c) => (
                      <option key={c.uid} value={c.uid}>
                        {c.displayName}
                        {c.specialty ? ` · ${c.specialty}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={`sched-location-${mode}`}
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Lieu (optionnel)
                  </label>
                  <input
                    id={`sched-location-${mode}`}
                    type="text"
                    maxLength={VALIDATION_LIMITS.LOCATION_MAX}
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="Ex. Salle, Domicile, Parc..."
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor={`sched-notes-${mode}`}
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Exercices, séries & consignes
                </label>
                <textarea
                  id={`sched-notes-${mode}`}
                  rows={3}
                  maxLength={VALIDATION_LIMITS.SCHEDULE_NOTES_MAX}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Ex. 4×10 squats gobelet, 3×12 pompes, 20 min cardio modéré..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {formError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
                  {formError}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingSession(null);
                  }}
                  className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
                >
                  <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  {formSaving
                    ? 'Enregistrement...'
                    : editingSession
                      ? 'Enregistrer les modifications'
                      : 'Ajouter au planning'}
                </button>
              </div>
            </form>
          )}

          {/* Weekly Layout */}
          {compact ? (
            <div className="space-y-3">
              {/* Day selector strip for narrow drawer */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCompactSelectedDayIso('all')}
                  className={`min-h-[30px] rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap cursor-pointer ${
                    compactSelectedDayIso === 'all'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  Toute la semaine ({weekEntries.length})
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {weekDays.map((day) => {
                  const iso = toLocalDateInputValue(day);
                  const count = (entriesByDayIso.get(iso) ?? []).length;
                  const isToday = isSameCalendarDay(day, today);
                  const isSelected = compactSelectedDayIso === iso;
                  const weekdayShort = new Intl.DateTimeFormat('fr-FR', {
                    weekday: 'short',
                  })
                    .format(day)
                    .replace('.', '');
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() =>
                        setCompactSelectedDayIso(isSelected ? 'all' : iso)
                      }
                      className={`flex flex-col items-center rounded-lg border py-1.5 px-1 text-center transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-100'
                          : isToday
                            ? 'border-emerald-300 bg-white text-slate-900 dark:border-emerald-800 dark:bg-slate-900 dark:text-white'
                            : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-white dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300'
                      }`}
                    >
                      <span className="text-[10px] font-semibold uppercase">
                        {weekdayShort}
                      </span>
                      <span className="font-mono text-xs font-bold tabular-nums">
                        {day.getDate()}
                      </span>
                      <span
                        className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                          count > 0
                            ? 'bg-emerald-600 dark:bg-emerald-400'
                            : 'bg-transparent'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2.5">
                {compactVisibleDays.map((day) => {
                  const iso = toLocalDateInputValue(day);
                  const items = entriesByDayIso.get(iso) ?? [];
                  if (
                    compactSelectedDayIso === 'all' &&
                    items.length === 0 &&
                    weekEntries.length > 0
                  ) {
                    return null;
                  }
                  return (
                    <div
                      key={iso}
                      className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30"
                    >
                      <div className="flex items-center justify-between gap-2 pb-2">
                        <span className="text-xs font-bold capitalize text-slate-800 dark:text-slate-200">
                          {formatFrenchDateShort(day)}
                        </span>
                        <button
                          type="button"
                          onClick={() => openCreateForm(day)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 cursor-pointer"
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                          <span>Ajouter</span>
                        </button>
                      </div>
                      {items.length === 0 ? (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Aucune séance prévue ce jour.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {items.map((item) => renderEntryCard(item, true))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Full 7-Column Desktop Weekly Planner (Mon–Sun) */
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
              {weekDays.map((day) => {
                const iso = toLocalDateInputValue(day);
                const items = entriesByDayIso.get(iso) ?? [];
                const isToday = isSameCalendarDay(day, today);
                const weekdayLabel = new Intl.DateTimeFormat('fr-FR', {
                  weekday: 'short',
                })
                  .format(day)
                  .replace('.', '');
                const monthLabel = new Intl.DateTimeFormat('fr-FR', {
                  month: 'short',
                }).format(day);

                return (
                  <div
                    key={iso}
                    className={`flex min-h-[190px] flex-col rounded-xl border p-2.5 ${
                      isToday
                        ? 'border-emerald-300 bg-emerald-50/25 dark:border-emerald-800 dark:bg-emerald-950/15'
                        : 'border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 border-b border-slate-200/80 pb-2 dark:border-slate-800">
                      <div className="min-w-0">
                        <p
                          className={`text-[11px] font-bold uppercase tracking-wide ${
                            isToday
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {weekdayLabel}
                          {isToday ? ' · Auj.' : ''}
                        </p>
                        <p className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                          {day.getDate()}{' '}
                          <span className="font-sans text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {monthLabel}
                          </span>
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => openCreateForm(day)}
                        aria-label={`Ajouter une séance le ${formatFrenchDateShort(day)}`}
                        title={`Ajouter le ${formatFrenchDateShort(day)}`}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="mt-2.5 flex-1 space-y-2">
                      {items.length === 0 ? (
                        <div className="flex h-full min-h-[92px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200/90 px-2 py-4 text-center dark:border-slate-800">
                          <Clock
                            className="h-4 w-4 text-slate-300 dark:text-slate-600"
                            aria-hidden="true"
                          />
                          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                            Repos / libre
                          </p>
                        </div>
                      ) : (
                        items.map((item) => renderEntryCard(item, false))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Concise legend */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm border border-emerald-300 bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950" />
                Événements inscrits ({selfRegisteredEntries.length} au total)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800" />
                Séances personnalisées ({customEntries.length} au total)
              </span>
            </div>
            <span className="font-mono tabular-nums">
              {formatFrenchTime(today)} · Mis à jour en temps réel
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
